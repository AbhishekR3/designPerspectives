/**
 * Format-neutral export plan shared by the DSL and JSON writers.
 *
 * Decides, once and deterministically, what is exported and how it nests in Structurizr:
 * - structural parent of an element = nearest existing non-group ancestor (groups become `group` names);
 * - kinds that Structurizr cannot nest the way we do (and code elements) are recorded as "not exported";
 * - names are made unique among Structurizr siblings (Structurizr rejects duplicates);
 * - relationship descriptions are made unique per source/destination pair (Structurizr drops duplicates).
 * Mapping source: docs/spikes/W0-SPIKE-STRUCTURIZR.md and spikes/structurizr/mapping.md.
 */
import type { DeploymentInstance, DeploymentNode, Element, Model, Relationship, ViewDef } from "@designperspectives/contracts";
import { ASYNC_RELATIONSHIP_KINDS, parentIdOf, relationshipIdOf, sortModel } from "@designperspectives/contracts";
import { planViews, type PlanView } from "./plan-views.js";

export type SzKind = "person" | "softwareSystem" | "container" | "component";

export interface PlanElement {
  el: Element;
  szKind: SzKind;
  /** Structurizr name (title, made unique among siblings). */
  name: string;
  /** Exported structural parent (element id), absent for top-level elements. */
  parent?: string;
  /** Enclosing group ids, outermost first (only groups below the structural parent). */
  groupIds: string[];
  /** Convention tag first (Database, Queue, ...), then the element's own tags. */
  tags: string[];
}

export interface PlanGroup {
  id: string;
  title: string;
  /** Structural parent element id ("" for model level). */
  parent: string;
  /** Enclosing group id, if nested. */
  outer?: string;
}

export interface PlanRelationship {
  rel: Relationship;
  /** designPerspectives relationship id. */
  id: string;
  description: string;
  async: boolean;
  tags: string[];
}

export interface PlanEnvironment {
  id: string;
  name: string;
}

export interface PlanNode {
  node: DeploymentNode;
  env: string;
  name: string;
  /** Exported parent deployment node id; absent at environment level. */
  parent?: string;
  tags: string[];
}

export interface PlanInstance {
  inst: DeploymentInstance;
  node: string;
  env: string;
  szKind: "softwareSystem" | "container";
  /** 1-based number of this instance among instances of the same element in the same environment. */
  instanceId: number;
}

export interface NotExported {
  kind: string;
  id: string;
  title?: string;
  reason: string;
}

export interface Plan {
  /** Exported elements, canonical order (sorted by id). */
  elements: Map<string, PlanElement>;
  groups: Map<string, PlanGroup>;
  relationships: PlanRelationship[];
  environments: PlanEnvironment[];
  nodes: Map<string, PlanNode>;
  instances: PlanInstance[];
  views: PlanView[];
  notExported: NotExported[];
  /** True when a group is nested in another group (needs `structurizr.groupSeparator`). */
  nestedGroups: boolean;
}

/** Separator for nested group names (model property `structurizr.groupSeparator`). */
export const GROUP_SEPARATOR = "/";

const CONTAINER_LIKE = new Set(["container", "dataStore", "queue", "topic"]);
const CONVENTION_TAG: Partial<Record<Element["kind"], string>> = {
  dataStore: "Database",
  queue: "Queue",
  topic: "Topic",
  hardwareSystem: "Hardware System",
};

export function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Tags are one comma-separated string in Structurizr: a comma inside a tag cannot be represented. */
export function cleanTags(tags: readonly string[] | undefined): string[] {
  const out: string[] = [];
  for (const t of tags ?? []) {
    const c = t.replaceAll(",", " ").trim();
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

function szKindOf(kind: Element["kind"]): SzKind | undefined {
  if (kind === "person") return "person";
  if (kind === "softwareSystem" || kind === "hardwareSystem") return "softwareSystem";
  if (CONTAINER_LIKE.has(kind)) return "container";
  if (kind === "component") return "component";
  return undefined;
}

/** Structurizr kind required of the structural parent ("" = top level). */
const REQUIRED_PARENT: Record<SzKind, SzKind | ""> = {
  person: "",
  softwareSystem: "",
  container: "softwareSystem",
  component: "container",
};

interface Ancestry {
  /** Nearest existing non-group ancestor id. */
  parent?: string;
  /** Groups between the element and that ancestor, outermost first. */
  groupIds: string[];
}

function ancestry(id: string, byId: Map<string, Element>): Ancestry {
  const groupIds: string[] = [];
  for (let p = parentIdOf(id); p !== undefined; p = parentIdOf(p)) {
    const e = byId.get(p);
    if (!e) continue;
    if (e.kind !== "group") return { parent: p, groupIds };
    groupIds.unshift(p);
  }
  return { groupIds };
}

class UniqueNames {
  private readonly used = new Map<string, Set<string>>();
  take(scope: string, title: string, id: string): string {
    let set = this.used.get(scope);
    if (!set) this.used.set(scope, (set = new Set()));
    const name = set.has(title) ? `${title} (${id})` : title;
    set.add(name);
    return name;
  }
}

/** `{ [key]: value }`, or `{}` when the value is undefined (keeps optional JSON-ish fields absent). */
export function opt<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  return value === undefined ? {} : ({ [key]: value } as Partial<Record<K, V>>);
}

function placement(e: Element, szKind: SzKind, ctx: BuildCtx): Ancestry | undefined {
  const a = ancestry(e.id, ctx.byId);
  const parentKind = a.parent === undefined ? "" : (ctx.plan.elements.get(a.parent)?.szKind ?? "-");
  return parentKind === REQUIRED_PARENT[szKind] ? a : undefined;
}

function elementTags(e: Element): string[] {
  const conv = CONVENTION_TAG[e.kind];
  return cleanTags([...(conv ? [conv] : []), ...(e.tags ?? [])]);
}

function planElement(e: Element, ctx: BuildCtx): void {
  const szKind = szKindOf(e.kind);
  if (!szKind) {
    if (e.kind !== "group") ctx.skip(e.kind, e.id, e.title, "no Structurizr equivalent");
    return;
  }
  const place = placement(e, szKind, ctx);
  if (!place) {
    ctx.skip(e.kind, e.id, e.title, `a Structurizr ${szKind} cannot be nested here`);
    return;
  }
  ctx.plan.elements.set(e.id, {
    el: e,
    szKind,
    name: ctx.names.take(place.parent ?? "", e.title, e.id),
    ...opt("parent", place.parent),
    groupIds: place.groupIds,
    tags: elementTags(e),
  });
  for (const g of place.groupIds) ctx.usedGroups.add(g);
}

function planGroups(model: Model, ctx: BuildCtx): void {
  for (const e of model.elements) {
    if (e.kind !== "group") continue;
    if (!ctx.usedGroups.has(e.id)) {
      ctx.skip("group", e.id, e.title, "group without exported members");
      continue;
    }
    const { parent, groupIds } = ancestry(e.id, ctx.byId);
    const outer = groupIds.at(-1);
    if (outer !== undefined) ctx.plan.nestedGroups = true;
    ctx.plan.groups.set(e.id, { id: e.id, title: e.title, parent: parent ?? "", ...(outer !== undefined ? { outer } : {}) });
  }
}

/** True when one element is a structural ancestor of the other (Structurizr rejects such relationships). */
function isAncestry(plan: Plan, a: string, b: string): boolean {
  const isAnc = (x: string, y: string): boolean => {
    for (let p = plan.elements.get(y)?.parent; p !== undefined; p = plan.elements.get(p)?.parent) if (p === x) return true;
    return false;
  };
  return isAnc(a, b) || isAnc(b, a);
}

function relationshipProblem(plan: Plan, r: Relationship): string | undefined {
  if (!plan.elements.has(r.source) || !plan.elements.has(r.target)) return "an endpoint is not exported";
  if (isAncestry(plan, r.source, r.target)) return "Structurizr forbids relationships between parents and children";
  return undefined;
}

function planRelationships(model: Model, ctx: BuildCtx): void {
  const seen = new Set<string>();
  for (const r of model.relationships) {
    const id = relationshipIdOf(r);
    const problem = relationshipProblem(ctx.plan, r);
    if (problem) {
      ctx.skip("relationship", id, r.label, problem);
      continue;
    }
    let description = r.label;
    if (seen.has(JSON.stringify([r.source, r.target, description]))) description = `${r.label} [${r.kind}${r.key ? `:${r.key}` : ""}]`;
    seen.add(JSON.stringify([r.source, r.target, description]));
    const async = ASYNC_RELATIONSHIP_KINDS.includes(r.kind);
    ctx.plan.relationships.push({ rel: r, id, description, async, tags: cleanTags([...(async ? ["Asynchronous"] : []), ...(r.tags ?? [])]) });
  }
}

function envOf(id: string): string {
  return id.split(".")[0]!;
}

function nodeParent(id: string, byId: Map<string, DeploymentNode>): DeploymentNode | undefined {
  for (let p = parentIdOf(id); p !== undefined; p = parentIdOf(p)) {
    const n = byId.get(p);
    if (n) return n;
  }
  return undefined;
}

function nodeProblem(n: DeploymentNode, parent: DeploymentNode | undefined, plan: Plan): string | undefined {
  if (n.kind === "environment") return parent ? "nested environment" : undefined;
  if (!plan.environments.some((e) => e.id === envOf(n.id))) return "not inside a deployment environment";
  if (!parent) return "outside an exported environment";
  const parentOk = parent.kind === "environment" ? n.kind === "deploymentNode" : plan.nodes.get(parent.id)?.node.kind === "deploymentNode";
  return parentOk ? undefined : `a Structurizr ${n.kind} cannot be nested here`;
}

function addNode(n: DeploymentNode, parent: DeploymentNode | undefined, ctx: BuildCtx): void {
  const parentId = parent?.kind === "environment" ? undefined : parent?.id;
  ctx.plan.nodes.set(n.id, {
    node: n,
    env: envOf(n.id),
    name: ctx.names.take(`node:${parent?.id ?? ""}`, n.title, n.id),
    ...opt("parent", parentId),
    tags: cleanTags(n.tags),
  });
}

function planDeployment(model: Model, ctx: BuildCtx): void {
  const byId = new Map(model.deploymentNodes.map((n) => [n.id, n]));
  for (const n of model.deploymentNodes) {
    const parent = nodeParent(n.id, byId);
    const problem = nodeProblem(n, parent, ctx.plan);
    if (problem) ctx.skip(n.kind, n.id, n.title, problem);
    else if (n.kind === "environment") ctx.plan.environments.push({ id: n.id, name: ctx.names.take("env:", n.title, n.id) });
    else addNode(n, parent, ctx);
  }
}

/** The exported deployment node hosting an instance and the instantiated element's kind, if valid. */
function instanceHost(inst: DeploymentInstance, plan: Plan): { host: PlanNode; szKind: PlanInstance["szKind"] } | undefined {
  const node = parentIdOf(inst.id);
  const host = node === undefined ? undefined : plan.nodes.get(node);
  const szKind = plan.elements.get(inst.of)?.szKind;
  if (host?.node.kind !== "deploymentNode") return undefined;
  return szKind === "container" || szKind === "softwareSystem" ? { host, szKind } : undefined;
}

function planInstances(model: Model, ctx: BuildCtx): void {
  const counts = new Map<string, number>();
  for (const inst of model.deploymentInstances) {
    const found = instanceHost(inst, ctx.plan);
    if (!found) {
      ctx.skip("instance", inst.id, ctx.plan.elements.get(inst.of)?.el.title, "needs an exported deployment node and an exported container or software system");
      continue;
    }
    const key = `${found.host.env}\n${inst.of}`;
    const instanceId = (counts.get(key) ?? 0) + 1;
    counts.set(key, instanceId);
    ctx.plan.instances.push({ inst, node: found.host.node.id, env: found.host.env, szKind: found.szKind, instanceId });
  }
}

interface BuildCtx {
  plan: Plan;
  byId: Map<string, Element>;
  names: UniqueNames;
  usedGroups: Set<string>;
  skip(kind: string, id: string, title: string | undefined, reason: string): void;
}

export function buildPlan(input: Model, viewIds?: readonly string[]): Plan {
  const model = sortModel(input);
  const plan: Plan = {
    elements: new Map(),
    groups: new Map(),
    relationships: [],
    environments: [],
    nodes: new Map(),
    instances: [],
    views: [],
    notExported: [],
    nestedGroups: false,
  };
  const ctx: BuildCtx = {
    plan,
    byId: new Map(model.elements.map((e) => [e.id, e])),
    names: new UniqueNames(),
    usedGroups: new Set(),
    skip: (kind, id, title, reason) => plan.notExported.push({ kind, id, ...(title !== undefined ? { title } : {}), reason }),
  };
  for (const e of model.elements) planElement(e, ctx);
  planGroups(model, ctx);
  planRelationships(model, ctx);
  planDeployment(model, ctx);
  planInstances(model, ctx);
  const views: ViewDef[] = viewIds ? model.views.filter((v) => viewIds.includes(v.id)) : model.views;
  plan.views = planViews(plan, views, ctx.skip);
  return plan;
}

/** One line per item that has no Structurizr equivalent; used by both writers. */
export function notExportedLines(plan: Plan): string[] {
  return plan.notExported.map((n) => `${n.kind} ${n.id}${n.title !== undefined ? ` ${JSON.stringify(n.title)}` : ""} (${n.reason})`);
}

/** Exported element ids whose structural parent is `parent` ("" = top level), canonical order. */
export function childrenOf(plan: Plan, parent: string): string[] {
  return [...plan.elements.values()].filter((e) => (e.parent ?? "") === parent).map((e) => e.el.id);
}

/** Root-first chain of structural ancestors including the element itself. */
export function chainOf(plan: Plan, id: string): string[] {
  const chain: string[] = [];
  for (let p: string | undefined = id; p !== undefined; p = plan.elements.get(p)?.parent) chain.unshift(p);
  return chain;
}
