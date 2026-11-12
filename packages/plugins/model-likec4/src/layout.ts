/** LikeC4 layouted view → ComputedView (positions from LikeC4's Graphviz WASM engine; ADR-0004 condition 6). */
import { ASYNC_RELATIONSHIP_KINDS, type ComputedView, type Model, type RelationshipKind, type ViewDef, type ViewEdge, type ViewNode } from "@designperspectives/contracts";
import { LIKEC4_TO_DEPLOYMENT_KIND, LIKEC4_TO_ELEMENT_KIND } from "./dsl.js";
import { text, type LcLayoutEdge, type LcLayoutNode, type LcLayoutView, type LcParsedModel } from "./likec4-types.js";

function opt<K extends string, V>(key: K, value: V | undefined | null): { [P in K]?: V } {
  return (value === undefined || value === null ? {} : { [key]: value }) as { [P in K]?: V };
}

function nodeKind(n: LcLayoutNode, model: Model): string {
  if (n.kind === "instance") {
    const inst = model.deploymentInstances.find((i) => i.id === n.id);
    return model.elements.find((e) => e.id === inst?.of)?.kind ?? "container";
  }
  return LIKEC4_TO_ELEMENT_KIND[n.kind] ?? LIKEC4_TO_DEPLOYMENT_KIND[n.kind] ?? n.kind;
}

function toNode(n: LcLayoutNode, model: Model): ViewNode {
  return {
    id: n.id,
    kind: nodeKind(n, model),
    title: n.title,
    ...opt("description", text(n.description)),
    ...opt("technology", n.technology?.trim() || undefined),
    ...opt("parent", n.parent ?? undefined),
    isBoundary: n.children.length > 0,
    x: Math.round(n.x),
    y: Math.round(n.y),
    width: Math.round(n.width),
    height: Math.round(n.height),
  };
}

function toEdge(e: LcLayoutEdge, pm: LcParsedModel): ViewEdge {
  const rel = e.relations?.length ? pm.relations[e.relations[0]!] : undefined;
  const kind = e.kind ?? rel?.kind;
  return {
    id: `${e.source}->${e.target}${kind ? `#${kind}` : ""}`,
    source: e.source,
    target: e.target,
    ...opt("label", e.label?.trim() || undefined),
    ...opt("technology", rel?.technology?.trim() || undefined),
    ...opt("kind", kind),
    async: !!kind && ASYNC_RELATIONSHIP_KINDS.includes(kind as RelationshipKind),
    points: e.points.map(([x, y]) => [Math.round(x), Math.round(y)] as [number, number]),
  };
}

export function toComputedView(lv: LcLayoutView, def: ViewDef, model: Model, pm: LcParsedModel): ComputedView {
  const nodes = lv.nodes.map((n) => toNode(n, model)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const edges = lv.edges.map((e) => toEdge(e, pm));
  // Disambiguate edge ids that collide after aggregation (e.g. two kinds collapsed into one edge).
  const seen = new Map<string, number>();
  for (const e of edges) {
    const n = seen.get(e.id) ?? 0;
    seen.set(e.id, n + 1);
    if (n > 0) e.id = `${e.id}:${n}`;
  }
  return {
    id: def.id,
    type: def.type,
    title: def.title,
    ...opt("description", def.description),
    ...opt("scope", def.scope ?? def.environment),
    width: Math.round(lv.bounds.width),
    height: Math.round(lv.bounds.height),
    nodes,
    edges: edges.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  };
}
