/**
 * Findings from other tools become linked work (DEC-085): SARIF, GitLab code quality, SonarQube issues
 * and dp's own push format are read here into `WorkPush`es, and a finding's file is mapped to the element
 * whose code paths hold it (the most specific path, then the deepest element); a file no element holds is
 * pinned to the project and counted as unmapped. `pushWork` merges the pushes into a model, writing only
 * when something changes. No network: a report is text the caller already has.
 */

import crypto from "node:crypto";
import { parseTargetSpec, cleanWorkTarget, upsertWork } from "./work.js";
import { buildIndex, CODE_KEY, getJson, ModelError, normpath, WORK_KEY_MAX } from "./modelEdits.js";
import type { Project } from "./project.js";
import { isObj, type Obj } from "./util.js";
import type { Workspace } from "./workspace.js";
import { DEFAULT_WORK_SEVERITY, WORK_IMPORT_FORMATS, type WorkImportFormat, type WorkItem, type WorkPush, type WorkPushResult, type WorkSeverityMaps, type WorkTarget } from "../shared/types.js";
import { severityOf } from "../shared/workLinks.js";

/** The most text of a report, and the most findings read from one. */
export const MAX_REPORT_CHARS = 20_000_000;
export const MAX_FINDINGS = 5000;
const TITLE_MAX = 200;

export interface ParsedReport {
  pushes: WorkPush[];
  /** Findings whose file no element's code paths hold; they are pinned to the project. */
  unmapped: number;
}

/** The format of the `dp` import file, for `dp work import --schema`. */
export const WORK_IMPORT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "designPerspectives linked work import (format dp)",
  description: `A list of linked work items, each with what it is pinned to. At most ${MAX_FINDINGS} items. An item matches one that is already there by its key, then by its url.`,
  oneOf: [{ $ref: "#/$defs/list" }, { type: "object", required: ["items"], properties: { items: { $ref: "#/$defs/list" } }, additionalProperties: true }],
  $defs: {
    list: { type: "array", maxItems: MAX_FINDINGS, items: { $ref: "#/$defs/push" } },
    push: {
      type: "object",
      required: ["to", "item"],
      additionalProperties: false,
      properties: {
        to: {
          description:
            'Where the item is pinned: an object {"type": "project"} or {"type": "element" | "relationship" | "diagram", "id": ...}, or text: "project", "element:<id>", "relationship:<id>", "diagram:<key>" (a flow is "diagram:flow-<name>"), or a bare ID or key.',
          oneOf: [{ type: "string" }, { type: "object", required: ["type"], properties: { type: { enum: ["project", "element", "relationship", "diagram"] }, id: { type: "string" } } }],
        },
        item: {
          type: "object",
          additionalProperties: false,
          anyOf: [{ required: ["title"] }, { required: ["url"] }],
          properties: {
            title: { type: "string" },
            type: { enum: ["security", "pr", "issue", "backlog", "update", "quality"], default: "issue" },
            status: { enum: ["open", "in-progress", "blocked", "done"], default: "open" },
            severity: { enum: ["critical", "high", "medium", "low"] },
            url: { type: "string", pattern: "^https?://" },
            note: { type: "string" },
            key: { type: "string", maxLength: WORK_KEY_MAX, description: "A stable ID from the tool; a later push with the same key updates the item." },
            remote: { type: "string", description: "The tool's own status or a short description of where it was found." },
          },
        },
      },
    },
  },
} as const;

// ---------------------------------------------------------------- finding a file's owner

interface Held {
  id: string;
  depth: number;
  path: string;
}

/** Every code path of every element, once with its element and how deep the element sits. */
function heldPaths(ws: Workspace): Held[] {
  const idx = buildIndex(ws);
  const depth = (id: string) => {
    let d = 0;
    for (let p = idx.parentOf(id); p && d < 50; p = idx.parentOf(p)) d++;
    return d;
  };
  const out: Held[] = [];
  for (const el of idx.elements.values()) {
    const d = depth(el.id);
    for (const raw of getJson<string>(el, CODE_KEY)) {
      const p = normpath(String(raw).replace(/\\/g, "/")).replace(/^\.\//, "");
      if (p && p !== "." && !p.startsWith("..")) out.push({ id: el.id, depth: d, path: p });
    }
  }
  return out;
}

/** The target for a file of the code: the element holding it with the most specific path (a file beats the
 *  folder it is in), a deeper element before a shallower one, else the project. */
function ownerOf(held: readonly Held[], file: string | null): WorkTarget | null {
  if (!file) return null;
  let best: Held | null = null;
  for (const h of held) {
    if (file !== h.path && !file.startsWith(h.path + "/")) continue;
    if (!best || h.path.length > best.path.length || (h.path.length === best.path.length && h.depth > best.depth)) best = h;
  }
  return best ? { type: "element", id: best.id } : null;
}

/** A path as a tool reports it, made relative to the code root: no `file://`, no `./`, no `%SRCROOT%/`. */
export function reportPath(p: unknown): string | null {
  if (typeof p !== "string" || !p.trim()) return null;
  let s = p.trim().replace(/^file:\/\//i, "");
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep as it is */
  }
  s = s.replace(/\\/g, "/").replace(/^%[A-Za-z_]+%\/?/, "");
  s = normpath(s).replace(/^\.\//, "");
  return s && s !== "." ? s : null;
}

// ---------------------------------------------------------------- the formats

const severityOfScore = (score: number, s: WorkSeverityMaps["sarifScore"]) => (score >= s.critical ? "critical" : score >= s.high ? "high" : score >= s.medium ? "medium" : "low");
const sha = (s: string) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);
const keyOf = (k: string) => (k.length <= WORK_KEY_MAX ? k : sha(k));
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Obj => (isObj(v) ? v : {});

function titleOf(text: string, fallback: string): string {
  const first = text.trim().split(/\r?\n/)[0]!.trim() || fallback;
  return first.length > TITLE_MAX ? `${first.slice(0, TITLE_MAX - 1)}…` : first;
}

/** One finding before it is pinned. */
interface Finding {
  title: string;
  type: "security" | "issue";
  severity?: string;
  key: string;
  url?: string;
  where: string | null;
  line?: number;
  detail?: string;
}

function sarif(doc: unknown, maps: WorkSeverityMaps): Finding[] {
  const out: Finding[] = [];
  for (const run of arr(obj(doc).runs)) {
    const rules = new Map<string, Obj>();
    const ruleList = arr(obj(obj(obj(run).tool).driver).rules).map(obj);
    for (const r of ruleList) if (str(r.id)) rules.set(str(r.id), r);
    for (const res of arr(obj(run).results).map(obj)) {
      const ruleId = str(res.ruleId) || str(obj(res.rule).id);
      const idxRule = typeof res.ruleIndex === "number" ? ruleList[res.ruleIndex] : undefined;
      const rule = rules.get(ruleId) ?? idxRule ?? {};
      const props = obj(res.properties);
      const ruleProps = obj(rule.properties);
      const raw = str(props["security-severity"] ?? ruleProps["security-severity"]);
      const score = raw === "" ? NaN : Number(raw);
      const hasScore = Number.isFinite(score);
      const level = str(res.level) || str(obj(rule.defaultConfiguration).level) || "warning";
      const severity = hasScore ? severityOfScore(score, maps.sarifScore) : severityOf(maps.sarifLevel, level);
      const tags = [...arr(ruleProps.tags), ...arr(props.tags)].map(str);
      const security = hasScore || tags.includes("security");
      const phys = obj(obj(arr(res.locations)[0]).physicalLocation);
      const where = reportPath(obj(phys.artifactLocation).uri);
      const line = Number(obj(phys.region).startLine);
      const fp = Object.values(obj(res.partialFingerprints)).map(str).find(Boolean);
      const message = str(obj(res.message).text) || str(obj(rule.shortDescription).text) || ruleId || "Finding";
      const help = str(rule.helpUri);
      out.push({
        title: titleOf(message, ruleId || "Finding"),
        type: security ? "security" : "issue",
        severity,
        key: keyOf(fp ?? `${ruleId}:${where ?? sha(message)}:${Number.isFinite(line) ? line : ""}`),
        url: /^https?:\/\//i.test(help) ? help : undefined,
        where,
        line: Number.isFinite(line) ? line : undefined,
        detail: ruleId || undefined,
      });
    }
  }
  return out;
}

function codeQuality(doc: unknown, maps: WorkSeverityMaps): Finding[] {
  if (!Array.isArray(doc)) throw new ModelError("A GitLab code quality report is a JSON list of issues.");
  return doc.map(obj).map((i) => {
    const where = reportPath(obj(i.location).path);
    const line = Number(obj(obj(i.location).lines).begin ?? obj(i.location).line);
    const check = str(i.check_name);
    const description = str(i.description);
    return {
      title: titleOf(description, check || "Finding"),
      type: "issue" as const,
      severity: severityOf(maps.codeQuality, str(i.severity)),
      key: keyOf(str(i.fingerprint) || `${check}:${where ?? sha(description)}:${Number.isFinite(line) ? line : ""}`),
      where,
      line: Number.isFinite(line) ? line : undefined,
      detail: check || undefined,
    };
  });
}

function sonar(doc: unknown, maps: WorkSeverityMaps): Finding[] {
  const issues = obj(doc).issues;
  if (!Array.isArray(issues)) throw new ModelError('A SonarQube issues report is the answer of /api/issues/search: an object with an "issues" list.');
  return issues.map(obj).map((i) => {
    const component = str(i.component);
    const colon = component.indexOf(":");
    const where = reportPath(colon >= 0 ? component.slice(colon + 1) : component);
    const line = Number(i.line);
    const message = str(i.message);
    return {
      title: titleOf(message, str(i.rule) || "Issue"),
      type: str(i.type).toUpperCase() === "VULNERABILITY" ? ("security" as const) : ("issue" as const),
      severity: severityOf(maps.sonar, str(i.severity)),
      key: keyOf(str(i.key) || `${str(i.rule)}:${where ?? sha(message)}:${Number.isFinite(line) ? line : ""}`),
      where,
      line: Number.isFinite(line) ? line : undefined,
      detail: str(i.rule) || undefined,
    };
  });
}

function dpPushes(doc: unknown, ws: Workspace): WorkPush[] {
  const list = Array.isArray(doc) ? doc : obj(doc).items;
  if (!Array.isArray(list)) throw new ModelError('A dp work file is a list of {"to", "item"} or an object with an "items" list (see --schema).');
  return list.map((e, i) => {
    if (!isObj(e) || !isObj(e.item)) throw new ModelError(`Item ${i + 1}: needs "to" and "item".`);
    if (e.to === undefined || e.to === null) throw new ModelError(`Item ${i + 1}: needs "to" (where it is pinned).`);
    const to = typeof e.to === "string" ? parseTargetSpec(ws, e.to) : cleanWorkTarget(e.to);
    return { to, item: e.item as WorkPush["item"] };
  });
}

// ---------------------------------------------------------------- reading a report

/** Read a report into pushes. A bad report is a ModelError that says what is wrong. `maps`: the model's severity
 *  mapping (the sidecar's `work.severity`, DEC-087). */
export function parseWorkReport(format: WorkImportFormat | string, text: string, ws: Workspace, maps: WorkSeverityMaps = DEFAULT_WORK_SEVERITY): ParsedReport {
  if (!(WORK_IMPORT_FORMATS as readonly string[]).includes(format)) throw new ModelError(`Unknown format "${format}". Use ${WORK_IMPORT_FORMATS.join(", ")}.`);
  if (typeof text !== "string") throw new ModelError("The report must be text.");
  if (text.length > MAX_REPORT_CHARS) throw new ModelError(`The report is over ${MAX_REPORT_CHARS / 1_000_000} MB, the most dp reads.`);
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    throw new ModelError(`The ${format} report is not valid JSON: ${(e as Error).message}`);
  }
  const tooMany = (n: number) => {
    if (n > MAX_FINDINGS) throw new ModelError(`The report has ${n} findings; dp reads at most ${MAX_FINDINGS} at a time. Filter it to the findings you want to track.`);
  };
  if (format === "dp") {
    const pushes = dpPushes(doc, ws);
    tooMany(pushes.length);
    return { pushes, unmapped: 0 };
  }
  const findings = format === "sarif" ? sarif(doc, maps) : format === "gitlab-codequality" ? codeQuality(doc, maps) : sonar(doc, maps);
  tooMany(findings.length);
  const held = heldPaths(ws);
  const pushes: WorkPush[] = [];
  const seen = new Set<string>();
  let unmapped = 0;
  for (const f of findings) {
    const owner = ownerOf(held, f.where);
    const to: WorkTarget = owner ?? { type: "project" };
    const id = `${to.type === "project" ? "" : to.id}\n${f.key}`;
    if (seen.has(id)) continue; // the same finding twice in one report
    seen.add(id);
    if (!owner) unmapped++;
    const item: WorkItem = { type: f.type, title: f.title, status: "open", key: f.key };
    if (f.severity) item.severity = f.severity;
    if (f.url) item.url = f.url;
    const at = f.where ? `${f.where}${f.line ? `:${f.line}` : ""}` : "";
    const remote = [f.detail, at].filter(Boolean).join(" · ");
    if (remote) item.remote = remote;
    pushes.push({ to, item });
  }
  return { pushes, unmapped };
}

/**
 * Merge pushes into a project (a draft is a project too). Looks on a copy first: with `dryRun`, or when
 * nothing would change, nothing is written (and there is no undo step).
 */
export function pushWork(project: Project, pushes: WorkPush[], opts: { source?: string; closeMissing?: boolean; dryRun?: boolean } = {}): WorkPushResult {
  project.reloadIfChanged();
  const would = upsertWork(structuredClone(project.workspace), pushes, opts);
  if (opts.dryRun) return { ...would, dryRun: true };
  if (!would.added && !would.updated && !would.closed) return would;
  return project.edit((ws) => upsertWork(ws, pushes, opts));
}
