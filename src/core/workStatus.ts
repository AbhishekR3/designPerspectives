/**
 * Linked work status from GitHub (DEC-059), the first use of the stored credentials (DEC-056). Work
 * items (`dp.work`) whose link is a GitHub issue or pull request get their status from GitHub: an open
 * one keeps "in-progress" or "blocked" and is otherwise "open"; a closed or merged one is "done".
 * Only on request (a button), only to api.github.com, with the first stored credential whose provider is
 * "github" (without one: public repositories, at GitHub's lower rate limit).
 */

import { buildIndex, getJson, updateElement, updateRelationship, WORK_KEY } from "./ops.js";
import type { Sidecar } from "./sidecar.js";
import type { Workspace } from "./workspace.js";
import type { WorkItem, WorkRefresh } from "../shared/types.js";

/** GitHub's own name rules: an owner is letters, digits and dashes; a repository also dots and underscores,
 *  but is never "." or "..", which would change the API path the token is sent to. */
const GH = /^https:\/\/github\.com\/([A-Za-z0-9-]{1,39})\/((?!\.\.?\/)[A-Za-z0-9._-]{1,100})\/(issues|pull)\/(\d{1,12})\/?(?:[?#].*)?$/;
const MAX_LINKS = 100;
const PARALLEL = 4;
const API_HOST = "api.github.com";

export type Fetch = (url: string, init: { headers: Record<string, string>; signal: AbortSignal; redirect?: "error" | "manual" | "follow" }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export const isGitHubWork = (url: string | undefined): boolean => !!url && GH.test(url);

/** The API address for a GitHub issue or pull request link, or null when the link is not one. Built from
 *  encoded parts and checked once more, so the token only ever goes to that one issue or pull request. */
export function apiUrl(link: string): string | null {
  const m = GH.exec(link);
  if (!m) return null;
  const [, owner, repo, kind, n] = m as unknown as [string, string, string, string, string];
  const prefix = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/`;
  const url = new URL(`https://${API_HOST}${prefix}${kind === "pull" ? "pulls" : "issues"}/${n}`);
  if (url.protocol !== "https:" || url.host !== API_HOST || !url.pathname.startsWith(prefix)) return null;
  return url.href;
}

/** The GitHub links of every work item in the model, once each. */
export function gitHubLinks(ws: Workspace): string[] {
  const idx = buildIndex(ws);
  const urls = new Set<string>();
  for (const o of [...idx.elements.values(), ...idx.relationships.values()]) {
    for (const w of getJson<WorkItem>(o, WORK_KEY)) if (isGitHubWork(w.url)) urls.add(w.url!);
  }
  return [...urls].slice(0, MAX_LINKS);
}

/** GitHub's answer for each link: "open" / "closed", or why it could not be read. */
export async function fetchStates(urls: string[], token: string | null, fetchImpl: Fetch): Promise<Map<string, { state: "open" | "closed" } | { error: string }>> {
  const out = new Map<string, { state: "open" | "closed" } | { error: string }>();
  const queue = [...urls];
  const one = async (url: string) => {
    const api = apiUrl(url);
    if (!api) {
      out.set(url, { error: "not a GitHub issue or pull request link" });
      return;
    }
    const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "designPerspectives", "X-GitHub-Api-Version": "2022-11-28" };
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      // No redirects: the token must not follow GitHub's answer to another address.
      const r = await fetchImpl(api, { headers, signal: AbortSignal.timeout(10_000), redirect: "error" });
      if (!r.ok) {
        out.set(url, {
          error:
            r.status === 404
              ? "not found (or private without a token)"
              : r.status === 401
                ? "the GitHub credential was refused"
                : r.status === 403
                  ? "rate limit or no access"
                  : `GitHub answered ${r.status}`,
        });
        return;
      }
      const body = (await r.json()) as { state?: unknown; merged_at?: unknown };
      out.set(url, { state: body.state === "closed" || body.merged_at ? "closed" : "open" });
    } catch (e) {
      out.set(url, { error: (e as Error).name === "TimeoutError" ? "no answer in 10 seconds" : "could not reach GitHub" });
    }
  };
  const workers = Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
    for (let u = queue.shift(); u !== undefined; u = queue.shift()) await one(u);
  });
  await Promise.all(workers);
  return out;
}

const next = (current: string, state: "open" | "closed") => (state === "closed" ? "done" : current === "done" ? "open" : current);

/** Apply GitHub's states to the work items, through the model operations. Returns what changed. */
export function applyStates(ws: Workspace, sc: Sidecar, states: Map<string, { state: "open" | "closed" } | { error: string }>): WorkRefresh["updated"] {
  const idx = buildIndex(ws);
  const updated: WorkRefresh["updated"] = [];
  const fix = (owner: string, items: WorkItem[]) => {
    let changed = false;
    const rows = items.map((w) => {
      const s = w.url ? states.get(w.url) : undefined;
      if (!s || "error" in s) return w;
      const to = next(w.status, s.state);
      if (to === w.status) return w;
      changed = true;
      updated.push({ owner, title: w.title, from: w.status, to });
      return { ...w, status: to };
    });
    return changed ? rows : null;
  };
  for (const el of [...idx.elements.values()]) {
    const rows = fix(el.name, getJson<WorkItem>(el, WORK_KEY));
    if (rows) updateElement(ws, sc, el.id, { work: rows });
  }
  for (const r of [...idx.relationships.values()]) {
    const name = `${idx.elements.get(r.sourceId)?.name ?? r.sourceId} → ${idx.elements.get(r.destinationId)?.name ?? r.destinationId}`;
    const rows = fix(name, getJson<WorkItem>(r, WORK_KEY));
    if (rows) updateRelationship(ws, r.id, { work: rows });
  }
  return updated;
}
