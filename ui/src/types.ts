export type Kind = "person" | "softwareSystem" | "container" | "component";
export type NodeKind = Kind | "stage" | "file";
export type Level = "landscape" | "context" | "container" | "component" | "code";
export const LEVELS: Level[] = ["landscape", "context", "container", "component", "code"];
export type DiagramLevel = Level | "connector" | "flow";

export const SECTIONS = ["technology", "notes", "tradeoffs", "usage", "sensitive", "code"] as const;
export type Section = (typeof SECTIONS)[number];
export const SECTION_LABEL: Record<Section, string> = {
  technology: "Technology",
  notes: "Notes",
  tradeoffs: "Tradeoffs",
  usage: "Usage",
  sensitive: "Sensitive information",
  code: "Code",
};

export interface Link {
  label: string;
  url: string;
}
export interface Tradeoff {
  kind: "benefit" | "cost" | "risk";
  text: string;
}
export interface Usage {
  users: string;
  frequency: string;
  volume?: string;
}
export interface SensitiveItem {
  item: string;
  level: string;
}
export interface Stage {
  id: string;
  name: string;
  technologies?: string[];
  description?: string;
  elementId?: string;
  archType?: string;
}

export interface Style {
  fill?: string;
  text?: string;
  stroke?: string;
  strokeStyle?: "solid" | "dashed" | "dotted";
  strokeWidth?: number;
  fontSize?: number;
  arrow?: "end" | "start" | "both" | "none";
}

export interface Pt {
  x: number;
  y: number;
}
export interface EdgeLayout {
  sourceAnchor?: Pt;
  targetAnchor?: Pt;
  control?: Pt;
  labelT?: number;
  labelOffset?: number;
  routing?: "straight" | "curved" | "orthogonal";
}

export interface ElementSummary {
  id: string;
  kind: NodeKind;
  name: string;
  description: string;
  technology: string;
  technologies: string[];
  url: string;
  owner: string;
  links: Link[];
  tags: Record<string, string>;
  archType: string;
  notes: string;
  tradeoffs: Tradeoff[];
  usage: Usage[];
  sensitive: SensitiveItem[];
  sensitivityLevel: string | null;
  codePaths: string[];
  parentId: string | null;
  external: boolean;
  location?: string | null;
  childCount: number;
}

export interface DiagramNode extends ElementSummary {
  inScope: boolean;
  position: Pt | null;
  drillKey: string | null;
  style: Style;
  size: { w: number; h: number } | null;
  stageId?: string;
  linkedElementId?: string | null;
  linkedElementName?: string | null;
  filePath?: string;
  lineCount?: number | null;
}

export interface DrillTarget {
  relationshipId: string;
  key: string;
  title: string;
  label: string;
  description: string;
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  description: string;
  technology: string;
  technologies: string[];
  kind: string;
  sensitivityLevel: string | null;
  hasNotes: boolean;
  stageCount: number;
  derived: boolean;
  relationshipIds: string[];
  detailKey: string | null;
  drillTargets: DrillTarget[];
  steps?: number[];
  style: Style;
  layout: EdgeLayout;
}

export interface Crumb {
  key: string;
  label: string;
  level: string;
  c4?: string;
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
  level: DiagramLevel;
  c4: string;
  scope: string | null;
  title: string;
  breadcrumb: Crumb[];
  boundary: { id: string; name: string; kind: Kind } | null;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  addable: string[];
  flow?: Flow;
  connector?: {
    relationshipId: string;
    name: string;
    description: string;
    kind: string;
    technologies: string[];
    hasCode: boolean;
    codeKey: string | null;
  };
  code?: { ownerName: string; paths: string[]; missing: string[]; hasRoot: boolean; truncated: boolean };
}

export interface Relationship {
  id: string;
  sourceId: string;
  destinationId: string;
  description: string;
  technology: string;
  technologies: string[];
  kind: string;
  notes: string;
  sensitive: SensitiveItem[];
  sensitivityLevel: string | null;
  stages: Stage[];
  codePaths: string[];
}

export interface DiagramInfo {
  key: string;
  level: DiagramLevel;
  scope: string | null;
  title: string;
  label: string;
  parentKey: string | null;
  c4: string;
  depth: number;
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
  visibleSections: Section[];
  showTechnology: boolean;
  showDescriptions: boolean;
  builtin: boolean;
}

export interface Enums {
  archTypes: { id: string; label: string }[];
  sensitivity: string[];
  frequencies: string[];
  tradeoffKinds: string[];
  connectorKinds: { id: string; label: string }[];
}

export interface AppState {
  workspace: { name: string; description: string };
  root: string;
  codeRoot: string;
  elements: ElementSummary[];
  relationships: Relationship[];
  diagrams: DiagramInfo[];
  tagGroups: TagGroup[];
  lenses: Lens[];
  flows: Flow[];
  loadErrors: string[];
  enums: Enums;
  technologies: string[];
  styles: Record<string, Style>;
  canUndo: boolean;
  canRedo: boolean;
}

export type Selection = { type: "node"; id: string } | { type: "edge"; id: string } | null;

export const KIND_LABEL: Record<NodeKind, string> = {
  person: "Person",
  softwareSystem: "Software System",
  container: "Container",
  component: "Component",
  stage: "Stage",
  file: "File",
};

export const LEVEL_LABEL: Record<DiagramLevel, string> = {
  landscape: "Landscape",
  context: "Context",
  container: "Container",
  component: "Component",
  code: "Code",
  connector: "Connector",
  flow: "Flow",
};

export function homeDiagramOf(el: ElementSummary): string {
  if (el.kind === "container") return `containers-${el.parentId}`;
  if (el.kind === "component") return `components-${el.parentId}`;
  return "landscape";
}
