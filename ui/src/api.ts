import { notify } from "./common/notify";
import type { CatalogEntry, CredentialList, Decision, DecisionInput, DecisionStatus, HistoryList, HomeSummary, HubInfo, SharedUsage, WorkRefresh } from "./types";
import type {
  AcceptAllResult,
  AppState,
  ApplyPreview,
  ApplyResponse,
  BmoPreview,
  BmoRunResult,
  BmoSettingsData,
  BmoStatus,
  BmoTaskId,
  HandoffOffer,
  ImportCheck,
  ImportDraftResult,
  ImportExample,
  ImportOverview,
  ImportReviewResponse,
  ReviewActionResult,
  ScanLevel,
  CommentKind,
  CommentList,
  CommentTarget,
  CommentThread,
  BacktrackResult,
  ObservedTrace,
  TraceList,
  ChangeSet,
  CodingPlan,
  Conflict,
  Diagram,
  EdgeLayout,
  InspectResult,
  MeResponse,
  ObservedCall,
  Pt,
  SessionUser,
  Style,
} from "./types";

export interface CodeFile {
  path: string;
  content: string;
  mtime: number;
  /** In a draft: the planned edit of this file, if any. */
  planned: "added" | "changed" | "deleted" | null;
  /** A git version: the file cannot be saved. */
  readOnly: boolean;
}

/** Where backtracking starts: a connector stage (0 = the data entering it) or a flow step (from 1). */
export type BacktrackQuery = { connector: string; stage: number } | { flow: string; step: number };

/** The model version every request works on ("main" or "draft:<id>") and the one it is
 *  compared with ("base", "main", or null), sent as headers. */
const context: { model: string; compare: string | null } = { model: "main", compare: null };
export function setContext(model: string, compare: string | null): void {
  context.model = model;
  context.compare = compare;
}

/** The hub project every project request goes to (header X-DP-Project); null when the server serves one project. */
let project: string | null = null;
export function setProject(id: string | null): void {
  project = id;
}

/** An error from the server; `conflicts` is set when applying a draft was refused; `data` is the whole JSON answer (import and BMO refusals carry `errors`, `pasteBack`, `unmet`). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly conflicts: Conflict[] = [],
    readonly data: Record<string, unknown> | null = null,
  ) {
    super(message);
  }
}

/** The text the sign-in page shows when a session ended while the app was open. */
export const SESSION_ENDED = "Your session ended. Sign in again.";

/**
 * Two server answers are handled here, in one place, for every call:
 * - 401 (no session: it expired, or the server restarted): the app goes back to the sign-in page, and the
 *   errors of the calls that failed with it are not shown (`notify.suspend`);
 * - 403 on a change (the role or the version no longer allows it, e.g. the role changed while the page was
 *   open): the caller shows the server's message as usual, and the app reloads its state so the controls match.
 */
const handlers: { sessionEnded: (() => void) | null; forbidden: (() => void) | null } = { sessionEnded: null, forbidden: null };
export function onSessionEnded(fn: (() => void) | null): void {
  handlers.sessionEnded = fn;
}
export function onForbidden(fn: (() => void) | null): void {
  handlers.forbidden = fn;
}

async function request<T>(method: string, path: string, body?: unknown, opts: { auth?: boolean; project?: string | null; main?: boolean; signal?: AbortSignal } = {}): Promise<T> {
  // `main`: a call about another project's main model (the catalog page), whatever version is shown.
  const headers: Record<string, string> = { "X-DP-Model": opts.main ? "main" : context.model };
  if (context.compare && !opts.main) headers["X-DP-Compare"] = context.compare;
  const pr = opts.project === undefined ? project : opts.project;
  if (pr) headers["X-DP-Project"] = pr;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    let conflicts: Conflict[] = [];
    let extra: Record<string, unknown> | null = null;
    try {
      const data = await res.json();
      if (typeof data.detail === "string") detail = data.detail;
      else if (data.detail) detail = JSON.stringify(data.detail);
      if (Array.isArray(data.conflicts)) conflicts = data.conflicts;
      if (data && typeof data === "object") extra = data;
    } catch {
      /* keep status text */
    }
    // Sign-in calls answer 401 themselves ("Wrong name or password"): they are not an ended session.
    if (res.status === 401 && !opts.auth) {
      notify.suspend(true);
      handlers.sessionEnded?.();
    } else if (res.status === 403 && method !== "GET") handlers.forbidden?.();
    throw new ApiError(detail, res.status, conflicts, extra);
  }
  return res.json() as Promise<T>;
}

const enc = encodeURIComponent;

export const api = {
  me: () => request<MeResponse>("GET", "/me", undefined, { auth: true }),
  login: (name: string, password: string) => request<{ user: SessionUser }>("POST", "/login", { name, password }, { auth: true }),
  logout: () => request<{ ok: boolean }>("POST", "/logout", undefined, { auth: true }),
  state: () => request<AppState>("GET", "/state"),
  diagram: (key: string) => request<Diagram>("GET", `/diagrams/${enc(key)}`),
  positions: (key: string, positions: Record<string, { x: number; y: number }>, auto = false) => request("PUT", `/diagrams/${enc(key)}/positions${auto ? "?auto=true" : ""}`, { positions }),
  layout: (
    key: string,
    patch: {
      /** The diagram's default line shape; null goes back to rounded right angles. */
      lineShape?: NonNullable<EdgeLayout["routing"]> | null;
      sizes?: Record<string, { w: number; h: number } | null>;
      edges?: Record<string, EdgeLayout | null>;
      positions?: Record<string, Pt | null>;
    },
    /** A detail of the edit just made (not a separate undo step). */
    auto = false,
  ) => request("PUT", `/diagrams/${enc(key)}/layout${auto ? "?auto=true" : ""}`, patch),
  style: (target: string, style: Style | null) => request("PUT", `/styles/${target.split("/").map(enc).join("/")}`, style),
  /** Copy an element; with `place`, put the copy at that point of a diagram (one undo step). */
  duplicate: (id: string, place?: { diagramKey: string; position: Pt }) => request<{ id: string }>("POST", `/elements/${enc(id)}/duplicate`, place),
  undo: () => request<{ ok: boolean }>("POST", "/undo"),
  redo: () => request<{ ok: boolean }>("POST", "/redo"),
  codeTree: (path = "") => request<{ entries: { name: string; path: string; type: "dir" | "file" }[] }>("GET", `/code/tree?path=${enc(path)}`),
  codeFile: (path: string) => request<CodeFile>("GET", `/code/file?path=${enc(path)}`),
  /** Plan a new file in the draft; with `mapTo` (an element or relationship id) its path is added to that object's code paths in the same step. */
  newCodeFile: (path: string, content = "", mapTo?: string) => request<{ path: string }>("POST", "/code/file", { path, content, ...(mapTo ? { mapTo } : {}) }),
  deleteCodeFile: (path: string) => request("DELETE", `/code/file?path=${enc(path)}`),
  revertCodeFile: (path: string) => request("POST", "/code/revert", { path }),
  saveCodeFile: (path: string, content: string, mtime: number) => request<{ path: string; mtime: number }>("PUT", "/code/file", { path, content, mtime }),
  workspace: (patch: object) => request("PATCH", "/workspace", patch),
  /** With `connectTo` / `connectFrom` (an element id) the new element and its relationship are one edit. */
  createElement: (body: object) => request<{ id: string; relationshipId?: string }>("POST", "/elements", body),
  /** `reslug` (with a rename): the first rename of a new element also makes its ID from the new name; the answer has the ID, which may be new. */
  updateElement: (id: string, patch: object) => request<{ ok: boolean; id: string }>("PATCH", `/elements/${enc(id)}`, patch),
  deleteElement: (id: string) => request("DELETE", `/elements/${enc(id)}`),
  /** Delete several elements as one undo step. */
  deleteElements: (ids: string[]) => request<{ deleted: string[] }>("POST", "/elements/delete", { ids }),
  /** Move a container to another software system, or a component to another container. */
  moveElement: (id: string, parentId: string) => request<{ ok: boolean; id: string; parentId: string }>("POST", `/elements/${enc(id)}/move`, { parentId }),
  createRelationship: (body: object) => request<{ id: string }>("POST", "/relationships", body),
  updateRelationship: (id: string, patch: object) => request("PATCH", `/relationships/${enc(id)}`, patch),
  uiProxy: (elementId: string) => request<{ url: string; origin: string }>("POST", "/ui-proxy", { elementId }),
  inspect: (elementId: string, calls: ObservedCall[]) => request<InspectResult>("POST", "/inspect", { elementId, calls }),
  traces: (limit = 30) => request<TraceList>("GET", `/traces?limit=${limit}`),
  trace: (id: string, ui: string | null) => request<ObservedTrace>("GET", `/traces/${enc(id)}${ui ? `?ui=${enc(ui)}` : ""}`),
  backtrack: (q: BacktrackQuery, days: number) =>
    request<BacktrackResult>(
      "GET",
      `/backtrack?${new URLSearchParams("connector" in q ? { connector: q.connector, stage: String(q.stage), days: String(days) } : { flow: q.flow, step: String(q.step), days: String(days) })}`,
    ),
  comments: () => request<CommentList>("GET", "/comments"),
  addComment: (body: { kind: CommentKind; target: CommentTarget; diagram: string | null; text: string; author?: string }) => request<CommentThread>("POST", "/comments", body),
  replyToComment: (id: string, text: string, author?: string) => request<CommentThread>("POST", `/comments/${enc(id)}/replies`, { text, ...(author ? { author } : {}) }),
  updateComment: (id: string, patch: { status?: "open" | "resolved"; text?: string; kind?: CommentKind; author?: string }) => request<CommentThread>("PATCH", `/comments/${enc(id)}`, patch),
  deleteComment: (id: string) => request("DELETE", `/comments/${enc(id)}`),
  deleteReply: (id: string, replyId: string) => request<CommentThread>("DELETE", `/comments/${enc(id)}/replies/${enc(replyId)}`),
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
  decisions: () => request<Decision[]>("GET", "/decisions"),
  // Hub-level: the same in a hub and for one project (DEC-053 to DEC-056).
  hub: () => request<HubInfo>("GET", "/hub"),
  home: () => request<HomeSummary>("GET", "/home"),
  catalog: () => request<CatalogEntry[]>("GET", "/catalog"),
  catalogUsage: () => request<SharedUsage>("GET", "/catalog/usage"),
  history: (project?: string | null) => request<HistoryList>("GET", `/history${project ? `?project=${enc(project)}` : ""}`),
  refreshWork: () => request<WorkRefresh>("POST", "/work/refresh"),
  addProject: (body: { id: string; name: string; template: "empty" | "demo" }) => request<{ id: string }>("POST", "/hub/projects", body),
  credentials: () => request<CredentialList>("GET", "/credentials"),
  addCredential: (body: { name: string; provider: string; scopes: string[]; note: string; value: string }) => request("POST", "/credentials", body),
  rotateCredential: (name: string, value: string) => request("PUT", `/credentials/${enc(name)}`, { value }),
  updateCredential: (name: string, body: { provider?: string; scopes?: string[]; note?: string }) => request("PATCH", `/credentials/${enc(name)}`, body),
  removeCredential: (name: string) => request("DELETE", `/credentials/${enc(name)}`),
  // A project's linked copies of catalog elements; `project` given: that project's main model (the catalog page).
  fromCatalog: (catalogId: string, parentId: string | null = null, project?: string) =>
    request<{ id: string }>("POST", "/elements/from-catalog", { catalogId, parentId }, project ? { project, main: true } : {}),
  linkCatalog: (id: string, catalogId: string) => request("POST", `/elements/${enc(id)}/catalog`, { catalogId }),
  syncCatalog: (id: string, project?: string) => request("POST", `/elements/${enc(id)}/catalog/sync`, {}, project ? { project, main: true } : {}),
  unlinkCatalog: (id: string) => request("DELETE", `/elements/${enc(id)}/catalog`),
  createDecision: (body: DecisionInput) => request<{ id: string }>("POST", "/decisions", body),
  updateDecision: (id: string, body: DecisionInput) => request("PUT", `/decisions/${enc(id)}`, body),
  setDecisionStatus: (id: string, status: DecisionStatus) => request("PATCH", `/decisions/${enc(id)}/status`, { status }),
  deleteDecision: (id: string) => request("DELETE", `/decisions/${enc(id)}`),
  createDraft: (body: { title: string; description?: string }) => request<{ id: string }>("POST", "/drafts", body),
  updateDraft: (id: string, body: { title?: string; description?: string; branch?: string; link?: string }) => request("PATCH", `/drafts/${enc(id)}`, body),
  deleteDraft: (id: string) => request("DELETE", `/drafts/${enc(id)}`),
  applyPreview: (id: string, code = true) => request<ApplyPreview>("GET", `/drafts/${enc(id)}/apply-preview${code ? "" : "?code=0"}`),
  applyDraft: (id: string, code = true) => request<ApplyResponse>("POST", `/drafts/${enc(id)}/apply`, { code }),
  plan: (id: string, against: string | null) => request<CodingPlan>("GET", `/drafts/${enc(id)}/plan${against ? `?against=${enc(against)}` : ""}`),
  // Import (DEC-051): the page, an import file, the handoff, the review of an import draft (the draft the context selects).
  importOverview: () => request<ImportOverview>("GET", "/import"),
  importExample: () => request<ImportExample>("GET", "/import/example"),
  importScan: () => request<ImportOverview>("POST", "/import/scan"),
  importIntake: (intake: unknown) => request<ImportOverview>("PUT", "/import/intake", intake),
  importCheck: (text: string) => request<ImportCheck>("POST", "/import/check", { text }),
  importFile: (text: string, title?: string) => request<ImportDraftResult>("POST", "/import/file", { text, ...(title ? { title } : {}) }),
  importHandoff: (body: { task: "import-level" | "describe-to-model" | "suggest-labels"; level?: "c1" | "c2" | "c3"; container?: string; text?: string }) =>
    request<HandoffOffer>("POST", "/import/handoff", body),
  importHandoffResult: (text?: string) => request<ImportDraftResult>("POST", "/import/handoff/result", text === undefined ? {} : { text }),
  importIgnore: (path: string, remove = false) => request<ImportOverview>("POST", "/import/ignore", { path, ...(remove ? { remove: true } : {}) }),
  importLevel: (level: ScanLevel, final: boolean) => request<ImportOverview>("POST", `/import/levels/${level}`, { final }),
  importReview: () => request<ImportReviewResponse>("GET", "/import/review"),
  /** One review item: `key` is `object:<id>`, `relationship:<id>`, ... (the ":" stays as it is in the path). */
  reviewItem: (key: string, body: { action: "verify" | "accept" | "reject" | "pending" | "feedback"; text?: string }) =>
    request<ReviewActionResult>("POST", `/import/review/items/${enc(key).replace(/%3A/gi, ":")}`, body),
  reviewAcceptAll: () => request<AcceptAllResult>("POST", "/import/review/accept-all", {}),
  reviewDraftFeedback: (text: string) => request<{ review: ImportReviewResponse["review"] }>("POST", "/import/review/feedback", { text }),
  // BMO (DEC-051): the status, the settings, a preview of what would be sent, a run.
  /** `project`: in a hub, the project whose app answers (the settings are shared by the whole hub). */
  bmo: (project?: string | null) => request<BmoStatus>("GET", "/bmo", undefined, project ? { project } : {}),
  bmoSettings: (settings: BmoSettingsData, project?: string | null) => request<BmoStatus>("PUT", "/bmo/settings", settings, project ? { project } : {}),
  bmoPreview: (body: { task: BmoTaskId } & Record<string, unknown>, signal?: AbortSignal) => request<BmoPreview>("POST", "/bmo/preview", body, { signal }),
  bmoRun: (body: { task: BmoTaskId; hash: string } & Record<string, unknown>, signal?: AbortSignal) => request<BmoRunResult>("POST", "/bmo/run", body, { signal }),
};
