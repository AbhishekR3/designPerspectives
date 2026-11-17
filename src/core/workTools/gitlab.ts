/**
 * GitLab issues and merge requests (DEC-085): gitlab.com, or a GitLab of the team's own, also under a path
 * (`https://example.com/gitlab`). Links: `<base>/<group/sub/project>/-/issues/<iid>` and
 * `<base>/<group/sub/project>/-/merge_requests/<iid>`, read through
 * `<base>/api/v4/projects/<the project path, encoded as one part>/issues|merge_requests/<iid>`.
 * Opened → open; closed or merged → done. Each part of the project path is letters, digits, "_", "." and
 * "-", never "." or ".."; the whole path is encoded into one API path part, so it cannot add a segment.
 */

import { ReadError, authHeader, obj, text, type WorkAdapter } from "./types.js";

const SEGMENT = /^(?!\.\.?$)[A-Za-z0-9_][A-Za-z0-9_.-]{0,254}$/;
const PATH = /^\/((?:[^/]+\/){1,19}[^/]+)\/-\/(issues|merge_requests)\/(\d{1,12})\/?$/;

export const gitlab: WorkAdapter = {
  tool: "gitlab",
  provider: "gitlab",
  apiRoot: (conn) => `${conn.base}/api/v4`,
  match(_link, rest) {
    const m = PATH.exec(rest);
    if (!m || !m[1]!.split("/").every((s) => SEGMENT.test(s))) return null;
    return { kind: m[2] === "merge_requests" ? "merge_request" : "issue", parts: { project: m[1]!, iid: m[3]! } };
  },
  requests: (p) => [`/projects/${encodeURIComponent(p.parts.project!)}/${p.kind === "merge_request" ? "merge_requests" : "issues"}/${p.parts.iid}`],
  headers(token, conn) {
    const h: Record<string, string> = { Accept: "application/json", "User-Agent": "designPerspectives" };
    if (token) h.Authorization = authHeader(token, conn);
    return h;
  },
  read([body]) {
    const state = text(obj(body).state);
    if (state === "opened" || state === "locked") return { state: "open", remote: "Open" };
    if (state === "merged") return { state: "done", remote: "Merged" };
    if (state === "closed") return { state: "done", remote: "Closed" };
    throw new ReadError("GitLab sent an answer without a state");
  },
};
