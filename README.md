# 🎵 Audio Stem Separator

Split any audio or video into isolated stems — **vocals, drums, bass, and other instruments** — using Meta's state-of-the-art [Demucs](https://github.com/facebookresearch/demucs) model, wrapped in a polished web UI.

---

## What it does

| Input | Output |
|-------|--------|
| Local file (MP3, WAV, FLAC, AAC, OGG, M4A, MP4, MKV, MOV, AVI, WebM…) | 4 isolated stems as 320k MP3 |
| YouTube URL | Same stems, auto-downloaded first |
| Any direct audio/video URL | Same stems |

---

## Architecture

```
┌─────────────────────────────────┐
│   Frontend (index.html)         │  ← drag-drop UI, progress, download
│   served by Flask at /          │     (React via CDN, no build step)
└────────────┬────────────────────┘
             │ HTTP (localhost:5050)
┌────────────▼────────────────────┐
│   Flask API (server.py)         │
│   /              ← serves UI    │
│   /api/upload    ← file upload  │
│   /api/from-url  ← YouTube/URL  │
│   /api/status    ← poll job     │
│   /api/download  ← fetch stem   │
└────────────┬────────────────────┘
             │
    ┌────────▼──────────────────┐
    │  Processing pipeline      │
    │  1. yt-dlp  (if URL)      │
    │  2. ffmpeg  → 44100 WAV   │
    │  3. Demucs  → 4 stems     │
    │  4. ffmpeg  → MP3 320k    │
    └───────────────────────────┘
```

---

## Quick start

### 1. Requirements

- **Python 3.9+**
- **ffmpeg** — `brew install ffmpeg` / `sudo apt install ffmpeg`

> No Node.js / npm needed — the UI is a single `index.html` that loads React from
> a CDN and is served by Flask.

### 2. Install & run the backend

```bash
# Install Python deps
pip install demucs yt-dlp flask flask-cors

# Start the API server
python3 server.py
# → Listening on http://localhost:5050
```

> ⚠️ **First run**: Demucs will automatically download the `htdemucs` model (~1 GB) and cache it. Subsequent runs are instant.

### 3. Open the app

Once the server is running, just open **http://localhost:5050** in your browser.
The Flask server serves the UI (`index.html`) directly — no separate frontend
server or build step needed.

> The `index.html` is fully self-contained (React is loaded from a CDN), so it
> works offline-of-build: no `npm install`, no bundler.

---

## API reference

### `POST /api/upload`
Upload a media file.
- Body: `multipart/form-data` with field `file`
- Response: `{ "job_id": "uuid" }`

### `POST /api/from-url`
Submit a YouTube or direct URL.
- Body: `{ "url": "https://..." }`
- Response: `{ "job_id": "uuid" }`

### `GET /api/status/{job_id}`
Poll job status.
- Response:
```json
{
  "status": "separating",   // queued | downloading | converting | separating | done | error
  "progress": 62,           // 0–100
  "message": "Separating stems… 62%",
  "stems": {                // only present when status=done
    "vocals": { "filename": "vocals.mp3", "size_kb": 8200 },
    "drums":  { "filename": "drums.mp3",  "size_kb": 7100 },
    "bass":   { "filename": "bass.mp3",   "size_kb": 5900 },
    "other":  { "filename": "other.mp3",  "size_kb": 9300 }
  }
}
```

### `GET /api/download/{job_id}/{stem}`
Download a stem file (e.g. `/api/download/abc/vocals`).
Saved as `<song name> (vocals).mp3`.

### `POST /api/mix/{job_id}`
Mix a chosen set of stems into a single MP3 and download it.
Body: `{ "stems": ["vocals", "drums"] }` (omit or send all stems for the full mix).
Stems are summed at full level (`amix … normalize=0`), so all four reconstruct
the original track. The download name reflects the selection:
`<song name> (full mix).mp3`, `<song name> (minus vocals).mp3`, or
`<song name> (vocals, drums).mp3`.

### `DELETE /api/cleanup/{job_id}`
Delete job files immediately.

---

## Configuration

Edit `server.py` to change:

| Variable | Default | Notes |
|----------|---------|-------|
| `MODEL` | `htdemucs` | Use `htdemucs_6s` for 6 stems (adds guitar & piano) |
| `WORK_DIR` | `/tmp/stem_tool` | Where temp files are stored |
| Port | `5050` | Change in `app.run(...)` |

---

## Models

| Model | Stems | Quality | Speed |
|-------|-------|---------|-------|
| `htdemucs` | vocals, drums, bass, other | ⭐⭐⭐⭐⭐ | Medium |
| `htdemucs_6s` | + guitar, piano | ⭐⭐⭐⭐ | Slower |
| `mdx_extra` | vocals, drums, bass, other | ⭐⭐⭐⭐ | Fast |

---

## Privacy

All processing happens **locally on your machine**. No audio is sent to any external server. Job files are auto-deleted after 1 hour.
