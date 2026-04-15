import { useEffect, useState } from "react";
import { getDataflow } from "../api/client";
import type { GraphResponse, ObjectType } from "../types/graph";

export function useDataflow(db: string | null, objectType: ObjectType | null, name: string | null) {
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!db || !objectType || !name) {
      setGraph(null);
      return;
    }

    setLoading(true);
    setError(null);
    getDataflow(db, objectType, name)
      .then(setGraph)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [db, objectType, name]);

  return { graph, loading, error };
}
