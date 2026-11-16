/**
 * The review of an import draft (DEC-051; backlog section 4, "Review level and low-confidence items").
 *
 * Every object, relationship, flow and decision an import created or changed in its draft is a review item,
 * keyed `object:<id>`, `relationship:<id>`, `flow:<flow key>` or `decision:<slug>` (the decision's file name
 * without its number and `.md`, because applying may renumber it). A `via` relationship is two items, one per
 * relationship written; both carry the file entry's evidence.
 *
 * The review level is computed here from what the tool can check, never taken from the file's `confidence`:
 * - verified: a cited scan fact is in evidence.json (and its path is still there); a `user` note; a manifest
 *   the scan found (package.json, Dockerfile, compose file, ...) sits at a code path the item maps; the scan
 *   found a known service with the item's name; for a relationship between two components with mapped code,
 *   an import from one's code to the other's. A flow is as verified as its least verified step.
 * - partly: a cited file exists (with the cited lines) and the item's name or the quoted text is in it.
 * - unverified: nothing that passes is cited; or a cited file, its lines or a scan fact cannot be found; or a
 *   contradiction: a relationship between two components with mapped code whose code shows no import from
 *   one to the other. A failed citation or a contradiction makes the item unverified whatever else it cites.
 * Code is read only through a `CodeSource`. Imports are found by `scanImports` over at most `MAX_FILES` files
 * per side (`expandPaths`), so a very large component can miss an import: the item then needs an explicit accept.
 *
 * State, outside the model (nothing here is written to it):
 *   architecture/import/reviews/<draftId>.json   ReviewState: per item its level, checks and decision
 *   architecture/import/files/<draftId>.json     the import file the draft was made from
 * Both are written when the importer makes the draft (`createReview`) and removed with the draft
 * (drafts.ts; the import file is kept when the draft is applied whole).
 *
 * Decisions: `acceptAll` accepts only verified and partly verified items; an unverified one is accepted
 * only by `setDecision` on that item, recorded with who did it. Rejecting resets the item's change in the
 * draft with what depends on it (`Drafts.revertUnits`); items that this takes out with it are marked rejected
 * too. On apply, everything not accepted stays in the draft: the hooks registered at the end of this file
 * give `Drafts.apply` the items to hold, so a client cannot apply a held item by calling apply directly.
 */

import fs from "node:fs";
import path from "node:path";
import { expandPaths, scanImports } from "../core/codeMap.js";
import { cleanRel, sha1, type CodeSource } from "../core/codeFiles.js";
import { registerDraftHooks, type DraftHooks, type Drafts } from "../core/drafts.js";
import { buildIndex, CODE_KEY, getJson, ModelError } from "../core/ops.js";
import { NotFound } from "../core/project.js";
import { flatten, sameUnit, type Units } from "../core/units.js";
import { atomicWrite, isHidden, isObj, stableJson } from "../core/util.js";
import { listFlows } from "../core/flows.js";
import {
  REVIEW_DECISIONS,
  REVIEW_LEVELS,
  type Decision,
  type ImportEvidence,
  type ImportFile,
  type ReviewCheck,
  type ReviewDecision,
  type ReviewItem,
  type ReviewItemKind,
  type ReviewLevel,
  type ReviewRule,
  type ReviewState,
} from "../shared/types.js";
import { importFilePath, reviewPath } from "./ledger.js";
import { readEvidence, type Evidence, type Fact } from "./scan.js";

export const REVIEW_SCHEMA_VERSION = 1;
/** Typed feedback (per item, or for the whole draft), in characters. */
export const MAX_FEEDBACK = 4000;

/** Scan facts that come from a manifest, IaC or configuration file (scan.ts). */
const MANIFEST_KINDS = new Set(["service-dependency", "dockerfile", "compose-service", "datastore", "queue", "k8s-workload", "package-entry", "python-script", "serverless-function"]);
const KINDS: ReviewItemKind[] = ["object", "relationship", "flow", "decision"];
const RULES: ReviewRule[] = ["scan-fact", "user-note", "manifest-path", "manifest-service", "file-exists", "lines-exist", "text-found", "import-edge", "flow-step", "no-evidence"];
const RANK: Record<ReviewLevel, number> = { unverified: 0, partly: 1, verified: 2 };

/** Where a review item comes from: written by the importer for each object, relationship, flow and decision it created or changed. */
export interface ImportOrigin {
  key: string;
  kind: ReviewItemKind;
  /** The file entry (JSON pointer), e.g. `/relationships/2`. */
  pointer: string;
}

export const itemKey = (kind: ReviewItemKind, id: string): string => `${kind}:${id}`;

/** `0012-keep-a-ledger.md` → `keep-a-ledger`. */
export const decisionSlug = (file: string): string => file.replace(/^\d{4}-/, "").replace(/\.md$/, "");

function splitKey(key: string): { kind: ReviewItemKind; id: string } {
  const i = key.indexOf(":");
  const kind = key.slice(0, i) as ReviewItemKind;
  if (i < 1 || !KINDS.includes(kind)) throw new ModelError(`"${key}" is not a review item key.`);
  return { kind, id: key.slice(i + 1) };
}

// ------------------------------------------------------------------ the review level

/** What the level of one item is computed from (`subjectOf` builds it from the import file and the draft). */
export interface ReviewSubject {
  kind: ReviewItemKind;
  /** Object name, relationship label, flow or decision title, as the draft has it now. */
  name: string;
  /** The file entry's evidence. */
  evidence: ImportEvidence[];
  /** The item's code mapping in the draft. */
  codePaths: string[];
  /** A relationship between two components with mapped code: what the import-edge check reads. */
  edge?: { source: string; target: string; sourcePaths: string[]; targetPaths: string[] };
  /** A flow: the level of each step's relationship. */
  steps?: { relationship: string; level: ReviewLevel }[];
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const dirOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

/** The first line (1-based, from `first`) of `lines` that holds `needle` (spaces and letter case ignored), or null. */
function findIn(lines: string[], first: number, needle: string): number | null {
  const n = squash(needle);
  if (!n) return null;
  for (let i = 0; i < lines.length; i++) if (squash(lines[i]!).includes(n)) return first + i;
  // A quote that spans lines.
  return squash(lines.join(" ")).includes(n) ? first : null;
}

/** An import from the code of `sourcePaths` to the code of `targetPaths`: [importer, imported] or null; undefined when either has no readable file. */
function importEdge(code: CodeSource, edge: NonNullable<ReviewSubject["edge"]>): [string, string] | null | undefined {
  const [a] = expandPaths(code, edge.sourcePaths);
  const [b] = expandPaths(code, edge.targetPaths);
  const A = new Set(a.filter((f) => !b.includes(f)));
  const B = new Set(b.filter((f) => !a.includes(f)));
  if (!A.size || !B.size) return undefined;
  return scanImports(code, [...A, ...B].sort()).find(([x, y]) => A.has(x) && B.has(y)) ?? null;
}

/**
 * The review level of one item, and every check made for it (see the header for the rules). `evidence`: the
 * scan results (null: none yet, so cited scan facts cannot be checked, which does not count against the item).
 */
export function reviewLevel(item: ReviewSubject, evidence: Evidence | null, code: CodeSource): { level: ReviewLevel; checks: ReviewCheck[] } {
  const checks: ReviewCheck[] = [];
  const check = (c: ReviewCheck) => checks.push(c);

  if (item.kind === "flow") {
    const steps = item.steps ?? [];
    for (const s of steps) check({ rule: "flow-step", ok: s.level !== "unverified", note: `${s.relationship}: ${s.level}` });
    if (!steps.length) check({ rule: "no-evidence", ok: false, note: "The flow has no steps." });
    const level = steps.length ? steps.map((s) => s.level).reduce((a, b) => (RANK[a] <= RANK[b] ? a : b)) : "unverified";
    return { level, checks };
  }

  let verified = false;
  let partly = false;
  let failed = false;
  const facts = evidence ? new Map(evidence.facts.map((f) => [f.id, f])) : null;
  const where = (f: Fact) => ({ path: f.path, ...(f.line !== undefined ? { line: f.line } : {}) });

  for (const e of item.evidence) {
    if (e.kind === "user") {
      check({ rule: "user-note", ok: true, note: e.note });
      verified = true;
    } else if (e.kind === "scan") {
      if (!facts) {
        check({ rule: "scan-fact", ok: false, note: `"${e.fact}": there are no scan results (evidence.json) to check it against; run the scan.` });
        continue;
      }
      const f = facts.get(e.fact);
      if (!f) {
        check({ rule: "scan-fact", ok: false, note: `The scan results have no fact "${e.fact}".` });
        failed = true;
      } else if (code.hasRoot && code.kind(f.path) === null) {
        check({ rule: "scan-fact", ok: false, ...where(f), note: `The scan found ${f.kind} "${f.name}" in ${f.path}, which is no longer there.` });
        failed = true;
      } else {
        check({ rule: "scan-fact", ok: true, ...where(f), note: `${f.kind} "${f.name}"` });
        verified = true;
      }
    } else {
      const rel = cleanRel(e.path);
      if (rel === null || rel === "" || isHidden(rel)) {
        check({ rule: "file-exists", ok: false, path: e.path, note: "Outside the code folder or hidden: it cannot be checked." });
        failed = true;
        continue;
      }
      if (!code.hasRoot) {
        check({ rule: "file-exists", ok: false, path: rel, note: "There is no code folder to check it in." });
        continue;
      }
      const text = code.kind(rel) === "file" ? code.read(rel) : null;
      if (text === null) {
        check({ rule: "file-exists", ok: false, path: rel, note: `Not a file in ${code.label}.` });
        failed = true;
        continue;
      }
      check({ rule: "file-exists", ok: true, path: rel });
      let lines = text.split(/\r?\n/);
      let first = 1;
      if (e.lines) {
        const [a, b] = e.lines;
        if (a > b || b > lines.length) {
          check({ rule: "lines-exist", ok: false, path: rel, line: a, note: `The file has ${lines.length} lines; lines ${a} to ${b} were cited.` });
          failed = true;
          continue;
        }
        check({ rule: "lines-exist", ok: true, path: rel, line: a });
        lines = lines.slice(a - 1, b);
        first = a;
      }
      const needles = [item.name, e.text ?? ""].filter((n) => n.trim());
      let hit: { needle: string; line: number } | null = null;
      for (const n of needles) {
        const line = findIn(lines, first, n);
        if (line !== null) {
          hit = { needle: n, line };
          break;
        }
      }
      if (hit) {
        check({ rule: "text-found", ok: true, path: rel, line: hit.line, note: `"${hit.needle}"` });
        partly = true;
      } else check({ rule: "text-found", ok: false, path: rel, ...(e.lines ? { line: first } : {}), note: `Neither the name nor the quoted text is in ${e.lines ? "the cited lines" : "the file"}.` });
    }
  }

  if (evidence) {
    for (const p of item.codePaths) {
      const c = cleanRel(p);
      if (c === null) continue;
      const f = evidence.facts.find((x) => MANIFEST_KINDS.has(x.kind) && (x.path === c || dirOf(x.path) === c));
      if (f) {
        check({ rule: "manifest-path", ok: true, ...where(f), note: `${f.kind} "${f.name}"` });
        verified = true;
      } else check({ rule: "manifest-path", ok: false, path: c || ".", note: "The scan found no manifest at this code path." });
    }
    if (item.kind === "object" && item.name.trim()) {
      const f = evidence.facts.find((x) => x.system && squash(x.system) === squash(item.name));
      if (f) {
        check({ rule: "manifest-service", ok: true, ...where(f), note: `${f.kind} "${f.name}" is ${f.system}` });
        verified = true;
      }
    }
  }

  if (item.edge && code.hasRoot) {
    const found = importEdge(code, item.edge);
    if (found) {
      check({ rule: "import-edge", ok: true, path: found[0], note: `${found[0]} imports ${found[1]}` });
      verified = true;
    } else if (found === null) {
      check({ rule: "import-edge", ok: false, note: `No import from the code of "${item.edge.source}" to the code of "${item.edge.target}" was found.` });
      failed = true;
    }
  }

  if (!item.evidence.length) check({ rule: "no-evidence", ok: false, note: "The import file cites no evidence for this." });
  const level: ReviewLevel = failed ? "unverified" : verified ? "verified" : partly ? "partly" : "unverified";
  return { level, checks };
}

// ------------------------------------------------------------------ subjects: the import file + the draft

/** The file entry a pointer names (`/objects/3`), or undefined. */
function entryAt(file: ImportFile, pointer: string): { evidence?: ImportEvidence[] } | undefined {
  const m = /^\/(objects|relationships|flows|decisions)\/(\d+)$/.exec(pointer);
  if (!m) return undefined;
  const list = (file as unknown as Record<string, unknown[] | undefined>)[m[1]!];
  return list?.[Number(m[2])] as { evidence?: ImportEvidence[] } | undefined;
}

interface DraftView {
  ws: ReturnType<Drafts["get"]>["workspace"];
  decisions: Decision[];
  baseDecisions: Decision[];
}

/** The draft's decision files that carry the item `decision:<slug>` (new ones first choice). */
function decisionFiles(slug: string, v: { decisions: Decision[]; baseDecisions: Decision[] }): string[] {
  const all = v.decisions.filter((d) => decisionSlug(d.file) === slug);
  const inBase = new Set(v.baseDecisions.map((d) => d.file));
  const added = all.filter((d) => !inBase.has(d.file));
  return (added.length ? added : all).map((d) => d.file);
}

/** The draft's unit keys (`units.ts`) that carry an item. */
export function itemUnits(key: string, v: { decisions: Decision[]; baseDecisions: Decision[] }): string[] {
  const { kind, id } = splitKey(key);
  switch (kind) {
    case "object":
      return [`el:${id}`];
    case "relationship":
      return [`rel:${id}`];
    case "flow":
      return [`view:${id}`];
    case "decision":
      return decisionFiles(id, v).map((f) => `dec:${f}`);
  }
}

/** What an item's level is computed from, or null when the item is no longer in the draft. */
function subjectOf(key: string, item: ReviewItem, file: ImportFile, v: DraftView, levelOf: (relKey: string) => ReviewLevel | null): ReviewSubject | null {
  const { kind, id } = splitKey(key);
  const idx = buildIndex(v.ws);
  const evidence = entryAt(file, item.pointer)?.evidence ?? [];
  if (kind === "object") {
    const el = idx.elements.get(id);
    return el ? { kind, name: el.name, evidence, codePaths: getJson<string>(el, CODE_KEY).map(String) } : null;
  }
  if (kind === "relationship") {
    const r = idx.relationships.get(id);
    if (!r) return null;
    const s: ReviewSubject = { kind, name: r.description || "", evidence, codePaths: getJson<string>(r, CODE_KEY).map(String) };
    const ends = [r.sourceId, r.destinationId].map((e) => (idx.elements.has(e) && idx.kindOf(e) === "component" ? getJson<string>(idx.elements.get(e)!, CODE_KEY).map(String) : []));
    if (ends[0]!.length && ends[1]!.length) s.edge = { source: r.sourceId, target: r.destinationId, sourcePaths: ends[0]!, targetPaths: ends[1]! };
    return s;
  }
  if (kind === "flow") {
    const f = listFlows(v.ws).find((x) => x.key === id);
    if (!f) return null;
    // A step over a relationship the import did not write was in the model already: nothing new to check.
    const steps = f.steps.map((st) => ({ relationship: st.relationshipId, level: levelOf(itemKey("relationship", st.relationshipId)) ?? ("verified" as ReviewLevel) }));
    return { kind, name: f.title, evidence: [], codePaths: [], steps };
  }
  const files = decisionFiles(id, v);
  const d = v.decisions.find((x) => x.file === files[0]);
  return d ? { kind, name: d.title, evidence, codePaths: [] } : null;
}

// ------------------------------------------------------------------ the state file

function cleanCheck(v: unknown): ReviewCheck | null {
  if (!isObj(v) || !RULES.includes(v.rule as ReviewRule) || typeof v.ok !== "boolean") return null;
  const c: ReviewCheck = { rule: v.rule as ReviewRule, ok: v.ok };
  if (typeof v.path === "string") c.path = v.path;
  if (typeof v.line === "number" && Number.isInteger(v.line)) c.line = v.line;
  if (typeof v.note === "string") c.note = v.note;
  return c;
}

/** The review state of an import draft, or null when it has none (not an import draft). Throws a ModelError when the file cannot be read as one. */
export function readReview(modelDir: string, draftId: string): ReviewState | null {
  const file = reviewPath(modelDir, draftId);
  let text: string;
  try {
    text = fs.readFileSync(file, "utf-8");
  } catch {
    return null;
  }
  const bad = (why: string) => new ModelError(`The review of draft "${draftId}" (${path.basename(file)}) cannot be read: ${why}.`);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw bad("not valid JSON");
  }
  if (!isObj(data) || data.schemaVersion !== REVIEW_SCHEMA_VERSION || !isObj(data.items)) throw bad("not a review file of this version");
  const items: Record<string, ReviewItem> = {};
  for (const [key, v] of Object.entries(data.items)) {
    if (!isObj(v)) throw bad(`item "${key}" is not an object`);
    splitKey(key);
    if (!KINDS.includes(v.kind as ReviewItemKind) || !REVIEW_LEVELS.includes(v.level as ReviewLevel) || !REVIEW_DECISIONS.includes(v.decision as ReviewDecision))
      throw bad(`item "${key}" has an unknown kind, level or decision`);
    const item: ReviewItem = {
      kind: v.kind as ReviewItemKind,
      name: typeof v.name === "string" ? v.name : "",
      pointer: typeof v.pointer === "string" ? v.pointer : "",
      level: v.level as ReviewLevel,
      checks: (Array.isArray(v.checks) ? v.checks : []).map(cleanCheck).filter((c): c is ReviewCheck => c !== null),
      decision: v.decision as ReviewDecision,
    };
    if (typeof v.by === "string" && v.by) item.by = v.by;
    if (typeof v.feedback === "string" && v.feedback) item.feedback = v.feedback;
    items[key] = item;
  }
  const state: ReviewState = {
    schemaVersion: 1,
    importFileSha1: typeof data.importFileSha1 === "string" ? data.importFileSha1 : "",
    revision: typeof data.revision === "number" && Number.isInteger(data.revision) && data.revision > 0 ? data.revision : 1,
    items,
  };
  if (typeof data.draftFeedback === "string" && data.draftFeedback) state.draftFeedback = data.draftFeedback;
  return state;
}

/** The review as file text: items by key, fields in a fixed order. */
export function reviewText(s: ReviewState): string {
  const items: Record<string, unknown> = {};
  for (const key of Object.keys(s.items).sort()) {
    const i = s.items[key]!;
    items[key] = {
      kind: i.kind,
      name: i.name,
      pointer: i.pointer,
      level: i.level,
      checks: i.checks.map((c) => ({
        rule: c.rule,
        ok: c.ok,
        ...(c.path !== undefined ? { path: c.path } : {}),
        ...(c.line !== undefined ? { line: c.line } : {}),
        ...(c.note !== undefined ? { note: c.note } : {}),
      })),
      decision: i.decision,
      ...(i.by ? { by: i.by } : {}),
      ...(i.feedback ? { feedback: i.feedback } : {}),
    };
  }
  return stableJson({ schemaVersion: 1, importFileSha1: s.importFileSha1, revision: s.revision, items, ...(s.draftFeedback ? { draftFeedback: s.draftFeedback } : {}) });
}

function writeReview(modelDir: string, draftId: string, s: ReviewState): void {
  atomicWrite(reviewPath(modelDir, draftId), reviewText(s));
}

/** The import file an import draft was made from, or null. */
export function readImportFile(modelDir: string, draftId: string): ImportFile | null {
  try {
    return JSON.parse(fs.readFileSync(importFilePath(modelDir, draftId), "utf-8")) as ImportFile;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ actions

export interface ReviewOptions {
  /** Where cited files are read (default: the draft's code, the code folder with its planned edits). */
  code?: CodeSource;
  /** Scan results (default: `architecture/import/evidence.json`, if any). */
  evidence?: Evidence | null;
}

interface Loaded {
  state: ReviewState;
  file: ImportFile;
  view: DraftView;
  code: CodeSource;
  evidence: Evidence | null;
}

function load(drafts: Drafts, draftId: string, opts: ReviewOptions): Loaded {
  drafts.info(draftId); // NotFound for an unknown draft
  const dir = drafts.main.dir;
  const state = readReview(dir, draftId);
  if (!state) throw new ModelError(`Draft "${draftId}" is not an import draft: it has no review.`);
  const file = readImportFile(dir, draftId);
  if (!file) throw new ModelError(`The import file of draft "${draftId}" is missing, so its items cannot be checked again.`);
  return { state, file, view: viewOf(drafts, draftId), code: opts.code ?? drafts.code(draftId), evidence: opts.evidence !== undefined ? opts.evidence : readEvidence(drafts.main.root) };
}

function viewOf(drafts: Drafts, draftId: string): DraftView {
  const draft = drafts.get(draftId);
  draft.reloadIfChanged();
  return { ws: draft.workspace, decisions: draft.decisions, baseDecisions: drafts.base(draftId).decisions };
}

/** Compute the level and checks of `keys` (all items when null), relationships before the flows that use them. */
function recheck(l: Loaded, keys: string[] | null): void {
  const cache = new Map<string, ReviewLevel | null>();
  const levelOf = (key: string): ReviewLevel | null => {
    if (cache.has(key)) return cache.get(key)!;
    const item = l.state.items[key];
    if (!item) return null;
    const subject = subjectOf(key, item, l.file, l.view, levelOf);
    if (!subject) {
      cache.set(key, item.level);
      return item.level;
    }
    const { level, checks } = reviewLevel(subject, l.evidence, l.code);
    if (keys === null || keys.includes(key)) Object.assign(item, { name: subject.name, level, checks });
    cache.set(key, level);
    return level;
  };
  const order = (k: string) => (k.startsWith("flow:") ? 1 : 0);
  for (const key of (keys ?? Object.keys(l.state.items)).sort((a, b) => order(a) - order(b) || (a < b ? -1 : a > b ? 1 : 0))) levelOf(key);
}

/** For each item: whether it still changes something in the draft (against the draft's base). */
function liveItems(drafts: Drafts, draftId: string, state: ReviewState): Map<string, boolean> {
  const draft = drafts.get(draftId);
  draft.reloadIfChanged();
  const base = drafts.base(draftId);
  const B: Units = flatten(base.workspace, base.sidecar, base.decisions);
  const T: Units = flatten(draft.workspace, draft.sidecar, draft.decisions);
  const v = { decisions: draft.decisions, baseDecisions: base.decisions };
  const out = new Map<string, boolean>();
  for (const key of Object.keys(state.items))
    out.set(
      key,
      itemUnits(key, v).some((k) => !sameUnit(B.get(k), T.get(k))),
    );
  return out;
}

/**
 * Write the review of a new import draft (called by `importToDraft`): the import file is kept as
 * `files/<draftId>.json`, each origin becomes a pending item, and every level is computed.
 */
export function createReview(drafts: Drafts, draftId: string, file: ImportFile, origins: ImportOrigin[], opts: ReviewOptions = {}): ReviewState {
  const dir = drafts.main.dir;
  const text = stableJson(file);
  atomicWrite(importFilePath(dir, draftId), text);
  const items: Record<string, ReviewItem> = {};
  for (const o of origins) items[o.key] ??= { kind: o.kind, name: "", pointer: o.pointer, level: "unverified", checks: [], decision: "pending" };
  const state: ReviewState = { schemaVersion: 1, importFileSha1: sha1(text), revision: 1, items };
  recheck({ state, file, view: viewOf(drafts, draftId), code: opts.code ?? drafts.code(draftId), evidence: opts.evidence !== undefined ? opts.evidence : readEvidence(drafts.main.root) }, null);
  writeReview(dir, draftId, state);
  return state;
}

function itemOf(state: ReviewState, key: string): ReviewItem {
  splitKey(key);
  const item = state.items[key];
  if (!item) throw new NotFound(`No review item "${key}" in this draft.`);
  return item;
}

/** Check one item again (`itemKey`), or every item (null): its level is computed afresh from the draft as it is now. */
export function verifyAgain(drafts: Drafts, draftId: string, itemKey: string | null, opts: ReviewOptions = {}): ReviewState {
  const l = load(drafts, draftId, opts);
  if (itemKey !== null) itemOf(l.state, itemKey);
  recheck(l, itemKey === null ? null : [itemKey]);
  writeReview(drafts.main.dir, draftId, l.state);
  return l.state;
}

export interface DecisionResult {
  review: ReviewState;
  /** Unit keys reset in the draft (a reject). */
  reverted: string[];
  /** Other items a reject took out of the draft with it (marked rejected too). */
  alsoRejected: string[];
}

/**
 * Accept, reject or reset one item; `by` is recorded. Accepting works at any level (this is the explicit
 * accept an unverified item needs). Rejecting resets the item's change in the draft with what depends on it
 * (one undo step there). An item no longer in the draft (rejected, or undone) can only be rejected.
 */
export function setDecision(drafts: Drafts, draftId: string, itemKey: string, decision: ReviewDecision, by: string | null, opts: ReviewOptions = {}): DecisionResult {
  if (!REVIEW_DECISIONS.includes(decision)) throw new ModelError(`A decision is one of ${REVIEW_DECISIONS.join(", ")}.`);
  const l = load(drafts, draftId, opts);
  const item = itemOf(l.state, itemKey);
  const before = liveItems(drafts, draftId, l.state);
  const mark = (i: ReviewItem, d: ReviewDecision) => {
    i.decision = d;
    if (d === "pending" || !by) delete i.by;
    else i.by = by;
  };
  let reverted: string[] = [];
  const alsoRejected: string[] = [];
  if (decision === "rejected") {
    if (before.get(itemKey)) {
      reverted = drafts.revertUnits(draftId, itemUnits(itemKey, l.view));
      const after = liveItems(drafts, draftId, l.state);
      for (const [k, live] of after) {
        if (k === itemKey || live || !before.get(k) || l.state.items[k]!.decision === "rejected") continue;
        mark(l.state.items[k]!, "rejected");
        alsoRejected.push(k);
      }
    }
    mark(item, "rejected");
  } else {
    if (!before.get(itemKey)) {
      throw new ModelError(`"${item.name || itemKey}" is no longer in the draft${item.decision === "rejected" ? " (it was rejected)" : ""}. Undo in the draft, or import again, to bring it back.`);
    }
    mark(item, decision);
  }
  writeReview(drafts.main.dir, draftId, l.state);
  return { review: l.state, reverted, alsoRejected: alsoRejected.sort() };
}

/**
 * "Accept all": every pending item still in the draft whose level, computed afresh, is verified or partly
 * verified becomes accepted (by `by`). Unverified items are skipped: they need `setDecision` one by one.
 */
export function acceptAll(drafts: Drafts, draftId: string, by: string | null, opts: ReviewOptions = {}): { review: ReviewState; accepted: string[]; skipped: string[] } {
  const l = load(drafts, draftId, opts);
  recheck(l, null);
  const live = liveItems(drafts, draftId, l.state);
  const accepted: string[] = [];
  const skipped: string[] = [];
  for (const key of Object.keys(l.state.items).sort()) {
    const item = l.state.items[key]!;
    if (item.decision !== "pending" || !live.get(key)) continue;
    if (item.level === "unverified") {
      skipped.push(key);
      continue;
    }
    item.decision = "accepted";
    if (by) item.by = by;
    accepted.push(key);
  }
  writeReview(drafts.main.dir, draftId, l.state);
  return { review: l.state, accepted, skipped };
}

/** Typed guidance for BMO on one item, or on the whole draft (`itemKey` null); stored as written, never
 *  interpreted. Text that is only spaces clears it. At most MAX_FEEDBACK characters. */
export function setFeedback(drafts: Drafts, draftId: string, itemKey: string | null, text: string): ReviewState {
  if (typeof text !== "string") throw new ModelError("Feedback must be text.");
  if (text.length > MAX_FEEDBACK) throw new ModelError(`Feedback is at most ${MAX_FEEDBACK} characters (this has ${text.length}).`);
  drafts.info(draftId);
  const dir = drafts.main.dir;
  const state = readReview(dir, draftId);
  if (!state) throw new ModelError(`Draft "${draftId}" is not an import draft: it has no review.`);
  const target: { feedback?: string; draftFeedback?: string } = itemKey === null ? state : itemOf(state, itemKey);
  const field = itemKey === null ? "draftFeedback" : "feedback";
  if (text.trim()) target[field] = text;
  else delete target[field];
  writeReview(dir, draftId, state);
  return state;
}

/** Keys of the items that wait for an explicit accept: pending and unverified. */
export function lowConfidence(state: ReviewState): string[] {
  return Object.keys(state.items)
    .filter((k) => state.items[k]!.decision === "pending" && state.items[k]!.level === "unverified")
    .sort();
}

// ------------------------------------------------------------------ hooks into Drafts.apply

/** The hooks `Drafts.apply` uses for import drafts; registered when this module loads. */
export const reviewHooks: DraftHooks = {
  applyGuard(drafts, id) {
    const state = readReview(drafts.main.dir, id);
    if (!state) return null;
    const v = viewOf(drafts, id);
    const items = new Map<string, string[]>();
    for (const [key, item] of Object.entries(state.items)) if (item.decision !== "accepted") items.set(key, itemUnits(key, v));
    return { items };
  },
  afterPartialApply(drafts, id) {
    // Accepted items that reached main are no longer the draft's changes: they leave the review.
    const state = readReview(drafts.main.dir, id);
    if (!state) return;
    const live = liveItems(drafts, id, state);
    for (const key of Object.keys(state.items)) if (state.items[key]!.decision === "accepted" && !live.get(key)) delete state.items[key];
    writeReview(drafts.main.dir, id, state);
  },
};

registerDraftHooks(reviewHooks);
