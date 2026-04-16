import { useCallback, useRef, useState } from "react";
import TreeSidebar from "./components/TreeSidebar";
import DiagramView, { type DiagramHandle, type VisibilityMap } from "./components/DiagramView";
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
  const [visibility, setVisibility] = useState<VisibilityMap>({
    nodes: { proc: true, macro: true, step: true, table: true, volatile: true, caller: true },
    edges: { call: true, read: true, write: true },
  });
  const diagramRef = useRef<DiagramHandle>(null);

  const handleToggle = useCallback((category: "nodes" | "edges", key: string) => {
    setVisibility((prev) => ({
      ...prev,
      [category]: { ...prev[category], [key]: !prev[category][key] },
    }));
  }, []);

  const { graph, loading, error, progress } = useDataflow(
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
            <div className="text-center">
              <div>{progress ?? "Loading..."}</div>
            </div>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-full text-red-500">
            Error: {error}
          </div>
        )}
        {graph && !loading && (
          <>
            <DiagramView ref={diagramRef} graph={graph} onSelect={setDetail} visibility={visibility} />
            <Legend visibility={visibility} onToggle={handleToggle} />
            <div className="absolute top-4 right-4 z-10 flex gap-1.5">
              <div className="flex bg-white border border-gray-300 rounded shadow-sm text-sm">
                <button
                  onClick={() => { const cy = diagramRef.current?.getCy(); if (cy) { cy.fit(undefined, 30); } }}
                  className="px-2.5 py-1.5 hover:bg-gray-50 border-r border-gray-300"
                  title="Fit to screen"
                >
                  Fit
                </button>
                <button
                  onClick={() => { const cy = diagramRef.current?.getCy(); if (cy) { cy.zoom(cy.zoom() * 1.3); cy.center(); } }}
                  className="px-2.5 py-1.5 hover:bg-gray-50 border-r border-gray-300"
                  title="Zoom in"
                >
                  +
                </button>
                <button
                  onClick={() => { const cy = diagramRef.current?.getCy(); if (cy) { cy.zoom(cy.zoom() / 1.3); cy.center(); } }}
                  className="px-2.5 py-1.5 hover:bg-gray-50"
                  title="Zoom out"
                >
                  &minus;
                </button>
              </div>
              <ExportMenu
                getCy={() => diagramRef.current?.getCy() ?? null}
                objectName={selection?.name ?? "diagram"}
              />
            </div>
          </>
        )}
      </div>

      <DetailModal detail={detail} onClose={() => setDetail(null)} graph={graph} />
    </div>
  );
}
