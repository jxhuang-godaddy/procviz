import { useEffect, useState } from "react";
import { getDatabases } from "../api/client";

export function useDatabases() {
  const [databases, setDatabases] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDatabases()
      .then(setDatabases)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return { databases, loading, error };
}
