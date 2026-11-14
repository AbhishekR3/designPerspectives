export type Kind = "person" | "softwareSystem" | "container" | "component";
export type Level = "landscape" | "context" | "container" | "component";
export const LEVELS: Level[] = ["landscape", "context", "container", "component"];

export interface Link {
  label: string;
  url: string;
}

export interface ElementSummary {
  id: string;
  kind: Kind;
  name: string;
  description: string;
  technology: string;
  url: string;
  owner: string;
  links: Link[];
  tags: Record<string, string>;
  parentId: string | null;
  external: boolean;
  location?: string | null;
  childCount: number;
}

export interface DiagramNode extends ElementSummary {
  inScope: boolean;
  position: { x: number; y: number } | null;
  drillKey: string | null;
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  description: string;
  technology: string;
  derived: boolean;
  relationshipIds: string[];
  steps?: number[];
}

export interface Crumb {
  key: string;
  label: string;
  level: string;
}

export interface FlowStep {
  relationshipId: string;
  description: string;
  response: boolean;
  order?: string | null;
}

export interface Flow {
  key: string;
  title: string;
  description: string;
  scope: string | null;
  warnings: string[];
  steps: FlowStep[];
}

export interface Diagram {
  key: string;
  level: Level | "flow";
  scope: string | null;
  title: string;
  breadcrumb: Crumb[];
  boundary: { id: string; name: string; kind: Kind } | null;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  addable: Kind[];
  flow?: Flow;
}

export interface Relationship {
  id: string;
  sourceId: string;
  destinationId: string;
  description: string;
  technology: string;
}

export interface DiagramInfo {
  key: string;
  level: Level;
  scope: string | null;
  title: string;
  parentKey: string | null;
}

export interface TagValue {
  name: string;
  color: string;
}

export interface TagGroup {
  name: string;
  values: TagValue[];
}

export interface Lens {
  id: string;
  name: string;
  visibleLevels: Level[];
  defaultOverlay: string | null;
  hiddenTagGroups: string[];
  showTechnology: boolean;
  showDescriptions: boolean;
  builtin: boolean;
}

export interface AppState {
  workspace: { name: string; description: string };
  root: string;
  elements: ElementSummary[];
  relationships: Relationship[];
  diagrams: DiagramInfo[];
  tagGroups: TagGroup[];
  lenses: Lens[];
  flows: Flow[];
  loadErrors: string[];
}

export type Selection = { type: "node"; id: string } | { type: "edge"; id: string } | null;

export const KIND_LABEL: Record<Kind, string> = {
  person: "Person",
  softwareSystem: "Software System",
  container: "Container",
  component: "Component",
};

export const LEVEL_LABEL: Record<Level, string> = {
  landscape: "Landscape",
  context: "Context",
  container: "Container",
  component: "Component",
};
