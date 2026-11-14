/**
 * Code level (C4): the files behind a component or connector, and the imports between them.
 *
 * An element or relationship lists code paths (`dp.code.paths`, relative to the code root; a path may be
 * a file or a folder). The code diagram shows one box per source file and one line per import found by a
 * deterministic scan: Python via a small tokenizer over `import` / `from ... import` statements (comments
 * and strings are skipped), JavaScript/TypeScript via a regex over import/require statements.
 * Only imports that resolve to another file in the same diagram are drawn.
 *
 * File read/write is restricted to the code root: paths are resolved (symlinks included) and must stay inside it.
 */

import fs from "node:fs";
import path from "node:path";
import { blankNode } from "./connectors.js";
import { scopeName, titleOf, type DiagramRef, type RawDiagram, type RawEdge, type RawNode } from "./diagrams.js";
import { CODE_KEY, getJson, ModelError, normpath, type Index } from "./ops.js";

const posix = path.posix;

export const SOURCE_EXT = new Set([".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".java", ".kt", ".go", ".rs", ".cs", ".sql", ".yaml", ".yml", ".json", ".md"]);
export const SKIP_DIRS = new Set(["__pycache__", "node_modules", ".git", ".venv", "venv", "dist", "build", ".idea"]);
export const MAX_FILES = 60;
export const MAX_BYTES = 1_000_000;
const JS_IMPORT = /(?:import\s[^'"]*?from\s*|import\s*|require\(\s*|export\s[^'"]*?from\s*)['"]([^'"]+)['"]/g;

/** Resolve symlinks for the part of `p` that exists, then append the rest (like Python's Path.resolve()). */
function resolveLoose(p: string): string {
  const abs = path.resolve(p);
  const rest: string[] = [];
  let cur = abs;
  for (;;) {
    try {
      const real = fs.realpathSync(cur);
      return rest.length ? path.join(real, ...rest.reverse()) : real;
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return abs;
      rest.push(path.basename(cur));
      cur = parent;
    }
  }
}

function inside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Resolve `rel` under the code root, refusing anything that escapes it. */
export function safePath(codeRoot: string | null, rel: string): string {
  if (codeRoot === null) throw new ModelError("No code folder is set. Start the app with --code-root <folder>.");
  const root = resolveLoose(codeRoot);
  const target = resolveLoose(path.resolve(root, rel));
  if (!inside(root, target)) throw new ModelError("That path is outside the code folder.");
  return target;
}

const toPosix = (root: string, p: string) => path.relative(root, p).split(path.sep).join("/");

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** All files under a folder (symlinked folders are not followed), as paths relative to `root`. */
function walkFiles(root: string, dir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(root, full, out);
    else if (e.isFile() || (e.isSymbolicLink() && isFile(full))) out.push(toPosix(root, full));
  }
}

/** Sort as Python sorts paths: part by part. */
function byParts(a: string, b: string): number {
  const pa = a.split("/");
  const pb = b.split("/");
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    if (pa[i] !== pb[i]) return pa[i]! < pb[i]! ? -1 : 1;
  }
  return pa.length - pb.length;
}

/** Files for a list of paths (folders expanded). Returns [files, missing paths]. */
export function expandPaths(codeRoot: string | null, paths: string[]): [string[], string[]] {
  const files: string[] = [];
  const missing: string[] = [];
  if (codeRoot === null) return [files, [...paths]];
  const root = resolveLoose(codeRoot);
  for (const p of paths) {
    let target: string;
    try {
      target = safePath(codeRoot, p);
    } catch {
      missing.push(p);
      continue;
    }
    if (isFile(target)) files.push(toPosix(root, target));
    else if (isDir(target)) {
      const found: string[] = [];
      walkFiles(root, target, found);
      found.sort(byParts);
      for (const f of found) {
        if (f.split("/").some((part) => SKIP_DIRS.has(part))) continue;
        if (SOURCE_EXT.has(posix.extname(f))) files.push(f);
      }
    } else missing.push(p);
  }
  return [[...new Set(files)].slice(0, MAX_FILES), missing];
}

function readText(p: string): string {
  try {
    return fs.readFileSync(p, "utf-8").slice(0, MAX_BYTES);
  } catch {
    return "";
  }
}

// --------------------------------------------------------------------------- Python imports

/** Split Python source into logical statements, dropping comments and string literals. */
function pythonStatements(src: string): string[] {
  const stmts: string[] = [];
  let cur = "";
  let depth = 0;
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    if (c === "#") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "'" || c === '"') {
      const triple = src.startsWith(c.repeat(3), i);
      const q = triple ? c.repeat(3) : c;
      i += q.length;
      while (i < n) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src.startsWith(q, i)) {
          i += q.length;
          break;
        }
        if (!triple && src[i] === "\n") break;
        i++;
      }
      cur += " _str_ ";
      continue;
    }
    if (c === "\\" && src[i + 1] === "\n") {
      i += 2;
      cur += " ";
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    if (c === ")" || c === "]" || c === "}") depth = Math.max(0, depth - 1);
    if ((c === "\n" && depth === 0) || c === ";") {
      stmts.push(cur);
      cur = "";
      i++;
      continue;
    }
    cur += c === "\n" ? " " : c;
    i++;
  }
  stmts.push(cur);
  // A string prefix (r, b, f, ...) directly before a quote leaves a stray letter; harmless here.
  return stmts.map((x) => x.trim()).filter(Boolean);
}

const IDENT = /^[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*$/;

/** [dotted module, relative level] for each import in a Python file. */
export function pyModules(source: string): [string, number][] {
  const out: [string, number][] = [];
  for (const raw of pythonStatements(source)) {
    // Statements after a block opener on the same line ("if x: import y") are still imports.
    const stmt = raw.replace(/^.*:\s*(?=(?:import|from)\s)/, "");
    let m = /^import\s+(.+)$/.exec(stmt);
    if (m) {
      for (const part of m[1]!.split(",")) {
        const name = part.trim().split(/\s+as\s+/)[0]!.trim();
        if (IDENT.test(name)) out.push([name, 0]);
      }
      continue;
    }
    m = /^from\s+(\.*)\s*([\w.]*)\s+import\s+(.+)$/.exec(stmt);
    if (m) {
      const level = m[1]!.length;
      const base = m[2]!;
      if (base && !IDENT.test(base)) continue;
      const names = m[3]!
        .replace(/[()]/g, " ")
        .split(",")
        .map((p) => p.trim().split(/\s+as\s+/)[0]!.trim())
        .filter((x) => x === "*" || IDENT.test(x));
      if (level && !base) for (const a of names) out.push([a, level]);
      else {
        out.push([base, level]);
        for (const a of names) out.push([base ? `${base}.${a}` : a, level]);
      }
    }
  }
  return out;
}

function resolvePy(rel: string, module: string, level: number, files: Set<string>): string | null {
  const parts = module ? module.split(".") : [];
  const here = posix.dirname(rel) === "." ? "" : posix.dirname(rel);
  let bases: string[];
  if (level) {
    let base = here;
    for (let k = 0; k < level - 1; k++) base = posix.dirname(base) === "." ? "" : posix.dirname(base);
    bases = [base];
  } else {
    // absolute import: try from the code root and from every parent folder of this file
    bases = [""];
    let cur = here;
    while (cur) {
      bases.push(cur);
      const up = posix.dirname(cur);
      cur = up === "." ? "" : up;
    }
  }
  for (const base of bases) {
    const stem = parts.length ? posix.join(base || ".", ...parts) : base;
    for (const cand0 of [`${stem}.py`, posix.join(stem || ".", "__init__.py")]) {
      const cand = normpath(cand0);
      if (files.has(cand) && cand !== rel) return cand;
    }
  }
  return null;
}

function resolveJs(rel: string, spec: string, files: Set<string>): string | null {
  if (!spec.startsWith(".")) return null;
  const stem = normpath(posix.join(posix.dirname(rel), spec));
  const exts = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs"];
  for (const e of exts) if (files.has(stem + e) && stem + e !== rel) return stem + e;
  for (const e of exts.slice(1)) {
    const cand = posix.join(stem, "index" + e);
    if (files.has(cand)) return cand;
  }
  return null;
}

/** Import edges [from file, to file] among the given files. */
export function scanImports(codeRoot: string, files: string[]): [string, string][] {
  const fileset = new Set(files);
  const edges = new Map<string, [string, string]>();
  const root = resolveLoose(codeRoot);
  for (const rel of files) {
    const ext = posix.extname(rel);
    if (![".py", ".js", ".jsx", ".ts", ".tsx", ".mjs"].includes(ext)) continue;
    const source = readText(path.join(root, rel));
    let targets: (string | null)[];
    if (ext === ".py") targets = pyModules(source).map(([m, lvl]) => resolvePy(rel, m, lvl, fileset));
    else targets = [...source.matchAll(JS_IMPORT)].map((m) => resolveJs(rel, m[1]!, fileset));
    for (const t of targets) if (t && t !== rel) edges.set(`${rel}\u0000${t}`, [rel, t]);
  }
  return [...edges.values()];
}

function countLines(p: string): number | null {
  try {
    const buf = fs.readFileSync(p);
    let n = 0;
    for (const b of buf) if (b === 10) n++;
    if (buf.length && buf[buf.length - 1] !== 10) n++;
    return n;
  } catch {
    return null;
  }
}

export function fileNode(rel: string, root: string | null): RawNode {
  const folder = posix.dirname(rel);
  return {
    ...blankNode(),
    id: `file:${rel}`,
    kind: "file",
    name: posix.basename(rel),
    description: folder === "." ? "" : folder,
    archType: "document",
    codePaths: [rel],
    filePath: rel,
    lineCount: root === null ? null : countLines(path.join(resolveLoose(root), rel)),
  };
}

export function codeDiagram(idx: Index, ref: DiagramRef, codeRoot: string | null): RawDiagram {
  const owner = idx.elements.get(ref.scope!) ?? idx.relationships.get(ref.scope!);
  const paths = getJson<string>(owner, CODE_KEY);
  const [files, missing] = expandPaths(codeRoot, paths);
  const nodes = files.map((f) => fileNode(f, codeRoot));
  const edges: RawEdge[] = [];
  if (codeRoot !== null) {
    for (const [a, b] of scanImports(codeRoot, files)) {
      edges.push({
        id: `file:${a}->${b}`,
        source: `file:${a}`,
        target: `file:${b}`,
        description: "imports",
        technology: "",
        technologies: [],
        kind: "",
        sensitivityLevel: null,
        hasNotes: false,
        stageCount: 0,
        derived: false,
        relationshipIds: [],
        detailKey: null,
        drillTargets: [],
      });
    }
  }
  return {
    key: ref.key,
    level: "code",
    scope: ref.scope,
    title: titleOf(idx, ref),
    boundary: null,
    nodes,
    edges,
    code: { ownerName: scopeName(idx, ref), paths, missing, hasRoot: codeRoot !== null, truncated: files.length >= MAX_FILES },
  };
}

// --------------------------------------------------------------------------- file API

export interface TreeEntry {
  name: string;
  path: string;
  type: "dir" | "file";
}

/** Entries of one folder under the code root, for the path picker. */
export function listTree(codeRoot: string | null, rel = ""): TreeEntry[] {
  const target = safePath(codeRoot, rel);
  if (!isDir(target)) throw new ModelError("That is not a folder.");
  const root = resolveLoose(codeRoot!);
  const out: TreeEntry[] = [];
  for (const name of fs.readdirSync(target)) {
    if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
    const full = path.join(target, name);
    out.push({ name, path: toPosix(root, full), type: isDir(full) ? "dir" : "file" });
  }
  out.sort((a, b) => (a.type === b.type ? (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0) : a.type === "dir" ? -1 : 1));
  return out;
}

const mtimeOf = (p: string) => fs.statSync(p).mtimeMs / 1000;

export function readCodeFile(codeRoot: string | null, rel: string): { path: string; content: string; mtime: number } {
  const target = safePath(codeRoot, rel);
  if (!isFile(target)) throw new ModelError("No such file.");
  if (fs.statSync(target).size > MAX_BYTES) throw new ModelError("File is too large to open here (over 1 MB).");
  const data = fs.readFileSync(target);
  if (data.includes(0)) throw new ModelError("This looks like a binary file.");
  return { path: rel, content: data.toString("utf-8"), mtime: mtimeOf(target) };
}

export function writeCodeFile(
  codeRoot: string | null,
  rel: string,
  content: string,
  expectedMtime?: number | null,
): { path: string; mtime: number } {
  const target = safePath(codeRoot, rel);
  if (!isFile(target)) throw new ModelError("No such file. New files cannot be created from here.");
  if (expectedMtime !== null && expectedMtime !== undefined && Math.abs(mtimeOf(target) - expectedMtime) > 0.001) {
    throw new ModelError("The file changed on disk since you opened it. Reopen it to see the new version.");
  }
  // Write to a temporary file next to it, keep the file's permissions, then swap it in, so a
  // crash or a full disk never leaves a half-written source file.
  const before = mtimeOf(target);
  const tmp = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(tmp, content, "utf-8");
    fs.chmodSync(tmp, fs.statSync(target).mode & 0o7777);
    fs.renameSync(tmp, target);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
  // The modification time is the version the editor sends back. Two saves within the same
  // millisecond would share it, so a stale editor could overwrite newer content: move it on.
  if (Math.abs(mtimeOf(target) - before) <= 0.002) {
    const t = new Date((before + 0.01) * 1000);
    fs.utimesSync(target, t, t);
  }
  return { path: rel, mtime: mtimeOf(target) };
}
