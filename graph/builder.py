from __future__ import annotations

from collections import defaultdict

from models.schemas import (
    CallRef,
    CytoscapeEdge,
    CytoscapeNode,
    DataFlowResult,
    GraphResponse,
    TableRef,
)


def _step_label(step: int) -> str:
    """Convert integer step to a consistent bracketed label."""
    return f"[{step}]"


def _edge_type_for_operation(operation: str) -> str:
    """Map DML operation to edge type."""
    if operation == "SELECT":
        return "read"
    return "write"


def _summarize_step_operations(
    table_refs: list[TableRef], call_refs: list[CallRef]
) -> str:
    """Build a short label summarising what a step does, e.g. 'INSERT / SELECT'."""
    ops: list[str] = []
    seen: set[str] = set()
    for ref in table_refs:
        if ref.operation not in seen:
            ops.append(ref.operation)
            seen.add(ref.operation)
    for _ in call_refs:
        if "CALL" not in seen:
            ops.append("CALL")
            seen.add("CALL")
    return " / ".join(ops) if ops else "STEP"


def build_dataflow_graph(
    obj_name: str,
    obj_type: str,
    dataflow: DataFlowResult,
    detail_data: dict,
) -> GraphResponse:
    """Build Cytoscape JSON for a procedure/macro data flow diagram.

    4-column LR layout enforced via edge direction:
      Col 0: Procedure node
      Col 1: Input tables/views  (SELECT sources)
      Col 2: Step nodes          (one per SQL statement, top-to-bottom)
      Col 3: Output tables/views (INSERT/UPDATE/DELETE targets) & CALL targets
    """
    nodes: list[CytoscapeNode] = []
    edges: list[CytoscapeEdge] = []
    seen_nodes: set[str] = set()
    # Case-insensitive canonical name lookup: lowered name -> first-seen form
    canon: dict[str, str] = {}
    # Case-insensitive volatile table lookup
    volatile_lower = {v.lower() for v in dataflow.volatile_tables}

    def _canon(name: str) -> str:
        """Return the canonical (first-seen) form for a case-insensitive name."""
        key = name.lower()
        if key not in canon:
            canon[key] = name
        return canon[key]

    def _table_type(name: str) -> str:
        """Return node type: 'volatile' for volatile tables, 'table' otherwise."""
        return "volatile" if name.lower() in volatile_lower else "table"

    # --- Col 0: Procedure / macro node ---
    center_type = obj_type if obj_type in ("proc", "macro") else "proc"
    nodes.append(
        CytoscapeNode(
            id=obj_name,
            label=obj_name.split(".")[-1],
            type=center_type,
            detail=detail_data,
        )
    )
    seen_nodes.add(obj_name)

    # --- Group refs by step ---
    step_tables: dict[int, list[TableRef]] = defaultdict(list)
    step_calls: dict[int, list[CallRef]] = defaultdict(list)
    for ref in dataflow.table_refs:
        step_tables[ref.step].append(ref)
    for call in dataflow.call_refs:
        step_calls[call.step].append(call)

    all_steps = sorted(set(step_tables) | set(step_calls))
    scaffold_edges_added: set[str] = set()

    for step in all_steps:
        t_refs = step_tables.get(step, [])
        c_refs = step_calls.get(step, [])
        step_str = _step_label(step)
        summary = _summarize_step_operations(t_refs, c_refs)
        step_node_id = f"{obj_name}__step_{step}"

        # --- Col 2: Step sub-node ---
        step_detail: dict = {"step": step, "operations": summary}
        if step in dataflow.step_sql:
            step_detail["sql"] = dataflow.step_sql[step]
        line_no = dataflow.step_lines.get(step)
        if line_no is not None:
            step_detail["line"] = line_no
        step_label = f"{step_str} {summary}"
        if line_no is not None:
            step_label += f"\nL#{line_no}"
        nodes.append(
            CytoscapeNode(
                id=step_node_id,
                label=step_label,
                type="step",
                detail=step_detail,
            )
        )

        input_refs = [r for r in t_refs if r.operation == "SELECT"]
        output_refs = [r for r in t_refs if r.operation != "SELECT"]

        # --- Col 1: Input tables (SELECT sources) ---
        for ref in input_refs:
            node_id = _canon(ref.name)
            if node_id not in seen_nodes:
                nodes.append(
                    CytoscapeNode(
                        id=node_id,
                        label=node_id.split(".")[-1],
                        type=_table_type(node_id),
                        detail={},
                    )
                )
                seen_nodes.add(node_id)

            # Scaffold: proc → input_table (hidden, forces col 0 → col 1)
            scaffold_key = f"{obj_name}->{node_id}"
            if scaffold_key not in scaffold_edges_added:
                edges.append(
                    CytoscapeEdge(
                        source=obj_name,
                        target=node_id,
                        type="call",
                        step="",
                        label="",
                        hidden=True,
                    )
                )
                scaffold_edges_added.add(scaffold_key)

            # Visible: input_table → step (read)
            edges.append(
                CytoscapeEdge(
                    source=node_id,
                    target=step_node_id,
                    type="read",
                    step=step_str,
                    label=ref.operation,
                )
            )

        # --- Col 3: Output tables (INSERT/UPDATE/DELETE/CREATE targets) ---
        for ref in output_refs:
            node_id = _canon(ref.name)
            if node_id not in seen_nodes:
                nodes.append(
                    CytoscapeNode(
                        id=node_id,
                        label=node_id.split(".")[-1],
                        type=_table_type(node_id),
                        detail={},
                    )
                )
                seen_nodes.add(node_id)

            # Visible: step → output_table (write)
            edges.append(
                CytoscapeEdge(
                    source=step_node_id,
                    target=node_id,
                    type="write",
                    step=step_str,
                    label=ref.operation,
                )
            )

        # --- Col 3: CALL targets ---
        for call in c_refs:
            node_id = _canon(call.target)
            if node_id not in seen_nodes:
                nodes.append(
                    CytoscapeNode(
                        id=node_id,
                        label=node_id.split(".")[-1],
                        type="caller",
                        detail={},
                    )
                )
                seen_nodes.add(node_id)

            edges.append(
                CytoscapeEdge(
                    source=step_node_id,
                    target=node_id,
                    type="call",
                    step=step_str,
                    label="CALL",
                )
            )

        # Steps with no inputs: direct proc → step edge (keeps col 0 → col 2)
        if not input_refs:
            edges.append(
                CytoscapeEdge(
                    source=obj_name,
                    target=step_node_id,
                    type="call",
                    step=step_str,
                    label=step_str,
                )
            )

    return GraphResponse(nodes=nodes, edges=edges)


def build_view_graph(
    view_name: str,
    dataflow: DataFlowResult,
    detail_data: dict,
) -> GraphResponse:
    """Build Cytoscape JSON for a view data-flow diagram.

    3-column LR layout:
      Col 0: Source tables (SELECT sources)
      Col 1: CREATE VIEW step node
      Col 2: The view itself
    """
    nodes: list[CytoscapeNode] = []
    edges: list[CytoscapeEdge] = []
    seen_nodes: set[str] = set()

    source_refs = [r for r in dataflow.table_refs if r.operation == "SELECT"]
    create_refs = [r for r in dataflow.table_refs if r.operation == "CREATE"]

    # The view node — use the explicit CREATE target if available, else the passed name
    view_id = create_refs[0].name if create_refs else view_name
    short_label = view_id.split(".")[-1]

    # Determine the DDL text for the step node
    ddl_text = detail_data.get("ddl", "")

    # Step node
    step_id = f"{view_id}__step_create"
    step_detail: dict = {"sql": ddl_text, "step": 1, "operations": "CREATE VIEW"}
    nodes.append(
        CytoscapeNode(
            id=step_id,
            label="[1] CREATE VIEW",
            type="step",
            detail=step_detail,
        )
    )
    seen_nodes.add(step_id)

    # View node (col 2)
    nodes.append(
        CytoscapeNode(
            id=view_id,
            label=short_label,
            type="table",
            detail=detail_data,
        )
    )
    seen_nodes.add(view_id)

    # Step → view (write edge)
    edges.append(
        CytoscapeEdge(
            source=step_id,
            target=view_id,
            type="write",
            step="[1]",
            label="CREATE",
        )
    )

    # Source tables (col 0)
    for ref in source_refs:
        node_id = ref.name
        if node_id not in seen_nodes:
            nodes.append(
                CytoscapeNode(
                    id=node_id,
                    label=node_id.split(".")[-1],
                    type="table",
                    detail={},
                )
            )
            seen_nodes.add(node_id)

        edges.append(
            CytoscapeEdge(
                source=node_id,
                target=step_id,
                type="read",
                step="[1]",
                label="SELECT",
            )
        )

    return GraphResponse(nodes=nodes, edges=edges)


def build_reverse_lookup_graph(
    table_name: str,
    all_dataflows: dict[str, DataFlowResult],
    ddl_lookup: dict[str, str] | None = None,
) -> GraphResponse:
    """Build Cytoscape JSON for a table's data-flow diagram.

    Layout: writers (left) → table (center) → readers (right).
    Procedure nodes include DDL in their detail so clicking shows source code.
    """
    nodes: list[CytoscapeNode] = []
    edges: list[CytoscapeEdge] = []
    seen_nodes: set[str] = set()
    table_lower = table_name.lower()
    ddl_lookup = ddl_lookup or {}

    # The table node (center)
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
        write_refs = [
            r for r in dataflow.table_refs
            if r.name.lower() == table_lower and r.operation != "SELECT"
        ]
        read_refs = [
            r for r in dataflow.table_refs
            if r.name.lower() == table_lower and r.operation == "SELECT"
        ]
        if not write_refs and not read_refs:
            continue

        if proc_name not in seen_nodes:
            proc_detail: dict = {}
            if proc_name in ddl_lookup:
                proc_detail["ddl"] = ddl_lookup[proc_name]
            nodes.append(
                CytoscapeNode(
                    id=proc_name,
                    label=proc_name.split(".")[-1],
                    type="proc",
                    detail=proc_detail,
                )
            )
            seen_nodes.add(proc_name)

        for ref in write_refs:
            step_str = _step_label(ref.step)
            edges.append(
                CytoscapeEdge(
                    source=proc_name,
                    target=table_name,
                    type="write",
                    step=step_str,
                    label=f"{step_str} {ref.operation}",
                )
            )

        for ref in read_refs:
            step_str = _step_label(ref.step)
            edges.append(
                CytoscapeEdge(
                    source=table_name,
                    target=proc_name,
                    type="read",
                    step=step_str,
                    label=f"{step_str} {ref.operation}",
                )
            )

    return GraphResponse(nodes=nodes, edges=edges)
