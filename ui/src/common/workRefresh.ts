// Reading the status of linked work from its tools (WRK-01, WRK-02): which links a known connection reads, and the toast after a refresh.
import { api } from "../api";
import { connectionFor } from "../../../src/shared/workLinks";
import { errorMessage, notify } from "./notify";
import { plural } from "./plural";
import { WORK_TOOL_LABEL, type AppState, type WorkItem, type WorkRefresh } from "../types";

/** How many links in the model (elements, relationships, flows, the project) a known connection reads. Diagram items are not in the state. */
export function knownLinkCount(state: AppState, extra: WorkItem[] = []): number {
  const conns = state.workConnections ?? [];
  const all = [...state.elements.flatMap((e) => e.work), ...state.relationships.flatMap((r) => r.work), ...state.flows.flatMap((f) => f.work), ...(state.projectWork ?? []), ...extra];
  return all.filter((w) => connectionFor(w.url, conns)).length;
}

/** "Checked 5 links (GitHub 3, GitLab 2): 1 status changed." */
export function refreshSummary(r: WorkRefresh): string {
  const per = new Map<string, number>();
  for (const t of r.byTool) per.set(WORK_TOOL_LABEL[t.tool] ?? t.tool, (per.get(WORK_TOOL_LABEL[t.tool] ?? t.tool) ?? 0) + t.checked);
  const tools = [...per].map(([name, n]) => `${name} ${n}`).join(", ");
  const changed = r.updated.length;
  let msg = `Checked ${plural(r.checked, "link")}${tools ? ` (${tools})` : ""}: ${changed} ${changed === 1 ? "status" : "statuses"} changed.`;
  if (r.unknown > 0) msg += ` ${plural(r.unknown, "link")} ${r.unknown === 1 ? "is" : "are"} not from a known tool and ${r.unknown === 1 ? "keeps" : "keep"} the status it has.`;
  return msg;
}

/** Ask the server to read every status (the model reloads after), then show what happened. Returns the answer, or null when it failed (the error is shown). */
export async function refreshWorkStatus(mutate: (fn: () => Promise<unknown>) => Promise<boolean>): Promise<WorkRefresh | null> {
  let result: WorkRefresh | null = null;
  try {
    await mutate(async () => {
      result = await api.refreshWork();
    });
  } catch (e) {
    notify.error(errorMessage(e));
    return null;
  }
  const r = result as WorkRefresh | null;
  if (!r) return null;
  notify.success(refreshSummary(r));
  if (r.failed.length) notify.error(`${plural(r.failed.length, "link")} could not be read: ${r.failed.map((f) => `${f.url} (${f.reason})`).join("; ")}`);
  return r;
}
