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
