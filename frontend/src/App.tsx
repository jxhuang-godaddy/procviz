import { useRef, useState } from "react";
import TreeSidebar from "./components/TreeSidebar";
import DiagramView, { type DiagramHandle } from "./components/DiagramView";
import DetailModal from "./components/DetailModal";
import Legend from "./components/Legend";
import ExportMenu from "./components/ExportMenu";
import { useDataflow } from "./hooks/useDataflow";
import type { CytoscapeEdgeData, CytoscapeNodeData, ObjectType } from "./types/graph";

interface Selection {
  db: string;
  objectType: ObjectType;
  name: string;
}

export type DetailSelection =
  | { kind: "node"; data: CytoscapeNodeData }
  | { kind: "edge"; data: CytoscapeEdgeData }
  | null;

export default function App() {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [detail, setDetail] = useState<DetailSelection>(null);
  const diagramRef = useRef<DiagramHandle>(null);

  const { graph, loading, error } = useDataflow(
    selection?.db ?? null,
    selection?.objectType ?? null,
    selection?.name ?? null
  );

  function handleSelect(db: string, objectType: ObjectType, name: string) {
    setSelection({ db, objectType, name });
    setDetail(null);
  }

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
            <DiagramView ref={diagramRef} graph={graph} onSelect={setDetail} />
            <Legend />
            <ExportMenu
              getCy={() => diagramRef.current?.getCy() ?? null}
              objectName={selection?.name ?? "diagram"}
            />
          </>
        )}
      </div>

      <DetailModal detail={detail} onClose={() => setDetail(null)} graph={graph} />
    </div>
  );
}
