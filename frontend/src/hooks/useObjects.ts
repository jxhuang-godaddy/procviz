import { useState } from "react";
import { getObjects, getObjectTypes } from "../api/client";
import type { DatabaseObject, ObjectType } from "../types/graph";

export function useObjects() {
  const [objectTypes, setObjectTypes] = useState<Record<string, string[]>>({});
  const [objects, setObjects] = useState<Record<string, DatabaseObject[]>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadObjectTypes(db: string) {
    const key = db;
    if (objectTypes[key]) return;
    setLoading(key);
    setError(null);
    try {
      const types = await getObjectTypes(db);
      setObjectTypes((prev) => ({ ...prev, [key]: types }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load object types");
    }
    setLoading(null);
  }

  async function loadObjects(db: string, objectType: ObjectType) {
    const key = `${db}/${objectType}`;
    if (objects[key]) return;
    setLoading(key);
    setError(null);
    try {
      const objs = await getObjects(db, objectType);
      setObjects((prev) => ({ ...prev, [key]: objs }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load objects");
    }
    setLoading(null);
  }

  return { objectTypes, objects, loading, error, loadObjectTypes, loadObjects };
}
