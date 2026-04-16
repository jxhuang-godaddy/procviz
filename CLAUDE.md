# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend
```bash
uv run python app.py                    # Start FastAPI server on :8000 (auto-reload)
uv run pytest -v                        # Run all tests
uv run pytest tests/test_sql_parser.py -v                # Run one test file
uv run pytest tests/test_sql_parser.py::test_name -v     # Run single test
```

### Frontend
```bash
cd frontend && npm run dev              # Vite dev server on :5173 (proxies /api → :8000)
cd frontend && npm run build            # Build to frontend/dist/
cd frontend && npm run lint             # ESLint
cd frontend && npx tsc --noEmit         # Type-check without emitting
```

### Development workflow
Start backend and frontend dev servers in separate terminals. Vite proxies `/api` to the backend automatically (`vite.config.ts`). The production build in `frontend/dist/` is served by FastAPI via `StaticFiles`.

## Architecture

```
Route handlers (api/routes.py)
  → Connectors (connectors/teradata.py)    — teradatasql queries, lazy singleton connection
  → Parsers (parsers/sql_parser.py)        — sqlglot: DDL → table refs, calls, step SQL
  → Graph builder (graph/builder.py)       — DataFlowResult → Cytoscape JSON
  → Models (models/schemas.py)             — Pydantic models shared across all layers
```

### Three graph types
- **Procedure/macro** (`build_dataflow_graph`): 4-column dagre layout — proc → input tables → SQL steps → output tables/calls. Hidden scaffold edges enforce column ordering.
- **View** (`build_view_graph`): 3-column — source tables → CREATE VIEW step → view node.
- **Table** (`build_reverse_lookup_graph`): 3-column — writer procs → table → reader procs. Requires scanning all procs/macros in the database (cached).

### In-memory caching
`_dataflow_cache` and `_ddl_cache` are populated together per-database on first table lookup (`_ensure_db_cached`). `_db_fully_scanned` tracks which databases have been completely scanned, distinguishing partial cache (from forward dataflow of individual procs) from full scans needed for reverse lookup. Forward dataflow also caches DDL to prevent misses. Cache clears on server restart.

### SQL parser pipeline
`parse_dataflow(ddl)` normalizes CRLF first, then detects DDL type (procedure vs macro vs plain), extracts the body with byte offset, splits into statements tracking character positions with `pos_map`, filters to DML, parses with sqlglot (Teradata dialect, WARN level for partial results), and returns `DataFlowResult` with table refs, call refs, step SQL text, and 1-based line numbers.

Key: `_split_statements` returns `(text, char_offset, pos_map)` tuples. `pos_map` tracks each character's original body position through comment stripping. Line numbers are computed from `body_offset + pos_map[match_start]` against the original DDL.

### Frontend state flow
`App.tsx` manages selection, detail modal, visibility, and progress state. `DiagramView` uses `forwardRef` + `useImperativeHandle` to expose the Cytoscape `cy` instance to parent (needed for export). Visibility toggles use a 3-pass approach: (1) apply direct type visibility, (2) hide edges with hidden endpoints, (3) hide orphaned nodes with no visible edges (skips intentionally isolated nodes like tables with no readers/writers).

### SSE streaming (table diagrams)
Table dataflow uses `EventSource` on the frontend and `StreamingResponse` on the backend. Progress events (`type: "progress"`) stream during database scanning; the final `type: "result"` event carries the graph JSON. `useDataflow` hook manages the SSE lifecycle.

### Double-click navigation
`DiagramView` delays single-tap 250ms so `dbltap` can cancel it. Navigable node types: proc, macro, table, volatile, caller. Node ID is parsed as `db.name` to extract database and object name. `TreeSidebar` syncs expansion state via `activeSelection` prop.

## Conventions

- **Ruff** line-length: 100 (pyproject.toml)
- **Pydantic models** for all data crossing layer boundaries
- Parser is pure-function — takes DDL string, returns structured data, no DB dependency
- Case-insensitive table name deduplication via `_canon()` in graph builder
- Volatile tables tracked separately (`volatile_tables` set) for distinct visual treatment
- sqlglot uses `error_level=ErrorLevel.WARN` so partial parsing succeeds on unsupported Teradata SPL constructs
- Frontend uses Tailwind CSS classes exclusively (no custom CSS beyond index.css imports)
- Node labels conditionally include database prefix only when diagram spans multiple databases (`_is_multi_db` / `_make_label` in graph builder)
- DetailModal uses `preserveLines` mode for DDL views (original line numbers) vs formatted mode for step SQL snippets

## Testing

Tests in `tests/` use pytest. Parser tests pass DDL strings directly — no DB connection needed. Graph builder tests construct `DataFlowResult` objects manually. Route tests use httpx test client with mocked connector functions.

When changing the parser: run `uv run pytest tests/test_sql_parser.py -v` first. When changing the graph builder: also run `uv run pytest tests/test_graph_builder.py -v`. Always run full suite before committing.

## Environment

Requires `.env` with `TD_HOST`, `TD_PORT` (default 1025), `TD_USER`, `TD_PASSWORD` for Teradata connectivity. Python ≥3.10 managed by uv.
