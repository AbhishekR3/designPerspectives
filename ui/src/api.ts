import type { AppState, ApplyPreview, ChangeSet, Conflict, Diagram, EdgeLayout, Pt, Style } from "./types";

/** The model version every request works on ("main" or "draft:<id>") and the one it is
 *  compared with ("base", "main", or null), sent as headers. */
const context: { model: string; compare: string | null } = { model: "main", compare: null };
export function setContext(model: string, compare: string | null): void {
  context.model = model;
  context.compare = compare;
}

/** An error from the server; `conflicts` is set when applying a draft was refused. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly conflicts: Conflict[] = [],
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "X-DP-Model": context.model };
  if (context.compare) headers["X-DP-Compare"] = context.compare;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    let conflicts: Conflict[] = [];
    try {
      const data = await res.json();
      if (typeof data.detail === "string") detail = data.detail;
      else if (data.detail) detail = JSON.stringify(data.detail);
      if (Array.isArray(data.conflicts)) conflicts = data.conflicts;
    } catch {
      /* keep status text */
    }
    throw new ApiError(detail, res.status, conflicts);
  }
  return res.json() as Promise<T>;
}

const enc = encodeURIComponent;

export const api = {
  state: () => request<AppState>("GET", "/state"),
  diagram: (key: string) => request<Diagram>("GET", `/diagrams/${enc(key)}`),
  positions: (key: string, positions: Record<string, { x: number; y: number }>, auto = false) =>
    request("PUT", `/diagrams/${enc(key)}/positions${auto ? "?auto=true" : ""}`, { positions }),
  layout: (
    key: string,
    patch: {
      sizes?: Record<string, { w: number; h: number } | null>;
      edges?: Record<string, EdgeLayout | null>;
      positions?: Record<string, Pt | null>;
    },
  ) => request("PUT", `/diagrams/${enc(key)}/layout`, patch),
  style: (target: string, style: Style | null) => request("PUT", `/styles/${target.split("/").map(enc).join("/")}`, style),
  duplicate: (id: string) => request<{ id: string }>("POST", `/elements/${enc(id)}/duplicate`),
  undo: () => request<{ ok: boolean }>("POST", "/undo"),
  redo: () => request<{ ok: boolean }>("POST", "/redo"),
  codeTree: (path = "") => request<{ entries: { name: string; path: string; type: "dir" | "file" }[] }>("GET", `/code/tree?path=${enc(path)}`),
  codeFile: (path: string) => request<{ path: string; content: string; mtime: number }>("GET", `/code/file?path=${enc(path)}`),
  saveCodeFile: (path: string, content: string, mtime: number) => request<{ path: string; mtime: number }>("PUT", "/code/file", { path, content, mtime }),
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
  setCharacteristics: (body: { name: string; description: string; previousName?: string | null }[]) => request("PUT", "/characteristics", body),
  setCostSettings: (body: object) => request("PUT", "/cost-settings", body),
  createLens: (body: object) => request<{ id: string }>("POST", "/lenses", body),
  updateLens: (id: string, body: object) => request("PUT", `/lenses/${enc(id)}`, body),
  deleteLens: (id: string) => request("DELETE", `/lenses/${enc(id)}`),
  createFlow: (body: object) => request<{ key: string }>("POST", "/flows", body),
  updateFlow: (key: string, body: object) => request("PUT", `/flows/${enc(key)}`, body),
  deleteFlow: (key: string) => request("DELETE", `/flows/${enc(key)}`),
  changes: () => request<ChangeSet>("GET", "/changes"),
  createDraft: (body: { title: string; description?: string }) => request<{ id: string }>("POST", "/drafts", body),
  updateDraft: (id: string, body: { title?: string; description?: string }) => request("PATCH", `/drafts/${enc(id)}`, body),
  deleteDraft: (id: string) => request("DELETE", `/drafts/${enc(id)}`),
  applyPreview: (id: string) => request<ApplyPreview>("GET", `/drafts/${enc(id)}/apply-preview`),
  applyDraft: (id: string) => request("POST", `/drafts/${enc(id)}/apply`),
};
