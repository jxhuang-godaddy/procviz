#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
echo "Starting ProcViz..."
uv run python app.py &
sleep 2
open "http://localhost:8000" 2>/dev/null || xdg-open "http://localhost:8000" 2>/dev/null || true
wait
