/**
 * Structurizr JSON writer (`workspace.json`), the lossless interchange format of the two.
 * Property names follow `structurizr-json/structurizr.yaml` (structurizr/structurizr@ad34036) as verified in
 * docs/spikes/W0-SPIKE-STRUCTURIZR.md. JSON ids are sequential numeric strings in canonical order:
 * elements (by id), deployment nodes, instances, relationships, then instance relationships.
 */
import type { Exporter, ExportInput, ExportOptions, SourceFile } from "@designperspectives/contracts";
import type { Plan, PlanElement, PlanInstance, PlanNode, PlanRelationship } from "./plan.js";
import { childrenOf, cmp, GROUP_SEPARATOR, notExportedLines } from "./plan.js";
import { exportPlan } from "./build.js";
import type { PlanView, SzViewType } from "./plan-views.js";
import type { InstanceRelationship } from "./membership.js";
import { instanceRelationships, viewMembers } from "./membership.js";

type Json = Record<string, unknown>;

interface Ctx {
  plan: Plan;
  /** designPerspectives id (element / node / instance / relationship / instance relationship) → JSON id. */
  jsonIds: Map<string, string>;
  /** JSON relationships keyed by source (our id). */
  outgoing: Map<string, Json[]>;
  envNames: Map<string, string>;
}

const DEFAULT_TAGS: Record<PlanElement["szKind"], string> = {
  person: "Person",
  softwareSystem: "Software System",
  container: "Container",
  component: "Component",
};

function tagString(tags: readonly string[]): string {
  return [...new Set(tags)].join(",");
}

/** Copies `obj` without undefined values and without empty arrays. */
function compact(obj: Json): Json {
  const out: Json = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || (Array.isArray(v) && v.length === 0)) continue;
    out[k] = v;
  }
  return out;
}

function assignIds(plan: Plan, replicas: InstanceRelationship[]): Map<string, string> {
  const ids = new Map<string, string>();
  const keys = [
    ...[...plan.elements.keys()].map((k) => `e:${k}`),
    ...[...plan.nodes.keys()].map((k) => `d:${k}`),
    ...plan.instances.map((i) => `d:${i.inst.id}`),
    ...plan.relationships.map((r) => `r:${r.id}`),
    ...replicas.map((r) => `r:${r.id}`),
  ];
  keys.forEach((k, i) => ids.set(k, String(i + 1)));
  return ids;
}

function relJson(ctx: Ctx, key: string, src: string, dst: string, r: PlanRelationship, extra: Json): Json {
  return compact({
    id: ctx.jsonIds.get(`r:${key}`),
    sourceId: ctx.jsonIds.get(src),
    destinationId: ctx.jsonIds.get(dst),
    description: r.description,
    technology: r.rel.technology,
    interactionStyle: r.async ? "Asynchronous" : undefined,
    tags: tagString(["Relationship", ...r.tags]),
    ...extra,
  });
}

function collectRelationships(ctx: Ctx, replicas: InstanceRelationship[]): void {
  const push = (source: string, json: Json): void => {
    ctx.outgoing.set(source, [...(ctx.outgoing.get(source) ?? []), json]);
  };
  for (const r of ctx.plan.relationships) {
    const props = compact({ "dp.kind": r.rel.kind, "dp.key": r.rel.key });
    push(r.rel.source, relJson(ctx, r.id, `e:${r.rel.source}`, `e:${r.rel.target}`, r, { properties: props }));
  }
  for (const x of replicas) {
    push(x.source, relJson(ctx, x.id, `d:${x.source}`, `d:${x.target}`, x.rel, { linkedRelationshipId: ctx.jsonIds.get(`r:${x.rel.id}`) }));
  }
}

function groupName(ctx: Ctx, e: PlanElement): string | undefined {
  if (e.groupIds.length === 0) return undefined;
  return e.groupIds.map((g) => ctx.plan.groups.get(g)!.title).join(GROUP_SEPARATOR);
}

function elementJson(ctx: Ctx, e: PlanElement): Json {
  const children = childrenOf(ctx.plan, e.el.id).map((c) => elementJson(ctx, ctx.plan.elements.get(c)!));
  const nested = e.szKind === "softwareSystem" ? { containers: children } : e.szKind === "container" ? { components: children } : {};
  const hasTechnology = e.szKind === "container" || e.szKind === "component";
  return compact({
    id: ctx.jsonIds.get(`e:${e.el.id}`),
    name: e.name,
    description: e.el.description,
    technology: hasTechnology ? e.el.technology : undefined,
    tags: tagString(["Element", DEFAULT_TAGS[e.szKind], ...e.tags]),
    group: groupName(ctx, e),
    properties: { "dp.id": e.el.id, "dp.kind": e.el.kind },
    relationships: ctx.outgoing.get(e.el.id),
    ...nested,
  });
}

function instanceJson(ctx: Ctx, i: PlanInstance): Json {
  const isContainer = i.szKind === "container";
  return compact({
    id: ctx.jsonIds.get(`d:${i.inst.id}`),
    [isContainer ? "containerId" : "softwareSystemId"]: ctx.jsonIds.get(`e:${i.inst.of}`),
    instanceId: i.instanceId,
    environment: ctx.envNames.get(i.env),
    tags: isContainer ? "Container Instance" : "Software System Instance",
    properties: { "dp.id": i.inst.id },
    relationships: ctx.outgoing.get(i.inst.id),
  });
}

function nodeJson(ctx: Ctx, n: PlanNode): Json {
  const kids = [...ctx.plan.nodes.values()].filter((c) => c.parent === n.node.id);
  const insts = ctx.plan.instances.filter((i) => i.node === n.node.id);
  const isInfra = n.node.kind === "infrastructureNode";
  return compact({
    id: ctx.jsonIds.get(`d:${n.node.id}`),
    name: n.name,
    description: n.node.description,
    technology: n.node.technology,
    environment: ctx.envNames.get(n.env),
    instances: isInfra ? undefined : "1",
    tags: tagString(["Element", isInfra ? "Infrastructure Node" : "Deployment Node", ...n.tags]),
    properties: { "dp.id": n.node.id },
    children: kids.filter((c) => c.node.kind === "deploymentNode").map((c) => nodeJson(ctx, c)),
    infrastructureNodes: kids.filter((c) => c.node.kind === "infrastructureNode").map((c) => nodeJson(ctx, c)),
    softwareSystemInstances: insts.filter((i) => i.szKind === "softwareSystem").map((i) => instanceJson(ctx, i)),
    containerInstances: insts.filter((i) => i.szKind === "container").map((i) => instanceJson(ctx, i)),
  });
}

function modelJson(ctx: Ctx): Json {
  const top = childrenOf(ctx.plan, "").map((id) => ctx.plan.elements.get(id)!);
  return compact({
    properties: ctx.plan.nestedGroups ? { "structurizr.groupSeparator": GROUP_SEPARATOR } : undefined,
    people: top.filter((e) => e.szKind === "person").map((e) => elementJson(ctx, e)),
    softwareSystems: top.filter((e) => e.szKind === "softwareSystem").map((e) => elementJson(ctx, e)),
    deploymentNodes: [...ctx.plan.nodes.values()].filter((n) => n.parent === undefined).map((n) => nodeJson(ctx, n)),
  });
}

const VIEW_LISTS: Record<SzViewType, string> = {
  systemLandscape: "systemLandscapeViews",
  systemContext: "systemContextViews",
  container: "containerViews",
  component: "componentViews",
  dynamic: "dynamicViews",
  deployment: "deploymentViews",
};

const AUTOMATIC_LAYOUT = { implementation: "Graphviz", rankDirection: "TopBottom", rankSeparation: 300, nodeSeparation: 300, edgeSeparation: 0, vertices: false };

function scopeField(pv: PlanView): string {
  if (pv.szType === "component") return "containerId";
  return pv.szType === "dynamic" ? "elementId" : "softwareSystemId";
}

function viewRelationships(ctx: Ctx, pv: PlanView, memberRels: string[]): Json[] {
  if (pv.szType === "dynamic") {
    return pv.steps.map((s) => ({ id: ctx.jsonIds.get(`r:${s.rel.id}`), description: s.step.label, order: String(s.order) }));
  }
  return memberRels.map((id) => ({ id: ctx.jsonIds.get(`r:${id}`) }));
}

function viewJson(ctx: Ctx, pv: PlanView, order: number): Json {
  const m = viewMembers(ctx.plan, pv);
  const prefix = pv.env ? "d:" : "e:";
  return compact({
    key: pv.view.id,
    order,
    title: pv.view.title,
    description: pv.view.description,
    [scopeField(pv)]: pv.scope !== undefined ? ctx.jsonIds.get(`e:${pv.scope}`) : undefined,
    environment: pv.env?.name,
    automaticLayout: AUTOMATIC_LAYOUT,
    elements: m.elements.map((id) => ({ id: ctx.jsonIds.get(prefix + id) })),
    relationships: viewRelationships(ctx, pv, m.relationships),
  });
}

const STYLES = [
  { tag: "Database", shape: "Cylinder" },
  { tag: "Person", shape: "Person" },
  { tag: "Queue", shape: "Pipe" },
  { tag: "Topic", shape: "Pipe" },
];

function viewsJson(ctx: Ctx): Json {
  const lists: Record<string, Json[]> = {};
  ctx.plan.views.forEach((pv, i) => {
    const list = VIEW_LISTS[pv.szType];
    lists[list] = [...(lists[list] ?? []), viewJson(ctx, pv, i + 1)];
  });
  const ordered = Object.values(VIEW_LISTS).map((k) => [k, lists[k]] as const);
  return compact({ ...Object.fromEntries(ordered), configuration: { styles: { elements: STYLES } } });
}

export function toStructurizrJson(plan: Plan, workspaceName: string): string {
  const replicas = instanceRelationships(plan).sort((a, b) => cmp(a.id, b.id));
  const ctx: Ctx = {
    plan,
    jsonIds: assignIds(plan, replicas),
    outgoing: new Map(),
    envNames: new Map(plan.environments.map((e) => [e.id, e.name])),
  };
  collectRelationships(ctx, replicas);
  const lines = notExportedLines(plan);
  const workspace = compact({
    id: 0,
    name: workspaceName,
    properties: lines.length > 0 ? { "dp.notExported": lines.join("\n") } : undefined,
    model: modelJson(ctx),
    views: viewsJson(ctx),
  });
  return JSON.stringify(workspace, null, 2) + "\n";
}

export class StructurizrJsonExporter implements Exporter {
  readonly format = "structurizr-json";
  readonly description = "Structurizr JSON workspace (workspace.json) with explicit view membership and no layout coordinates.";
  readonly needsLayout = false;
  export(input: ExportInput, options?: ExportOptions): SourceFile[] {
    return [{ path: "workspace.json", content: toStructurizrJson(exportPlan(input.model, options?.viewIds), input.workspaceName) }];
  }
}
