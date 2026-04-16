export interface CytoscapeNodeData {
  id: string;
  label: string;
  type: "proc" | "macro" | "table" | "volatile" | "caller" | "step";
  detail: Record<string, unknown>;
}

export interface CytoscapeEdgeData {
  source: string;
  target: string;
  type: "read" | "write" | "call";
  step: string;
  label: string;
  hidden?: boolean;
}

export interface GraphResponse {
  nodes: CytoscapeNodeData[];
  edges: CytoscapeEdgeData[];
}

export interface DatabaseObject {
  name: string;
  object_type: string;
  database: string;
}

export type ObjectType = "procedure" | "macro" | "table" | "view";
