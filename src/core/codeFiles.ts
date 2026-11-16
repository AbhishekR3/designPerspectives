/**
 * Where the code level reads source files from: the code folder on disk, a draft's planned code
 * edits laid over it, or a git commit. Code diagrams, code compare and the coding plan all read
 * through a `CodeSource`, so they work the same for every model version.
 *
 * Paths are relative to the code root, with "/" separators. Disk access stays confined to the
 * code root (symlinks resolved), as before. Hidden files and folders (any path segment starting
 * with ".", e.g. .git, .env, .ssh) are never read, written, listed or planned, by every source.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { atomicWrite, isHidden, isObj, realLoose, stableJson } from "./util.js";
import { ModelError, normpath } from "./ops.js";

export const MAX_BYTES = 1_000_000;

export interface CodeEntry {
  name: string;
  type: "dir" | "file";
}

export interface CodeSource {
  /** False when there is no code to read (no code folder, or not available in that version). */
  readonly hasRoot: boolean;
  /** Shown in messages, e.g. "the code folder", "git main (a1b2c3d)". */
  readonly label: string;
  kind(rel: string): "file" | "dir" | null;
  /** Direct children of a folder ("" is the root). */
  list(rel: string): CodeEntry[];
  /** Text of a file (at most MAX_BYTES), or null if it does not exist. */
  read(rel: string): string | null;
}

export const sha1 = (text: string): string => createHash("sha1").update(text, "utf-8").digest("hex");

/** A clean relative path, or null for anything that leaves the root. */
export function cleanRel(rel: string): string | null {
  const p = normpath(rel.replace(/\\/g, "/").trim());
  if (p === "." || p === "") return "";
  if (p.startsWith("/") || p === ".." || p.startsWith("../") || /^[A-Za-z]:/.test(p)) return null;
  return p;
}

export const HIDDEN_MESSAGE = "Hidden files and folders (names starting with a dot) cannot be opened here.";
export const OUTSIDE_MESSAGE = "That path is outside the code folder.";
export const TOO_LARGE_MESSAGE = "The file is too large to save here (over 1 MB).";

// The hidden-path rule lives in util.ts so the model rules (ops.ts) share it without an import cycle.
export { isHidden };

/** A clean relative path that stays inside the code root and is not hidden; ModelError otherwise. */
export function codeRel(rel: string): string {
  const p = cleanRel(rel);
  if (p === null) throw new ModelError(OUTSIDE_MESSAGE);
  if (isHidden(p)) throw new ModelError(HIDDEN_MESSAGE);
  return p;
}

/** Refuse content that could not be opened again (reads stop at MAX_BYTES). */
export function checkSize(content: string): void {
  if (Buffer.byteLength(content, "utf-8") > MAX_BYTES) throw new ModelError(TOO_LARGE_MESSAGE);
}

// ------------------------------------------------------------------ disk

function inside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Folders that hold dp's own private files (users, credentials) or git's (whose config can run commands). */
const PRIVATE_DIRS = new Set([".dp", ".git"]);

/** True if the absolute path `abs` is, or is inside, a `.dp` or `.git` folder. */
export function inPrivateFolder(abs: string): boolean {
  return abs.split(/[\\/]/).some((part) => PRIVATE_DIRS.has(part.toLowerCase()));
}

export const PRIVATE_ROOT_MESSAGE = "The code folder is inside a .dp or .git folder, so its files cannot be opened here.";

/** Resolve `rel` under the code root, refusing anything that escapes it or is hidden (checked
 *  after symlinks are resolved, so a link to .git/config is refused too). A code root that is, or is
 *  inside, a .dp or .git folder is refused as a whole (defence in depth: no setting should lead there). */
export function safePath(codeRoot: string | null, rel: string): string {
  if (codeRoot === null) throw new ModelError("No code folder is set. Start the app with --code-root <folder>.");
  const root = realLoose(codeRoot);
  if (inPrivateFolder(root)) throw new ModelError(PRIVATE_ROOT_MESSAGE);
  const target = realLoose(path.resolve(root, rel));
  if (!inside(root, target)) throw new ModelError(OUTSIDE_MESSAGE);
  if (isHidden(path.relative(root, target))) throw new ModelError(HIDDEN_MESSAGE);
  return target;
}

function statKind(p: string): "file" | "dir" | null {
  try {
    const s = fs.statSync(p);
    return s.isFile() ? "file" : s.isDirectory() ? "dir" : null;
  } catch {
    return null;
  }
}

export class DiskCode implements CodeSource {
  readonly label = "the code folder";
  readonly hasRoot: boolean;
  constructor(readonly root: string | null) {
    this.hasRoot = root !== null;
  }
  private abs(rel: string): string | null {
    try {
      return safePath(this.root, rel);
    } catch {
      return null;
    }
  }
  kind(rel: string) {
    const a = this.abs(rel);
    return a ? statKind(a) : null;
  }
  list(rel: string): CodeEntry[] {
    const a = this.abs(rel);
    if (!a || statKind(a) !== "dir") return [];
    const out: CodeEntry[] = [];
    for (const name of fs.readdirSync(a)) {
      if (name.startsWith(".")) continue;
      const k = statKind(path.join(a, name));
      if (k) out.push({ name, type: k });
    }
    return out;
  }
  read(rel: string): string | null {
    const a = this.abs(rel);
    if (!a || statKind(a) !== "file") return null;
    try {
      return fs.readFileSync(a, "utf-8").slice(0, MAX_BYTES);
    } catch {
      return null;
    }
  }
}

// ------------------------------------------------------------------ a draft's planned code edits

/** One planned file edit: `base` is the hash of the file on disk when it was first planned (null: new file). */
export interface PlannedFile {
  change: "added" | "changed" | "deleted";
  base: string | null;
}

/**
 * Planned code edits of a draft:
 *   <draft>/code.json        {"files": {"<path>": {"change", "base"}}}
 *   <draft>/code/<path>      the planned content (added and changed files)
 */
export class CodePlan {
  readonly manifest: string;
  readonly dir: string;
  constructor(draftDir: string) {
    this.manifest = path.join(draftDir, "code.json");
    this.dir = path.join(draftDir, "code");
  }

  files(): Map<string, PlannedFile> {
    const m = new Map<string, PlannedFile>();
    try {
      const data = JSON.parse(fs.readFileSync(this.manifest, "utf-8"));
      const files = isObj(data) && isObj(data.files) ? data.files : {};
      for (const [rel, v] of Object.entries(files)) {
        const p = cleanRel(rel);
        if (!p || isHidden(p) || !isObj(v)) continue;
        const change = v.change === "added" || v.change === "deleted" ? v.change : "changed";
        m.set(p, { change, base: typeof v.base === "string" ? v.base : null });
      }
    } catch {
      /* no planned edits */
    }
    return m;
  }

  private save(files: Map<string, PlannedFile>): void {
    if (!files.size) {
      fs.rmSync(this.manifest, { force: true });
      fs.rmSync(this.dir, { recursive: true, force: true });
      return;
    }
    const sorted = [...files.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
    atomicWrite(this.manifest, stableJson({ files: Object.fromEntries(sorted.map(([k, v]) => [k, { change: v.change, base: v.base }])) }));
  }

  /** Where the planned content of `rel` is kept; refuses paths that leave the plan or are hidden. */
  private contentPath(rel: string): string {
    const p = codeRel(rel);
    if (!p) throw new ModelError(OUTSIDE_MESSAGE);
    return path.join(this.dir, ...p.split("/"));
  }

  content(rel: string): string | null {
    try {
      return fs.readFileSync(this.contentPath(rel), "utf-8");
    } catch {
      return null;
    }
  }

  mtime(rel: string): number | null {
    try {
      return fs.statSync(this.contentPath(rel)).mtimeMs / 1000;
    } catch {
      return null;
    }
  }

  /** Plan new content for a file; `current` is the file as it is in the code folder (null: none). */
  write(rel: string, content: string, current: string | null): void {
    checkSize(content);
    const files = this.files();
    const prev = files.get(rel);
    const base = prev ? prev.base : current === null ? null : sha1(current);
    if (current !== null && content === current && prev?.change !== "added") {
      // Back to the file as it is: nothing planned any more.
      this.revert(rel);
      return;
    }
    files.set(rel, { change: base === null ? "added" : "changed", base });
    atomicWrite(this.contentPath(rel), content);
    this.save(files);
  }

  /** Plan the removal of a file. */
  remove(rel: string, current: string | null): void {
    const files = this.files();
    const prev = files.get(rel);
    fs.rmSync(this.contentPath(rel), { force: true });
    if (prev?.change === "added") files.delete(rel);
    else files.set(rel, { change: "deleted", base: prev ? prev.base : current === null ? null : sha1(current) });
    this.save(files);
  }

  /** Drop the planned edit of one file. */
  revert(rel: string): void {
    const files = this.files();
    files.delete(rel);
    fs.rmSync(this.contentPath(rel), { force: true });
    this.save(files);
  }
}

/** The code folder with a draft's planned edits on top. */
export class OverlayCode implements CodeSource {
  readonly hasRoot: boolean;
  readonly label = "the draft's planned code";
  private planned: Map<string, PlannedFile>;
  constructor(
    readonly base: CodeSource,
    readonly plan: CodePlan,
  ) {
    this.hasRoot = base.hasRoot;
    this.planned = plan.files();
  }
  kind(rel: string) {
    if (isHidden(rel)) return null;
    const p = this.planned.get(rel);
    if (p) return p.change === "deleted" ? null : "file";
    const k = this.base.kind(rel);
    if (k) return k;
    const prefix = rel ? `${rel}/` : "";
    for (const [f, v] of this.planned) if (v.change !== "deleted" && f.startsWith(prefix)) return "dir";
    return null;
  }
  list(rel: string): CodeEntry[] {
    if (isHidden(rel)) return [];
    const out = new Map(this.base.list(rel).map((e) => [e.name, e]));
    const prefix = rel ? `${rel}/` : "";
    for (const [f, v] of this.planned) {
      if (!f.startsWith(prefix)) continue;
      const rest = f.slice(prefix.length);
      const [name, ...more] = rest.split("/");
      if (!name) continue;
      if (v.change === "deleted" && !more.length) out.delete(name);
      else if (v.change !== "deleted") out.set(name, { name, type: more.length ? "dir" : "file" });
    }
    return [...out.values()];
  }
  read(rel: string): string | null {
    if (isHidden(rel)) return null;
    const p = this.planned.get(rel);
    if (!p) return this.base.read(rel);
    return p.change === "deleted" ? null : (this.plan.content(rel) ?? "").slice(0, MAX_BYTES);
  }
}

// ------------------------------------------------------------------ git

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 128 * 1024 * 1024, timeout: 20_000 });
}

/** The code folder as it is in one commit. `prefix`: the code root relative to the repository root. */
export class GitCode implements CodeSource {
  readonly hasRoot = true;
  private all: Set<string> | null = null;
  private dirs: Set<string> | null = null;
  private cache = new Map<string, string | null>();
  constructor(
    readonly cwd: string,
    readonly prefix: string,
    readonly sha: string,
    readonly label: string,
  ) {}

  private load(): void {
    if (this.all) return;
    const out = git(this.cwd, ["ls-tree", "-r", "--name-only", "-z", this.sha, "--", this.prefix || "."]);
    this.all = new Set();
    this.dirs = new Set([""]);
    for (const full of out.split("\0")) {
      if (!full || !full.startsWith(this.prefix)) continue;
      const rel = full.slice(this.prefix.length);
      if (isHidden(rel)) continue;
      this.all.add(rel);
      const parts = rel.split("/");
      for (let i = 1; i < parts.length; i++) this.dirs.add(parts.slice(0, i).join("/"));
    }
  }
  kind(rel: string) {
    this.load();
    return this.all!.has(rel) ? "file" : this.dirs!.has(rel) ? "dir" : null;
  }
  list(rel: string): CodeEntry[] {
    this.load();
    const prefix = rel ? `${rel}/` : "";
    const out = new Map<string, CodeEntry>();
    for (const f of this.all!) {
      if (!f.startsWith(prefix)) continue;
      const [name, ...more] = f.slice(prefix.length).split("/");
      if (name) out.set(name, { name, type: more.length ? "dir" : "file" });
    }
    return [...out.values()];
  }
  read(rel: string): string | null {
    if (this.cache.has(rel)) return this.cache.get(rel)!;
    let text: string | null = null;
    if (this.kind(rel) === "file") {
      try {
        text = git(this.cwd, ["show", `${this.sha}:${this.prefix}${rel}`]).slice(0, MAX_BYTES);
      } catch {
        text = null;
      }
    }
    this.cache.set(rel, text);
    return text;
  }
}

/** No code available (no code folder, or the code folder is not in the repository). */
export const NO_CODE: CodeSource = {
  hasRoot: false,
  label: "no code",
  kind: () => null,
  list: () => [],
  read: () => null,
};
