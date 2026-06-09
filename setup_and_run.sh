#!/usr/bin/env bash
# ============================================================
#  Audio Stem Separator — Setup & Run Script
#  Requirements: Python 3.9+, ffmpeg
# ============================================================

set -e

echo ""
echo "🎵  Audio Stem Separator — Setup"
echo "================================="

# ── 1. System checks ─────────────────────────────────────────
if ! command -v ffmpeg &>/dev/null; then
  echo "❌  ffmpeg not found. Install it:"
  echo "    macOS:   brew install ffmpeg"
  echo "    Ubuntu:  sudo apt install ffmpeg"
  echo "    Windows: https://ffmpeg.org/download.html"
  exit 1
fi
echo "✅  ffmpeg: $(ffmpeg -version 2>&1 | head -1)"

if ! command -v python3 &>/dev/null; then
  echo "❌  Python 3 not found."
  exit 1
fi
echo "✅  Python: $(python3 --version)"

# ── 2. Python deps ───────────────────────────────────────────
echo ""
echo "📦  Installing Python dependencies…"
pip install demucs yt-dlp flask flask-cors --quiet
echo "✅  Python packages installed"

# ── 3. (Frontend needs no build) ─────────────────────────────
# The UI is a self-contained index.html served by Flask. Nothing to install.

# ── 3b. Pre-download the Demucs model (best effort) ──────────
# Pulls the ~1 GB model now so the *first* separation isn't stalled on it.
echo ""
echo "🧠  Caching the Demucs model (first time only, ~1 GB — may take a while)…"
if python3 -c "from demucs.pretrained import get_model; get_model('htdemucs')" 2>/dev/null; then
  echo "✅  Model cached"
else
  echo "⚠️   Couldn't pre-cache it now — it'll download on the first separation."
fi

# ── 4. Start server ──────────────────────────────────────────
PORT="${PORT:-5050}"
export PORT
URL="http://localhost:${PORT}"

# Kill the server when this script exits (Ctrl+C, error, or normal end).
SERVER_PID=""
cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    echo ""
    echo "🛑  Stopping server (PID $SERVER_PID)…"
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo ""
echo "🚀  Starting server on ${URL}"
echo "    (Press Ctrl+C to stop — this also shuts the server down.)"
echo ""
python3 server.py &
SERVER_PID=$!

# Wait until the server answers before opening a browser.
echo "⏳  Waiting for the server to come up…"
if command -v curl &>/dev/null; then
  for _ in $(seq 1 120); do
    if curl -fsS -o /dev/null "${URL}/api/health"; then break; fi
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
      echo "❌  Server exited before it was ready. See the log above."
      exit 1
    fi
    sleep 0.5
  done
else
  sleep 3   # no curl available; give it a moment
fi

# Open the app in the default browser.
echo "🌐  Opening ${URL} …"
if command -v open &>/dev/null; then           # macOS
  open "$URL"
elif command -v xdg-open &>/dev/null; then     # Linux
  xdg-open "$URL" &>/dev/null &
elif command -v start &>/dev/null; then        # Windows (Git Bash)
  start "$URL"
else
  echo "    (Couldn't auto-open a browser — visit ${URL} manually.)"
fi

# Hand the foreground to the server so logs stream and Ctrl+C reaches us.
wait "$SERVER_PID"
