from pydantic import BaseModel


# --- Parser output ---

class TableRef(BaseModel):
    name: str
    operation: str
    step: int


class CallRef(BaseModel):
    target: str
    step: int


class DataFlowResult(BaseModel):
    table_refs: list[TableRef]
    call_refs: list[CallRef]
    errors: list[str]


# --- Connector output ---

class DatabaseObject(BaseModel):
    name: str
    object_type: str
    database: str


class ColumnInfo(BaseModel):
    name: str
    data_type: str
    nullable: bool


class ParameterInfo(BaseModel):
    name: str
    data_type: str
    direction: str


# --- API response (Cytoscape JSON) ---

class CytoscapeNode(BaseModel):
    id: str
    label: str
    type: str
    detail: dict


class CytoscapeEdge(BaseModel):
    source: str
    target: str
    type: str
    step: str
    label: str


class GraphResponse(BaseModel):
    nodes: list[CytoscapeNode]
    edges: list[CytoscapeEdge]
