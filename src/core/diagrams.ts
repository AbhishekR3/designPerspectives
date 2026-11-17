/**
 * Diagrams: what each C4 level shows, computed from the one model.
 *
 * A diagram's content is always derived from the model (like `include *` in Structurizr DSL),
 * so a rename or a new relationship shows up in every diagram that contains the element.
 *
 * Diagram keys (also used as Structurizr view keys where a view exists):
 *   landscape                 all people and software systems                      C1
 *   context-<systemId>        a system and everything it talks to                  C1
 *   containers-<systemId>     the containers of a system, plus what they talk to   C2
 *   components-<containerId>  the components of a container, plus what they talk to C3
 *   code-<id>                 files mapped to an element/connector, imports between them  C4
 *   connector-<relId>         the inside of one relationship: stages of a pipeline/protocol
 *   flow-<name>               a flow (Structurizr dynamic view), see flows.ts
 *
 * Relationships between lower-level elements are shown at higher levels as *derived* edges
 * (e.g. Customer -> Web Application appears as Customer -> Internet Banking System on the
 * landscape) unless an explicit relationship already joins the two shown elements.
 *
 * Positions: Structurizr renders boxes at 450x300 px; the UI draws them at 225x150. Positions
 * are stored in Structurizr units (UI value x 2) so a layout made here looks the same there.
 * Diagrams with no Structurizr view (connector, code) keep positions in the sidecar.
 */

import { codeDiagram, type CodeInput } from "./codeMap.js";
import { connectorDiagram } from "./connectors.js";
import { roundHalfEven } from "./util.js";
import { buildIndex, CODE_KEY, elementSummary, getJson, idStillValid, moveElement, relationshipSummary, STAGES_KEY, WORK_KEY, type Index } from "./modelEdits.js";
import { edgeLayoutData, isLineShape, styleData, type Sidecar } from "./designPerspectivesFile.js";
import { allViews, VIEW_LISTS, type View, type ViewList, type Workspace } from "./workspace.js";
import type { Crumb, Diagram, DiagramEdge, DiagramInfo, DiagramNode, DrillTarget, Pt, Style, WorkItem } from "../shared/types.js";

export const SCALE = 2;
export type RefLevel = "landscape" | "context" | "container" | "component" | "code" | "connector";

const PREFIX_LEVEL: [string, RefLevel][] = [
  ["context-", "context"],
  ["containers-", "container"],
  ["components-", "component"],
  ["code-", "code"],
  ["connector-", "connector"],
];
export const VIEW_LIST_OF_LEVEL: Partial<Record<RefLevel, ViewList>> = {
  landscape: "systemLandscapeViews",
  context: "systemContextViews",
  container: "containerViews",
  component: "componentViews",
};
export const C4_OF_LEVEL: Record<string, string> = {
  landscape: "C1",
  context: "C1",
  container: "C2",
  component: "C3",
  code: "C4",
  connector: "C3",
};
export const LEVEL_PROPERTY = "dp.level";

export interface DiagramRef {
  key: string;
  level: RefLevel;
  /** element (or relationship) ID the diagram is about */
  scope: string | null;
}

/** A diagram as computed on the server, before styles and sizes are attached. */
export type RawNode = Omit<DiagramNode, "style" | "size"> & Partial<Pick<DiagramNode, "style" | "size">>;
export type RawEdge = Omit<DiagramEdge, "style" | "layout"> & Partial<Pick<DiagramEdge, "style" | "layout">>;
export type RawDiagram = Omit<Diagram, "nodes" | "edges" | "breadcrumb" | "c4" | "addable" | "lineShape"> &
  Partial<Pick<Diagram, "breadcrumb" | "c4" | "addable">> & { nodes: RawNode[]; edges: RawEdge[] };

export function parseKey(key: string): DiagramRef | null {
  if (key === "landscape") return { key, level: "landscape", scope: null };
  for (const [prefix, level] of PREFIX_LEVEL) {
    if (key.startsWith(prefix) && key.length > prefix.length) return { key, level, scope: key.slice(prefix.length) };
  }
  return null;
}

export function keyFor(level: RefLevel, scope: string | null): string {
  if (level === "landscape") return "landscape";
  const prefix = PREFIX_LEVEL.find(([, l]) => l === level)![0];
  return `${prefix}${scope}`;
}

const ref = (level: RefLevel, scope: string | null): DiagramRef => ({ key: keyFor(level, scope), level, scope });

export function validRef(idx: Index, r: DiagramRef): boolean {
  if (r.level === "landscape") return true;
  const scope = r.scope ?? "";
  if (r.level === "connector") return idx.relationships.has(scope);
  if (r.level === "code") return idx.elements.has(scope) || idx.relationships.has(scope);
  if (!idx.elements.has(scope)) return false;
  const kind = idx.kindOf(scope);
  return ((r.level === "context" || r.level === "container") && kind === "softwareSystem") || (r.level === "component" && kind === "container");
}

export function keyIsValid(ws: Workspace, idx: Index, key: string): boolean {
  const r = parseKey(key);
  if (r && validRef(idx, r)) return true;
  return ws.views.dynamicViews.some((v) => v.key === key);
}

// --------------------------------------------------------------------------- content

type Mapper = (e: string) => string | null;

/** (in-scope ids, map function element -> shown node or null) */
function mapper(idx: Index, r: DiagramRef): [string[], Mapper] {
  if (r.level === "landscape") {
    const inScope = [...idx.ws.model.people.map((p) => p.id), ...idx.ws.model.softwareSystems.map((s) => s.id)];
    return [inScope, (e) => idx.top(e)];
  }
  if (r.level === "context") return [[r.scope!], (e) => idx.top(e)];
  if (r.level === "container") {
    const system = r.scope!;
    return [
      [...idx.childrenOf(system)],
      (e) => {
        const chain = idx.ancestors(e);
        if (chain[chain.length - 1] === system) return e === system ? null : chain[chain.length - 2]!; // the container
        return chain[chain.length - 1]!;
      },
    ];
  }
  // component
  const container = r.scope!;
  const system = idx.parentOf(container);
  return [
    [...idx.childrenOf(container)],
    (e) => {
      const chain = idx.ancestors(e);
      const at = chain.indexOf(container);
      if (at >= 0) return e === container ? null : chain[at - 1]!;
      if (chain[chain.length - 1] === system) return e === system ? null : chain[chain.length - 2]!; // a sibling container
      return chain[chain.length - 1]!;
    },
  ];
}

/** Node IDs and edges shown on a diagram. */
export function compute(idx: Index, r: DiagramRef): [string[], RawEdge[]] {
  const [inScope, m] = mapper(idx, r);
  const scopeSet = new Set(inScope);
  const nodes = [...inScope];
  const seen = new Set(nodes);
  const explicit: RawEdge[] = [];
  const derived = new Map<string, { a: string; b: string; ids: string[] }>();

  for (const rel of idx.relationships.values()) {
    const a = m(rel.sourceId);
    const b = m(rel.destinationId);
    if (a === null || b === null || a === b) continue;
    if (r.level !== "landscape" && !scopeSet.has(a) && !scopeSet.has(b)) continue;
    for (const n of [a, b]) {
      if (!seen.has(n)) {
        seen.add(n);
        nodes.push(n);
      }
    }
    if (a === rel.sourceId && b === rel.destinationId) {
      const summ = relationshipSummary(rel);
      explicit.push({
        id: rel.id,
        source: a,
        target: b,
        description: rel.description || "",
        technology: summ.technology,
        technologies: summ.technologies,
        kind: summ.kind,
        sensitivityLevel: summ.sensitivityLevel,
        hasNotes: Boolean(summ.notes),
        stageCount: summ.stages.length,
        openWork: summ.work.filter((w) => w.status !== "done").length,
        derived: false,
        relationshipIds: [rel.id],
        detailKey: null,
        drillTargets: [],
      });
    } else {
      const k = `${a}\u0000${b}`;
      if (!derived.has(k)) derived.set(k, { a, b, ids: [] });
      derived.get(k)!.ids.push(rel.id);
    }
  }

  const explicitPairs = new Set(explicit.map((e) => `${e.source}\u0000${e.target}`));
  const edges = [...explicit];
  for (const [k, { a, b, ids }] of derived) {
    if (explicitPairs.has(k)) continue;
    const descs = [...new Set(ids.map((i) => idx.relationships.get(i)!.description || ""))].filter((d) => d).sort();
    const techs: string[] = [];
    for (const i of ids) for (const t of relationshipSummary(idx.relationships.get(i)!).technologies) if (!techs.includes(t)) techs.push(t);
    edges.push({
      id: `derived:${a}->${b}`,
      source: a,
      target: b,
      description: descs.length === 1 ? descs[0]! : `${ids.length} relationships`,
      technology: techs.join(", "),
      technologies: techs,
      kind: "",
      sensitivityLevel: null,
      hasNotes: false,
      stageCount: 0,
      openWork: 0,
      derived: true,
      relationshipIds: [...ids].sort(),
      detailKey: null,
      drillTargets: [],
    });
  }
  return [nodes, edges];
}

export function findView(ws: Workspace, key: string): View | undefined {
  for (const list of VIEW_LISTS) {
    const v = ws.views[list].find((x) => x.key === key);
    if (v) return v;
  }
  return undefined;
}

export function positionsOf(view: View | undefined): Map<string, Pt> {
  const out = new Map<string, Pt>();
  if (!view) return out;
  for (const e of view.elements) {
    if (typeof e.x === "number" && typeof e.y === "number") out.set(e.id, { x: e.x / SCALE, y: e.y / SCALE });
  }
  return out;
}

// --------------------------------------------------------------------------- tree, titles, drilling

/** The diagram where an element is drawn as one of its own boxes. */
export function homeKey(idx: Index, elementId: string): string {
  const kind = idx.kindOf(elementId);
  if (kind === "container") return keyFor("container", idx.parentOf(elementId));
  if (kind === "component") return keyFor("component", idx.parentOf(elementId));
  return "landscape";
}

/** Every static diagram that could exist, most detailed level first. */
function candidateRefs(idx: Index): DiagramRef[] {
  const refs: DiagramRef[] = [];
  const systems = idx.ws.model.softwareSystems;
  for (const s of systems) for (const c of s.containers ?? []) refs.push(ref("component", c.id));
  for (const s of systems) refs.push(ref("container", s.id));
  for (const s of systems) refs.push(ref("context", s.id));
  refs.push(ref("landscape", null));
  return refs;
}

/** For each relationship, the most detailed diagram that draws it as a line of its own
 *  (or, failing that, one that shows it as part of a derived line). */
export function drawnInMap(idx: Index): Map<string, string> {
  const drawn = new Map<string, string>();
  const fallback = new Map<string, string>();
  for (const r of candidateRefs(idx)) {
    const [, edges] = compute(idx, r);
    for (const e of edges) {
      if (e.derived) {
        for (const rid of e.relationshipIds) if (!fallback.has(rid)) fallback.set(rid, r.key);
      } else if (!drawn.has(e.id)) drawn.set(e.id, r.key);
    }
  }
  return new Map([...fallback, ...drawn]);
}

export function drillKey(idx: Index, elementId: string): string | null {
  const kind = idx.kindOf(elementId);
  if (kind === "softwareSystem") return keyFor("container", elementId);
  if (kind === "container") return keyFor("component", elementId);
  if (kind === "component" && getJson(idx.elements.get(elementId), CODE_KEY).length) return keyFor("code", elementId);
  return null;
}

export function parentKey(idx: Index, r: DiagramRef, drawn: Map<string, string>): string | null {
  switch (r.level) {
    case "landscape":
      return null;
    case "context":
      return "landscape";
    case "container":
      return keyFor("context", r.scope);
    case "component":
      return keyFor("container", idx.parentOf(r.scope!));
    case "connector":
      return drawn.get(r.scope!) ?? "landscape";
    case "code":
      return idx.elements.has(r.scope!) ? homeKey(idx, r.scope!) : keyFor("connector", r.scope);
  }
}

export function relLabel(idx: Index, relId: string): string {
  const rel = idx.relationships.get(relId)!;
  return `${idx.elements.get(rel.sourceId)!.name} → ${idx.elements.get(rel.destinationId)!.name}`;
}

export function scopeName(idx: Index, r: DiagramRef): string {
  if (r.level === "landscape") return "Landscape";
  if (r.level === "connector") return relLabel(idx, r.scope!);
  if (idx.elements.has(r.scope!)) return idx.elements.get(r.scope!)!.name;
  return relLabel(idx, r.scope!);
}

export function titleOf(idx: Index, r: DiagramRef): string {
  if (r.level === "landscape") return "System landscape";
  const name = scopeName(idx, r);
  const suffix: Record<string, string> = {
    context: "context",
    container: "containers",
    component: "components",
    code: "code",
    connector: "connector detail",
  };
  return `${name} — ${suffix[r.level]}`;
}

export function breadcrumb(idx: Index, r: DiagramRef, drawn: Map<string, string>): Crumb[] {
  const chain: DiagramRef[] = [];
  let cur: DiagramRef | null = r;
  while (cur && chain.length < 8) {
    chain.push(cur);
    const pk = parentKey(idx, cur, drawn);
    const next = pk ? parseKey(pk) : null;
    cur = next && validRef(idx, next) ? next : null;
  }
  return chain.reverse().map((c) => ({ key: c.key, label: scopeName(idx, c), level: c.level, c4: C4_OF_LEVEL[c.level] ?? "" }));
}

/** Element types the canvas can create on this diagram. */
export function addableKinds(r: DiagramRef): string[] {
  if (r.level === "landscape" || r.level === "context") return ["person", "softwareSystem"];
  if (r.level === "container") return ["container", "person", "softwareSystem"];
  if (r.level === "component") return ["component", "person", "softwareSystem"];
  if (r.level === "connector") return ["stage"];
  return [];
}

/** The addable kinds that only show on this diagram when created together with a relationship to
 *  an element drawn in scope here (the system on a context diagram, a container or component inside
 *  the boundary on a container or component diagram): a person or software system sits at the top
 *  level, and these diagrams show only the scope's insides plus what is connected to them. */
export function connectRequiredKinds(r: DiagramRef): string[] {
  if (r.level === "context" || r.level === "container" || r.level === "component") return ["person", "softwareSystem"];
  return [];
}

// --------------------------------------------------------------------------- diagram payload

export function diagram(ws: Workspace, key: string, sidecar?: Sidecar | null, codeRoot?: CodeInput): Diagram | null {
  const idx = buildIndex(ws);
  const r = parseKey(key);
  if (!r || !validRef(idx, r)) return null;
  const drawn = drawnInMap(idx);
  let d: RawDiagram;
  if (r.level === "connector") d = connectorDiagram(idx, r);
  else if (r.level === "code") d = codeDiagram(idx, r, codeRoot ?? null);
  else d = staticDiagram(ws, idx, r, drawn);
  d.breadcrumb = breadcrumb(idx, r, drawn);
  d.c4 = C4_OF_LEVEL[r.level] ?? "";
  d.addable = addableKinds(r);
  d.connectRequired = connectRequiredKinds(r);
  if (r.level in VIEW_LIST_OF_LEVEL) d.work = getJson<WorkItem>(findView(ws, key), WORK_KEY);
  return decorate(d, sidecar ?? null);
}

function staticDiagram(ws: Workspace, idx: Index, r: DiagramRef, drawn: Map<string, string>): RawDiagram {
  const [nodeIds, edges] = compute(idx, r);
  const pos = positionsOf(findView(ws, r.key));
  const scopeSet = new Set(mapper(idx, r)[0]);
  const nodes: RawNode[] = nodeIds.map((n) => ({
    ...elementSummary(idx, n),
    inScope: scopeSet.has(n),
    position: pos.get(n) ?? null,
    drillKey: drillKey(idx, n),
  }));
  for (const e of edges) {
    if (e.derived) {
      e.detailKey = null;
      e.drillTargets = drillTargets(idx, e.relationshipIds, drawn);
    } else {
      e.detailKey = keyFor("connector", e.id);
      e.drillTargets = [];
    }
  }
  const boundary = r.level === "container" || r.level === "component" ? { id: r.scope!, name: idx.elements.get(r.scope!)!.name, kind: idx.kindOf(r.scope!) } : null;
  return { key: r.key, level: r.level, scope: r.scope, title: titleOf(idx, r), boundary, nodes, edges };
}

function drillTargets(idx: Index, relIds: string[], drawn: Map<string, string>): DrillTarget[] {
  const out: DrillTarget[] = [];
  for (const rid of relIds) {
    const key = drawn.get(rid);
    const r = key ? parseKey(key) : null;
    if (!key || !r) continue;
    out.push({
      relationshipId: rid,
      key,
      title: titleOf(idx, r),
      label: relLabel(idx, rid),
      description: idx.relationships.get(rid)!.description || "",
    });
  }
  return out;
}

/** Attach styles, box sizes and edge geometry from the sidecar. */
export function decorate(d: RawDiagram, sidecar: Sidecar | null): Diagram {
  const layout = sidecar?.layouts[d.key];
  for (const n of d.nodes) {
    const style = sidecar?.styles[n.id];
    n.style = (style ? styleData(style) : {}) as Style;
    const size = layout?.sizes[n.id];
    n.size = size ? { w: size.w, h: size.h } : null;
    if (!n.position && layout?.positions[n.id]) {
      const p = layout.positions[n.id]!;
      n.position = { x: p.x, y: p.y };
    }
  }
  for (const e of d.edges) {
    const style = sidecar?.styles[e.id];
    e.style = (style ? styleData(style) : {}) as Style;
    // A code line whose file was guessed (dashed) or is not known (dotted) looks different until a style says otherwise.
    if (e.codeEnd && e.codeEnd !== "set" && !e.style.strokeStyle) e.style = { ...e.style, strokeStyle: e.codeEnd === "guessed" ? "dashed" : "dotted" };
    const lay = layout?.edges[e.id];
    e.layout = lay ? edgeLayoutData(lay) : {};
  }
  return { ...d, lineShape: isLineShape(layout?.lineShape) ? layout.lineShape : null } as Diagram;
}

// --------------------------------------------------------------------------- diagram list

/** Diagrams kept as Structurizr views: the landscape, every system with containers, every
 *  container with components, and any such diagram that already has a stored view (i.e. was
 *  opened and laid out). Other diagrams are still reachable by drilling down. */
export function diagramRefs(idx: Index): DiagramRef[] {
  const refs = [ref("landscape", null)];
  for (const s of idx.ws.model.softwareSystems) {
    if (s.containers?.length) {
      refs.push(ref("context", s.id));
      refs.push(ref("container", s.id));
    }
    for (const c of s.containers ?? []) if (c.components?.length) refs.push(ref("component", c.id));
  }
  const have = new Set(refs.map((r) => r.key));
  for (const v of allViews(idx.ws)) {
    const r = parseKey(v.key);
    if (r && !have.has(r.key) && r.level in VIEW_LIST_OF_LEVEL && validRef(idx, r)) {
      refs.push(r);
      have.add(r.key);
    }
  }
  return refs;
}

/** The sidebar tree: C1 landscape and contexts, C2 containers, C3 components, C4 code.
 *  Every software system is listed with its context and containers diagrams (the one that opens
 *  when the system is double-clicked), even before it has containers; only those stored as views
 *  (`diagramRefs`) are written to the workspace. */
/** `{openWork: n}` for a view with open linked work of its own (DEC-085), else nothing. */
function openWorkOf(view: View | undefined): { openWork?: number } {
  const n = getJson<WorkItem>(view, WORK_KEY).filter((w) => w.status !== "done").length;
  return n ? { openWork: n } : {};
}

export function diagramList(ws: Workspace): DiagramInfo[] {
  const idx = buildIndex(ws);
  const drawn = drawnInMap(idx);
  const refs = new Map<string, DiagramRef>();
  const put = (r: DiagramRef) => refs.set(r.key, r);
  put(ref("landscape", null));
  for (const s of idx.ws.model.softwareSystems) {
    put(ref("context", s.id));
    put(ref("container", s.id));
  }
  for (const r of diagramRefs(idx)) put(r);
  // Code diagrams for mapped elements; connector details for connectors with stages or code.
  for (const [elId, el] of idx.elements) if (getJson(el, CODE_KEY).length) put(ref("code", elId));
  for (const [rid, rel] of idx.relationships) {
    if (getJson(rel, STAGES_KEY).length || getJson(rel, CODE_KEY).length) put(ref("connector", rid));
    if (getJson(rel, CODE_KEY).length) put(ref("code", rid));
  }
  // Make sure every diagram's parent is in the list too.
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of [...refs.values()]) {
      const pk = parentKey(idx, r, drawn);
      if (pk && !refs.has(pk)) {
        const pref = parseKey(pk);
        if (pref && validRef(idx, pref)) {
          refs.set(pk, pref);
          changed = true;
        }
      }
    }
  }
  const children = new Map<string | null, DiagramRef[]>();
  for (const r of refs.values()) {
    const pk = parentKey(idx, r, drawn);
    if (!children.has(pk)) children.set(pk, []);
    children.get(pk)!.push(r);
  }
  const out: DiagramInfo[] = [];
  const walk = (pk: string | null, depth: number) => {
    for (const r of children.get(pk) ?? []) {
      out.push({
        key: r.key,
        level: r.level,
        scope: r.scope,
        title: titleOf(idx, r),
        label: scopeName(idx, r),
        parentKey: pk,
        c4: C4_OF_LEVEL[r.level] ?? "",
        depth,
        ...openWorkOf(findView(ws, r.key)),
      });
      walk(r.key, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

// --------------------------------------------------------------------------- Structurizr views

export function ensureView(ws: Workspace, idx: Index, r: DiagramRef): View {
  const existing = findView(ws, r.key);
  if (existing) return existing;
  const v: View = { key: r.key, description: titleOf(idx, r), properties: { [LEVEL_PROPERTY]: r.level }, elements: [], relationships: [] };
  if (r.level === "context" || r.level === "container") v.softwareSystemId = r.scope;
  else if (r.level === "component") v.containerId = r.scope;
  ws.views[VIEW_LIST_OF_LEVEL[r.level]!].push(v);
  return v;
}

export class UnknownDiagram extends Error {}

/** Store UI positions (UI units) for elements on a diagram or flow. */
export function setPositions(ws: Workspace, key: string, positions: Record<string, Pt>): void {
  const idx = buildIndex(ws);
  const r = parseKey(key);
  let view: View | undefined;
  if (r && r.level in VIEW_LIST_OF_LEVEL && validRef(idx, r)) view = ensureView(ws, idx, r);
  else {
    view = findView(ws, key);
    if (!view) throw new UnknownDiagram(key);
  }
  const byId = new Map(view.elements.map((e) => [e.id, e]));
  for (const [elementId, p] of Object.entries(positions)) {
    if (!idx.elements.has(elementId)) continue;
    let ev = byId.get(elementId);
    if (!ev) {
      ev = { id: elementId };
      view.elements.push(ev);
      byId.set(elementId, ev);
    }
    ev.x = roundHalfEven(p.x * SCALE);
    ev.y = roundHalfEven(p.y * SCALE);
  }
}

/** Make every designPerspectives view list exactly the elements and explicit relationships its
 *  diagram shows, so Structurizr renders the same content. Keeps stored positions. */
export function syncViews(ws: Workspace): void {
  const idx = buildIndex(ws);
  for (const r of diagramRefs(idx)) {
    const view = ensureView(ws, idx, r);
    const [nodeIds, edges] = compute(idx, r);
    const old = new Map(view.elements.map((e) => [e.id, e]));
    view.elements = nodeIds.map((n) => old.get(n) ?? { id: n });
    const oldRels = new Map(view.relationships.map((x) => [x.id, x]));
    view.relationships = edges.filter((e) => !e.derived).map((e) => oldRels.get(e.id) ?? { id: e.id });
  }
  renumber(ws);
}

/** Give views without an `order` the next free number (Structurizr shows views in this order). */
function renumber(ws: Workspace): void {
  let n = 0;
  for (const v of allViews(ws)) if (typeof v.order === "number" && v.order > n) n = v.order;
  for (const list of VIEW_LISTS) {
    for (const v of ws.views[list]) {
      if (v.order === null || v.order === undefined) v.order = ++n;
    }
  }
}

/** Drop sidecar entries (styles, layouts) that refer to things that no longer exist. */
export function prune(ws: Workspace, sidecar: Sidecar): void {
  const idx = buildIndex(ws);
  const keep = <T>(rec: Record<string, T>) => Object.fromEntries(Object.entries(rec).filter(([k]) => idStillValid(idx, k)));
  sidecar.styles = keep(sidecar.styles);
  const layouts: Sidecar["layouts"] = {};
  for (const [key, lay] of Object.entries(sidecar.layouts)) {
    if (!keyIsValid(ws, idx, key)) continue;
    lay.sizes = keep(lay.sizes);
    lay.positions = keep(lay.positions);
    lay.edges = keep(lay.edges);
    layouts[key] = lay;
  }
  sidecar.layouts = layouts;
}

// --------------------------------------------------------------------------- moving an element

/** Where elements and lines are drawn on a static diagram: node ID -> in scope?, and the line IDs. */
type Placement = Map<string, { nodes: Map<string, boolean>; edges: Set<string> }>;

/** Static diagrams that keep layout data (a stored view or a sidecar layout). */
function laidOutRefs(ws: Workspace, idx: Index, sc: Sidecar): DiagramRef[] {
  const keys = new Set([...allViews(ws).map((v) => v.key), ...Object.keys(sc.layouts)]);
  const out: DiagramRef[] = [];
  for (const k of keys) {
    const r = parseKey(k);
    if (r && r.level in VIEW_LIST_OF_LEVEL && validRef(idx, r)) out.push(r);
  }
  return out;
}

function placement(ws: Workspace, sc: Sidecar): Placement {
  const idx = buildIndex(ws);
  const out: Placement = new Map();
  for (const r of laidOutRefs(ws, idx, sc)) {
    const [nodeIds, edges] = compute(idx, r);
    const inScope = new Set(mapper(idx, r)[0]);
    out.set(r.key, { nodes: new Map(nodeIds.map((n) => [n, inScope.has(n)])), edges: new Set(edges.map((e) => e.id)) });
  }
  return out;
}

/**
 * Move an element to another parent (`ops.moveElement`) and forget layout that no longer fits:
 * on every laid-out diagram, a box that is no longer drawn there, or is now drawn on the other side
 * of the boundary (a container that moved out of the system becomes an outside box), loses its
 * stored position and size; a line that is no longer drawn loses its stored shape. `syncViews` (run
 * after every edit) then drops view entries of elements a diagram no longer shows. Nothing else
 * refers to an element's place: its ID, relationships, styles, flows and connector stages stay.
 */
export function moveWithLayout(ws: Workspace, sc: Sidecar, elementId: string, parentId: string): void {
  const before = placement(ws, sc);
  moveElement(ws, elementId, parentId);
  const after = placement(ws, sc);
  const moved = (key: string, id: string) => {
    const a = before.get(key)?.nodes.get(id);
    return a !== undefined && a !== after.get(key)?.nodes.get(id);
  };
  for (const list of VIEW_LISTS) {
    for (const v of ws.views[list]) {
      if (!before.has(v.key)) continue;
      for (const e of v.elements) {
        if (moved(v.key, e.id)) {
          delete e.x;
          delete e.y;
        }
      }
    }
  }
  for (const [key, lay] of Object.entries(sc.layouts)) {
    if (!before.has(key)) continue;
    for (const id of Object.keys(lay.sizes)) if (moved(key, id)) delete lay.sizes[id];
    for (const id of Object.keys(lay.positions)) if (moved(key, id)) delete lay.positions[id];
    const was = before.get(key)!.edges;
    const now = after.get(key)?.edges ?? new Set<string>();
    for (const id of Object.keys(lay.edges)) if (was.has(id) && !now.has(id)) delete lay.edges[id];
  }
}
