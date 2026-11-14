// API contract shared by the server (src/) and the browser UI (ui/). Pure types and constants only:
// no Node or DOM imports, so both sides can import it.

export type Kind = "person" | "softwareSystem" | "container" | "component";
export type NodeKind = Kind | "stage" | "file";
export type Level = "landscape" | "context" | "container" | "component" | "code";
export const LEVELS: Level[] = ["landscape", "context", "container", "component", "code"];
export type DiagramLevel = Level | "connector" | "flow";

export const SECTIONS = ["technology", "characteristics", "cost", "work", "details", "notes", "tradeoffs", "usage", "sensitive", "code"] as const;
export type Section = (typeof SECTIONS)[number];
export const SECTION_LABEL: Record<Section, string> = {
  technology: "Technology",
  characteristics: "Characteristics",
  cost: "Cost",
  work: "Linked work",
  details: "Details",
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
export interface DetailTable {
  title: string;
  columns: string[];
  rows: string[][];
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
export interface Rating {
  name: string;
  rating?: number;
  driving?: boolean;
  note?: string;
}
export interface WorkItem {
  type: string; // security | pr | issue | backlog | update
  title: string;
  url?: string;
  status: string; // open | in-progress | blocked | done
  severity?: string; // critical | high | medium | low
  note?: string;
}
export interface CostItem {
  item: string;
  monthly: number;
  note?: string;
}
export interface CharacteristicDef {
  name: string;
  description: string;
}
export interface CostBand {
  name: string;
  max: number | null;
  color: string;
}
export interface CostSettings {
  currency: string;
  bands: CostBand[];
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
  strokeStyle?: "solid" | "dashed" | "dotted" | "dash-dot" | "long-dash";
  strokeWidth?: number;
  fontSize?: number;
  arrow?: "end" | "start" | "both" | "none";
  arrowHead?: "filled" | "open" | "diamond" | "diamond-open" | "circle" | "bar";
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
  routing?: "straight" | "curved" | "smooth" | "orthogonal" | "rounded";
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
  details: DetailTable[];
  tradeoffs: Tradeoff[];
  usage: Usage[];
  sensitive: SensitiveItem[];
  sensitivityLevel: string | null;
  codePaths: string[];
  characteristics: Rating[];
  cost: CostItem[];
  work: WorkItem[];
  costTotal: number;
  costRollup: number;
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
  /** Set when the diagram is compared with another version of the model. */
  change?: ChangeKind;
  /** Not in the shown model: drawn from the compared version (read-only). */
  ghost?: boolean;
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
  openWork?: number;
  derived: boolean;
  relationshipIds: string[];
  detailKey: string | null;
  drillTargets: DrillTarget[];
  steps?: number[];
  style: Style;
  layout: EdgeLayout;
  change?: ChangeKind;
  ghost?: boolean;
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
  example?: string;
  format?: string;
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
    archType?: string;
  };
  code?: { ownerName: string; paths: string[]; missing: string[]; hasRoot: boolean; truncated: boolean };
  /** Set when compared with another version; `removed`: this diagram exists only in that version. */
  compare?: { against: string; removed: boolean };
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
  work: WorkItem[];
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
  workTypes: { id: string; label: string }[];
  workStatuses: string[];
  severities: string[];
}

export interface AppState {
  workspace: { name: string; description: string };
  root: string;
  codeRoot: string;
  elements: ElementSummary[];
  relationships: Relationship[];
  diagrams: DiagramInfo[];
  tagGroups: TagGroup[];
  characteristics: CharacteristicDef[];
  costSettings: CostSettings;
  lenses: Lens[];
  flows: Flow[];
  loadErrors: string[];
  enums: Enums;
  technologies: string[];
  styles: Record<string, Style>;
  sections: Section[];
  canUndo: boolean;
  canRedo: boolean;
  readOnly: boolean;
  /** The model shown: "main", "draft:<id>" or "ref:<git ref>" (read-only). */
  model: { ref: string; title: string };
  drafts: DraftInfo[];
  /** Set when the model is compared with another version (overlay "Changes"). */
  compare: { against: string; title: string; summary: ChangeSummary } | null;
  /** Null when the model folder is not in a git repository. */
  git: { branch: string | null; refs: string[] } | null;
}

// ------------------------------------------------------------------ planned change (Stage C)

/** How an object differs from the model it is compared with. "inner": something inside it changed. */
export type ChangeKind = "added" | "changed" | "removed" | "inner";

export interface FieldChange {
  field: string;
  label: string;
  before: unknown;
  after: unknown;
}

export interface ObjectChange {
  id: string;
  type: "element" | "relationship" | "flow" | "setting";
  /** Element kind, "relationship", "flow", or the setting's kind (tag group, lens, ...). */
  kind: string;
  name: string;
  change: Exclude<ChangeKind, "inner">;
  fields: FieldChange[];
  /** The diagram to open to see the object (in the version where it exists). */
  homeKey: string | null;
}

export interface ChangeSummary {
  added: number;
  changed: number;
  removed: number;
  /** Position, size, line-shape and style changes; not counted as model changes. */
  layout: number;
}

export interface ChangeSet {
  /** What the shown model is compared with, e.g. "base" or "main". */
  against: string;
  elements: ObjectChange[];
  relationships: ObjectChange[];
  flows: ObjectChange[];
  settings: ObjectChange[];
  /** Elements not changed themselves but with a changed element or relationship inside. */
  inner: string[];
  summary: ChangeSummary;
}

export interface Conflict {
  label: string;
  reason: string;
}

export interface DraftInfo {
  id: string;
  title: string;
  description: string;
  created: string;
}

export interface ApplyPreview {
  changes: ChangeSet;
  conflicts: Conflict[];
}
