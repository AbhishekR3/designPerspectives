/**
 * Flows: ordered steps over relationships, stored as Structurizr dynamic views.
 *
 * Each step is a RelationshipView with `order` ("1", "2", ...), a step `description`, and
 * `response` (true when the step is the reply travelling back along the relationship).
 *
 * Structurizr restricts which elements a dynamic view may hold, depending on its scope
 * (structurizr-core DynamicView.checkElementCanBeAdded):
 *   - no scope:            people and software systems only
 *   - software system:     people, other software systems, containers (not the system itself)
 *   - container:           people, software systems, other containers, components
 *                          (not the container itself or its parent system)
 *   - never both an element and its own parent.
 * designPerspectives infers the scope from the steps and reports a warning when a flow cannot
 * meet these rules; the flow still works here but may not open in Structurizr.
 */

import { decorate, positionsOf, type RawEdge, type RawNode } from "./diagrams.js";
import { inlineJson, isObj, str, type Obj } from "./json.js";
import { buildIndex, elementSummary, ModelError, relationshipSummary, slugify, unique, type Index } from "./ops.js";
import type { Sidecar } from "./sidecar.js";
import { allViews, type RelationshipView, type View, type Workspace } from "./workspace.js";
import type { Diagram, Flow } from "../shared/types.js";

export const FLOW_PROPERTY = "dp.flow";
export const STEP_DATA_PROPERTY = "dp.stepData"; // JSON {"<order>": {"example": str, "format": str}} on the flow's view

type StepData = Record<string, { example?: string; format?: string }>;

function stepData(view: View): StepData {
  try {
    const data = JSON.parse(view.properties?.[STEP_DATA_PROPERTY] ?? "{}");
    return isObj(data) ? (data as StepData) : {};
  } catch {
    return {};
  }
}

function setStepData(view: View, data: StepData): void {
  const props = { ...(view.properties ?? {}) };
  const kept = Object.fromEntries(Object.entries(data).filter(([, v]) => v.example || v.format));
  if (Object.keys(kept).length) props[STEP_DATA_PROPERTY] = inlineJson(kept);
  else delete props[STEP_DATA_PROPERTY];
  view.properties = Object.keys(props).length ? props : null;
}

function flowView(ws: Workspace, key: string): View {
  const v = ws.views.dynamicViews.find((x) => x.key === key);
  if (!v) throw new ModelError(`No flow with key "${key}".`);
  return v;
}

const isOurs = (v: View) => v.properties?.[FLOW_PROPERTY] === "true";

export function inferScope(idx: Index, elementIds: string[]): [string | null, string[]] {
  const warnings = new Set<string>();
  const ids = [...new Set(elementIds)];
  const kinds = new Map(ids.map((e) => [e, idx.kindOf(e)]));
  const components = ids.filter((e) => kinds.get(e) === "component");
  const containers = ids.filter((e) => kinds.get(e) === "container");
  let scope: string | null = null;
  const name = (id: string) => idx.elements.get(id)!.name;

  if (components.length) {
    const parents = [...new Set(components.map((c) => idx.parentOf(c)!))].sort();
    scope = parents[0]!;
    if (parents.length > 1) warnings.add(`Uses components from more than one container (${parents.map(name).join(", ")}).`);
    const system = idx.parentOf(scope)!;
    for (const bad of [scope, system]) {
      if (kinds.has(bad)) warnings.add(`Includes "${name(bad)}", which contains other elements of this flow.`);
    }
  } else if (containers.length) {
    // The system most of the containers belong to (the first one seen, on a tie).
    const counts = new Map<string, number>();
    for (const c of containers) {
      const sys = idx.parentOf(c)!;
      counts.set(sys, (counts.get(sys) ?? 0) + 1);
    }
    let best = -1;
    for (const [sys, n] of counts) if (n > best) [scope, best] = [sys, n];
    if (scope && kinds.has(scope)) warnings.add(`Includes "${name(scope)}", which contains other elements of this flow.`);
  }

  const idSet = new Set(elementIds);
  const scopeParent = scope ? idx.parentOf(scope) : null;
  for (const e of elementIds) {
    for (const a of idx.ancestors(e).slice(1)) {
      if (idSet.has(a) && a !== scope && a !== scopeParent) warnings.add(`Includes both "${name(e)}" and its parent "${name(a)}".`);
    }
  }
  return [scope, [...warnings].sort()];
}

function endpoints(idx: Index, view: View): string[] {
  const out: string[] = [];
  for (const rv of view.relationships) {
    const r = idx.relationships.get(rv.id);
    if (!r) continue;
    for (const e of [r.sourceId, r.destinationId]) if (!out.includes(e)) out.push(e);
  }
  return out;
}

/** Steps in order: numeric orders first (by value), then any others (by text). */
function steps(view: View): RelationshipView[] {
  const key = (rv: RelationshipView): [number, number, string] => {
    const o = rv.order;
    if (!o) return [0, 0, ""];
    const n = Number(o);
    return o.trim() !== "" && Number.isFinite(n) ? [0, n, ""] : [1, 0, o];
  };
  return [...view.relationships].sort((a, b) => {
    const [x, y] = [key(a), key(b)];
    return x[0] - y[0] || x[1] - y[1] || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0);
  });
}

export function listFlows(ws: Workspace): Flow[] {
  const idx = buildIndex(ws);
  return ws.views.dynamicViews.map((v) => {
    const [, warnings] = inferScope(idx, endpoints(idx, v));
    const data = stepData(v);
    return {
      key: v.key,
      title: v.title || v.description || v.key,
      description: v.description || "",
      scope: v.elementId ?? null,
      warnings,
      steps: steps(v).map((rv) => ({
        relationshipId: rv.id,
        description: rv.description || "",
        response: Boolean(rv.response),
        order: rv.order ?? null,
        example: data[rv.order ?? ""]?.example ?? "",
        format: data[rv.order ?? ""]?.format ?? "",
      })),
    };
  });
}

export function createFlow(ws: Workspace, title: string, description = ""): string {
  const t = str(title).trim();
  if (!t) throw new ModelError("A flow needs a name.");
  const taken = new Set(allViews(ws).map((v) => v.key));
  const key = unique(`flow-${slugify(t)}`, taken);
  ws.views.dynamicViews.push({
    key,
    title: t,
    description: description || null,
    properties: { [FLOW_PROPERTY]: "true" },
    elements: [],
    relationships: [],
  });
  return key;
}

export function updateFlow(ws: Workspace, key: string, patch: Obj): void {
  const idx = buildIndex(ws);
  const view = flowView(ws, key);
  if ("title" in patch) {
    const title = str(patch.title).trim();
    if (!title) throw new ModelError("A flow needs a name.");
    view.title = title;
  }
  if ("description" in patch) view.description = str(patch.description) || null;
  if ("steps" in patch) {
    const list = Array.isArray(patch.steps) ? patch.steps : [];
    const out: RelationshipView[] = [];
    const data: StepData = {};
    list.forEach((s0, i) => {
      const s = isObj(s0) ? s0 : {};
      const n = i + 1;
      const rid = str(s.relationshipId);
      if (!idx.relationships.has(rid)) throw new ModelError(`Step ${n}: no relationship with ID "${rid}".`);
      data[String(n)] = { example: str(s.example).replace(/^\n+|\n+$/g, ""), format: str(s.format).trim() };
      out.push({ id: rid, description: str(s.description).trim() || null, order: String(n), response: Boolean(s.response) });
    });
    view.relationships = out;
    setStepData(view, data);
  }
  syncFlow(idx, view);
}

export function deleteFlow(ws: Workspace, key: string): void {
  flowView(ws, key);
  ws.views.dynamicViews = ws.views.dynamicViews.filter((v) => v.key !== key);
}

/** Element list = endpoints of the steps (positions kept); scope re-inferred for our flows. */
export function syncFlow(idx: Index, view: View): void {
  if (isOurs(view)) {
    // Drop steps whose relationship is gone and renumber, keeping each step's example data.
    const old = stepData(view);
    const kept: RelationshipView[] = [];
    const data: StepData = {};
    for (const rv of steps(view)) {
      if (!idx.relationships.has(rv.id)) continue;
      const n = String(kept.length + 1);
      if (rv.order && rv.order in old) data[n] = old[rv.order]!;
      rv.order = n;
      kept.push(rv);
    }
    view.relationships = kept;
    setStepData(view, data);
  } else {
    view.relationships = view.relationships.filter((rv) => idx.relationships.has(rv.id));
  }
  const ids = endpoints(idx, view);
  const old = new Map(view.elements.map((e) => [e.id, e]));
  view.elements = ids.map((i) => old.get(i) ?? { id: i });
  if (isOurs(view)) view.elementId = inferScope(idx, ids)[0];
}

export function syncFlows(ws: Workspace): void {
  const idx = buildIndex(ws);
  for (const v of ws.views.dynamicViews) syncFlow(idx, v);
}

export function flowDiagram(ws: Workspace, key: string, sidecar?: Sidecar | null): Diagram | null {
  const idx = buildIndex(ws);
  const view = ws.views.dynamicViews.find((x) => x.key === key);
  if (!view) return null;
  const pos = positionsOf(view);
  const nodes: RawNode[] = endpoints(idx, view).map((e) => ({
    ...elementSummary(idx, e),
    inScope: true,
    position: pos.get(e) ?? null,
    drillKey: null,
  }));
  const edges = new Map<string, RawEdge>();
  steps(view).forEach((rv, i) => {
    const r = idx.relationships.get(rv.id);
    if (!r) return;
    if (!edges.has(r.id)) {
      const summ = relationshipSummary(r);
      edges.set(r.id, {
        id: r.id,
        source: r.sourceId,
        target: r.destinationId,
        description: r.description || "",
        technology: summ.technology,
        technologies: summ.technologies,
        kind: summ.kind,
        sensitivityLevel: summ.sensitivityLevel,
        hasNotes: Boolean(summ.notes),
        stageCount: summ.stages.length,
        derived: false,
        relationshipIds: [r.id],
        detailKey: null,
        drillTargets: [],
        steps: [],
      });
    }
    edges.get(r.id)!.steps!.push(i + 1);
  });
  const flow = listFlows(ws).find((f) => f.key === key)!;
  const title = view.title || key;
  return decorate(
    {
      key,
      level: "flow",
      c4: "",
      scope: view.elementId ?? null,
      title,
      breadcrumb: [
        { key: "landscape", label: "Landscape", level: "landscape" },
        { key, label: `Flow: ${title}`, level: "flow" },
      ],
      boundary: null,
      nodes,
      edges: [...edges.values()],
      addable: [],
      flow,
    },
    sidecar ?? null,
  );
}
