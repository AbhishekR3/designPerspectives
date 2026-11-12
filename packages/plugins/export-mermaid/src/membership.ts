/**
 * View membership computed deterministically from the Model and a ViewDef (no layout engine).
 * Rules: landscape = people + software systems; context = scope + outside ancestors of elements
 * related to the scope (or its descendants); container = children of the scope + outside ancestors of
 * elements related to them; component = the same one level down; dynamic = step endpoints.
 */
import { ASYNC_RELATIONSHIP_KINDS, parentIdOf } from "@designperspectives/contracts";
import type { Element, ElementId, Model, Relationship, ViewDef } from "@designperspectives/contracts";

export interface Membership {
  /** Visible element ids, sorted. */
  nodes: ElementId[];
  /** Element drawn as the enclosing subgraph, if any. */
  boundary?: ElementId;
}

export interface LiftedEdge {
  source: string;
  target: string;
  label: string;
  async: boolean;
}

export function isUnder(id: string, ancestor: string): boolean {
  return id.startsWith(`${ancestor}.`);
}

function isSelfOrUnder(id: string, ancestor: string): boolean {
  return id === ancestor || isUnder(id, ancestor);
}

/** Ancestor-or-self of `id` one segment below the deepest common ancestor of `id` and `scope`. */
export function outsideAncestor(id: string, scope: string): string {
  const a = id.split(".");
  const s = scope.split(".");
  let i = 0;
  while (i < a.length && i < s.length && a[i] === s[i]) i++;
  return a.slice(0, i + 1).join(".");
}

/** Children of `parent`, looking through groups (groups are flattened, not drawn). */
function logicalChildren(elements: readonly Element[], parent: string): ElementId[] {
  const out: ElementId[] = [];
  for (const e of elements) {
    if (parentIdOf(e.id) !== parent) continue;
    if (e.kind === "group") out.push(...logicalChildren(elements, e.id));
    else out.push(e.id);
  }
  return out;
}

/** Focus elements plus the outside ancestors of everything related to them. */
function neighbourhood(model: Model, focus: readonly ElementId[], scope: ElementId): Set<ElementId> {
  const known = new Set(model.elements.map((e) => e.id));
  const visible = new Set(focus);
  for (const r of model.relationships) {
    for (const [a, b] of [[r.source, r.target], [r.target, r.source]] as const) {
      if (isSelfOrUnder(b, scope) || !focus.some((f) => isSelfOrUnder(a, f))) continue;
      const anc = outsideAncestor(b, scope);
      if (known.has(anc)) visible.add(anc);
    }
  }
  return visible;
}

/** Does an inclusion predicate (`id` or `id.*`) select `id`? `*` is handled by the view rules. */
function matches(predicate: string, id: string): boolean {
  return predicate.endsWith(".*") ? isUnder(id, predicate.slice(0, -2)) : id === predicate;
}

/** Explicit `include` ids / `id.*` add elements; `exclude` predicates remove them. */
function applyPredicates(model: Model, view: ViewDef, visible: Set<ElementId>, boundary?: ElementId): void {
  const known = new Set(model.elements.map((e) => e.id));
  for (const p of view.include) {
    const added = p.endsWith(".*") ? logicalChildren(model.elements, p.slice(0, -2)) : [p];
    for (const id of added) if (known.has(id) && id !== boundary) visible.add(id);
  }
  for (const id of [...visible]) if ((view.exclude ?? []).some((p) => matches(p, id))) visible.delete(id);
}

function scoped(model: Model, view: ViewDef, focusOf: (scope: string) => ElementId[], drawBoundary: boolean): Membership {
  const scope = view.scope ?? "";
  const visible = neighbourhood(model, focusOf(scope), scope);
  const boundary = drawBoundary ? scope : undefined;
  applyPredicates(model, view, visible, boundary);
  return { nodes: [...visible].sort(), ...(boundary ? { boundary } : {}) };
}

function dynamicMembership(model: Model, view: ViewDef): Membership {
  const known = new Set(model.elements.map((e) => e.id));
  const nodes = [...new Set((view.steps ?? []).flatMap((s) => [s.source, s.target]))].filter((id) => known.has(id)).sort();
  const scope = view.scope;
  const boundary = scope && nodes.some((n) => isUnder(n, scope)) ? scope : undefined;
  return { nodes, ...(boundary ? { boundary } : {}) };
}

function landscapeMembership(model: Model, view: ViewDef): Membership {
  const visible = new Set(model.elements.filter((e) => e.kind === "person" || e.kind === "softwareSystem").map((e) => e.id));
  applyPredicates(model, view, visible);
  return { nodes: [...visible].sort() };
}

/** Membership for every non-deployment view type. */
export function membershipOf(model: Model, view: ViewDef): Membership {
  switch (view.type) {
    case "landscape":
      return landscapeMembership(model, view);
    case "context":
      return scoped(model, view, (s) => [s], false);
    case "container":
    case "component":
      return scoped(model, view, (s) => logicalChildren(model.elements, s), true);
    case "dynamic":
      return dynamicMembership(model, view);
    default:
      return { nodes: [] };
  }
}

export function visibleAncestor(id: string, visible: ReadonlySet<string>): string | undefined {
  let cur: string | undefined = id;
  while (cur !== undefined && !visible.has(cur)) cur = parentIdOf(cur);
  return cur;
}

export function edgeText(label: string, technology?: string): string {
  return technology ? `${label} [${technology}]` : label;
}

export function isAsyncKind(kind: string): boolean {
  return (ASYNC_RELATIONSHIP_KINDS as readonly string[]).includes(kind);
}

/**
 * Relationships drawn between the visible ancestors of their endpoints, de-duplicated per
 * (source, target) pair keeping the first relationship in the given (canonical) order.
 */
export function liftRelationships(relationships: readonly Relationship[], visible: ReadonlySet<string>): LiftedEdge[] {
  const seen = new Set<string>();
  const out: LiftedEdge[] = [];
  for (const r of relationships) {
    const source = visibleAncestor(r.source, visible);
    const target = visibleAncestor(r.target, visible);
    if (source === undefined || target === undefined || source === target) continue;
    const key = `${source}\u0000${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ source, target, label: edgeText(r.label, r.technology), async: isAsyncKind(r.kind) });
  }
  return out;
}
