from unittest.mock import patch

from fastapi.testclient import TestClient

from app import app
from models.schemas import (
    ColumnInfo,
    DatabaseObject,
    DataFlowResult,
    ParameterInfo,
    TableRef,
)

client = TestClient(app)


def test_health():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


@patch("api.routes.teradata")
def test_list_databases(mock_td):
    mock_td.get_databases.return_value = ["SALES_DB", "FINANCE_DB"]
    resp = client.get("/api/databases")
    assert resp.status_code == 200
    assert resp.json() == ["SALES_DB", "FINANCE_DB"]


def test_object_types():
    resp = client.get("/api/databases/SALES_DB/object-types")
    assert resp.status_code == 200
    assert resp.json() == ["procedure", "macro", "table", "view"]


@patch("api.routes.teradata")
def test_list_objects(mock_td):
    mock_td.get_objects.return_value = [
        DatabaseObject(name="sp_load", object_type="procedure", database="SALES_DB"),
    ]
    resp = client.get("/api/databases/SALES_DB/procedure")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["name"] == "sp_load"


@patch("api.routes.teradata")
def test_dataflow_procedure(mock_td):
    mock_td.get_ddl.return_value = "SELECT * FROM db.t1;"
    mock_td.get_parameters.return_value = [
        ParameterInfo(name="p_date", data_type="DATE", direction="IN"),
    ]
    resp = client.get("/api/databases/SALES_DB/procedure/sp_load/dataflow")
    assert resp.status_code == 200
    data = resp.json()
    assert "nodes" in data
    assert "edges" in data


@patch("api.routes.teradata")
def test_dataflow_table_reverse_lookup(mock_td):
    mock_td.get_objects.return_value = [
        DatabaseObject(name="sp_load", object_type="procedure", database="db"),
    ]
    mock_td.get_ddl.return_value = "SELECT * FROM db.orders;"
    mock_td.get_columns.return_value = [
        ColumnInfo(name="id", data_type="INTEGER", nullable=False),
    ]
    resp = client.get("/api/databases/db/table/orders/dataflow")
    assert resp.status_code == 200
    data = resp.json()
    assert "nodes" in data


@patch("api.routes.teradata")
def test_invalid_object_type(mock_td):
    resp = client.get("/api/databases/SALES_DB/invalid_type")
    assert resp.status_code == 400
