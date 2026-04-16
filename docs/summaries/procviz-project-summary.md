# Procviz — Project Summary & Claude Code Kickoff Brief

## What is Procviz?

Procviz is a locally-run web application that generates interactive flowchart and data flow diagrams for Teradata stored procedures. It is designed for **non-technical end users** (data stewards, analysts, business stakeholders) who need to understand what stored procedures do, how they relate to each other, and in what order they execute — without writing any code or using any diagramming tools.

---

## Problem Statement

- Teradata stored procedures are undocumented and opaque to non-technical users
- Existing diagramming tools (Mermaid, PlantUML, Graphviz) require technical setup and manual authoring
- Execution order lives in orchestration tools (Airflow, Informatica) outside the DDL
- Metadata enrichment (table descriptions, stewardship) lives in Alation
- There is no single tool that combines all three sources into an accessible visual

---

## Core Features

### Diagram Types
1. **Control flow diagram** — sequential flowchart of a single stored procedure's SPL logic (IF/ELSE branches, loops, SIGNAL, BT/ET scope) *(Phase 2)*
2. **Data flow diagram (procedure/macro)** — which tables a procedure reads from and writes to, with operation type (SELECT/UPDATE/INSERT/CREATE), step order labels, and source line numbers (`L#123`)
3. **Data flow diagram (view)** — source tables → CREATE VIEW step → view node, showing where the view's data comes from
4. **Table lineage diagram** — procedures that write to the table (left) → table (center) → procedures that read from the table (right), with DDL available on procedure node click
5. **Multi-procedure dependency graph** — call tree and shared table view across a set of related procedures, with parallel branch support *(Phase 3)*

### Interaction
- Click any node to see details in a **resizable, draggable modal** with SQL syntax highlighting (keywords, functions, strings, numbers, comments — all color-coded) and copy-to-clipboard
- Procedure/macro nodes show full DDL definition
- SQL step nodes show the extracted DML statement with source line number (`L#123`)
- Volatile table nodes show the CREATE statement from the step that creates them
- Table/view nodes fetch and display DDL from Teradata via SHOW TABLE/VIEW
- Pan and zoom (built into Cytoscape.js)
- Node labels auto-sized to fit full text (no truncation)
- **Visibility toggles** — checkboxes in the legend to show/hide each node type (Procedure/Macro, SQL Step, Table/View, Volatile Table, Called Procedure) and each edge type (Execution Flow, Read, Write). Hidden nodes automatically hide their connected edges; orphaned nodes with no remaining visible edges are auto-hidden.
- **Database filter** — text input at the top of the sidebar for case-insensitive name filtering across all databases
- **Object filter** — per-object-type text filter that appears when a list has more than 10 items, enabling quick search within procedures, macros, tables, or views
- Minimap for large graphs *(Phase 4)*
- Inline step number override when auto-detection is insufficient *(Phase 4)*

### Diagram Export
- **PNG** — high-resolution image with transparent background
- **JPG** — high-resolution image with white background
- **PDF** — single-page A4 document, auto landscape/portrait based on diagram aspect ratio
- **HTML** — self-contained interactive viewer (loads Cytoscape.js from CDN), supports pan/zoom, node click to show SQL/DDL in a modal with syntax highlighting and copy-to-clipboard
- **JSON** — Cytoscape.js native format (`.cyjs`), importable into Cytoscape Desktop or Cytoscape.js applications

### Step Number Automation
- Auto-inferred from CALL relationships in DDL (sqlglot parsing)
- Auto-inferred from table dependency chaining (A writes → B reads = B runs after A)
- Pulled from Airflow DAG task dependencies via REST API *(Phase 3)*
- Pulled from Informatica workflow/session metadata via API *(Phase 3)*
- Parallel branches get same number with letter suffix (③a, ③b) *(Phase 3)*
- User can drag-reorder or manually assign step numbers where inference fails *(Phase 4)*
- Unresolved order flagged visually (dashed border, "?" badge) *(Phase 4)*

---

## Technology Stack

### Frontend
- **React** + **TypeScript** — component framework
- **Vite** — dev server and production build
- **Cytoscape.js** — graph rendering engine
- **cytoscape-dagre** — automatic hierarchical layout (dagre layout extension)
- **jsPDF** — PDF export generation
- **Tailwind CSS** — styling
- Pre-built `dist/` committed to repo (users need no Node.js)

### Backend
- **FastAPI** — Python API server, also serves pre-built React static files via `StaticFiles`
- **uvicorn** — ASGI server
- **sqlglot** — Teradata SQL parser, extracts table references, DML types, CALL statements, CREATE VOLATILE TABLE, operation order
- **teradatasql** — Teradata Python driver
- **python-dotenv** — credential loading from `.env`
- **httpx** — async HTTP client for Alation and Airflow REST APIs *(Phase 2/3)*

### Data Sources
| Source | What it provides | How accessed |
|---|---|---|
| Teradata `SHOW TABLE/VIEW/PROCEDURE/MACRO` | DDL source text | teradatasql driver |
| Teradata `DBC.DatabasesV` / `DBC.TablesV` / `DBC.ColumnsV` / `DBC.RoutinesV` | Object lists, columns, parameters | teradatasql driver |
| Airflow REST API | DAG task dependencies, execution order *(Phase 3)* | httpx → `/api/v1/dags/{dag_id}/tasks` |
| Informatica PowerCenter / IDMC | Workflow/session execution order *(Phase 3)* | httpx → REST or SOAP API |
| Alation REST API | Table metadata, descriptions, stewardship, trust flags, deep-links *(Phase 2)* | httpx → Alation v1/v2 API |

### Graph Data Model (Cytoscape JSON)

4-column left-to-right layout: Procedure → Input Tables → SQL Steps → Output Tables / CALL targets

```json
{
  "nodes": [
    { "data": { "id": "proc_name", "label": "Procedure", "type": "proc", "detail": {"parameters": [], "ddl": "..."} }},
    { "data": { "id": "proc__step_1", "label": "[1] INSERT / SELECT\nL#42", "type": "step", "detail": {"step": 1, "sql": "...", "line": 42} }},
    { "data": { "id": "db.table_name", "label": "Table", "type": "table", "detail": {} }},
    { "data": { "id": "vt_temp", "label": "vt_temp", "type": "volatile", "detail": {} }},
    { "data": { "id": "caller", "label": "Caller", "type": "caller", "detail": {} }}
  ],
  "edges": [
    { "data": { "source": "orders", "target": "proc__step_1", "type": "read",  "step": "[1]", "label": "SELECT" }},
    { "data": { "source": "proc__step_1", "target": "fact", "type": "write", "step": "[1]", "label": "INSERT" }},
    { "data": { "source": "proc__step_2", "target": "sp_notify", "type": "call", "step": "[2]", "label": "CALL" }}
  ]
}
```

Node types: `proc`, `macro`, `step`, `table`, `volatile`, `caller`
Edge types: `read` (green), `write` (purple), `call` (gray dashed)
Hidden scaffold edges enforce dagre column ordering

---

## Repository Structure

```
procviz/
├── start.sh                  # Mac/Linux launcher
├── start.bat                 # Windows launcher
├── install.sh                # one-liner install script (curl | sh)
├── install.ps1               # one-liner install script (PowerShell)
├── pyproject.toml            # uv-compatible project definition
├── uv.lock                   # locked dependency versions
├── .env.example              # credential template
├── .gitignore
├── README.md
├── app.py                    # FastAPI entry point, serves static + API routes
├── api/
│   ├── __init__.py
│   └── routes.py             # All route handlers
├── connectors/
│   ├── __init__.py
│   └── teradata.py           # teradatasql connection, DBC/SHOW queries
├── parsers/
│   ├── __init__.py
│   └── sql_parser.py         # sqlglot extraction: tables, DML, CALLs, macros, volatile tables
├── graph/
│   ├── __init__.py
│   └── builder.py            # Cytoscape JSON assembly (4-column layout)
├── models/
│   ├── __init__.py
│   └── schemas.py            # Pydantic models (parser, connector, API response)
├── tests/
│   ├── test_schemas.py
│   ├── test_sql_parser.py
│   ├── test_graph_builder.py
│   └── test_routes.py
└── frontend/
    ├── src/
    │   ├── App.tsx                # Root layout — sidebar | diagram | export | modal
    │   ├── main.tsx
    │   ├── api/client.ts          # Fetch wrapper for backend API
    │   ├── hooks/
    │   │   ├── useDatabases.ts
    │   │   ├── useObjects.ts
    │   │   └── useDataflow.ts
    │   ├── components/
    │   │   ├── TreeSidebar.tsx     # Database → Object Type → Object tree with filters
    │   │   ├── DiagramView.tsx     # Cytoscape.js canvas + dagre layout (forwardRef, visibility)
    │   │   ├── DetailModal.tsx     # Resizable/draggable modal with SQL syntax highlighting
    │   │   ├── ExportMenu.tsx      # Export dropdown: PNG, JPG, PDF, HTML, JSON
    │   │   ├── Legend.tsx          # Visibility checkboxes for all node/edge types
    │   │   └── DetailPanel.tsx     # (legacy, unused after DetailModal replacement)
    │   ├── types/graph.ts
    │   └── styles/index.css
    ├── dist/                      # Pre-built React app (committed to repo)
    └── package.json               # Dependencies: cytoscape, jspdf, react
```

---

## Installation & Launch

### One-liner install (Mac/Linux)
```bash
curl -fsSL https://raw.githubusercontent.com/jxhuang-godaddy/procviz/main/install.sh | sh
```

### One-liner install (Windows PowerShell)
```powershell
irm https://raw.githubusercontent.com/jxhuang-godaddy/procviz/main/install.ps1 | iex
```

### What the install script does
1. Installs `uv` (Python package manager — handles Python version + virtualenv automatically)
2. Clones the repo to `~/procviz`
3. Runs `uv sync` (installs Python + all dependencies)
4. Prompts for credentials interactively, writes `.env`
5. Launches the app and opens browser at `http://localhost:8000`

### Subsequent launches
```bash
cd ~/procviz && uv run app.py
# or if script entry point configured:
uv run procviz
```

### Update
```bash
cd ~/procviz && git pull && uv run app.py
```

---

## Credentials (`.env`)

```bash
# Teradata
TD_HOST=your-teradata-host
TD_USER=your-username
TD_PASSWORD=your-password
TD_DATABASE=your-default-database

# Alation
ALATION_URL=https://your-alation-instance.com
ALATION_TOKEN=your-api-token

# Orchestrator (airflow or informatica)
ORCHESTRATOR=airflow

# Airflow (if ORCHESTRATOR=airflow)
AIRFLOW_URL=https://your-airflow-instance.com
AIRFLOW_USER=your-airflow-user
AIRFLOW_PASSWORD=your-airflow-password

# Informatica (if ORCHESTRATOR=informatica)
INFA_URL=https://your-informatica-instance.com
INFA_USER=your-infa-user
INFA_PASSWORD=your-infa-password
```

---

## `pyproject.toml`

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

[dependency-groups]
dev = [
    "pytest",
    "httpx",
]

[project.scripts]
procviz = "app:main"

[tool.ruff]
line-length = 100

[tool.pytest.ini_options]
testpaths = ["tests"]
```

## Frontend Dependencies (`package.json`)

```
cytoscape, cytoscape-dagre — graph rendering
jspdf — PDF export
react, react-dom — UI framework
```

---

## API Endpoints (FastAPI)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/databases` | List accessible database names |
| `GET` | `/api/databases/{db}/object-types` | Returns `["procedure", "macro", "table", "view"]` |
| `GET` | `/api/databases/{db}/{object_type}` | List objects of a given type in a database |
| `GET` | `/api/databases/{db}/{object_type}/{name}/dataflow` | Cytoscape JSON for data flow (procedures/macros) or reverse-lookup (tables/views) |
| `GET` | `/ddl/{db}/{name}` | Raw DDL text for any database object |
| `GET` | `/` | Serves pre-built React frontend |

---

## Graph Builder Logic (`graph/builder.py`)

### Single procedure / macro
1. Retrieve DDL via `SHOW PROCEDURE/MACRO {db}.{name}`
2. Detect DDL type: procedure (`BEGIN...END`) or macro (`AS (...)`)
3. Strip leading comments (`--`, `/* */`) before type detection
4. Extract body (with byte offset for line number tracking) and split into individual DML statements with character offsets
5. Parse each DML with `sqlglot` (Teradata dialect) → extract SELECT/INSERT/UPDATE/DELETE/MERGE/CREATE targets, CALL statements
6. Compute source line number for each step from character offset within the DDL
7. Detect `CREATE VOLATILE TABLE` via `exp.VolatileProperty` → track in `volatile_tables` set
8. Build 4-column dagre layout: Procedure → Input Tables → SQL Steps → Output Tables / CALL targets
9. Step labels include source line number: `[1] INSERT / SELECT\nL#42`
10. Case-insensitive deduplication of table names
11. Return Cytoscape JSON with step SQL, line numbers, DDL, and parameters in node detail

### View data flow
1. Retrieve DDL via `SHOW VIEW {db}.{name}`
2. Parse with sqlglot → extract CREATE target (the view) and SELECT source tables
3. Build 3-column layout: Source Tables → CREATE VIEW step → View node
4. Enrich view node with column metadata from `DBC.ColumnsV`

### Table lineage (reverse lookup)
1. Parse all procedures/macros in the database (cached in-memory along with DDL text)
2. Find all references to the target table (case-insensitive matching)
3. Build graph: writers (left) → table (center) → readers (right)
4. Procedure nodes include DDL in their detail so clicking shows source code
5. Enrich center node with column metadata from `DBC.ColumnsV`

### Multi-procedure *(Phase 3)*
1. For each procedure, run single-procedure parsing
2. Query Airflow or Informatica API for DAG/workflow task dependencies
3. Merge: map DAG tasks → procedure nodes, DAG edges → call-order edges
4. Assign step numbers from DAG rank (parallel tasks get same rank + letter suffix)
5. Detect shared tables (written by >1 procedure) → flag on node
6. Return merged Cytoscape JSON

---

## Visual Design

### Node colors
| Type | Color | Style |
|---|---|---|
| Procedure / Macro | Purple `#534AB7` | Bold, border `#3B2D8F` |
| SQL Step | Blue `#3B82F6` | Border `#2563EB` |
| Table / View | Teal `#0F6E56` | — |
| Volatile Table | Amber `#D97706` | Dashed border `#B45309` |
| Called Procedure | Gray `#888888` | — |

### Edge colors
| Type | Color | Style |
|---|---|---|
| Read (SELECT) | Green `#1D9E75` | Solid |
| Write (INSERT/UPDATE/DELETE/CREATE/MERGE) | Purple `#534AB7` | Solid |
| Call | Gray `#94A3B8` | Dashed |
| Execution Flow (scaffold) | — | Hidden (affects layout only) |

### Layout
- Data flow diagrams: `dagre` with `rankDir: LR` (left to right), 4-column layout
- View diagrams: 3-column layout (source tables → CREATE VIEW step → view)
- Table diagrams: 3-column layout (writers → table → readers)
- Nodes auto-sized to fit label text (`width: "label"` with padding)
- Initial zoom clamped to minimum 0.45 so labels stay readable on large diagrams
- All node labels rendered at 12px font for consistent sizing

---

## Build Order (Suggested Phases)

### Phase 1 — Core (MVP) ✅ Shipped
- FastAPI backend with three-level navigation API (`/api/databases/{db}/{type}/{name}/dataflow`)
- Teradata connector using `SHOW TABLE/VIEW/PROCEDURE/MACRO` for DDL retrieval
- sqlglot parsing for SELECT/INSERT/UPDATE/DELETE/MERGE/CREATE table extraction
- Procedure and macro body extraction (BEGIN...END and AS (...) patterns)
- Volatile table detection and distinct visual treatment
- Leading comment stripping, line comment handling, CR/LF normalization
- Case-insensitive table name deduplication
- Source line numbers on SQL step nodes for easy DDL location
- React + Cytoscape.js frontend with 4-column dagre layout
- View data flow diagrams: source tables → CREATE VIEW step → view
- Table lineage diagrams: writers → table → readers, with DDL on procedure nodes
- Resizable/draggable detail modal with SQL syntax highlighting and copy-to-clipboard
- Diagram export: PNG, JPG, PDF, HTML (interactive viewer), JSON (Cytoscape.js format)
- Visibility toggles for all node types and edge types with auto-hiding of orphaned nodes
- Database filter and per-object-type filter in navigation sidebar
- Consistent 12px font sizing with minimum zoom clamping for large diagrams
- `.env` credential loading
- `install.sh` / `start.sh`

### Phase 2 — Control flow + Alation enrichment
- sqlglot control flow parsing (IF/ELSE, loops, SIGNAL, BT/ET)
- `/api/procedures/{name}/flowchart` endpoint
- Control flow view toggle in frontend
- Alation API connector for table node enrichment
- Detail panel with Alation deep-links on node click

### Phase 3 — Multi-procedure + orchestration
- Airflow REST API connector (DAG task dependencies)
- `/api/graph/multi` endpoint
- Multi-procedure graph view in frontend
- Parallel branch rendering
- Informatica connector (after Airflow validated)

### Phase 4 — UX polish
- Shared table highlighting
- Impact analysis (click table → highlight all touching procedures)
- Minimap extension
- Inline step number override
- First-run browser wizard (alternative to `.env` editing)

---

## Key Design Decisions & Rationale

- **Cytoscape.js over Mermaid/Graphviz/PlantUML** — non-technical users need a browser-based interactive experience with no local tooling; Cytoscape.js with dagre handles variable-complexity graphs automatically and supports full edge color control
- **uv over pip/conda** — manages Python version + virtualenv in one tool, enabling true one-liner install with no prerequisites
- **Pre-built React dist committed to repo** — eliminates Node.js as a user prerequisite
- **FastAPI serves static files** — single process, single port, no separate web server needed for local deployment
- **sqlglot for parsing** — best current Teradata dialect support, AST-based so robust against formatting variation in `DBC.TextTbl` output
- **Airflow before Informatica** — cleaner REST API, easier to validate the orchestration integration concept before tackling Informatica's API complexity
- **Local-first deployment** — target users are technical-adjacent (data stewards, governance analysts); laptop install via one-liner is appropriate; hosted deployment is a future phase using the same codebase

---

## Environment Notes

- Teradata instances: existing on-network / VPN access required
- Alation instance: existing on-network / VPN access required
- Airflow: existing on-network / VPN access required
- No cloud infrastructure required for local deployment
- Target OS: Mac, Linux, Windows (PowerShell)
- Minimum Python: 3.10 (managed by uv, no manual install needed)