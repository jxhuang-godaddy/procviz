import { useState } from "react";
import TreeSidebar from "./components/TreeSidebar";
import type { ObjectType } from "./types/graph";

interface Selection {
  db: string;
  objectType: ObjectType;
  name: string;
}

export default function App() {
  const [selection, setSelection] = useState<Selection | null>(null);

  function handleSelect(db: string, objectType: ObjectType, name: string) {
    setSelection({ db, objectType, name });
  }

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900">
      <TreeSidebar onSelect={handleSelect} />
      <div className="flex-1 flex items-center justify-center text-gray-400">
        {selection
          ? `Loading dataflow for ${selection.db}.${selection.name}...`
          : "Select a procedure or table to view its data flow"}
      </div>
    </div>
  );
}
