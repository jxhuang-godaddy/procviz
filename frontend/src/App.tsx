import { useCallback, useState } from "react";
import TreeSidebar from "./components/TreeSidebar";
import DiagramView from "./components/DiagramView";
import DetailPanel from "./components/DetailPanel";
import Legend from "./components/Legend";
import { useDataflow } from "./hooks/useDataflow";
import type { CytoscapeEdgeData, CytoscapeNodeData, ObjectType } from "./types/graph";

interface Selection {
  db: string;
  objectType: ObjectType;
  name: string;
}

export default function App() {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selectedNode, setSelectedNode] = useState<CytoscapeNodeData | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<CytoscapeEdgeData | null>(null);

  const { graph, loading, error } = useDataflow(
    selection?.db ?? null,
    selection?.objectType ?? null,
    selection?.name ?? null
  );

  function handleSelect(db: string, objectType: ObjectType, name: string) {
    setSelection({ db, objectType, name });
    setSelectedNode(null);
    setSelectedEdge(null);
  }

  const handleSelectNode = useCallback((node: CytoscapeNodeData | null) => {
    setSelectedNode(node);
    setSelectedEdge(null);
  }, []);

  const handleSelectEdge = useCallback((edge: CytoscapeEdgeData | null) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
  }, []);

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900">
      <TreeSidebar onSelect={handleSelect} />

      <div className="flex-1 relative">
        {!selection && (
          <div className="flex items-center justify-center h-full text-gray-400">
            Select a procedure or table to view its data flow
          </div>
        )}
        {loading && (
          <div className="flex items-center justify-center h-full text-gray-400">
            Loading...
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-full text-red-500">
            Error: {error}
          </div>
        )}
        {graph && !loading && (
          <>
            <DiagramView
              graph={graph}
              onSelectNode={handleSelectNode}
              onSelectEdge={handleSelectEdge}
            />
            <Legend />
          </>
        )}
      </div>

      <DetailPanel node={selectedNode} edge={selectedEdge} />
    </div>
  );
}
