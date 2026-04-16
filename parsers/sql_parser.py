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
    volatile_tables: set[str] | None = None,
) -> None:
    """Process a single DML statement and append refs to the provided lists."""
    if isinstance(stmt, exp.Select):
        for table in stmt.find_all(exp.Table):
            name = _qualified_table_name(table)
            if name and name not in cte_aliases:
                table_refs.append(TableRef(name=name, operation="SELECT", step=step))

    elif isinstance(stmt, exp.Insert):
        # Target table gets INSERT — may be wrapped in Schema if column list present
        target_table = stmt.this
        if isinstance(target_table, exp.Schema):
            target_table = target_table.this
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

    elif isinstance(stmt, exp.Create):
        # CREATE [VOLATILE] TABLE <target> AS (SELECT ...) — target gets CREATE, sources get SELECT
        target_table = stmt.this
        if isinstance(target_table, exp.Schema):
            target_table = target_table.this
        target_name = ""
        if isinstance(target_table, exp.Table):
            target_name = _qualified_table_name(target_table)
            if target_name:
                table_refs.append(TableRef(name=target_name, operation="CREATE", step=step))
                # Track volatile tables
                if volatile_tables is not None:
                    props = stmt.args.get("properties")
                    if props:
                        for prop in props.expressions:
                            if isinstance(prop, exp.VolatileProperty):
                                volatile_tables.add(target_name)
                                break

        source_expr = stmt.expression
        if source_expr is not None:
            for table in source_expr.find_all(exp.Table):
                name = _qualified_table_name(table)
                if name and name != target_name and name not in cte_aliases:
                    table_refs.append(TableRef(name=name, operation="SELECT", step=step))

    elif isinstance(stmt, exp.Command):
        target = _extract_call_target(stmt)
        if target:
            call_refs.append(CallRef(target=target, step=step))


def _extract_procedure_body(ddl: str) -> tuple[str, int] | None:
    """Extract the body between the outermost BEGIN and the final END.

    Returns (body_text, body_start_offset) or None.
    """
    match = re.search(
        r"\bBEGIN\b\s+(.*)\s+\bEND\b",
        ddl,
        re.DOTALL | re.IGNORECASE,
    )
    if not match:
        return None
    return match.group(1), match.start(1)


def _split_statements(body: str) -> list[tuple[str, int, list[int]]]:
    """Split SQL body on semicolons, respecting quoted strings, block and line comments.

    Handles all line-ending styles (``\\r\\n``, ``\\r``, ``\\n``).
    Line comments (``--``) are stripped so that patterns like ``--/*``
    don't start a false block comment and commented-out DML is ignored.

    Returns a list of ``(statement_text, char_offset, pos_map)`` tuples where
    *char_offset* is the position of the first non-whitespace character in the
    original body and *pos_map* maps each character index in *statement_text*
    back to its position in the original (normalised) body.
    """
    # Normalise line endings to \n so line-comment detection works uniformly
    body = body.replace("\r\n", "\n").replace("\r", "\n")

    stmts: list[tuple[str, int, list[int]]] = []
    current: list[str] = []
    cur_pos: list[int] = []  # original body position for each char in current
    stmt_start: int = 0  # character offset of current statement start
    found_content = False  # whether we've seen non-whitespace for this stmt
    in_quote = False
    in_block_comment = False
    i = 0
    while i < len(body):
        ch = body[i]
        if in_block_comment:
            if ch == "*" and i + 1 < len(body) and body[i + 1] == "/":
                i += 2
                in_block_comment = False
                continue
            i += 1
            continue
        elif in_quote:
            current.append(ch)
            cur_pos.append(i)
            if ch == "'":
                # Check for escaped quote ('')
                if i + 1 < len(body) and body[i + 1] == "'":
                    current.append("'")
                    cur_pos.append(i + 1)
                    i += 2
                    continue
                in_quote = False
        elif ch == "'":
            if not found_content:
                stmt_start = i
                found_content = True
            in_quote = True
            current.append(ch)
            cur_pos.append(i)
        elif ch == "-" and i + 1 < len(body) and body[i + 1] == "-":
            # Line comment — skip to end of line
            i += 2
            while i < len(body) and body[i] != "\n":
                i += 1
            continue
        elif ch == "/" and i + 1 < len(body) and body[i + 1] == "*":
            in_block_comment = True
            i += 2
            continue
        elif ch == ";":
            text = "".join(current)
            stripped = text.strip()
            if stripped:
                # Build pos_map for the stripped text (skip leading/trailing ws)
                lstrip_count = len(text) - len(text.lstrip())
                rstrip_count = len(text) - len(text.rstrip())
                end = len(cur_pos) - rstrip_count if rstrip_count else len(cur_pos)
                stmts.append((stripped, stmt_start, cur_pos[lstrip_count:end]))
            current = []
            cur_pos = []
            found_content = False
        else:
            if not found_content and not ch.isspace():
                stmt_start = i
                found_content = True
            current.append(ch)
            cur_pos.append(i)
        i += 1
    text = "".join(current)
    stripped = text.strip()
    if stripped:
        lstrip_count = len(text) - len(text.lstrip())
        rstrip_count = len(text) - len(text.rstrip())
        end = len(cur_pos) - rstrip_count if rstrip_count else len(cur_pos)
        stmts.append((stripped, stmt_start, cur_pos[lstrip_count:end]))
    return stmts


_DML_RE = re.compile(
    r"\b(INSERT\s+INTO|DELETE\s+FROM|DELETE\s+\w|UPDATE\s+\w|MERGE\s+INTO|CALL\s+\w|CREATE\s+(?:VOLATILE\s+|MULTISET\s+|SET\s+)*TABLE\b)",
    re.IGNORECASE,
)


_SKIP_RE = re.compile(
    r"^\s*(SET|DECLARE|SIGNAL|COLLECT|GET\s+DIAGNOSTICS)\b", re.IGNORECASE
)


def _get_dml_statement_list(body: str) -> list[tuple[str, int]]:
    """Extract individual DML statements from a procedure body.

    Returns a list of (sql_text, char_offset) tuples where char_offset is
    the position of the DML keyword in the *original* (normalised) body.
    Skips SET/DECLARE/procedural statements to avoid matching DML keywords
    inside string literals.
    """
    stmts = _split_statements(body)
    dml: list[tuple[str, int]] = []
    for s, _offset, pos_map in stmts:
        if _SKIP_RE.match(s):
            continue
        m = _DML_RE.search(s)
        if m:
            # Use pos_map to translate stripped-text position to original body position
            original_offset = pos_map[m.start()]
            dml.append((s[m.start():], original_offset))
    return dml


def _strip_leading_comments(ddl: str) -> str:
    """Strip leading line comments (--), block comments (/* */), and whitespace."""
    s = ddl.replace("\r\n", "\n").replace("\r", "\n")
    while True:
        s = s.lstrip()
        if s.startswith("--"):
            end = s.find("\n")
            s = s[end + 1:] if end >= 0 else ""
        elif s.startswith("/*"):
            end = s.find("*/")
            s = s[end + 2:] if end >= 0 else ""
        else:
            break
    return s


def _is_procedure_ddl(ddl: str) -> bool:
    """Check if the DDL is a CREATE/REPLACE PROCEDURE statement."""
    return bool(
        re.match(
            r"(CREATE\s+|REPLACE\s+)*(PROCEDURE)\b",
            _strip_leading_comments(ddl),
            re.IGNORECASE,
        )
    )


def _is_macro_ddl(ddl: str) -> bool:
    """Check if the DDL is a CREATE/REPLACE MACRO statement."""
    return bool(
        re.match(
            r"(CREATE\s+|REPLACE\s+)*(MACRO)\b",
            _strip_leading_comments(ddl),
            re.IGNORECASE,
        )
    )


def _extract_macro_body(ddl: str) -> tuple[str, int] | None:
    """Extract the body of a macro between AS ( ... ) — the outermost parens.

    Returns (body_text, body_start_offset) or None.
    """
    # Normalise line endings
    ddl = ddl.replace("\r\n", "\n").replace("\r", "\n")
    # Find the AS keyword followed by opening paren
    m = re.search(r"\bAS\s*\(", ddl, re.IGNORECASE)
    if not m:
        return None
    # Find the matching closing paren (handle nesting + quotes)
    start = m.end()  # right after the opening paren
    depth = 1
    in_quote = False
    i = start
    while i < len(ddl):
        ch = ddl[i]
        if in_quote:
            if ch == "'" and i + 1 < len(ddl) and ddl[i + 1] == "'":
                i += 2
                continue
            if ch == "'":
                in_quote = False
        elif ch == "'":
            in_quote = True
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return ddl[start:i], start
        i += 1
    return ddl[start:], start


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

    # For procedure or macro DDL, extract DML statements individually
    is_proc = _is_procedure_ddl(ddl)
    is_macro = _is_macro_ddl(ddl)
    if is_proc or is_macro:
        # Normalise line endings FIRST so all offsets (body extraction,
        # statement splitting, line counting) share the same coordinate system.
        ddl_norm = ddl.replace("\r\n", "\n").replace("\r", "\n")

        if is_proc:
            result = _extract_procedure_body(ddl_norm)
            if not result:
                errors.append("Could not extract procedure body between BEGIN/END")
                return DataFlowResult(table_refs=table_refs, call_refs=call_refs, errors=errors)
            body, body_offset = result
        else:
            result = _extract_macro_body(ddl_norm)
            if not result:
                errors.append("Could not extract macro body between AS ( ... )")
                return DataFlowResult(table_refs=table_refs, call_refs=call_refs, errors=errors)
            body, body_offset = result

        dml_stmts = _get_dml_statement_list(body)
        step_sql: dict[int, str] = {}
        step_lines: dict[int, int] = {}
        volatile_tables: set[str] = set()
        step = 0
        for sql_text, char_offset in dml_stmts:
            try:
                parsed = sqlglot.parse(
                    sql_text, dialect="teradata", error_level=ErrorLevel.WARN
                )
            except Exception:
                continue
            for stmt in parsed:
                if stmt is None:
                    continue
                dml_types = (
                    exp.Select, exp.Insert, exp.Update, exp.Delete,
                    exp.Merge, exp.Command, exp.Create,
                )
                if not isinstance(stmt, dml_types):
                    continue
                step += 1
                step_sql[step] = sql_text
                # char_offset is relative to body; add body_offset for DDL position
                abs_offset = body_offset + char_offset
                step_lines[step] = ddl_norm[:abs_offset].count("\n") + 1
                cte_aliases = _extract_cte_aliases(stmt)
                _process_statement(stmt, step, cte_aliases, table_refs, call_refs, volatile_tables)

        return DataFlowResult(
            table_refs=table_refs, call_refs=call_refs, errors=errors,
            step_sql=step_sql, step_lines=step_lines, volatile_tables=volatile_tables,
        )

    # Non-procedure DDL: parse as a whole
    sql_to_parse = ddl

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

        dml_types = (exp.Select, exp.Insert, exp.Update, exp.Delete, exp.Merge, exp.Command, exp.Create)
        if not isinstance(stmt, dml_types):
            continue

        step += 1
        cte_aliases = _extract_cte_aliases(stmt)
        _process_statement(stmt, step, cte_aliases, table_refs, call_refs)

    return DataFlowResult(table_refs=table_refs, call_refs=call_refs, errors=errors)
