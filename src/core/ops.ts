/**
 * Model index and edit operations on a Structurizr workspace.
 *
 * All edits made through the UI go through these functions, so the rules live in one place:
 * - IDs are readable slugs (e.g. "api-application"). Structurizr only requires IDs to be unique
 *   (structurizr-core SequentialIntegerIdGeneratorStrategy: "any non-numeric IDs are ignored").
 * - Names must be unique among people + software systems, among containers of one system, and
 *   among components of one container (structurizr-core Model.hydrate).
 * - Relationship descriptions must be unique per source/destination pair.
 * - Technology is a list of tags, stored in Structurizr's `technology` field as "A, B, C".
 * - IDs do not change on rename, except on request (`reslug`) for an element whose ID is still the
 *   slug of its old name: the first rename right after creation (`reslugElement`).
 * - Containers and components can move to another parent of the right kind (`moveElement`); they
 *   keep their ID, children and relationships.
 *
 * designPerspectives data stored on elements (and relationships) as Structurizr properties:
 *   dp.owner         owner (free text)                          elements
 *   dp.links         extra links, JSON [{"label","url"}]        elements
 *   dp.tag.<Group>   value in a tag group, e.g. dp.tag.Risk=High elements
 *   dp.archType      symbol/type (database, queue, ...)          elements
 *   dp.notes         free-form notes                             elements, relationships
 *   dp.details       JSON [{"title","columns","rows"}] tables    elements (connection info, columns, ...)
 *   dp.tradeoffs     JSON [{"kind","text"}]                      elements
 *   dp.usage         JSON [{"users","frequency","volume"}]       elements
 *   dp.sensitive     JSON [{"item","level"}]                     elements, relationships
 *   dp.characteristics JSON [{"name","rating","driving","note"}] elements; rating 1-5 per characteristic
 *   dp.cost          JSON [{"item","monthly","note"}]            elements; monthly cost line items
 *   dp.work          JSON [{"type","title","url","status","severity","note"}]  elements, relationships;
 *                    linked work: security issues, pull requests, issues, backlog items, required updates
 *   dp.code.paths    JSON ["path/relative/to/code/root", ...]    elements, relationships
 *   dp.kind          connector kind (data-pipeline, ...)         relationships
 *   dp.stages        JSON [{"id","name","technologies",...,"example","format"}]  relationships;
 *                    a stage's example is the data leaving that stage
 *   dp.example       sample of the data on the relationship      relationships (text, max EXAMPLE_MAX chars)
 *   dp.format        what that data is (JSON, CSV row, ...)       relationships
 *   dp.endpoints     JSON [{"method","path"}]                  relationships; HTTP calls it carries (live UI inspector)
 *   dp.ui.url        where the UI runs (http/https)               elements; opened by the live UI inspector
 *   dp.otel.service  service.name in trace files                  elements; when it differs from the ID and name
 */

import path from "node:path";
import { inlineJson, isObj, round2, str, type Obj } from "./json.js";
import { STYLE_KEYS, type Sidecar } from "./sidecar.js";
import { tagsFor, VIEW_LISTS, type Element, type Kind, type Relationship, type Workspace } from "./workspace.js";
import type { CostItem, DetailTable, ElementSummary, Endpoint, Enums, Rating, Relationship as RelationshipSummary, SensitiveItem, Stage, Style, Tradeoff, Usage, WorkItem } from "../shared/types.js";

export const OWNER_KEY = "dp.owner";
export const LINKS_KEY = "dp.links";
export const TAG_PREFIX = "dp.tag.";
export const ARCH_KEY = "dp.archType";
export const NOTES_KEY = "dp.notes";
export const TRADEOFFS_KEY = "dp.tradeoffs";
export const USAGE_KEY = "dp.usage";
export const SENSITIVE_KEY = "dp.sensitive";
export const CODE_KEY = "dp.code.paths";
export const KIND_KEY = "dp.kind";
export const STAGES_KEY = "dp.stages";
export const EXAMPLE_KEY = "dp.example";
export const FORMAT_KEY = "dp.format";
/** Longest sample payload kept on a relationship or stage. Samples explain the data, they are not fixtures. */
export const EXAMPLE_MAX = 8000;

export const ENDPOINTS_KEY = "dp.endpoints";
export const UI_URL_KEY = "dp.ui.url";
export const OTEL_SERVICE_KEY = "dp.otel.service";
const HTTP_METHODS = new Set(["*", "GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);

/** Endpoints from objects ({method, path}) or lines ("GET /api/accounts/:id", "/health" = any method). */
export function cleanEndpoints(items: unknown): Endpoint[] {
  const rows = Array.isArray(items) ? items : typeof items === "string" ? items.split("\n") : [];
  const out: Endpoint[] = [];
  const seen = new Set<string>();
  for (const x of rows) {
    let method: string;
    let p: string;
    if (typeof x === "string") {
      const parts = x.trim().split(/\s+/);
      if (!parts[0]) continue;
      [method, p] = parts.length > 1 ? [parts[0], parts.slice(1).join("")] : ["*", parts[0]];
    } else if (isObj(x)) {
      method = str(x.method).trim() || "*";
      p = str(x.path).trim();
    } else continue;
    method = method.toUpperCase();
    if (!HTTP_METHODS.has(method)) throw new ModelError(`"${method}" is not an HTTP method. Use GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS or *.`);
    if (!/^(\/|https?:\/\/)/.test(p)) throw new ModelError(`Endpoint "${p}" must start with "/" (a path) or "http://" / "https://" (a full URL).`);
    if (p.length > 500) throw new ModelError("An endpoint is at most 500 characters.");
    const key = `${method} ${p}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ method, path: p });
  }
  return out;
}

/** The URL a live UI runs at: http or https only. */
export function cleanUiUrl(value: unknown): string {
  const text = str(value).trim();
  if (!text) return "";
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    throw new ModelError(`"${text}" is not a URL. Use the address the UI runs at, e.g. http://localhost:3000/.`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new ModelError("The live UI address must start with http:// or https://.");
  if (u.username || u.password) throw new ModelError("The live UI address must not contain a user name or password.");
  return u.href;
}

/** A sample payload: blank lines at the ends dropped, refused when longer than EXAMPLE_MAX. */
export function cleanExample(value: unknown, what: string): string {
  const text = str(value).replace(/^\s*\n|\n\s*$/g, "").replace(/\s+$/, "");
  if (text.length > EXAMPLE_MAX) throw new ModelError(`The example data for ${what} is ${text.length} characters; the limit is ${EXAMPLE_MAX}. Keep one short, representative sample.`);
  return text;
}
export const DETAILS_KEY = "dp.details";
export const CHARS_KEY = "dp.characteristics";
export const WORK_KEY = "dp.work";
export const COST_KEY = "dp.cost";

export const WORK_TYPES: [string, string][] = [
  ["security", "Security issue"],
  ["pr", "Pull request"],
  ["issue", "Issue / bug"],
  ["backlog", "Backlog item"],
  ["update", "Required update"],
];
export const WORK_STATUSES = ["open", "in-progress", "blocked", "done"];
export const SEVERITIES = ["critical", "high", "medium", "low"];

export const ARCH_TYPES: [string, string][] = [
  ["box", "Box (generic)"],
  ["service", "Service / application"],
  ["web", "Web UI"],
  ["mobile", "Mobile app"],
  ["database", "Database"],
  ["cache", "Cache"],
  ["queue", "Queue / stream"],
  ["pipeline", "Pipeline / job"],
  ["storage", "Object / file storage"],
  ["cloud", "Cloud service"],
  ["document", "Document / file"],
];
export const SENSITIVITY = ["public", "internal", "confidential", "restricted"];
export const FREQUENCIES = ["rarely", "monthly", "weekly", "daily", "hourly", "continuous"];
export const TRADEOFF_KINDS = ["benefit", "cost", "risk"];
export const CONNECTOR_KINDS: [string, string][] = [
  ["sync-api", "Synchronous API (REST / RPC)"],
  ["async-message", "Message / event"],
  ["stream", "Streaming"],
  ["data-pipeline", "Data pipeline (ETL / ELT)"],
  ["batch", "Batch job"],
  ["db-connection", "Database connection"],
  ["file-transfer", "File transfer"],
  ["cloud-service", "Cloud service call"],
  ["other", "Other"],
];
export const ENUMS: Enums = {
  archTypes: ARCH_TYPES.map(([id, label]) => ({ id, label })),
  sensitivity: SENSITIVITY,
  frequencies: FREQUENCIES,
  tradeoffKinds: TRADEOFF_KINDS,
  connectorKinds: CONNECTOR_KINDS.map(([id, label]) => ({ id, label })),
  workTypes: WORK_TYPES.map(([id, label]) => ({ id, label })),
  workStatuses: WORK_STATUSES,
  severities: SEVERITIES,
};

export const SUGGESTED_TECH = [
  "Python",
  "Java",
  "Kotlin",
  "TypeScript",
  "JavaScript",
  "Go",
  "Rust",
  "C#",
  ".NET",
  "Ruby",
  "PHP",
  "SQL",
  "React",
  "Angular",
  "Vue",
  "Spring Boot",
  "Spring MVC",
  "FastAPI",
  "Django",
  "Flask",
  "Node.js",
  "Express",
  "PostgreSQL",
  "MySQL",
  "Oracle",
  "SQL Server",
  "MongoDB",
  "DynamoDB",
  "Redis",
  "Elasticsearch",
  "Snowflake",
  "Kafka",
  "RabbitMQ",
  "SQS",
  "SNS",
  "Kinesis",
  "Pub/Sub",
  "Airflow",
  "Spark",
  "dbt",
  "Flink",
  "HTTPS",
  "REST",
  "JSON",
  "gRPC",
  "GraphQL",
  "WebSocket",
  "SQL/TCP",
  "AMQP",
  "SFTP",
  "SMTP",
  "AWS Lambda",
  "AWS S3",
  "AWS Glue",
  "Azure Functions",
  "GCP Cloud Run",
  "Docker",
  "Kubernetes",
  "Terraform",
];

/** An edit that would break the model's rules. Shown to the user as-is. */
export class ModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelError";
  }
}

// --------------------------------------------------------------------------- index

export class Index {
  readonly elements = new Map<string, Element>();
  readonly kind = new Map<string, Kind>();
  readonly parent = new Map<string, string | null>();
  readonly children = new Map<string, string[]>();
  readonly relationships = new Map<string, Relationship>();
  readonly relOwner = new Map<string, string>();

  constructor(readonly ws: Workspace) {}

  el(id: string): Element {
    const e = this.elements.get(id);
    if (!e) throw new ModelError(`No element with ID "${id}".`);
    return e;
  }

  rel(id: string): Relationship {
    const r = this.relationships.get(id);
    if (!r) throw new ModelError(`No relationship with ID "${id}".`);
    return r;
  }

  kindOf(id: string): Kind {
    return this.kind.get(id)!;
  }

  parentOf(id: string): string | null {
    return this.parent.get(id) ?? null;
  }

  childrenOf(id: string): string[] {
    return this.children.get(id) ?? [];
  }

  top(id: string): string {
    let cur = id;
    while (this.parent.get(cur)) cur = this.parent.get(cur)!;
    return cur;
  }

  /** The element itself, then its parent, grandparent, ... */
  ancestors(id: string): string[] {
    const out = [id];
    while (this.parent.get(out[out.length - 1]!)) out.push(this.parent.get(out[out.length - 1]!)!);
    return out;
  }

  descendants(id: string): string[] {
    const out: string[] = [];
    const stack = [...this.childrenOf(id)];
    while (stack.length) {
      const e = stack.pop()!;
      out.push(e);
      stack.push(...this.childrenOf(e));
    }
    return out;
  }

  isExternal(id: string): boolean {
    return this.elements.get(this.top(id))?.location === "External";
  }
}

export function buildIndex(ws: Workspace): Index {
  const idx = new Index(ws);
  const add = (el: Element, kind: Kind, parent: string | null) => {
    if (idx.elements.has(el.id)) throw new ModelError(`Two elements share the ID "${el.id}".`);
    idx.elements.set(el.id, el);
    idx.kind.set(el.id, kind);
    idx.parent.set(el.id, parent);
    if (!idx.children.has(el.id)) idx.children.set(el.id, []);
    if (parent) idx.children.get(parent)!.push(el.id);
    for (const r of el.relationships) {
      if (idx.relationships.has(r.id)) throw new ModelError(`Two relationships share the ID "${r.id}".`);
      idx.relationships.set(r.id, r);
      idx.relOwner.set(r.id, el.id);
    }
  };
  for (const p of ws.model.people) add(p, "person", null);
  for (const s of ws.model.softwareSystems) {
    add(s, "softwareSystem", null);
    for (const c of s.containers ?? []) {
      add(c, "container", s.id);
      for (const k of c.components ?? []) add(k, "component", c.id);
    }
  }
  return idx;
}

// --------------------------------------------------------------------------- helpers

export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "element";
}

export function unique(base: string, taken: Set<string> | Map<string, unknown>, sep = "-"): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}${sep}${n}`)) n++;
  return `${base}${sep}${n}`;
}

/** Names that a new/renamed element of this kind must not reuse. */
export function siblingNames(idx: Index, kind: Kind, parentId: string | null, exclude?: string): Set<string> {
  const ids = kind === "person" || kind === "softwareSystem" ? [...idx.ws.model.people.map((p) => p.id), ...idx.ws.model.softwareSystems.map((s) => s.id)] : [...idx.childrenOf(parentId ?? "")];
  return new Set(ids.filter((i) => i !== exclude).map((i) => idx.elements.get(i)!.name));
}

type HasProps = { properties?: Record<string, string> | null };

export function getProps(el: HasProps): Record<string, string> {
  return { ...(el.properties ?? {}) };
}

export function setProp(el: HasProps, key: string, value: string | null | undefined): void {
  const props = getProps(el);
  if (value === null || value === undefined || value === "") delete props[key];
  else props[key] = value;
  el.properties = Object.keys(props).length ? props : null;
}

export function getJson<T = Obj>(el: HasProps | undefined | null, key: string): T[] {
  if (!el) return [];
  const raw = getProps(el)[key];
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? (data as T[]) : [];
  } catch {
    return [];
  }
}

export function setJson(el: HasProps, key: string, value: unknown[] | null): void {
  setProp(el, key, value && value.length ? inlineJson(value) : null);
}

export function elementTags(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(getProps(el))) if (k.startsWith(TAG_PREFIX)) out[k.slice(TAG_PREFIX.length)] = v;
  return out;
}

export function elementLinks(el: Element): { label: string; url: string }[] {
  return getJson(el, LINKS_KEY)
    .filter(isObj)
    .map((x) => ({ label: str(x.label), url: str(x.url) }));
}

export function splitTech(value: unknown): string[] {
  const items = Array.isArray(value) ? value : str(value).split(",");
  const out: string[] = [];
  for (const t0 of items) {
    const t = str(t0).trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

export function joinTech(value: unknown): string | null {
  return splitTech(value).join(", ") || null;
}

const asRows = (items: unknown): Obj[] => {
  if (items === null || items === undefined) return [];
  if (!Array.isArray(items)) throw new ModelError("Expected a list.");
  return items.map((x) => {
    if (!isObj(x)) throw new ModelError("Every row must be an object.");
    return x;
  });
};
const s = (v: unknown) => str(v).trim();
const blank = (v: unknown) => v === null || v === undefined || v === "";

// ---- cleaning of structured fields (throw ModelError with a readable message)

export function cleanTradeoffs(items: unknown): Tradeoff[] {
  const out: Tradeoff[] = [];
  for (const x of asRows(items)) {
    const text = s(x.text);
    if (!text) continue;
    const kind = x.kind ?? "benefit";
    if (!TRADEOFF_KINDS.includes(kind as string)) throw new ModelError(`Unknown tradeoff kind "${str(kind)}".`);
    out.push({ kind: kind as Tradeoff["kind"], text });
  }
  return out;
}

/** Free tables of extra information, e.g. connection details or a database's columns. */
export function cleanDetails(items: unknown): DetailTable[] {
  const out: DetailTable[] = [];
  for (const x of asRows(items)) {
    const title = s(x.title);
    const columns = (Array.isArray(x.columns) ? x.columns : []).map((c) => s(c));
    if (!title && !columns.length) continue;
    if (!columns.length || columns.some((c) => !c)) throw new ModelError(`Details table "${title}" needs a name for every column.`);
    const rows: string[][] = [];
    for (const r of Array.isArray(x.rows) ? x.rows : []) {
      const cells = (Array.isArray(r) ? r : []).slice(0, columns.length).map((c) => str(c));
      while (cells.length < columns.length) cells.push("");
      if (cells.some((c) => c.trim())) rows.push(cells);
    }
    out.push({ title: title || "Details", columns, rows });
  }
  return out;
}

export function cleanUsage(items: unknown): Usage[] {
  const out: Usage[] = [];
  for (const x of asRows(items)) {
    const users = s(x.users);
    if (!users) continue;
    const freq = x.frequency ?? "daily";
    if (!FREQUENCIES.includes(freq as string)) throw new ModelError(`Unknown usage frequency "${str(freq)}".`);
    const row: Usage = { users, frequency: freq as string };
    const volume = s(x.volume);
    if (volume) row.volume = volume;
    out.push(row);
  }
  return out;
}

function toInt(v: unknown): number | null {
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && /^\s*[+-]?\d+\s*$/.test(v)) return parseInt(v, 10);
  return null;
}

/** Ratings of architecture characteristics: 1 (weak) to 5 (strong), one row per characteristic. */
export function cleanCharacteristics(items: unknown, allowed: Set<string>): Rating[] {
  const out = new Map<string, Rating>();
  for (const x of asRows(items)) {
    const name = s(x.name);
    if (!name) continue;
    if (!allowed.has(name)) throw new ModelError(`"${name}" is not in the list of characteristics.`);
    let rating: number | null = null;
    if (!blank(x.rating)) {
      rating = toInt(x.rating);
      if (rating === null) throw new ModelError(`Rating of "${name}" must be a whole number from 1 to 5.`);
      if (rating < 1 || rating > 5) throw new ModelError(`Rating of "${name}" must be from 1 to 5.`);
    }
    const row: Rating = { name };
    if (rating !== null) row.rating = rating;
    if (x.driving) row.driving = true;
    const note = s(x.note);
    if (note) row.note = note;
    if (Object.keys(row).length > 1) out.set(name, row);
  }
  return [...out.values()];
}

function toFloat(v: unknown): number | null {
  if (blank(v)) return 0;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Monthly cost line items. Amounts are in the workspace currency (sidecar `cost.currency`). */
export function cleanCost(items: unknown): CostItem[] {
  const out: CostItem[] = [];
  for (const x of asRows(items)) {
    const item = s(x.item);
    if (!item && blank(x.monthly)) continue;
    if (!item) throw new ModelError("Every cost line needs a name.");
    const monthly = toFloat(x.monthly);
    if (monthly === null) throw new ModelError(`Cost of "${item}" must be a number.`);
    if (monthly < 0) throw new ModelError(`Cost of "${item}" cannot be negative.`);
    const row: CostItem = { item, monthly: round2(monthly) };
    const note = s(x.note);
    if (note) row.note = note;
    out.push(row);
  }
  return out;
}

/** Work linked to an object: a title, a type, a status, optionally a link, a severity and a note. */
export function cleanWork(items: unknown): WorkItem[] {
  const types = new Set(WORK_TYPES.map(([t]) => t));
  const out: WorkItem[] = [];
  for (const x of asRows(items)) {
    const title = s(x.title);
    const url = s(x.url);
    if (!title && !url) continue;
    const kind = str(x.type) || "issue";
    if (!types.has(kind)) throw new ModelError(`Unknown work type "${kind}".`);
    const status = str(x.status) || "open";
    if (!WORK_STATUSES.includes(status)) throw new ModelError(`Unknown status "${status}".`);
    if (url && !/^https?:\/\//i.test(url)) throw new ModelError(`Link "${url}" must start with http:// or https://.`);
    const row: WorkItem = { type: kind, title: title || url, status };
    if (url) row.url = url;
    const sev = str(x.severity);
    if (sev) {
      if (!SEVERITIES.includes(sev)) throw new ModelError(`Unknown severity "${sev}".`);
      row.severity = sev;
    }
    const note = s(x.note);
    if (note) row.note = note;
    out.push(row);
  }
  return out;
}

export function costTotal(el: HasProps): number {
  return round2(getJson<CostItem>(el, COST_KEY).reduce((a, x) => a + (Number(x.monthly) || 0), 0));
}

/** Own monthly cost plus the cost of everything inside the element. */
export function costRollup(idx: Index, elementId: string): number {
  const ids = [elementId, ...idx.descendants(elementId)];
  return round2(ids.reduce((a, i) => a + (idx.elements.has(i) ? costTotal(idx.elements.get(i)!) : 0), 0));
}

export function cleanSensitive(items: unknown): SensitiveItem[] {
  const out: SensitiveItem[] = [];
  for (const x of asRows(items)) {
    const item = s(x.item);
    if (!item) continue;
    const level = x.level ?? "confidential";
    if (!SENSITIVITY.includes(level as string)) throw new ModelError(`Unknown sensitivity level "${str(level)}".`);
    out.push({ item, level: level as string });
  }
  return out;
}

/** posixpath.normpath: collapse "." and "..", drop a trailing slash. */
export function normpath(p: string): string {
  if (p === "") return ".";
  let n = path.posix.normalize(p);
  if (n.length > 1 && n.endsWith("/")) n = n.slice(0, -1);
  return n;
}

export function cleanPaths(paths: unknown): string[] {
  const out: string[] = [];
  if (paths !== null && paths !== undefined && !Array.isArray(paths)) throw new ModelError("Code paths must be a list.");
  for (const p0 of (paths as unknown[]) ?? []) {
    const p = str(p0).trim().replace(/\\/g, "/");
    if (!p) continue;
    const norm = normpath(p);
    if (norm.startsWith("/") || norm === ".." || norm.startsWith("../") || /^[A-Za-z]:/.test(norm)) {
      throw new ModelError(`Code paths must be inside the code folder: "${p}".`);
    }
    if (!out.includes(norm)) out.push(norm);
  }
  return out;
}

export function maxSensitivity(items: SensitiveItem[]): string | null {
  let best: string | null = null;
  for (const x of items) {
    if (SENSITIVITY.includes(x.level) && (best === null || SENSITIVITY.indexOf(x.level) > SENSITIVITY.indexOf(best))) best = x.level;
  }
  return best;
}

export function cleanStages(items: unknown, idx: Index): Stage[] {
  const out: Stage[] = [];
  const taken = new Set<string>();
  const archIds = new Set(ARCH_TYPES.map(([a]) => a));
  for (const x of asRows(items)) {
    const name = s(x.name);
    if (!name) throw new ModelError("Every stage needs a name.");
    let sid = s(x.id) || slugify(name);
    sid = unique(sid, taken);
    taken.add(sid);
    const elem = str(x.elementId) || null;
    if (elem && !idx.elements.has(elem)) throw new ModelError(`Stage "${name}" links to an element that does not exist.`);
    const stage: Stage = { id: sid, name };
    const techs = splitTech("technologies" in x ? x.technologies : x.technology);
    if (techs.length) stage.technologies = techs;
    const desc = s(x.description);
    if (desc) stage.description = desc;
    if (elem) stage.elementId = elem;
    const arch = str(x.archType);
    if (arch) {
      if (!archIds.has(arch)) throw new ModelError(`Unknown type "${arch}".`);
      stage.archType = arch;
    }
    const example = cleanExample(x.example, `stage "${name}"`);
    if (example) stage.example = example;
    const format = s(x.format);
    if (format) stage.format = format;
    out.push(stage);
  }
  return out;
}

// ---- summaries

/** Flat description of one element, as the UI uses it. */
export function elementSummary(idx: Index, elementId: string): ElementSummary {
  const el = idx.el(elementId);
  const props = getProps(el);
  const techs = splitTech(el.technology);
  const sensitive = getJson<SensitiveItem>(el, SENSITIVE_KEY);
  return {
    id: el.id,
    kind: idx.kindOf(el.id),
    name: el.name,
    description: el.description || "",
    technology: techs.join(", "),
    technologies: techs,
    url: el.url || "",
    owner: props[OWNER_KEY] ?? "",
    links: elementLinks(el),
    tags: elementTags(el),
    archType: props[ARCH_KEY] ?? "",
    notes: props[NOTES_KEY] ?? "",
    details: getJson<DetailTable>(el, DETAILS_KEY),
    tradeoffs: getJson<Tradeoff>(el, TRADEOFFS_KEY),
    usage: getJson<Usage>(el, USAGE_KEY),
    sensitive,
    sensitivityLevel: maxSensitivity(sensitive),
    codePaths: getJson<string>(el, CODE_KEY),
    characteristics: getJson<Rating>(el, CHARS_KEY),
    work: getJson<WorkItem>(el, WORK_KEY),
    cost: getJson<CostItem>(el, COST_KEY),
    costTotal: costTotal(el),
    costRollup: costRollup(idx, el.id),
    parentId: idx.parentOf(el.id),
    external: idx.isExternal(el.id),
    location: el.location ?? null,
    childCount: idx.childrenOf(el.id).length,
    uiUrl: props[UI_URL_KEY] ?? "",
    otelService: props[OTEL_SERVICE_KEY] ?? "",
  };
}

export function relationshipSummary(r: Relationship): RelationshipSummary {
  const techs = splitTech(r.technology);
  const sensitive = getJson<SensitiveItem>(r, SENSITIVE_KEY);
  const props = getProps(r);
  return {
    id: r.id,
    sourceId: r.sourceId,
    destinationId: r.destinationId,
    description: r.description || "",
    technology: techs.join(", "),
    technologies: techs,
    kind: props[KIND_KEY] ?? "",
    notes: props[NOTES_KEY] ?? "",
    sensitive,
    sensitivityLevel: maxSensitivity(sensitive),
    stages: getJson<Stage>(r, STAGES_KEY),
    work: getJson<WorkItem>(r, WORK_KEY),
    codePaths: getJson<string>(r, CODE_KEY),
    example: props[EXAMPLE_KEY] ?? "",
    format: props[FORMAT_KEY] ?? "",
    endpoints: getJson<Endpoint>(r, ENDPOINTS_KEY),
  };
}

export function technologyCatalog(idx: Index): string[] {
  const seen = new Set<string>();
  for (const el of idx.elements.values()) for (const t of splitTech(el.technology)) seen.add(t);
  for (const r of idx.relationships.values()) {
    for (const t of splitTech(r.technology)) seen.add(t);
    for (const st of getJson<Stage>(r, STAGES_KEY)) for (const t of st.technologies ?? []) seen.add(t);
  }
  for (const t of SUGGESTED_TECH) seen.add(t);
  return [...seen];
}

// --------------------------------------------------------------------------- elements

const CHILD_KIND: Partial<Record<Kind, Kind>> = { softwareSystem: "container", container: "component" };
const DEFAULT_NAMES: Record<Kind, string> = {
  person: "New person",
  softwareSystem: "New system",
  container: "New container",
  component: "New component",
};
const KINDS: Kind[] = ["person", "softwareSystem", "container", "component"];

export interface NewElement {
  kind: string;
  name?: string | null;
  parentId?: string | null;
  description?: string | null;
  technology?: unknown;
  external?: boolean;
  archType?: string | null;
  /** A taken name gets a number ("Database 2") instead of an error. */
  uniqueName?: boolean;
}

export function createElement(ws: Workspace, spec: NewElement): string {
  const idx = buildIndex(ws);
  const kind = spec.kind as Kind;
  const parentId = spec.parentId || null;
  if (!KINDS.includes(kind)) throw new ModelError(`Unknown element type: ${spec.kind}`);
  if (kind === "person" || kind === "softwareSystem") {
    if (parentId) throw new ModelError("People and software systems have no parent.");
  } else {
    if (!parentId || !idx.elements.has(parentId)) throw new ModelError(`A ${kind} needs a parent.`);
    if (CHILD_KIND[idx.kindOf(parentId)] !== kind) {
      throw new ModelError(`A ${kind} must sit inside a ${kind === "container" ? "software system" : "container"}.`);
    }
  }
  const takenNames = siblingNames(idx, kind, parentId);
  let name = str(spec.name).trim();
  if (!name) name = unique(DEFAULT_NAMES[kind], takenNames, " ");
  else if (takenNames.has(name)) {
    if (!spec.uniqueName) throw new ModelError(`The name "${name}" is already used here.`);
    name = unique(name, takenNames, " ");
  }
  const taken = new Set([...idx.elements.keys(), ...idx.relationships.keys()]);
  const newId = unique(slugify(name), taken);
  const el: Element = {
    id: newId,
    name,
    description: spec.description || null,
    tags: tagsFor(kind),
    relationships: [],
  };
  if (kind === "person") {
    el.location = spec.external ? "External" : null;
    ws.model.people.push(el);
  } else if (kind === "softwareSystem") {
    el.location = spec.external ? "External" : null;
    el.containers = [];
    ws.model.softwareSystems.push(el);
  } else if (kind === "container") {
    el.technology = joinTech(spec.technology);
    el.components = [];
    const parent = idx.el(parentId!);
    (parent.containers ??= []).push(el);
  } else {
    el.technology = joinTech(spec.technology);
    const parent = idx.el(parentId!);
    (parent.components ??= []).push(el);
  }
  if (spec.archType) setArch(el, spec.archType);
  return newId;
}

/** Who a new element is connected to as it is created: `to` = a relationship from the new element
 *  to that one, `from` = a relationship from that one to the new element. */
export interface Connect {
  to?: string | null;
  from?: string | null;
  description?: string | null;
}

/** Create an element and, with `connect`, a relationship to or from an existing one, in one edit. */
export function createConnectedElement(ws: Workspace, spec: NewElement, connect: Connect = {}): { id: string; relationshipId: string | null } {
  if (connect.to && connect.from) throw new ModelError("Connect the new element to one element only (either to or from).");
  const other = connect.to || connect.from;
  if (other) buildIndex(ws).el(other);
  const id = createElement(ws, spec);
  if (!other) return { id, relationshipId: null };
  const [sourceId, destinationId] = connect.to ? [id, other] : [other, id];
  return { id, relationshipId: createRelationship(ws, { sourceId, destinationId, description: connect.description }) };
}

function setArch(el: Element, arch: unknown): void {
  const a = blank(arch) ? null : str(arch);
  if (a && !ARCH_TYPES.some(([id]) => id === a)) throw new ModelError(`Unknown type "${a}".`);
  setProp(el, ARCH_KEY, a === null || a === "box" ? null : a);
}

export interface UpdateOptions {
  /** Give the element a new ID from its new name if it still has the ID made from its old name
   *  (see `reslugElement`). Meant for the first rename right after creation. */
  reslug?: boolean;
}

function codeOwner(ws: Workspace, ownerId: string): Element | Relationship {
  const idx = buildIndex(ws);
  const owner = idx.elements.get(ownerId) ?? idx.relationships.get(ownerId);
  if (!owner) throw new ModelError(`No element or relationship with ID "${ownerId}".`);
  return owner;
}

/** Is `rel` already one of the object's code paths, or inside one of its mapped folders? */
export function codePathCovered(ws: Workspace, ownerId: string, rel: string): boolean {
  return getJson<string>(codeOwner(ws, ownerId), CODE_KEY).some((x) => rel === x || rel.startsWith(x.replace(/\/$/, "") + "/"));
}

/** Add a code path to an element or relationship. */
export function addCodePath(ws: Workspace, ownerId: string, rel: string): void {
  const owner = codeOwner(ws, ownerId);
  setJson(owner, CODE_KEY, cleanPaths([...getJson<string>(owner, CODE_KEY), rel]));
}

/** Change an element's fields. Returns the element's ID: a new one if `opts.reslug` re-slugged it. */
export function updateElement(ws: Workspace, sidecar: Sidecar, elementId: string, patch: Obj, opts: UpdateOptions = {}): string {
  const idx = buildIndex(ws);
  const el = idx.el(elementId);
  const kind = idx.kindOf(elementId);
  const oldName = el.name;

  if ("name" in patch) {
    const name = str(patch.name).trim();
    if (!name) throw new ModelError("Name cannot be empty.");
    if (siblingNames(idx, kind, idx.parentOf(elementId), elementId).has(name)) {
      throw new ModelError(`The name "${name}" is already used here.`);
    }
    el.name = name;
  }
  if ("description" in patch) el.description = str(patch.description) || null;
  if ("technology" in patch) {
    if (kind !== "container" && kind !== "component") throw new ModelError("Only containers and components have a technology.");
    el.technology = joinTech(patch.technology);
  }
  if ("url" in patch) el.url = str(patch.url) || null;
  if ("uiUrl" in patch) setProp(el, UI_URL_KEY, cleanUiUrl(patch.uiUrl) || null);
  if ("otelService" in patch) setProp(el, OTEL_SERVICE_KEY, str(patch.otelService).trim().slice(0, 200) || null);
  if ("owner" in patch) setProp(el, OWNER_KEY, str(patch.owner).trim() || null);
  if ("links" in patch) {
    const links = asRows(patch.links)
      .filter((x) => s(x.url))
      .map((x) => ({ label: s(x.label), url: s(x.url) }));
    setJson(el, LINKS_KEY, links);
  }
  if ("external" in patch) {
    if (kind !== "person" && kind !== "softwareSystem") throw new ModelError("Only people and software systems can be marked external.");
    el.location = patch.external ? "External" : null;
  }
  if ("archType" in patch) setArch(el, patch.archType);
  if ("notes" in patch) setProp(el, NOTES_KEY, str(patch.notes).replace(/^\n+|\n+$/g, "") || null);
  if ("details" in patch) setJson(el, DETAILS_KEY, cleanDetails(patch.details));
  if ("tradeoffs" in patch) setJson(el, TRADEOFFS_KEY, cleanTradeoffs(patch.tradeoffs));
  if ("usage" in patch) setJson(el, USAGE_KEY, cleanUsage(patch.usage));
  if ("sensitive" in patch) setJson(el, SENSITIVE_KEY, cleanSensitive(patch.sensitive));
  if ("codePaths" in patch) setJson(el, CODE_KEY, cleanPaths(patch.codePaths));
  if ("characteristics" in patch) {
    const allowed = new Set(sidecar.characteristics.map((c) => c.name));
    setJson(el, CHARS_KEY, cleanCharacteristics(patch.characteristics, allowed));
  }
  if ("cost" in patch) setJson(el, COST_KEY, cleanCost(patch.cost));
  if ("work" in patch) setJson(el, WORK_KEY, cleanWork(patch.work));
  if ("tags" in patch) {
    const tags = isObj(patch.tags) ? patch.tags : {};
    for (const [group, value] of Object.entries(tags)) {
      const g = sidecar.tagGroups.find((x) => x.name === group);
      if (!g) throw new ModelError(`No tag group named "${group}".`);
      if (value !== null && value !== undefined && !g.values.some((v) => v.name === value)) {
        throw new ModelError(`"${str(value)}" is not a value of tag group "${group}".`);
      }
      setProp(el, TAG_PREFIX + group, value === null || value === undefined ? null : str(value));
    }
  }
  if (opts.reslug && el.name !== oldName && isAutoId(elementId, oldName)) return reslugElement(ws, sidecar, elementId, el.name);
  return elementId;
}

// --------------------------------------------------------------------------- re-slugging a new element

/** Whether `id` is the ID `createElement` makes from `name` (its slug, possibly numbered: "database-2"). */
export function isAutoId(id: string, name: string): boolean {
  return numberedFrom(id, slugify(name));
}

/** `id` is `base`, or `base` with a number added by `unique` ("base-2"). */
function numberedFrom(id: string, base: string): boolean {
  return id === base || (id.startsWith(`${base}-`) && /^\d+$/.test(id.slice(base.length + 1)));
}

const ELEMENT_KEY_PREFIXES = ["context-", "containers-", "components-", "code-"];
const RELATIONSHIP_KEY_PREFIXES = ["connector-", "code-"];

/**
 * Give an element the ID made from `name` and rewrite every reference to the old one, so a box
 * created as "New system" and renamed right away does not keep the ID "new-system" for good.
 *
 * Relationship IDs made from the old ID (`<source>--<destination>`, possibly numbered) are renamed
 * too. References rewritten: relationship ends, connector stage links (`dp.stages`), every diagram
 * and flow view (key, scope, element and relationship lists), sidecar styles and layouts (diagram
 * keys and the IDs inside: elements, relationships, `derived:a->b`, `stage:`/`conn:` boxes).
 * If an old ID is still found anywhere afterwards (e.g. a deployment instance or another tool's
 * view refers to it), nothing is changed and the old ID is kept. Returns the element's ID.
 */
export function reslugElement(ws: Workspace, sidecar: Sidecar, oldId: string, name: string): string {
  const idx = buildIndex(ws);
  idx.el(oldId);
  const taken = new Set([...idx.elements.keys(), ...idx.relationships.keys()]);
  taken.delete(oldId);
  const newId = unique(slugify(name), taken);
  if (newId === oldId) return oldId;
  taken.add(newId);
  const ids = new Map([[oldId, newId]]);
  const swap = (x: string) => (x === oldId ? newId : x);
  for (const r of idx.relationships.values()) {
    if (r.sourceId !== oldId && r.destinationId !== oldId) continue;
    if (numberedFrom(r.id, `${r.sourceId}--${r.destinationId}`)) taken.delete(r.id);
  }
  for (const r of idx.relationships.values()) {
    if (r.sourceId !== oldId && r.destinationId !== oldId) continue;
    if (!numberedFrom(r.id, `${r.sourceId}--${r.destinationId}`)) continue;
    const next = unique(`${swap(r.sourceId)}--${swap(r.destinationId)}`, taken);
    taken.add(next);
    if (next !== r.id) ids.set(r.id, next);
  }

  const w = structuredClone(ws);
  const sc = structuredClone(sidecar);
  const mapId = (x: string) => ids.get(x) ?? x;
  const mapKey = (key: string) => {
    for (const p of new Set([...ELEMENT_KEY_PREFIXES, ...RELATIONSHIP_KEY_PREFIXES])) {
      if (key.startsWith(p) && ids.has(key.slice(p.length))) return p + mapId(key.slice(p.length));
    }
    return key;
  };
  const mapNode = (n: string) => {
    if (ids.has(n)) return mapId(n);
    if (n.startsWith("derived:") && n.includes("->")) {
      const rest = n.slice("derived:".length);
      const i = rest.indexOf("->");
      return `derived:${mapId(rest.slice(0, i))}->${mapId(rest.slice(i + 2))}`;
    }
    if (n.startsWith("stage:") || n.startsWith("conn:")) {
      const parts = n.split(":");
      parts[1] = mapId(parts[1] ?? "");
      return parts.join(":");
    }
    return n;
  };
  const mapRecord = <T>(rec: Record<string, T>, f: (k: string) => string) => Object.fromEntries(Object.entries(rec).map(([k, v]) => [f(k), v]));

  for (const el of buildIndex(w).elements.values()) {
    el.id = mapId(el.id);
    for (const r of el.relationships) {
      r.id = mapId(r.id);
      r.sourceId = mapId(r.sourceId);
      r.destinationId = mapId(r.destinationId);
      const stages = getJson<Stage>(r, STAGES_KEY);
      if (stages.some((st) => st.elementId === oldId)) {
        for (const st of stages) if (st.elementId === oldId) st.elementId = newId;
        setJson(r, STAGES_KEY, stages);
      }
    }
  }
  for (const list of VIEW_LISTS) {
    for (const v of w.views[list]) {
      v.key = mapKey(v.key);
      for (const f of ["softwareSystemId", "containerId", "elementId"] as const) if (typeof v[f] === "string") v[f] = mapId(v[f]);
      for (const e of v.elements) e.id = mapId(e.id);
      for (const r of v.relationships) r.id = mapId(r.id);
    }
  }
  sc.styles = mapRecord(sc.styles, mapNode);
  sc.layouts = mapRecord(sc.layouts, mapKey);
  for (const lay of Object.values(sc.layouts)) {
    lay.sizes = mapRecord(lay.sizes, mapNode);
    lay.positions = mapRecord(lay.positions, mapNode);
    lay.edges = mapRecord(lay.edges, mapNode);
  }

  // Anything still naming an old ID is a reference this function does not know: keep the old IDs.
  const text = JSON.stringify(w) + JSON.stringify(sc);
  for (const old of ids.keys()) if (text.includes(JSON.stringify(old))) return oldId;
  replaceContents(ws, w);
  replaceContents(sidecar, sc);
  return newId;
}

function replaceContents<T extends object>(target: T, source: T): void {
  for (const k of Object.keys(target)) delete (target as Record<string, unknown>)[k];
  Object.assign(target, source);
}

// --------------------------------------------------------------------------- moving an element

/**
 * Move a container to another software system, or a component to another container. The element
 * keeps its ID, children, properties and relationships. Refused when the new parent is of the wrong
 * kind, is the current parent, already has a child with the same name, or when a relationship of the
 * element (or of anything inside it) would then join an element and its own parent.
 *
 * Views are brought up to date by `syncViews` afterwards (as after every edit); stored positions and
 * sizes that no longer fit are dropped by `diagrams.moveWithLayout`, which the server uses.
 */
export function moveElement(ws: Workspace, elementId: string, parentId: string): void {
  const idx = buildIndex(ws);
  const el = idx.el(elementId);
  const kind = idx.kindOf(elementId);
  if (kind !== "container" && kind !== "component") throw new ModelError("Only containers and components can be moved to another parent.");
  const target = idx.elements.get(parentId);
  if (!target) throw new ModelError(`No element with ID "${parentId}".`);
  if (CHILD_KIND[idx.kindOf(parentId)] !== kind) {
    throw new ModelError(`A ${kind} must sit inside a ${kind === "container" ? "software system" : "container"}.`);
  }
  const oldParent = idx.parentOf(elementId)!;
  if (oldParent === parentId) throw new ModelError(`"${el.name}" is already inside "${target.name}".`);
  if (siblingNames(idx, kind, parentId).has(el.name)) throw new ModelError(`"${target.name}" already has a ${kind} named "${el.name}".`);
  const moving = new Set([elementId, ...idx.descendants(elementId)]);
  const above = new Set(idx.ancestors(parentId));
  for (const r of idx.relationships.values()) {
    const [a, b] = [r.sourceId, r.destinationId];
    if ((moving.has(a) && above.has(b)) || (moving.has(b) && above.has(a))) {
      const name = (id: string) => idx.elements.get(id)?.name ?? id;
      throw new ModelError(
        `"${el.name}" cannot move into "${target.name}": the relationship "${r.description || "(no description)"}" from "${name(a)}" to "${name(b)}" would then join an element and its own parent. Remove that relationship first.`,
      );
    }
  }
  const list = kind === "container" ? "containers" : "components";
  const from = idx.el(oldParent);
  from[list] = (from[list] ?? []).filter((x) => x.id !== elementId);
  (target[list] ??= []).push(el);
}

/** Copy one element (not its children or connections) next to the original. The copy keeps cost, tags
 *  and the rest, but not the code paths (it would map to the same files) or work items (they would be doubled). */
export function duplicateElement(ws: Workspace, sidecar: Sidecar, elementId: string): string {
  const idx = buildIndex(ws);
  const src = idx.el(elementId);
  const kind = idx.kindOf(elementId);
  const parent = idx.parentOf(elementId);
  const name = unique(`${src.name} copy`, siblingNames(idx, kind, parent), " ");
  const newId = createElement(ws, {
    kind,
    name,
    parentId: parent,
    description: src.description,
    technology: src.technology,
    external: src.location === "External",
  });
  const copy = buildIndex(ws).el(newId);
  copy.url = src.url ?? null;
  copy.properties = src.properties ? { ...src.properties } : null;
  setJson(copy, CODE_KEY, []);
  setJson(copy, WORK_KEY, []);
  if (sidecar.styles[elementId]) sidecar.styles[newId] = structuredClone(sidecar.styles[elementId]!);
  return newId;
}

/** Delete an element, its children, and every relationship touching any of them. */
export function deleteElement(ws: Workspace, elementId: string): Set<string> {
  const idx = buildIndex(ws);
  idx.el(elementId);
  const gone = new Set([elementId, ...idx.descendants(elementId)]);

  ws.model.people = ws.model.people.filter((p) => !gone.has(p.id));
  ws.model.softwareSystems = ws.model.softwareSystems.filter((x) => !gone.has(x.id));
  for (const sys of ws.model.softwareSystems) {
    sys.containers = (sys.containers ?? []).filter((c) => !gone.has(c.id));
    for (const c of sys.containers) c.components = (c.components ?? []).filter((k) => !gone.has(k.id));
  }
  const goneRels = new Set([...idx.relationships.values()].filter((r) => gone.has(r.sourceId) || gone.has(r.destinationId)).map((r) => r.id));
  dropRelationships(ws, goneRels);
  dropFromViews(ws, gone, goneRels);
  // Connector stages that linked to a deleted element keep their name but lose the link.
  for (const el of buildIndex(ws).elements.values()) {
    for (const r of el.relationships) {
      const stages = getJson<Stage>(r, STAGES_KEY);
      if (stages.some((st) => st.elementId && gone.has(st.elementId))) {
        for (const st of stages) if (st.elementId && gone.has(st.elementId)) delete st.elementId;
        setJson(r, STAGES_KEY, stages);
      }
    }
  }
  return gone;
}

// --------------------------------------------------------------------------- relationships

export interface NewRelationship {
  sourceId: string;
  destinationId: string;
  description?: string | null;
  technology?: unknown;
  kind?: string | null;
}

export function createRelationship(ws: Workspace, spec: NewRelationship): string {
  const idx = buildIndex(ws);
  const { sourceId, destinationId } = spec;
  for (const e of [sourceId, destinationId]) idx.el(e);
  if (sourceId === destinationId) throw new ModelError("An element cannot have a relationship with itself.");
  if (idx.ancestors(sourceId).includes(destinationId) || idx.ancestors(destinationId).includes(sourceId)) {
    throw new ModelError("Relationships between a parent and its own child are not allowed.");
  }
  const existing = new Set([...idx.relationships.values()].filter((r) => r.sourceId === sourceId && r.destinationId === destinationId).map((r) => r.description || ""));
  let description = str(spec.description).trim();
  if (!description) description = unique("Uses", existing, " ");
  else if (existing.has(description)) throw new ModelError(`A relationship "${description}" already exists between these two elements.`);

  const taken = new Set([...idx.relationships.keys(), ...idx.elements.keys()]);
  const relId = unique(`${sourceId}--${destinationId}`, taken);
  const rel: Relationship = {
    id: relId,
    sourceId,
    destinationId,
    description,
    technology: joinTech(spec.technology),
    tags: tagsFor("relationship"),
  };
  if (spec.kind) setKind(rel, spec.kind);
  idx.el(sourceId).relationships.push(rel);
  return relId;
}

function setKind(r: Relationship, kind: unknown): void {
  const k = blank(kind) ? null : str(kind);
  if (k && !CONNECTOR_KINDS.some(([id]) => id === k)) throw new ModelError(`Unknown connector kind "${k}".`);
  setProp(r, KIND_KEY, k);
}

export function updateRelationship(ws: Workspace, relId: string, patch: Obj): void {
  const idx = buildIndex(ws);
  const r = idx.rel(relId);
  if ("description" in patch) {
    const description = str(patch.description).trim();
    const clash = [...idx.relationships.values()].some((o) => o.id !== relId && o.sourceId === r.sourceId && o.destinationId === r.destinationId && (o.description || "") === description);
    if (clash) throw new ModelError(`A relationship "${description}" already exists between these two elements.`);
    r.description = description || null;
  }
  if ("technology" in patch) r.technology = joinTech(patch.technology);
  if ("kind" in patch) setKind(r, patch.kind);
  if ("notes" in patch) setProp(r, NOTES_KEY, str(patch.notes).replace(/^\n+|\n+$/g, "") || null);
  if ("sensitive" in patch) setJson(r, SENSITIVE_KEY, cleanSensitive(patch.sensitive));
  if ("codePaths" in patch) setJson(r, CODE_KEY, cleanPaths(patch.codePaths));
  if ("stages" in patch) setJson(r, STAGES_KEY, cleanStages(patch.stages, idx));
  if ("work" in patch) setJson(r, WORK_KEY, cleanWork(patch.work));
  if ("example" in patch) setProp(r, EXAMPLE_KEY, cleanExample(patch.example, "this relationship") || null);
  if ("format" in patch) setProp(r, FORMAT_KEY, str(patch.format).trim() || null);
  if ("endpoints" in patch) setJson(r, ENDPOINTS_KEY, cleanEndpoints(patch.endpoints));
}

export function deleteRelationship(ws: Workspace, relId: string): void {
  buildIndex(ws).rel(relId);
  dropRelationships(ws, new Set([relId]));
  dropFromViews(ws, new Set(), new Set([relId]));
}

function dropRelationships(ws: Workspace, relIds: Set<string>): void {
  if (!relIds.size) return;
  for (const el of buildIndex(ws).elements.values()) el.relationships = el.relationships.filter((r) => !relIds.has(r.id));
}

/** Remove references to deleted things from every view; drop views whose scope is gone. */
function dropFromViews(ws: Workspace, elementIds: Set<string>, relIds: Set<string>): void {
  for (const listName of VIEW_LISTS) {
    const kept = [];
    for (const v of ws.views[listName]) {
      const scope = v.softwareSystemId || v.containerId || v.elementId;
      if (scope && elementIds.has(scope)) {
        if (v.properties?.["dp.flow"] === "true")
          v.elementId = null; // our flows: scope is re-inferred from the remaining steps
        else continue;
      }
      v.elements = v.elements.filter((e) => !elementIds.has(e.id));
      v.relationships = v.relationships.filter((r) => !relIds.has(r.id));
      kept.push(v);
    }
    ws.views[listName] = kept;
  }
}

// --------------------------------------------------------------------------- styles

const COLOR = /^#[0-9a-fA-F]{6}$/;
const LINE_STYLES = ["solid", "dashed", "dotted", "dash-dot", "long-dash"];
const ARROW_HEADS = ["filled", "open", "diamond", "diamond-open", "circle", "bar"];

export function cleanStyle(patch: Obj): Style {
  const out: Style = {};
  for (const key of ["fill", "text", "stroke"] as const) {
    const v = patch[key];
    if (v) {
      if (typeof v !== "string" || !COLOR.test(v)) throw new ModelError(`"${str(v)}" is not a colour like #1168bd.`);
      out[key] = v.toLowerCase();
    }
  }
  if (patch.strokeStyle) {
    if (!LINE_STYLES.includes(patch.strokeStyle as string)) throw new ModelError(`Line style must be one of: ${LINE_STYLES.join(", ")}.`);
    out.strokeStyle = patch.strokeStyle as Style["strokeStyle"];
  }
  if (!blank(patch.strokeWidth)) {
    const w = toFloat(patch.strokeWidth);
    if (w === null || w < 0.5 || w > 10) throw new ModelError("Line width must be between 0.5 and 10.");
    out.strokeWidth = w;
  }
  if (!blank(patch.fontSize)) {
    const f = toInt(patch.fontSize);
    if (f === null || f < 8 || f > 40) throw new ModelError("Font size must be between 8 and 40.");
    out.fontSize = f;
  }
  if (patch.arrow) {
    if (!["end", "start", "both", "none"].includes(patch.arrow as string)) throw new ModelError("Arrow must be end, start, both or none.");
    out.arrow = patch.arrow as Style["arrow"];
  }
  if (patch.arrowHead) {
    if (!ARROW_HEADS.includes(patch.arrowHead as string)) throw new ModelError(`Arrowhead must be one of: ${ARROW_HEADS.join(", ")}.`);
    out.arrowHead = patch.arrowHead as Style["arrowHead"];
  }
  // Fixed key order, so the file reads the same whichever order the fields arrived in.
  return Object.fromEntries(STYLE_KEYS.filter((k) => k in out).map((k) => [k, out[k]])) as Style;
}

const mappedPathsOf = new WeakMap<Index, string[]>();

/** Every code path mapped to an element or relationship in the model (no disk access). */
function mappedPaths(idx: Index): string[] {
  let out = mappedPathsOf.get(idx);
  if (!out) {
    out = [...idx.elements.values(), ...idx.relationships.values()].flatMap((o) => getJson<string>(o, CODE_KEY)).map((p) => normpath(String(p).replace(/\\/g, "/")));
    mappedPathsOf.set(idx, out);
  }
  return out;
}

/** Whether a file path is one of the mapped paths or lies inside a mapped folder ("." maps everything). */
function underMappedPath(idx: Index, file: string): boolean {
  return mappedPaths(idx).some((p) => p === "." || p === file || file.startsWith(`${p.replace(/\/+$/, "")}/`));
}

/** Whether an ID (element, relationship, or a synthetic diagram ID) still refers to something. */
export function idStillValid(idx: Index, key: string): boolean {
  if (idx.elements.has(key) || idx.relationships.has(key)) return true;
  if (key.startsWith("file:")) {
    // A file ("file:<path>") or an import between two files ("file:<a>-><b>") that is still under a mapped path.
    const rest = key.slice("file:".length);
    const i = rest.indexOf("->");
    return i < 0 ? underMappedPath(idx, rest) : underMappedPath(idx, rest.slice(0, i)) && underMappedPath(idx, rest.slice(i + 2));
  }
  if (key.startsWith("stage:") || key.startsWith("conn:")) return idx.relationships.has(key.split(":")[1] ?? "");
  if (key.startsWith("derived:") && key.includes("->")) {
    const rest = key.slice("derived:".length);
    const i = rest.indexOf("->");
    return idx.elements.has(rest.slice(0, i)) && idx.elements.has(rest.slice(i + 2));
  }
  return false;
}

export function setStyle(ws: Workspace, sidecar: Sidecar, target: string, patch: Obj | null): void {
  const idx = buildIndex(ws);
  if (!idStillValid(idx, target)) throw new ModelError(`Nothing to style with ID "${target}".`);
  const style = cleanStyle(patch ?? {});
  if (Object.keys(style).length) sidecar.styles[target] = style;
  else delete sidecar.styles[target];
}

// --------------------------------------------------------------------------- tag groups

export function renameTagGroupEverywhere(ws: Workspace, sidecar: Sidecar, oldName: string, newName: string): void {
  for (const el of buildIndex(ws).elements.values()) {
    const props = getProps(el);
    if (TAG_PREFIX + oldName in props) {
      const value = props[TAG_PREFIX + oldName]!;
      delete props[TAG_PREFIX + oldName];
      props[TAG_PREFIX + newName] = value;
      el.properties = props;
    }
  }
  for (const lens of sidecar.lenses) {
    if (lens.defaultOverlay === oldName) lens.defaultOverlay = newName;
    lens.hiddenTagGroups = lens.hiddenTagGroups.map((g) => (g === oldName ? newName : g));
  }
}

/** Apply value renames, then clear values that are no longer allowed. */
export function rewriteTagValues(ws: Workspace, group: string, renames: Map<string, string>, allowed: Set<string>): void {
  const key = TAG_PREFIX + group;
  for (const el of buildIndex(ws).elements.values()) {
    const value = getProps(el)[key];
    if (value === undefined) continue;
    const next = renames.get(value) ?? value;
    setProp(el, key, allowed.has(next) ? next : null);
  }
}

/** Apply renames of characteristics to every element's ratings and drop removed ones. */
export function rewriteCharacteristics(ws: Workspace, renames: Map<string, string>, allowed: Set<string>): void {
  for (const el of buildIndex(ws).elements.values()) {
    const rows = getJson<Rating>(el, CHARS_KEY);
    if (!rows.length) continue;
    const next: Rating[] = [];
    for (const r of rows) {
      const name = renames.get(r.name ?? "") ?? r.name ?? "";
      if (allowed.has(name)) next.push({ ...r, name });
    }
    if (JSON.stringify(next) !== JSON.stringify(rows)) setJson(el, CHARS_KEY, next);
  }
}

export function removeTagGroupEverywhere(ws: Workspace, sidecar: Sidecar, group: string): void {
  for (const el of buildIndex(ws).elements.values()) setProp(el, TAG_PREFIX + group, null);
  for (const lens of sidecar.lenses) {
    if (lens.defaultOverlay === group) lens.defaultOverlay = null;
    lens.hiddenTagGroups = lens.hiddenTagGroups.filter((g) => g !== group);
  }
}
