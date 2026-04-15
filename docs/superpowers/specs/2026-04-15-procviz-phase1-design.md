# ProcViz Phase 1 Design — Core MVP

## Overview

ProcViz is a locally-run web application that generates interactive data flow diagrams for Teradata stored procedures, macros, tables, and views. Phase 1 delivers the core MVP: a FastAPI backend that queries Teradata `DBC` views, parses SQL with sqlglot, and serves Cytoscape.js graph data to a React + TypeScript frontend.

Target users are non-technical (data stewards, analysts, business stakeholders) who need to understand what stored procedures do and how they relate to tables — without writing code or using diagramming tools.

## Architecture

**Layered by concern** — each layer has one job and communicates through Pydantic models:

```
Route handlers (api/routes.py)
  → Connectors (connectors/teradata.py)    — DBC queries, connection management
  → Parsers (parsers/sql_parser.py)        — sqlglot: extract tables, DML, CALLs
  → Graph builder (graph/builder.py)       — assemble Cytoscape JSON
  → Response (models/schemas.py)           — Pydantic models serialized to JSON
```

Benefits:
- Parser testable without DB — pass DDL string in, get structured data out
- Each file stays focused at ~100-200 lines
- Clean seams for Phase 2+ (Alation connector, control flow parser, Airflow connector)

## API Endpoints

| Method | Path | Returns |
|---|---|---|
| `GET` | `/api/databases` | List of database names the user can access |
| `GET` | `/api/databases/{db}/object-types` | `["procedure", "macro", "table", "view"]` |
| `GET` | `/api/databases/{db}/{object_type}` | List of object names + basic metadata |
| `GET` | `/api/databases/{db}/{object_type}/{name}/dataflow` | Cytoscape JSON — data flow diagram |
| `GET` | `/` | Serves pre-built React frontend via `StaticFiles` |

### Navigation model

Three-level drill-down: **Database → Object Type → Object**

- User selects a database from the tree
- Expands to see object types: procedure, macro, table, view
- Expands an object type to see available objects
- Clicks an object to render its data flow diagram

### Data flow behavior by object type

- **Procedures / macros:** sqlglot-parsed data flow diagram showing which tables are read from and written to, with DML operation types and step numbers
- **Tables / views:** Reverse-lookup diagram — all procedures/macros that reference this table, centered on the table node. Built by scanning all parsed procedures in the same database.

## Backend Components

### Connector: `connectors/teradata.py`

Manages the `teradatasql` connection and exposes query functions:

- `get_databases()` — queries `DBC.DatabasesV` for accessible database names
- `get_objects(db, object_type)` — queries `DBC.TablesV` (tables/views) or `DBC.RoutinesV` (procedures/macros) filtered by type
- `get_ddl(db, name)` — queries `DBC.TextTbl` for full source text, reassembled by `LineNo` order. Falls back to `DBC.RoutinesV.RequestText` if `TextTbl` is insufficient
- `get_columns(db, table_name)` — queries `DBC.ColumnsV` for column list (detail panel)
- `get_parameters(db, proc_name)` — queries `DBC.RoutinesV` for procedure/macro parameters

Connection created lazily on first request, reused across requests. Credentials from `.env` via `python-dotenv`.

### Parser: `parsers/sql_parser.py`

Pure functions — takes a DDL string, returns structured data. No DB dependency.

- `parse_dataflow(ddl: str) -> DataFlowResult` — main function:
  1. Parse with `sqlglot.parse(ddl, dialect="teradata")`
  2. Walk the AST for `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `MERGE` statements
  3. Extract source/target table names from each statement
  4. Extract `CALL` statements (procedure-to-procedure dependencies)
  5. Assign step numbers based on statement order in the DDL
  6. Return `DataFlowResult` with table references and call references

- `extract_table_refs(statement) -> list[TableRef]` — helper handling subqueries, CTEs, `JOIN` sources, `INSERT...SELECT` patterns

Uses `error_level=ErrorLevel.WARN` so partial parsing succeeds when encountering Teradata SPL constructs that sqlglot doesn't fully support (e.g., `BT`/`ET`, `SIGNAL`, cursor declarations).

### Graph builder: `graph/builder.py`

Assembles Cytoscape JSON from parsed data:

- `build_dataflow_graph(obj_name, obj_type, dataflow, detail_data) -> GraphResponse`
  - Center node for the procedure/macro
  - Table nodes for each unique table referenced
  - Edges with operation type (read/write/call) and step numbers
  - Caller nodes for CALL targets
  - Detail data (SQL snippet, columns, parameters) on each node

- `build_reverse_lookup_graph(table_name, all_dataflows) -> GraphResponse`
  - Table node at center
  - Procedure/macro nodes for each object referencing the table
  - Edges showing operation type and direction

Step numbers use circled digits (①②③...) for display labels, plain integers internally.

### Caching

The reverse lookup requires parsing all procedures/macros in a database. Parsed results are cached per-database in an in-memory dict so subsequent lookups are fast. Cache invalidates on server restart — adequate for Phase 1.

## Data Models (`models/schemas.py`)

### Parser output

```python
class TableRef(BaseModel):
    name: str           # fully qualified: db.table_name
    operation: str      # SELECT, INSERT, UPDATE, DELETE, MERGE
    step: int           # order in DDL

class CallRef(BaseModel):
    target: str         # called procedure name
    step: int

class DataFlowResult(BaseModel):
    table_refs: list[TableRef]
    call_refs: list[CallRef]
    errors: list[str]   # warnings from partial parse failures
```

### Connector output

```python
class DatabaseObject(BaseModel):
    name: str
    object_type: str    # procedure, macro, table, view
    database: str

class ColumnInfo(BaseModel):
    name: str
    data_type: str
    nullable: bool

class ParameterInfo(BaseModel):
    name: str
    data_type: str
    direction: str      # IN, OUT, INOUT
```

### API response (Cytoscape JSON)

```python
class CytoscapeNode(BaseModel):
    id: str
    label: str
    type: str           # proc, macro, table, caller
    detail: dict        # SQL snippet, columns, parameters — varies by type

class CytoscapeEdge(BaseModel):
    source: str
    target: str
    type: str           # read, write, call
    step: str           # "①", "②", etc.
    label: str          # "① SELECT", "② INSERT"

class GraphResponse(BaseModel):
    nodes: list[CytoscapeNode]
    edges: list[CytoscapeEdge]
```

## Frontend

### Technology

- **React** with **TypeScript** — component framework
- **Vite** — dev server and production build
- **Cytoscape.js** with **cytoscape-dagre** — graph rendering with automatic hierarchical layout
- **Tailwind CSS** — styling
- Pre-built `dist/` committed to repo (users need no Node.js)

### Layout

Three-panel layout:

1. **Tree sidebar** (left, ~220px) — collapsible tree: Database → Object Type → Object. Lazy-loads each level on expand.
2. **Diagram area** (center, fills remaining space) — Cytoscape.js canvas with dagre layout, `rankDir: LR` (sources left, targets right). Pan and zoom built in.
3. **Detail panel** (right, ~240px, appears on click) — shows node/edge details: name, type, parameters (procedures), columns (tables), SQL snippet (edges).

### Component structure

```
frontend/src/
├── App.tsx                  # Root — layout shell (sidebar | diagram | detail)
├── components/
│   ├── TreeSidebar.tsx      # Database → Object Type → Object tree
│   ├── DiagramView.tsx      # Cytoscape.js canvas + dagre layout
│   ├── DetailPanel.tsx      # Node/edge detail on click
│   └── Legend.tsx            # Color legend for node/edge types
├── hooks/
│   ├── useDatabases.ts      # Fetch /api/databases
│   ├── useObjects.ts        # Fetch /api/databases/{db}/{type}
│   └── useDataflow.ts       # Fetch /api/.../dataflow
├── types/
│   └── graph.ts             # TypeScript types for Cytoscape data model
├── api/
│   └── client.ts            # Fetch wrapper for backend API
├── styles/
│   └── index.css            # Tailwind imports + custom styles
├── main.tsx                 # React entry point
└── index.html               # Vite entry HTML
```

### Visual design

**Node colors:**
| Type | Color |
|---|---|
| Procedure | Purple `#534AB7` |
| Macro | Purple `#534AB7` (same as procedure) |
| Table | Teal `#0F6E56` |
| Caller / external | Gray |

**Edge colors:**
| Type | Color | Style |
|---|---|---|
| Read (SELECT) | Green `#1D9E75` | Solid |
| Write (UPDATE/INSERT/DELETE/MERGE) | Purple `#534AB7` | Solid |
| Call | Gray | Dashed |

## Project Configuration

### `pyproject.toml`

```toml
[project]
name = "procviz"
version = "0.1.0"
requires-python = ">=3.10"
dependencies = [
    "fastapi",
    "uvicorn[standard]",
    "teradatasql",
    "sqlglot",
    "python-dotenv",
]

[project.scripts]
procviz = "app:main"

[tool.ruff]
line-length = 100
```

### `.env.example`

```bash
TD_HOST=your-teradata-host
TD_USER=your-username
TD_PASSWORD=your-password
```

### Directory structure

```
procviz/
├── app.py                        # FastAPI entry + uvicorn
├── api/
│   ├── __init__.py
│   └── routes.py                 # All route handlers
├── connectors/
│   ├── __init__.py
│   └── teradata.py               # DBC queries, connection mgmt
├── parsers/
│   ├── __init__.py
│   └── sql_parser.py             # sqlglot extraction logic
├── graph/
│   ├── __init__.py
│   └── builder.py                # Cytoscape JSON assembly
├── models/
│   ├── __init__.py
│   └── schemas.py                # Pydantic models
├── frontend/
│   ├── src/                      # React + TypeScript source
│   ├── dist/                     # Pre-built (committed)
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── pyproject.toml
├── .env.example
├── .gitignore
├── start.sh                      # Mac/Linux launcher
├── start.bat                     # Windows launcher
├── install.sh                    # One-liner install (Mac/Linux)
├── install.ps1                   # One-liner install (Windows)
└── README.md
```

### Launcher scripts

**`start.sh` / `start.bat`:** Run `uv run python app.py`, open browser at `http://localhost:8000`.

**`install.sh` / `install.ps1`:** Install `uv` if not present, clone repo, run `uv sync`, prompt for Teradata credentials and write `.env`, launch the app.

## Out of Scope (Phase 1)

- Control flow diagrams (IF/ELSE, loops, BT/ET) — Phase 2
- Alation enrichment (table descriptions, stewardship, deep-links) — Phase 2
- Multi-procedure dependency graphs — Phase 3
- Airflow/Informatica integration — Phase 3
- Search, filter, minimap, step number override — Phase 4
- Mock/stub mode for development without Teradata
