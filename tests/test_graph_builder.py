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
    # 1 proc + 1 step + 2 table = 4 nodes
    assert len(result.nodes) == 4
    node_types = {n.id: n.type for n in result.nodes}
    assert node_types["sp_load"] == "proc"
    assert node_types["sp_load__step_1"] == "step"
    assert node_types["db.orders_stg"] == "table"
    assert node_types["db.orders_fact"] == "table"

    visible_edges = [e for e in result.edges if not e.hidden]
    # input_table→step (read) + step→output_table (write) = 2 visible
    assert len(visible_edges) == 2


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
    # proc + step1 + table + step2 + caller = 5
    assert len(result.nodes) == 5
    assert node_types["sp_main__step_1"] == "step"
    assert node_types["sp_main__step_2"] == "step"
    assert node_types["db.sp_notify"] == "caller"


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
    step_nodes = [n for n in result.nodes if n.type == "step"]
    assert len(step_nodes) == 2
    step_labels = {n.label for n in step_nodes}
    assert "[1] SELECT" in step_labels
    assert "[2] INSERT" in step_labels

    center = next(n for n in result.nodes if n.id == "sp_x")
    assert center.type == "macro"


def test_dataflow_graph_no_input_gets_direct_edge():
    """Steps with only outputs (e.g. DELETE) get a direct proc → step edge."""
    dataflow = DataFlowResult(
        table_refs=[TableRef(name="db.tmp", operation="DELETE", step=1)],
        call_refs=[],
        errors=[],
    )
    result = build_dataflow_graph(
        obj_name="sp_clean",
        obj_type="procedure",
        dataflow=dataflow,
        detail_data={"parameters": [], "sql_snippets": {}},
    )
    visible_edges = [e for e in result.edges if not e.hidden]
    # proc→step (call) + step→table (write) = 2 visible
    assert len(visible_edges) == 2
    sources = {e.source for e in visible_edges}
    assert "sp_clean" in sources


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
    # Center table + 2 procs = 3
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
    assert len(result.nodes) == 1
    assert len(result.edges) == 0
