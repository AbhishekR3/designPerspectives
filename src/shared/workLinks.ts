// Which tool a linked work item's link belongs to (WRK-02), shared by the server and the UI. Pure functions:
// no Node or DOM imports. This only labels a link; whether a token may be sent is decided on the server by
// the tool's adapter (src/core/workTools/), which also checks the exact path.

import type { WorkConnectionInfo, WorkItem, WorkSeverityChoice } from "./types.js";

/** The connection whose base the link starts with (the longest base wins, so a GitLab under a path beats one
 *  at the root of the same host), or null. Compared on the parsed URL: scheme, host and port must match and
 *  the path must start with the base path at a segment boundary. */
export function connectionFor(url: string | undefined, connections: readonly WorkConnectionInfo[]): WorkConnectionInfo | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.username || u.password) return null;
  let best: WorkConnectionInfo | null = null;
  let bestLen = -1;
  for (const c of connections) {
    let b: URL;
    try {
      b = new URL(c.base);
    } catch {
      continue;
    }
    if (b.protocol !== u.protocol || b.host !== u.host) continue;
    const prefix = b.pathname.replace(/\/+$/, "");
    if (prefix && u.pathname !== prefix && !u.pathname.startsWith(`${prefix}/`)) continue;
    if (prefix.length > bestLen) {
      best = c;
      bestLen = prefix.length;
    }
  }
  return best;
}

/** Not done. */
export const isOpenWork = (w: Pick<WorkItem, "status">): boolean => w.status !== "done";

/** A tool's own severity word through one of the model's severity tables (WRK-04): matched in lower case;
 *  a name the table does not hold, or one mapped to "", gives none. */
export function severityOf(table: Readonly<Record<string, WorkSeverityChoice>>, name: string): WorkSeverityChoice | undefined {
  const key = name.trim().toLowerCase();
  return (Object.prototype.hasOwnProperty.call(table, key) && table[key]) || undefined;
}
