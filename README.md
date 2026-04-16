# ProcViz

Interactive data flow diagrams for Teradata stored procedures, macros, tables, and views.

## Prerequisites

- Network/VPN access to your Teradata instance
- [uv](https://docs.astral.sh/uv/) (Python package manager) -- the install scripts will install it for you if not present

## Install

### Mac / Linux (one-liner)
```bash
curl -fsSL https://raw.githubusercontent.com/jxhuang-godaddy/procviz/main/install.sh | sh
```

### Windows PowerShell (one-liner)
```powershell
irm https://raw.githubusercontent.com/jxhuang-godaddy/procviz/main/install.ps1 | iex
```

### Manual install
```bash
git clone https://github.com/jxhuang-godaddy/procviz.git ~/procviz
cd ~/procviz
uv sync
```

The install scripts handle everything: install `uv` if missing, clone the repo, install dependencies, prompt for Teradata credentials, and launch the app.

## Setup

Copy the example environment file and fill in your Teradata credentials:

```bash
cp .env.example .env
```

Edit `.env`:
```bash
TD_HOST=your-teradata-host
TD_PORT=1025
TD_USER=your-username
TD_PASSWORD=your-password
```

## Start

### Quick start (opens browser automatically)

Mac / Linux:
```bash
cd ~/procviz && ./start.sh
```

Windows:
```cmd
cd %USERPROFILE%\procviz && start.bat
```

### Manual start
```bash
cd ~/procviz && uv run python app.py
```

Then open http://localhost:8000 in your browser.

## Stop

Press `Ctrl+C` in the terminal where ProcViz is running.

If the process is running in the background:
```bash
lsof -ti :8000 | xargs kill
```

## Update

```bash
cd ~/procviz && git pull && uv sync
```

## Development

Backend (with auto-reload):
```bash
uv run python app.py
```

Frontend (with hot reload, requires Node.js):
```bash
cd frontend && npm install && npm run dev
```

The Vite dev server on port 5173 proxies `/api` requests to the backend on port 8000. Run both servers during development.

Rebuild frontend for production:
```bash
cd frontend && npm run build
```

Tests:
```bash
uv run pytest -v
```
