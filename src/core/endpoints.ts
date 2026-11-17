/**
 * API endpoints: which relationship an HTTP call belongs to.
 *
 * A relationship lists the HTTP calls it carries as endpoints (`dp.endpoints`, see modelEdits.ts).
 *
 * Endpoint matching: the method must be equal (or "*"). A path pattern is compared segment by
 * segment with the call's path: ":name" matches one segment, a final "*" matches the rest, anything
 * else must be equal. A pattern that is a full URL is compared with the call's origin and path.
 */

import type { Endpoint } from "../shared/types.js";

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
