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
- `get_objects(db, object_type)` — queries `DBC.TablesV` filtered by `TableKind` (`T`=table, `V`=view, `P`=procedure, `M`=macro)
- `get_ddl(db, name)` — tries `SHOW TABLE`, `SHOW VIEW`, `SHOW PROCEDURE`, `SHOW MACRO` in sequence; returns the first successful result. (DBC.TablesV RequestText was removed because it returns index DDL, not table DDL)
- `get_columns(db, table_name)` — queries `DBC.ColumnsV` for column list (with `or ""` fallback for NULL ColumnName/ColumnType)
- `get_parameters(db, proc_name)` — queries `DBC.RoutinesV` for procedure/macro parameters

Connection created lazily on first request, reused across requests. Credentials from `.env` via `python-dotenv`.

### Parser: `parsers/sql_parser.py`

Pure functions — takes a DDL string, returns structured data. No DB dependency.

- `parse_dataflow(ddl: str) -> DataFlowResult` — main function:
  1. Strip leading comments (`--`, `/* */`) before DDL type detection
  2. Detect DDL type: procedure (`_is_procedure_ddl`) or macro (`_is_macro_ddl`)
  3. For procedures: extract body between `BEGIN...END` via `_extract_procedure_body`
  4. For macros: extract body between `AS ( ... )` via `_extract_macro_body` (paren-depth-aware)
  5. Split body into individual statements via `_split_statements` (handles `--` line comments, `/* */` block comments, quoted strings, `\r\n`/`\r`/`\n` normalization)
  6. Filter to DML statements via `_get_dml_statement_list` (skips SET/DECLARE/SIGNAL/COLLECT)
  7. Parse each DML with `sqlglot.parse(sql, dialect="teradata", error_level=ErrorLevel.WARN)`
  8. Walk the AST for `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `CREATE`, `CALL` via `_process_statement`
  9. For `CREATE` statements: detect `VolatileProperty` → add to `volatile_tables` set; extract both target (CREATE ref) and source tables (SELECT refs)
  10. Return `DataFlowResult` with table references, call references, step SQL mapping, and volatile table set

- `_process_statement(stmt, step, cte_aliases, table_refs, call_refs, volatile_tables)` — handles all DML types including INSERT with Schema-wrapped targets, MERGE with USING clause, and CREATE with source subquery

- `_extract_cte_aliases(stmt) -> set[str]` — collects CTE alias names to exclude from table refs

- `_qualified_table_name(table) -> str` — builds `catalog.db.name` from sqlglot Table node

Uses `error_level=ErrorLevel.WARN` so partial parsing succeeds when encountering Teradata SPL constructs that sqlglot doesn't fully support (e.g., `BT`/`ET`, `SIGNAL`, cursor declarations).

### Graph builder: `graph/builder.py`

Assembles Cytoscape JSON from parsed data using a 4-column dagre layout:

- `build_dataflow_graph(obj_name, obj_type, dataflow, detail_data) -> GraphResponse`
  - **Col 0:** Center procedure/macro node (with DDL and parameters in detail)
  - **Col 1:** Input table nodes (SELECT sources) — connected via hidden scaffold edges from proc node
  - **Col 2:** SQL step sub-nodes (one per DML statement, labeled `[N] INSERT / SELECT`, with SQL in detail)
  - **Col 3:** Output table nodes (INSERT/UPDATE/DELETE/CREATE targets) and CALL target nodes
  - Case-insensitive deduplication via `_canon()` — `FinSandbox.X` and `FinSandBox.X` merge to one node
  - Volatile tables detected via `dataflow.volatile_tables` and typed as `"volatile"` (distinct from `"table"`)
  - Steps with no input tables get a direct proc → step edge

- `build_reverse_lookup_graph(table_name, all_dataflows) -> GraphResponse`
  - Table node at center
  - Procedure/macro nodes for each object referencing the table
  - Edges showing operation type and direction

Step numbers use bracketed labels (`[1]`, `[2]`, ...) for display.

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
    step_sql: dict[int, str] = {}    # step number → raw SQL text
    volatile_tables: set[str] = set()  # names of CREATE VOLATILE TABLE targets
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
    type: str           # proc, macro, step, table, volatile, caller
    detail: dict        # DDL, SQL, columns, parameters — varies by type

class CytoscapeEdge(BaseModel):
    source: str
    target: str
    type: str           # read, write, call
    step: str           # "[1]", "[2]", etc.
    label: str          # "SELECT", "INSERT", "CALL"
    hidden: bool = False  # scaffold edges for dagre layout

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

Two-panel layout with floating overlays:

1. **Tree sidebar** (left, ~220px) — collapsible tree: Database → Object Type → Object. Lazy-loads each level on expand.
2. **Diagram area** (center, fills remaining space) — Cytoscape.js canvas with dagre layout, `rankDir: LR` (4-column: proc → inputs → steps → outputs). Pan and zoom built in.
3. **Detail modal** (floating, resizable/draggable) — appears on node/edge click. Shows SQL/DDL with syntax highlighting (keywords blue, functions purple, strings green, numbers orange, comments gray). Copy-to-clipboard button. Node-type-specific content:
   - **Procedure/Macro**: full DDL definition
   - **SQL Step**: extracted DML statement
   - **Volatile Table**: CREATE statement from the creating step
   - **Table/View**: DDL fetched from Teradata via `/ddl/{db}/{name}` endpoint
   - **Caller**: parameter list
   - **Edge**: source, target, type, step
4. **Legend** (bottom-left overlay) — color legend for all node/edge types including volatile tables
5. **Export menu** (top-right overlay) — dropdown with PNG, JPG, PDF, HTML (interactive viewer), JSON export options

### Component structure

```
frontend/src/
├── App.tsx                  # Root — layout shell (sidebar | diagram | export | modal)
├── components/
│   ├── TreeSidebar.tsx      # Database → Object Type → Object tree
│   ├── DiagramView.tsx      # Cytoscape.js canvas + dagre layout (forwardRef exposing getCy)
│   ├── DetailModal.tsx      # Resizable/draggable modal with SQL syntax highlighting + copy
│   ├── ExportMenu.tsx       # Export dropdown: PNG, JPG, PDF, HTML, JSON
│   ├── Legend.tsx            # Color legend for node/edge types
│   └── DetailPanel.tsx      # (legacy, unused)
├── hooks/
│   ├── useDatabases.ts      # Fetch /api/databases
│   ├── useObjects.ts        # Fetch /api/databases/{db}/{type}
│   └── useDataflow.ts       # Fetch /api/.../dataflow
├── types/
│   ├── graph.ts             # TypeScript types for Cytoscape data model
│   └── cytoscape-dagre.d.ts # Type declarations for cytoscape-dagre
├── api/
│   └── client.ts            # Fetch wrapper for backend API (+ getDdl)
├── styles/
│   └── index.css            # Tailwind imports
├── main.tsx                 # React entry point
└── index.html               # Vite entry HTML
```

### Visual design

**Node colors:**
| Type | Color | Style |
|---|---|---|
| Procedure / Macro | Purple `#534AB7` | Bold, border `#3B2D8F` |
| SQL Step | Blue `#3B82F6` | Border `#2563EB` |
| Table / View | Teal `#0F6E56` | — |
| Volatile Table | Amber `#D97706` | Dashed border `#B45309` |
| Called Procedure | Gray `#888888` | — |

**Edge colors:**
| Type | Color | Style |
|---|---|---|
| Read (SELECT) | Green `#1D9E75` | Solid |
| Write (INSERT/UPDATE/DELETE/CREATE/MERGE) | Purple `#534AB7` | Solid |
| Call | Gray `#94A3B8` | Dashed |
| Scaffold (hidden) | — | Invisible, affects dagre layout only |

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
│   └── teradata.py               # SHOW queries, DBC views, connection mgmt
├── parsers/
│   ├── __init__.py
│   └── sql_parser.py             # sqlglot extraction: procs, macros, volatile tables
├── graph/
│   ├── __init__.py
│   └── builder.py                # Cytoscape JSON assembly (4-column layout)
├── models/
│   ├── __init__.py
│   └── schemas.py                # Pydantic models
├── tests/
│   ├── test_schemas.py
│   ├── test_sql_parser.py
│   ├── test_graph_builder.py
│   └── test_routes.py
├── frontend/
│   ├── src/                      # React + TypeScript source
│   ├── dist/                     # Pre-built (committed)
│   ├── package.json              # Deps: cytoscape, jspdf, react
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

## Implemented Beyond Original Spec

The following features were added during Phase 1 development based on user feedback:

- **SQL syntax highlighting** in detail modal (custom zero-dependency tokenizer for keywords, functions, strings, numbers, comments, operators)
- **Resizable/draggable detail modal** replacing the fixed detail panel
- **Copy-to-clipboard** button for SQL/DDL content
- **Volatile table support** — distinct amber/dashed node color, CREATE statement detection via `VolatileProperty`
- **Macro DDL support** — `AS (...)` body extraction with paren-depth tracking
- **Leading comment stripping** — handles DDL starting with `--DROP TABLE...` or `/* */` before `CREATE/REPLACE`
- **Line ending normalization** — handles `\r\n`, `\r`, `\n` in both parser and display
- **Case-insensitive deduplication** — `FinSandbox.X` and `FinSandBox.X` merge to one node
- **Auto-sized node labels** — `width: "label"` ensures full text is always readable
- **SHOW-based DDL retrieval** — replaced `DBC.TablesV RequestText` with `SHOW TABLE/VIEW/PROCEDURE/MACRO` loop
- **Diagram export** — PNG, JPG, PDF, HTML (interactive self-contained viewer), JSON (Cytoscape.js format)
- **HTML export with interactivity** — node click shows SQL/DDL modal with syntax highlighting and copy-to-clipboard
