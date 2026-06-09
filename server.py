#!/usr/bin/env python3
"""
Audio Stemming API Server
Supports: file uploads, YouTube URLs, and any media URL with audio
Uses: Demucs (htdemucs model) for stem separation
"""

import os
import re
import json
import uuid
import time
import shutil
import threading
import subprocess
import tempfile
import glob
import logging
from pathlib import Path
from flask import Flask, request, jsonify, send_file, abort, send_from_directory, Response
from flask_cors import CORS

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Directory containing this file (where index.html lives)
BASE_DIR = Path(__file__).resolve().parent

app = Flask(__name__)
CORS(app)

# ─────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────
WORK_DIR = Path(tempfile.gettempdir()) / "stem_tool"
WORK_DIR.mkdir(exist_ok=True)

ALLOWED_EXTENSIONS = {
    "mp3", "wav", "flac", "aac", "ogg", "m4a", "wma",
    "mp4", "mkv", "mov", "avi", "webm", "ts", "mts"
}

STEMS = ["vocals", "drums", "bass", "other"]
MODEL = "htdemucs"  # best 4-stem model; use htdemucs_6s for 6 stems (guitar, piano)
PORT = int(os.environ.get("PORT", "5050"))  # overridable via the PORT env var


def _detect_device() -> str:
    """Pick the fastest torch backend available for Demucs.

    Apple Silicon (mps) and NVIDIA (cuda) are ~5-15x faster than CPU.
    Override with DEMUCS_DEVICE=cpu if a GPU backend misbehaves.
    """
    try:
        import torch
        if torch.backends.mps.is_available():
            return "mps"
        if torch.cuda.is_available():
            return "cuda"
    except Exception:
        pass
    return "cpu"


DEVICE = os.environ.get("DEMUCS_DEVICE") or _detect_device()

# In-memory job store  {job_id: {...}}
jobs: dict[str, dict] = {}
jobs_lock = threading.Lock()


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def job_dir(job_id: str) -> Path:
    return WORK_DIR / job_id


def update_job(job_id: str, **kwargs):
    with jobs_lock:
        jobs[job_id].update(kwargs)


def is_youtube_url(url: str) -> bool:
    return any(d in url for d in ("youtube.com", "youtu.be", "yt.be"))


def is_url(s: str) -> bool:
    return s.startswith(("http://", "https://", "ftp://"))


def allowed_file(filename: str) -> bool:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return ext in ALLOWED_EXTENSIONS


def song_base_name(original: str) -> str:
    """Original song name, minus a known media extension, made filename-safe.

    Only strips a trailing extension we recognise (so titles like
    "Mr. Brightside" keep their dot), then drops characters that don't
    belong in a filename while keeping spaces, parentheses, etc.
    """
    name = original or "audio"
    if "." in name:
        stem, ext = name.rsplit(".", 1)
        if ext.lower() in ALLOWED_EXTENSIONS:
            name = stem
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', " ", name).strip()
    return name or "audio"


def mix_descriptor(selected: list[str], available) -> str:
    """Human label for a mix: '(full mix)', '(vocals)', '(minus vocals)'…

    Describe by whichever side is shorter — list what's kept when few stems
    are kept, otherwise say what's removed.
    """
    excluded = [s for s in available if s not in selected]
    if not excluded:
        return "full mix"
    if len(selected) <= len(excluded):
        return ", ".join(selected)
    return "minus " + ", ".join(excluded)


def cleanup_old_jobs(max_age_seconds=3600):
    """Remove jobs older than max_age_seconds."""
    now = time.time()
    with jobs_lock:
        old = [jid for jid, j in jobs.items() if now - j.get("created_at", now) > max_age_seconds]
    for jid in old:
        try:
            shutil.rmtree(job_dir(jid), ignore_errors=True)
            with jobs_lock:
                jobs.pop(jid, None)
        except Exception:
            pass


# ─────────────────────────────────────────────
# Core processing pipeline
# ─────────────────────────────────────────────

def run_pipeline(job_id: str, source_path: Path, original_name: str):
    """
    Full pipeline:
      1. Convert any media → 44100 Hz stereo WAV
      2. Run Demucs separation
      3. Convert output stems → MP3
      4. Record result paths
    """
    try:
        jdir = job_dir(job_id)
        jdir.mkdir(parents=True, exist_ok=True)

        # ── Step 1: to WAV ──────────────────────────────────────
        update_job(job_id, status="converting", progress=10, message="Converting to WAV…")
        wav_path = jdir / "input.wav"
        cmd = [
            "ffmpeg", "-y", "-i", str(source_path),
            "-vn",               # strip video
            "-ar", "44100",      # sample rate Demucs expects
            "-ac", "2",          # stereo
            "-f", "wav",
            str(wav_path)
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg failed: {result.stderr[-500:]}")

        update_job(job_id, progress=25, message="Audio extracted, running stem separation…")

        # ── Step 2: Demucs ──────────────────────────────────────
        update_job(job_id, status="separating", progress=30,
                   message=f"Running Demucs on {DEVICE.upper()}…")
        out_dir = jdir / "demucs_out"
        cmd = [
            "python3", "-m", "demucs",
            "--name", MODEL,
            "-d", DEVICE,        # mps / cuda / cpu — auto-detected at startup
            "--out", str(out_dir),
            "--mp3",             # output MP3 (requires ffmpeg)
            "--mp3-bitrate", "320",
            str(wav_path)
        ]
        env = os.environ.copy()
        if DEVICE == "mps":
            # Let ops MPS doesn't implement fall back to CPU instead of crashing.
            env.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
        # Stream output so we can update progress
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                text=True, bufsize=1, env=env)
        for line in proc.stdout:
            line = line.strip()
            logger.info("[demucs] %s", line)
            # Parse rough progress from demucs percentage lines
            if "%" in line:
                try:
                    pct_str = [t for t in line.split() if "%" in t][0].replace("%", "")
                    pct = float(pct_str.replace(",", ".").strip("|").strip())
                    mapped = 30 + int(pct * 0.55)   # map 0-100 → 30-85
                    update_job(job_id, progress=mapped, message=f"Separating stems… {int(pct)}%")
                except Exception:
                    pass
        proc.wait()
        if proc.returncode != 0:
            raise RuntimeError("Demucs separation failed. Check logs.")

        update_job(job_id, progress=90, message="Packaging stems…")

        # ── Step 3: Collect stems ───────────────────────────────
        # Demucs outputs to: out_dir/<model>/input/<stem>.mp3
        stem_pattern = str(out_dir / MODEL / "input" / "*.mp3")
        stem_files = glob.glob(stem_pattern)

        if not stem_files:
            # fallback: search recursively
            stem_files = list(out_dir.rglob("*.mp3"))

        if not stem_files:
            raise RuntimeError("No stem files found after separation.")

        stems_info = {}
        for sf in stem_files:
            sf = Path(sf)
            stem_name = sf.stem.lower()
            # Copy to a clean location
            dest = jdir / f"{stem_name}.mp3"
            shutil.copy2(sf, dest)
            size_kb = dest.stat().st_size // 1024
            stems_info[stem_name] = {
                "filename": dest.name,
                "size_kb": size_kb,
            }

        # ── Done ─────────────────────────────────────────────────
        update_job(
            job_id,
            status="done",
            progress=100,
            message="Separation complete!",
            stems=stems_info,
            original_name=original_name,
            finished_at=time.time(),
        )
        logger.info("Job %s done. Stems: %s", job_id, list(stems_info.keys()))

    except Exception as exc:
        logger.exception("Job %s failed: %s", job_id, exc)
        update_job(job_id, status="error", message=str(exc), progress=0)
    finally:
        # Clean up source file (may be large)
        if source_path.exists() and source_path != jdir / "input.wav":
            source_path.unlink(missing_ok=True)


# ─────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────

@app.route("/", methods=["GET"])
def index():
    """Serve the single-page frontend."""
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/favicon.ico", methods=["GET"])
def favicon():
    # Frontend uses an inline SVG favicon; return empty to avoid 404 noise.
    return Response(status=204)


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model": MODEL, "device": DEVICE})


@app.route("/api/upload", methods=["POST"])
def upload():
    """Accept a file upload and start separation."""
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    f = request.files["file"]
    if not f.filename:
        return jsonify({"error": "Empty filename"}), 400
    if not allowed_file(f.filename):
        return jsonify({"error": f"Unsupported file type. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"}), 400

    job_id = str(uuid.uuid4())
    jdir = job_dir(job_id)
    jdir.mkdir(parents=True, exist_ok=True)

    ext = f.filename.rsplit(".", 1)[-1].lower()
    src = jdir / f"source.{ext}"
    f.save(src)

    with jobs_lock:
        jobs[job_id] = {
            "status": "queued",
            "progress": 0,
            "message": "Queued…",
            "created_at": time.time(),
        }

    t = threading.Thread(target=run_pipeline, args=(job_id, src, f.filename), daemon=True)
    t.start()
    return jsonify({"job_id": job_id})


@app.route("/api/from-url", methods=["POST"])
def from_url():
    """Accept a YouTube/media URL and start separation."""
    data = request.get_json(force=True) or {}
    url = (data.get("url") or "").strip()
    if not url:
        return jsonify({"error": "No URL provided"}), 400
    if not is_url(url):
        return jsonify({"error": "Invalid URL"}), 400

    job_id = str(uuid.uuid4())
    jdir = job_dir(job_id)
    jdir.mkdir(parents=True, exist_ok=True)

    with jobs_lock:
        jobs[job_id] = {
            "status": "downloading",
            "progress": 5,
            "message": "Downloading audio…",
            "created_at": time.time(),
        }

    def download_then_process():
        try:
            dl_path = jdir / "downloaded.%(ext)s"
            ydl_opts = {
                "format": "bestaudio/best",
                "outtmpl": str(dl_path),
                "quiet": True,
                "no_warnings": True,
                "postprocessors": [],
            }
            with __import__("yt_dlp").YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                title = info.get("title", "audio") if info else "audio"

            # Find the downloaded file
            downloaded = list(jdir.glob("downloaded.*"))
            if not downloaded:
                raise RuntimeError("Download produced no file.")
            src = downloaded[0]
            run_pipeline(job_id, src, title)
        except Exception as exc:
            logger.exception("Download failed for job %s: %s", job_id, exc)
            update_job(job_id, status="error", message=f"Download failed: {exc}", progress=0)

    t = threading.Thread(target=download_then_process, daemon=True)
    t.start()
    return jsonify({"job_id": job_id})


@app.route("/api/status/<job_id>", methods=["GET"])
def status(job_id: str):
    with jobs_lock:
        job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    return jsonify(job)


@app.route("/api/download/<job_id>/<stem>", methods=["GET"])
def download_stem(job_id: str, stem: str):
    with jobs_lock:
        job = jobs.get(job_id)
    if not job or job.get("status") != "done":
        return jsonify({"error": "Job not ready"}), 404

    stems = job.get("stems", {})
    if stem not in stems:
        return jsonify({"error": f"Stem '{stem}' not found"}), 404

    file_path = job_dir(job_id) / stems[stem]["filename"]
    if not file_path.exists():
        return jsonify({"error": "File missing"}), 404

    download_name = f"{song_base_name(job.get('original_name', 'audio'))} ({stem}).mp3"
    return send_file(str(file_path), as_attachment=True, download_name=download_name)


@app.route("/api/mix/<job_id>", methods=["POST"])
def mix_stems(job_id: str):
    """Mix down a chosen set of stems into a single MP3 and return it.

    Body: { "stems": ["vocals", "drums", ...] }  (defaults to all stems).
    Demucs stems sum back to the original, so we mix with amix normalize=0
    to preserve the original level instead of attenuating by stem count.
    """
    with jobs_lock:
        job = jobs.get(job_id)
    if not job or job.get("status") != "done":
        return jsonify({"error": "Job not ready"}), 404

    available = job.get("stems", {})
    data = request.get_json(force=True, silent=True) or {}
    selected = data.get("stems") or list(available.keys())
    # Keep only known stems, preserving the job's stem order for a stable name.
    selected = [s for s in available if s in selected]
    if not selected:
        return jsonify({"error": "No valid stems selected"}), 400

    jdir = job_dir(job_id)
    inputs = []
    for s in selected:
        p = jdir / available[s]["filename"]
        if not p.exists():
            return jsonify({"error": f"Stem file missing: {s}"}), 404
        inputs.append(p)

    out_path = jdir / ("mix_" + "-".join(selected) + ".mp3")
    cmd = ["ffmpeg", "-y"]
    for p in inputs:
        cmd += ["-i", str(p)]
    if len(inputs) > 1:
        cmd += ["-filter_complex", f"amix=inputs={len(inputs)}:normalize=0"]
    cmd += ["-c:a", "libmp3lame", "-b:a", "320k", str(out_path)]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        logger.error("Mixdown failed for job %s: %s", job_id, result.stderr[-500:])
        return jsonify({"error": "Mixdown failed"}), 500

    descriptor = mix_descriptor(selected, available)
    download_name = f"{song_base_name(job.get('original_name', 'audio'))} ({descriptor}).mp3"
    return send_file(str(out_path), as_attachment=True,
                     download_name=download_name, mimetype="audio/mpeg")


@app.route("/api/cleanup/<job_id>", methods=["DELETE"])
def cleanup_job(job_id: str):
    shutil.rmtree(job_dir(job_id), ignore_errors=True)
    with jobs_lock:
        jobs.pop(job_id, None)
    return jsonify({"ok": True})


if __name__ == "__main__":
    print("=" * 55)
    print(f"  🎵 Audio Stemming API  —  http://localhost:{PORT}")
    print(f"     model={MODEL}  ·  device={DEVICE}")
    print("=" * 55)
    # Periodic cleanup in background
    def _cleaner():
        while True:
            time.sleep(1800)
            cleanup_old_jobs()
    threading.Thread(target=_cleaner, daemon=True).start()
    app.run(host="0.0.0.0", port=PORT, debug=False, threaded=True)
