/**
 * History (DEC-057): the git commits that changed a project's model, each with what changed, and what
 * is not committed yet. Read-only: git is only read (DEC-018). A commit's model is compared with its
 * parent's; results are cached by commit, which never changes.
 */

import { diffModels, type Snapshot } from "./diff.js";
import { logFor, parentOf, type GitModels } from "./git.js";
import { emptySidecar } from "./sidecar.js";
import type { Project } from "./store.js";
import { emptyWorkspace } from "./workspace.js";
import type { ChangeSummary, HistoryChange, HistoryEntry, HistoryItem } from "../shared/types.js";

const MAX_ITEMS = 12;
const cache = new Map<string, HistoryChange>();
const empty = (): Snapshot => ({ workspace: emptyWorkspace("(none)"), sidecar: emptySidecar(), decisions: [] });

/** What one commit changed in the model under `models` (a project's model folder). */
export function commitChange(project: string, models: GitModels, sha: string): HistoryChange {
  const key = `${models.modelDir}|${sha}`;
  const hit = cache.get(key);
  if (hit) return { ...hit, project };
  const repo = models.need();
  const parent = parentOf(repo.cwd, sha);
  const after = models.at(sha);
  const before = parent ? models.at(parent) : empty();
  const cs = diffModels(before, after.present ? after : empty(), parent ?? "empty");
  const items: HistoryItem[] = [...cs.elements, ...cs.relationships, ...cs.flows, ...cs.decisions, ...cs.settings].slice(0, MAX_ITEMS).map((c) => ({ type: c.type, name: c.name, change: c.change }));
  const out: HistoryChange = { project, parent, summary: cs.summary, items };
  cache.set(key, out);
  if (cache.size > 2000) cache.delete(cache.keys().next().value!);
  return out;
}

/** The main model now compared with HEAD: what is not committed yet (null: no repository or no commit). */
export function uncommitted(project: Project, models: GitModels): ChangeSummary | null {
  if (!models.get()) return null;
  try {
    project.reloadIfChanged();
    return diffModels(models.at("HEAD"), project, "HEAD").summary;
  } catch {
    return null; // no commit yet
  }
}

/** Commits that touched any of the projects' model folders, newest first, each with what it changed per project. */
export function history(projects: { id: string; project: Project; models: GitModels }[], limit = 20): HistoryEntry[] {
  const bySha = new Map<string, HistoryEntry>();
  const logs: string[][] = [];
  for (const p of projects) {
    if (!p.models.get()) continue;
    const log = logFor(p.project.dir, ["."], limit);
    logs.push(log.map((e) => e.sha));
    for (const e of log) {
      let entry = bySha.get(e.sha);
      if (!entry) {
        entry = { sha: e.sha, date: e.date, author: e.author, subject: e.subject, changes: [] };
        bySha.set(e.sha, entry);
      }
      try {
        entry.changes.push(commitChange(p.id, p.models, e.sha));
      } catch {
        /* a commit whose model cannot be read: listed without its changes */
      }
    }
  }
  return mergeLogs(logs, bySha).slice(0, limit);
}

/**
 * The projects' logs (each newest first, in git's order) as one list, newest first. Dates have a
 * second's resolution, so on equal dates git's own order decides: a commit that still comes later in
 * another project's log is not taken before what precedes it there.
 */
function mergeLogs(logs: string[][], bySha: Map<string, HistoryEntry>): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  const done = new Set<string>();
  const heads = logs.map(() => 0);
  const date = (sha: string) => bySha.get(sha)!.date;
  for (;;) {
    for (let i = 0; i < logs.length; i++) while (heads[i]! < logs[i]!.length && done.has(logs[i]![heads[i]!]!)) heads[i]!++;
    const live = logs.map((l, i) => (heads[i]! < l.length ? l[heads[i]!]! : null)).filter((x): x is string => x !== null);
    if (!live.length) return out;
    const newest = live.reduce((a, b) => (date(b) > date(a) ? b : a));
    const ties = live.filter((s) => date(s) === date(newest));
    const laterElsewhere = (s: string) => logs.some((l, i) => l.indexOf(s, heads[i]! + 1) > heads[i]!);
    const pick = ties.find((s) => !laterElsewhere(s)) ?? ties[0]!;
    out.push(bySha.get(pick)!);
    done.add(pick);
  }
}
