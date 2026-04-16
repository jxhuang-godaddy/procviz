import type { VisibilityMap } from "./DiagramView";

const NODE_ITEMS: { key: string; color: string; label: string; dashed?: boolean }[] = [
  { key: "proc",     color: "#534AB7", label: "Procedure / Macro" },
  { key: "step",     color: "#3B82F6", label: "SQL Step" },
  { key: "table",    color: "#0F6E56", label: "Table / View" },
  { key: "volatile", color: "#D97706", label: "Volatile Table", dashed: true },
  { key: "caller",   color: "#888888", label: "Called Procedure" },
];

const EDGE_ITEMS: { key: string; color: string; label: string }[] = [
  { key: "call",  color: "#94A3B8", label: "Execution Flow" },
  { key: "read",  color: "#1D9E75", label: "Read (SELECT)" },
  { key: "write", color: "#534AB7", label: "Write (INSERT/UPDATE/...)" },
];

interface LegendProps {
  visibility: VisibilityMap;
  onToggle: (category: "nodes" | "edges", key: string) => void;
}

export default function Legend({ visibility, onToggle }: LegendProps) {
  return (
    <div className="absolute bottom-4 left-4 bg-white/90 border border-gray-200 rounded p-3 text-xs select-none">
      <div className="font-semibold mb-1">Nodes</div>
      {NODE_ITEMS.map((item) => {
        // proc and macro share one checkbox
        const checked = item.key === "proc"
          ? visibility.nodes.proc && visibility.nodes.macro
          : visibility.nodes[item.key] ?? true;
        return (
          <label key={item.key} className="flex items-center gap-2 mb-0.5 cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              onChange={() => {
                onToggle("nodes", item.key);
                if (item.key === "proc") onToggle("nodes", "macro");
              }}
              className="accent-slate-500"
            />
            <span
              className="inline-block w-3 h-3 rounded"
              style={{
                background: item.color,
                ...(item.dashed ? { border: "1px dashed #B45309" } : {}),
              }}
            />
            {item.label}
          </label>
        );
      })}

      <div className="font-semibold mb-1 mt-2">Edges</div>
      {EDGE_ITEMS.map((item) => (
        <label key={item.key} className="flex items-center gap-2 mb-0.5 cursor-pointer">
          <input
            type="checkbox"
            checked={visibility.edges[item.key] ?? true}
            onChange={() => onToggle("edges", item.key)}
            className="accent-slate-500"
          />
          <span className="inline-block w-6 h-0.5" style={{ background: item.color }} />
          {item.label}
        </label>
      ))}
    </div>
  );
}
