# ProcViz User Guide

A guide for tracing data lineage in Teradata using ProcViz. No SQL knowledge required.

## Getting Started

1. Open your browser and go to **http://localhost:8000**
2. The left sidebar shows all Teradata databases you have access to
3. Click a database name to expand it and see object types: **procedure**, **macro**, **table**, **view**
4. Click an object type to see the list of objects
5. Click any object to generate its data flow diagram

**Tip:** Use the filter box at the top of the sidebar to search databases by name. When an object list has more than 10 items, a second filter box appears to search within that list.

---

## Scenario 1: "What does this stored procedure do?"

You've been told that `usp_Load_DailySales` loads the daily sales data, but you want to understand exactly which tables it reads from and writes to.

**Steps:**

1. In the sidebar, expand the database that contains the procedure (e.g., `SALES_DB`)
2. Expand **procedure**
3. Click **usp_Load_DailySales**

**What you'll see:**

A left-to-right diagram with four columns:

```
Procedure --> Input Tables --> SQL Steps --> Output Tables
```

- **Purple node** (left): The procedure itself
- **Teal nodes** (second column): Tables the procedure reads from (SELECT)
- **Blue nodes** (third column): Each SQL statement in the procedure, labeled with step number and line number (e.g., `[1] INSERT / SELECT L#42`)
- **Teal nodes** (fourth column): Tables the procedure writes to (INSERT, UPDATE, DELETE)
- **Amber nodes** with dashed borders: Temporary (volatile) tables created during execution
- **Gray nodes**: Other procedures this one calls

**Green arrows** = reads, **purple arrows** = writes, **gray dashed arrows** = calls.

**To see the actual SQL:** Click any blue step node. A modal window opens showing the SQL statement with syntax highlighting and line numbers. Click **Copy** to copy it to your clipboard.

**To see the full procedure definition:** Click the purple procedure node. The modal shows the complete DDL with line numbers matching your SQL editor.

---

## Scenario 2: "Where does this table's data come from?"

You're looking at a report table called `rpt_daily_revenue` and want to know which procedures load data into it.

**Steps:**

1. In the sidebar, expand the database (e.g., `FINANCE_DB`)
2. Expand **table**
3. Click **rpt_daily_revenue**

**What you'll see:**

A three-column diagram:

```
Writer Procedures --> Table --> Reader Procedures
```

- **Purple nodes** on the left: Procedures that write to this table (INSERT, UPDATE, DELETE, MERGE)
- **Teal node** in the center: The table itself
- **Purple nodes** on the right: Procedures that read from this table (SELECT)

If the table has no readers or writers, it appears as a single standalone node -- this is normal for unused or newly created tables.

**Note:** The first time you view a table in a database, ProcViz scans all procedures and macros in that database. You'll see a progress indicator showing what's being scanned (e.g., "Parsing procedures: usp_Load_Sales (3/47)"). Subsequent table lookups in the same database are instant.

**To see a procedure's source code:** Click any procedure node. The modal shows the full DDL so you can see exactly what the procedure does to this table.

---

## Scenario 3: "Trace the full data pipeline"

You want to follow data from its source tables through multiple procedures to a final report table.

**Steps:**

1. Start with the final report table (see Scenario 2 above) to find which procedure writes to it
2. **Double-click** a writer procedure node to jump to that procedure's own diagram
3. In the procedure diagram, look at the input tables (second column) to see where the data comes from
4. **Double-click** any input table to jump to that table's diagram and see what writes to it
5. Repeat until you reach the source tables

Each double-click generates a new diagram. The sidebar automatically updates to show your current location. The **diagram title** in the top-left corner always shows which database and object you're viewing.

**Example trace:**

```
rpt_daily_revenue (table diagram)
  --> written by usp_Load_DailyRevenue (double-click to open)
    --> reads from stg_orders (double-click to open)
      --> written by usp_Stage_Orders (double-click to open)
        --> reads from src_order_system (source table -- end of chain)
```

---

## Scenario 4: "What happens if I change this table?"

You need to add a column to `dim_customer` and want to know which procedures will be affected.

**Steps:**

1. Open the table diagram for `dim_customer` (Scenario 2)
2. Look at both sides of the diagram:
   - **Left side** (writers): Procedures that load data into this table -- these may need to populate the new column
   - **Right side** (readers): Procedures that read from this table -- these may need updating if they use `SELECT *`
3. Click each procedure node to review its SQL and check if it references specific columns

**Tip:** Use the **visibility toggles** in the bottom-left legend to focus on just readers or just writers:
- Uncheck **Write** edges to see only procedures that read from the table
- Uncheck **Read** edges to see only procedures that write to the table

---

## Scenario 5: "Understand a view's data sources"

You want to know which tables feed into a view called `v_active_customers`.

**Steps:**

1. In the sidebar, expand the database
2. Expand **view**
3. Click **v_active_customers**

**What you'll see:**

A three-column diagram:

```
Source Tables --> CREATE VIEW step --> View
```

- **Teal nodes** (left): Tables the view selects from
- **Blue node** (center): The CREATE VIEW statement
- **Teal node** (right): The view itself

Click the view node to see its column list. Click the step node to see the full CREATE VIEW SQL.

---

## Working with Diagrams

### Navigating

| Action | What it does |
|---|---|
| **Click** a node | Opens detail modal with SQL/DDL |
| **Double-click** a node | Navigates to that object's own diagram |
| **Scroll wheel** | Zoom in/out |
| **Click and drag** the background | Pan the diagram |
| **Fit** button (top-right) | Zoom to fit entire diagram on screen |
| **+** / **-** buttons | Zoom in / zoom out |

### Filtering the Diagram

Use the **legend checkboxes** in the bottom-left corner to show or hide parts of the diagram:

**Node types:**
- Procedure/Macro -- purple nodes
- SQL Step -- blue nodes
- Table/View -- teal nodes
- Volatile Table -- amber dashed nodes
- Called Procedure -- gray nodes

**Edge types:**
- Read (SELECT) -- green arrows
- Write (INSERT/UPDATE/DELETE) -- purple arrows
- Execution Flow (CALL) -- gray dashed arrows

When you hide a node type, its connected edges are automatically hidden. Nodes that lose all their visible connections are also hidden automatically.

### Exporting Diagrams

Click the **Export** button in the top-right corner to save the diagram:

| Format | Best for |
|---|---|
| **PNG** | Inserting into presentations or documents |
| **JPG** | Email attachments (smaller file size) |
| **PDF** | Printing or formal documentation |
| **HTML** | Sharing an interactive version (recipients can pan, zoom, and click nodes) |
| **JSON** | Technical use -- importing into other Cytoscape.js tools |

### Reading Node Labels

- Node labels show the object name. When a diagram involves tables from multiple databases, labels include the database prefix (e.g., `SALES_DB.orders` instead of just `orders`).
- SQL step labels show the step number, operation type, and source line number: `[1] INSERT / SELECT  L#42`. The `L#42` means line 42 in the original DDL.

### Detail Modal

When you click a node, the detail modal shows:

- **Procedure/Macro**: Full DDL definition with line numbers
- **SQL Step**: The extracted SQL statement
- **Table/View**: DDL fetched from Teradata (column definitions, indexes)
- **Volatile Table**: The CREATE statement
- **Edge**: Source node, target node, operation type

The modal is **resizable** (drag the edges) and **draggable** (drag the title bar). Click the **X** or click the diagram background to close it.
