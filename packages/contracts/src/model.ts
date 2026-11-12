/**
 * Domain model shared by the core and every plug-in.
 * Source: spec file 04 §2–§3 (strict C4 kinds, relationship kinds, element identity).
 */

/** C4 element kinds of the strict preset (file 04 §2). */
export const ELEMENT_KINDS = [
  "person",
  "softwareSystem",
  "hardwareSystem",
  "container",
  "dataStore",
  "queue",
  "topic",
  "component",
  "codeElement",
  "group",
] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];

/** Deployment-model kinds (file 04 §2). Kept separate: they live under a deployment environment. */
export const DEPLOYMENT_KINDS = ["environment", "deploymentNode", "infrastructureNode"] as const;
export type DeploymentKind = (typeof DEPLOYMENT_KINDS)[number];

/** Relationship kinds (file 04 §2). A bare "uses" is deliberately absent. */
export const RELATIONSHIP_KINDS = [
  "calls",
  "sendsTo",
  "publishesTo",
  "subscribesTo",
  "readsFrom",
  "writesTo",
  "requestReply",
  "deploysTo",
] as const;
export type RelationshipKind = (typeof RELATIONSHIP_KINDS)[number];

/** Kinds whose default communication mode is asynchronous (dashed line by default, file 05 rule 4). */
export const ASYNC_RELATIONSHIP_KINDS: readonly RelationshipKind[] = ["sendsTo", "publishesTo", "subscribesTo"];

export const GROUP_TYPES = ["layer", "boundedContext", "module", "team", "microservice", "orgUnit"] as const;
export type GroupType = (typeof GROUP_TYPES)[number];

/**
 * Stable element identifier: dot-separated slugs, e.g. `ibs.backend.security`.
 * The parent is the id without its last segment. IDs never derive from titles (file 04 §3).
 */
export type ElementId = string;

export interface Element {
  id: ElementId;
  kind: ElementKind;
  title: string;
  description?: string;
  technology?: string;
  tags?: string[];
  /** Only meaningful when kind === "group". */
  groupType?: GroupType;
}

/**
 * Relationship identifier: `<source>-><target>#<kind>` or, when two relationships share source,
 * target and kind, `<source>-><target>#<kind>:<key>` (plan finding F4).
 */
export type RelationshipId = string;

export interface Relationship {
  source: ElementId;
  target: ElementId;
  kind: RelationshipKind;
  /** Description label shown on the arrow. Required by validation (file 04 §2). */
  label: string;
  technology?: string;
  /** Optional disambiguator, see RelationshipId. */
  key?: string;
  tags?: string[];
}

export interface DeploymentNode {
  /** Dot-separated id whose first segment is the environment, e.g. `live.aws.ecs`. */
  id: string;
  kind: DeploymentKind;
  title: string;
  description?: string;
  technology?: string;
  tags?: string[];
}

/** An instance of a container or software system running on a deployment node. */
export interface DeploymentInstance {
  /** `<nodeId>.<name>` */
  id: string;
  /** Element id of the container / software system instantiated. */
  of: ElementId;
}

export const VIEW_TYPES = ["landscape", "context", "container", "component", "dynamic", "deployment"] as const;
export type ViewType = (typeof VIEW_TYPES)[number];

export interface DynamicStep {
  source: ElementId;
  target: ElementId;
  label: string;
  technology?: string;
}

export interface ViewDef {
  id: string;
  type: ViewType;
  /** Must state type and scope, e.g. "Container View: Internet Banking System" (file 05 rule 1). */
  title: string;
  description?: string;
  /** Element in focus (software system for context/container, container for component). */
  scope?: ElementId;
  /** Deployment environment id for deployment views. */
  environment?: string;
  /**
   * Inclusion predicates: `*` (the scope's default neighbourhood), an element id, or `<id>.*`.
   * Kept as written; the model backend resolves them.
   */
  include: string[];
  exclude?: string[];
  /** Ordered interactions for dynamic views. */
  steps?: DynamicStep[];
}

export interface Model {
  elements: Element[];
  relationships: Relationship[];
  deploymentNodes: DeploymentNode[];
  deploymentInstances: DeploymentInstance[];
  views: ViewDef[];
}

export function emptyModel(): Model {
  return { elements: [], relationships: [], deploymentNodes: [], deploymentInstances: [], views: [] };
}

export function parentIdOf(id: string): string | undefined {
  const i = id.lastIndexOf(".");
  return i < 0 ? undefined : id.slice(0, i);
}

export function relationshipIdOf(r: Pick<Relationship, "source" | "target" | "kind" | "key">): RelationshipId {
  const base = `${r.source}->${r.target}#${r.kind}`;
  return r.key ? `${base}:${r.key}` : base;
}

/** A segment of an element id: lower-case letter first, then letters, digits or hyphens. */
export const ID_SEGMENT_PATTERN = /^[a-z][a-zA-Z0-9-]*$/;

export function isValidElementId(id: string): boolean {
  return id.length > 0 && id.split(".").every((s) => ID_SEGMENT_PATTERN.test(s));
}

function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Canonical ordering used by printers and golden tests (file 04 §3). Does not mutate the input. */
export function sortModel(model: Model): Model {
  return {
    elements: [...model.elements].sort(byId),
    relationships: [...model.relationships].sort((a, b) => {
      const x = relationshipIdOf(a);
      const y = relationshipIdOf(b);
      return x < y ? -1 : x > y ? 1 : 0;
    }),
    deploymentNodes: [...model.deploymentNodes].sort(byId),
    deploymentInstances: [...model.deploymentInstances].sort(byId),
    views: [...model.views].sort(byId),
  };
}

// ---- Computed (laid-out) views --------------------------------------------------------------

export interface ViewNode {
  /** Element id, deployment node id or instance id. */
  id: string;
  kind: string;
  title: string;
  description?: string;
  technology?: string;
  /** Id of the enclosing boundary node in this view, if any. */
  parent?: string;
  /** True when the node is drawn as a boundary containing other nodes. */
  isBoundary: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  technology?: string;
  kind?: string;
  /** True → drawn dashed (file 05 rule 4). */
  async: boolean;
  points: Array<[number, number]>;
}

export interface ComputedView {
  id: string;
  type: ViewType;
  title: string;
  description?: string;
  scope?: string;
  width: number;
  height: number;
  nodes: ViewNode[];
  edges: ViewEdge[];
}

/** One line of an auto-generated key (file 05 rule 2). */
export interface KeyEntry {
  /** "element" entries describe a node kind; "relationship" entries a line style. */
  category: "element" | "relationship";
  id: string;
  label: string;
}

function nodeKeyEntry(n: ViewNode): [string, KeyEntry] {
  const id = n.isBoundary ? `${n.kind}:boundary` : n.kind;
  const label = n.isBoundary ? `${kindLabel(n.kind)} boundary (dashed border)` : kindLabel(n.kind);
  return [`e:${id}`, { category: "element", id, label }];
}

const LINE_KEYS: Record<"sync" | "async", KeyEntry> = {
  sync: { category: "relationship", id: "sync", label: "Synchronous relationship (solid line)" },
  async: { category: "relationship", id: "async", label: "Asynchronous relationship (dashed line)" },
};

/** Key derived only from what a view actually shows. */
export function keyForView(view: ComputedView): KeyEntry[] {
  const entries = new Map<string, KeyEntry>(view.nodes.map(nodeKeyEntry));
  for (const e of view.edges) entries.set(`r:${e.async ? "async" : "sync"}`, LINE_KEYS[e.async ? "async" : "sync"]);
  return [...entries.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, v]) => v);
}

const KIND_LABELS: Record<string, string> = {
  person: "Person",
  softwareSystem: "Software system",
  hardwareSystem: "Hardware system",
  container: "Container",
  dataStore: "Data store",
  queue: "Queue",
  topic: "Topic",
  component: "Component",
  codeElement: "Code element",
  group: "Group",
  environment: "Deployment environment",
  deploymentNode: "Deployment node",
  infrastructureNode: "Infrastructure node",
  instance: "Instance",
};

/** Type label shown on element cards, e.g. "[Container]" (file 05 rule 3). */
export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}
