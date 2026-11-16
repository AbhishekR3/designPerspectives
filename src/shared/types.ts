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

/** Kinds of data held by an element (a database's tables, a broker's topics, ...); DEC-055. */
export const DATA_KINDS = ["table", "view", "topic", "queue", "bucket", "collection", "file", "index", "other"] as const;
export type DataKind = (typeof DATA_KINDS)[number];

/** A piece of data an element holds (`dp.data`). In a hub, a catalog element's assets are shared. */
export interface DataAsset {
  name: string;
  kind: DataKind;
  description?: string;
  /** The team or project that owns it. */
  owner?: string;
  sensitive?: boolean;
}

/** What a relationship does with an asset of the element at its other end (`dp.data.access`). */
export interface DataAccess {
  asset: string;
  mode: "read" | "write";
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
  /** The shared catalog element this is a linked copy of (`dp.catalog`), or "". */
  catalogId: string;
  /** Data the element holds, its own (`dp.data`). A linked copy also has the catalog element's. */
  data: DataAsset[];
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
  /** The default line shape of this diagram (lines without their own shape use it); null means rounded right angles. */
  lineShape: NonNullable<EdgeLayout["routing"]> | null;
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
  /** Data of the element at either end that this relationship reads or writes. */
  dataAccess: DataAccess[];
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
  /** Add comments, ideas and questions, reply, and resolve them (every role; not on a --read-only server). */
  comment: boolean;
}

// ------------------------------------------------------------------ decision records (DEC-050)

export const DECISION_STATUSES = ["proposed", "accepted", "rejected", "deprecated", "superseded"] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];
export const DECISION_STATUS_LABEL: Record<DecisionStatus, string> = {
  proposed: "Proposed",
  accepted: "Accepted",
  rejected: "Rejected",
  deprecated: "Deprecated",
  superseded: "Superseded",
};

/**
 * The shape of a decision. Each kind has a template (`DECISION_KIND_INFO`) and its own optional fields:
 * - choice: chose one option over others.
 * - conditional: "we would choose Q if X held; it does not, so A". The conditions become revisit triggers.
 * - deferred: not decided yet, to be decided by a date (`decideBy`).
 * - time-boxed: a known compromise accepted until a date (`expires`).
 * - policy: a rule that applies to many parts (`appliesTo`).
 * - reversal: replaces an earlier decision (`supersedes`).
 */
export const DECISION_KINDS = ["choice", "conditional", "deferred", "time-boxed", "policy", "reversal"] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];
export const DECISION_KIND_INFO: Record<DecisionKind, { label: string; hint: string }> = {
  choice: { label: "Choice", hint: "We chose one option over the others." },
  conditional: { label: "Conditional", hint: "We would choose another option if some conditions held. They do not, so we chose this. The conditions are watched." },
  deferred: { label: "Deferred", hint: "Not decided yet. Say what is missing and when it must be decided." },
  "time-boxed": { label: "Time-boxed", hint: "A known compromise, accepted until a date." },
  policy: { label: "Policy", hint: "A rule that applies to many parts of the system." },
  reversal: { label: "Reversal", hint: "Replaces an earlier decision." },
};

/** An option that was considered and not chosen. */
export interface DecisionAlternative {
  name: string;
  /** Why it is not chosen now. */
  whyNot: string;
  /** Conditions under which it would be chosen ("if we had a platform team"). */
  wouldChooseIf: string[];
  /** Any other text written under the option. */
  notes: string;
}

/** Something that, when it happens, means the decision should be looked at again. */
export interface DecisionTrigger {
  text: string;
  /** Marked as having happened. */
  met: boolean;
  /** The alternative it would favour (its name), or "". */
  alternative: string;
}

export interface DecisionSection {
  heading: string;
  body: string;
}

/** A decision record: one Markdown file `architecture/decisions/NNNN-slug.md`. */
export interface Decision {
  /** The four-digit number from the file name, e.g. "0007". */
  id: string;
  /** File name inside the decisions folder; kept when the title changes. */
  file: string;
  title: string;
  status: DecisionStatus;
  kind: DecisionKind;
  /** YYYY-MM-DD */
  date: string;
  deciders: string[];
  /** IDs of elements and relationships the decision is about. */
  affects: string[];
  /** IDs of decisions this one replaces / that replaced this one. */
  supersedes: string[];
  supersededBy: string[];
  tags: string[];
  /** YYYY-MM-DD or "": look at the decision again by then. */
  reviewBy: string;
  /** Deferred decisions: decide by then. */
  decideBy: string;
  /** Time-boxed decisions: the compromise ends then. */
  expires: string;
  /** Policies: what the rule applies to. */
  appliesTo: string;
  context: string;
  decision: string;
  alternatives: DecisionAlternative[];
  consequences: string;
  triggers: DecisionTrigger[];
  /** Sections with other headings, kept as written. */
  extra: DecisionSection[];
  /** Front matter keys this tool does not know, kept as written. */
  extraMeta: [string, string][];
  /** Set when the file cannot be read; the file is then never rewritten. */
  error?: string;
  /** The file's text, kept only when it cannot be read (so a draft can still carry it). */
  raw?: string;
}

/** What lists and the element panel show. */
export interface DecisionSummary {
  id: string;
  file: string;
  title: string;
  status: DecisionStatus;
  kind: DecisionKind;
  date: string;
  affects: string[];
  tags: string[];
  supersedes: string[];
  supersededBy: string[];
  reviewBy: string;
  decideBy: string;
  expires: string;
  triggers: { open: number; met: number };
  error?: string;
}

/** Fields a client may send when creating or replacing a decision. */
export type DecisionInput = Partial<Omit<Decision, "id" | "file" | "error" | "supersededBy">>;

// ------------------------------------------------------------------ comments (DEC-049)

export const COMMENT_KINDS = ["comment", "idea", "question"] as const;
/** A note on the model: a remark, a suggestion for a change, or something to be answered. */
export type CommentKind = (typeof COMMENT_KINDS)[number];
export const COMMENT_KIND_LABEL: Record<CommentKind, string> = { comment: "Comment", idea: "Idea", question: "Question" };
/** What a thread is about: an element or relationship (by ID), or a whole diagram (by diagram key). */
export interface CommentTarget {
  type: "element" | "relationship" | "diagram";
  id: string;
}
export interface CommentReply {
  id: string;
  author: string;
  /** ISO 8601 time. */
  at: string;
  text: string;
}
export interface CommentThread {
  id: string;
  kind: CommentKind;
  target: CommentTarget;
  /** The diagram the author was looking at (a hint for where to open it). */
  diagram: string | null;
  author: string;
  at: string;
  text: string;
  status: "open" | "resolved";
  resolvedBy?: string;
  resolvedAt?: string;
  replies: CommentReply[];
  /** Set by the server for the version shown: the target is not in it (deleted, or only in another draft). */
  missing?: boolean;
}
export interface CommentList {
  threads: CommentThread[];
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
  /** Decision records of the shown version, by number. */
  decisions: DecisionSummary[];
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
  type: "element" | "relationship" | "flow" | "decision" | "setting";
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
  decisions: ObjectChange[];
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

// ------------------------------------------------------------------ home page and hub (DEC-053, DEC-054)

/** What the server serves: one project (`dp serve PATH`) or a hub of projects (`dp serve --hub DIR`). */
export interface HubInfo {
  mode: "single" | "hub";
  /** The hub's name, or the single project's workspace name. */
  name: string;
  projects: HubProject[];
  /** The catalog project's ID (hub mode with a catalog), or null. */
  catalog: string | null;
  /** The signed-in user may add projects and manage credentials (an architect, or sign-in is off). */
  canAdmin: boolean;
  loginRequired: boolean;
  me: SessionUser | null;
}

export interface HubProject {
  id: string;
  name: string;
  description: string;
  /** The project's folder relative to the hub (or the folder itself in single mode). */
  path: string;
  /** Set when the project's model cannot be loaded. */
  error: string | null;
  /** The hub's shared catalog. */
  catalog: boolean;
  /** The signed-in user's role in this project (null when sign-in is off). */
  role: Role | null;
}

/** A small picture of a project's landscape: boxes and lines in a 0..w × 0..h space. */
export interface Thumb {
  w: number;
  h: number;
  boxes: { x: number; y: number; w: number; h: number; kind: string; external: boolean }[];
  lines: [number, number, number, number][];
}

export interface ProjectCard {
  id: string;
  name: string;
  description: string;
  error: string | null;
  catalog: boolean;
  counts: { people: number; systems: number; containers: number; components: number; relationships: number; flows: number; decisions: number };
  /** Elements linked to the shared catalog. */
  linked: number;
  drafts: { open: number; behind: number };
  problems: { errors: number; warnings: number };
  lastCommit: { sha: string; date: string; author: string; subject: string } | null;
  thumb: Thumb | null;
}

/** Something on the home page that asks for a look, with where to go. */
export interface AttentionItem {
  kind: "errors" | "warnings" | "draft-behind" | "decision" | "catalog-drift" | "catalog-missing" | "multi-writer" | "unknown-asset";
  severity: "error" | "warn" | "info";
  project: string;
  text: string;
  target: { type: "diagram" | "decision" | "draft" | "element" | "catalog"; id: string } | null;
}

/** A revisit trigger still open, or a decision date coming up. */
export interface WatchItem {
  project: string;
  decision: string;
  title: string;
  kind: "trigger" | "review" | "decide" | "expires";
  text: string;
  /** YYYY-MM-DD for dates; null for triggers. */
  date: string | null;
}

export interface HomeSummary {
  name: string;
  mode: "single" | "hub";
  projects: ProjectCard[];
  attention: AttentionItem[];
  watch: WatchItem[];
  /** The most recent decisions of every project, newest date first. */
  decisions: (DecisionSummary & { project: string })[];
  /** Shared elements and data assets (hub with a catalog); null otherwise. */
  shared: { elements: number; linkedCopies: number; assets: number; sharedAssets: number; multiWriter: number } | null;
  /** Catalog changes copied into the projects since the server started, newest first (DEC-057). */
  catalogUpdates: CatalogUpdate[];
}

/** A catalog element's change, copied into the projects that use it. */
export interface CatalogUpdate {
  /** ISO time. */
  at: string;
  catalogId: string;
  name: string;
  fields: string[];
  /** The projects whose copy was updated, with the copy's ID there. */
  projects: { project: string; elementId: string }[];
}

// ------------------------------------------------------------------ shared catalog and data (DEC-055)

/** A catalog element and the projects that have a linked copy of it. */
export interface SharedElementUse {
  catalogId: string;
  name: string;
  kind: Kind;
  technology: string;
  data: number;
  usedBy: { project: string; elementId: string; drift: string[] }[];
}

/** One data asset (a table, topic, ...) and who reads and writes it, across projects. */
export interface AssetUse {
  key: string;
  name: string;
  kind: DataKind;
  description: string;
  owner: string;
  sensitive: boolean;
  /** Defined on a catalog element (shared by design) rather than in one project. */
  shared: boolean;
  /** The element that holds it: a catalog element, or a project's own element. */
  holder: { name: string; catalogId: string | null; project: string | null; elementId: string | null };
  access: { project: string; elementId: string; elementName: string; mode: "read" | "write"; relationshipId: string }[];
  /** Distinct projects that use it / write it. */
  projects: number;
  writers: number;
  flags: ("used-by-several" | "several-writers")[];
}

export interface SharedUsage {
  mode: "single" | "hub";
  elements: SharedElementUse[];
  assets: AssetUse[];
  /** Linked copies whose name, description or technology differ from the catalog. */
  drift: { project: string; elementId: string; name: string; catalogId: string; fields: string[] }[];
  /** Linked copies of catalog elements that no longer exist. */
  missing: { project: string; elementId: string; name: string; catalogId: string }[];
  /** Access to data the element at the other end does not have. */
  unknown: { project: string; relationshipId: string; asset: string; holder: string }[];
}

/** A catalog element, for the "link to the catalog" pickers. */
export interface CatalogEntry {
  id: string;
  name: string;
  kind: Kind;
  description: string;
  technology: string;
  parentId: string | null;
  parentName: string | null;
  data: DataAsset[];
}

// ------------------------------------------------------------------ integration credentials (DEC-056)

export const CREDENTIAL_PROVIDERS = ["github", "gitlab", "jira", "issue-tracker", "observability", "llm", "ci", "other"] as const;
export type CredentialProvider = (typeof CREDENTIAL_PROVIDERS)[number];

/** A stored credential as the API shows it: never its value. */
export interface CredentialInfo {
  name: string;
  provider: CredentialProvider;
  scopes: string[];
  note: string;
  created: string;
  updated: string;
  lastUsed: string | null;
  /** The value's last four characters, masked: "••••abcd" (shorter values: "••••"). */
  hint: string;
  /** Stored encrypted (DP_SECRET_KEY). */
  encrypted: boolean;
  /** Encrypted with a key this server does not have: it cannot be used until DP_SECRET_KEY is set right. */
  locked: boolean;
}

export interface CredentialList {
  credentials: CredentialInfo[];
  /** New and rotated values are encrypted (DP_SECRET_KEY is set). */
  encryptsNew: boolean;
  /** Where they are kept, relative to the hub or project folder. */
  file: string;
}

// ------------------------------------------------------------------ history (DEC-058)

/** One changed object in a commit, as the history lists it. */
export interface HistoryItem {
  type: ObjectChange["type"];
  name: string;
  change: Exclude<ChangeKind, "inner">;
}

/** A project's part of one commit: what changed in its main model. */
export interface HistoryChange {
  project: string;
  /** The commit's parent (null: the first commit), to open the comparison. */
  parent: string | null;
  summary: ChangeSummary;
  /** Up to 12 changed objects. */
  items: HistoryItem[];
}

export interface HistoryEntry {
  sha: string;
  /** ISO 8601. */
  date: string;
  author: string;
  subject: string;
  changes: HistoryChange[];
}

export interface HistoryList {
  /** Per project: whether it is in a git repository, and what is not committed yet (main model vs HEAD). */
  projects: { project: string; git: boolean; uncommitted: ChangeSummary | null }[];
  /** Newest first. */
  commits: HistoryEntry[];
}

// ------------------------------------------------------------------ linked work status from GitHub (DEC-059)

export interface WorkRefresh {
  /** GitHub issue and pull request links looked up. */
  checked: number;
  updated: { owner: string; title: string; from: string; to: string }[];
  failed: { url: string; reason: string }[];
  /** A stored GitHub credential was used (otherwise public repositories only, at GitHub's lower rate). */
  usedCredential: string | null;
}
