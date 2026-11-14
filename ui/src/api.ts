import type { AppState, Diagram } from "./types";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (typeof data.detail === "string") detail = data.detail;
      else if (data.detail) detail = JSON.stringify(data.detail);
    } catch {
      /* keep status text */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

const enc = encodeURIComponent;

export const api = {
  state: () => request<AppState>("GET", "/state"),
  diagram: (key: string) => request<Diagram>("GET", `/diagrams/${enc(key)}`),
  positions: (key: string, positions: Record<string, { x: number; y: number }>) =>
    request("PUT", `/diagrams/${enc(key)}/positions`, { positions }),
  workspace: (patch: object) => request("PATCH", "/workspace", patch),
  createElement: (body: object) => request<{ id: string }>("POST", "/elements", body),
  updateElement: (id: string, patch: object) => request("PATCH", `/elements/${enc(id)}`, patch),
  deleteElement: (id: string) => request("DELETE", `/elements/${enc(id)}`),
  createRelationship: (body: object) => request<{ id: string }>("POST", "/relationships", body),
  updateRelationship: (id: string, patch: object) => request("PATCH", `/relationships/${enc(id)}`, patch),
  deleteRelationship: (id: string) => request("DELETE", `/relationships/${enc(id)}`),
  createTagGroup: (body: object) => request("POST", "/tag-groups", body),
  updateTagGroup: (name: string, body: object) => request("PUT", `/tag-groups/${enc(name)}`, body),
  deleteTagGroup: (name: string) => request("DELETE", `/tag-groups/${enc(name)}`),
  createLens: (body: object) => request<{ id: string }>("POST", "/lenses", body),
  updateLens: (id: string, body: object) => request("PUT", `/lenses/${enc(id)}`, body),
  deleteLens: (id: string) => request("DELETE", `/lenses/${enc(id)}`),
  createFlow: (body: object) => request<{ key: string }>("POST", "/flows", body),
  updateFlow: (key: string, body: object) => request("PUT", `/flows/${enc(key)}`, body),
  deleteFlow: (key: string) => request("DELETE", `/flows/${enc(key)}`),
};
