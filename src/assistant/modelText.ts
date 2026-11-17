/**
 * The model as structured text for BMO (backlog section 2, Stage D rules: the LLM gets the model as text,
 * never images). Plain functions over plain data (a workspace and sidecar, a computed diagram, a change set),
 * so the routes can assemble them from any model version. Output is deterministic: model order, no dates.
 *
 * IDs are always written next to names, so BMO can refer to existing objects by ID and a re-import keeps them.
 */

import { buildIndex, CODE_KEY, elementSummary, getJson, OWNER_KEY, getProps, splitTech, type Index } from "../core/modelEdits.js";
import type { Sidecar } from "../core/designPerspectivesFile.js";
import type { Kind, Workspace } from "../core/workspace.js";
import type { ChangeSet, Diagram, ObjectChange } from "../shared/types.js";

const KIND_LABEL: Record<Kind, string> = { person: "person", softwareSystem: "system", container: "container", component: "component" };
const DEPTH_KINDS: Record<string, Kind[]> = {
  c1: ["person", "softwareSystem"],
  c2: ["person", "softwareSystem", "container"],
  c3: ["person", "softwareSystem", "container", "component"],
  c4: ["person", "softwareSystem", "container", "component"],
};

/** What part of the model to write: everything (default), one element and what is inside it, and how deep. */
export interface ModelScope {
  /** Only this element, its ancestors, everything inside it and the elements it has relationships with. */
  root?: string;
  /** The deepest level written: c1 (people and systems), c2 (and containers), c3/c4 (and components). Default c3. */
  depth?: "c1" | "c2" | "c3" | "c4";
}

const oneLine = (s: string | null | undefined, max = 400): string => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};
const q = (s: string): string => JSON.stringify(s);

/** The model (or a part of it) as text: elements nested by parent, then relationships, then tag groups. */
export function modelText(ws: Workspace, sc: Sidecar | null, scope: ModelScope = {}): string {
  const idx = buildIndex(ws);
  const kinds = new Set(DEPTH_KINDS[scope.depth ?? "c3"]);
  let keep: Set<string> | null = null;
  if (scope.root && idx.elements.has(scope.root)) {
    keep = new Set([...idx.ancestors(scope.root), ...idx.descendants(scope.root)]);
    const inside = new Set([scope.root, ...idx.descendants(scope.root)]);
    for (const r of idx.relationships.values()) {
      if (inside.has(r.sourceId)) idx.ancestors(r.destinationId).forEach((a) => keep!.add(a));
      if (inside.has(r.destinationId)) idx.ancestors(r.sourceId).forEach((a) => keep!.add(a));
    }
  }
  const shown = (id: string) => kinds.has(idx.kindOf(id)) && (!keep || keep.has(id));
  const out: string[] = [`Model: ${q(ws.name)}`];
  if (ws.description) out.push(`Description: ${oneLine(ws.description)}`);
  out.push("", "Elements (indented under their parent):");
  let n = 0;
  const writeEl = (id: string, depth: number) => {
    if (!shown(id)) return;
    n++;
    out.push(`${"  ".repeat(depth)}- ${elementLine(idx, id)}`);
    for (const c of idx.childrenOf(id)) writeEl(c, depth + 1);
  };
  for (const el of [...ws.model.people, ...ws.model.softwareSystems]) writeEl(el.id, 0);
  if (!n) out.push("- (none)");

  out.push("", "Relationships (ID: source -> target, what flows [technology]):");
  let m = 0;
  for (const r of idx.relationships.values()) {
    if (!shown(r.sourceId) || !shown(r.destinationId)) continue;
    m++;
    const tech = splitTech(r.technology);
    const paths = getJson<string>(r, CODE_KEY);
    out.push(`- ${r.id}: ${r.sourceId} -> ${r.destinationId} ${q(r.description || "")}${tech.length ? ` [${tech.join(", ")}]` : ""}${paths.length ? ` code: ${paths.join(", ")}` : ""}`);
  }
  if (!m) out.push("- (none)");

  if (sc?.tagGroups.length) {
    out.push("", "Tag groups (name: values):");
    for (const g of sc.tagGroups) out.push(`- ${g.name}: ${g.values.map((v) => v.name).join(", ")}`);
  }
  return out.join("\n") + "\n";
}

function elementLine(idx: Index, id: string): string {
  const el = idx.el(id);
  const kind = idx.kindOf(id);
  const props = getProps(el);
  const tech = splitTech(el.technology);
  const paths = getJson<string>(el, CODE_KEY);
  const tags = Object.entries(elementSummary(idx, id).tags);
  const parts = [`${KIND_LABEL[kind]} ${id} ${q(el.name)}`];
  if ((kind === "person" || kind === "softwareSystem") && el.location === "External") parts.push("(external)");
  if (tech.length) parts.push(`[${tech.join(", ")}]`);
  if (el.description) parts.push(`: ${oneLine(el.description)}`);
  const extra: string[] = [];
  if (props[OWNER_KEY]) extra.push(`owner ${q(props[OWNER_KEY])}`);
  if (tags.length) extra.push(`tags ${tags.map(([g, v]) => `${g}=${v}`).join(", ")}`);
  if (paths.length) extra.push(`code ${paths.join(", ")}`);
  return parts.join(" ") + (extra.length ? ` (${extra.join("; ")})` : "");
}

/** One element in detail: its fields, what it contains and its relationships, for "explain this object". */
export function objectText(ws: Workspace, sc: Sidecar | null, id: string, sections: readonly string[] = []): string {
  const idx = buildIndex(ws);
  const s = elementSummary(idx, id);
  const show = new Set(sections);
  const out = [`Object: ${KIND_LABEL[s.kind as Kind] ?? s.kind} ${s.id} ${q(s.name)}${s.external ? " (external)" : ""}`];
  const parent = idx.parentOf(id);
  if (parent) out.push(`Inside: ${parent} ${q(idx.el(parent).name)}`);
  if (s.description) out.push(`Description: ${oneLine(s.description, 2000)}`);
  if (s.technologies.length) out.push(`Technology: ${s.technologies.join(", ")}`);
  if (s.owner) out.push(`Owner: ${s.owner}`);
  const tags = Object.entries(s.tags);
  if (tags.length) out.push(`Tags: ${tags.map(([g, v]) => `${g}=${v}`).join(", ")}`);
  if (show.has("notes") && s.notes) out.push(`Notes: ${oneLine(s.notes, 2000)}`);
  if (show.has("tradeoffs") && s.tradeoffs.length) out.push("Trade-offs:", ...s.tradeoffs.map((t) => `- ${JSON.stringify(t)}`));
  if (show.has("characteristics") && s.characteristics.length) out.push("Characteristics:", ...s.characteristics.map((c) => `- ${JSON.stringify(c)}`));
  if (show.has("cost") && s.cost.length) out.push(`Cost: ${s.costTotal} (with children ${s.costRollup})`);
  if (show.has("work") && s.work.length) out.push("Work:", ...s.work.map((w) => `- ${JSON.stringify(w)}`));
  if (show.has("code") && s.codePaths.length) out.push(`Code: ${s.codePaths.join(", ")}`);
  const kids = idx.childrenOf(id);
  if (kids.length) out.push("Contains:", ...kids.map((c) => `- ${elementLine(idx, c)}`));
  const rels = [...idx.relationships.values()].filter((r) => r.sourceId === id || r.destinationId === id);
  if (rels.length) {
    out.push("Relationships:");
    for (const r of rels) {
      const other = r.sourceId === id ? r.destinationId : r.sourceId;
      const dir = r.sourceId === id ? "->" : "<-";
      out.push(`- ${r.id}: ${dir} ${other} ${q(idx.elements.get(other)?.name ?? other)} ${q(r.description || "")}`);
    }
  }
  if (sc?.tagGroups.length && tags.length) out.push(`Tag groups: ${sc.tagGroups.map((g) => g.name).join(", ")}`);
  return out.join("\n") + "\n";
}

/** A computed diagram as text: what it shows, its boxes and its lines (as the lens shows them). */
export function diagramText(d: Diagram, lens: { sections?: readonly string[]; showTechnology?: boolean; showDescriptions?: boolean } = {}): string {
  const tech = lens.showTechnology !== false;
  const desc = lens.showDescriptions !== false;
  const show = new Set(lens.sections ?? []);
  const names = new Map(d.nodes.map((n) => [n.id, n.name]));
  const out = [`Diagram: ${q(d.title)} (${d.c4 || d.level}; key ${d.key})`];
  if (d.boundary) out.push(`Inside: ${KIND_LABEL[d.boundary.kind]} ${d.boundary.id} ${q(d.boundary.name)}`);
  out.push("", "Boxes:");
  for (const n of d.nodes) {
    const parts = [`- ${n.kind} ${n.id} ${q(n.name)}`];
    if (n.external) parts.push("(external)");
    if (!n.inScope) parts.push("(outside the scope)");
    if (tech && n.technologies?.length) parts.push(`[${n.technologies.join(", ")}]`);
    if (desc && n.description) parts.push(`: ${oneLine(n.description)}`);
    if (n.filePath) parts.push(`file ${n.filePath}`);
    out.push(parts.join(" "));
    if (show.has("notes") && n.notes) out.push(`  notes: ${oneLine(n.notes)}`);
    if (show.has("characteristics") && n.characteristics?.length) out.push(`  characteristics: ${n.characteristics.map((c) => JSON.stringify(c)).join("; ")}`);
    if (show.has("tradeoffs") && n.tradeoffs?.length) out.push(`  trade-offs: ${n.tradeoffs.map((t) => JSON.stringify(t)).join("; ")}`);
    if (show.has("cost") && n.costTotal) out.push(`  cost: ${n.costTotal}`);
    if (show.has("work") && n.work?.length) out.push(`  work: ${n.work.map((w) => JSON.stringify(w)).join("; ")}`);
    if (show.has("code") && n.codePaths?.length) out.push(`  code: ${n.codePaths.join(", ")}`);
  }
  out.push("", "Lines (source -> target: what flows):");
  for (const e of d.edges) {
    const parts = [`- ${q(names.get(e.source) ?? e.source)} -> ${q(names.get(e.target) ?? e.target)}: ${q(e.description)}`];
    if (tech && e.technologies?.length) parts.push(`[${e.technologies.join(", ")}]`);
    if (e.derived) parts.push("(summarises lower-level relationships)");
    out.push(parts.join(" "));
  }
  if (!d.edges.length) out.push("- (none)");
  if (d.flow) {
    out.push("", `Flow ${q(d.flow.title)}:`);
    d.flow.steps.forEach((s, i) => out.push(`${i + 1}. ${s.relationshipId}${s.response ? " (response)" : ""}: ${q(s.description)}`));
  }
  return out.join("\n") + "\n";
}

const value = (v: unknown): string => (v === null || v === undefined || v === "" ? "(empty)" : typeof v === "string" ? q(oneLine(v, 300)) : oneLine(JSON.stringify(v), 300));

/** A change set (a draft against its base or main) as text: added, changed and removed objects with their field changes. */
export function changesText(cs: ChangeSet): string {
  const out = [`Changes against ${cs.against}: ${cs.summary.added} added, ${cs.summary.changed} changed, ${cs.summary.removed} removed.`];
  const group = (title: string, list: ObjectChange[]) => {
    if (!list.length) return;
    out.push("", `${title}:`);
    for (const c of list) {
      out.push(`- ${c.change} ${c.kind} ${c.id} ${q(c.name)}`);
      if (c.change === "changed") for (const f of c.fields) out.push(`  - ${f.label}: ${value(f.before)} -> ${value(f.after)}`);
    }
  };
  group("Elements", cs.elements);
  group("Relationships", cs.relationships);
  group("Flows", cs.flows);
  group("Decisions", cs.decisions);
  group("Settings", cs.settings);
  if (cs.code.length) {
    out.push("", "Code:");
    for (const c of cs.code) for (const f of c.files) out.push(`- ${f.change} ${f.path}${c.ownerName ? ` (${c.ownerName})` : ""}`);
  }
  return out.join("\n") + "\n";
}

/** Relationships whose label says nothing (empty or "uses"), with their ends and code paths: the input of `suggest-labels`. */
export function unlabelledRelationships(ws: Workspace): LabelCandidate[] {
  const idx = buildIndex(ws);
  const end = (id: string) => {
    const el = idx.el(id);
    return { id, name: el.name, kind: KIND_LABEL[idx.kindOf(id)], technologies: splitTech(el.technology), codePaths: getJson<string>(el, CODE_KEY) };
  };
  const out: LabelCandidate[] = [];
  for (const r of idx.relationships.values()) {
    const d = (r.description ?? "").trim();
    if (d && d.toLowerCase() !== "uses") continue;
    out.push({ id: r.id, description: d, technologies: splitTech(r.technology), codePaths: getJson<string>(r, CODE_KEY), source: end(r.sourceId), target: end(r.destinationId) });
  }
  return out;
}

export interface LabelEnd {
  id: string;
  name: string;
  kind: string;
  technologies: string[];
  codePaths: string[];
}

export interface LabelCandidate {
  id: string;
  /** The current label: "" or "Uses". */
  description: string;
  technologies: string[];
  codePaths: string[];
  source: LabelEnd;
  target: LabelEnd;
}

/** A short overview of the model (the ask task's context when no object is named and no diagram is given): people, systems and their containers, names and kinds only. */
export function overviewText(ws: Workspace): string {
  const idx = buildIndex(ws);
  const out = [`Model: ${q(ws.name)}`];
  if (ws.description) out.push(`Description: ${oneLine(ws.description)}`);
  out.push("", "People and software systems (containers indented under their system):");
  const all = [...ws.model.people, ...ws.model.softwareSystems];
  for (const el of all) {
    const kind = idx.kindOf(el.id);
    out.push(`- ${KIND_LABEL[kind]} ${el.id} ${q(el.name)}${el.location === "External" ? " (external)" : ""}`);
    for (const c of idx.childrenOf(el.id)) out.push(`  - container ${c} ${q(idx.el(c).name)}`);
  }
  if (!all.length) out.push("- (none)");
  out.push("", `Relationships: ${idx.relationships.size} (not listed here).`);
  return out.join("\n") + "\n";
}

/** "system x \"X\" > container y \"Y\"": the parents of an element, outermost first (empty for a top-level element). */
export function parentChain(ws: Workspace, id: string): string {
  const idx = buildIndex(ws);
  return idx
    .ancestors(id)
    .slice(1)
    .reverse()
    .map((a) => `${KIND_LABEL[idx.kindOf(a)]} ${a} ${q(idx.el(a).name)}`)
    .join(" > ");
}
