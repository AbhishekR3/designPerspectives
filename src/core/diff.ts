/**
 * What changed between two versions of a model: elements, relationships, flows and settings,
 * each added / changed / removed, with the fields that differ. Objects are matched by ID (IDs do
 * not change on rename, and elements cannot move to another parent).
 *
 * Fields are compared on the summaries the UI shows (`elementSummary`, `relationshipSummary`),
 * so a change is reported in the same terms the property panel uses. Positions, sizes, line
 * shapes and styles are counted as layout changes only.
 */

import { drawnInMap, homeKey } from "./diagrams.js";
import { listFlows } from "./flows.js";
import { buildIndex, elementSummary, relationshipSummary, type Index } from "./ops.js";
import type { Sidecar } from "./sidecar.js";
import { canon, flatten, isLayoutUnit, sameUnit, unitLabel, type Unit, type Units } from "./units.js";
import type { Workspace } from "./workspace.js";
import type { ChangeSet, FieldChange, Flow, ObjectChange } from "../shared/types.js";

export interface Snapshot {
  workspace: Workspace;
  sidecar: Sidecar;
}

const ELEMENT_FIELDS: [string, string][] = [
  ["name", "Name"],
  ["description", "Description"],
  ["technologies", "Technology"],
  ["external", "External"],
  ["url", "URL"],
  ["owner", "Owner"],
  ["archType", "Symbol"],
  ["tags", "Tags"],
  ["links", "Links"],
  ["notes", "Notes"],
  ["details", "Details"],
  ["tradeoffs", "Tradeoffs"],
  ["usage", "Usage"],
  ["sensitive", "Sensitive information"],
  ["characteristics", "Characteristics"],
  ["cost", "Cost"],
  ["work", "Linked work"],
  ["codePaths", "Code"],
];

const RELATIONSHIP_FIELDS: [string, string][] = [
  ["description", "Description"],
  ["sourceId", "From"],
  ["destinationId", "To"],
  ["technologies", "Technology"],
  ["kind", "Connector kind"],
  ["notes", "Notes"],
  ["sensitive", "Sensitive information"],
  ["stages", "Stages"],
  ["work", "Linked work"],
  ["codePaths", "Code"],
];

const FLOW_FIELDS: [string, string][] = [
  ["title", "Name"],
  ["description", "Description"],
  ["steps", "Steps"],
];

function fieldChanges(a: Record<string, unknown>, b: Record<string, unknown>, fields: [string, string][]): FieldChange[] {
  const out: FieldChange[] = [];
  for (const [field, label] of fields) {
    if (canon(a[field]) !== canon(b[field])) out.push({ field, label, before: a[field] ?? null, after: b[field] ?? null });
  }
  return out;
}

const OTHER: FieldChange = { field: "other", label: "Other data", before: null, after: null };

/** Compare `before` (e.g. a draft's base) with `after` (the draft). */
export function diffModels(before: Snapshot, after: Snapshot, against: string): ChangeSet {
  const ua = flatten(before.workspace, before.sidecar);
  const ub = flatten(after.workspace, after.sidecar);
  const ia = buildIndex(before.workspace);
  const ib = buildIndex(after.workspace);
  const drawnA = lazy(() => drawnInMap(ia));
  const drawnB = lazy(() => drawnInMap(ib));

  const elements: ObjectChange[] = [];
  const relationships: ObjectChange[] = [];
  const flows: ObjectChange[] = [];
  const settings: ObjectChange[] = [];
  let layout = 0;

  // Elements, in the order of the newer version, then removed ones.
  for (const id of ordered(ia.elements, ib.elements)) {
    const inA = ia.elements.has(id);
    const inB = ib.elements.has(id);
    if (inA && inB) {
      if (sameUnit(ua.get(`el:${id}`), ub.get(`el:${id}`))) continue;
      const sa = elementSummary(ia, id) as unknown as Record<string, unknown>;
      const sb = elementSummary(ib, id) as unknown as Record<string, unknown>;
      const fields = fieldChanges(sa, sb, ELEMENT_FIELDS);
      elements.push(objChange("element", ib.kindOf(id), id, String(sb.name), "changed", fields.length ? fields : [OTHER], homeKey(ib, id)));
    } else {
      const idx = inB ? ib : ia;
      elements.push(objChange("element", idx.kindOf(id), id, idx.el(id).name, inB ? "added" : "removed", [], homeKey(idx, id)));
    }
  }

  for (const id of ordered(ia.relationships, ib.relationships)) {
    const inA = ia.relationships.has(id);
    const inB = ib.relationships.has(id);
    if (inA && inB) {
      if (sameUnit(ua.get(`rel:${id}`), ub.get(`rel:${id}`))) continue;
      const sa = relationshipSummary(ia.rel(id)) as unknown as Record<string, unknown>;
      const sb = relationshipSummary(ib.rel(id)) as unknown as Record<string, unknown>;
      const fields = fieldChanges(sa, sb, RELATIONSHIP_FIELDS);
      relationships.push(objChange("relationship", "relationship", id, relName(ib, id), "changed", fields.length ? fields : [OTHER], drawnB().get(id) ?? null));
    } else {
      const idx = inB ? ib : ia;
      relationships.push(objChange("relationship", "relationship", id, relName(idx, id), inB ? "added" : "removed", [], (inB ? drawnB() : drawnA()).get(id) ?? null));
    }
  }

  const fa = new Map(listFlows(before.workspace).map((f) => [f.key, f]));
  const fb = new Map(listFlows(after.workspace).map((f) => [f.key, f]));
  for (const key of ordered(fa, fb)) {
    const a = fa.get(key);
    const b = fb.get(key);
    if (a && b) {
      if (sameUnit(ua.get(`view:${key}`), ub.get(`view:${key}`))) continue;
      const fields = fieldChanges(flowData(a), flowData(b), FLOW_FIELDS);
      flows.push(objChange("flow", "flow", key, b.title, "changed", fields.length ? fields : [OTHER], key));
    } else {
      const f = (b ?? a)!;
      flows.push(objChange("flow", "flow", key, f.title, b ? "added" : "removed", [], b ? key : null));
    }
  }

  // Everything else: settings (tag groups, lenses, characteristics, cost, workspace name, ...)
  // and layout. Elements, relationships and views are covered above.
  for (const key of ordered(ua, ub)) {
    const a = ua.get(key);
    const b = ub.get(key);
    if (sameUnit(a, b)) continue;
    const u = (b ?? a)!;
    if (isLayoutUnit(u)) {
      layout++;
      continue;
    }
    if (u.t === "el" || u.t === "rel" || u.t === "view" || u.t === "vrel") continue;
    settings.push(objChange("setting", settingKind(u), key, unitLabel(u), !a ? "added" : !b ? "removed" : "changed", [], null));
  }

  // Ancestors of changed things show "changed inside" on higher-level diagrams.
  const touched = new Set(elements.map((e) => e.id));
  const inner = new Set<string>();
  const markAbove = (idx: Index, id: string, self: boolean) => {
    if (!idx.elements.has(id)) return;
    for (const anc of idx.ancestors(id).slice(self ? 0 : 1)) if (!touched.has(anc)) inner.add(anc);
  };
  for (const e of elements) markAbove(e.change === "removed" ? ia : ib, e.id, false);
  for (const r of relationships) {
    const idx = r.change === "removed" ? ia : ib;
    const rel = idx.relationships.get(r.id)!;
    markAbove(idx, rel.sourceId, false);
    markAbove(idx, rel.destinationId, false);
  }

  const all = [...elements, ...relationships, ...flows, ...settings];
  const count = (c: string) => all.filter((x) => x.change === c).length;
  return {
    against,
    elements,
    relationships,
    flows,
    settings,
    inner: [...inner].filter((id) => ib.elements.has(id)),
    summary: { added: count("added"), changed: count("changed"), removed: count("removed"), layout },
  };
}

function objChange(
  type: ObjectChange["type"],
  kind: string,
  id: string,
  name: string,
  change: ObjectChange["change"],
  fields: FieldChange[],
  homeKeyValue: string | null,
): ObjectChange {
  return { id, type, kind, name, change, fields, homeKey: homeKeyValue };
}

function relName(idx: Index, id: string): string {
  const r = idx.rel(id);
  const from = idx.elements.get(r.sourceId)?.name ?? r.sourceId;
  const to = idx.elements.get(r.destinationId)?.name ?? r.destinationId;
  return `${from} → ${to}${r.description ? `: ${r.description}` : ""}`;
}

function flowData(f: Flow): Record<string, unknown> {
  return { title: f.title, description: f.description, steps: f.steps };
}

function settingKind(u: Unit): string {
  if (u.t === "tg") return "tagGroup";
  if (u.t === "lens") return "lens";
  if (u.t === "ws") return "workspace";
  if (u.t === "sc") return u.k;
  return u.t;
}

/** Keys of `b` in order, then keys only in `a`. */
function ordered<K>(a: Map<K, unknown>, b: Map<K, unknown>): K[] {
  return [...b.keys(), ...[...a.keys()].filter((k) => !b.has(k))];
}

function lazy<T>(f: () => T): () => T {
  let v: T | undefined;
  let done = false;
  return () => {
    if (!done) {
      v = f();
      done = true;
    }
    return v as T;
  };
}

/** ID → change kind, for decorating diagrams. */
export function changeMap(cs: ChangeSet): Map<string, ObjectChange["change"] | "inner"> {
  const m = new Map<string, ObjectChange["change"] | "inner">();
  for (const id of cs.inner) m.set(id, "inner");
  for (const c of [...cs.elements, ...cs.relationships]) m.set(c.id, c.change);
  return m;
}

export type { Units };
