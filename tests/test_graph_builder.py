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
