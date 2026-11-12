/** Types shared by the planning modules (kept separate so plan.ts and plan-views.ts have no import cycle). */
import type { DeploymentInstance, DeploymentNode, DynamicStep, Element, Relationship, ViewDef } from "@designperspectives/contracts";

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

export type SzViewType = "systemLandscape" | "systemContext" | "container" | "component" | "dynamic" | "deployment";

export interface PlanStep {
  step: DynamicStep;
  rel: PlanRelationship;
  /** 1-based order among exported steps. */
  order: number;
}

export interface PlanView {
  view: ViewDef;
  szType: SzViewType;
  /** Exported scope element id (software system or container), when the view has one. */
  scope?: string;
  env?: PlanEnvironment;
  steps: PlanStep[];
}
