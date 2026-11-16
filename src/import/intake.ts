/**
 * The intake: the answers to the questions the code cannot give (DEC-051), saved as
 * `architecture/import/intake.json` so a re-run is repeatable and the answers are editable.
 * JSON only. The parser is strict: unknown keys are rejected and every problem names its field
 * (`scope.include[1]`). Missing fields take their defaults, so an empty or absent file is valid.
 *
 * `settings` holds the numbers the scan and the analysis use; the defaults are guesses to adjust on real
 * repositories (backlog, "Still open").
 */

import fs from "node:fs";
import path from "node:path";
import { ModelError } from "../core/ops.js";
import { atomicWrite, isObj, stableJson, type Obj } from "../core/util.js";
import type { Intake, IntakeDepth, IntakeError, IntakeSettings, KnownService } from "../shared/types.js";

export type { Intake, IntakeError, IntakeSettings };
export type Depth = IntakeDepth;
export const DEPTHS: Depth[] = ["c1", "c2", "c3", "c4"];

export const DEFAULT_SETTINGS: IntakeSettings = {
  maxFiles: 20000,
  maxFileBytes: 524288,
  maxDepth: 25,
  componentDepth: 2,
  componentMinFiles: 2,
  secondsPerItem: 20,
  stepByStep: { files: 300, containers: 5, passes: 2 },
  passBudgetTokens: 100000,
};

export function defaultIntake(): Intake {
  return {
    schemaVersion: 1,
    system: { name: "", purpose: "" },
    audience: "",
    scope: { include: [], exclude: [], otherRepos: [] },
    depth: "c4",
    ownership: "",
    runtime: "",
    glossary: [],
    mustNotOpen: [],
    services: [],
    settings: { ...DEFAULT_SETTINGS, stepByStep: { ...DEFAULT_SETTINGS.stepByStep } },
  };
}

/** Folder of the import files of a project folder (the one that holds `architecture/`). */
export function importDir(projectDir: string): string {
  return path.join(projectDir, "architecture", "import");
}

/** What `architecture/import/.gitignore` lists: the handoff folder and the typed description hold excerpts of the code and of what a person wrote, which should not be committed by accident. The import files and reviews stay committable (they are the record of a review; `checkImport` keeps secrets out of them). */
export const IMPORT_GITIGNORE = ["handoff/", "handoff-description.txt"];

/** Make sure `<importDir>/.gitignore` lists `IMPORT_GITIGNORE` (created on the first write; lines a person added are kept). */
export function ensureImportGitignore(dir: string): void {
  const file = path.join(dir, ".gitignore");
  let text = "";
  try {
    text = fs.readFileSync(file, "utf-8");
  } catch {
    // Not there yet.
  }
  const have = new Set(text.split(/\r?\n/).map((l) => l.trim()));
  const missing = IMPORT_GITIGNORE.filter((l) => !have.has(l));
  if (!missing.length) return;
  fs.mkdirSync(dir, { recursive: true });
  atomicWrite(file, `${text}${text && !text.endsWith("\n") ? "\n" : ""}${text ? "" : "# Written by dp: excerpts of the code and what people typed. Do not commit.\n"}${missing.join("\n")}\n`);
}

const MAX_TEXT = 5000;
const MAX_LIST = 500;
const MAX_GLOB = 300;
const MATCH_KEYS = ["npm", "pypi", "go", "image", "host"] as const;

class Parser {
  errors: IntakeError[] = [];
  err(p: string, message: string): void {
    this.errors.push({ path: p, message });
  }
  /** The object at `p`, or null (with an error) if it is not one. Unknown keys are errors. */
  obj(v: unknown, p: string, keys: readonly string[]): Obj | null {
    if (!isObj(v)) {
      this.err(p, "must be an object");
      return null;
    }
    for (const k of Object.keys(v)) if (!keys.includes(k)) this.err(p ? `${p}.${k}` : k, "unknown field");
    return v;
  }
  text(v: unknown, p: string, fallback: string): string {
    if (v === undefined) return fallback;
    if (typeof v !== "string") {
      this.err(p, "must be text");
      return fallback;
    }
    if (v.length > MAX_TEXT) {
      this.err(p, `must be at most ${MAX_TEXT} characters`);
      return fallback;
    }
    return v.trim();
  }
  list(v: unknown, p: string, each: (item: unknown, ip: string) => void): void {
    if (!Array.isArray(v)) {
      this.err(p, "must be a list");
      return;
    }
    if (v.length > MAX_LIST) this.err(p, `must have at most ${MAX_LIST} entries`);
    v.slice(0, MAX_LIST).forEach((x, i) => each(x, `${p}[${i}]`));
  }
  globs(v: unknown, p: string): string[] {
    const out: string[] = [];
    if (v === undefined) return out;
    this.list(v, p, (x, ip) => {
      if (typeof x !== "string" || x.trim() === "") return this.err(ip, "must be a non-empty glob");
      const g = x.trim().replace(/\\/g, "/");
      if (g.length > MAX_GLOB) return this.err(ip, `must be at most ${MAX_GLOB} characters`);
      if (g.startsWith("/") || /^[A-Za-z]:/.test(g)) return this.err(ip, "must be relative to the code root");
      if (g.split("/").includes("..")) return this.err(ip, 'must not contain ".."');
      if (g.includes("\u0000")) return this.err(ip, "must not contain a NUL character");
      out.push(g);
    });
    return out;
  }
  strings(v: unknown, p: string): string[] {
    const out: string[] = [];
    if (v === undefined) return out;
    this.list(v, p, (x, ip) => {
      if (typeof x !== "string" || x.trim() === "") return this.err(ip, "must be non-empty text");
      if (x.length > MAX_TEXT) return this.err(ip, `must be at most ${MAX_TEXT} characters`);
      out.push(x.trim());
    });
    return out;
  }
  int(v: unknown, p: string, fallback: number, min: number, max: number): number {
    if (v === undefined) return fallback;
    if (typeof v !== "number" || !Number.isInteger(v)) {
      this.err(p, "must be a whole number");
      return fallback;
    }
    if (v < min || v > max) {
      this.err(p, `must be between ${min} and ${max}`);
      return fallback;
    }
    return v;
  }
}

function parseService(ps: Parser, v: unknown, p: string): KnownService | null {
  const o = ps.obj(v, p, ["match", "system", "category", "archType"]);
  if (!o) return null;
  const system = ps.text(o.system, `${p}.system`, "");
  const category = ps.text(o.category, `${p}.category`, "");
  if (!system) ps.err(`${p}.system`, "is required");
  if (!category) ps.err(`${p}.category`, "is required");
  const m = ps.obj(o.match, `${p}.match`, MATCH_KEYS);
  const match: KnownService["match"] = {};
  if (m) {
    for (const k of MATCH_KEYS) if (m[k] !== undefined) match[k] = ps.strings(m[k], `${p}.match.${k}`);
    if (!Object.values(match).some((l) => l && l.length)) ps.err(`${p}.match`, "needs at least one name to match");
  }
  const svc: KnownService = { match, system, category };
  if (o.archType !== undefined) {
    const a = ps.text(o.archType, `${p}.archType`, "");
    if (a) svc.archType = a;
  }
  return system && category ? svc : null;
}

/**
 * Check `data` (parsed JSON) and fill in defaults. With errors, the result still holds every field that
 * was valid, but must not be used: show the errors.
 */
export function parseIntake(data: unknown): { intake: Intake; errors: IntakeError[] } {
  const d = defaultIntake();
  const ps = new Parser();
  const top = ps.obj(data, "", ["schemaVersion", "system", "audience", "scope", "depth", "ownership", "runtime", "glossary", "mustNotOpen", "services", "settings"]);
  if (!top) return { intake: d, errors: ps.errors };
  if (top.schemaVersion !== undefined && top.schemaVersion !== 1) ps.err("schemaVersion", "must be 1");

  if (top.system !== undefined) {
    const s = ps.obj(top.system, "system", ["name", "purpose"]);
    if (s) {
      d.system.name = ps.text(s.name, "system.name", "");
      d.system.purpose = ps.text(s.purpose, "system.purpose", "");
    }
  }
  d.audience = ps.text(top.audience, "audience", "");
  d.ownership = ps.text(top.ownership, "ownership", "");
  d.runtime = ps.text(top.runtime, "runtime", "");

  if (top.scope !== undefined) {
    const s = ps.obj(top.scope, "scope", ["include", "exclude", "otherRepos"]);
    if (s) {
      d.scope.include = ps.globs(s.include, "scope.include");
      d.scope.exclude = ps.globs(s.exclude, "scope.exclude");
      d.scope.otherRepos = ps.strings(s.otherRepos, "scope.otherRepos");
    }
  }

  if (top.depth !== undefined) {
    if (typeof top.depth === "string" && (DEPTHS as string[]).includes(top.depth)) d.depth = top.depth as Depth;
    else ps.err("depth", `must be one of ${DEPTHS.join(", ")}`);
  }

  if (top.glossary !== undefined) {
    ps.list(top.glossary, "glossary", (x, ip) => {
      const g = ps.obj(x, ip, ["term", "means"]);
      if (!g) return;
      const term = ps.text(g.term, `${ip}.term`, "");
      const means = ps.text(g.means, `${ip}.means`, "");
      if (!term) ps.err(`${ip}.term`, "is required");
      if (!means) ps.err(`${ip}.means`, "is required");
      if (term && means) d.glossary.push({ term, means });
    });
  }

  d.mustNotOpen = ps.globs(top.mustNotOpen, "mustNotOpen");

  if (top.services !== undefined) {
    ps.list(top.services, "services", (x, ip) => {
      const s = parseService(ps, x, ip);
      if (s) d.services.push(s);
    });
  }

  if (top.settings !== undefined) {
    const s = ps.obj(top.settings, "settings", ["maxFiles", "maxFileBytes", "maxDepth", "componentDepth", "componentMinFiles", "secondsPerItem", "stepByStep", "passBudgetTokens"]);
    if (s) {
      const st = d.settings;
      st.maxFiles = ps.int(s.maxFiles, "settings.maxFiles", st.maxFiles, 1, 1_000_000);
      st.maxFileBytes = ps.int(s.maxFileBytes, "settings.maxFileBytes", st.maxFileBytes, 1, 100_000_000);
      st.maxDepth = ps.int(s.maxDepth, "settings.maxDepth", st.maxDepth, 1, 100);
      st.componentDepth = ps.int(s.componentDepth, "settings.componentDepth", st.componentDepth, 1, 10);
      st.componentMinFiles = ps.int(s.componentMinFiles, "settings.componentMinFiles", st.componentMinFiles, 1, 1000);
      st.secondsPerItem = ps.int(s.secondsPerItem, "settings.secondsPerItem", st.secondsPerItem, 1, 3600);
      st.passBudgetTokens = ps.int(s.passBudgetTokens, "settings.passBudgetTokens", st.passBudgetTokens, 1000, 100_000_000);
      if (s.stepByStep !== undefined) {
        const t = ps.obj(s.stepByStep, "settings.stepByStep", ["files", "containers", "passes"]);
        if (t) {
          st.stepByStep.files = ps.int(t.files, "settings.stepByStep.files", st.stepByStep.files, 0, 10_000_000);
          st.stepByStep.containers = ps.int(t.containers, "settings.stepByStep.containers", st.stepByStep.containers, 0, 100_000);
          st.stepByStep.passes = ps.int(t.passes, "settings.stepByStep.passes", st.stepByStep.passes, 0, 1000);
        }
      }
    }
  }
  return { intake: d, errors: ps.errors };
}

/** The intake in its stored key order (stable, for a clean `git diff`). */
export function intakeData(i: Intake): Obj {
  return {
    schemaVersion: 1,
    system: { name: i.system.name, purpose: i.system.purpose },
    audience: i.audience,
    scope: { include: i.scope.include, exclude: i.scope.exclude, otherRepos: i.scope.otherRepos },
    depth: i.depth,
    ownership: i.ownership,
    runtime: i.runtime,
    glossary: i.glossary.map((g) => ({ term: g.term, means: g.means })),
    mustNotOpen: i.mustNotOpen,
    services: i.services.map((s) => {
      const match: Obj = {};
      for (const k of MATCH_KEYS) if (s.match[k]) match[k] = s.match[k];
      const o: Obj = { match, system: s.system, category: s.category };
      if (s.archType) o.archType = s.archType;
      return o;
    }),
    settings: {
      maxFiles: i.settings.maxFiles,
      maxFileBytes: i.settings.maxFileBytes,
      maxDepth: i.settings.maxDepth,
      componentDepth: i.settings.componentDepth,
      componentMinFiles: i.settings.componentMinFiles,
      secondsPerItem: i.settings.secondsPerItem,
      stepByStep: { files: i.settings.stepByStep.files, containers: i.settings.stepByStep.containers, passes: i.settings.stepByStep.passes },
      passBudgetTokens: i.settings.passBudgetTokens,
    },
  };
}

export const intakePath = (projectDir: string): string => path.join(importDir(projectDir), "intake.json");

/** The intake of a project folder: defaults when there is no file; `errors` when the file is not valid JSON or fails the checks. */
export function readIntake(projectDir: string): { intake: Intake; errors: IntakeError[] } {
  let text: string;
  try {
    text = fs.readFileSync(intakePath(projectDir), "utf-8");
  } catch {
    return { intake: defaultIntake(), errors: [] };
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { intake: defaultIntake(), errors: [{ path: "", message: `intake.json is not valid JSON (${(e as Error).message})` }] };
  }
  return parseIntake(data);
}

/**
 * What `next` loosens compared with `old`: entries of `mustNotOpen` and `scope.exclude` that are no longer there
 * (a changed entry counts as removed: it may open more), and the caps that grew (the files the scan walks, the
 * bytes it parses, the folder depth, the tokens one pass reads). Adding to the lists and lowering caps is
 * tightening, which anyone who may edit the intake can do. Returns plain sentences; empty: nothing is loosened.
 */
export function intakeLoosened(old: Intake, next: Intake): string[] {
  const out: string[] = [];
  for (const [what, a, b] of [
    ["must-not-open", old.mustNotOpen, next.mustNotOpen],
    ["scope.exclude", old.scope.exclude, next.scope.exclude],
  ] as const) {
    const gone = a.filter((g) => !b.includes(g));
    if (gone.length) out.push(`${gone.length === 1 ? "an entry" : `${gone.length} entries`} of ${what} would be removed or changed (${gone.map((g) => `"${g}"`).join(", ")})`);
  }
  const caps: [string, number, number][] = [
    ["the number of files scanned", old.settings.maxFiles, next.settings.maxFiles],
    ["the size of a file that is read", old.settings.maxFileBytes, next.settings.maxFileBytes],
    ["the folder depth", old.settings.maxDepth, next.settings.maxDepth],
    ["the tokens one BMO pass reads", old.settings.passBudgetTokens, next.settings.passBudgetTokens],
    ["the files in a step-by-step import", old.settings.stepByStep.files, next.settings.stepByStep.files],
  ];
  for (const [what, a, b] of caps) if (b > a) out.push(`${what} would grow from ${a} to ${b}`);
  return out;
}

/** Check and write the intake (atomic, stable key order). Throws a `ModelError` listing the field errors. */
export function writeIntake(projectDir: string, intake: unknown): Intake {
  const { intake: clean, errors } = parseIntake(intake);
  if (errors.length) throw new ModelError(`The intake is not valid: ${errors.map((e) => (e.path ? `${e.path} ${e.message}` : e.message)).join("; ")}`);
  atomicWrite(intakePath(projectDir), stableJson(intakeData(clean)));
  return clean;
}
