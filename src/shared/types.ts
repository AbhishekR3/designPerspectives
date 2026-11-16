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
  /** Sample of the data that leaves this stage. */
  example?: string;
  /** What that data is, e.g. "JSON", "Parquet row", "SQL". */
  format?: string;
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
  /** Where this UI runs (http/https), for the live UI inspector; "" when not set. */
  uiUrl: string;
  /** The service.name this element has in trace files, when it differs from its ID and name; "" when not set. */
  otelService: string;
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
  /** Code files: hash of the content, to tell changed files apart when comparing versions. */
  contentHash?: string;
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
  /** Kinds in `addable` that only show on this diagram when created connected to an element drawn
   *  in scope here (POST /api/elements with `connectTo` or `connectFrom`). Missing means none. */
  connectRequired?: string[];
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
  /** Sample of the data that travels along this relationship (for a connector with stages: the data entering the first stage). */
  example: string;
  format: string;
  /** HTTP calls that travel along this relationship, so the live UI inspector can match them. */
  endpoints: Endpoint[];
}

/** An HTTP call pattern: method ("*" for any) and a path ("/api/accounts/:id", "*" matches the rest) or a full URL. */
export interface Endpoint {
  method: string;
  path: string;
}

/** One HTTP call seen in a live UI (POST /api/inspect). */
export interface ObservedCall {
  method: string;
  url: string;
}

/** What one observed call means in the model. */
export interface InspectedCall {
  method: string;
  url: string;
  /** The URL's path (no query), as matched. */
  path: string;
  /** Relationships from the UI element (or its children) with an endpoint that matches. */
  matches: string[];
  /** A pattern for this call, to add as an endpoint when it matches nothing. */
  suggested: Endpoint;
}

/** A relationship reached from a matched call, following the model's outgoing relationships. */
export interface InspectHop {
  relationshipId: string;
  /** 0 for a relationship the call matched, 1 for the next one, and so on. */
  depth: number;
  /** The relationship this one continues (null at depth 0). */
  via: string | null;
}

export interface InspectResult {
  calls: InspectedCall[];
  /** Every relationship reached, in walk order (breadth first, each once). */
  hops: InspectHop[];
  /** Elements the calls reach, in walk order (not the UI element itself). */
  elements: string[];
  /** Flows that contain a matched relationship. */
  flows: { key: string; title: string }[];
  /** Relationships from the UI element or its children: where an unmatched call's endpoint can be added. */
  candidates: string[];
  /** True when the walk stopped at the depth limit with relationships left. */
  truncated: boolean;
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

// ------------------------------------------------------------------ sign-in and roles (Stage P4)

/** What a signed-in person may do: architect (everything), engineer (drafts), viewer (read only). */
export type Role = "architect" | "engineer" | "viewer";

export interface SessionUser {
  name: string;
  role: Role;
}

/** GET /api/me (always reachable); POST /api/login returns { user }. */
export interface MeResponse {
  /** True when the server has a users file: every other API call needs a session. */
  loginRequired: boolean;
  user: SessionUser | null;
}

/** What the request's user may do, for the version the request selected. */
export interface Permissions {
  /** Change the selected version (main or a draft): model edits, positions, undo/redo, planned code edits. */
  editThis: boolean;
  createDraft: boolean;
  applyDraft: boolean;
  /** Discard the open draft (false when no draft is open). */
  discardDraft: boolean;
  /** Save, create or delete real code files (main model only). */
  writeCode: boolean;
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
  /** Lens to start in when the browser has no saved choice. With sign-in: by role (architect: "architect",
   *  engineer: "engineer", viewer: "overview"). Without: "architect" while the model has no containers, else "engineer". */
  defaultLens: string;
  flows: Flow[];
  loadErrors: string[];
  enums: Enums;
  technologies: string[];
  styles: Record<string, Style>;
  sections: Section[];
  canUndo: boolean;
  canRedo: boolean;
  /** `!can.editThis`: true for git versions, a --read-only server, and versions the user's role cannot change. */
  readOnly: boolean;
  /** The signed-in user (null when sign-in is off). */
  me: SessionUser | null;
  loginRequired: boolean;
  can: Permissions;
  /** The model shown: "main", "draft:<id>" or "ref:<git ref>" (read-only). */
  model: { ref: string; title: string };
  /** Changes whenever the shown model (or the one it is compared with) is edited or changed on disk;
   *  positions and layouts included, which the rest of this summary does not show. */
  version: string;
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
  /** Code files added, changed or removed (only for objects mapped to code). */
  code: number;
}

export interface CodeChange {
  /** The element or relationship whose code paths hold the files; "" for planned files no object points to. */
  ownerId: string;
  ownerType: "element" | "relationship" | "none";
  ownerName: string;
  homeKey: string | null;
  files: { path: string; change: "added" | "changed" | "removed" }[];
  imports: { from: string; to: string; change: "added" | "removed" }[];
}

export interface ChangeSet {
  /** What the shown model is compared with, e.g. "base" or "main". */
  against: string;
  elements: ObjectChange[];
  relationships: ObjectChange[];
  flows: ObjectChange[];
  settings: ObjectChange[];
  /** Elements not changed themselves but with a changed element or relationship inside (or changed code). */
  inner: string[];
  /** Changes to the code behind mapped objects, when both versions have code to read. */
  code: CodeChange[];
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
  /** Who started the draft (the signed-in user or the git user name); absent when unknown. */
  author?: string;
  /** Objects added, changed or removed in the main model since the draft started. */
  behind: number;
  /** The git branch where the code for this draft is written (for the progress check). */
  branch: string;
  /** A link to the pull request or ticket. */
  link: string;
  /** Number of planned code edits in the draft. */
  plannedFiles: number;
  /** Whether the requesting user may discard this draft (set in GET /api/state). */
  canDiscard?: boolean;
}

export interface ApplyPreview {
  changes: ChangeSet;
  conflicts: Conflict[];
  /** Planned code edits that Apply writes to the code folder (when asked to). */
  code: { path: string; change: "added" | "changed" | "deleted" }[];
}

/** One step of a draft's coding plan. */
export interface PlanItem {
  id: string;
  /** System / container the step belongs to, "Flows", "Planned code edits", ... */
  section: string;
  kind: "build" | "change" | "remove" | "connect" | "disconnect" | "file" | "model";
  title: string;
  details: string[];
  /** True when the step can be checked against the code automatically. */
  auto: boolean;
  /** done / open: checked; manual: check by hand; unchecked: not checked yet; info: no code work. */
  status: "done" | "open" | "manual" | "unchecked" | "info";
  evidence: string;
}

export interface CodingPlan {
  draftId: string;
  title: string;
  description: string;
  /** Who started the draft; absent when unknown. */
  author?: string;
  branch: string;
  link: string;
  /** What the code was checked against, e.g. "the code folder", "git feature/x (a1b2c3d)"; null: not checked. */
  checkedAgainst: string | null;
  items: PlanItem[];
  summary: { done: number; open: number; manual: number; unchecked: number };
  markdown: string;
}

// ------------------------------------------------------------------ backtracking (GET /api/backtrack)

export interface CommitInfo {
  sha: string;
  /** ISO 8601 author date. */
  date: string;
  author: string;
  subject: string;
}

export interface FunctionInfo {
  name: string;
  kind: "function" | "method" | "class";
  line: number;
  /** Lines in its range changed within the recent window (or are not committed yet). */
  changed: boolean;
}

export interface BacktrackFile {
  path: string;
  exists: boolean;
  functions: FunctionInfo[];
  /** Newest first. */
  commits: CommitInfo[];
  /** The file differs from its last commit. */
  uncommitted: boolean;
}

export interface ModelChange extends CommitInfo {
  change: "added" | "changed" | "removed";
  /** What changed, e.g. 'Stage "Convert currency": example, description' or 'Component "Fee Calculator" added'. */
  what: string;
}

export interface BacktrackStep {
  /** 0 is the data entering a connector; stages and flow steps count from 1. */
  index: number;
  name: string;
  description: string;
  /** The element that does this step (a stage's implementing element, a flow step's receiver). */
  elementId: string | null;
  relationshipId: string;
  stageId: string | null;
  example: string;
  format: string;
  files: BacktrackFile[];
  /** Commits that changed this step's part of the model, newest first. */
  modelChanges: ModelChange[];
  /** Something about this step changed within the recent window, or is not committed. */
  recent: boolean;
}

export interface BacktrackResult {
  title: string;
  /** Index of the step backtracking starts from (the last in `steps`). */
  target: number;
  /** In process order, from the first step to the target. */
  steps: BacktrackStep[];
  recentDays: number;
  /** ISO date: changes on or after it count as recent. */
  since: string;
  /** False when the code folder or the model is not in a git repository. */
  codeHistory: boolean;
  modelHistory: boolean;
}

// ------------------------------------------------------------------ traces (GET /api/traces)

export interface TraceSummary {
  traceId: string;
  /** The root span's name, e.g. "POST /api/payments". */
  name: string;
  service: string;
  /** Start, milliseconds since the epoch. */
  start: number;
  durationMs: number;
  spanCount: number;
  error: boolean;
}

export interface ObservedSpan {
  spanId: string;
  parentId: string | null;
  name: string;
  service: string;
  /** "server", "client", "producer", "consumer" or "internal". */
  kind: string;
  /** The model element that ran this span, or null when none matches. */
  elementId: string | null;
  /** For a client or producer span: the element it called (from peer.service), or null. */
  peerElementId: string | null;
  /** Start, milliseconds after the trace's start. */
  startMs: number;
  durationMs: number;
  /** The status message (or "error") when the span failed. */
  error: string | null;
  /** A few attributes, secret-looking ones masked. */
  attributes: Record<string, string>;
}

/** One step the request took from an element to another, as seen in the trace. */
export interface ObservedHop {
  from: string;
  to: string;
  spanId: string;
  /** The relationship in the model that this step uses, or null: the model does not have it. */
  relationshipId: string | null;
}

export interface ObservedTrace extends TraceSummary {
  spans: ObservedSpan[];
  hops: ObservedHop[];
  /** Elements the trace reached, in order. */
  elements: string[];
  /** Services or files in the trace that no element matches. */
  unmapped: string[];
}

export interface TraceList {
  /** The folder dp reads trace files from. */
  dir: string;
  exists: boolean;
  traces: TraceSummary[];
}
