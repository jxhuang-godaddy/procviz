@echo off
cd /d "%~dp0"
echo Starting ProcViz...
start http://localhost:8000
uv run python app.py
