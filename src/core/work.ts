/**
 * Linked work pinned to any target (DEC-085): an element, a relationship, a diagram (its Structurizr view), a
 * flow (its dynamic view) or the project (the workspace). Every target keeps the same `dp.work` JSON list
 * (`cleanWork` in modelEdits.ts holds the item rules); this module finds the holder of a target, lists every
 * item in the model, and merges items that tools push (`dp work add|import`, POST /api/work/items).
 *
 * Diagram items need a stored view, so only landscape, context, container and component diagrams and flows
 * hold them; connector and code diagrams are computed and have no view of their own.
 *
 * This lives outside modelEdits.ts because it needs the diagram keys (diagrams.ts imports modelEdits.ts).
 */

import crypto from "node:crypto";
import { ensureView, findView, parseKey, relLabel, titleOf, validRef, VIEW_LIST_OF_LEVEL } from "./diagrams.js";
import { buildIndex, cleanWork, getJson, ModelError, setJson, WORK_KEY, WORK_KEY_MAX, WORK_MAX_TOTAL, type Index } from "./modelEdits.js";
import { cleanTarget } from "./comments.js";
import { isObj } from "./util.js";
import type { Workspace } from "./workspace.js";
import type { WorkConnectionInfo, WorkItem, WorkList, WorkPush, WorkPushResult, WorkRow, WorkTarget } from "../shared/types.js";
import { connectionFor } from "../shared/workLinks.js";

type Holder = { properties?: Record<string, string> | null };

/** A target from a request body: `{"type": "project"}` or a comment target (element, relationship, diagram). */
export function cleanWorkTarget(v: unknown): WorkTarget {
  if (isObj(v) && v.type === "project") return { type: "project" };
  try {
    return cleanTarget(v);
  } catch {
    throw new ModelError('Linked work needs a target: {"type": "project"} or {"type": "element" | "relationship" | "diagram", "id": ...}.');
  }
}

/** A target written as text (the CLI's `--to`): `project`, `element:<id>`, `relationship:<id>`, `diagram:<key>`
 *  (a flow is `diagram:flow-…`), or a bare ID or diagram key that the model knows. */
export function parseTargetSpec(ws: Workspace, spec: string): WorkTarget {
  const s = spec.trim();
  if (s === "project") return { type: "project" };
  const m = /^(element|relationship|diagram):(.+)$/.exec(s);
  if (m) return { type: m[1] as "element" | "relationship" | "diagram", id: m[2]! };
  const idx = buildIndex(ws);
  if (idx.elements.has(s)) return { type: "element", id: s };
  if (idx.relationships.has(s)) return { type: "relationship", id: s };
  if (parseKey(s) || ws.views.dynamicViews.some((v) => v.key === s)) return { type: "diagram", id: s };
  throw new ModelError(`"${spec}" is not an element, a relationship or a diagram of this model. Use project, element:<id>, relationship:<id> or diagram:<key>.`);
}

/** The object whose properties hold the target's `dp.work`. With `create`, a diagram's view is made when it is
 *  not stored yet (a diagram never laid out). Throws a ModelError for a target the model does not have. */
function holderOf(ws: Workspace, idx: Index, t: WorkTarget, create: boolean): Holder | null {
  if (t.type === "project") return ws;
  if (t.type === "element") {
    const el = idx.elements.get(t.id);
    if (!el) throw new ModelError(`No element with ID "${t.id}".`);
    return el;
  }
  if (t.type === "relationship") {
    const r = idx.relationships.get(t.id);
    if (!r) throw new ModelError(`No relationship with ID "${t.id}".`);
    return r;
  }
  const flow = ws.views.dynamicViews.find((v) => v.key === t.id);
  if (flow) return flow;
  const r = parseKey(t.id);
  if (!r || !validRef(idx, r)) throw new ModelError(`No diagram "${t.id}" in this model.`);
  if (!(r.level in VIEW_LIST_OF_LEVEL)) {
    throw new ModelError(
      r.level === "connector"
        ? "A connector diagram cannot hold linked work of its own: link it to the relationship instead."
        : "A code diagram cannot hold linked work of its own: link it to the element or relationship instead.",
    );
  }
  return findView(ws, t.id) ?? (create ? ensureView(ws, idx, r) : null);
}

function labelOf(ws: Workspace, idx: Index, t: WorkTarget): { label: string; targetKind: string } {
  if (t.type === "project") return { label: "Project", targetKind: "project" };
  if (t.type === "element") return { label: idx.elements.get(t.id)?.name ?? t.id, targetKind: idx.elements.has(t.id) ? idx.kindOf(t.id) : "element" };
  if (t.type === "relationship") return { label: idx.relationships.has(t.id) ? relLabel(idx, t.id) : t.id, targetKind: "relationship" };
  const flow = ws.views.dynamicViews.find((v) => v.key === t.id);
  if (flow) return { label: flow.title || flow.description || flow.key, targetKind: "flow" };
  const r = parseKey(t.id);
  return { label: r && validRef(idx, r) ? titleOf(idx, r) : t.id, targetKind: "diagram" };
}

/** The work items of one target ([] when it holds none). */
export function getWork(ws: Workspace, t: WorkTarget): WorkItem[] {
  return getJson<WorkItem>(holderOf(ws, buildIndex(ws), t, false), WORK_KEY);
}

/** Replace the work items of one target (checked by `cleanWork`; the model-wide limit is checked too). */
export function setWork(ws: Workspace, t: WorkTarget, items: unknown): void {
  const idx = buildIndex(ws);
  const list = cleanWork(items);
  setJson(holderOf(ws, idx, t, true)!, WORK_KEY, list);
  checkTotal(ws);
}

/** Every target that holds linked work, with its holder. */
function* targets(ws: Workspace, idx: Index): Generator<{ target: WorkTarget; holder: Holder }> {
  yield { target: { type: "project" }, holder: ws };
  for (const el of idx.elements.values()) yield { target: { type: "element", id: el.id }, holder: el };
  for (const r of idx.relationships.values()) yield { target: { type: "relationship", id: r.id }, holder: r };
  for (const list of Object.values(VIEW_LIST_OF_LEVEL)) for (const v of ws.views[list]) yield { target: { type: "diagram", id: v.key }, holder: v };
  for (const v of ws.views.dynamicViews) yield { target: { type: "diagram", id: v.key }, holder: v };
}

function checkTotal(ws: Workspace): void {
  let n = 0;
  for (const { holder } of targets(ws, buildIndex(ws))) n += getJson(holder, WORK_KEY).length;
  if (n > WORK_MAX_TOTAL) throw new ModelError(`A model holds at most ${WORK_MAX_TOTAL} linked work items; this change would make ${n}.`);
}

/** Every linked work item of the model, target by target (project, elements, relationships, diagrams, flows). */
export function listWork(ws: Workspace, connections: readonly WorkConnectionInfo[]): WorkList {
  const idx = buildIndex(ws);
  const rows: WorkRow[] = [];
  for (const { target, holder } of targets(ws, idx)) {
    const items = getJson<WorkItem>(holder, WORK_KEY);
    if (!items.length) continue;
    const { label, targetKind } = labelOf(ws, idx, target);
    items.forEach((item, index) => rows.push({ target, label, targetKind, index, item, tool: connectionFor(item.url, connections)?.tool ?? null }));
  }
  return { rows, connections: [...connections] };
}

/** Every link in the model's linked work, once each, in model order. */
export function allWorkLinks(ws: Workspace): string[] {
  const urls = new Set<string>();
  for (const { holder } of targets(ws, buildIndex(ws))) for (const w of getJson<WorkItem>(holder, WORK_KEY)) if (w.url) urls.add(w.url);
  return [...urls];
}

/** Rewrite the items of every target with `fix`, which gets the target's label for reports (null: leave that
 *  target as it is). Used by the status refresh. */
export function mapWork(ws: Workspace, fix: (items: WorkItem[], label: string) => WorkItem[] | null): void {
  const idx = buildIndex(ws);
  for (const { target, holder } of targets(ws, idx)) {
    const items = getJson<WorkItem>(holder, WORK_KEY);
    if (!items.length) continue;
    const next = fix(items, labelOf(ws, idx, target).label);
    if (next) setJson(holder, WORK_KEY, cleanWork(next));
  }
}

/** The key a pushed item is known by: its own key (under `source:` when a source is named), or, with a
 *  source, one made from its link or title. */
function pushKey(item: WorkItem, source: string | undefined): string | undefined {
  if (!source) return item.key;
  const own = item.key ?? item.url ?? item.title;
  if (own.startsWith(`${source}:`)) return own.length <= WORK_KEY_MAX ? own : `${source}:${sha(own)}`;
  const k = `${source}:${own}`;
  return k.length <= WORK_KEY_MAX ? k : `${source}:${sha(own)}`;
}
const sha = (s: string) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);

const SOURCE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

/**
 * Merge pushed items into the model. An item matches one of its target's items with the same key, else the
 * same link; a match takes the pushed fields but keeps a person's note, and an item the tool reports again
 * after it was done opens again unless the push says its status. With `source`, keys are kept under
 * `<source>:`; with `closeMissing` too, items of that source anywhere in the model that this push does not
 * report are set to done.
 */
export function upsertWork(ws: Workspace, pushes: WorkPush[], opts: { source?: string; closeMissing?: boolean } = {}): WorkPushResult {
  const source = opts.source?.trim() || undefined;
  if (source && !SOURCE.test(source)) throw new ModelError("A source is 1 to 40 letters, digits, dots, dashes or underscores, starting with a letter or digit.");
  if (opts.closeMissing && !source) throw new ModelError("Closing items that are no longer reported needs a source, so only that tool's items are closed.");
  const idx = buildIndex(ws);
  const result: WorkPushResult = { added: 0, updated: 0, closed: 0, unchanged: 0, rows: [] };
  const seen = new Set<string>();
  // One list per target, written back at the end.
  const lists = new Map<Holder, { target: WorkTarget; items: WorkItem[] }>();
  const listOf = (t: WorkTarget) => {
    const holder = holderOf(ws, idx, t, true)!;
    if (!lists.has(holder)) lists.set(holder, { target: t, items: getJson<WorkItem>(holder, WORK_KEY) });
    return lists.get(holder)!;
  };
  pushes.forEach((p, i) => {
    if (!isObj(p) || !isObj(p.item)) throw new ModelError(`Item ${i + 1}: needs "to" and "item".`);
    const to = cleanWorkTarget(p.to);
    const given = p.item as Partial<WorkItem>;
    const [clean] = cleanWork([given]);
    if (!clean) throw new ModelError(`Item ${i + 1}: needs a title or a link.`);
    const key = pushKey(clean, source);
    if (key) clean.key = key;
    if (key) seen.add(key);
    const list = listOf(to);
    const at = list.items.findIndex((w) => (key && w.key === key) || (!!clean.url && w.url === clean.url && (!w.key || !key)));
    const { label } = labelOf(ws, idx, to);
    if (at < 0) {
      list.items.push(clean);
      result.added++;
      result.rows.push({ to, label, title: clean.title, change: "added" });
      return;
    }
    const old = list.items[at]!;
    const merged: WorkItem = { ...old, ...clean };
    if (old.note) merged.note = old.note;
    if (!given.status) merged.status = old.status === "done" ? "open" : old.status;
    if (!given.severity && old.severity && !clean.severity) merged.severity = old.severity;
    const changed = JSON.stringify(merged) !== JSON.stringify(old);
    list.items[at] = merged;
    result[changed ? "updated" : "unchanged"]++;
    result.rows.push({ to, label, title: merged.title, change: changed ? "updated" : "unchanged" });
  });
  if (opts.closeMissing && source) {
    for (const { target, holder } of targets(ws, idx)) {
      const entry = lists.get(holder) ?? { target, items: getJson<WorkItem>(holder, WORK_KEY) };
      let touched = false;
      entry.items = entry.items.map((w) => {
        if (!w.key?.startsWith(`${source}:`) || seen.has(w.key) || w.status === "done") return w;
        touched = true;
        result.closed++;
        result.rows.push({ to: target, label: labelOf(ws, idx, target).label, title: w.title, change: "closed" });
        return { ...w, status: "done" };
      });
      if (touched && !lists.has(holder)) lists.set(holder, entry);
    }
  }
  for (const [holder, { items }] of lists) setJson(holder, WORK_KEY, cleanWork(items));
  checkTotal(ws);
  return result;
}
