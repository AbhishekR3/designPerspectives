/**
 * The import readiness analysis (Stage B, DEC-051): reads only the evidence, the model, the intake and the
 * import state files, never BMO, so the same inputs always give the same numbers.
 *
 * Per C4 level it counts candidates (what the scan found), how many are decided (accepted into the model, or
 * ignored), what is left, how many items still need a description or a label, what BMO would read
 * (bytes / 4 tokens, passes of `passBudgetTokens`), and the review effort (items x seconds per item).
 * The project total adds C1 to C3; C4 files that map by path prefix are not effort, and the files outside every
 * component are reported as an upper bound.
 *
 * "Decided" means a model object matches the candidate:
 * - C1: an element (person or system) whose name has the candidate's name as a whole word (Stripe, "Stripe payments");
 * - C2: a container with the same name (or id) as the candidate, or one that maps the candidate's folder;
 * - C3: a component that maps the folder (same folder, above or below it) or has the folder's name;
 * - C4: a file under some element's code path.
 * or the candidate is in the ignore list: an entry is a candidate id (`c1:system:Stripe`) or a glob of paths
 * (a candidate is ignored when all of its paths match).
 *
 * "100%" means every candidate the scan can find is decided, not that the model is complete: `cannotSee` says
 * what the scan cannot see.
 *
 * Files in `architecture/import/`: `ignore.json` (`{"ignore": [...]}`), `levels.json` (`{"c1": false, ...}`, true =
 * final), `analysis.json` (this module's output).
 */

import fs from "node:fs";
import path from "node:path";
import { buildIndex, CODE_KEY, getJson, ModelError, slugify } from "../core/ops.js";
import type { Kind, Workspace } from "../core/workspace.js";
import { atomicWrite, isObj, stableJson } from "../core/util.js";
import { compileGlob, globMatches, LEVELS, type Evidence, type Fact, type Level } from "./scan.js";
import type { Analysis, AnalysisCandidate, AnalysisRule, LevelAnalysis, LevelState } from "../shared/types.js";
import { DEPTHS, importDir, type Intake } from "./intake.js";

// ---------------------------------------------------------------- the model snapshot

export interface ModelObject {
  id: string;
  name: string;
  kind: Kind;
  parent: string | null;
  external: boolean;
  description: string;
  technology: string;
  codePaths: string[];
}

export interface ModelRel {
  id: string;
  source: string;
  target: string;
  description: string;
}

export interface ModelSnapshot {
  elements: ModelObject[];
  relationships: ModelRel[];
}

/** What the analysis needs of a workspace. */
export function snapshotModel(ws: Workspace): ModelSnapshot {
  const idx = buildIndex(ws);
  const elements: ModelObject[] = [];
  for (const [id, el] of idx.elements) {
    elements.push({
      id,
      name: el.name,
      kind: idx.kind.get(id)!,
      parent: idx.parent.get(id) ?? null,
      external: idx.isExternal(id),
      description: (el.description ?? "").trim(),
      technology: (el.technology ?? "").trim(),
      codePaths: getJson<string>(el, CODE_KEY),
    });
  }
  const relationships: ModelRel[] = [];
  for (const [id, r] of idx.relationships) relationships.push({ id, source: r.sourceId, target: r.destinationId, description: (r.description ?? "").trim() });
  return { elements, relationships };
}

const LEVEL_OF_KIND: Record<Kind, Level> = { person: "c1", softwareSystem: "c1", container: "c2", component: "c3" };

/** A relationship belongs to the deeper level of its two ends. */
function relLevel(m: ModelSnapshot, r: ModelRel): Level {
  const kinds = new Map(m.elements.map((e) => [e.id, e.kind]));
  const a = LEVEL_OF_KIND[kinds.get(r.source) ?? "softwareSystem"];
  const b = LEVEL_OF_KIND[kinds.get(r.target) ?? "softwareSystem"];
  return LEVELS.indexOf(a) >= LEVELS.indexOf(b) ? a : b;
}

const isPlaceholderLabel = (d: string): boolean => d === "" || /^uses?$/i.test(d);

// ---------------------------------------------------------------- state files

export interface ImportState {
  /** Candidate ids and globs of paths that are not part of this system. */
  ignore: string[];
  /** true = the level was marked final. */
  levels: Record<Level, boolean>;
}

export interface AnalyseState extends ImportState {
  /** Low-confidence review items waiting, per level (from the review state of a draft). */
  lowConfidence?: Partial<Record<Level, number>>;
}

export function defaultState(): ImportState {
  return { ignore: [], levels: { c1: false, c2: false, c3: false, c4: false } };
}

const ignorePath = (dir: string) => path.join(importDir(dir), "ignore.json");
const levelsPath = (dir: string) => path.join(importDir(dir), "levels.json");

function readJsonFile(file: string): unknown {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf-8");
  } catch {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ModelError(`${path.basename(file)} is not valid JSON.`);
  }
}

function cleanIgnore(list: unknown[]): string[] {
  const out = new Set<string>();
  for (const x of list) {
    if (typeof x !== "string" || !x.trim() || x.length > 300) throw new ModelError("Every ignore entry must be non-empty text of at most 300 characters.");
    const v = x.trim().replace(/\\/g, "/");
    if (v.startsWith("/") || v.split("/").includes("..") || v.includes("\u0000")) throw new ModelError(`The ignore entry "${v}" must be a path or glob inside the code folder.`);
    out.add(v);
  }
  return [...out].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** The ignore list and the final flags of a project folder; defaults when the files are missing. */
export function readState(projectDir: string): ImportState {
  const state = defaultState();
  const ig = readJsonFile(ignorePath(projectDir));
  if (ig !== undefined) {
    if (!isObj(ig) || !Array.isArray(ig.ignore)) throw new ModelError('ignore.json must look like {"ignore": ["path", ...]}.');
    state.ignore = cleanIgnore(ig.ignore);
  }
  const lv = readJsonFile(levelsPath(projectDir));
  if (lv !== undefined) {
    if (!isObj(lv)) throw new ModelError('levels.json must look like {"c1": false, "c2": false, ...}.');
    for (const l of LEVELS) {
      if (lv[l] === undefined) continue;
      if (typeof lv[l] !== "boolean") throw new ModelError(`levels.json: ${l} must be true or false.`);
      state.levels[l] = lv[l] as boolean;
    }
  }
  return state;
}

/** Write `ignore.json` and `levels.json` (atomic, stable order). */
export function writeState(projectDir: string, state: ImportState): void {
  atomicWrite(ignorePath(projectDir), stableJson({ ignore: cleanIgnore(state.ignore) }));
  atomicWrite(levelsPath(projectDir), stableJson({ c1: !!state.levels.c1, c2: !!state.levels.c2, c3: !!state.levels.c3, c4: !!state.levels.c4 }));
}

// ---------------------------------------------------------------- the analysis

export type { Analysis, LevelAnalysis, LevelState };
export type Candidate = AnalysisCandidate;
export type Rule = AnalysisRule;

const slug = (s: string): string => slugify(s);
const wordIn = (hay: string, needle: string): boolean => !!needle && `-${hay}-`.includes(`-${needle}-`);
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A model code path covers `rel` (the same file, or a folder above it). */
const covers = (codePath: string, rel: string): boolean => {
  const c = codePath.replace(/\/+$/, "");
  return c !== "" && (rel === c || rel.startsWith(c + "/"));
};
/** Two paths are the same, or one is inside the other. */
const related = (a: string, b: string): boolean => covers(a, b) || covers(b, a);
const dirOf = (rel: string): string => (path.posix.dirname(rel) === "." ? "" : path.posix.dirname(rel));

const C2_PRIORITY = ["datastore", "queue", "compose-service", "dockerfile", "k8s-workload", "serverless-function", "package-entry", "python-script"];

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(it);
  }
  return m;
}

const INTAKE_QUESTIONS: [string, (i: Intake) => string][] = [
  ["system.name", (i) => i.system.name],
  ["system.purpose", (i) => i.system.purpose],
  ["audience", (i) => i.audience],
  ["ownership", (i) => i.ownership],
  ["runtime", (i) => i.runtime],
];

export function analyse(evidence: Evidence, model: ModelSnapshot, intake: Intake, state: AnalyseState): Analysis {
  const st = intake.settings;
  const ignoreIds = new Set(state.ignore);
  const ignoreGlobs = state.ignore.filter((g) => !/^c[1-4]:/.test(g)).map((g) => compileGlob(g));
  const pathIgnored = (p: string) => ignoreGlobs.some((g) => globMatches(g, p));
  const size = new Map<string, number>(evidence.files.sizes);
  const sourceBytes = new Map<string, number>();
  const factsOf = (level: Level): Fact[] => evidence.facts.filter((f) => f.level === level);
  const c4 = factsOf("c4");
  for (const f of c4) sourceBytes.set(f.path, Number(/^(\d+) bytes/.exec(f.detail ?? "")?.[1] ?? 0));
  const bytesOf = (paths: string[]): number => [...new Set(paths)].reduce((n, p) => n + (size.get(p) ?? sourceBytes.get(p) ?? 0), 0);

  const els = model.elements;
  const ofKind = (...k: Kind[]) => els.filter((e) => k.includes(e.kind));
  const decide = (c: Candidate, matcher: ModelObject | undefined) => {
    if (ignoreIds.has(c.id) || (c.paths.length > 0 && c.paths.every(pathIgnored))) c.status = "ignored";
    else if (matcher) {
      c.status = "accepted";
      c.matchedBy = matcher.id;
    }
  };
  const fresh = (level: Level, kind: string, name: string, id: string, facts: Fact[], paths = facts.map((f) => f.path)): Candidate => ({
    id,
    level,
    kind,
    name,
    paths: [...new Set(paths)].sort(cmp),
    bytes: 0,
    status: "left",
    factIds: facts.map((f) => f.id),
  });

  // ---- C1
  const c1: Candidate[] = [];
  const c1facts = factsOf("c1");
  const bySystem = groupBy(
    c1facts.filter((f) => f.system && (f.kind === "service-dependency" || f.kind === "service-host")),
    (f) => f.system!,
  );
  const c1els = ofKind("person", "softwareSystem");
  for (const [system, fs_] of [...bySystem].sort((a, b) => cmp(a[0], b[0]))) {
    const c = fresh("c1", "system", system, `c1:system:${system}`, fs_);
    decide(
      c,
      c1els.find((e) => slug(e.id) === slug(system) || wordIn(slug(e.name), slug(system))),
    );
    c1.push(c);
  }
  const textOf = (e: ModelObject) => `${e.name} ${e.description}`.toLowerCase();
  const relText = model.relationships.map((r) => r.description.toLowerCase());
  for (const [host, fs_] of [
    ...groupBy(
      c1facts.filter((f) => f.kind === "external-host"),
      (f) => f.name,
    ),
  ].sort((a, b) => cmp(a[0], b[0]))) {
    const c = fresh("c1", "host", host, `c1:host:${host}`, fs_);
    const labels = host.split(".");
    const word = slug(labels[Math.max(0, labels.length - 2)]!);
    decide(
      c,
      c1els.find((e) => slug(e.id) === slug(host) || wordIn(slug(e.name), word)),
    );
    c1.push(c);
  }
  for (const [route, fs_] of [
    ...groupBy(
      c1facts.filter((f) => f.kind === "webhook-route"),
      (f) => f.name,
    ),
  ].sort((a, b) => cmp(a[0], b[0]))) {
    const c = fresh("c1", "webhook", route, `c1:webhook:${route}`, fs_);
    const r = route.toLowerCase();
    decide(
      c,
      c1els.find((e) => slug(e.id) === slug(route) || textOf(e).includes(r)),
    );
    if (c.status === "left" && relText.some((t) => t.includes(r))) c.status = "accepted";
    c1.push(c);
  }
  for (const c of c1) c.bytes = bytesOf(c.paths);

  // ---- C2
  const c2: Candidate[] = [];
  const c2facts = factsOf("c2");
  const containers = ofKind("container");
  for (const [key, fs_] of [...groupBy(c2facts, (f) => (f.name === "." ? "root" : slug(f.name)))].sort((a, b) => cmp(a[0], b[0]))) {
    const kind = C2_PRIORITY.find((k) => fs_.some((f) => f.kind === k)) ?? fs_[0]!.kind;
    const first = fs_.find((f) => f.kind === kind)!;
    const c = fresh("c2", kind, first.name, `c2:${key}`, fs_);
    const dirs = c.paths.map(dirOf).filter(Boolean);
    const system = fs_.find((f) => f.system)?.system;
    const match = containers.find(
      (e) => slug(e.id) === key || slug(e.name) === key || (system !== undefined && slug(e.name) === slug(system)) || e.codePaths.some((p) => dirs.some((d) => related(p, d))),
    );
    decide(c, match);
    c2.push(c);
  }
  for (const c of c2) c.bytes = bytesOf(c.paths);

  // ---- C3
  const c3: Candidate[] = [];
  const comps = factsOf("c3");
  const compDirs = new Set(comps.map((f) => f.path));
  const owner = (rel: string): string | null => {
    for (let d = dirOf(rel); d; d = dirOf(d)) if (compDirs.has(d)) return d;
    return null;
  };
  const dirBytes = new Map<string, number>();
  for (const f of c4) {
    const o = owner(f.path);
    if (o) dirBytes.set(o, (dirBytes.get(o) ?? 0) + (sourceBytes.get(f.path) ?? 0));
  }
  const components = ofKind("component");
  for (const f of comps) {
    const c = fresh("c3", "component-dir", f.name, `c3:${f.path}`, [f], [f.path]);
    decide(
      c,
      components.find((e) => e.codePaths.some((p) => related(p, f.path)) || slug(e.name) === slug(path.posix.basename(f.path)) || slug(e.name) === slug(f.path)),
    );
    c.bytes = dirBytes.get(f.path) ?? 0;
    c3.push(c);
  }

  // ---- C4
  const unmapped: string[] = [];
  let mapped = 0;
  let ignoredFiles = 0;
  const allPaths = els.flatMap((e) => e.codePaths);
  for (const f of [...c4].sort((a, b) => cmp(a.path, b.path))) {
    if (pathIgnored(f.path)) ignoredFiles++;
    else if (allPaths.some((p) => covers(p, f.path))) mapped++;
    else unmapped.push(f.path);
  }

  // ---- levels
  const depthIdx = DEPTHS.indexOf(intake.depth);
  const notAnalysable = Object.values(evidence.files.notAnalysable).reduce((a, b) => a + b, 0);
  const levels: LevelAnalysis[] = LEVELS.map((level): LevelAnalysis => {
    const items = level === "c1" ? c1 : level === "c2" ? c2 : level === "c3" ? c3 : [];
    const isC4 = level === "c4";
    const accepted = isC4 ? mapped : items.filter((c) => c.status === "accepted").length;
    const ignored = isC4 ? ignoredFiles : items.filter((c) => c.status === "ignored").length;
    const candidates = isC4 ? c4.length : items.length;
    const decided = accepted + ignored;
    const undecided = candidates - decided;
    const objs = els.filter((e) => LEVEL_OF_KIND[e.kind] === level);
    const needDescription = isC4 ? 0 : objs.filter((e) => e.description === "").length;
    const needLabel = isC4 ? 0 : model.relationships.filter((r) => relLevel(model, r) === level && isPlaceholderLabel(r.description)).length;
    const left = undecided + needDescription + needLabel;
    const lowConfidence = state.lowConfidence?.[level] ?? 0;
    const effortItems = isC4 ? 0 : left + lowConfidence;
    // What BMO would read: C1 the manifests, samples and documents the facts come from, plus the top-level and docs/ markdown; C2 its files; C3 the source of the components.
    let bytes = 0;
    if (level === "c1") {
      const docs = evidence.files.sizes.filter(([p]) => p.endsWith(".md") && ["", "docs"].includes(dirOf(p).split("/")[0]!)).map(([p]) => p);
      bytes = bytesOf([...c1facts.map((f) => f.path), ...docs]);
    } else if (level === "c2") bytes = bytesOf(c2facts.map((f) => f.path));
    else if (level === "c3") bytes = c3.reduce((n, c) => n + c.bytes, 0);
    const tokens = Math.ceil(bytes / 4);
    const level_i = LEVELS.indexOf(level);
    const final = state.levels[level];
    const started = decided > 0 || (!isC4 && objs.length > 0 && level !== "c1");
    const inScope = level_i <= depthIdx;
    const la: LevelAnalysis = {
      level,
      state: !inScope ? "stopped here" : final ? "final" : started ? "in progress" : "not started",
      inScope,
      candidates,
      accepted,
      ignored,
      decided,
      undecided,
      needDescription,
      needLabel,
      left,
      percent: decided + left ? Math.round((100 * decided) / (decided + left)) : 100,
      percentIsCeiling: level === "c3" && notAnalysable > 0,
      lowConfidence,
      effortItems,
      reviewMinutes: Math.round(((effortItems * st.secondsPerItem) / 60) * 10) / 10,
      bytes,
      tokens,
      passes: tokens ? Math.ceil(tokens / st.passBudgetTokens) : 0,
      items,
    };
    if (isC4) {
      la.unmapped = unmapped.slice(0, 200);
      la.unmappedTotal = unmapped.length;
    }
    return la;
  });

  // ---- totals
  const counted = levels.filter((l) => l.inScope && l.level !== "c4");
  const unanswered = INTAKE_QUESTIONS.filter(([, get]) => get(intake) === "").map(([name]) => name);
  const answered = INTAKE_QUESTIONS.length - unanswered.length;
  const sum = (f: (l: LevelAnalysis) => number) => counted.reduce((n, l) => n + f(l), 0);
  const decidedTotal = sum((l) => l.decided) + answered;
  const leftTotal = sum((l) => l.left) + unanswered.length;
  const effortItems = sum((l) => l.effortItems) + unanswered.length;
  const tokens = sum((l) => l.tokens);
  const c4level = levels[3]!;
  const analysis: Analysis = {
    schemaVersion: 1,
    depth: intake.depth,
    levels,
    totals: {
      candidates: sum((l) => l.candidates) + INTAKE_QUESTIONS.length,
      decided: decidedTotal,
      left: leftTotal,
      percent: decidedTotal + leftTotal ? Math.round((100 * decidedTotal) / (decidedTotal + leftTotal)) : 100,
      effortItems,
      reviewMinutes: Math.round(((effortItems * st.secondsPerItem) / 60) * 10) / 10,
      tokens,
      passes: sum((l) => l.passes),
      intakeUnanswered: unanswered,
      unmappedFiles: c4level.unmappedTotal ?? 0,
    },
    recommendation: { mode: "one-go", rules: [] },
    cannotSee: [],
    broken: [],
  };

  // ---- recommendation: fixed rules, thresholds from the settings
  const maxPasses = Math.max(0, ...levels.filter((l) => l.level !== "c4").map((l) => l.passes));
  const rules: Rule[] = [
    { rule: "more source files than the threshold", value: c4.length, threshold: st.stepByStep.files },
    { rule: "more container candidates than the threshold", value: c2.length, threshold: st.stepByStep.containers },
    { rule: "a file language whose imports are not read", value: notAnalysable, threshold: 0 },
    { rule: "other repositories belong to the same system", value: intake.scope.otherRepos.length, threshold: 0 },
    { rule: "one level needs more BMO passes than the threshold", value: maxPasses, threshold: st.stepByStep.passes },
  ].map((r) => ({ ...r, fired: r.value > r.threshold }));
  analysis.recommendation = { mode: rules.some((r) => r.fired) ? "step-by-step" : "one-go", rules };

  // ---- what the scan cannot see
  const cs = analysis.cannotSee;
  for (const [lang, n] of Object.entries(evidence.files.notAnalysable))
    cs.push(`${n} ${lang} file(s): imports between them are not read, so component edges are unknown and the C3 percent is a ceiling`);
  if (evidence.files.binary) cs.push(`${evidence.files.binary} binary file(s) were counted but not read`);
  if (evidence.notParsed.length) cs.push(`${evidence.notParsed.length} file(s) could not be parsed or read (see notParsed in the evidence)`);
  if (evidence.limits.length) cs.push(`${evidence.limits.length} scan limit(s) were hit (see limits in the evidence): the evidence is incomplete`);
  if (intake.scope.otherRepos.length) cs.push(`other repositories (${intake.scope.otherRepos.join(", ")}) are not scanned; what they provide looks like an external system`);
  cs.push("hidden files and folders (names that start with a dot) are never read");
  cs.push("people, manual steps, scheduled jobs set up in a console and systems outside the repository are not counted");

  // ---- final levels that rest on undecided earlier levels
  for (const l of levels) {
    if (!state.levels[l.level]) continue;
    for (const e of levels.slice(0, LEVELS.indexOf(l.level))) {
      if (!state.levels[e.level]) analysis.broken.push(`${l.level} is final but ${e.level} is not`);
      else if (e.undecided > 0) analysis.broken.push(`${l.level} is final but ${e.undecided} ${e.level} candidate(s) are undecided`);
    }
  }
  return analysis;
}

/**
 * The conditions that keep a level from being finalized (backlog, "Finalizing a level"), as sentences; empty
 * means it can be. `checkErrors`: the `dp check` errors at that level (the caller runs the check). The last
 * condition, the user pressing "Finalize", is the action itself.
 */
export function canFinalize(level: Level, analysis: Analysis, model: ModelSnapshot, checkErrors: string[], lowConfidencePending = 0): string[] {
  const la = analysis.levels.find((l) => l.level === level)!;
  const out: string[] = [];
  const list = (names: string[]) => (names.length > 5 ? `${names.slice(0, 5).join(", ")} and ${names.length - 5} more` : names.join(", "));
  if (la.undecided > 0) out.push(level === "c4" ? `${la.undecided} file(s) are not mapped to a component and not ignored` : `${la.undecided} candidate(s) are not decided`);
  if (checkErrors.length) out.push(`dp check shows ${checkErrors.length} error(s): ${checkErrors[0]}`);
  if (level !== "c4") {
    const objs = model.elements.filter((e) => LEVEL_OF_KIND[e.kind] === level);
    const noDesc = objs.filter((e) => e.description === "").map((e) => e.name);
    if (noDesc.length) out.push(`${noDesc.length} object(s) have no description: ${list(noDesc)}`);
    const noTech = objs.filter((e) => (e.kind === "container" || e.kind === "component") && e.technology === "").map((e) => e.name);
    if (noTech.length) out.push(`${noTech.length} object(s) have no technology: ${list(noTech)}`);
    const labels = model.relationships.filter((r) => relLevel(model, r) === level && isPlaceholderLabel(r.description)).map((r) => r.id);
    if (labels.length) out.push(`${labels.length} relationship(s) have no label or only "uses": ${list(labels)}`);
  }
  if (lowConfidencePending > 0) out.push(`${lowConfidencePending} low-confidence item(s) are waiting for a decision`);
  return out;
}

// ---------------------------------------------------------------- storage

export const analysisPath = (projectDir: string): string => path.join(importDir(projectDir), "analysis.json");

/** Write `architecture/import/analysis.json` (atomic, stable formatting, no timestamps). */
export function writeAnalysis(projectDir: string, analysis: Analysis): void {
  atomicWrite(analysisPath(projectDir), stableJson(analysis));
}
