/**
 * GitHub issues and pull requests (WRK-01, WRK-02). github.com is read through api.github.com; a GitHub
 * Enterprise server an architect connects is read through `<base>/api/v3`. Links:
 * `<base>/<owner>/<repo>/issues/<n>` and `<base>/<owner>/<repo>/pull/<n>`. Open → open; closed or merged → done.
 *
 * GitHub's own name rules: an owner is letters, digits and dashes; a repository also dots and underscores,
 * but never "." or "..", which would change the API path the token is sent to.
 */

import { ReadError, authHeader, obj, text, type Conn, type WorkAdapter } from "./types.js";

const PATH = /^\/([A-Za-z0-9-]{1,39})\/((?!\.\.?\/)[A-Za-z0-9._-]{1,100})\/(issues|pull)\/(\d{1,12})\/?$/;

export const github: WorkAdapter = {
  tool: "github",
  provider: "github",
  apiRoot: (conn: Conn) => (conn.base === "https://github.com" ? "https://api.github.com" : `${conn.base}/api/v3`),
  match(_link, rest) {
    const m = PATH.exec(rest);
    if (!m) return null;
    return { kind: m[3] === "pull" ? "pull" : "issue", parts: { owner: m[1]!, repo: m[2]!, n: m[4]! } };
  },
  requests: (p) => [`/repos/${encodeURIComponent(p.parts.owner!)}/${encodeURIComponent(p.parts.repo!)}/${p.kind === "pull" ? "pulls" : "issues"}/${p.parts.n}`],
  headers(token, conn) {
    const h: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": "designPerspectives", "X-GitHub-Api-Version": "2022-11-28" };
    if (token) h.Authorization = authHeader(token, conn);
    return h;
  },
  read([body]) {
    const b = obj(body);
    const state = text(b.state);
    if (state !== "open" && state !== "closed") throw new ReadError("GitHub sent an answer without a state");
    if (b.merged_at) return { state: "done", remote: "Merged" };
    return state === "closed" ? { state: "done", remote: "Closed" } : { state: "open", remote: b.draft === true ? "Draft" : "Open" };
  },
};
