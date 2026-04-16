import { useCallback, useEffect, useRef, useState } from "react";
import type { CytoscapeEdgeData, CytoscapeNodeData } from "../types/graph";
import type { DetailSelection } from "../App";

interface DetailPanelProps {
  detail: DetailSelection;
  onToggle: () => void;
}

export default function DetailPanel({ detail }: DetailPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(256);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [width]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return;
      // Dragging left = making panel wider (clientX decreases)
      const delta = startX.current - e.clientX;
      setWidth(Math.max(180, Math.min(500, startWidth.current + delta)));
    }
    function onMouseUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  if (collapsed) {
    return (
      <div className="flex-shrink-0 border-l border-gray-200 bg-white">
        <button
          className="px-1.5 py-2 text-gray-400 hover:text-gray-700"
          onClick={() => setCollapsed(false)}
          title="Show detail panel"
        >
          ◀
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-shrink-0" style={{ width }}>
      {/* Drag handle */}
      <div
        className="w-1 cursor-col-resize bg-transparent hover:bg-purple-300 active:bg-purple-400 flex-shrink-0"
        onMouseDown={onMouseDown}
      />
      <div className="flex-1 border-l border-gray-200 bg-white flex flex-col overflow-hidden">
        <button
          className="px-3 py-2 text-xs text-gray-400 hover:text-gray-700 text-left flex-shrink-0 border-b border-gray-100"
          onClick={() => setCollapsed(true)}
          title="Hide detail panel"
        >
          ▶ Detail
        </button>
        <div className="p-4 overflow-y-auto text-sm flex-1">
          {!detail && (
            <div className="text-gray-400 text-xs">Click a node or edge to see details</div>
          )}
          {detail?.kind === "node" && <NodeDetail node={detail.data} />}
          {detail?.kind === "edge" && <EdgeDetail edge={detail.data} />}
        </div>
      </div>
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
      <div className="font-semibold text-purple-700 break-words">{node.label}</div>
      <div className="text-xs text-gray-400 mb-3 uppercase">{node.type}</div>

      {node.id !== node.label && (
        <div className="text-xs text-gray-500 mb-3 break-all">{node.id}</div>
      )}

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

      {parameters.length === 0 && columns.length === 0 && (
        <div className="text-xs text-gray-400">No additional details available</div>
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
      <div className="text-xs mb-3 capitalize">{edge.type}</div>
    </>
  );
}
