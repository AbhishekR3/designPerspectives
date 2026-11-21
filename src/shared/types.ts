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
  type: string; // security | pr | issue | backlog | update | quality
  title: string;
  url?: string;
  status: string; // open | in-progress | blocked | done
  severity?: string; // critical | high | medium | low
  note?: string;
  /** A stable id given by the tool that pushed it ("sonar:AYx…", a SARIF fingerprint); a push matches on it, then on `url`. */
  key?: string;
  /** The tool's own status, as last read: "Merged", "In Review", "Quality gate failed · 3 vulnerabilities". */
  remote?: string;
  /** When `remote` was read (ISO 8601). */
  checked?: string;
}

/** What linked work is pinned to (WRK-02): the targets of comments and checklist items, plus the project
 *  itself. A flow is a diagram (`flow-<name>`). Diagram items need a stored view: landscape, context,
 *  container, component diagrams and flows (not connector or code diagrams). */
export type WorkTarget = CommentTarget | { type: "project" };

/** Tools whose links get a live status (WRK-01, WRK-02). */
export const WORK_TOOLS = ["github", "gitlab", "sonar", "jira"] as const;
export type WorkToolId = (typeof WORK_TOOLS)[number];
export const WORK_TOOL_LABEL: Record<WorkToolId, string> = { github: "GitHub", gitlab: "GitLab", sonar: "SonarQube", jira: "Jira" };

/** A place links are read from, as everyone may see it: no credential. `base` is the origin plus any path
 *  prefix (a GitLab or Jira under a path), without a trailing slash. */
export interface WorkConnectionInfo {
  id: string;
  tool: WorkToolId;
  base: string;
  /** Shipped with dp (github.com, gitlab.com, sonarcloud.io), not from the integrations file. */
  builtIn: boolean;
}

/** One connection in `.dp/integrations.json` (architects only). */
export interface WorkConnection {
  id: string;
  tool: WorkToolId;
  /** https (http only for this machine), no user, query or fragment. */
  baseUrl: string;
  /** Name of a stored credential (SEC-06); none: public data only. */
  credential?: string;
  /** "basic" sends the credential value `user:token` (Jira Cloud: email and API token); default "bearer". */
  auth?: "bearer" | "basic";
}
export interface IntegrationsSettings {
  connections: WorkConnection[];
  builtIn: WorkConnectionInfo[];
  /** The file, for people (relative to the project or hub folder). */
  file: string;
}

/** One linked work item with what it is pinned to: a row of the Work page and `dp work list`. */
export interface WorkRow {
  target: WorkTarget;
  /** For people: the element's name, "Source → Destination", the diagram or flow title, or "Project". */
  label: string;
  /** Kind of the target, for filters: an element kind, "relationship", "diagram", "flow" or "project". */
  targetKind: string;
  /** Its place in the target's list. */
  index: number;
  item: WorkItem;
  /** The tool its link belongs to (by the known connections), or null. */
  tool: WorkToolId | null;
}
export interface WorkList {
  rows: WorkRow[];
  connections: WorkConnectionInfo[];
}

/** One item a tool or a script pushes (POST /api/work/items, `dp work add`, `dp work import`). */
export interface WorkPush {
  to: WorkTarget;
  item: Partial<WorkItem> & { title?: string };
}
export const WORK_IMPORT_FORMATS = ["sarif", "gitlab-codequality", "sonar-issues", "dp"] as const;
export type WorkImportFormat = (typeof WORK_IMPORT_FORMATS)[number];
export interface WorkPushResult {
  added: number;
  updated: number;
  /** Items of the same source that this run no longer reports, set to done (`closeMissing`). */
  closed: number;
  unchanged: number;
  rows: { to: WorkTarget; label: string; title: string; change: "added" | "updated" | "closed" | "unchanged" }[];
  /** Import only: findings whose file no element's code paths hold, pinned to the project. */
  unmapped?: number;
  /** Nothing was written (`--check`, `dryRun`). */
  dryRun?: boolean;
}
/** One of dp's four severities, or "" for none. */
export type WorkSeverityChoice = "critical" | "high" | "medium" | "low" | "";

/**
 * How dp turns a tool's own severity words into its four levels (WRK-04). Kept in the sidecar as
 * `work.severity`, so a team can change it and the change is drafted and reviewed like the rest of the model.
 * Names are matched in lower case. A name not in a table gives no severity.
 */
export interface WorkSeverityMaps {
  /** SARIF `security-severity` scores (0-10): at or above `critical` is critical, and so on; below `medium` is low. */
  sarifScore: { critical: number; high: number; medium: number };
  /** SARIF result levels (`error`, `warning`, `note`, `none`), used when a finding has no score. */
  sarifLevel: Record<string, WorkSeverityChoice>;
  /** GitLab Code Quality severities (`dp work import --format gitlab-codequality`). */
  codeQuality: Record<string, WorkSeverityChoice>;
  /** SonarQube severities and impact severities: the `sonar-issues` import and the status refresh. */
  sonar: Record<string, WorkSeverityChoice>;
  /** Jira priority names (a site can have its own): the status refresh. */
  jira: Record<string, WorkSeverityChoice>;
}
export type WorkSeverityTable = Exclude<keyof WorkSeverityMaps, "sarifScore">;
export const WORK_SEVERITY_TABLES: readonly WorkSeverityTable[] = ["sarifLevel", "codeQuality", "sonar", "jira"];
export const DEFAULT_WORK_SEVERITY: WorkSeverityMaps = {
  sarifScore: { critical: 9, high: 7, medium: 4 },
  sarifLevel: { error: "high", warning: "medium", note: "low", none: "low" },
  codeQuality: { blocker: "critical", critical: "critical", major: "high", minor: "medium", info: "low" },
  sonar: { blocker: "critical", critical: "critical", high: "high", major: "high", medium: "medium", minor: "medium", low: "low", info: "low" },
  jira: { highest: "critical", high: "high", medium: "medium", low: "low", lowest: "low" },
};

/** Open linked work across the projects a person may see (GET /api/hub/work): the hub's Work page. */
export interface HubWorkRow extends WorkRow {
  project: string;
}
export interface HubWorkList {
  projects: { id: string; name: string; catalog: boolean; error: string | null; open: number; total: number }[];
  rows: HubWorkRow[];
  connections: WorkConnectionInfo[];
  /** The work types and statuses, for labels and filters (a hub page has no project state). */
  types: { id: string; label: string }[];
  statuses: string[];
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
  /** Corners set by hand (canvas units, the inner points of the route, at most 50). When set they win over `control` and the planned route. */
  points?: Pt[];
  labelT?: number;
  labelOffset?: number;
  routing?: "straight" | "curved" | "smooth" | "orthogonal" | "rounded";
}

/** Kinds of data held by an element (a database's tables, a broker's topics, ...); HUB-06. */
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
  /** The address this runs at (http/https, host and port; `dp.run.url`), where an intercept point of the testing mode forwards to; "" when not set. */
  runUrl: string;
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
  /** Code diagram: an element outside the code shown (a neighbour at the other end of a relationship), drawn faded. */
  outside?: boolean;
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
  /** Code diagram, a relationship to a neighbour: whether the file at the code end was set on the relationship, guessed from imports, or is not known (the line ends at the element's own box). */
  codeEnd?: "set" | "guessed" | "unknown";
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
  /** Linked work pinned to the flow itself (WRK-02). */
  work: WorkItem[];
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
  /** Linked work pinned to this diagram (WRK-02); absent where a diagram cannot hold any (connector, code). */
  work?: WorkItem[];
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
  /** A file in the source element's code where this relationship leaves it (`dp.code.from`), or "". Normally under one of the source's code paths. */
  codeFrom: string;
  /** A file in the destination element's code where this relationship arrives (`dp.code.to`), or "". Normally under one of the destination's code paths. */
  codeTo: string;
  work: WorkItem[];
  /** Sample of the data that travels along this relationship (for a connector with stages: the data entering the first stage). */
  example: string;
  format: string;
  /** HTTP calls that travel along this relationship, so a call seen in a running system can be matched to it. */
  endpoints: Endpoint[];
  /** Data of the element at either end that this relationship reads or writes. */
  dataAccess: DataAccess[];
}

/** An HTTP call pattern: method ("*" for any) and a path ("/api/accounts/:id", "*" matches the rest) or a full URL. */
export interface Endpoint {
  method: string;
  path: string;
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
  /** Open linked work pinned to this diagram itself (not to what it shows). */
  openWork?: number;
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
  /** Scan the code and bring an import file in as a new draft (architects and engineers; COD-02). */
  import: boolean;
  /** Open intercept points and pause, change or answer live calls in the testing mode (architects and engineers; not on a --read-only server). */
  test: boolean;
  /** Add, change, tick and delete checklist items (architects and engineers; not on a --read-only server; REC-05). */
  checklist: boolean;
}

// ------------------------------------------------------------------ decision records (REC-04)

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

// ------------------------------------------------------------------ comments (REC-01)

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
  /** Only for a thread about a diagram: where its note sits on that diagram, in canvas units (not Structurizr units). */
  position?: { x: number; y: number };
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

// ------------------------------------------------------------------ the checklist (REC-05)

/** A thing to do, a question to answer, or an assumption to confirm or correct. */
export const CHECKLIST_KINDS = ["task", "question", "assumption"] as const;
export type ChecklistKind = (typeof CHECKLIST_KINDS)[number];
export const CHECKLIST_KIND_LABEL: Record<ChecklistKind, string> = { task: "Task", question: "Question", assumption: "Assumption" };
/** `skipped`: does not apply, or nobody knows; it no longer counts as open. */
export const CHECKLIST_STATUSES = ["open", "done", "skipped"] as const;
export type ChecklistStatus = (typeof CHECKLIST_STATUSES)[number];
/** Where an item came from: typed by a person, a starter list, or the questions and assumptions of an import file. */
export type ChecklistSource = "person" | "starter" | "bmo";

/** What dp can check itself; an item with a rule ticks itself while the rule passes (checklistRules.ts). */
export const CHECKLIST_RULES = [
  "people",
  "containers",
  "descriptions",
  "technology",
  "labels",
  "code-paths",
  "decisions",
  "flows",
  "model-errors",
  "intake",
  "scan",
  "level-c1",
  "level-c2",
  "level-c3",
  "review",
  "unmapped",
] as const;
export type ChecklistRule = (typeof CHECKLIST_RULES)[number];

/** The result of a rule for the version shown. `ids`: the elements and relationships that fail it (at most 50). */
export interface ChecklistCheck {
  passing: boolean;
  count: number;
  detail: string;
  ids: string[];
}

export interface ChecklistItem {
  id: string;
  kind: ChecklistKind;
  /** The heading it is listed under. */
  section: string;
  text: string;
  /** For an item with a rule, the status shown: done while the rule passes (unless skipped), open while it fails. */
  status: ChecklistStatus;
  /** What a person wrote: the answer to a question, a correction of an assumption, a note on a task. */
  answer?: string;
  answeredBy?: string;
  answeredAt?: string;
  /** What it is about, when it is about one object or diagram. */
  target?: CommentTarget;
  rule?: ChecklistRule;
  source: ChecklistSource;
  /** Starter items: the key in the starter lists (adding a list again skips the keys already there). */
  starter?: string;
  /** BMO items: the import draft whose file asked it. */
  draft?: string;
  author: string;
  at: string;
  doneBy?: string;
  doneAt?: string;
  /** Set by the server for the version shown: the rule's result. */
  check?: ChecklistCheck;
  /** Set by the server for the version shown: the target is not in it. */
  missing?: boolean;
}

export interface ChecklistStarter {
  id: string;
  title: string;
  description: string;
  /** How many of its items are already on the checklist. */
  added: number;
  total: number;
}

export interface ChecklistResponse {
  items: ChecklistItem[];
  starters: ChecklistStarter[];
  summary: {
    open: number;
    done: number;
    skipped: number;
    total: number;
    /** Open questions and assumptions from BMO. */
    fromBmo: number;
  };
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
  /** Linked work pinned to the project itself (WRK-02). */
  projectWork: WorkItem[];
  /** Where links get a live status (WRK-02), to label links by tool; no credentials. */
  workConnections: WorkConnectionInfo[];
  /** How tools' severities become dp's (WRK-04): the sidecar's `work.severity`, or the defaults. */
  workSeverity: WorkSeverityMaps;
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
  /** Whether the requesting user may change this draft: its model, planned code, title, description,
   *  branch and link (set in GET /api/state). With sign-in on, engineers change only drafts they started. */
  canEdit?: boolean;
}

export interface ApplyPreview {
  changes: ChangeSet;
  conflicts: Conflict[];
  /** Planned code edits that Apply writes to the code folder (when asked to). */
  code: { path: string; change: "added" | "changed" | "deleted" }[];
  /** An import draft with review items that are not accepted: they stay in the draft (`changes` leaves them out). */
  held?: ApplyHeld;
}

/** What a partial apply of an import draft keeps in the draft. */
export interface ApplyHeld {
  /** Review items that are not accepted and change something in the draft. */
  items: number;
  /** Changes held back only because they depend on a held item (an accepted component inside a held
   *  container, a flow over a held relationship, ...): what, and why. */
  dependent: Conflict[];
  /** Nothing would reach the main model: Apply is refused until an item is accepted. */
  nothingAccepted: boolean;
}

/** What `Drafts.apply` did. */
export interface ApplyOutcome {
  /** True when the draft stays (a partial apply of an import draft); false when it was applied whole and removed. */
  kept: boolean;
  /** Review items left in the draft. */
  held: number;
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

// ------------------------------------------------------------------ home page and hub (HUB-03, HUB-04)

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
  /** The server was started read-only: everyone is a viewer here, whatever role the users file gives. */
  readOnly: boolean;
}

/** The 409 answer of `POST /api/hub/projects` when the folder already holds a model; sending `adopt: true` uses that model. */
export interface ExistingModelAnswer {
  detail: string;
  existing: true;
  folder: string;
  workspaceName: string;
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
  /** Catalog changes copied into the projects since the server started, newest first (HUB-07). */
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

// ------------------------------------------------------------------ shared catalog and data (HUB-06)

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

// ------------------------------------------------------------------ integration credentials (SEC-06)

/** "anthropic", "openai" and "ollama": the LLM backends BMO calls directly (COD-02); "llm" is any other. */
export const CREDENTIAL_PROVIDERS = ["github", "gitlab", "jira", "sonarqube", "issue-tracker", "observability", "llm", "anthropic", "openai", "ollama", "ci", "other"] as const;
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

// ------------------------------------------------------------------ history (DRF-06)

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

// ------------------------------------------------------------------ linked work status from GitHub (WRK-01)

export interface WorkRefresh {
  /** Links looked up, all tools together. */
  checked: number;
  updated: { owner: string; title: string; from: string; to: string }[];
  failed: { url: string; reason: string }[];
  /** Per connection used: how many links, and the stored credential (null: public data only). */
  byTool: { tool: WorkToolId; base: string; checked: number; credential: string | null }[];
  /** Links that no connection knows; they keep the status a person gave them. */
  unknown: number;
}

// ------------------------------------------------------------------ import file (COD-02, Stage B)

/** One problem found in an import file: where it is (a JSON pointer, RFC 6901, "" = the whole file) and what is wrong. */
export interface FieldError {
  pointer: string;
  message: string;
}

export const IMPORT_LEVELS = ["c1", "c2", "c3", "all"] as const;
export type ImportLevel = (typeof IMPORT_LEVELS)[number];
export const IMPORT_OBJECT_TYPES = ["person", "system", "container", "component"] as const;
export type ImportObjectType = (typeof IMPORT_OBJECT_TYPES)[number];
export const IMPORT_CONFIDENCE = ["high", "medium", "low"] as const;
export type ImportConfidence = (typeof IMPORT_CONFIDENCE)[number];
export const IMPORT_SOURCES = ["bmo", "script", "hand"] as const;
export type ImportSourceKind = (typeof IMPORT_SOURCES)[number];

/** Why the file says something. Review only: never written to the model. */
export type ImportEvidence = { kind: "file"; path: string; lines?: [number, number]; text?: string } | { kind: "user"; note: string } | { kind: "scan"; fact: string };

export interface ImportObject {
  /** The model ID (a slug: `isCleanId`). An ID already in the model means that object. */
  id: string;
  type: ImportObjectType;
  name: string;
  external?: boolean;
  /** Containers: a system's ID; components: a container's ID (in the file or the model). */
  parent?: string;
  description?: string;
  technologies?: string[];
  archType?: string;
  owner?: string;
  /** Tag group name to value; both must exist in the project's tag groups. */
  tags?: Record<string, string>;
  codePaths?: string[];
  evidence?: ImportEvidence[];
  confidence?: ImportConfidence;
}

export interface ImportRelationship {
  /** Explicit model ID; leave out for `<source>--<target>`. Not allowed with `via`. */
  id?: string;
  source: string;
  target: string;
  /** What flows, e.g. "Sends payment requests"; never "uses". */
  description: string;
  technologies?: string[];
  kind?: string;
  /** The broker (queue, topic) that carries it: two relationships, source→via and via→target. */
  via?: string;
  /** The label of via→target (required with `via`). */
  viaDescription?: string;
  codePaths?: string[];
  evidence?: ImportEvidence[];
  confidence?: ImportConfidence;
}

export interface ImportFlow {
  title: string;
  description?: string;
  /** `relationship`: a relationship's ID in the file or the model, or `<source>--<target>` of a file relationship (a `via` leg too). */
  steps: { relationship: string; note?: string }[];
}

export interface ImportDecision {
  title: string;
  status: "proposed";
  context: string;
  decision: string;
  alternatives?: { name: string; whyNot?: string }[];
  /** Element and relationship IDs (as for flow steps). */
  affects?: string[];
  evidence?: ImportEvidence[];
}

/** An import file, schema version 1 (src/import/schema.ts holds the JSON Schema). */
export interface ImportFile {
  schemaVersion: 1;
  promptVersion?: string;
  level: ImportLevel;
  source?: { kind: ImportSourceKind; backend?: string; model?: string };
  objects: ImportObject[];
  relationships: ImportRelationship[];
  flows?: ImportFlow[];
  decisions?: ImportDecision[];
  ignore?: string[];
  questions?: string[];
  assumptions?: string[];
}

/** What a field of an existing object did on import. */
export type ImportKeptReason = "your-edit" | "not-empty" | "catalog" | "exists";

export interface ImportReportItem {
  id: string;
  what: "element" | "relationship" | "flow" | "decision";
  name: string;
  /** Fields written (created, updated) or concerned. */
  fields: string[];
}

export interface ImportKept {
  id: string;
  what: ImportReportItem["what"];
  name: string;
  field: string;
  reason: ImportKeptReason;
  message: string;
}

/** What an import did to the draft, per object. */
export interface ImportReport {
  created: ImportReportItem[];
  updated: ImportReportItem[];
  /** Fields (or whole flows and decisions) left as the model has them. */
  kept: ImportKept[];
  /** Objects an earlier import wrote, at this file's level, that this file does not mention. Never deleted. */
  notInImport: ImportReportItem[];
  /** Objects the file names whose values the model already has. */
  unchanged: number;
}

export interface ImportCheck {
  errors: FieldError[];
  warnings: FieldError[];
}

// ------------------------------------------------------------------ import review (COD-02, Stage B)

/** Computed by the tool from evidence it can check (src/import/review.ts), never taken from the file's `confidence`. */
export const REVIEW_LEVELS = ["verified", "partly", "unverified"] as const;
export type ReviewLevel = (typeof REVIEW_LEVELS)[number];
export const REVIEW_DECISIONS = ["pending", "accepted", "rejected"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];
export type ReviewItemKind = "object" | "relationship" | "flow" | "decision";

/**
 * One check behind a review level:
 * - `scan-fact`: a cited scan fact is in evidence.json (and its file is still there);
 * - `user-note`: stated by the user;
 * - `manifest-path`: a manifest (package.json, Dockerfile, compose, ...) found by the scan sits at a mapped code path;
 * - `manifest-service`: the scan found a dependency, image or host of a known service with the item's name;
 * - `file-exists`, `lines-exist`, `text-found`: a cited file, its lines, and the item's name or the quoted text in them;
 * - `import-edge`: for a relationship between two components with mapped code, an import from one's code to the other's;
 * - `flow-step`: the level of each step of a flow;
 * - `no-evidence`: nothing was cited.
 */
export type ReviewRule = "scan-fact" | "user-note" | "manifest-path" | "manifest-service" | "file-exists" | "lines-exist" | "text-found" | "import-edge" | "flow-step" | "no-evidence";

export interface ReviewCheck {
  rule: ReviewRule;
  ok: boolean;
  path?: string;
  line?: number;
  note?: string;
}

/** The review of one item of an import draft. Key: `object:<id>`, `relationship:<id>`, `flow:<flow key>`, `decision:<slug>`. */
export interface ReviewItem {
  kind: ReviewItemKind;
  /** The name shown (object name, relationship label, flow or decision title) when last checked. */
  name: string;
  /** Where the item is in the import file (JSON pointer). */
  pointer: string;
  level: ReviewLevel;
  checks: ReviewCheck[];
  decision: ReviewDecision;
  /** Who accepted or rejected it. */
  by?: string;
  /** Typed guidance for the next BMO turn, stored as written. */
  feedback?: string;
}

/** `architecture/import/reviews/<draftId>.json`. */
export interface ReviewState {
  schemaVersion: 1;
  /** sha1 of `architecture/import/files/<draftId>.json`, the import file the draft was made from. */
  importFileSha1: string;
  /** The import file's revision (1 for the first; a revised file from BMO counts up). */
  revision: number;
  items: Record<string, ReviewItem>;
  draftFeedback?: string;
}

// ------------------------------------------------------------------ import: scan, intake, analysis, handoff (COD-02, Stage B)

/** The C4 levels the scan and the analysis count: c4 is the files. */
export type ScanLevel = "c1" | "c2" | "c3" | "c4";
export type IntakeDepth = ScanLevel;

/** A system in the shipped list of known services, or one the intake adds. */
export interface KnownService {
  match: { npm?: string[]; pypi?: string[]; go?: string[]; image?: string[]; host?: string[] };
  /** The external system's name, as it would appear on a diagram. */
  system: string;
  /** A short category: payments, identity, email, sms, analytics, search, maps, llm, feature-flags, monitoring, error-tracking, database, cache, queue, object-storage. */
  category: string;
  /** The `dp.archType` the object would get (database, cache, queue, storage, cloud, service). */
  archType?: string;
}

export interface IntakeSettings {
  /** Files walked before the scan stops (the rest is recorded in `limits`). */
  maxFiles: number;
  /** Bytes of one file that are parsed; larger files are listed in `limits`, not parsed. */
  maxFileBytes: number;
  /** Folder depth below the code root. */
  maxDepth: number;
  /** Component candidates are folders up to this depth below a container's source root. */
  componentDepth: number;
  /** A folder is a component candidate when it holds at least this many source files directly. */
  componentMinFiles: number;
  /** Assumed review time per item (a guess, not measured). */
  secondsPerItem: number;
  /** The recommendation rules recommend "step by step" above these numbers. */
  stepByStep: { files: number; containers: number; passes: number };
  /** Tokens one BMO pass can read (a backend setting). */
  passBudgetTokens: number;
}

/** The answers to the questions the code cannot give: `architecture/import/intake.json`. */
export interface Intake {
  schemaVersion: 1;
  system: { name: string; purpose: string };
  audience: string;
  scope: { include: string[]; exclude: string[]; otherRepos: string[] };
  depth: IntakeDepth;
  ownership: string;
  runtime: string;
  glossary: { term: string; means: string }[];
  /** Globs of files and folders the scan and BMO must not open. */
  mustNotOpen: string[];
  /** Extra or overriding known services; looked at before the shipped list. */
  services: KnownService[];
  settings: IntakeSettings;
}

export interface IntakeError {
  /** A field path such as `settings.maxFiles` or `scope.include[1]`; "" for the file as a whole. */
  path: string;
  message: string;
}

/** One thing the scan found, with the file it comes from. `id` is `kind:path:name`; an import file cites it as `{"kind": "scan", "fact": id}`. */
export interface ScanFact {
  id: string;
  level: ScanLevel;
  kind: string;
  name: string;
  path: string;
  line?: number;
  detail?: string;
  /** The external system a known-services match names (C1 and C2 facts). */
  system?: string;
}

/** A scan cap that was hit (never silent). */
export interface ScanLimit {
  kind: string;
  path?: string;
  detail: string;
}

/** What the import page needs of `evidence.json` (the facts themselves stay on the server). */
export interface EvidenceSummary {
  /** Facts per level. */
  facts: Record<ScanLevel, number>;
  files: {
    total: number;
    byLanguage: Record<string, number>;
    /** Source files in languages whose imports are not read, by language. */
    notAnalysable: Record<string, number>;
    binary: number;
    /** Folders and files left out by a rule. */
    skipped: number;
  };
  /** Folder-to-folder import edges found. */
  imports: number;
  notParsed: { path: string; reason: string }[];
  limits: ScanLimit[];
}

export type LevelState = "not started" | "in progress" | "final" | "stopped here";

export interface AnalysisCandidate {
  /** `c1:system:Stripe`, `c1:host:api.acme.com`, `c1:webhook:/webhooks/x`, `c2:<slug>`, `c3:<folder>`. */
  id: string;
  level: ScanLevel;
  /** For C1: system, host, webhook. For C2 the main fact kind. C3: component-dir. */
  kind: string;
  name: string;
  /** Files (C3: the folder) the evidence comes from. */
  paths: string[];
  /** Bytes of those files (C3: of the source files in the folder). */
  bytes: number;
  status: "accepted" | "ignored" | "left";
  /** The model object that decided it. */
  matchedBy?: string;
  factIds: string[];
}

export interface LevelAnalysis {
  level: ScanLevel;
  state: LevelState;
  /** False for levels deeper than the intake's depth: not counted in the totals. */
  inScope: boolean;
  candidates: number;
  accepted: number;
  ignored: number;
  /** accepted + ignored */
  decided: number;
  /** Candidates not decided yet. */
  undecided: number;
  /** Model objects of this level with no description. */
  needDescription: number;
  /** Relationships of this level with no label or the label "uses". */
  needLabel: number;
  /** undecided + needDescription + needLabel. */
  left: number;
  /** decided / (decided + left), as a whole percent. */
  percent: number;
  /** True when files in languages whose imports are not read hide edges, so the percent is a ceiling (C3). */
  percentIsCeiling: boolean;
  lowConfidence: number;
  /** Review items: left + low-confidence. 0 for C4. */
  effortItems: number;
  reviewMinutes: number;
  /** Bytes BMO would read for the level (all its candidates). */
  bytes: number;
  tokens: number;
  passes: number;
  items: AnalysisCandidate[];
  /** C4 only: files not under any element's code path and not ignored (the first 200, sorted), and how many there are. */
  unmapped?: string[];
  unmappedTotal?: number;
}

export interface AnalysisRule {
  rule: string;
  fired: boolean;
  value: number;
  threshold: number;
}

/** The import readiness analysis (`architecture/import/analysis.json`): what is decided, what is left, what it would cost. */
export interface Analysis {
  schemaVersion: 1;
  depth: IntakeDepth;
  levels: LevelAnalysis[];
  totals: {
    candidates: number;
    decided: number;
    left: number;
    percent: number;
    effortItems: number;
    reviewMinutes: number;
    tokens: number;
    passes: number;
    /** Intake questions the file leaves empty (counted as left). */
    intakeUnanswered: string[];
    /** C4: files outside every component, an upper bound until C3 is final. */
    unmappedFiles: number;
  };
  recommendation: { mode: "step-by-step" | "one-go"; rules: AnalysisRule[] };
  /** What the scan cannot see, in words. */
  cannotSee: string[];
  /** Final levels whose earlier levels are not decided. */
  broken: string[];
}

export type BmoTaskId = "import-level" | "describe-to-model" | "explain" | "decision-from-draft" | "draft-summary" | "challenge" | "suggest-labels" | "ask";
export type BmoTaskOutput = "import-file" | "text" | "decision";

/** `architecture/import/handoff/handoff.json`: which task and prompt the handoff folder is for. */
export interface HandoffManifest {
  task: BmoTaskId;
  promptVersion: string;
  output: BmoTaskOutput;
  /** sha1 over the system and user text. */
  hash: string;
  files: string[];
}

/** The import handoff just written: the manifest, the prompt text for "Copy prompt", where the files are and the line for the coding agent. */
export interface HandoffOffer extends HandoffManifest {
  prompt: string;
  /** The folder, relative to the project folder. */
  folder: string;
  /** The one line to give a coding agent. */
  instruction: string;
  estTokens: number;
}

/** What `GET /api/import` says about an import draft. */
export interface ImportDraftSummary {
  draftId: string;
  title: string;
  author: string | null;
  byLevel: Record<ReviewLevel, number>;
  byDecision: Record<ReviewDecision, number>;
  /** Pending items whose level is unverified: they need an explicit accept. */
  lowConfidence: number;
  total: number;
}

/** The import page's state (`GET /api/import`; the scan, intake, ignore and level routes answer with it too). evidence and analysis are null before the first scan. */
export interface ImportOverview {
  evidence: EvidenceSummary | null;
  analysis: Analysis | null;
  intake: Intake;
  intakeErrors: IntakeError[];
  state: { ignore: string[]; levels: Record<ScanLevel, boolean> };
  handoff: HandoffManifest | null;
  importDrafts: ImportDraftSummary[];
}

/** `GET /api/import/example`: the demo's ready-to-paste import file; `available` only when it passes the check against this project. */
export interface ImportExample {
  available: boolean;
  text: string;
}

/** `POST /api/import/file` and a handoff result that was accepted: the new draft. */
export interface ImportDraftResult {
  draftId: string;
  report: ImportReport;
  warnings: FieldError[];
  /** How many of the file's questions and assumptions were added to the checklist (REC-05). */
  checklistAdded: number;
}

/** `GET /api/import/review` (the draft selected by X-DP-Model). */
export interface ImportReviewResponse {
  review: ReviewState;
  /** Pending items that are unverified, in key order. */
  lowConfidenceKeys: string[];
  lowConfidence: number;
}

/** The answer of an item action: the review afterwards, and for a reject what was reset in the draft. */
export interface ReviewActionResult {
  review: ReviewState;
  reverted: string[];
  alsoRejected: string[];
}

export interface AcceptAllResult {
  review: ReviewState;
  accepted: string[];
  skipped: string[];
}

/** `POST /api/drafts/:id/apply`: `kept` and `held` are set when an import draft stayed with items not accepted. */
export interface ApplyResponse extends ApplyOutcome {
  ok: true;
}

// ------------------------------------------------------------------ BMO routes (COD-02, owner answers 3 and 4)

export type BmoProvider = "anthropic" | "openai" | "ollama";

/** `.dp/bmo.json` as the settings route reads and writes it (never holds a key: `credential` is a name). */
export interface BmoSettingsData {
  enabled: boolean;
  backend: "handoff" | "direct";
  provider?: BmoProvider;
  model?: string;
  endpoint?: string;
  allowCustomEndpoint?: boolean;
  credential?: string;
  allowedRoles: Role[];
  projects?: Record<string, { allowedRoles: Role[] }>;
  passBudgetTokens: number;
  maxOutputTokens?: number;
  timeoutSeconds: number;
  pricePerMTok?: { input: number; output: number };
  keepPrompts: boolean;
  anthropicFallback: boolean;
}

export interface BmoTaskInfo {
  id: BmoTaskId;
  title: string;
  output: BmoTaskOutput;
}

/** `GET /api/bmo` and `PUT /api/bmo/settings`: the settings without anything secret, and what the caller may do. */
export interface BmoStatus {
  enabled: boolean;
  backend: "handoff" | "direct";
  provider: BmoProvider | null;
  model: string | null;
  /** Host (and port) the prompt would go to, or null. */
  host: string | null;
  /** The stored credential's name, never its value or hint. */
  credential: string | null;
  hasCredential: boolean;
  allowedRoles: Role[];
  passBudgetTokens: number;
  maxOutputTokens: number | null;
  timeoutSeconds: number;
  pricePerMTok: { input: number; output: number } | null;
  /** May the caller run BMO now (settings and role), and if not, why. */
  canRun: { ok: boolean; reason?: string };
  /** May the caller change the settings (architects, not on a read-only server). */
  canAdmin: boolean;
  tasks: BmoTaskInfo[];
  /** A test backend is plugged in by the server's code (no model, no network); the settings are not consulted except for roles. */
  fake: boolean;
  /** The settings file is not valid (the defaults are shown); null when it is fine. */
  problem: string | null;
  /** The whole settings object, for architects who edit it (PUT replaces it as a whole); null for everyone else. */
  settings: BmoSettingsData | null;
}

/** One file excerpt in a prompt. */
export interface BmoSentFile {
  path: string;
  bytes: number;
  lines: number;
  redactions: number;
}

export interface BmoCost {
  input: number;
  output: number;
  total: number;
}

/** `POST /api/bmo/preview`: exactly what a run would send, and where. `hash` must be sent back with the run. */
export interface BmoPreview {
  task: BmoTaskId;
  output: BmoTaskOutput;
  promptVersion: string;
  hash: string;
  estTokens: number;
  /** The most input tokens a run takes (a prompt over it is refused as too large), or null. */
  maxInputTokens: number | null;
  destination: { provider: string | null; model: string | null; host: string | null };
  files: BmoSentFile[];
  /** Values hidden in the prompt's data blocks. */
  redactions: number;
  system: string;
  user: string;
  /** From the prices the person entered, for the input tokens only; null without prices. */
  estCost: BmoCost | null;
  /** The ask task only: what the question carries besides itself. */
  ask?: BmoAskInfo;
}

/** The limits of an `ask` request (the server refuses more; the chat sends the latest turns that fit). */
export const BMO_ASK_LIMITS = {
  /** Characters of the question. */
  questionChars: 4000,
  /** Objects referenced in one question. */
  refs: 10,
  /** Earlier turns sent back. */
  turns: 6,
  /** Characters of one earlier turn. */
  turnChars: 6000,
  /** Characters of all earlier turns together. */
  historyChars: 16000,
} as const;

/** One earlier turn of a chat with BMO, as the person saw it: their own message or BMO's answer. */
export interface BmoTurn {
  role: "you" | "bmo";
  text: string;
}

/** What an `ask` preview carries besides the question: the objects attached, the context and what was left out. */
export interface BmoAskInfo {
  /** The referenced objects whose details are attached, in the order given. */
  objects: { id: string; name: string; kind: string }[];
  /** "objects": only the objects; "diagram": no object named, the diagram being viewed is sent; "overview": neither, a short overview of the model. */
  context: "objects" | "diagram" | "overview";
  /** Earlier turns sent, of those given. */
  history: { sent: number; given: number };
  /** What was left out (to stay within the size limit, or because the rules closed it), in words. */
  trimmed: string[];
}

/** What every run result reports besides its output. */
export interface BmoRunInfo {
  usage: { inputTokens?: number; outputTokens?: number } | null;
  model: string | null;
  /** From the prices the person entered and the usage the provider reported; null without either. */
  estCost: BmoCost | null;
}

/** `POST /api/bmo/run`: text goes to the caller only (not stored); an import file becomes a draft; a decision is written into the selected draft as proposed. */
export type BmoRunResult = BmoRunInfo &
  ({ output: "text"; text: string } | ({ output: "import-file" } & ImportDraftResult) | { output: "decision"; decision: { id: string; file: string; title: string } });

/** The 422 answer when the answer cannot be used: nothing was repaired; `pasteBack` is the text to send back to BMO. */
export interface BmoRunFailure {
  detail: string;
  errors: FieldError[];
  pasteBack: string;
  warnings?: FieldError[];
}

/** The 409 answer of a run whose preview is out of date (the model, the code or the settings changed since): `stale` tells it
 *  apart from the other 409s (BMO turned off, a settings problem), which say their own reason in `detail`. */
export interface BmoStaleFailure {
  detail: string;
  stale: true;
}

// ------------------------------------------------------------------ system testing mode (RUN-06)

/**
 * A local port of dp that a calling service is pointed at instead of the real target. Calls that arrive are
 * forwarded to `target`, and can be paused, changed or answered on the way. It covers every relationship from
 * the calling service to the same target address (`members`): a caller has one base URL per target.
 */
export interface InterceptPoint {
  id: string;
  /** The relationship it was opened from; a call that matches no endpoint is put down to this one. */
  relationshipId: string;
  /** Set when the point stands in front of one stage of the relationship's pipeline. */
  stageId?: string;
  members: string[];
  callerId: string;
  /** The element whose address the point forwards to. */
  targetElementId: string;
  target: string;
  port: number | null;
  /** The base URL to put in the caller's settings (null while the point is not open). */
  url: string | null;
  /** "saved": its port is remembered, but nothing listens until someone starts it. */
  state: "open" | "saved" | "error";
  error?: string;
}

export interface BreakpointCondition {
  /** `body.<dotted path>`, `header.<name>`, `query.<name>`, `status`, `method` or `path`. */
  field: string;
  op: "=" | "!=" | "contains" | ">" | "<" | "exists";
  value: string;
}

export type BreakpointTarget = { type: "relationship" | "element"; id: string } | { type: "step"; flow: string; order: string } | { type: "stage"; relationshipId: string; stageId: string };

export interface Breakpoint {
  id: string;
  on: BreakpointTarget;
  /** Pause the request on its way out, the reply on its way back, or both. A step breakpoint follows its step instead. */
  phase: "request" | "response" | "both";
  method?: string;
  path?: string;
  conditions: BreakpointCondition[];
  enabled: boolean;
}

/** A request or a reply as shown in the browser: secret-looking values are "•••" (`masked` lists where). */
export interface CallMessage {
  method?: string;
  /** Path and query of a request. */
  path?: string;
  status?: number;
  headers: [string, string][];
  /** The text of the body; null when it is binary, absent, or no longer kept. */
  body: string | null;
  bodyKind: "json" | "form" | "text" | "binary" | "none" | "dropped";
  bytes: number;
  masked: string[];
}

export type TestCallState = "held-request" | "forwarded" | "held-response" | "done" | "dropped" | "replied" | "passed" | "failed";

/** One call that came through an intercept point (a row of the run log). */
export interface TestCall {
  id: string;
  seq: number;
  pointId: string;
  relationshipId: string;
  stageId?: string;
  method: string;
  path: string;
  /** The endpoint of the relationship the call matched; null when the model has none for it. */
  endpoint: Endpoint | null;
  /** For a call that matched nothing: an endpoint to add to the relationship. */
  suggested: Endpoint | null;
  state: TestCallState;
  /** Why it was not paused, how it was released, or what went wrong. */
  note?: string;
  start: number;
  durationMs: number | null;
  status: number | null;
  traceId: string | null;
  /** The call this one repeats (Resend). */
  resentFrom?: string;
  edited: boolean;
  /** Who released it. */
  by?: string;
  /** When a held call is released by itself (milliseconds since 1970). */
  heldUntil?: number;
  breakpointId?: string;
}

export interface TestCallDetail extends TestCall {
  request: CallMessage;
  response: CallMessage | null;
}

export interface Watch {
  id: string;
  /** As in a breakpoint condition: `body.<path>`, `header.<name>`, `query.<name>`, `status`. */
  field: string;
}

export interface TestingOptions {
  /** A held call is released unchanged after this many seconds. */
  holdSeconds: number;
}

export interface TestingState {
  available: boolean;
  /** Why the mode is not available here. */
  reason?: string;
  version: number;
  points: InterceptPoint[];
  breakpoints: Breakpoint[];
  watches: Watch[];
  /** The run log, oldest first. */
  calls: TestCall[];
  /** IDs of the calls that are paused, oldest first. */
  held: string[];
  /** True while the next call that arrives will be paused. */
  stepping: boolean;
  options: TestingOptions;
  /** Per watch ID: the value in each call that has one (request first, then the reply). */
  watchValues: Record<string, { callId: string; value: string }[]>;
}

/** What a person does with a paused call. */
export type ReleaseAction =
  | { do: "continue"; request?: Partial<CallMessage>; pauseOnReply?: boolean; step?: boolean }
  | { do: "drop" }
  | { do: "reply"; status: number; headers?: [string, string][]; body?: string; delayMs?: number }
  | { do: "continue-response"; response?: Partial<CallMessage>; step?: boolean };
