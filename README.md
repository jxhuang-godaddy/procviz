# ProcViz

Interactive data flow diagrams for Teradata stored procedures, macros, tables, and views.

## Quick Start

### Mac/Linux
```bash
curl -fsSL https://raw.githubusercontent.com/jxhuang-godaddy/procviz/main/install.sh | sh
```

### Windows (PowerShell)
```powershell
irm https://raw.githubusercontent.com/jxhuang-godaddy/procviz/main/install.ps1 | iex
```

## Manual Setup

1. Install [uv](https://docs.astral.sh/uv/)
2. Clone this repo
3. Copy `.env.example` to `.env` and fill in your Teradata credentials
4. Run `uv sync`
5. Run `uv run python app.py`
6. Open http://localhost:8000

## Development

Backend:
```bash
uv run python app.py
```

Frontend (with hot reload):
```bash
cd frontend && npm install && npm run dev
```

Rebuild frontend dist:
```bash
cd frontend && npm run build
```

Tests:
```bash
uv run pytest -v
```
