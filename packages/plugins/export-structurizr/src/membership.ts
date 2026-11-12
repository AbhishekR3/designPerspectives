/**
 * View membership for the JSON export (Structurizr JSON lists view elements explicitly).
 *
 * `include *` is resolved like the Structurizr DSL wildcard, deterministically:
 * - landscape: all people and software systems;
 * - context: the scope plus every element with a relationship to/from the scope or its descendants,
 *   mapped to its top-level ancestor;
 * - container / component: the children of the scope plus every element related to them (or to their
 *   descendants), mapped to its nearest visible ancestor — the ancestor that branches off the scope's
 *   ancestor chain (sibling container, top-level element, ...);
 * - deployment: all deployment nodes and instances of the environment (instances limited to the scope
 *   software system when the view has one);
 * - dynamic: the endpoints of the exported steps (includes are ignored, as in Structurizr).
 * Other selectors: `<id>` (element, or a group's members), `<id>.*` (direct children). `exclude` removes.
 * Relationships of a view: exported relationships whose two endpoints are both members (implied
 * relationships are not created: the DSL export says `!impliedRelationships false`).
 */
import { parentIdOf } from "@designperspectives/contracts";
import type { Plan, PlanInstance, PlanRelationship } from "./plan.js";
import { chainOf, childrenOf, cmp } from "./plan.js";
import type { PlanView } from "./plan-views.js";

export interface ViewMembers {
  /** Element ids, or deployment node / instance ids for deployment views; sorted. */
  elements: string[];
  /** Relationship ids (instance relationship ids for deployment views); sorted. */
  relationships: string[];
}

/** A model relationship replicated between instances (Structurizr does this for every instance pair). */
export interface InstanceRelationship {
  id: string;
  source: string;
  target: string;
  rel: PlanRelationship;
}

export function instanceRelationships(plan: Plan): InstanceRelationship[] {
  const out: InstanceRelationship[] = [];
  const byOf = new Map<string, PlanInstance[]>();
  for (const i of plan.instances) byOf.set(i.inst.of, [...(byOf.get(i.inst.of) ?? []), i]);
  for (const r of plan.relationships) {
    for (const s of byOf.get(r.rel.source) ?? []) {
      for (const t of (byOf.get(r.rel.target) ?? []).filter((x) => x.env === s.env)) {
        out.push({ id: `${s.inst.id}->${t.inst.id}#${r.id}`, source: s.inst.id, target: t.inst.id, rel: r });
      }
    }
  }
  return out;
}

function groupMembers(plan: Plan, id: string): string[] {
  return [...plan.elements.values()].filter((e) => e.groupIds.includes(id)).map((e) => e.el.id);
}

function staticSelector(plan: Plan, sel: string): string[] {
  if (sel.endsWith(".*")) {
    const base = sel.slice(0, -2);
    return plan.groups.has(base) ? groupMembers(plan, base) : childrenOf(plan, base);
  }
  if (plan.elements.has(sel)) return [sel];
  return plan.groups.has(sel) ? groupMembers(plan, sel) : [];
}

function deploymentIds(plan: Plan, env: string): string[] {
  return [...[...plan.nodes.values()].filter((n) => n.env === env).map((n) => n.node.id), ...plan.instances.filter((i) => i.env === env).map((i) => i.inst.id)];
}

function deploymentSelector(plan: Plan, env: string, sel: string): string[] {
  const all = deploymentIds(plan, env);
  if (sel.endsWith(".*")) return all.filter((id) => parentIdOf(id) === sel.slice(0, -2));
  if (all.includes(sel)) return [sel];
  return plan.instances.filter((i) => i.env === env && i.inst.of === sel).map((i) => i.inst.id);
}

/**
 * Ids a non-wildcard selector resolves to in a view (empty when nothing exported matches).
 * Deployment views resolve deployment node / instance ids; an element id selects its instances.
 */
export function resolveSelector(plan: Plan, pv: PlanView, sel: string): string[] {
  return pv.env ? deploymentSelector(plan, pv.env.id, sel) : staticSelector(plan, sel);
}

/** Maps an element to the ancestor shown in a view whose scope has `scopeChain` (undefined = hidden). */
function visibleFor(chain: string[], scopeChain: string[], maxDepth: number): string | undefined {
  let i = 0;
  while (i < chain.length && i < scopeChain.length && chain[i] === scopeChain[i]) i++;
  const d = Math.min(i, maxDepth);
  return d < chain.length ? chain[d] : undefined;
}

function scopedDefault(plan: Plan, pv: PlanView): Set<string> {
  const scopeChain = chainOf(plan, pv.scope!);
  const isContext = pv.szType === "systemContext";
  const maxDepth = isContext ? 0 : scopeChain.length;
  const minInner = isContext ? scopeChain.length : scopeChain.length + 1;
  const isInner = (chain: string[]): boolean => chain.length >= minInner && scopeChain.every((s, k) => chain[k] === s);
  const members = new Set(isContext ? [pv.scope!] : childrenOf(plan, pv.scope!));
  for (const r of plan.relationships) {
    const a = chainOf(plan, r.rel.source);
    const b = chainOf(plan, r.rel.target);
    for (const [x, y] of [[a, b], [b, a]] as const) {
      const v = isInner(x) ? visibleFor(y, scopeChain, maxDepth) : undefined;
      if (v !== undefined) members.add(v);
    }
  }
  return members;
}

function instanceInScope(plan: Plan, i: PlanInstance, scope: string | undefined): boolean {
  return scope === undefined || chainOf(plan, i.inst.of).includes(scope);
}

function deploymentDefault(plan: Plan, pv: PlanView): Set<string> {
  const env = pv.env!.id;
  const nodes = [...plan.nodes.values()].filter((n) => n.env === env).map((n) => n.node.id);
  const instances = plan.instances.filter((i) => i.env === env && instanceInScope(plan, i, pv.scope)).map((i) => i.inst.id);
  return new Set([...nodes, ...instances]);
}

function defaultMembers(plan: Plan, pv: PlanView): Set<string> {
  switch (pv.szType) {
    case "systemLandscape":
      return new Set([...plan.elements.values()].filter((e) => e.szKind === "person" || e.szKind === "softwareSystem").map((e) => e.el.id));
    case "deployment":
      return deploymentDefault(plan, pv);
    case "dynamic":
      return new Set();
    default:
      return scopedDefault(plan, pv);
  }
}

function selected(plan: Plan, pv: PlanView): Set<string> {
  if (pv.szType === "dynamic") return new Set(pv.steps.flatMap((s) => [s.rel.rel.source, s.rel.rel.target]));
  const members = new Set<string>();
  for (const sel of pv.view.include) {
    const ids = sel === "*" ? [...defaultMembers(plan, pv)] : resolveSelector(plan, pv, sel);
    for (const id of ids) members.add(id);
  }
  for (const sel of pv.view.exclude ?? []) for (const id of resolveSelector(plan, pv, sel)) members.delete(id);
  return members;
}

/** Deployment views also show the deployment nodes enclosing every member. */
function withHosts(plan: Plan, members: Set<string>): Set<string> {
  const out = new Set(members);
  for (const id of members) {
    for (let p = parentIdOf(id); p !== undefined; p = parentIdOf(p)) if (plan.nodes.has(p)) out.add(p);
  }
  return out;
}

export function viewMembers(plan: Plan, pv: PlanView): ViewMembers {
  const members = pv.env ? withHosts(plan, selected(plan, pv)) : selected(plan, pv);
  const rels = pv.env
    ? instanceRelationships(plan).map((r) => ({ id: r.id, source: r.source, target: r.target }))
    : plan.relationships.map((r) => ({ id: r.id, source: r.rel.source, target: r.rel.target }));
  return {
    elements: [...members].sort(cmp),
    relationships: rels.filter((r) => members.has(r.source) && members.has(r.target)).map((r) => r.id).sort(cmp),
  };
}
