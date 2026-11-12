/** Builds a format-neutral diagram (nodes, nested groups, edges) for one view of the model. */
import { kindLabel, parentIdOf } from "@designperspectives/contracts";
import type { DeploymentInstance, Element, Model, ViewDef } from "@designperspectives/contracts";
import { edgeText, isUnder, liftRelationships, membershipOf } from "./membership.js";
import type { LiftedEdge } from "./membership.js";

export type Shape = "box" | "rounded" | "cylinder";

export interface DiagramNode {
  id: string;
  lines: string[];
  shape: Shape;
  group?: string;
}

export interface DiagramGroup {
  id: string;
  label: string;
  parent?: string;
}

export interface Diagram {
  title: string;
  nodes: DiagramNode[];
  groups: DiagramGroup[];
  edges: LiftedEdge[];
}

export function kindTag(kind: string, technology?: string): string {
  return technology ? `[${kindLabel(kind)}: ${technology}]` : `[${kindLabel(kind)}]`;
}

function shapeOf(kind: string): Shape {
  if (kind === "person") return "rounded";
  return kind === "dataStore" ? "cylinder" : "box";
}

function cardLines(title: string, kind: string, technology?: string, description?: string): string[] {
  return description ? [title, kindTag(kind, technology), description] : [title, kindTag(kind, technology)];
}

function elementNode(e: Element, group?: string): DiagramNode {
  return { id: e.id, lines: cardLines(e.title, e.kind, e.technology, e.description), shape: shapeOf(e.kind), ...(group ? { group } : {}) };
}

function elementDiagram(model: Model, view: ViewDef): Diagram {
  const { nodes, boundary } = membershipOf(model, view);
  const byId = new Map(model.elements.map((e) => [e.id, e]));
  const b = boundary ? byId.get(boundary) : undefined;
  const groups = b ? [{ id: b.id, label: `${b.title} ${kindTag(b.kind)}` }] : [];
  const diagramNodes = nodes.map((id) => elementNode(byId.get(id)!, b && isUnder(id, b.id) ? b.id : undefined));
  const edges =
    view.type === "dynamic"
      ? (view.steps ?? []).filter((s) => byId.has(s.source) && byId.has(s.target)).map((s, i) => ({ source: s.source, target: s.target, label: `${i + 1}. ${edgeText(s.label, s.technology)}`, async: false }))
      : liftRelationships(model.relationships, new Set(nodes));
  return { title: view.title, nodes: diagramNodes, groups, edges };
}

/** Enclosing deployment node of `id`, unless that is the environment itself. */
function enclosing(id: string, env: string): string | undefined {
  const p = parentIdOf(id);
  return p && p !== env ? p : undefined;
}

function instanceNode(i: DeploymentInstance, byId: ReadonlyMap<string, Element>, env: string): DiagramNode {
  const e = byId.get(i.of);
  const lines = e ? cardLines(e.title, e.kind, e.technology, e.description) : [i.of, kindTag("instance")];
  const group = enclosing(i.id, env);
  return { id: i.id, lines, shape: shapeOf(e?.kind ?? "instance"), ...(group ? { group } : {}) };
}

function instanceEdges(model: Model, instances: readonly DeploymentInstance[]): LiftedEdge[] {
  const seen = new Set<string>();
  const out: LiftedEdge[] = [];
  const of = (id: string) => instances.filter((i) => id === i.of || isUnder(id, i.of));
  for (const r of model.relationships) {
    for (const s of of(r.source)) {
      for (const t of of(r.target)) {
        const key = `${s.id}\u0000${t.id}`;
        if (s.id === t.id || seen.has(key)) continue;
        seen.add(key);
        out.push({ source: s.id, target: t.id, label: edgeText(r.label, r.technology), async: false });
      }
    }
  }
  return out;
}

function deploymentDiagram(model: Model, view: ViewDef): Diagram {
  const env = view.environment ?? view.scope ?? "";
  const byId = new Map(model.elements.map((e) => [e.id, e]));
  const inEnv = model.deploymentNodes.filter((n) => isUnder(n.id, env));
  const groups: DiagramGroup[] = inEnv
    .filter((n) => n.kind === "deploymentNode")
    .map((n) => {
      const parent = enclosing(n.id, env);
      return { id: n.id, label: `${n.title} ${kindTag(n.kind, n.technology)}`, ...(parent ? { parent } : {}) };
    });
  const infra: DiagramNode[] = inEnv
    .filter((n) => n.kind === "infrastructureNode")
    .map((n) => {
      const group = enclosing(n.id, env);
      return { id: n.id, lines: cardLines(n.title, n.kind, n.technology, n.description), shape: "box", ...(group ? { group } : {}) };
    });
  const instances = model.deploymentInstances.filter((i) => isUnder(i.id, env));
  return { title: view.title, nodes: [...infra, ...instances.map((i) => instanceNode(i, byId, env))], groups, edges: instanceEdges(model, instances) };
}

export function buildDiagram(model: Model, view: ViewDef): Diagram {
  return view.type === "deployment" ? deploymentDiagram(model, view) : elementDiagram(model, view);
}
