# CLAUDE.md

This file gives Claude Code the context it needs to work on this repository.

## What this project is

**audiostem** is a self-hosted audio stem separation tool. It takes any audio or
video file — or a YouTube / direct media URL — and splits it into isolated stems
(vocals, drums, bass, other) using Meta's [Demucs](https://github.com/facebookresearch/demucs)
`htdemucs` model. It exposes a small web UI for drag-and-drop uploads and a REST
API that runs the separation pipeline.

The project currently runs **locally**. Public hosting (RunPod serverless / Hetzner
VPS / Railway) has been scoped out but is parked for later — do not add deployment
infrastructure unless asked.

## Architecture

```
Browser (index.html, React via CDN)
      │  served by Flask at /  ·  calls /api/* on same origin
Flask API (server.py)
      │
Pipeline:  yt-dlp (if URL) → ffmpeg (→ 44.1kHz WAV) → Demucs (→ stems) → ffmpeg (→ MP3 320k)
```

- The frontend is a **single self-contained `index.html`** (React + Babel loaded
  from a CDN, no build step). Flask serves it at `/`. The UI calls the API on the
  same origin (`window.location.origin + "/api"`), so there's only one server and
  one port. There is no build step and no separate source file — `index.html` is
  the one and only frontend; edit it directly.
- The backend is **job-based and async**. Each request creates a `job_id`; the
  frontend polls `/api/status/<job_id>` until status is `done` or `error`.
- Jobs are tracked in an in-memory dict (`jobs`) guarded by a lock. There is **no
  database** — restarting the server clears all jobs.
- Working files live under `WORK_DIR` (default `/tmp/stem_tool/<job_id>/`).
  A background thread auto-deletes jobs older than 1 hour.

## Files

| File | Purpose |
|------|---------|
| `server.py` | Flask backend. Serves the UI at `/`, all `/api/*` routes, the pipeline, job state. |
| `index.html` | Self-contained React UI (CDN React/Babel, inline styles). **This is the live frontend.** |
| `setup_and_run.sh` | One-command launcher: installs deps, checks ffmpeg, pre-caches the Demucs model, runs the server in the background, opens the browser, and kills the server on exit (Ctrl+C). Honours the `PORT` env var. |
| `README.md` | User-facing docs and API reference. |
| `.gitignore` | Excludes model cache, temp media, Python/Node artifacts. |

## API surface (defined in server.py)

- `GET  /` — serves `index.html` (the UI)
- `GET  /favicon.ico` — returns 204 (UI uses an inline SVG favicon)
- `POST /api/upload` — multipart file upload → `{ job_id }`
- `POST /api/from-url` — `{ url }` (YouTube or direct media) → `{ job_id }`
- `GET  /api/status/<job_id>` — poll job progress/status/stems; for URL jobs also
  returns a `source` object (title, uploader, duration, thumbnail, `embed_url`)
  fetched via a yt-dlp metadata-only pass before the download
- `GET  /api/download/<job_id>/<stem>` — download one stem as MP3, named
  `<song> (vocals).mp3` (filename set via `Content-Disposition`; the UI reads it)
- `POST /api/mix/<job_id>` — `{ stems: [...] }` → mix selected stems (ffmpeg `amix`,
  `normalize=0`) and download as one MP3, named `<song> (full mix|minus vocals|…).mp3`
- `DELETE /api/cleanup/<job_id>` — delete a job's files
- `GET  /api/health` — liveness check

Status values: `queued → downloading → converting → separating → done` (or `error`).

## Key config (top of server.py)

- `MODEL = "htdemucs"` — switch to `"htdemucs_6s"` for 6 stems (adds guitar, piano).
- `DEVICE` — auto-detected torch backend (`mps` on Apple Silicon, `cuda` on NVIDIA,
  else `cpu`), passed to Demucs as `-d`. Force it with the `DEMUCS_DEVICE` env var.
- `WORK_DIR` — temp file location.
- `BASE_DIR` — where `index.html` is served from (the repo dir).
- `PORT` — defaults to `5050`; override with the `PORT` env var (read at startup).

## Running locally

```bash
pip install demucs yt-dlp flask flask-cors   # ffmpeg must be installed on the system
python3 server.py                            # → open http://localhost:5050
```

First run downloads the Demucs model (~1 GB) and caches it under `~/.cache/torch/`.
Open `http://localhost:5050` in a browser — Flask serves both the UI and the API,
so there's nothing else to start.

Or just run `./setup_and_run.sh`, which installs deps, pre-caches the model,
starts the server, and opens the browser for you (Ctrl+C stops everything).

## Conventions & gotchas

- **Separation speed is very hardware-dependent.** Old/weak CPUs take ~5–15 min
  per track; NVIDIA `cuda` does ~30–90s. Apple Silicon is in between and closer
  than you'd expect — on an M4, a 90s clip is ~31s on CPU vs ~24s on `mps`
  (measured), i.e. `mps` is only ~1.3× faster (the gap widens slightly on longer
  tracks). `DEVICE` is auto-detected at startup and passed to Demucs via `-d`; on
  `mps` the subprocess also gets `PYTORCH_ENABLE_MPS_FALLBACK=1` so unsupported
  ops fall back to CPU instead of crashing. The biggest first-run delay is the
  one-time ~1 GB model download, which `setup_and_run.sh` now pre-caches. Keep
  this in mind for any timeout / progress changes.
- Demucs output lands at `WORK_DIR/<job_id>/demucs_out/<MODEL>/input/<stem>.mp3`;
  `server.py` copies these to a flat location before serving. If you change the
  Demucs invocation, update the glob that collects stems.
- ffmpeg and yt-dlp are external binaries — assume they exist; the setup script
  checks for ffmpeg.
- No secrets, no `.env` needed for local use.
- The frontend is intentionally a single file with inline styles (no build config
  required). Keep it dependency-light.

## Possible next steps (not started)

- Dockerfile + RunPod serverless config for public hosting (parked).
- Persisting jobs / object storage (S3 / Cloudflare R2) for a hosted version.
- Optional WAV/FLAC output format toggle.
- Batch / multi-file processing.
