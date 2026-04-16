from __future__ import annotations

from fastapi import APIRouter, HTTPException

from connectors import teradata
from graph.builder import build_dataflow_graph, build_reverse_lookup_graph, build_view_graph
from models.schemas import DataFlowResult, GraphResponse
from parsers.sql_parser import parse_dataflow

router = APIRouter(prefix="/api")

VALID_OBJECT_TYPES = {"procedure", "macro", "table", "view"}

# In-memory caches: database -> {obj_name: ...}
_dataflow_cache: dict[str, dict[str, DataFlowResult]] = {}
_ddl_cache: dict[str, dict[str, str]] = {}
_db_fully_scanned: set[str] = set()


def _ensure_db_cached(db: str) -> None:
    """Parse all procedures/macros in a database, caching dataflow + DDL."""
    if db in _db_fully_scanned:
        return
    _dataflow_cache.setdefault(db, {})
    _ddl_cache.setdefault(db, {})
    for otype in ("procedure", "macro"):
        objects = teradata.get_objects(db, otype)
        for obj in objects:
            if obj.name in _dataflow_cache[db]:
                continue
            ddl = teradata.get_ddl(db, obj.name)
            if ddl:
                _ddl_cache[db][obj.name] = ddl
                _dataflow_cache[db][obj.name] = parse_dataflow(ddl)
    _db_fully_scanned.add(db)


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

    if object_type == "table":
        return _reverse_lookup(db, name, object_type)

    if object_type == "view":
        return _view_dataflow(db, name)

    return _forward_dataflow(db, name, object_type)


@router.get("/ddl/{db}/{name}")
def get_ddl_text(db: str, name: str) -> dict:
    """Return raw DDL text for any database object."""
    ddl = teradata.get_ddl(db, name)
    return {"ddl": ddl}


def _forward_dataflow(db: str, name: str, object_type: str) -> GraphResponse:
    """Build data flow graph for a procedure or macro."""
    ddl = teradata.get_ddl(db, name)
    if not ddl:
        raise HTTPException(status_code=404, detail=f"No DDL found for {db}.{name}")

    dataflow = parse_dataflow(ddl)

    # Cache for reverse lookups
    _dataflow_cache.setdefault(db, {})[name] = dataflow
    _ddl_cache.setdefault(db, {})[name] = ddl

    parameters = teradata.get_parameters(db, name)
    detail_data = {
        "parameters": [p.model_dump() for p in parameters],
        "ddl": ddl,
    }

    return build_dataflow_graph(name, object_type, dataflow, detail_data)


def _view_dataflow(db: str, name: str) -> GraphResponse:
    """Build forward data-flow graph for a view: source tables → step → view."""
    ddl = teradata.get_ddl(db, name)
    if not ddl:
        raise HTTPException(status_code=404, detail=f"No DDL found for {db}.{name}")

    dataflow = parse_dataflow(ddl)

    columns = teradata.get_columns(db, name)
    detail_data = {
        "columns": [c.model_dump() for c in columns],
        "ddl": ddl,
    }

    return build_view_graph(f"{db}.{name}", dataflow, detail_data)


def _reverse_lookup(db: str, name: str, object_type: str) -> GraphResponse:
    """Build reverse-lookup graph for a table."""
    _ensure_db_cached(db)

    columns = teradata.get_columns(db, name)

    qualified_name = f"{db}.{name}"
    graph = build_reverse_lookup_graph(
        qualified_name, _dataflow_cache[db], _ddl_cache.get(db, {}),
    )

    # Enrich center node with column data
    for node in graph.nodes:
        if node.id == qualified_name:
            node.detail = {"columns": [c.model_dump() for c in columns]}

    return graph
