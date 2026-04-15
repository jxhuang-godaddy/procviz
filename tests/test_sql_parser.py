from models.schemas import DataFlowResult
from parsers.sql_parser import parse_dataflow


def test_simple_select():
    ddl = "SELECT * FROM sales_db.orders;"
    result = parse_dataflow(ddl)
    assert isinstance(result, DataFlowResult)
    assert len(result.table_refs) == 1
    assert result.table_refs[0].name == "sales_db.orders"
    assert result.table_refs[0].operation == "SELECT"
    assert result.table_refs[0].step == 1


def test_insert_select():
    ddl = """
    INSERT INTO sales_db.orders_fact
    SELECT o.*, c.region
    FROM sales_db.orders_stg o
    JOIN sales_db.customer_dim c ON o.cust_id = c.cust_id;
    """
    result = parse_dataflow(ddl)
    ops = {ref.name: ref.operation for ref in result.table_refs}
    assert ops["sales_db.orders_fact"] == "INSERT"
    assert ops["sales_db.orders_stg"] == "SELECT"
    assert ops["sales_db.customer_dim"] == "SELECT"


def test_update():
    ddl = "UPDATE sales_db.orders SET status = 'done' WHERE id = 1;"
    result = parse_dataflow(ddl)
    assert len(result.table_refs) == 1
    assert result.table_refs[0].operation == "UPDATE"


def test_delete():
    ddl = "DELETE FROM sales_db.orders_stg WHERE processed = 1;"
    result = parse_dataflow(ddl)
    assert len(result.table_refs) == 1
    assert result.table_refs[0].operation == "DELETE"


def test_merge():
    ddl = """
    MERGE INTO sales_db.orders_fact tgt
    USING sales_db.orders_stg src ON tgt.id = src.id
    WHEN MATCHED THEN UPDATE SET tgt.amount = src.amount
    WHEN NOT MATCHED THEN INSERT (id, amount) VALUES (src.id, src.amount);
    """
    result = parse_dataflow(ddl)
    ops = {ref.name: ref.operation for ref in result.table_refs}
    assert ops["sales_db.orders_fact"] == "MERGE"
    assert ops["sales_db.orders_stg"] == "SELECT"


def test_multiple_statements_step_numbers():
    ddl = """
    SELECT * FROM db.t1;
    INSERT INTO db.t2 SELECT * FROM db.t3;
    UPDATE db.t4 SET x = 1;
    """
    result = parse_dataflow(ddl)
    steps = {ref.name: ref.step for ref in result.table_refs}
    assert steps["db.t1"] == 1
    assert steps["db.t2"] == 2
    assert steps["db.t3"] == 2
    assert steps["db.t4"] == 3


def test_call_statement():
    ddl = "CALL sales_db.sp_notify('done');"
    result = parse_dataflow(ddl)
    assert len(result.call_refs) == 1
    assert result.call_refs[0].target == "sales_db.sp_notify"


def test_procedure_body():
    ddl = """
    REPLACE PROCEDURE sales_db.sp_load(IN p_date DATE)
    BEGIN
        INSERT INTO sales_db.orders_fact
        SELECT * FROM sales_db.orders_stg WHERE order_date = p_date;

        DELETE FROM sales_db.orders_stg WHERE order_date = p_date;

        CALL sales_db.sp_notify('load complete');
    END;
    """
    result = parse_dataflow(ddl)
    ops = {ref.name: ref.operation for ref in result.table_refs}
    assert "sales_db.orders_fact" in ops
    assert "sales_db.orders_stg" in ops
    assert len(result.call_refs) == 1


def test_cte():
    ddl = """
    WITH recent AS (SELECT * FROM db.orders WHERE dt > CURRENT_DATE - 7)
    INSERT INTO db.summary SELECT count(*) FROM recent;
    """
    result = parse_dataflow(ddl)
    names = {ref.name for ref in result.table_refs}
    assert "db.orders" in names
    assert "db.summary" in names
    # CTE alias "recent" should NOT appear as a table ref
    assert "recent" not in names


def test_unparseable_ddl_returns_errors():
    ddl = "THIS IS NOT VALID SQL AT ALL !!!"
    result = parse_dataflow(ddl)
    assert isinstance(result, DataFlowResult)
    assert len(result.errors) > 0


def test_empty_ddl():
    result = parse_dataflow("")
    assert result.table_refs == []
    assert result.call_refs == []
