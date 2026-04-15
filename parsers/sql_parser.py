"""SQL parser for extracting data flow information from DDL using sqlglot."""

from __future__ import annotations

import re

import sqlglot
from sqlglot import exp
from sqlglot.errors import ErrorLevel, ParseError

from models.schemas import CallRef, DataFlowResult, TableRef


def _qualified_table_name(table: exp.Table) -> str:
    """Build a qualified table name from a sqlglot Table node (catalog.db.name)."""
    parts = [p for p in (table.catalog, table.db, table.name) if p]
    return ".".join(parts)


def _extract_cte_aliases(stmt: exp.Expression) -> set[str]:
    """Collect CTE alias names so we can exclude them from table refs."""
    aliases: set[str] = set()
    for cte in stmt.find_all(exp.CTE):
        if cte.alias:
            aliases.add(cte.alias)
    return aliases


def _extract_call_target(cmd: exp.Command) -> str | None:
    """Extract the procedure name from a CALL command parsed by sqlglot.

    sqlglot parses CALL as a Command with this='CALL' and expression being
    a Literal whose text is like "proc_name('arg1', 'arg2')".
    """
    if not isinstance(cmd, exp.Command):
        return None
    if str(cmd.this).upper() != "CALL":
        return None
    expr = cmd.args.get("expression")
    if expr is None:
        return None
    text = expr.this if isinstance(expr, exp.Literal) else str(expr)
    # Extract the function/procedure name before the opening parenthesis
    match = re.match(r"([^\(\s]+)", text.strip())
    return match.group(1) if match else None


def _process_statement(
    stmt: exp.Expression,
    step: int,
    cte_aliases: set[str],
    table_refs: list[TableRef],
    call_refs: list[CallRef],
) -> None:
    """Process a single DML statement and append refs to the provided lists."""
    if isinstance(stmt, exp.Select):
        for table in stmt.find_all(exp.Table):
            name = _qualified_table_name(table)
            if name and name not in cte_aliases:
                table_refs.append(TableRef(name=name, operation="SELECT", step=step))

    elif isinstance(stmt, exp.Insert):
        # Target table gets INSERT
        target_table = stmt.this
        target_name = ""
        if isinstance(target_table, exp.Table):
            target_name = _qualified_table_name(target_table)
            if target_name:
                table_refs.append(TableRef(name=target_name, operation="INSERT", step=step))

        # Source tables: walk ALL tables in the statement (covers CTEs + SELECT),
        # excluding the target table and CTE aliases
        for table in stmt.find_all(exp.Table):
            name = _qualified_table_name(table)
            if name and name != target_name and name not in cte_aliases:
                table_refs.append(TableRef(name=name, operation="SELECT", step=step))

    elif isinstance(stmt, exp.Update):
        target_table = stmt.this
        if isinstance(target_table, exp.Table):
            name = _qualified_table_name(target_table)
            if name:
                table_refs.append(TableRef(name=name, operation="UPDATE", step=step))

    elif isinstance(stmt, exp.Delete):
        target_table = stmt.this
        if isinstance(target_table, exp.Table):
            name = _qualified_table_name(target_table)
            if name:
                table_refs.append(TableRef(name=name, operation="DELETE", step=step))

    elif isinstance(stmt, exp.Merge):
        # Target table gets MERGE
        target_table = stmt.this
        if isinstance(target_table, exp.Table):
            name = _qualified_table_name(target_table)
            if name:
                table_refs.append(TableRef(name=name, operation="MERGE", step=step))

        # Source table from USING clause gets SELECT
        using = stmt.args.get("using")
        if isinstance(using, exp.Table):
            name = _qualified_table_name(using)
            if name:
                table_refs.append(TableRef(name=name, operation="SELECT", step=step))
        elif using is not None:
            # USING might be a subquery; find tables within it
            for table in using.find_all(exp.Table):
                name = _qualified_table_name(table)
                if name and name not in cte_aliases:
                    table_refs.append(TableRef(name=name, operation="SELECT", step=step))

    elif isinstance(stmt, exp.Command):
        target = _extract_call_target(stmt)
        if target:
            call_refs.append(CallRef(target=target, step=step))


def _extract_procedure_body(ddl: str) -> str | None:
    """If the DDL contains a procedure definition, extract the body between BEGIN and END."""
    match = re.search(
        r"\bBEGIN\b\s+(.*?)\s+\bEND\b",
        ddl,
        re.DOTALL | re.IGNORECASE,
    )
    return match.group(1) if match else None


def _is_procedure_ddl(ddl: str) -> bool:
    """Check if the DDL is a CREATE/REPLACE PROCEDURE statement."""
    return bool(
        re.match(
            r"\s*(CREATE\s+|REPLACE\s+)*(PROCEDURE)\b",
            ddl,
            re.IGNORECASE,
        )
    )


def parse_dataflow(ddl: str) -> DataFlowResult:
    """Parse DDL text and extract data flow information.

    Args:
        ddl: Raw DDL text, possibly containing multiple statements or a
             procedure body.

    Returns:
        DataFlowResult with table_refs, call_refs, and any errors encountered.
    """
    table_refs: list[TableRef] = []
    call_refs: list[CallRef] = []
    errors: list[str] = []

    if not ddl or not ddl.strip():
        return DataFlowResult(table_refs=table_refs, call_refs=call_refs, errors=errors)

    # For procedure DDL, extract the body and parse it separately
    # because sqlglot's Teradata dialect struggles with procedure parameter syntax
    sql_to_parse = ddl
    if _is_procedure_ddl(ddl):
        body = _extract_procedure_body(ddl)
        if body:
            sql_to_parse = body
        else:
            errors.append("Could not extract procedure body between BEGIN/END")
            return DataFlowResult(table_refs=table_refs, call_refs=call_refs, errors=errors)

    # First pass: try strict parsing to detect errors
    try:
        sqlglot.parse(sql_to_parse, dialect="teradata", error_level=ErrorLevel.RAISE)
    except ParseError as e:
        errors.append(str(e))

    # Parse with WARN level for partial results even if there are errors
    try:
        statements = sqlglot.parse(
            sql_to_parse, dialect="teradata", error_level=ErrorLevel.WARN
        )
    except Exception as e:
        errors.append(f"Fatal parse error: {e}")
        return DataFlowResult(table_refs=table_refs, call_refs=call_refs, errors=errors)

    step = 0
    for stmt in statements:
        if stmt is None:
            continue

        # Only count real DML/command statements as steps
        dml_types = (exp.Select, exp.Insert, exp.Update, exp.Delete, exp.Merge, exp.Command)
        if not isinstance(stmt, dml_types):
            # For non-DML top-level nodes (e.g. garbage from bad parse),
            # skip them — they will already be captured via errors
            continue

        step += 1
        cte_aliases = _extract_cte_aliases(stmt)
        _process_statement(stmt, step, cte_aliases, table_refs, call_refs)

    return DataFlowResult(table_refs=table_refs, call_refs=call_refs, errors=errors)
