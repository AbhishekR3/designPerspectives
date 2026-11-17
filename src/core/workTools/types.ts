/**
 * Live status of linked work (DEC-059, DEC-085): what every tool adapter (GitHub, GitLab, SonarQube, Jira)
 * provides, and the checks they share. An adapter turns a link into the API addresses that tell its status,
 * and the answers into a state. It never chooses where a token goes: the connection does (a built-in one, or
 * one an architect put in `.dp/integrations.json`), and every API address is built from encoded parts and
 * checked once more to start with the connection's own API root. The rules this keeps:
 *
 * - a link is used only when it has the connection's exact scheme, host, port and base path, no user name or
 *   password, a path that the address parser does not change (no "." or ".." segments, no backslashes) and
 *   parts with tight character classes (no "%", so no encoded slash);
 * - the API root comes from the connection only, never from the link, the model or the sidecar;
 * - the API address is checked after it is built: the same origin and the API root's path as a prefix.
 */

import type { WorkSeverityMaps, WorkToolId } from "../../shared/types.js";
import type { CredentialProvider } from "../../shared/types.js";

/** The `fetch` the server uses for outside calls (injectable for tests). `method`, `body` and `text()` are
 *  for the LLM backends (POST with a JSON body, error text); the work status calls only GET and read JSON. */
export type Fetch = (
  url: string,
  init: { method?: string; headers: Record<string, string>; body?: string; signal: AbortSignal; redirect?: "error" | "manual" | "follow" },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text?(): Promise<string> }>;

/** A connection as the status refresh uses it: where links are read from, and the credential's name (never its value). */
export interface Conn {
  id: string;
  tool: WorkToolId;
  /** Origin plus any path prefix, no trailing slash (checked by `checkServiceUrl`). */
  base: string;
  builtIn: boolean;
  /** The stored credential to send (a file connection); a built-in one uses the first credential of its tool's provider. */
  credential?: string;
  auth: "bearer" | "basic";
}

/** What a tool says about one link. */
export interface RemoteState {
  state: "open" | "in-progress" | "done";
  /** The tool's own words: "Merged", "In Review", "Quality gate failed · 3 vulnerabilities". */
  remote: string;
  /** critical | high | medium | low, when the tool has one. */
  severity?: string;
}

/** A link an adapter understood: its kind and the parts the API addresses are built from. */
export interface Parsed {
  kind: string;
  parts: Record<string, string>;
}

export interface WorkAdapter {
  tool: WorkToolId;
  /** The credential provider whose first credential a built-in connection uses (null: none). */
  provider: CredentialProvider | null;
  /** The API root of a connection: every request must start with it. */
  apiRoot(conn: Conn): string;
  /** The link's kind and parts, or null when it is not a link this adapter reads. `rest` is the path after the
   *  connection's base ("" or starting with "/"); `link` is the parsed link (for the query). */
  match(link: URL, rest: string, conn: Conn): Parsed | null;
  /** The API paths (with query) to call, relative to the API root, built from encoded parts. */
  requests(p: Parsed, conn: Conn): string[];
  /** Headers for every request; `token` is the credential's value (null: none). */
  headers(token: string | null, conn: Conn): Record<string, string>;
  /** The state from the answers (one per request, in order); throws a `ReadError` when they cannot be read.
   *  `maps`: the model's severity mapping (DEC-087), for tools that give a severity. */
  read(bodies: unknown[], p: Parsed, maps: WorkSeverityMaps): RemoteState;
}

/** An answer that is not what the tool should send; the message is short and never holds the body. */
export class ReadError extends Error {}

/**
 * The link's path after the connection's base, or null when the link is not under the connection or is not a
 * plain address. Checked here and not only by `connectionFor`, so an adapter never trusts its caller.
 */
export function linkRest(raw: string, conn: Pick<Conn, "base">): { link: URL; rest: string } | null {
  let u: URL;
  let b: URL;
  try {
    u = new URL(raw);
    b = new URL(conn.base);
  } catch {
    return null;
  }
  if (u.username || u.password || u.protocol !== b.protocol || u.host !== b.host) return null;
  // The path as written must be the path as parsed: no dot segments, backslashes or other rewrites.
  const written = raw.replace(/^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/?#]*/, "").replace(/[?#][\s\S]*$/, "") || "/";
  if (written !== u.pathname) return null;
  const prefix = b.pathname.replace(/\/+$/, "");
  if (prefix && u.pathname !== prefix && !u.pathname.startsWith(`${prefix}/`)) return null;
  return { link: u, rest: u.pathname.slice(prefix.length) };
}

/** The full API address of `relative` under `root`, or null when the built address leaves the root. */
export function apiAddress(root: string, relative: string): string | null {
  let r: URL;
  let u: URL;
  try {
    r = new URL(root);
    u = new URL(`${root.replace(/\/+$/, "")}${relative}`);
  } catch {
    return null;
  }
  const prefix = r.pathname.replace(/\/+$/, "");
  if (u.protocol !== r.protocol || u.host !== r.host || u.username || u.password || u.hash) return null;
  if (!u.pathname.startsWith(`${prefix}/`)) return null;
  // Nothing in the relative part was rewritten by the parser (an encoded part stays encoded).
  if (u.pathname !== `${prefix}${relative.replace(/\?[\s\S]*$/, "")}`) return null;
  return u.href;
}

/** `Authorization` for a token: bearer, or basic with the value `user:token`. */
export function authHeader(token: string, conn: Pick<Conn, "auth">): string {
  if (conn.auth === "basic") {
    if (!token.includes(":")) throw new ReadError('the credential for basic sign-in must be "user:token"');
    return `Basic ${Buffer.from(token, "utf-8").toString("base64")}`;
  }
  return `Bearer ${token}`;
}

/** A query string from parts, each encoded. */
export const query = (q: Record<string, string>): string => `?${new URLSearchParams(q).toString()}`;

export const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
export const text = (v: unknown): string => (typeof v === "string" ? v : "");
/** "MERGE_REQUEST" or "in review" as "Merge request", "In review". */
export const words = (s: string): string => {
  const t = s.replace(/[_-]+/g, " ").trim().toLowerCase();
  return t ? t[0]!.toUpperCase() + t.slice(1) : t;
};
