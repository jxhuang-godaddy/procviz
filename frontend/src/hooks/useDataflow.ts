import { useEffect, useState } from "react";
import { getDataflow } from "../api/client";
import type { GraphResponse, ObjectType } from "../types/graph";

export function useDataflow(db: string | null, objectType: ObjectType | null, name: string | null) {
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  useEffect(() => {
    if (!db || !objectType || !name) {
      setGraph(null);
      setProgress(null);
      return;
    }

    setLoading(true);
    setError(null);
    setProgress(null);

    if (objectType === "table") {
      // Use SSE for table dataflow (long-running scan)
      const url = `/api/databases/${encodeURIComponent(db)}/${encodeURIComponent(objectType)}/${encodeURIComponent(name)}/dataflow`;
      const evtSource = new EventSource(url);

      evtSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "progress") {
            setProgress(data.message);
          } else if (data.type === "result") {
            setGraph(data.graph as GraphResponse);
            setLoading(false);
            setProgress(null);
            evtSource.close();
          }
        } catch {
          // ignore malformed messages
        }
      };

      evtSource.onerror = () => {
        evtSource.close();
        setError("Connection lost while scanning database");
        setLoading(false);
        setProgress(null);
      };

      return () => {
        evtSource.close();
      };
    }

    getDataflow(db, objectType, name)
      .then(setGraph)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [db, objectType, name]);

  return { graph, loading, error, progress };
}
