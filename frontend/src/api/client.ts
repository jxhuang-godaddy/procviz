import type { DatabaseObject, GraphResponse, ObjectType } from "../types/graph";

const BASE = "/api";

async function fetchJson<T>(url: string): Promise<T> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`API error: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

export function getDatabases(): Promise<string[]> {
  return fetchJson(`${BASE}/databases`);
}

export function getObjectTypes(db: string): Promise<string[]> {
  return fetchJson(`${BASE}/databases/${encodeURIComponent(db)}/object-types`);
}

export function getObjects(db: string, objectType: ObjectType): Promise<DatabaseObject[]> {
  return fetchJson(
    `${BASE}/databases/${encodeURIComponent(db)}/${encodeURIComponent(objectType)}`
  );
}

export function getDataflow(
  db: string,
  objectType: ObjectType,
  name: string
): Promise<GraphResponse> {
  return fetchJson(
    `${BASE}/databases/${encodeURIComponent(db)}/${encodeURIComponent(objectType)}/${encodeURIComponent(name)}/dataflow`
  );
}

export async function getDdl(db: string, name: string): Promise<string> {
  const resp = await fetchJson<{ ddl: string }>(
    `${BASE}/ddl/${encodeURIComponent(db)}/${encodeURIComponent(name)}`
  );
  return resp.ddl;
}
