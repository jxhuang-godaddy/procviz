import type { CytoscapeEdgeData, CytoscapeNodeData } from "../types/graph";

interface DetailPanelProps {
  node: CytoscapeNodeData | null;
  edge: CytoscapeEdgeData | null;
}

export default function DetailPanel({ node, edge }: DetailPanelProps) {
  if (!node && !edge) return null;

  return (
    <div className="w-60 min-w-60 border-l border-gray-200 bg-white p-4 overflow-y-auto text-sm">
      {node && <NodeDetail node={node} />}
      {edge && <EdgeDetail edge={edge} />}
    </div>
  );
}

function NodeDetail({ node }: { node: CytoscapeNodeData }) {
  const detail = node.detail || {};
  const parameters = (detail.parameters || []) as Array<{
    name: string;
    data_type: string;
    direction: string;
  }>;
  const columns = (detail.columns || []) as Array<{
    name: string;
    data_type: string;
    nullable: boolean;
  }>;

  return (
    <>
      <div className="font-semibold text-purple-700">{node.label}</div>
      <div className="text-xs text-gray-400 mb-3 uppercase">{node.type}</div>

      {parameters.length > 0 && (
        <>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
            Parameters
          </div>
          <div className="font-mono text-xs bg-gray-50 p-2 rounded mb-3">
            {parameters.map((p) => (
              <div key={p.name}>
                {p.direction} {p.name} {p.data_type}
              </div>
            ))}
          </div>
        </>
      )}

      {columns.length > 0 && (
        <>
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
            Columns
          </div>
          <div className="font-mono text-xs bg-gray-50 p-2 rounded mb-3">
            {columns.map((c) => (
              <div key={c.name}>
                {c.name} {c.data_type}
                {c.nullable ? "" : " NOT NULL"}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function EdgeDetail({ edge }: { edge: CytoscapeEdgeData }) {
  return (
    <>
      <div className="font-semibold text-purple-700">{edge.label}</div>
      <div className="text-xs text-gray-400 mb-3">
        {edge.source} → {edge.target}
      </div>
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
        Type
      </div>
      <div className="text-xs mb-3">{edge.type}</div>
    </>
  );
}
