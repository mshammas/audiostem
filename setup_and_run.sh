#!/usr/bin/env bash
# ============================================================
#  Audio Stem Separator — Setup & Run Script
#  Requirements: Python 3.9+, Node.js 18+, ffmpeg
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

# ── 4. Start server ──────────────────────────────────────────
echo ""
echo "🚀  Starting server on http://localhost:5050"
echo "    Open that URL in your browser to use the app."
echo "    (Press Ctrl+C to stop)"
echo ""
python3 server.py
