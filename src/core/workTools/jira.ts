/**
 * Jira issues (DEC-085), only through a connection an architect adds (every Jira site has its own host, so
 * there is no built-in one). Link: `<base>/browse/KEY-123`, read through
 * `<base>/rest/api/2/issue/KEY-123?fields=status,summary,priority`. The status category decides the state:
 * new → open, indeterminate → in-progress, done → done; the status name is the tool's own words. The priority
 * gives the severity through the model's `jira` table (DEC-087; by default Highest → critical, High → high,
 * Medium → medium, Low and Lowest → low; a site's own priority names can be added). Jira Cloud signs
 * in with basic auth (`auth: "basic"`, the credential `email:api-token`); Jira Data Center with a bearer token.
 */

import { ReadError, authHeader, obj, query, text, type WorkAdapter } from "./types.js";
import { severityOf } from "../../shared/workLinks.js";

const PATH = /^\/browse\/([A-Za-z][A-Za-z0-9_]{0,49}-\d{1,12})\/?$/;
const CATEGORY: Record<string, "open" | "in-progress" | "done"> = { new: "open", indeterminate: "in-progress", done: "done" };

export const jira: WorkAdapter = {
  tool: "jira",
  provider: null,
  apiRoot: (conn) => `${conn.base}/rest/api/2`,
  match(_link, rest) {
    const m = PATH.exec(rest);
    return m ? { kind: "issue", parts: { key: m[1]!.toUpperCase() } } : null;
  },
  requests: (p) => [`/issue/${encodeURIComponent(p.parts.key!)}${query({ fields: "status,summary,priority" })}`],
  headers(token, conn) {
    const h: Record<string, string> = { Accept: "application/json", "User-Agent": "designPerspectives" };
    if (token) h.Authorization = authHeader(token, conn);
    return h;
  },
  read([body], _p, maps) {
    const fields = obj(obj(body).fields);
    const status = obj(fields.status);
    const state = CATEGORY[text(obj(status.statusCategory).key)];
    if (!state) throw new ReadError("Jira sent an answer without a status");
    const severity = severityOf(maps.jira, text(obj(fields.priority).name));
    return { state, remote: text(status.name) || state, ...(severity ? { severity } : {}) };
  },
};
