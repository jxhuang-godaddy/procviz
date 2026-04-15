import { useState } from "react";
import { useDatabases } from "../hooks/useDatabases";
import { useObjects } from "../hooks/useObjects";
import type { ObjectType } from "../types/graph";

interface TreeSidebarProps {
  onSelect: (db: string, objectType: ObjectType, name: string) => void;
}

export default function TreeSidebar({ onSelect }: TreeSidebarProps) {
  const { databases, loading: dbLoading, error } = useDatabases();
  const { objectTypes, objects, loadObjectTypes, loadObjects } = useObjects();

  const [expandedDbs, setExpandedDbs] = useState<Set<string>>(new Set());
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);

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

  if (dbLoading) return <div className="p-3 text-sm text-gray-400">Loading databases...</div>;
  if (error) return <div className="p-3 text-sm text-red-500">Error: {error}</div>;

  return (
    <div className="w-56 min-w-56 border-r border-gray-200 bg-white overflow-y-auto text-sm">
      <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
        Databases
      </div>
      {databases.map((db) => (
        <div key={db}>
          <button
            className="flex items-center gap-1 w-full px-3 py-1 hover:bg-gray-50 text-left"
            onClick={() => toggleDb(db)}
          >
            <span className="text-gray-400">{expandedDbs.has(db) ? "▼" : "▶"}</span>
            <span className={expandedDbs.has(db) ? "font-semibold" : ""}>{db}</span>
          </button>

          {expandedDbs.has(db) && objectTypes[db]?.map((objType) => (
            <div key={objType} className="ml-4">
              <button
                className="flex items-center gap-1 w-full px-3 py-1 hover:bg-gray-50 text-left"
                onClick={() => toggleType(db, objType as ObjectType)}
              >
                <span className="text-gray-400">
                  {expandedTypes.has(`${db}/${objType}`) ? "▼" : "▶"}
                </span>
                <span>{objType}</span>
              </button>

              {expandedTypes.has(`${db}/${objType}`) &&
                objects[`${db}/${objType}`]?.map((obj) => {
                  const key = `${db}/${objType}/${obj.name}`;
                  return (
                    <button
                      key={obj.name}
                      className={`block w-full text-left ml-8 px-2 py-1 rounded text-xs ${
                        selected === key
                          ? "bg-purple-600 text-white"
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                      onClick={() => handleSelect(db, objType as ObjectType, obj.name)}
                    >
                      {obj.name}
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
