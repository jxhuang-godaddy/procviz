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
