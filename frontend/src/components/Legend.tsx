export default function Legend() {
  return (
    <div className="absolute bottom-4 left-4 bg-white/90 border border-gray-200 rounded p-3 text-xs">
      <div className="font-semibold mb-1">Nodes</div>
      <div className="flex items-center gap-2 mb-0.5">
        <span className="inline-block w-3 h-3 rounded" style={{ background: "#534AB7" }} />
        Procedure / Macro
      </div>
      <div className="flex items-center gap-2 mb-0.5">
        <span className="inline-block w-3 h-3 rounded" style={{ background: "#3B82F6" }} />
        SQL Step
      </div>
      <div className="flex items-center gap-2 mb-0.5">
        <span className="inline-block w-3 h-3 rounded" style={{ background: "#0F6E56" }} />
        Table / View
      </div>
      <div className="flex items-center gap-2 mb-0.5">
        <span className="inline-block w-3 h-3 rounded border border-dashed" style={{ background: "#D97706", borderColor: "#B45309" }} />
        Volatile Table
      </div>
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-block w-3 h-3 rounded" style={{ background: "#888" }} />
        Called Procedure
      </div>
      <div className="font-semibold mb-1">Edges</div>
      <div className="flex items-center gap-2 mb-0.5">
        <span className="inline-block w-6 h-0.5" style={{ background: "#94A3B8" }} />
        Execution Flow
      </div>
      <div className="flex items-center gap-2 mb-0.5">
        <span className="inline-block w-6 h-0.5" style={{ background: "#1D9E75" }} />
        Read (SELECT)
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block w-6 h-0.5" style={{ background: "#534AB7" }} />
        Write (INSERT/UPDATE/...)
      </div>
    </div>
  );
}
