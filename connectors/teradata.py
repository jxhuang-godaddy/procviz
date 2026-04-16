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
    "procedure": "TableKind = 'P'",
    "macro": "TableKind = 'M'",
    "table": "TableKind = 'T'",
    "view": "TableKind = 'V'",
}


def get_objects(database: str, object_type: str) -> list[DatabaseObject]:
    """List objects of a given type in a database."""
    if object_type not in _OBJECT_TYPE_MAP:
        return []

    kind_filter = _OBJECT_TYPE_MAP[object_type]

    conn = get_connection()
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT TRIM(TableName) FROM DBC.TablesV"
            f" WHERE DatabaseName = '{database}' AND {kind_filter}"
            f" ORDER BY TableName"
        )
        return [
            DatabaseObject(name=row[0], object_type=object_type, database=database)
            for row in cur.fetchall()
        ]


def get_ddl(database: str, name: str) -> str:
    """Get full DDL source text for a database object."""
    conn = get_connection()
    with conn.cursor() as cur:
        # Try each SHOW variant — the right one succeeds, others fail fast
        for obj_type in ("TABLE", "VIEW", "PROCEDURE", "MACRO"):
            try:
                cur.execute(f"SHOW {obj_type} {database}.{name}")
                rows = cur.fetchall()
                if rows:
                    return "".join(row[0] for row in rows)
            except Exception:
                pass

        return ""


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
                name=row[0] or "",
                data_type=row[1] or "",
                nullable=row[2] == "Y",
            )
            for row in cur.fetchall()
        ]


def get_parameters(database: str, proc_name: str) -> list[ParameterInfo]:
    """Get parameter list for a procedure or macro."""
    conn = get_connection()
    with conn.cursor() as cur:
        # Try RoutinesV first (has detailed parameter info)
        try:
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
        except Exception:
            # RoutinesV not available — return empty list
            return []
