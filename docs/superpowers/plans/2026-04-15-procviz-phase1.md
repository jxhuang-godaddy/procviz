# ProcViz Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the ProcViz MVP — a FastAPI + React app that connects to Teradata, parses stored procedure/macro DDL with sqlglot, and renders interactive data flow diagrams with Cytoscape.js.

**Architecture:** Layered backend (routes → connectors → parsers → graph builder) with Pydantic models at every boundary. React + TypeScript frontend with three-panel layout: tree sidebar, Cytoscape diagram, detail panel.

**Tech Stack:** Python 3.10+ (FastAPI, uvicorn, teradatasql, sqlglot, python-dotenv), React 18, TypeScript, Vite, Cytoscape.js, cytoscape-dagre, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-15-procviz-phase1-design.md`

---

## File Map

### Backend (Python)

| File | Responsibility |
|---|---|
| `app.py` | FastAPI app creation, mount static files, uvicorn entry point |
| `api/__init__.py` | Empty |
| `api/routes.py` | All route handlers — delegates to connectors/parsers/builders |
| `connectors/__init__.py` | Empty |
| `connectors/teradata.py` | `teradatasql` connection management, DBC query functions |
| `parsers/__init__.py` | Empty |
| `parsers/sql_parser.py` | sqlglot-based DDL parsing — pure functions, no DB dependency |
| `graph/__init__.py` | Empty |
| `graph/builder.py` | Cytoscape JSON assembly from parsed data |
| `models/__init__.py` | Empty |
| `models/schemas.py` | All Pydantic models (parser output, connector output, API response) |

### Frontend (TypeScript/React)

| File | Responsibility |
|---|---|
| `frontend/index.html` | Vite entry HTML |
| `frontend/src/main.tsx` | React DOM mount |
| `frontend/src/App.tsx` | Root layout — sidebar, diagram, detail panel |
| `frontend/src/types/graph.ts` | TypeScript types for Cytoscape data model |
| `frontend/src/api/client.ts` | Fetch wrapper for backend API |
| `frontend/src/hooks/useDatabases.ts` | Fetch `/api/databases` |
| `frontend/src/hooks/useObjects.ts` | Fetch `/api/databases/{db}/{type}` |
| `frontend/src/hooks/useDataflow.ts` | Fetch `/api/.../dataflow` |
| `frontend/src/components/TreeSidebar.tsx` | Three-level tree: Database → Object Type → Object |
| `frontend/src/components/DiagramView.tsx` | Cytoscape.js canvas + dagre layout |
| `frontend/src/components/DetailPanel.tsx` | Node/edge detail on click |
| `frontend/src/components/Legend.tsx` | Color legend for node/edge types |
| `frontend/src/styles/index.css` | Tailwind imports + custom styles |

### Config & Scripts

| File | Responsibility |
|---|---|
| `pyproject.toml` | uv project definition, dependencies, script entry point |
| `.env.example` | Credential template (TD_HOST, TD_PORT, TD_USER, TD_PASSWORD) |
| `.gitignore` | Excludes .env, node_modules, __pycache__, .superpowers |
| `start.sh` | Mac/Linux launcher |
| `start.bat` | Windows launcher |
| `install.sh` | One-liner install (Mac/Linux) |
| `install.ps1` | One-liner install (Windows) |
| `README.md` | Setup and usage instructions |

### Tests

| File | Responsibility |
|---|---|
| `tests/__init__.py` | Empty |
| `tests/test_schemas.py` | Pydantic model validation tests |
| `tests/test_sql_parser.py` | sqlglot parser tests — pure functions, no DB |
| `tests/test_graph_builder.py` | Cytoscape JSON assembly tests |
| `tests/test_routes.py` | FastAPI route integration tests (TestClient, mocked connector) |

---

## Task 1: Project Scaffolding

**Files:**
- Create: `pyproject.toml`, `.env.example`, `.gitignore`, `app.py`
- Create: `api/__init__.py`, `connectors/__init__.py`, `parsers/__init__.py`, `graph/__init__.py`, `models/__init__.py`, `tests/__init__.py`

- [ ] **Step 1: Create `pyproject.toml`**

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

- [ ] **Step 2: Create `.env.example`**

```bash
TD_HOST=your-teradata-host
TD_PORT=1025
TD_USER=your-username
TD_PASSWORD=your-password
```

- [ ] **Step 3: Update `.gitignore`**

Append to existing `.gitignore`:

```
__pycache__/
*.pyc
node_modules/
frontend/dist/
.env
.superpowers/
.DS_Store
```

- [ ] **Step 4: Create empty `__init__.py` files**

Create empty files: `api/__init__.py`, `connectors/__init__.py`, `parsers/__init__.py`, `graph/__init__.py`, `models/__init__.py`, `tests/__init__.py`

- [ ] **Step 5: Create minimal `app.py`**

```python
from fastapi import FastAPI

app = FastAPI(title="ProcViz", version="0.1.0")


@app.get("/api/health")
def health():
    return {"status": "ok"}


def main():
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: Run `uv sync` and verify server starts**

Run: `uv sync && uv run python app.py`
Expected: Server starts on `http://127.0.0.1:8000`, health endpoint returns `{"status": "ok"}`
Kill the server after verifying.

- [ ] **Step 7: Commit**

```bash
git add pyproject.toml .env.example .gitignore app.py api/ connectors/ parsers/ graph/ models/ tests/
git commit -m "feat: scaffold project structure with FastAPI skeleton"
```

---

## Task 2: Pydantic Models

**Files:**
- Create: `models/schemas.py`
- Create: `tests/test_schemas.py`

- [ ] **Step 1: Write tests for all Pydantic models**

Create `tests/test_schemas.py`:

```python
from models.schemas import (
    TableRef,
    CallRef,
    DataFlowResult,
    DatabaseObject,
    ColumnInfo,
    ParameterInfo,
    CytoscapeNode,
    CytoscapeEdge,
    GraphResponse,
)


def test_table_ref():
    ref = TableRef(name="sales_db.orders", operation="SELECT", step=1)
    assert ref.name == "sales_db.orders"
    assert ref.operation == "SELECT"
    assert ref.step == 1


def test_call_ref():
    ref = CallRef(target="sp_notify", step=3)
    assert ref.target == "sp_notify"
    assert ref.step == 3


def test_dataflow_result_empty():
    result = DataFlowResult(table_refs=[], call_refs=[], errors=[])
    assert result.table_refs == []
    assert result.call_refs == []
    assert result.errors == []


def test_dataflow_result_with_data():
    result = DataFlowResult(
        table_refs=[TableRef(name="db.t1", operation="INSERT", step=1)],
        call_refs=[CallRef(target="sp_other", step=2)],
        errors=["warning: unsupported construct"],
    )
    assert len(result.table_refs) == 1
    assert len(result.call_refs) == 1
    assert len(result.errors) == 1


def test_database_object():
    obj = DatabaseObject(name="sp_load", object_type="procedure", database="sales_db")
    assert obj.name == "sp_load"
    assert obj.object_type == "procedure"


def test_column_info():
    col = ColumnInfo(name="order_id", data_type="INTEGER", nullable=False)
    assert col.name == "order_id"
    assert col.nullable is False


def test_parameter_info():
    param = ParameterInfo(name="p_date", data_type="DATE", direction="IN")
    assert param.direction == "IN"


def test_cytoscape_node():
    node = CytoscapeNode(
        id="sales_db.sp_load",
        label="sp_load",
        type="proc",
        detail={"parameters": []},
    )
    assert node.type == "proc"


def test_cytoscape_edge():
    edge = CytoscapeEdge(
        source="sales_db.orders",
        target="sales_db.sp_load",
        type="read",
        step="①",
        label="① SELECT",
    )
    assert edge.type == "read"


def test_graph_response():
    resp = GraphResponse(
        nodes=[CytoscapeNode(id="t1", label="t1", type="table", detail={})],
        edges=[CytoscapeEdge(source="t1", target="p1", type="read", step="①", label="① SELECT")],
    )
    assert len(resp.nodes) == 1
    assert len(resp.edges) == 1
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `uv run pytest tests/test_schemas.py -v`
Expected: ImportError — `models.schemas` does not exist yet.

- [ ] **Step 3: Implement `models/schemas.py`**

```python
from pydantic import BaseModel


# --- Parser output ---

class TableRef(BaseModel):
    name: str
    operation: str
    step: int


class CallRef(BaseModel):
    target: str
    step: int


class DataFlowResult(BaseModel):
    table_refs: list[TableRef]
    call_refs: list[CallRef]
    errors: list[str]


# --- Connector output ---

class DatabaseObject(BaseModel):
    name: str
    object_type: str
    database: str


class ColumnInfo(BaseModel):
    name: str
    data_type: str
    nullable: bool


class ParameterInfo(BaseModel):
    name: str
    data_type: str
    direction: str


# --- API response (Cytoscape JSON) ---

class CytoscapeNode(BaseModel):
    id: str
    label: str
    type: str
    detail: dict


class CytoscapeEdge(BaseModel):
    source: str
    target: str
    type: str
    step: str
    label: str


class GraphResponse(BaseModel):
    nodes: list[CytoscapeNode]
    edges: list[CytoscapeEdge]
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `uv run pytest tests/test_schemas.py -v`
Expected: All 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add models/schemas.py tests/test_schemas.py
git commit -m "feat: add Pydantic models for parser, connector, and API response"
```

---

## Task 3: SQL Parser

**Files:**
- Create: `parsers/sql_parser.py`
- Create: `tests/test_sql_parser.py`

This is the core of the project. Pure functions, no DB dependency — fully testable with DDL strings.

- [ ] **Step 1: Write parser tests**

Create `tests/test_sql_parser.py`:

```python
from models.schemas import DataFlowResult
from parsers.sql_parser import parse_dataflow


def test_simple_select():
    ddl = "SELECT * FROM sales_db.orders;"
    result = parse_dataflow(ddl)
    assert isinstance(result, DataFlowResult)
    assert len(result.table_refs) == 1
    assert result.table_refs[0].name == "sales_db.orders"
    assert result.table_refs[0].operation == "SELECT"
    assert result.table_refs[0].step == 1


def test_insert_select():
    ddl = """
    INSERT INTO sales_db.orders_fact
    SELECT o.*, c.region
    FROM sales_db.orders_stg o
    JOIN sales_db.customer_dim c ON o.cust_id = c.cust_id;
    """
    result = parse_dataflow(ddl)
    ops = {ref.name: ref.operation for ref in result.table_refs}
    assert ops["sales_db.orders_fact"] == "INSERT"
    assert ops["sales_db.orders_stg"] == "SELECT"
    assert ops["sales_db.customer_dim"] == "SELECT"


def test_update():
    ddl = "UPDATE sales_db.orders SET status = 'done' WHERE id = 1;"
    result = parse_dataflow(ddl)
    assert len(result.table_refs) == 1
    assert result.table_refs[0].operation == "UPDATE"


def test_delete():
    ddl = "DELETE FROM sales_db.orders_stg WHERE processed = 1;"
    result = parse_dataflow(ddl)
    assert len(result.table_refs) == 1
    assert result.table_refs[0].operation == "DELETE"


def test_merge():
    ddl = """
    MERGE INTO sales_db.orders_fact tgt
    USING sales_db.orders_stg src ON tgt.id = src.id
    WHEN MATCHED THEN UPDATE SET tgt.amount = src.amount
    WHEN NOT MATCHED THEN INSERT (id, amount) VALUES (src.id, src.amount);
    """
    result = parse_dataflow(ddl)
    ops = {ref.name: ref.operation for ref in result.table_refs}
    assert ops["sales_db.orders_fact"] == "MERGE"
    assert ops["sales_db.orders_stg"] == "SELECT"


def test_multiple_statements_step_numbers():
    ddl = """
    SELECT * FROM db.t1;
    INSERT INTO db.t2 SELECT * FROM db.t3;
    UPDATE db.t4 SET x = 1;
    """
    result = parse_dataflow(ddl)
    steps = {ref.name: ref.step for ref in result.table_refs}
    assert steps["db.t1"] == 1
    assert steps["db.t2"] == 2
    assert steps["db.t3"] == 2
    assert steps["db.t4"] == 3


def test_call_statement():
    ddl = "CALL sales_db.sp_notify('done');"
    result = parse_dataflow(ddl)
    assert len(result.call_refs) == 1
    assert result.call_refs[0].target == "sales_db.sp_notify"


def test_procedure_body():
    ddl = """
    REPLACE PROCEDURE sales_db.sp_load(IN p_date DATE)
    BEGIN
        INSERT INTO sales_db.orders_fact
        SELECT * FROM sales_db.orders_stg WHERE order_date = p_date;

        DELETE FROM sales_db.orders_stg WHERE order_date = p_date;

        CALL sales_db.sp_notify('load complete');
    END;
    """
    result = parse_dataflow(ddl)
    ops = {ref.name: ref.operation for ref in result.table_refs}
    assert "sales_db.orders_fact" in ops
    assert "sales_db.orders_stg" in ops
    assert len(result.call_refs) == 1


def test_cte():
    ddl = """
    WITH recent AS (SELECT * FROM db.orders WHERE dt > CURRENT_DATE - 7)
    INSERT INTO db.summary SELECT count(*) FROM recent;
    """
    result = parse_dataflow(ddl)
    names = {ref.name for ref in result.table_refs}
    assert "db.orders" in names
    assert "db.summary" in names
    # CTE alias "recent" should NOT appear as a table ref
    assert "recent" not in names


def test_unparseable_ddl_returns_errors():
    ddl = "THIS IS NOT VALID SQL AT ALL !!!"
    result = parse_dataflow(ddl)
    assert isinstance(result, DataFlowResult)
    assert len(result.errors) > 0


def test_empty_ddl():
    result = parse_dataflow("")
    assert result.table_refs == []
    assert result.call_refs == []
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `uv run pytest tests/test_sql_parser.py -v`
Expected: ImportError — `parsers.sql_parser` does not exist yet.

- [ ] **Step 3: Implement `parsers/sql_parser.py`**

```python
from __future__ import annotations

import sqlglot
from sqlglot import exp
from sqlglot.errors import ErrorLevel

from models.schemas import CallRef, DataFlowResult, TableRef


def parse_dataflow(ddl: str) -> DataFlowResult:
    """Parse DDL string and extract data flow: table references and CALL statements."""
    if not ddl or not ddl.strip():
        return DataFlowResult(table_refs=[], call_refs=[], errors=[])

    errors: list[str] = []
    try:
        statements = sqlglot.parse(ddl, dialect="teradata", error_level=ErrorLevel.WARN)
    except Exception as e:
        return DataFlowResult(table_refs=[], call_refs=[], errors=[str(e)])

    table_refs: list[TableRef] = []
    call_refs: list[CallRef] = []
    step = 0

    for statement in statements:
        if statement is None:
            continue

        # Unwrap procedure/macro body — find DML inside CREATE/REPLACE PROCEDURE
        body_statements = _unwrap_body(statement)

        for stmt in body_statements:
            dml_type = _classify_dml(stmt)
            if dml_type:
                step += 1
                table_refs.extend(_extract_table_refs(stmt, dml_type, step))
            elif isinstance(stmt, exp.Command) and _is_call(stmt):
                step += 1
                target = _extract_call_target(stmt)
                if target:
                    call_refs.append(CallRef(target=target, step=step))

    return DataFlowResult(table_refs=table_refs, call_refs=call_refs, errors=errors)


def _unwrap_body(statement: exp.Expression) -> list[exp.Expression]:
    """If statement is a CREATE/REPLACE PROCEDURE or MACRO, extract inner statements."""
    # Look for procedure/macro definitions that contain a body
    body_stmts = list(statement.find_all(exp.Insert, exp.Select, exp.Update, exp.Delete, exp.Merge, exp.Command))
    if body_stmts:
        # Deduplicate: a SELECT inside an INSERT will be found twice
        # Return only top-level DML statements
        return _top_level_dml(statement)
    return [statement]


def _top_level_dml(root: exp.Expression) -> list[exp.Expression]:
    """Walk the AST and collect top-level DML + CALL commands, not nested subqueries."""
    results: list[exp.Expression] = []
    dml_types = (exp.Insert, exp.Update, exp.Delete, exp.Merge)

    for node in root.walk():
        if isinstance(node, dml_types):
            # Skip if this node is nested inside another DML (e.g. subquery in INSERT)
            parent_dml = node.find_ancestor(*dml_types)
            if parent_dml is None:
                results.append(node)
        elif isinstance(node, exp.Select):
            # Only standalone SELECTs — not part of INSERT...SELECT, MERGE USING, etc.
            parent_dml = node.find_ancestor(*dml_types)
            if parent_dml is None:
                results.append(node)
        elif isinstance(node, exp.Command) and _is_call(node):
            results.append(node)

    return results if results else [root]


def _classify_dml(stmt: exp.Expression) -> str | None:
    """Return the DML type string or None if not a DML statement."""
    if isinstance(stmt, exp.Insert):
        return "INSERT"
    if isinstance(stmt, exp.Update):
        return "UPDATE"
    if isinstance(stmt, exp.Delete):
        return "DELETE"
    if isinstance(stmt, exp.Merge):
        return "MERGE"
    if isinstance(stmt, exp.Select):
        return "SELECT"
    return None


def _extract_table_refs(stmt: exp.Expression, dml_type: str, step: int) -> list[TableRef]:
    """Extract table references from a DML statement."""
    refs: list[TableRef] = []
    cte_names = _collect_cte_names(stmt)

    if dml_type == "INSERT":
        # Target table
        table = stmt.find(exp.Table)
        if table:
            name = _table_name(table)
            if name and name not in cte_names:
                refs.append(TableRef(name=name, operation="INSERT", step=step))
        # Source tables from the SELECT part
        select = stmt.find(exp.Select)
        if select:
            for tbl in select.find_all(exp.Table):
                name = _table_name(tbl)
                if name and name not in cte_names and not _already_has(refs, name):
                    refs.append(TableRef(name=name, operation="SELECT", step=step))

    elif dml_type == "UPDATE":
        for tbl in stmt.find_all(exp.Table):
            name = _table_name(tbl)
            if name and name not in cte_names:
                refs.append(TableRef(name=name, operation="UPDATE", step=step))

    elif dml_type == "DELETE":
        for tbl in stmt.find_all(exp.Table):
            name = _table_name(tbl)
            if name and name not in cte_names:
                refs.append(TableRef(name=name, operation="DELETE", step=step))

    elif dml_type == "MERGE":
        # Target is the MERGE INTO table
        table = stmt.find(exp.Table)
        if table:
            name = _table_name(table)
            if name and name not in cte_names:
                refs.append(TableRef(name=name, operation="MERGE", step=step))
        # Source is in the USING clause — find remaining tables
        for tbl in stmt.find_all(exp.Table):
            name = _table_name(tbl)
            if name and name not in cte_names and not _already_has(refs, name):
                refs.append(TableRef(name=name, operation="SELECT", step=step))

    elif dml_type == "SELECT":
        for tbl in stmt.find_all(exp.Table):
            name = _table_name(tbl)
            if name and name not in cte_names:
                refs.append(TableRef(name=name, operation="SELECT", step=step))

    return refs


def _collect_cte_names(stmt: exp.Expression) -> set[str]:
    """Collect CTE alias names so they aren't treated as table references."""
    names: set[str] = set()
    for cte in stmt.find_all(exp.CTE):
        if cte.alias:
            names.add(cte.alias)
    return names


def _table_name(table: exp.Table) -> str:
    """Build qualified table name from a Table expression."""
    parts = []
    if table.catalog:
        parts.append(table.catalog)
    if table.db:
        parts.append(table.db)
    if table.name:
        parts.append(table.name)
    return ".".join(parts) if parts else ""


def _is_call(cmd: exp.Command) -> bool:
    """Check if a Command node is a CALL statement."""
    return cmd.this and str(cmd.this).upper() == "CALL"


def _extract_call_target(cmd: exp.Command) -> str | None:
    """Extract the procedure name from a CALL command."""
    if cmd.expressions:
        return str(cmd.expressions[0]).split("(")[0].strip()
    return None


def _already_has(refs: list[TableRef], name: str) -> bool:
    return any(r.name == name for r in refs)
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `uv run pytest tests/test_sql_parser.py -v`
Expected: All 12 tests pass. Some edge cases (CTE, MERGE, procedure body) may need iteration — adjust the parser implementation until all tests pass.

- [ ] **Step 5: Commit**

```bash
git add parsers/sql_parser.py tests/test_sql_parser.py
git commit -m "feat: add sqlglot-based SQL parser for data flow extraction"
```

---

## Task 4: Teradata Connector

**Files:**
- Create: `connectors/teradata.py`

No unit tests for this task — it requires a live Teradata connection. We'll verify it works in Task 7 (route integration tests) and Task 10 (manual end-to-end testing).

- [ ] **Step 1: Implement `connectors/teradata.py`**

```python
from __future__ import annotations

import os

import teradatasql
from dotenv import load_dotenv

from models.schemas import ColumnInfo, DatabaseObject, ParameterInfo

load_dotenv()

_connection: teradatasql.TeradataConnection | None = None


def get_connection() -> teradatasql.TeradataConnection:
    """Get or create the Teradata connection (lazy singleton)."""
    global _connection
    if _connection is None:
        _connection = teradatasql.connect(
            host=os.environ["TD_HOST"],
            dbs_port=os.environ.get("TD_PORT", "1025"),
            user=os.environ["TD_USER"],
            password=os.environ["TD_PASSWORD"],
        )
    return _connection


def get_databases() -> list[str]:
    """List accessible database names."""
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            "SELECT TRIM(DatabaseName) FROM DBC.DatabasesV ORDER BY DatabaseName"
        )
        return [row[0] for row in cur.fetchall()]


_OBJECT_TYPE_MAP = {
    "procedure": ("DBC.RoutinesV", "SpecificKind = 'P'"),
    "macro": ("DBC.RoutinesV", "SpecificKind = 'M'"),
    "table": ("DBC.TablesV", "TableKind = 'T'"),
    "view": ("DBC.TablesV", "TableKind = 'V'"),
}


def get_objects(database: str, object_type: str) -> list[DatabaseObject]:
    """List objects of a given type in a database."""
    if object_type not in _OBJECT_TYPE_MAP:
        return []

    view, kind_filter = _OBJECT_TYPE_MAP[object_type]
    name_col = "SpecificName" if "Routines" in view else "TableName"

    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT TRIM({name_col}) FROM {view}"
            f" WHERE DatabaseName = '{database}' AND {kind_filter}"
            f" ORDER BY {name_col}"
        )
        return [
            DatabaseObject(name=row[0], object_type=object_type, database=database)
            for row in cur.fetchall()
        ]


def get_ddl(database: str, name: str) -> str:
    """Get full DDL source text, reassembled from DBC.TextTbl by LineNo."""
    conn = get_connection()
    with conn.cursor() as cur:
        # Try TextTbl first (multi-row, reassemble)
        cur.execute(
            "SELECT TextString FROM DBC.TextTbl"
            f" WHERE DatabaseName = '{database}' AND TableName = '{name}'"
            " ORDER BY LineNo"
        )
        rows = cur.fetchall()
        if rows:
            return "".join(row[0] for row in rows)

        # Fallback to RoutinesV.RequestText
        cur.execute(
            "SELECT RequestText FROM DBC.RoutinesV"
            f" WHERE DatabaseName = '{database}' AND SpecificName = '{name}'"
        )
        row = cur.fetchone()
        return row[0] if row else ""


def get_columns(database: str, table_name: str) -> list[ColumnInfo]:
    """Get column list for a table or view."""
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            "SELECT TRIM(ColumnName), TRIM(ColumnType), Nullable"
            " FROM DBC.ColumnsV"
            f" WHERE DatabaseName = '{database}' AND TableName = '{table_name}'"
            " ORDER BY ColumnId"
        )
        return [
            ColumnInfo(
                name=row[0],
                data_type=row[1],
                nullable=row[2] == "Y",
            )
            for row in cur.fetchall()
        ]


def get_parameters(database: str, proc_name: str) -> list[ParameterInfo]:
    """Get parameter list for a procedure or macro."""
    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            "SELECT TRIM(ParameterName), TRIM(ColumnType), SPParameterDirection"
            " FROM DBC.RoutinesV"
            f" WHERE DatabaseName = '{database}' AND SpecificName = '{proc_name}'"
            " AND ParameterName IS NOT NULL"
            " ORDER BY ParameterNumber"
        )
        direction_map = {"I": "IN", "O": "OUT", "B": "INOUT"}
        return [
            ParameterInfo(
                name=row[0],
                data_type=row[1],
                direction=direction_map.get(row[2], row[2] or "IN"),
            )
            for row in cur.fetchall()
        ]
```

**Note on SQL injection:** The `database`, `name`, and `table_name` parameters come from our own API routes (which get them from DBC views), not from end-user free-text input. Parameterized queries would be safer but `teradatasql` parameter binding with DBC system views can be problematic. For Phase 1 local-only deployment this is acceptable — revisit if the app is ever exposed beyond localhost.

- [ ] **Step 2: Smoke test the connection manually**

Run: `uv run python -c "from connectors.teradata import get_databases; print(get_databases()[:5])"`
Expected: Prints a list of database names from the Teradata instance.

- [ ] **Step 3: Commit**

```bash
git add connectors/teradata.py
git commit -m "feat: add Teradata connector with DBC query functions"
```

---

## Task 5: Graph Builder

**Files:**
- Create: `graph/builder.py`
- Create: `tests/test_graph_builder.py`

- [ ] **Step 1: Write graph builder tests**

Create `tests/test_graph_builder.py`:

```python
from graph.builder import build_dataflow_graph, build_reverse_lookup_graph
from models.schemas import (
    CallRef,
    DataFlowResult,
    GraphResponse,
    TableRef,
)


def test_dataflow_graph_basic():
    dataflow = DataFlowResult(
        table_refs=[
            TableRef(name="db.orders_stg", operation="SELECT", step=1),
            TableRef(name="db.orders_fact", operation="INSERT", step=1),
        ],
        call_refs=[],
        errors=[],
    )
    result = build_dataflow_graph(
        obj_name="sp_load",
        obj_type="procedure",
        dataflow=dataflow,
        detail_data={"parameters": [], "sql_snippets": {}},
    )
    assert isinstance(result, GraphResponse)
    # 1 proc node + 2 table nodes = 3
    assert len(result.nodes) == 3
    # 1 read edge + 1 write edge = 2
    assert len(result.edges) == 2

    node_types = {n.id: n.type for n in result.nodes}
    assert node_types["sp_load"] == "proc"
    assert node_types["db.orders_stg"] == "table"
    assert node_types["db.orders_fact"] == "table"


def test_dataflow_graph_with_call():
    dataflow = DataFlowResult(
        table_refs=[TableRef(name="db.t1", operation="SELECT", step=1)],
        call_refs=[CallRef(target="db.sp_notify", step=2)],
        errors=[],
    )
    result = build_dataflow_graph(
        obj_name="sp_main",
        obj_type="procedure",
        dataflow=dataflow,
        detail_data={"parameters": [], "sql_snippets": {}},
    )
    node_types = {n.id: n.type for n in result.nodes}
    assert node_types["db.sp_notify"] == "caller"
    call_edges = [e for e in result.edges if e.type == "call"]
    assert len(call_edges) == 1


def test_dataflow_graph_step_labels():
    dataflow = DataFlowResult(
        table_refs=[
            TableRef(name="db.t1", operation="SELECT", step=1),
            TableRef(name="db.t2", operation="INSERT", step=2),
        ],
        call_refs=[],
        errors=[],
    )
    result = build_dataflow_graph(
        obj_name="sp_x",
        obj_type="macro",
        dataflow=dataflow,
        detail_data={"parameters": [], "sql_snippets": {}},
    )
    labels = {e.label for e in result.edges}
    assert "① SELECT" in labels
    assert "② INSERT" in labels

    # obj_type should be "macro" on the center node
    center = next(n for n in result.nodes if n.id == "sp_x")
    assert center.type == "macro"


def test_reverse_lookup_graph():
    all_dataflows = {
        "sp_load": DataFlowResult(
            table_refs=[
                TableRef(name="db.orders", operation="SELECT", step=1),
                TableRef(name="db.fact", operation="INSERT", step=2),
            ],
            call_refs=[],
            errors=[],
        ),
        "sp_clean": DataFlowResult(
            table_refs=[
                TableRef(name="db.orders", operation="DELETE", step=1),
            ],
            call_refs=[],
            errors=[],
        ),
        "sp_other": DataFlowResult(
            table_refs=[
                TableRef(name="db.other", operation="SELECT", step=1),
            ],
            call_refs=[],
            errors=[],
        ),
    }
    result = build_reverse_lookup_graph("db.orders", all_dataflows)
    assert isinstance(result, GraphResponse)

    # Center table + 2 procs that reference it (sp_load, sp_clean) = 3
    assert len(result.nodes) == 3
    # sp_load reads, sp_clean deletes = 2 edges
    assert len(result.edges) == 2

    center = next(n for n in result.nodes if n.id == "db.orders")
    assert center.type == "table"


def test_reverse_lookup_no_matches():
    all_dataflows = {
        "sp_x": DataFlowResult(
            table_refs=[TableRef(name="db.other", operation="SELECT", step=1)],
            call_refs=[],
            errors=[],
        ),
    }
    result = build_reverse_lookup_graph("db.missing", all_dataflows)
    # Just the center table node, no edges
    assert len(result.nodes) == 1
    assert len(result.edges) == 0
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `uv run pytest tests/test_graph_builder.py -v`
Expected: ImportError — `graph.builder` does not exist yet.

- [ ] **Step 3: Implement `graph/builder.py`**

```python
from __future__ import annotations

from models.schemas import (
    CallRef,
    CytoscapeEdge,
    CytoscapeNode,
    DataFlowResult,
    GraphResponse,
    TableRef,
)

CIRCLED_DIGITS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳"


def _step_label(step: int) -> str:
    """Convert integer step to circled digit string."""
    if 1 <= step <= len(CIRCLED_DIGITS):
        return CIRCLED_DIGITS[step - 1]
    return str(step)


def _edge_type_for_operation(operation: str) -> str:
    """Map DML operation to edge type."""
    if operation == "SELECT":
        return "read"
    return "write"


def build_dataflow_graph(
    obj_name: str,
    obj_type: str,
    dataflow: DataFlowResult,
    detail_data: dict,
) -> GraphResponse:
    """Build Cytoscape JSON for a procedure/macro data flow diagram."""
    nodes: list[CytoscapeNode] = []
    edges: list[CytoscapeEdge] = []
    seen_nodes: set[str] = set()

    # Center node — the procedure or macro
    nodes.append(
        CytoscapeNode(
            id=obj_name,
            label=obj_name.split(".")[-1],
            type=obj_type if obj_type in ("proc", "macro") else "proc",
            detail=detail_data,
        )
    )
    seen_nodes.add(obj_name)

    # Table nodes and edges
    for ref in dataflow.table_refs:
        if ref.name not in seen_nodes:
            nodes.append(
                CytoscapeNode(
                    id=ref.name,
                    label=ref.name.split(".")[-1],
                    type="table",
                    detail={},
                )
            )
            seen_nodes.add(ref.name)

        edge_type = _edge_type_for_operation(ref.operation)
        step_str = _step_label(ref.step)

        if edge_type == "read":
            source, target = ref.name, obj_name
        else:
            source, target = obj_name, ref.name

        edges.append(
            CytoscapeEdge(
                source=source,
                target=target,
                type=edge_type,
                step=step_str,
                label=f"{step_str} {ref.operation}",
            )
        )

    # CALL nodes and edges
    for call in dataflow.call_refs:
        if call.target not in seen_nodes:
            nodes.append(
                CytoscapeNode(
                    id=call.target,
                    label=call.target.split(".")[-1],
                    type="caller",
                    detail={},
                )
            )
            seen_nodes.add(call.target)

        step_str = _step_label(call.step)
        edges.append(
            CytoscapeEdge(
                source=obj_name,
                target=call.target,
                type="call",
                step=step_str,
                label=f"{step_str} CALL",
            )
        )

    return GraphResponse(nodes=nodes, edges=edges)


def build_reverse_lookup_graph(
    table_name: str,
    all_dataflows: dict[str, DataFlowResult],
) -> GraphResponse:
    """Build Cytoscape JSON for a table's reverse-lookup diagram."""
    nodes: list[CytoscapeNode] = []
    edges: list[CytoscapeEdge] = []
    seen_nodes: set[str] = set()

    # Center node — the table
    nodes.append(
        CytoscapeNode(
            id=table_name,
            label=table_name.split(".")[-1],
            type="table",
            detail={},
        )
    )
    seen_nodes.add(table_name)

    for proc_name, dataflow in all_dataflows.items():
        matching_refs = [r for r in dataflow.table_refs if r.name == table_name]
        if not matching_refs:
            continue

        if proc_name not in seen_nodes:
            nodes.append(
                CytoscapeNode(
                    id=proc_name,
                    label=proc_name.split(".")[-1],
                    type="proc",
                    detail={},
                )
            )
            seen_nodes.add(proc_name)

        for ref in matching_refs:
            edge_type = _edge_type_for_operation(ref.operation)
            step_str = _step_label(ref.step)

            if edge_type == "read":
                source, target = table_name, proc_name
            else:
                source, target = proc_name, table_name

            edges.append(
                CytoscapeEdge(
                    source=source,
                    target=target,
                    type=edge_type,
                    step=step_str,
                    label=f"{step_str} {ref.operation}",
                )
            )

    return GraphResponse(nodes=nodes, edges=edges)
```

- [ ] **Step 4: Run tests — verify they pass**

Run: `uv run pytest tests/test_graph_builder.py -v`
Expected: All 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add graph/builder.py tests/test_graph_builder.py
git commit -m "feat: add Cytoscape graph builder with dataflow and reverse lookup"
```

---

## Task 6: FastAPI Routes

**Files:**
- Create: `api/routes.py`
- Modify: `app.py` — mount the router
- Create: `tests/test_routes.py`

- [ ] **Step 1: Write route tests with mocked connector**

Create `tests/test_routes.py`:

```python
from unittest.mock import patch

from fastapi.testclient import TestClient

from app import app
from models.schemas import (
    ColumnInfo,
    DatabaseObject,
    DataFlowResult,
    ParameterInfo,
    TableRef,
)

client = TestClient(app)


def test_health():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


@patch("api.routes.teradata")
def test_list_databases(mock_td):
    mock_td.get_databases.return_value = ["SALES_DB", "FINANCE_DB"]
    resp = client.get("/api/databases")
    assert resp.status_code == 200
    assert resp.json() == ["SALES_DB", "FINANCE_DB"]


def test_object_types():
    resp = client.get("/api/databases/SALES_DB/object-types")
    assert resp.status_code == 200
    assert resp.json() == ["procedure", "macro", "table", "view"]


@patch("api.routes.teradata")
def test_list_objects(mock_td):
    mock_td.get_objects.return_value = [
        DatabaseObject(name="sp_load", object_type="procedure", database="SALES_DB"),
    ]
    resp = client.get("/api/databases/SALES_DB/procedure")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["name"] == "sp_load"


@patch("api.routes.teradata")
def test_dataflow_procedure(mock_td):
    mock_td.get_ddl.return_value = "SELECT * FROM db.t1;"
    mock_td.get_parameters.return_value = [
        ParameterInfo(name="p_date", data_type="DATE", direction="IN"),
    ]
    resp = client.get("/api/databases/SALES_DB/procedure/sp_load/dataflow")
    assert resp.status_code == 200
    data = resp.json()
    assert "nodes" in data
    assert "edges" in data


@patch("api.routes.teradata")
def test_dataflow_table_reverse_lookup(mock_td):
    mock_td.get_objects.return_value = [
        DatabaseObject(name="sp_load", object_type="procedure", database="db"),
    ]
    mock_td.get_ddl.return_value = "SELECT * FROM db.orders;"
    mock_td.get_columns.return_value = [
        ColumnInfo(name="id", data_type="INTEGER", nullable=False),
    ]
    resp = client.get("/api/databases/db/table/orders/dataflow")
    assert resp.status_code == 200
    data = resp.json()
    assert "nodes" in data


@patch("api.routes.teradata")
def test_invalid_object_type(mock_td):
    resp = client.get("/api/databases/SALES_DB/invalid_type")
    assert resp.status_code == 400
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `uv run pytest tests/test_routes.py -v`
Expected: Failures because routes don't exist yet (404s, import errors).

- [ ] **Step 3: Implement `api/routes.py`**

```python
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from connectors import teradata
from graph.builder import build_dataflow_graph, build_reverse_lookup_graph
from models.schemas import DataFlowResult, GraphResponse
from parsers.sql_parser import parse_dataflow

router = APIRouter(prefix="/api")

VALID_OBJECT_TYPES = {"procedure", "macro", "table", "view"}

# In-memory cache: database -> {obj_name: DataFlowResult}
_dataflow_cache: dict[str, dict[str, DataFlowResult]] = {}


@router.get("/databases")
def list_databases() -> list[str]:
    return teradata.get_databases()


@router.get("/databases/{db}/object-types")
def list_object_types(db: str) -> list[str]:
    return ["procedure", "macro", "table", "view"]


@router.get("/databases/{db}/{object_type}")
def list_objects(db: str, object_type: str):
    if object_type not in VALID_OBJECT_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid object type: {object_type}")
    return teradata.get_objects(db, object_type)


@router.get("/databases/{db}/{object_type}/{name}/dataflow")
def get_dataflow(db: str, object_type: str, name: str) -> GraphResponse:
    if object_type not in VALID_OBJECT_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid object type: {object_type}")

    if object_type in ("table", "view"):
        return _reverse_lookup(db, name, object_type)

    return _forward_dataflow(db, name, object_type)


def _forward_dataflow(db: str, name: str, object_type: str) -> GraphResponse:
    """Build data flow graph for a procedure or macro."""
    ddl = teradata.get_ddl(db, name)
    if not ddl:
        raise HTTPException(status_code=404, detail=f"No DDL found for {db}.{name}")

    dataflow = parse_dataflow(ddl)

    # Cache for reverse lookups
    _dataflow_cache.setdefault(db, {})[name] = dataflow

    parameters = teradata.get_parameters(db, name)
    detail_data = {
        "parameters": [p.model_dump() for p in parameters],
        "sql_snippets": {},
    }

    return build_dataflow_graph(name, object_type, dataflow, detail_data)


def _reverse_lookup(db: str, name: str, object_type: str) -> GraphResponse:
    """Build reverse-lookup graph for a table or view."""
    # Ensure we have parsed all procedures/macros in this database
    if db not in _dataflow_cache:
        _dataflow_cache[db] = {}
        for otype in ("procedure", "macro"):
            objects = teradata.get_objects(db, otype)
            for obj in objects:
                ddl = teradata.get_ddl(db, obj.name)
                if ddl:
                    _dataflow_cache[db][obj.name] = parse_dataflow(ddl)

    # Get column info for the detail panel
    columns = teradata.get_columns(db, name)

    qualified_name = f"{db}.{name}"
    graph = build_reverse_lookup_graph(qualified_name, _dataflow_cache[db])

    # Enrich center node with column data
    for node in graph.nodes:
        if node.id == qualified_name:
            node.detail = {"columns": [c.model_dump() for c in columns]}

    return graph
```

- [ ] **Step 4: Update `app.py` to mount the router**

Replace `app.py`:

```python
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from api.routes import router

app = FastAPI(title="ProcViz", version="0.1.0")
app.include_router(router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


def main():
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)


if __name__ == "__main__":
    main()
```

Note: `StaticFiles` mount for the frontend is added in Task 9 after the frontend is built.

- [ ] **Step 5: Run tests — verify they pass**

Run: `uv run pytest tests/test_routes.py -v`
Expected: All 7 tests pass.

- [ ] **Step 6: Commit**

```bash
git add api/routes.py app.py tests/test_routes.py
git commit -m "feat: add FastAPI routes with three-level navigation and dataflow endpoints"
```

---

## Task 7: Frontend Scaffolding

**Files:**
- Create: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/tailwind.config.js`, `frontend/postcss.config.js`
- Create: `frontend/index.html`, `frontend/src/main.tsx`, `frontend/src/styles/index.css`
- Create: `frontend/src/types/graph.ts`, `frontend/src/api/client.ts`

- [ ] **Step 1: Initialize frontend project**

```bash
cd frontend
npm create vite@latest . -- --template react-ts
npm install
npm install cytoscape cytoscape-dagre
npm install -D @types/cytoscape tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: Configure Vite proxy for development**

Replace `frontend/vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
  build: {
    outDir: "dist",
  },
});
```

- [ ] **Step 3: Configure Tailwind**

Replace `frontend/src/styles/index.css`:

```css
@import "tailwindcss";
```

- [ ] **Step 4: Create TypeScript types**

Create `frontend/src/types/graph.ts`:

```typescript
export interface CytoscapeNodeData {
  id: string;
  label: string;
  type: "proc" | "macro" | "table" | "caller";
  detail: Record<string, unknown>;
}

export interface CytoscapeEdgeData {
  source: string;
  target: string;
  type: "read" | "write" | "call";
  step: string;
  label: string;
}

export interface GraphResponse {
  nodes: CytoscapeNodeData[];
  edges: CytoscapeEdgeData[];
}

export interface DatabaseObject {
  name: string;
  object_type: string;
  database: string;
}

export type ObjectType = "procedure" | "macro" | "table" | "view";
```

- [ ] **Step 5: Create API client**

Create `frontend/src/api/client.ts`:

```typescript
import type { DatabaseObject, GraphResponse, ObjectType } from "../types/graph";

const BASE = "/api";

async function fetchJson<T>(url: string): Promise<T> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`API error: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

export function getDatabases(): Promise<string[]> {
  return fetchJson(`${BASE}/databases`);
}

export function getObjectTypes(db: string): Promise<string[]> {
  return fetchJson(`${BASE}/databases/${encodeURIComponent(db)}/object-types`);
}

export function getObjects(db: string, objectType: ObjectType): Promise<DatabaseObject[]> {
  return fetchJson(
    `${BASE}/databases/${encodeURIComponent(db)}/${encodeURIComponent(objectType)}`
  );
}

export function getDataflow(
  db: string,
  objectType: ObjectType,
  name: string
): Promise<GraphResponse> {
  return fetchJson(
    `${BASE}/databases/${encodeURIComponent(db)}/${encodeURIComponent(objectType)}/${encodeURIComponent(name)}/dataflow`
  );
}
```

- [ ] **Step 6: Create entry point**

Replace `frontend/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

Create minimal `frontend/src/App.tsx`:

```tsx
export default function App() {
  return (
    <div className="flex h-screen bg-gray-50 text-gray-900">
      <div className="w-56 border-r border-gray-200 bg-white p-3 text-sm">
        Sidebar placeholder
      </div>
      <div className="flex-1 flex items-center justify-center text-gray-400">
        Select a procedure or table to view its data flow
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Verify dev server starts**

Run: `cd frontend && npm run dev`
Expected: Vite dev server starts. Browser shows the placeholder layout with sidebar and center message.

- [ ] **Step 8: Commit**

```bash
git add frontend/
git commit -m "feat: scaffold React + TypeScript frontend with Vite, Tailwind, and Cytoscape types"
```

---

## Task 8: Frontend — Tree Sidebar

**Files:**
- Create: `frontend/src/hooks/useDatabases.ts`, `frontend/src/hooks/useObjects.ts`
- Create: `frontend/src/components/TreeSidebar.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create data-fetching hooks**

Create `frontend/src/hooks/useDatabases.ts`:

```typescript
import { useEffect, useState } from "react";
import { getDatabases } from "../api/client";

export function useDatabases() {
  const [databases, setDatabases] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDatabases()
      .then(setDatabases)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return { databases, loading, error };
}
```

Create `frontend/src/hooks/useObjects.ts`:

```typescript
import { useState } from "react";
import { getObjects, getObjectTypes } from "../api/client";
import type { DatabaseObject, ObjectType } from "../types/graph";

export function useObjects() {
  const [objectTypes, setObjectTypes] = useState<Record<string, string[]>>({});
  const [objects, setObjects] = useState<Record<string, DatabaseObject[]>>({});
  const [loading, setLoading] = useState<string | null>(null);

  async function loadObjectTypes(db: string) {
    const key = db;
    if (objectTypes[key]) return;
    setLoading(key);
    const types = await getObjectTypes(db);
    setObjectTypes((prev) => ({ ...prev, [key]: types }));
    setLoading(null);
  }

  async function loadObjects(db: string, objectType: ObjectType) {
    const key = `${db}/${objectType}`;
    if (objects[key]) return;
    setLoading(key);
    const objs = await getObjects(db, objectType);
    setObjects((prev) => ({ ...prev, [key]: objs }));
    setLoading(null);
  }

  return { objectTypes, objects, loading, loadObjectTypes, loadObjects };
}
```

- [ ] **Step 2: Create TreeSidebar component**

Create `frontend/src/components/TreeSidebar.tsx`:

```tsx
import { useState } from "react";
import { useDatabases } from "../hooks/useDatabases";
import { useObjects } from "../hooks/useObjects";
import type { ObjectType } from "../types/graph";

interface TreeSidebarProps {
  onSelect: (db: string, objectType: ObjectType, name: string) => void;
}

export default function TreeSidebar({ onSelect }: TreeSidebarProps) {
  const { databases, loading: dbLoading, error } = useDatabases();
  const { objectTypes, objects, loadObjectTypes, loadObjects } = useObjects();

  const [expandedDbs, setExpandedDbs] = useState<Set<string>>(new Set());
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);

  function toggleDb(db: string) {
    const next = new Set(expandedDbs);
    if (next.has(db)) {
      next.delete(db);
    } else {
      next.add(db);
      loadObjectTypes(db);
    }
    setExpandedDbs(next);
  }

  function toggleType(db: string, objType: ObjectType) {
    const key = `${db}/${objType}`;
    const next = new Set(expandedTypes);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
      loadObjects(db, objType);
    }
    setExpandedTypes(next);
  }

  function handleSelect(db: string, objType: ObjectType, name: string) {
    const key = `${db}/${objType}/${name}`;
    setSelected(key);
    onSelect(db, objType, name);
  }

  if (dbLoading) return <div className="p-3 text-sm text-gray-400">Loading databases...</div>;
  if (error) return <div className="p-3 text-sm text-red-500">Error: {error}</div>;

  return (
    <div className="w-56 min-w-56 border-r border-gray-200 bg-white overflow-y-auto text-sm">
      <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
        Databases
      </div>
      {databases.map((db) => (
        <div key={db}>
          <button
            className="flex items-center gap-1 w-full px-3 py-1 hover:bg-gray-50 text-left"
            onClick={() => toggleDb(db)}
          >
            <span className="text-gray-400">{expandedDbs.has(db) ? "▼" : "▶"}</span>
            <span className={expandedDbs.has(db) ? "font-semibold" : ""}>{db}</span>
          </button>

          {expandedDbs.has(db) && objectTypes[db]?.map((objType) => (
            <div key={objType} className="ml-4">
              <button
                className="flex items-center gap-1 w-full px-3 py-1 hover:bg-gray-50 text-left"
                onClick={() => toggleType(db, objType as ObjectType)}
              >
                <span className="text-gray-400">
                  {expandedTypes.has(`${db}/${objType}`) ? "▼" : "▶"}
                </span>
                <span>{objType}</span>
              </button>

              {expandedTypes.has(`${db}/${objType}`) &&
                objects[`${db}/${objType}`]?.map((obj) => {
                  const key = `${db}/${objType}/${obj.name}`;
                  return (
                    <button
                      key={obj.name}
                      className={`block w-full text-left ml-8 px-2 py-1 rounded text-xs ${
                        selected === key
                          ? "bg-purple-600 text-white"
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                      onClick={() => handleSelect(db, objType as ObjectType, obj.name)}
                    >
                      {obj.name}
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Wire TreeSidebar into App.tsx**

Replace `frontend/src/App.tsx`:

```tsx
import { useState } from "react";
import TreeSidebar from "./components/TreeSidebar";
import type { ObjectType } from "./types/graph";

interface Selection {
  db: string;
  objectType: ObjectType;
  name: string;
}

export default function App() {
  const [selection, setSelection] = useState<Selection | null>(null);

  function handleSelect(db: string, objectType: ObjectType, name: string) {
    setSelection({ db, objectType, name });
  }

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900">
      <TreeSidebar onSelect={handleSelect} />
      <div className="flex-1 flex items-center justify-center text-gray-400">
        {selection
          ? `Loading dataflow for ${selection.db}.${selection.name}...`
          : "Select a procedure or table to view its data flow"}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify in browser**

Run both servers:
- Backend: `uv run python app.py` (port 8000)
- Frontend: `cd frontend && npm run dev` (port 5173, proxies /api to 8000)

Expected: Tree sidebar loads databases from Teradata, expanding shows object types, expanding further lists objects. Clicking an object updates the center placeholder text.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/
git commit -m "feat: add tree sidebar with three-level database navigation"
```

---

## Task 9: Frontend — Cytoscape Diagram + Detail Panel

**Files:**
- Create: `frontend/src/hooks/useDataflow.ts`
- Create: `frontend/src/components/DiagramView.tsx`
- Create: `frontend/src/components/DetailPanel.tsx`
- Create: `frontend/src/components/Legend.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create dataflow hook**

Create `frontend/src/hooks/useDataflow.ts`:

```typescript
import { useEffect, useState } from "react";
import { getDataflow } from "../api/client";
import type { GraphResponse, ObjectType } from "../types/graph";

export function useDataflow(db: string | null, objectType: ObjectType | null, name: string | null) {
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!db || !objectType || !name) {
      setGraph(null);
      return;
    }

    setLoading(true);
    setError(null);
    getDataflow(db, objectType, name)
      .then(setGraph)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [db, objectType, name]);

  return { graph, loading, error };
}
```

- [ ] **Step 2: Create DiagramView component**

Create `frontend/src/components/DiagramView.tsx`:

```tsx
import { useEffect, useRef } from "react";
import cytoscape, { type Core, type EventObject } from "cytoscape";
import dagre from "cytoscape-dagre";
import type { GraphResponse, CytoscapeNodeData, CytoscapeEdgeData } from "../types/graph";

// Register dagre layout once
cytoscape.use(dagre);

const NODE_COLORS: Record<string, string> = {
  proc: "#534AB7",
  macro: "#534AB7",
  table: "#0F6E56",
  caller: "#888888",
};

const EDGE_COLORS: Record<string, string> = {
  read: "#1D9E75",
  write: "#534AB7",
  call: "#888888",
};

interface DiagramViewProps {
  graph: GraphResponse;
  onSelectNode: (node: CytoscapeNodeData | null) => void;
  onSelectEdge: (edge: CytoscapeEdgeData | null) => void;
}

export default function DiagramView({ graph, onSelectNode, onSelectEdge }: DiagramViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const elements = [
      ...graph.nodes.map((n) => ({
        data: { ...n },
        classes: n.type,
      })),
      ...graph.edges.map((e, i) => ({
        data: { ...e, id: `edge-${i}` },
        classes: e.type,
      })),
    ];

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "text-valign": "center",
            "text-halign": "center",
            color: "#fff",
            "font-size": "11px",
            "text-wrap": "wrap",
            "text-max-width": "100px",
            width: "120px",
            height: "40px",
            shape: "roundrectangle",
            "background-color": "#888",
          },
        },
        ...Object.entries(NODE_COLORS).map(([type, color]) => ({
          selector: `node.${type}`,
          style: { "background-color": color },
        })),
        {
          selector: "edge",
          style: {
            label: "data(label)",
            "font-size": "10px",
            "text-rotation": "autorotate",
            "text-margin-y": -10,
            "curve-style": "bezier",
            "target-arrow-shape": "triangle",
            "arrow-scale": 0.8,
            width: 2,
            "line-color": "#ccc",
            "target-arrow-color": "#ccc",
          },
        },
        ...Object.entries(EDGE_COLORS).map(([type, color]) => ({
          selector: `edge.${type}`,
          style: {
            "line-color": color,
            "target-arrow-color": color,
            color: color,
            ...(type === "call" ? { "line-style": "dashed" } : {}),
          },
        })),
      ],
      layout: {
        name: "dagre",
        rankDir: "LR",
        nodeSep: 60,
        rankSep: 120,
        padding: 40,
      } as any,
    });

    cy.on("tap", "node", (evt: EventObject) => {
      onSelectNode(evt.target.data() as CytoscapeNodeData);
      onSelectEdge(null);
    });

    cy.on("tap", "edge", (evt: EventObject) => {
      onSelectEdge(evt.target.data() as CytoscapeEdgeData);
      onSelectNode(null);
    });

    cy.on("tap", (evt: EventObject) => {
      if (evt.target === cy) {
        onSelectNode(null);
        onSelectEdge(null);
      }
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
    };
  }, [graph, onSelectNode, onSelectEdge]);

  return <div ref={containerRef} className="w-full h-full" />;
}
```

- [ ] **Step 3: Create DetailPanel component**

Create `frontend/src/components/DetailPanel.tsx`:

```tsx
import type { CytoscapeEdgeData, CytoscapeNodeData } from "../types/graph";

interface DetailPanelProps {
  node: CytoscapeNodeData | null;
  edge: CytoscapeEdgeData | null;
}

export default function DetailPanel({ node, edge }: DetailPanelProps) {
  if (!node && !edge) return null;

  return (
    <div className="w-60 min-w-60 border-l border-gray-200 bg-white p-4 overflow-y-auto text-sm">
      {node && <NodeDetail node={node} />}
      {edge && <EdgeDetail edge={edge} />}
    </div>
  );
}

function NodeDetail({ node }: { node: CytoscapeNodeData }) {
  const detail = node.detail || {};
  const parameters = (detail.parameters || []) as Array<{
    name: string;
    data_type: string;
    direction: string;
  }>;
  const columns = (detail.columns || []) as Array<{
    name: string;
    data_type: string;
    nullable: boolean;
  }>;

  return (
    <>
      <div className="font-semibold text-purple-700">{node.label}</div>
      <div className="text-xs text-gray-400 mb-3 uppercase">{node.type}</div>

      {parameters.length > 0 && (
        <>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
            Parameters
          </div>
          <div className="font-mono text-xs bg-gray-50 p-2 rounded mb-3">
            {parameters.map((p) => (
              <div key={p.name}>
                {p.direction} {p.name} {p.data_type}
              </div>
            ))}
          </div>
        </>
      )}

      {columns.length > 0 && (
        <>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
            Columns
          </div>
          <div className="font-mono text-xs bg-gray-50 p-2 rounded mb-3">
            {columns.map((c) => (
              <div key={c.name}>
                {c.name} {c.data_type}
                {c.nullable ? "" : " NOT NULL"}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function EdgeDetail({ edge }: { edge: CytoscapeEdgeData }) {
  return (
    <>
      <div className="font-semibold text-purple-700">{edge.label}</div>
      <div className="text-xs text-gray-400 mb-3">
        {edge.source} → {edge.target}
      </div>
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
        Type
      </div>
      <div className="text-xs mb-3">{edge.type}</div>
    </>
  );
}
```

- [ ] **Step 4: Create Legend component**

Create `frontend/src/components/Legend.tsx`:

```tsx
export default function Legend() {
  return (
    <div className="absolute bottom-4 left-4 bg-white/90 border border-gray-200 rounded p-3 text-xs">
      <div className="font-semibold mb-1">Nodes</div>
      <div className="flex items-center gap-2 mb-0.5">
        <span className="inline-block w-3 h-3 rounded" style={{ background: "#534AB7" }} />
        Procedure / Macro
      </div>
      <div className="flex items-center gap-2 mb-0.5">
        <span className="inline-block w-3 h-3 rounded" style={{ background: "#0F6E56" }} />
        Table
      </div>
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-block w-3 h-3 rounded" style={{ background: "#888" }} />
        Caller
      </div>
      <div className="font-semibold mb-1">Edges</div>
      <div className="flex items-center gap-2 mb-0.5">
        <span className="inline-block w-6 h-0.5" style={{ background: "#1D9E75" }} />
        Read (SELECT)
      </div>
      <div className="flex items-center gap-2 mb-0.5">
        <span className="inline-block w-6 h-0.5" style={{ background: "#534AB7" }} />
        Write (INSERT/UPDATE/...)
      </div>
      <div className="flex items-center gap-2">
        <span
          className="inline-block w-6 h-0.5"
          style={{ background: "#888", borderTop: "2px dashed #888" }}
        />
        Call
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Wire everything together in App.tsx**

Replace `frontend/src/App.tsx`:

```tsx
import { useCallback, useState } from "react";
import TreeSidebar from "./components/TreeSidebar";
import DiagramView from "./components/DiagramView";
import DetailPanel from "./components/DetailPanel";
import Legend from "./components/Legend";
import { useDataflow } from "./hooks/useDataflow";
import type { CytoscapeEdgeData, CytoscapeNodeData, ObjectType } from "./types/graph";

interface Selection {
  db: string;
  objectType: ObjectType;
  name: string;
}

export default function App() {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selectedNode, setSelectedNode] = useState<CytoscapeNodeData | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<CytoscapeEdgeData | null>(null);

  const { graph, loading, error } = useDataflow(
    selection?.db ?? null,
    selection?.objectType ?? null,
    selection?.name ?? null
  );

  function handleSelect(db: string, objectType: ObjectType, name: string) {
    setSelection({ db, objectType, name });
    setSelectedNode(null);
    setSelectedEdge(null);
  }

  const handleSelectNode = useCallback((node: CytoscapeNodeData | null) => {
    setSelectedNode(node);
    setSelectedEdge(null);
  }, []);

  const handleSelectEdge = useCallback((edge: CytoscapeEdgeData | null) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
  }, []);

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900">
      <TreeSidebar onSelect={handleSelect} />

      <div className="flex-1 relative">
        {!selection && (
          <div className="flex items-center justify-center h-full text-gray-400">
            Select a procedure or table to view its data flow
          </div>
        )}
        {loading && (
          <div className="flex items-center justify-center h-full text-gray-400">
            Loading...
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-full text-red-500">
            Error: {error}
          </div>
        )}
        {graph && !loading && (
          <>
            <DiagramView
              graph={graph}
              onSelectNode={handleSelectNode}
              onSelectEdge={handleSelectEdge}
            />
            <Legend />
          </>
        )}
      </div>

      <DetailPanel node={selectedNode} edge={selectedEdge} />
    </div>
  );
}
```

- [ ] **Step 6: Verify in browser — full end-to-end**

Run both servers:
- Backend: `uv run python app.py` (port 8000)
- Frontend: `cd frontend && npm run dev` (port 5173)

Test:
1. Open browser at the Vite dev URL
2. Tree sidebar loads databases
3. Expand a database → see object types
4. Expand "procedure" → see procedure list
5. Click a procedure → Cytoscape diagram renders with colored nodes and edges
6. Click a node → detail panel shows parameters
7. Click an edge → detail panel shows operation type
8. Try a table → see reverse-lookup diagram

- [ ] **Step 7: Commit**

```bash
git add frontend/src/
git commit -m "feat: add Cytoscape diagram view, detail panel, and legend"
```

---

## Task 10: Static Build + FastAPI Serving

**Files:**
- Modify: `app.py` — add StaticFiles mount
- Modify: `.gitignore` — track `frontend/dist/`

- [ ] **Step 1: Build the frontend**

```bash
cd frontend && npm run build
```

Expected: `frontend/dist/` directory created with `index.html` and `assets/`.

- [ ] **Step 2: Update `app.py` to serve static files**

Add the StaticFiles mount to `app.py`, after the router include:

```python
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from api.routes import router

app = FastAPI(title="ProcViz", version="0.1.0")
app.include_router(router)

DIST_DIR = Path(__file__).parent / "frontend" / "dist"


@app.get("/api/health")
def health():
    return {"status": "ok"}


if DIST_DIR.exists():
    @app.get("/")
    def serve_index():
        return FileResponse(DIST_DIR / "index.html")

    app.mount("/", StaticFiles(directory=DIST_DIR), name="static")


def main():
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)


if __name__ == "__main__":
    main()
```

Note: The `/` route is defined explicitly before the static mount so the index.html is served at the root. The static mount handles CSS/JS/asset requests.

- [ ] **Step 3: Verify single-port mode**

Run: `uv run python app.py`
Open: `http://localhost:8000`
Expected: The full app works — tree sidebar, diagram, detail panel — all from port 8000. No Vite needed.

- [ ] **Step 4: Update `.gitignore` to track dist**

The current `.gitignore` has `frontend/dist/`. Remove that line — the pre-built dist should be committed so users don't need Node.js.

- [ ] **Step 5: Commit**

```bash
git add app.py frontend/dist/ .gitignore
git commit -m "feat: serve pre-built frontend via FastAPI StaticFiles"
```

---

## Task 11: Launcher & Install Scripts

**Files:**
- Create: `start.sh`, `start.bat`
- Create: `install.sh`, `install.ps1`
- Create: `README.md`

- [ ] **Step 1: Create `start.sh`**

```bash
#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
echo "Starting ProcViz..."
uv run python app.py &
sleep 2
open "http://localhost:8000" 2>/dev/null || xdg-open "http://localhost:8000" 2>/dev/null || true
wait
```

- [ ] **Step 2: Create `start.bat`**

```bat
@echo off
cd /d "%~dp0"
echo Starting ProcViz...
start http://localhost:8000
uv run python app.py
```

- [ ] **Step 3: Create `install.sh`**

```bash
#!/usr/bin/env bash
set -e

echo "=== ProcViz Installer ==="

# Install uv if not present
if ! command -v uv &>/dev/null; then
    echo "Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
fi

# Clone repo
INSTALL_DIR="$HOME/procviz"
if [ -d "$INSTALL_DIR" ]; then
    echo "Updating existing installation..."
    cd "$INSTALL_DIR" && git pull
else
    echo "Cloning ProcViz..."
    git clone https://github.com/jxhuang-godaddy/procviz.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# Install dependencies
echo "Installing dependencies..."
uv sync

# Prompt for credentials
if [ ! -f .env ]; then
    echo ""
    echo "=== Teradata Configuration ==="
    read -rp "Teradata host: " TD_HOST
    read -rp "Teradata port [1025]: " TD_PORT
    TD_PORT=${TD_PORT:-1025}
    read -rp "Teradata username: " TD_USER
    read -rsp "Teradata password: " TD_PASSWORD
    echo ""

    cat > .env <<EOF
TD_HOST=$TD_HOST
TD_PORT=$TD_PORT
TD_USER=$TD_USER
TD_PASSWORD=$TD_PASSWORD
EOF
    echo ".env created."
fi

echo ""
echo "=== Starting ProcViz ==="
bash start.sh
```

- [ ] **Step 4: Create `install.ps1`**

```powershell
Write-Host "=== ProcViz Installer ===" -ForegroundColor Cyan

# Install uv if not present
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Write-Host "Installing uv..."
    irm https://astral.sh/uv/install.ps1 | iex
}

# Clone repo
$InstallDir = "$env:USERPROFILE\procviz"
if (Test-Path $InstallDir) {
    Write-Host "Updating existing installation..."
    Push-Location $InstallDir
    git pull
} else {
    Write-Host "Cloning ProcViz..."
    git clone https://github.com/jxhuang-godaddy/procviz.git $InstallDir
    Push-Location $InstallDir
}

# Install dependencies
Write-Host "Installing dependencies..."
uv sync

# Prompt for credentials
if (-not (Test-Path .env)) {
    Write-Host "`n=== Teradata Configuration ===" -ForegroundColor Cyan
    $TdHost = Read-Host "Teradata host"
    $TdPort = Read-Host "Teradata port [1025]"
    if (-not $TdPort) { $TdPort = "1025" }
    $TdUser = Read-Host "Teradata username"
    $TdPass = Read-Host "Teradata password" -AsSecureString
    $TdPassPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($TdPass))

    @"
TD_HOST=$TdHost
TD_PORT=$TdPort
TD_USER=$TdUser
TD_PASSWORD=$TdPassPlain
"@ | Set-Content .env

    Write-Host ".env created."
}

Write-Host "`n=== Starting ProcViz ===" -ForegroundColor Cyan
Pop-Location
& $InstallDir\start.bat
```

- [ ] **Step 5: Create `README.md`**

```markdown
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
```

- [ ] **Step 6: Make scripts executable**

```bash
chmod +x start.sh install.sh
```

- [ ] **Step 7: Commit**

```bash
git add start.sh start.bat install.sh install.ps1 README.md
git commit -m "feat: add launcher scripts, install scripts, and README"
```

---

## Task 12: Final Verification

- [ ] **Step 1: Run all tests**

Run: `uv run pytest -v`
Expected: All tests pass (schemas, parser, graph builder, routes).

- [ ] **Step 2: Full end-to-end test**

1. Kill any running servers
2. Run: `uv run python app.py`
3. Open: `http://localhost:8000`
4. Verify: tree loads databases, drill into a database, click a procedure → diagram renders
5. Verify: click nodes → detail panel shows parameters
6. Verify: click a table → reverse lookup diagram renders
7. Verify: legend displays correctly

- [ ] **Step 3: Commit any final fixes**

If any issues found, fix and commit.

- [ ] **Step 4: Final commit — tag v0.1.0**

```bash
git tag v0.1.0
```
