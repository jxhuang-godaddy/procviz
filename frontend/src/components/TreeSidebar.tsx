import { useCallback, useEffect, useRef, useState } from "react";
import { useDatabases } from "../hooks/useDatabases";
import { useObjects } from "../hooks/useObjects";
import type { ObjectType } from "../types/graph";

interface TreeSidebarProps {
  onSelect: (db: string, objectType: ObjectType, name: string) => void;
  activeSelection?: { db: string; objectType: ObjectType; name: string } | null;
}

export default function TreeSidebar({ onSelect, activeSelection }: TreeSidebarProps) {
  const { databases, loading: dbLoading, error } = useDatabases();
  const { objectTypes, objects, loadObjectTypes, loadObjects } = useObjects();

  const [expandedDbs, setExpandedDbs] = useState<Set<string>>(new Set());
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [dbFilter, setDbFilter] = useState("");
  const [objFilters, setObjFilters] = useState<Record<string, string>>({});
  const [width, setWidth] = useState(224);
  const dragging = useRef(false);

  const onMouseDown = useCallback(() => {
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return;
      const newWidth = Math.max(160, Math.min(500, e.clientX));
      setWidth(newWidth);
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

  // Sync sidebar expansion when external navigation occurs (e.g., double-click)
  useEffect(() => {
    if (!activeSelection) return;
    const { db, objectType, name } = activeSelection;
    const key = `${db}/${objectType}/${name}`;
    if (selected === key) return; // already showing this selection

    // Expand the db and type, load data if needed
    setExpandedDbs((prev) => new Set(prev).add(db));
    loadObjectTypes(db);
    const typeKey = `${db}/${objectType}`;
    setExpandedTypes((prev) => new Set(prev).add(typeKey));
    loadObjects(db, objectType);
    setSelected(key);
  }, [activeSelection]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleDb(db: string) {
    const next = new Set(expandedDbs);
    if (next.has(db)) {
      next.delete(db);
    } else {
      next.add(db);
      loadObjectTypes(db);
    }
    setExpandedDbs(next);
  }

  function toggleType(db: string, objType: ObjectType) {
    const key = `${db}/${objType}`;
    const next = new Set(expandedTypes);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
      loadObjects(db, objType);
    }
    setExpandedTypes(next);
  }

  function handleSelect(db: string, objType: ObjectType, name: string) {
    const key = `${db}/${objType}/${name}`;
    setSelected(key);
    onSelect(db, objType, name);
  }

  const filterLower = dbFilter.toLowerCase();
  const filteredDatabases = filterLower
    ? databases.filter((db) => db.toLowerCase().includes(filterLower))
    : databases;

  if (dbLoading) return <div className="p-3 text-sm text-gray-400">Loading databases...</div>;
  if (error) return <div className="p-3 text-sm text-red-500">Error: {error}</div>;

  return (
    <div className="flex flex-shrink-0" style={{ width }}>
      <div className="flex-1 border-r border-gray-200 bg-white overflow-y-auto overflow-x-hidden text-sm">
        <div className="px-3 py-2">
          <input
            type="text"
            placeholder="Filter databases..."
            value={dbFilter}
            onChange={(e) => setDbFilter(e.target.value)}
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-purple-400"
          />
        </div>
        {filteredDatabases.map((db) => (
          <div key={db}>
            <button
              className="flex items-center gap-1 w-full px-3 py-1 hover:bg-gray-50 text-left"
              onClick={() => toggleDb(db)}
            >
              <span className="text-gray-400 flex-shrink-0">
                {expandedDbs.has(db) ? "\u25BC" : "\u25B6"}
              </span>
              <span
                className={`truncate ${expandedDbs.has(db) ? "font-semibold" : ""}`}
                title={db}
              >
                {db}
              </span>
            </button>

            {expandedDbs.has(db) && objectTypes[db]?.map((objType) => (
              <div key={objType} className="ml-4">
                <button
                  className="flex items-center gap-1 w-full px-3 py-1 hover:bg-gray-50 text-left"
                  onClick={() => toggleType(db, objType as ObjectType)}
                >
                  <span className="text-gray-400 flex-shrink-0">
                    {expandedTypes.has(`${db}/${objType}`) ? "\u25BC" : "\u25B6"}
                  </span>
                  <span className="truncate">{objType}</span>
                </button>

                {expandedTypes.has(`${db}/${objType}`) && (() => {
                  const typeKey = `${db}/${objType}`;
                  const allObjs = objects[typeKey] ?? [];
                  const filterVal = (objFilters[typeKey] ?? "").toLowerCase();
                  const filtered = filterVal
                    ? allObjs.filter((o) => o.name.toLowerCase().includes(filterVal))
                    : allObjs;
                  return (
                    <>
                      {allObjs.length > 10 && (
                        <input
                          type="text"
                          placeholder={`Filter ${objType}s...`}
                          value={objFilters[typeKey] ?? ""}
                          onChange={(e) => setObjFilters((prev) => ({ ...prev, [typeKey]: e.target.value }))}
                          className="ml-8 mr-2 mt-1 px-2 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-purple-400"
                          style={{ width: "calc(100% - 2.5rem)" }}
                        />
                      )}
                      {filtered.map((obj) => {
                        const key = `${db}/${objType}/${obj.name}`;
                        return (
                          <button
                            key={obj.name}
                            className={`block w-full text-left ml-8 px-2 py-1 rounded text-xs truncate ${
                              selected === key
                                ? "bg-purple-600 text-white"
                                : "text-gray-600 hover:bg-gray-100"
                            }`}
                            title={obj.name}
                            onClick={() => handleSelect(db, objType as ObjectType, obj.name)}
                          >
                            {obj.name}
                          </button>
                        );
                      })}
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        ))}
      </div>
      {/* Drag handle */}
      <div
        className="w-1 cursor-col-resize bg-transparent hover:bg-purple-300 active:bg-purple-400 flex-shrink-0"
        onMouseDown={onMouseDown}
      />
    </div>
  );
}
