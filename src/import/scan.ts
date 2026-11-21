/**
 * The deterministic scan behind the import (Stage B, COD-02): what a code folder shows about its own
 * architecture, with no model and no network. `scanRepo` walks the code through a `CodeSource` only
 * (so it stays inside the code root, resolves symlinks and never opens hidden paths, SEC-02) and writes
 * down facts, each with a file path, per C4 level:
 *
 * - C1: `service-dependency` (a dependency that is in the known-services list), `service-host` /
 *   `external-host` (a host in a URL of a configuration sample), `env-var` (a variable NAME in a sample or
 *   a compose `environment:`), `webhook-route` (a path string with "webhook"), `codeowner`.
 * - C2: `dockerfile`, `compose-service`, `datastore` and `queue` (compose services whose image is a known
 *   infrastructure product), `k8s-workload`, `package-entry`, `python-script`, `serverless-function`.
 * - C3: `component-dir` (a folder under a container's source root with enough source files); the import
 *   edges between those folders are in `imports`.
 * - C4: `source-file` (every source file; mapped to a component by path prefix later).
 *
 * Readers are narrow, line-level readers (no YAML or TOML library). What a reader cannot parse is listed in
 * `notParsed`, never guessed. Secret VALUES never enter the evidence: only variable names and host names.
 * The result is deterministic: sorted, POSIX paths relative to the code root, no timestamps.
 */

import fs from "node:fs";
import path from "node:path";
import { SKIP_DIRS, scanImports } from "../core/codeMap.js";
import type { CodeSource } from "../core/codeFiles.js";
import { atomicWrite, isObj, stableJson } from "../core/util.js";
import { SECRET_FIELD } from "../shared/secretFields.js";
import type { ScanFact, ScanLevel, ScanLimit } from "../shared/types.js";
import { importDir, type Intake } from "./intake.js";
import { INFRA_CATEGORIES, matchService, type KnownService } from "./knownServices.js";

const posix = path.posix;

export type Level = ScanLevel;
export const LEVELS: Level[] = ["c1", "c2", "c3", "c4"];

export type Fact = ScanFact;
export type Limit = ScanLimit;

export interface Evidence {
  schemaVersion: 1;
  codeRoot: ".";
  facts: Fact[];
  files: {
    total: number;
    byLanguage: Record<string, number>;
    /** Source files in languages whose imports are not read, by language. */
    notAnalysable: Record<string, number>;
    binary: number;
    /** Folders and files left out by a rule (the rule is the reason). */
    skipped: { path: string; reason: string }[];
    /** Size in bytes of the non-source files that were read (manifests, samples, compose, markdown). Source file sizes are in the `source-file` facts. */
    sizes: [string, number][];
  };
  /** [from folder, to folder, number of file imports] between component folders. */
  imports: [string, string, number][];
  notParsed: { path: string; reason: string }[];
  limits: Limit[];
}

export interface ScanOptions {
  /** Source roots of accepted containers (relative to the code root); used for the components instead of the roots the scan found. */
  containerRoots?: string[];
}

// ---------------------------------------------------------------- languages

const LANG_BY_EXT: Record<string, string> = {
  ".py": "python",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".java": "java",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".go": "go",
  ".rs": "rust",
  ".cs": "csharp",
  ".php": "php",
  ".rb": "ruby",
  ".swift": "swift",
  ".scala": "scala",
  ".c": "c",
  ".h": "c",
  ".cc": "cpp",
  ".cpp": "cpp",
  ".hpp": "cpp",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".md": "markdown",
  ".toml": "toml",
  ".html": "html",
  ".css": "css",
  ".scss": "css",
  ".sql": "sql",
  ".sh": "shell",
  ".txt": "text",
};
const CODE_LANGS = new Set(["python", "javascript", "typescript", "java", "kotlin", "go", "rust", "csharp", "php", "ruby", "swift", "scala", "c", "cpp"]);
/** Languages whose imports `scanImports` reads. */
const ANALYSABLE = new Set(["python", "javascript", "typescript"]);
const BINARY_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".bmp",
  ".svgz",
  ".pdf",
  ".zip",
  ".gz",
  ".tgz",
  ".tar",
  ".7z",
  ".jar",
  ".war",
  ".class",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".mp3",
  ".mp4",
  ".mov",
  ".avi",
  ".wav",
  ".pyc",
  ".wasm",
  ".sqlite",
  ".db",
]);

const EXTRA_SKIP_DIRS = new Set(["architecture", "traces", "static", "coverage", "target", "vendor", "out"]);

const langOf = (name: string): string => {
  const ext = posix.extname(name).toLowerCase();
  if (LANG_BY_EXT[ext]) return LANG_BY_EXT[ext]!;
  if (/^dockerfile/i.test(name) || /\.dockerfile$/i.test(name)) return "dockerfile";
  return "other";
};

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// ---------------------------------------------------------------- globs

/** Something that says whether a whole string matches (a regular expression for simple globs, `Nfa` for the rest). */
interface Test {
  test(s: string): boolean;
}

interface Glob {
  re: Test;
  /** No slash in the pattern: it matches a file or folder name at any depth. */
  anywhere: boolean;
  segs: string[];
}

// The parts of a glob. s: a star (no slash), q: a question mark, a: a double star (anything), pre: a leading folder
// double star and its slash (any folders, or nothing), suf: a closing slash and double star (anything below, or nothing).
type Tok = { k: "c"; c: string } | { k: "q" } | { k: "s" } | { k: "a" } | { k: "pre" } | { k: "suf" };

function tokens(p: string): Tok[] {
  const out: Tok[] = [];
  for (let i = 0; i < p.length;) {
    if (p.startsWith("**/", i)) {
      if (out[out.length - 1]?.k !== "pre") out.push({ k: "pre" });
      i += 3;
    } else if (p.startsWith("/**", i) && i + 3 === p.length) {
      out.push({ k: "suf" });
      i += 3;
    } else if (p.startsWith("**", i)) {
      if (out[out.length - 1]?.k !== "a") out.push({ k: "a" });
      i += 2;
    } else {
      const ch = p[i]!;
      if (ch === "*") {
        if (out[out.length - 1]?.k !== "s") out.push({ k: "s" });
      } else out.push(ch === "?" ? { k: "q" } : { k: "c", c: ch });
      i++;
    }
  }
  return out;
}

const WILD = new Set(["s", "q", "a", "pre", "suf"]);

/**
 * A pattern with three or more wildcards is matched by a small automaton, not a regular expression: a
 * backtracking engine takes exponential time on `*a*a*a*a*…` against a long name, and both the pattern (the
 * intake) and the names (the repository) come from outside. The automaton does at most (characters × parts) steps.
 */
class Nfa implements Test {
  constructor(private readonly toks: Tok[]) {}
  test(str: string): boolean {
    const toks = this.toks;
    const n = toks.length;
    // `cur[i]`: before token i. `inner[i]`: inside the folders of a `pre` (or the rest of a `suf`) at token i.
    let cur = new Uint8Array(n + 1);
    let inner = new Uint8Array(n + 1);
    const close = () => {
      for (let i = 0; i < n; i++) {
        const k = toks[i]!.k;
        if (cur[i] && (k === "s" || k === "a" || k === "pre" || k === "suf")) cur[i + 1] = 1;
        if (inner[i] && k === "suf") cur[i + 1] = 1;
      }
    };
    cur[0] = 1;
    close();
    for (const ch of str) {
      const next = new Uint8Array(n + 1);
      const nextInner = new Uint8Array(n + 1);
      for (let i = 0; i < n; i++) {
        const t = toks[i]!;
        if (cur[i]) {
          if (t.k === "c") {
            if (ch === t.c) next[i + 1] = 1;
          } else if (t.k === "q") {
            if (ch !== "/") next[i + 1] = 1;
          } else if (t.k === "s") {
            if (ch !== "/") next[i] = 1;
          } else if (t.k === "a") next[i] = 1;
          else if (t.k === "pre") {
            nextInner[i] = 1;
            if (ch === "/") next[i + 1] = 1;
          } else if (ch === "/") nextInner[i] = 1;
        }
        if (inner[i]) {
          if (t.k === "pre") {
            nextInner[i] = 1;
            if (ch === "/") next[i + 1] = 1;
          } else nextInner[i] = 1;
        }
      }
      cur = next;
      inner = nextInner;
      close();
    }
    return cur[n] === 1;
  }
}

const regexOf = (toks: Tok[]): RegExp => {
  let s = "";
  for (const t of toks) {
    if (t.k === "c") s += t.c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    else s += t.k === "q" ? "[^/]" : t.k === "s" ? "[^/]*" : t.k === "a" ? ".*" : t.k === "pre" ? "(?:.*/)?" : "(?:/.*)?";
  }
  return new RegExp(`^${s}$`);
};

function matcher(toks: Tok[]): Test {
  return toks.filter((t) => WILD.has(t.k)).length >= 3 ? new Nfa(toks) : regexOf(toks);
}

function segMatcher(seg: string): Test {
  return matcher(tokens(seg.replace(/\*\*/g, "*")).filter((t) => t.k !== "pre" && t.k !== "suf"));
}

/** A small glob: `*` (within a name), `**` (across folders) and `?`. A pattern without "/" matches names at any depth. */
export function compileGlob(pattern: string): Glob {
  let p = pattern.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
  const anywhere = !p.includes("/");
  p = p || "*";
  return { re: matcher(tokens(p)), anywhere, segs: p.split("/") };
}

/** Whether the glob matches `rel` itself or any folder above it. */
export function globMatches(g: Glob, rel: string): boolean {
  const parts = rel.split("/");
  for (let n = 1; n <= parts.length; n++) {
    const sub = parts.slice(0, n).join("/");
    if (g.anywhere ? g.re.test(parts[n - 1]!) : g.re.test(sub)) return true;
  }
  return false;
}

/** Whether something under folder `dir` could still match the glob (so the folder must be walked). */
function globCouldMatchUnder(g: Glob, dir: string): boolean {
  if (g.anywhere) return true;
  const parts = dir.split("/");
  for (let i = 0; i < parts.length; i++) {
    const seg = g.segs[i];
    if (seg === undefined) return false;
    if (seg === "**") return true;
    if (!segMatcher(seg).test(parts[i]!)) return false;
  }
  return true;
}

// ---------------------------------------------------------------- small text helpers

const unq = (v: string): string => v.trim().replace(/^(["'])(.*)\1$/, "$2");

/** `text` up to a comment that starts with `#` outside quotes. */
function stripComment(line: string): string {
  let q = "";
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (q) {
      if (c === q) q = "";
    } else if (c === '"' || c === "'") q = c;
    else if (c === "#" && (i === 0 || /\s/.test(line[i - 1]!))) return line.slice(0, i);
  }
  return line;
}

const lineOf = (text: string, needle: string): number | undefined => {
  const i = text.indexOf(needle);
  if (i < 0) return undefined;
  let n = 1;
  for (let k = 0; k < i; k++) if (text.charCodeAt(k) === 10) n++;
  return n;
};

/** The host of a URL value, or null: no credentials, no ports, only names with a dot that are not placeholders or addresses. */
export function hostOf(value: string): string | null {
  const m = /^[a-z][a-z0-9+.-]*:\/\/(?:[^/@\s]*@)?([^/:?#\s]+)/i.exec(unq(value));
  if (!m) return null;
  const h = m[1]!.toLowerCase().replace(/\.$/, "");
  if (!h.includes(".") || /^[0-9.]+$/.test(h) || h === "localhost" || /(^|\.)example\.(com|org|net)$/.test(h) || h.endsWith(".localhost")) return null;
  if (!/^[a-z0-9.-]+$/.test(h)) return null;
  return h;
}

// ---------------------------------------------------------------- readers

interface Dep {
  name: string;
  line?: number;
}

/** Dependency names in a package.json, or null if it is not valid JSON. */
function readPackageJson(text: string): { name: string; deps: Dep[]; entry: string[] } | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(data)) return null;
  const deps: Dep[] = [];
  for (const k of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    const o = data[k];
    if (isObj(o)) for (const name of Object.keys(o)) deps.push({ name, line: lineOf(text, JSON.stringify(name)) });
  }
  const entry: string[] = [];
  if (data.bin !== undefined && data.bin !== null && data.bin !== "") entry.push("bin");
  if (typeof data.main === "string" && data.main) entry.push(`main=${data.main}`);
  const scripts = data.scripts;
  if (isObj(scripts) && typeof scripts.start === "string") entry.push("scripts.start");
  return { name: typeof data.name === "string" ? data.name : "", deps, entry };
}

function requirementName(spec: string): string | null {
  const m = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(spec);
  return m ? m[1]! : null;
}

function readRequirements(text: string): Dep[] {
  const out: Dep[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const hash = raw.search(/\s#/);
    const line = (hash >= 0 ? raw.slice(0, hash) : raw).trim();
    if (!line || line.startsWith("#") || line.startsWith("-") || /^(git\+|https?:|\.|\/)/.test(line)) return;
    const name = requirementName(line);
    if (name) out.push({ name, line: i + 1 });
  });
  return out;
}

const quoted = (s: string): string[] => [...s.replace(/\{[^}]*\}/g, "").matchAll(/"([^"]*)"|'([^']*)'/g)].map((m) => m[1] ?? m[2] ?? "");

/** Dependencies and scripts of a pyproject.toml by section and line (no TOML library). */
function readPyproject(text: string): { deps: Dep[]; scripts: { name: string; target: string; line: number }[]; dynamicDeps: boolean } {
  const deps: Dep[] = [];
  const scripts: { name: string; target: string; line: number }[] = [];
  let dynamicDeps = false;
  let section = "";
  let inArray = false;
  const addSpecs = (line: string, n: number) => {
    for (const q of quoted(line)) {
      const name = requirementName(q);
      if (name) deps.push({ name, line: n });
    }
  };
  text.split(/\r?\n/).forEach((raw, i) => {
    const n = i + 1;
    const line = stripComment(raw).trim();
    if (!line) return;
    const head = /^\[\[?([^\]]+)\]\]?$/.exec(line);
    if (!inArray && head) {
      section = head[1]!.replace(/\s+/g, "");
      return;
    }
    if (inArray) {
      addSpecs(line, n);
      if (line.replace(/"[^"]*"|'[^']*'/g, "").includes("]")) inArray = false;
      return;
    }
    const kv = /^("[^"]+"|'[^']+'|[A-Za-z0-9_.-]+)\s*=\s*(.*)$/.exec(line);
    if (!kv) return;
    const key = unq(kv[1]!);
    const rest = kv[2]!;
    const arrays = section === "project" ? key === "dependencies" : section === "project.optional-dependencies" || section === "dependency-groups";
    if (section === "project" && key === "dynamic" && /dependencies/.test(rest)) dynamicDeps = true;
    if (arrays && rest.startsWith("[")) {
      addSpecs(rest, n);
      if (!rest.replace(/"[^"]*"|'[^']*'/g, "").includes("]")) inArray = true;
    } else if (/^tool\.poetry\.(group\.[^.]+\.)?(dev-)?dependencies$/.test(section)) {
      if (key !== "python" && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(key)) deps.push({ name: key, line: n });
    } else if (section === "project.scripts" || section === "project.gui-scripts" || section === "tool.poetry.scripts") {
      scripts.push({ name: key, target: unq(rest), line: n });
    }
  });
  return { deps, scripts, dynamicDeps };
}

function readGoMod(text: string): Dep[] {
  const out: Dep[] = [];
  let block = false;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.replace(/\/\/.*$/, "").trim();
    if (!line) return;
    if (block) {
      if (line === ")") block = false;
      else {
        const name = line.split(/\s+/)[0]!;
        if (name) out.push({ name, line: i + 1 });
      }
      return;
    }
    if (/^require\s*\($/.test(line)) block = true;
    else {
      const m = /^require\s+(\S+)\s+\S+/.exec(line);
      if (m) out.push({ name: m[1]!, line: i + 1 });
    }
  });
  return out;
}

interface Entry {
  indent: number;
  text: string;
  line: number;
}

function entriesOf(text: string): Entry[] {
  const out: Entry[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const t = stripComment(raw).trimEnd();
    if (!t.trim()) return;
    out.push({ indent: t.length - t.trimStart().length, text: t.trim(), line: i + 1 });
  });
  return out;
}

export interface ComposeService {
  name: string;
  line: number;
  image: string;
  build: string;
  ports: string[];
  dependsOn: string[];
  env: { name: string; value: string; line: number }[];
}

const ANCHOR = /(^|:\s+)[&*][A-Za-z_][\w-]*|^<<:|^-\s+\*[\w-]+/;
const flowList = (v: string): string[] | null => (/^\[.*\]$/.test(v) ? v.slice(1, -1).split(",").map(unq).filter(Boolean) : null);

/** Services of a compose file by indentation; `problem` when the shape is outside what the reader supports. */
export function readCompose(text: string): { services: ComposeService[]; problem?: string; notes: string[] } {
  const notes: string[] = [];
  if (/^[ ]*\t/m.test(text)) return { services: [], problem: "tab indentation", notes };
  const all = entriesOf(text);
  const start = all.findIndex((e) => e.indent === 0 && e.text === "services:");
  if (start < 0) return { services: [], problem: "no top-level services: section", notes };
  const block: Entry[] = [];
  for (let i = start + 1; i < all.length && all[i]!.indent > 0; i++) block.push(all[i]!);
  if (!block.length) return { services: [], problem: "services: is empty or not a block", notes };
  if (block.some((e) => ANCHOR.test(e.text))) return { services: [], problem: "uses YAML anchors, aliases or merge keys", notes };
  const s1 = block[0]!.indent;
  if (block.some((e) => e.indent < s1)) return { services: [], problem: "inconsistent indentation", notes };
  const services: ComposeService[] = [];
  let i = 0;
  while (i < block.length) {
    const head = block[i]!;
    const m = /^([A-Za-z0-9._-]+):$/.exec(head.text);
    if (head.indent !== s1 || !m) return { services: [], problem: `line ${head.line} is not a service name`, notes };
    let j = i + 1;
    while (j < block.length && block[j]!.indent > s1) j++;
    const body = block.slice(i + 1, j);
    const svc: ComposeService = { name: m[1]!, line: head.line, image: "", build: "", ports: [], dependsOn: [], env: [] };
    const s2 = body.length ? body[0]!.indent : 0;
    for (let k = 0; k < body.length; k++) {
      const e = body[k]!;
      if (e.indent !== s2) continue;
      const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(e.text);
      if (!kv) continue;
      let c = k + 1;
      while (c < body.length && body[c]!.indent > s2) c++;
      const kids = body.slice(k + 1, c);
      const key = kv[1]!;
      const value = kv[2]!.trim();
      const kidIndent = kids.length ? kids[0]!.indent : 0;
      const direct = kids.filter((x) => x.indent === kidIndent);
      if (key === "image") svc.image = unq(value);
      else if (key === "build") {
        if (value) svc.build = unq(value);
        else {
          const ctx = direct.map((x) => /^context:\s*(.+)$/.exec(x.text)).find(Boolean);
          if (ctx) svc.build = unq(ctx[1]!);
        }
      } else if (key === "ports") {
        svc.ports = flowList(value) ?? direct.filter((x) => x.text.startsWith("- ")).map((x) => unq(x.text.slice(2)));
      } else if (key === "depends_on") {
        svc.dependsOn = flowList(value) ?? direct.map((x) => (x.text.startsWith("- ") ? unq(x.text.slice(2)) : (/^([\w.-]+):/.exec(x.text)?.[1] ?? ""))).filter(Boolean);
      } else if (key === "environment") {
        if (value.startsWith("{")) notes.push(`${svc.name}: environment given as a flow map, not read`);
        for (const x of direct) {
          const item = x.text.startsWith("- ") ? x.text.slice(2) : x.text;
          const em = x.text.startsWith("- ") ? /^([A-Za-z_][A-Za-z0-9_]*)(?:=(.*))?$/.exec(item) : /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(item);
          if (em) svc.env.push({ name: em[1]!, value: unq(em[2] ?? ""), line: x.line });
        }
      }
    }
    services.push(svc);
    i = j;
  }
  return { services, notes };
}

/** Kubernetes workloads (Deployment, StatefulSet, CronJob) by line pattern: [kind, name, line]. */
function readKubernetes(text: string): { workloads: [string, string, number][]; unnamed: number } | null {
  if (!/^apiVersion:/m.test(text) || !/^kind:/m.test(text)) return null;
  const workloads: [string, string, number][] = [];
  let unnamed = 0;
  let offset = 0;
  for (const doc of text.split(/^---[ \t]*$/m)) {
    const kind = /^kind:\s*(\S+)/m.exec(doc);
    const docLine = (needle: RegExpExecArray) => offset + doc.slice(0, needle.index).split("\n").length;
    if (kind && ["Deployment", "StatefulSet", "CronJob"].includes(kind[1]!)) {
      const lines = doc.split("\n");
      const mi = lines.findIndex((l) => /^metadata:\s*$/.test(l));
      let name = "";
      if (mi >= 0) {
        let base = -1;
        for (let k = mi + 1; k < lines.length; k++) {
          const l = lines[k]!;
          if (!l.trim() || l.trim().startsWith("#")) continue;
          const ind = l.length - l.trimStart().length;
          if (ind === 0) break;
          if (base < 0) base = ind;
          const nm = ind === base ? /^\s*name:\s*(\S+)/.exec(l) : null;
          if (nm) {
            name = unq(nm[1]!);
            break;
          }
        }
      }
      if (name && !name.includes("{{")) workloads.push([kind[1]!, name, docLine(kind)]);
      else unnamed++;
    }
    offset += doc.split("\n").length - 1;
  }
  return { workloads, unnamed };
}

/** Function names of a serverless.yml: [name, handler, line], or null when `functions:` is missing or comes from elsewhere. */
function readServerless(text: string): [string, string, number][] | null {
  const all = entriesOf(text);
  const at = all.findIndex((e) => e.indent === 0 && /^functions:\s*$/.test(e.text));
  if (at < 0) return null;
  const block: Entry[] = [];
  for (let i = at + 1; i < all.length && all[i]!.indent > 0; i++) block.push(all[i]!);
  if (!block.length) return [];
  const s1 = block[0]!.indent;
  const out: [string, string, number][] = [];
  block.forEach((e, k) => {
    if (e.indent !== s1) return;
    const m = /^([A-Za-z0-9_.-]+):$/.exec(e.text);
    if (!m) return;
    let handler = "";
    for (let c = k + 1; c < block.length && block[c]!.indent > s1; c++) {
      const h = /^handler:\s*(\S+)/.exec(block[c]!.text);
      if (h) {
        handler = unq(h[1]!);
        break;
      }
    }
    out.push([m[1]!, handler, e.line]);
  });
  return out;
}

function readDockerfile(text: string): { from: string; expose: string[] } {
  let from = "";
  const expose: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim();
    const f = /^FROM\s+(?:--\S+\s+)*(\S+)/i.exec(l);
    if (f) from = f[1]!;
    const x = /^EXPOSE\s+(.+)$/i.exec(l);
    if (x) expose.push(...x[1]!.split(/\s+/));
  }
  return { from, expose };
}

/** Variable NAMES and URL hosts of a `.env`-style sample; values are read only to find a host and are dropped. */
function readEnvSample(text: string): { name: string; host: string | null; line: number }[] {
  const out: { name: string; host: string | null; line: number }[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(raw);
    if (m) out.push({ name: m[1]!, host: hostOf(m[2]!), line: i + 1 });
  });
  return out;
}

function readCodeowners(text: string): { owner: string; pattern: string; line: number }[] {
  const out: { owner: string; pattern: string; line: number }[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const hash = raw.search(/\s#/);
    const l = (hash >= 0 ? raw.slice(0, hash) : raw).trim();
    if (!l || l.startsWith("#")) return;
    const [pattern, ...owners] = l.split(/\s+/);
    for (const o of owners) if (o.startsWith("@") || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o)) out.push({ owner: o, pattern: pattern!, line: i + 1 });
  });
  return out;
}

const WEBHOOK = /(["'`])([A-Za-z0-9_\-./:{}$<>*]*webhook[A-Za-z0-9_\-./:{}$<>*?=&%]*)\1/gi;

function webhookRoutes(text: string): { route: string; line: number }[] {
  const out: { route: string; line: number }[] = [];
  text.split(/\r?\n/).forEach((l, i) => {
    if (!/webhook/i.test(l)) return;
    for (const m of l.matchAll(WEBHOOK)) {
      const route = m[2]!.split(/[?#]/)[0]!;
      if (route.includes("/") && !route.includes("://") && route.length <= 200) out.push({ route, line: i + 1 });
    }
  });
  return out;
}

// ---------------------------------------------------------------- the scan

const isEnvSample = (name: string): boolean => /env/i.test(name) && /(example|sample|template)/i.test(name) && !CODE_LANGS.has(langOf(name)) && !["markdown", "json"].includes(langOf(name));
const isDockerfile = (name: string): boolean => /^dockerfile(\.|$)/i.test(name) || /\.dockerfile$/i.test(name);
const isCompose = (name: string): boolean => /^(docker-)?compose([.-][\w.-]+)?\.ya?ml$/i.test(name);
const isRequirements = (rel: string): boolean => /^requirements[\w.-]*\.txt$/i.test(posix.basename(rel)) || (posix.basename(posix.dirname(rel)) === "requirements" && rel.endsWith(".txt"));
const dirOf = (rel: string): string => (posix.dirname(rel) === "." ? "" : posix.dirname(rel));

/** Resolve a path written in a file at `from` (e.g. a compose build context) to a folder below the code root, or null. */
function resolveDir(from: string, ref: string): string | null {
  if (!ref || ref.includes("${") || /^[a-z]+:/i.test(ref) || ref.startsWith("/")) return null;
  const p = posix.normalize(posix.join(from || ".", ref));
  if (p.startsWith("..")) return null;
  return p === "." ? "" : p;
}

export function scanRepo(code: CodeSource, intake: Intake, options: ScanOptions = {}): Evidence {
  const st = intake.settings;
  const extra: KnownService[] = intake.services;
  const facts = new Map<string, Fact>();
  const notParsed: { path: string; reason: string }[] = [];
  const skipped: { path: string; reason: string }[] = [];
  const sizes: [string, number][] = [];
  const limitCounts = new Map<string, number>();
  const limits: Limit[] = [];
  let binary = 0;

  const limit = (kind: string, p: string | undefined, detail: string) => {
    const n = (limitCounts.get(kind) ?? 0) + 1;
    limitCounts.set(kind, n);
    if (n <= 100) limits.push(p === undefined ? { kind, detail } : { kind, path: p, detail });
  };
  const add = (f: Omit<Fact, "id">) => {
    const id = `${f.kind}:${f.path}:${f.name}`;
    const prev = facts.get(id);
    if (prev && (prev.line ?? 0) <= (f.line ?? 0)) return;
    const out: Fact = { id, level: f.level, kind: f.kind, name: f.name, path: f.path };
    if (f.line !== undefined) out.line = f.line;
    if (f.detail) out.detail = f.detail;
    if (f.system) out.system = f.system;
    facts.set(id, out);
  };

  if (!code.hasRoot) {
    return {
      schemaVersion: 1,
      codeRoot: ".",
      facts: [],
      files: { total: 0, byLanguage: {}, notAnalysable: {}, binary: 0, skipped: [], sizes: [] },
      imports: [],
      notParsed: [{ path: ".", reason: "there is no code folder to read" }],
      limits: [],
    };
  }

  // ---- walk
  const exclude = [...intake.scope.exclude].map((g) => ["scope.exclude", compileGlob(g)] as const);
  const never = intake.mustNotOpen.map((g) => ["mustNotOpen", compileGlob(g)] as const);
  const include = intake.scope.include.map((g) => compileGlob(g));
  const files: string[] = [];
  let stopped = false;

  const walk = (dir: string, depth: number): void => {
    if (stopped) return;
    let list: ReturnType<CodeSource["list"]>;
    try {
      list = [...code.list(dir)].sort((a, b) => cmp(a.name, b.name));
    } catch {
      notParsed.push({ path: dir || ".", reason: "the folder could not be listed" });
      return;
    }
    for (const e of list) {
      if (stopped) return;
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.type === "dir" && (SKIP_DIRS.has(e.name) || EXTRA_SKIP_DIRS.has(e.name))) {
        skipped.push({ path: rel, reason: "ignored folder" });
        continue;
      }
      const hit = [...never, ...exclude].find(([, g]) => globMatches(g, rel));
      if (hit) {
        skipped.push({ path: rel, reason: hit[0] });
        continue;
      }
      if (include.length && !include.some((g) => globMatches(g, rel) || (e.type === "dir" && globCouldMatchUnder(g, rel)))) continue;
      // `kind` resolves symlinks and refuses what leaves the code root, so a link to the outside is neither listed nor followed.
      const kind = code.kind(rel);
      if (kind === null) {
        notParsed.push({ path: rel, reason: "not readable: a link that leaves the code folder, a broken link or a protected path" });
        continue;
      }
      // A link into a place the intake closes opens nothing: the rules hold for where it really is.
      const real = code.resolved?.(rel);
      if (real !== undefined && real !== null && real !== rel) {
        const viaLink = [...never, ...exclude].find(([, g]) => globMatches(g, real));
        if (viaLink) {
          skipped.push({ path: rel, reason: `${viaLink[0]} (a link to ${real})` });
          continue;
        }
      }
      if (kind === "dir") {
        if (depth + 1 > st.maxDepth) limit("max-depth", rel, `not entered: deeper than ${st.maxDepth} folders`);
        else walk(rel, depth + 1);
      } else if (files.length >= st.maxFiles) {
        limit("max-files", undefined, `stopped after ${st.maxFiles} files; the rest of the tree was not scanned`);
        stopped = true;
      } else files.push(rel);
    }
  };
  walk("", 0);

  // ---- read helpers
  type Read = { text: string; bytes: number } | { big: number } | null;
  const read = (rel: string, parse: boolean): Read => {
    const text = code.read(rel);
    if (text === null) {
      notParsed.push({ path: rel, reason: "could not be read" });
      return null;
    }
    if (text.slice(0, 8192).includes("\u0000")) {
      binary++;
      return null;
    }
    const bytes = Buffer.byteLength(text, "utf-8");
    if (parse && bytes > st.maxFileBytes) {
      limit("file-too-large", rel, `${bytes} bytes is over ${st.maxFileBytes}: not parsed`);
      return { big: bytes };
    }
    return { text, bytes };
  };
  const bad = (rel: string, reason: string) => notParsed.push({ path: rel, reason });
  const service = (kind: "npm" | "pypi" | "go", d: Dep, rel: string) => {
    const svc = matchService(kind, d.name, extra);
    if (svc) add({ level: "c1", kind: "service-dependency", name: d.name, path: rel, line: d.line, detail: `${svc.category}; ${kind} dependency`, system: svc.system });
  };

  const byLanguage: Record<string, number> = {};
  const notAnalysable: Record<string, number> = {};
  const sources: { rel: string; bytes: number; lang: string; parsed: boolean }[] = [];
  const roots = new Set<string>();

  // ---- the files
  for (const rel of files) {
    const name = posix.basename(rel);
    const ext = posix.extname(name).toLowerCase();
    const lang = langOf(name);
    byLanguage[lang] = (byLanguage[lang] ?? 0) + 1;
    if (BINARY_EXT.has(ext)) {
      binary++;
      continue;
    }
    const lower = name.toLowerCase();

    if (CODE_LANGS.has(lang)) {
      const r = read(rel, true);
      if (!r) continue;
      const bytes = "big" in r ? r.big : r.bytes;
      sources.push({ rel, bytes, lang, parsed: !("big" in r) });
      if (!ANALYSABLE.has(lang)) notAnalysable[lang] = (notAnalysable[lang] ?? 0) + 1;
      if ("text" in r) for (const w of webhookRoutes(r.text)) add({ level: "c1", kind: "webhook-route", name: w.route, path: rel, line: w.line });
      continue;
    }

    if (lower === "package.json") {
      const r = read(rel, true);
      if (!r || "big" in r) continue;
      sizes.push([rel, r.bytes]);
      const pkg = readPackageJson(r.text);
      if (!pkg) {
        bad(rel, "not valid JSON");
        continue;
      }
      for (const d of pkg.deps) service("npm", d, rel);
      if (pkg.entry.length) {
        add({ level: "c2", kind: "package-entry", name: pkg.name || dirOf(rel) || ".", path: rel, detail: pkg.entry.join("; ") });
        roots.add(dirOf(rel));
      }
    } else if (lower === "pyproject.toml") {
      const r = read(rel, true);
      if (!r || "big" in r) continue;
      sizes.push([rel, r.bytes]);
      const py = readPyproject(r.text);
      for (const d of py.deps) service("pypi", d, rel);
      if (py.dynamicDeps) bad(rel, "dependencies are dynamic (set by a build tool): not read");
      for (const s of py.scripts) {
        add({ level: "c2", kind: "python-script", name: s.name, path: rel, line: s.line, detail: s.target });
        roots.add(dirOf(rel));
      }
    } else if (isRequirements(rel)) {
      const r = read(rel, true);
      if (!r || "big" in r) continue;
      sizes.push([rel, r.bytes]);
      for (const d of readRequirements(r.text)) service("pypi", d, rel);
    } else if (lower === "go.mod") {
      const r = read(rel, true);
      if (!r || "big" in r) continue;
      sizes.push([rel, r.bytes]);
      for (const d of readGoMod(r.text)) service("go", d, rel);
    } else if (isDockerfile(name)) {
      const r = read(rel, true);
      if (!r || "big" in r) continue;
      sizes.push([rel, r.bytes]);
      const d = readDockerfile(r.text);
      add({ level: "c2", kind: "dockerfile", name: dirOf(rel) || ".", path: rel, detail: [d.from && `from=${d.from}`, d.expose.length && `expose=${d.expose.join(",")}`].filter(Boolean).join("; ") });
      roots.add(dirOf(rel));
    } else if (lang === "yaml") {
      const r = read(rel, true);
      if (!r || "big" in r) continue;
      sizes.push([rel, r.bytes]);
      if (isCompose(name)) {
        const c = readCompose(r.text);
        if (c.problem) {
          bad(rel, `compose file not parsed: ${c.problem}`);
          continue;
        }
        for (const n of c.notes) bad(rel, n);
        for (const s of c.services) {
          const svc = s.image ? matchService("image", s.image, extra) : null;
          const infra = svc && INFRA_CATEGORIES.has(svc.category) ? svc : null;
          const detail = [s.image && `image=${s.image}`, s.build && `build=${s.build}`, s.ports.length && `ports=${s.ports.join(",")}`, s.dependsOn.length && `depends_on=${s.dependsOn.join(",")}`]
            .filter(Boolean)
            .join("; ");
          const kind = infra ? (infra.category === "queue" ? "queue" : "datastore") : "compose-service";
          add({ level: "c2", kind, name: s.name, path: rel, line: s.line, detail, system: infra?.system });
          if (s.build) {
            const d = resolveDir(dirOf(rel), s.build);
            if (d !== null) roots.add(d);
          }
          for (const e of s.env) {
            envFact(rel, e.name, hostOf(e.value), e.line, `compose service ${s.name}`);
          }
        }
      } else if (/^serverless\.ya?ml$/i.test(name)) {
        const fns = readServerless(r.text);
        if (fns === null) bad(rel, "no functions: section, or it comes from another file: not read");
        else
          for (const [fn, handler, line] of fns) {
            add({ level: "c2", kind: "serverless-function", name: fn, path: rel, line, detail: handler && `handler=${handler}` });
            roots.add(dirOf(rel));
          }
      } else {
        const k8s = /^kind:/m.test(r.text) && /^apiVersion:/m.test(r.text) ? readKubernetes(r.text) : null;
        if (k8s) {
          for (const [kind, n, line] of k8s.workloads) add({ level: "c2", kind: "k8s-workload", name: n, path: rel, line, detail: `kind=${kind}` });
          if (k8s.unnamed) bad(rel, `${k8s.unnamed} workload(s) without a plain metadata.name (a template?): not read`);
        }
      }
    } else if (isEnvSample(name)) {
      const r = read(rel, true);
      if (!r || "big" in r) continue;
      sizes.push([rel, r.bytes]);
      for (const v of readEnvSample(r.text)) envFact(rel, v.name, v.host, v.line, "");
    } else if (name === "CODEOWNERS" && (dirOf(rel) === "" || dirOf(rel) === "docs")) {
      const r = read(rel, true);
      if (!r || "big" in r) continue;
      sizes.push([rel, r.bytes]);
      for (const o of readCodeowners(r.text)) add({ level: "c1", kind: "codeowner", name: o.owner, path: rel, line: o.line, detail: `owns ${o.pattern}` });
    } else if (lang === "markdown") {
      const r = read(rel, false);
      if (r && "text" in r) sizes.push([rel, r.bytes]);
    }
  }

  function envFact(rel: string, name: string, host: string | null, line: number, from: string) {
    add({ level: "c1", kind: "env-var", name, path: rel, line, detail: [from, SECRET_FIELD.test(name) && "secret-like name, value not kept"].filter(Boolean).join("; ") || undefined });
    if (host) {
      const svc = matchService("host", host, extra);
      add({ level: "c1", kind: svc ? "service-host" : "external-host", name: host, path: rel, line, detail: `from ${name}`, system: svc?.system });
    }
  }

  // CODEOWNERS in a hidden folder is never opened (SEC-02); the scan cannot tell whether it exists.
  notParsed.push({ path: ".github/CODEOWNERS", reason: "hidden path, never read (SEC-02); if it exists, give the owners in the intake" });

  // ---- C4 and C3
  const parsedSources = sources.filter((s) => s.parsed);
  for (const s of sources) add({ level: "c4", kind: "source-file", name: posix.basename(s.rel), path: s.rel, detail: `${s.bytes} bytes; ${s.lang}` });

  const containerRoots = options.containerRoots?.length ? options.containerRoots.map((r) => r.replace(/^\.?\/+|\/+$/g, "")) : [...roots];
  let fallback = false;
  if (!containerRoots.length) {
    containerRoots.push("");
    fallback = true;
  }
  containerRoots.sort((a, b) => cmp(a, b));
  const direct = new Map<string, number>();
  for (const s of sources) direct.set(dirOf(s.rel), (direct.get(dirOf(s.rel)) ?? 0) + 1);
  const comps = new Map<string, string>();
  const segs = (p: string) => (p ? p.split("/").length : 0);
  for (const [d, n] of [...direct].sort((a, b) => cmp(a[0], b[0]))) {
    if (n < st.componentMinFiles || d === "") continue;
    for (const r of containerRoots) {
      const under = r === "" || d.startsWith(r + "/");
      const rel = segs(d) - segs(r);
      if (under && rel >= 1 && rel <= st.componentDepth && (!comps.has(d) || segs(r) > segs(comps.get(d)!))) comps.set(d, r);
    }
  }
  for (const [d, r] of comps) {
    add({
      level: "c3",
      kind: "component-dir",
      name: d,
      path: d,
      detail: `${direct.get(d)} source files; ${r ? `container root ${r}` : fallback ? "no container found, code root used" : "container root ."}`,
    });
  }
  const owner = (rel: string): string | null => {
    for (let d = dirOf(rel); d; d = dirOf(d)) if (comps.has(d)) return d;
    return null;
  };
  const edgeCounts = new Map<string, number>();
  const analysable = parsedSources.filter((s) => ANALYSABLE.has(s.lang) && owner(s.rel)).map((s) => s.rel);
  if (analysable.length) {
    for (const [a, b] of scanImports(code, analysable)) {
      const from = owner(a);
      const to = owner(b);
      if (from && to && from !== to) edgeCounts.set(`${from}\u0000${to}`, (edgeCounts.get(`${from}\u0000${to}`) ?? 0) + 1);
    }
  }
  const imports: [string, string, number][] = [...edgeCounts].map(([k, n]) => [...k.split("\u0000"), n] as [string, string, number]).sort((a, b) => cmp(a[0], b[0]) || cmp(a[1], b[1]));

  // ---- result, sorted
  const order = (l: Level) => LEVELS.indexOf(l);
  const sortedFacts = [...facts.values()].sort((a, b) => order(a.level) - order(b.level) || cmp(a.kind, b.kind) || cmp(a.path, b.path) || (a.line ?? 0) - (b.line ?? 0) || cmp(a.name, b.name));
  for (const [kind, n] of [...limitCounts].sort((a, b) => cmp(a[0], b[0]))) if (n > 100) limits.push({ kind, detail: `${n - 100} more not listed` });
  const sortRec = (r: Record<string, number>) => Object.fromEntries(Object.entries(r).sort((a, b) => cmp(a[0], b[0])));
  const byPath = (a: { path: string; reason: string }, b: { path: string; reason: string }) => cmp(a.path, b.path) || cmp(a.reason, b.reason);
  return {
    schemaVersion: 1,
    codeRoot: ".",
    facts: sortedFacts,
    files: { total: files.length, byLanguage: sortRec(byLanguage), notAnalysable: sortRec(notAnalysable), binary, skipped: skipped.sort(byPath), sizes: sizes.sort((a, b) => cmp(a[0], b[0])) },
    imports,
    notParsed: notParsed.sort(byPath),
    limits: limits.sort((a, b) => cmp(a.kind, b.kind) || cmp(a.path ?? "", b.path ?? "") || cmp(a.detail, b.detail)),
  };
}

// ---------------------------------------------------------------- storage

export const evidencePath = (projectDir: string): string => path.join(importDir(projectDir), "evidence.json");

/** Write `architecture/import/evidence.json` (atomic, stable formatting). */
export function writeEvidence(projectDir: string, ev: Evidence): void {
  atomicWrite(evidencePath(projectDir), stableJson(ev));
}

/** The stored evidence, or null if there is none (or it is not evidence of this version). */
export function readEvidence(projectDir: string): Evidence | null {
  try {
    const data: unknown = JSON.parse(fs.readFileSync(evidencePath(projectDir), "utf-8"));
    return isObj(data) && data.schemaVersion === 1 && Array.isArray(data.facts) ? (data as unknown as Evidence) : null;
  } catch {
    return null;
  }
}
