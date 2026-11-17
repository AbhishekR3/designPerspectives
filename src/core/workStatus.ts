/**
 * The status refresh of linked work (DEC-059, DEC-085): every link pinned anywhere in the model (elements,
 * relationships, diagrams, flows, the project) that a connection knows and its tool's adapter reads gets the
 * tool's status. Only on request (a button, POST /api/work/refresh). In three steps:
 *
 * 1. `refreshPlan`: each link to its connection (`connectionFor`, the longest base) and adapter (a strict
 *    match); at most MAX_LINKS links; the rest are counted as unknown.
 * 2. `fetchStatuses`: 4 at a time, each request with a 10-second limit and `redirect: "error"` (a 3xx is an
 *    error too), to the adapter's API root of that connection only. A connection's token goes only into
 *    requests for that connection's links: a file connection sends the credential it names; a built-in one
 *    the first credential of its tool's provider that no connection names (so a token meant for a team's own
 *    server never goes to the public host). Errors are short reasons that name the tool; they never repeat the
 *    answer's body or the token. Answers over 1 MB are refused.
 * 3. `applyStatuses`: remote done → done; remote not done on a done item → the remote state (it was opened
 *    again); remote in progress on an open item → in-progress; otherwise the item keeps its status (a
 *    person's "blocked" or "in-progress" stays). The tool's severity replaces the item's when it has one.
 *    `remote` and `checked` are written only when the status, the remote text or the severity changed: a
 *    refresh that finds nothing new writes nothing and makes no undo step, so `checked` is when the tool's
 *    answer last changed (or was first read), not when it was last asked.
 */

import type { CredentialStore } from "./credentials.js";
import { mapWork, allWorkLinks } from "./work.js";
import type { Workspace } from "./workspace.js";
import { github } from "./workTools/github.js";
import { gitlab } from "./workTools/gitlab.js";
import { jira } from "./workTools/jira.js";
import { sonar } from "./workTools/sonar.js";
import { apiAddress, linkRest, ReadError, type Conn, type Fetch, type Parsed, type RemoteState, type WorkAdapter } from "./workTools/types.js";
import { DEFAULT_WORK_SEVERITY, WORK_TOOL_LABEL, type WorkItem, type WorkRefresh, type WorkSeverityMaps, type WorkToolId } from "../shared/types.js";
import { connectionFor } from "../shared/workLinks.js";

export const ADAPTERS: Record<WorkToolId, WorkAdapter> = { github, gitlab, sonar, jira };
export const MAX_LINKS = 200;
const PARALLEL = 4;
const TIMEOUT_MS = 10_000;
const MAX_BODY = 1_000_000;

export interface PlannedLink {
  url: string;
  conn: Conn;
  parsed: Parsed;
}
export interface RefreshPlan {
  links: PlannedLink[];
  /** Links no connection knows, or that their tool's adapter does not read. */
  unknown: number;
  /** Links over MAX_LINKS, not read this time. */
  over: string[];
}

/** Which link goes to which connection. `tools`: only links of these tools (others are left out, not counted). */
export function refreshPlan(ws: Workspace, connections: readonly Conn[], tools?: readonly WorkToolId[]): RefreshPlan {
  const plan: RefreshPlan = { links: [], unknown: 0, over: [] };
  for (const url of allWorkLinks(ws)) {
    const conn = connectionFor(url, connections) as Conn | null;
    if (conn && tools?.length && !tools.includes(conn.tool)) continue;
    const at = conn ? linkRest(url, conn) : null;
    const parsed = conn && at ? ADAPTERS[conn.tool].match(at.link, at.rest, conn) : null;
    if (!conn || !parsed) {
      plan.unknown++;
      continue;
    }
    if (plan.links.length >= MAX_LINKS) plan.over.push(url);
    else plan.links.push({ url, conn, parsed });
  }
  return plan;
}

/** The token of a connection: a file connection's named credential, or for a built-in one the first readable
 *  credential of its tool's provider that no connection names (a credential named for a team's own server is
 *  never sent to the public host). `missing`: the connection names a credential that does not exist or cannot
 *  be read. */
export function tokenFor(conn: Conn, credentials: Pick<CredentialStore, "get" | "list">, connections: readonly Conn[]): { name: string; value: string } | { missing: string } | null {
  if (conn.credential) {
    const value = credentials.get(conn.credential);
    return value === null ? { missing: conn.credential } : { name: conn.credential, value };
  }
  const provider = conn.builtIn ? ADAPTERS[conn.tool].provider : null;
  if (!provider) return null;
  const reserved = new Set(connections.map((c) => c.credential).filter(Boolean));
  for (const c of credentials.list().credentials) {
    if (c.provider !== provider || c.locked || reserved.has(c.name)) continue;
    const value = credentials.get(c.name);
    if (value !== null) return { name: c.name, value };
  }
  return null;
}

export type StatusAnswer = RemoteState | { error: string };

async function readBody(r: Awaited<ReturnType<Fetch>>): Promise<unknown> {
  if (!r.text) return r.json();
  const t = await r.text();
  if (t.length > MAX_BODY) throw new ReadError("the answer is too large");
  return JSON.parse(t) as unknown;
}

function httpReason(status: number, label: string, withToken: boolean): string {
  if (status >= 300 && status < 400) return `${label} answered with a redirect, which dp does not follow`;
  if (status === 401) return withToken ? `the ${label} credential was refused` : `${label} needs a credential for this`;
  if (status === 403) return withToken ? `no access, or the ${label} rate limit` : `no access without a credential, or the ${label} rate limit`;
  if (status === 404) return withToken ? `not found in ${label}` : `not found in ${label} (or private without a credential)`;
  if (status === 429) return `the ${label} rate limit`;
  return `${label} answered ${status}`;
}

/** The status of each planned link, or why it could not be read; and per connection used, its credential's name. */
export async function fetchStatuses(
  plan: RefreshPlan,
  token: (conn: Conn) => { name: string; value: string } | { missing: string } | null,
  fetchImpl: Fetch,
  maps: WorkSeverityMaps = DEFAULT_WORK_SEVERITY,
): Promise<{ states: Map<string, StatusAnswer>; byTool: WorkRefresh["byTool"] }> {
  const states = new Map<string, StatusAnswer>();
  const tokens = new Map<string, ReturnType<typeof token>>();
  const byTool = new Map<string, WorkRefresh["byTool"][number]>();
  for (const l of plan.links) {
    if (!tokens.has(l.conn.id)) tokens.set(l.conn.id, token(l.conn));
    const t = tokens.get(l.conn.id)!;
    const entry = byTool.get(l.conn.id) ?? { tool: l.conn.tool, base: l.conn.base, checked: 0, credential: t && "name" in t ? t.name : t && "missing" in t ? t.missing : null };
    entry.checked++;
    byTool.set(l.conn.id, entry);
  }
  const one = async (l: PlannedLink): Promise<StatusAnswer> => {
    const adapter = ADAPTERS[l.conn.tool];
    const label = l.conn.tool === "sonar" && l.conn.base === "https://sonarcloud.io" ? "SonarCloud" : WORK_TOOL_LABEL[l.conn.tool];
    const t = tokens.get(l.conn.id) ?? null;
    if (t && "missing" in t) return { error: `the credential "${t.missing}" of this connection is missing or locked` };
    const root = adapter.apiRoot(l.conn);
    let headers: Record<string, string>;
    try {
      headers = adapter.headers(t?.value ?? null, l.conn);
    } catch (e) {
      return { error: e instanceof ReadError ? e.message : `cannot sign in to ${label}` };
    }
    const bodies: unknown[] = [];
    for (const rel of adapter.requests(l.parsed, l.conn)) {
      // Built from encoded parts, then checked again: the token goes to this connection's API root only.
      const url = apiAddress(root, rel);
      if (!url) return { error: `not a ${label} link dp can read` };
      try {
        const r = await fetchImpl(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "error" });
        if (!r.ok || r.status >= 300) return { error: httpReason(r.status, label, !!t) };
        bodies.push(await readBody(r));
      } catch (e) {
        const name = (e as Error).name;
        if (e instanceof ReadError) return { error: `${label}: ${e.message}` };
        if (name === "TimeoutError" || name === "AbortError") return { error: `${label} gave no answer in ${TIMEOUT_MS / 1000} seconds` };
        if (e instanceof SyntaxError) return { error: `${label} sent an answer dp cannot read` };
        return { error: `could not reach ${label}` };
      }
    }
    try {
      return adapter.read(bodies, l.parsed, maps);
    } catch (e) {
      return { error: e instanceof ReadError ? e.message : `${label} sent an answer dp cannot read` };
    }
  };
  const queue = [...plan.links];
  const workers = Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
    for (let l = queue.shift(); l !== undefined; l = queue.shift()) states.set(l.url, await one(l));
  });
  await Promise.all(workers);
  return { states, byTool: [...byTool.values()] };
}

/** The status an item gets from the tool's state (see the header). */
export function nextStatus(current: string, remote: RemoteState["state"]): string {
  if (remote === "done") return "done";
  if (current === "done") return remote;
  if (remote === "in-progress" && current === "open") return "in-progress";
  return current;
}

/** Apply the tools' answers to the work items of every target. Returns the status changes (for people). */
export function applyStatuses(ws: Workspace, states: ReadonlyMap<string, StatusAnswer>, now: string): WorkRefresh["updated"] {
  const updated: WorkRefresh["updated"] = [];
  mapWork(ws, (items, label) => {
    let changed = false;
    const rows = items.map((w): WorkItem => {
      const s = w.url ? states.get(w.url) : undefined;
      if (!s || "error" in s) return w;
      const status = nextStatus(w.status, s.state);
      const severity = s.severity ?? w.severity;
      if (status === w.status && s.remote === w.remote && severity === w.severity) return w;
      changed = true;
      if (status !== w.status) updated.push({ owner: label, title: w.title, from: w.status, to: status });
      const next: WorkItem = { ...w, status, remote: s.remote, checked: now };
      if (severity) next.severity = severity;
      return next;
    });
    return changed ? rows : null;
  });
  return updated;
}

/** The failures of a refresh: links that could not be read, then links over the limit. */
export function failures(plan: RefreshPlan, states: ReadonlyMap<string, StatusAnswer>): WorkRefresh["failed"] {
  const failed: WorkRefresh["failed"] = [];
  for (const [url, s] of states) if ("error" in s) failed.push({ url, reason: s.error });
  for (const url of plan.over) failed.push({ url, reason: `not read: a refresh reads at most ${MAX_LINKS} links` });
  return failed;
}
