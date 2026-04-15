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
