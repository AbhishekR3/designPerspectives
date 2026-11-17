/**
 * Live UI inspector: what HTTP calls seen in a running UI mean in the model.
 *
 * A relationship lists the HTTP calls it carries as endpoints (`dp.endpoints`, see modelEdits.ts). A call
 * seen in the UI matches a relationship that starts at the UI element (or one of its children) and
 * has a matching endpoint. From each matched relationship the walk follows the model's outgoing
 * relationships, breadth first, so the panel can show what the call reaches next. Each element is
 * entered once (the walk never goes back to an element it reached), up to INSPECT_DEPTH steps. The
 * walk uses the model as written, not the servers: it shows every way on from an element, which is
 * more than one request uses. A flow that contains the matched relationship is the precise path.
 *
 * Endpoint matching: the method must be equal (or "*"). A path pattern is compared segment by
 * segment with the call's path: ":name" matches one segment, a final "*" matches the rest, anything
 * else must be equal. A pattern that is a full URL is compared with the call's origin and path.
 */

import { buildIndex, ENDPOINTS_KEY, getJson, type Index } from "./modelEdits.js";
import { listFlows } from "./flows.js";
import type { Workspace } from "./workspace.js";
import type { Endpoint, InspectedCall, InspectHop, InspectResult, ObservedCall } from "../shared/types.js";

/** How many relationships deep the walk goes after the one a call matched. */
export const INSPECT_DEPTH = 3;
/** Most calls looked at in one request. */
export const MAX_CALLS = 200;

function segments(p: string): string[] {
  return p.split("/").filter(Boolean);
}

function pathMatches(pattern: string, path: string): boolean {
  const ps = segments(pattern);
  const xs = segments(path);
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i]!;
    if (p === "*" && i === ps.length - 1) return true;
    const x = xs[i];
    if (x === undefined) return false;
    if (p.startsWith(":")) continue;
    if (p !== x) return false;
  }
  return ps.length === xs.length;
}

/** Does the endpoint match a call with this method and absolute URL? */
export function endpointMatches(ep: Endpoint, method: string, url: URL): boolean {
  if (ep.method !== "*" && ep.method !== method.toUpperCase()) return false;
  if (/^https?:\/\//.test(ep.path)) {
    let pat: URL;
    try {
      pat = new URL(ep.path.replace(/\*$/, "__dp_rest__"));
    } catch {
      return false;
    }
    if (pat.origin !== url.origin) return false;
    return pathMatches(decodeURI(pat.pathname).replace(/__dp_rest__$/, "*"), url.pathname);
  }
  return pathMatches(ep.path, url.pathname);
}

/** A segment that looks like an ID: a number, a UUID, a long hex or base-32 token. */
const ID_SEGMENT = /^(\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,}|[0-9A-Za-z_-]{20,}|[a-z]+_[0-9A-Za-z]{6,})$/i;

/** An endpoint for a call: its path with ID-like segments replaced by ":id". */
export function suggestEndpoint(method: string, url: URL): Endpoint {
  const parts = segments(url.pathname).map((s) => (ID_SEGMENT.test(s) ? ":id" : s));
  return { method: method.toUpperCase(), path: "/" + parts.join("/") };
}

function descendants(idx: Index, id: string): string[] {
  const out = [id];
  for (let i = 0; i < out.length; i++) out.push(...idx.childrenOf(out[i]!));
  return out;
}

export function inspectCalls(ws: Workspace, uiElementId: string, calls: ObservedCall[], depth = INSPECT_DEPTH): InspectResult {
  const idx = buildIndex(ws);
  idx.el(uiElementId); // throws ModelError for an unknown element
  const own = new Set(descendants(idx, uiElementId));
  const rels = [...idx.relationships.values()];
  const candidates = rels.filter((r) => own.has(r.sourceId)).map((r) => r.id);
  const endpoints = new Map(candidates.map((id) => [id, getJson<Endpoint>(idx.rel(id), ENDPOINTS_KEY)]));

  const inspected: InspectedCall[] = [];
  for (const call of calls.slice(0, MAX_CALLS)) {
    let url: URL;
    try {
      url = new URL(call.url);
    } catch {
      continue;
    }
    const method = (call.method || "GET").toUpperCase();
    const matches = candidates.filter((id) => endpoints.get(id)!.some((ep) => endpointMatches(ep, method, url)));
    inspected.push({ method, url: url.href, path: url.pathname, matches, suggested: suggestEndpoint(method, url) });
  }

  // Breadth-first walk over outgoing relationships, from the matched ones.
  const outgoing = new Map<string, string[]>();
  for (const r of rels) outgoing.set(r.sourceId, [...(outgoing.get(r.sourceId) ?? []), r.id]);
  const hops: InspectHop[] = [];
  const seen = new Set<string>();
  const reached = new Set(own);
  let frontier: InspectHop[] = [];
  for (const c of inspected)
    for (const id of c.matches)
      if (!seen.has(id)) {
        seen.add(id);
        reached.add(idx.rel(id).destinationId);
        frontier.push({ relationshipId: id, depth: 0, via: null });
      }
  let truncated = false;
  while (frontier.length) {
    hops.push(...frontier);
    const next: InspectHop[] = [];
    for (const h of frontier) {
      for (const id of outgoing.get(idx.rel(h.relationshipId).destinationId) ?? []) {
        const to = idx.rel(id).destinationId;
        if (seen.has(id) || reached.has(to)) continue;
        if (h.depth + 1 > depth) {
          truncated = true;
          continue;
        }
        seen.add(id);
        reached.add(to);
        next.push({ relationshipId: id, depth: h.depth + 1, via: h.relationshipId });
      }
    }
    frontier = next;
  }

  const elements: string[] = [];
  for (const h of hops) {
    const d = idx.rel(h.relationshipId).destinationId;
    if (!elements.includes(d) && !own.has(d)) elements.push(d);
  }
  const matched = new Set(hops.filter((h) => h.depth === 0).map((h) => h.relationshipId));
  const flows = listFlows(ws)
    .filter((f) => f.steps.some((s) => matched.has(s.relationshipId)))
    .map((f) => ({ key: f.key, title: f.title }));
  return { calls: inspected, hops, elements, flows, candidates, truncated };
}
