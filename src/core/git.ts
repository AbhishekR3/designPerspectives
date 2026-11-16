/**
 * Read the model as it is in a git commit, so it can be shown or compared (Stage C2).
 *
 * Uses the `git` command line (no library): `rev-parse` to find the repository and resolve a
 * ref to a commit, `for-each-ref` to list branches and tags, `show <commit>:<path>` to read the
 * two model files. Commands run without a shell, and refs are checked before use, so a ref
 * cannot become an option or a path. A commit never changes, so its model is cached by hash.
 */

import { execFileSync } from "node:child_process";
import path from "node:path";
import { GitCode, NO_CODE, type CodeSource } from "./codefs.js";
import { emptySidecar, parseSidecar, type Sidecar } from "./sidecar.js";
import { NotFound, SIDECAR_FILE, WORKSPACE_FILE, type ModelSource } from "./store.js";
import { errors } from "./validate.js";
import { emptyWorkspace, parseWorkspace, type Workspace } from "./workspace.js";

export class GitError extends Error {}

export interface Repo {
  /** The model folder relative to the repository root, with "/" and a trailing slash ("" at the root). */
  prefix: string;
  cwd: string;
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 128 * 1024 * 1024,
    timeout: 20_000,
  });
}

/** The repository holding `modelDir`, or null (not a repository, or git is not installed). */
export function findRepo(modelDir: string): Repo | null {
  try {
    const prefix = git(modelDir, ["rev-parse", "--show-prefix"]).trim();
    return { prefix, cwd: modelDir };
  } catch {
    return null;
  }
}

/** `git config user.name` as seen from `dir`, or null (no git, no name set). */
export function gitUserName(dir: string): string | null {
  try {
    return git(dir, ["config", "--get", "user.name"]).trim().slice(0, 80) || null;
  } catch {
    return null;
  }
}

/** Reject anything that is not a plain ref name or commit hash (see git-check-ref-format). */
export function checkRef(ref: string): string {
  const r = ref.trim();
  // eslint-disable-next-line no-control-regex -- control characters are exactly what a git ref must not contain
  if (!r || r.startsWith("-") || r.length > 200 || /[\s:\\^?*[\]~]|\.\.|@\{|[\x00-\x1f\x7f]/.test(r.replace(/(\^|~\d*)+$/, ""))) {
    throw new GitError(`"${ref}" is not a valid git ref.`);
  }
  return r;
}

/** The commit hash a ref points to. */
export function resolveRef(repo: Repo, ref: string): string {
  const r = checkRef(ref);
  try {
    return git(repo.cwd, ["rev-parse", "--verify", "--quiet", "--end-of-options", `${r}^{commit}`]).trim();
  } catch {
    throw new NotFound(`No git commit "${ref}".`);
  }
}

/** Branches and tags, most recently changed first (HEAD first). */
export function listRefs(repo: Repo, limit = 60): string[] {
  try {
    const out = git(repo.cwd, ["for-each-ref", "--sort=-committerdate", "--format=%(refname:short)", "refs/heads", "refs/tags", "refs/remotes"]);
    const refs = out
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s && !s.endsWith("/HEAD") && s !== "HEAD");
    return ["HEAD", ...refs].slice(0, limit);
  } catch {
    return [];
  }
}

/** The current branch name, or null when HEAD is detached or there is no commit yet. */
export function currentBranch(repo: Repo): string | null {
  try {
    const b = git(repo.cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]).trim();
    return b || null;
  } catch {
    return null;
  }
}

function readAt(repo: Repo, sha: string, file: string): string | null {
  try {
    return git(repo.cwd, ["show", `${sha}:${repo.prefix}${file}`]);
  } catch {
    return null; // the file is not in that commit
  }
}

/** The model in one commit (read-only). A commit without the model shows an empty model. */
export class GitSnapshot implements ModelSource {
  readonly readOnly = true;
  readonly workspace: Workspace;
  readonly sidecar: Sidecar;
  readonly loadErrors: string[];
  /** False when the commit has no model files (everything then shows as added). */
  readonly present: boolean;
  /** Commits never change. */
  readonly revision: string;

  constructor(
    repo: Repo,
    readonly sha: string,
  ) {
    const ws = readAt(repo, sha, WORKSPACE_FILE);
    const sc = readAt(repo, sha, SIDECAR_FILE);
    this.present = ws !== null;
    this.revision = `git:${sha}`;
    try {
      this.workspace = ws === null ? emptyWorkspace("(no model in this commit)") : parseWorkspace(ws);
      this.sidecar = sc === null ? emptySidecar() : parseSidecar(sc);
    } catch (e) {
      throw new GitError(`The model in commit ${sha.slice(0, 7)} cannot be read: ${(e as Error).message}`);
    }
    this.loadErrors = errors(this.workspace, this.sidecar);
  }

  reloadIfChanged(): boolean {
    return false;
  }
}

/** Snapshots by commit hash (commits never change). */
export class GitModels {
  private cache = new Map<string, GitSnapshot>();
  private repo: Repo | null = null;

  constructor(readonly modelDir: string) {}

  /** The repository. Found once; while there is none, looked for again on each call (so
   *  `git init` after starting the server works). */
  get(): Repo | null {
    if (!this.repo) this.repo = findRepo(this.modelDir);
    return this.repo;
  }

  need(): Repo {
    const r = this.get();
    if (!r) throw new GitError(`${path.basename(this.modelDir)}/ is not in a git repository (or git is not installed).`);
    return r;
  }

  at(ref: string): GitSnapshot {
    const repo = this.need();
    const sha = resolveRef(repo, ref);
    let s = this.cache.get(sha);
    if (!s) {
      s = new GitSnapshot(repo, sha);
      this.cache.set(sha, s);
      if (this.cache.size > 20) this.cache.delete(this.cache.keys().next().value!);
    }
    return s;
  }
}

/** The code folder as it is at a ref (the code folder may be in another repository than the model). */
export class GitCodes {
  private cache = new Map<string, GitCode>();
  private repo: Repo | null = null;

  constructor(readonly codeRoot: string | null) {}

  at(ref: string): CodeSource {
    if (this.codeRoot === null) return NO_CODE;
    if (!this.repo) this.repo = findRepo(this.codeRoot);
    if (!this.repo) return NO_CODE;
    const sha = resolveRef(this.repo, ref);
    let c = this.cache.get(sha);
    if (!c) {
      c = new GitCode(this.repo.cwd, this.repo.prefix, sha, `git ${ref} (${sha.slice(0, 7)})`);
      this.cache.set(sha, c);
      if (this.cache.size > 20) this.cache.delete(this.cache.keys().next().value!);
    }
    return c;
  }
}

// --------------------------------------------------------------------------- history (backtracking)

/** One commit, as backtracking shows it. */
export interface LogEntry {
  sha: string;
  /** Author date, ISO 8601. */
  date: string;
  author: string;
  subject: string;
}

/**
 * The newest commits (at most `limit`) that touch any of `paths` (relative to `cwd`), newest first.
 * Empty when `cwd` is not in a repository or the paths have no history.
 */
export function logFor(cwd: string, paths: string[], limit = 20): LogEntry[] {
  if (!paths.length) return [];
  let out: string;
  try {
    out = git(cwd, ["log", `-n${limit}`, "--format=%H%x1f%aI%x1f%an%x1f%s", "--", ...paths]);
  } catch {
    return [];
  }
  return out
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [sha, date, author, subject] = l.split("\x1f");
      return { sha: sha!, date: date!, author: author ?? "", subject: subject ?? "" };
    });
}

/** True when the file differs from the last commit (changed, added or not yet committed). */
export function uncommitted(cwd: string, file: string): boolean {
  try {
    return git(cwd, ["status", "--porcelain", "--", file]).trim() !== "";
  } catch {
    return false;
  }
}

/**
 * Lines of the file as it is now (1-based) that differ from the file at `base`; "all" when `base`
 * is null (the file is new since then). Deleted lines mark the line where they were.
 */
export function changedLinesSince(cwd: string, base: string | null, file: string): number[] | "all" {
  if (base === null) return "all";
  let out: string;
  try {
    out = git(cwd, ["diff", "-U0", "--no-color", base, "--", file]);
  } catch {
    return [];
  }
  const lines: number[] = [];
  for (const m of out.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    if (count === 0) lines.push(Math.max(1, start));
    for (let i = 0; i < count; i++) lines.push(start + i);
  }
  return lines;
}

/** The parent of a commit, or null for a root commit. */
export function parentOf(cwd: string, sha: string): string | null {
  try {
    return git(cwd, ["rev-parse", "--verify", "-q", `${checkRef(sha)}^`]).trim() || null;
  } catch {
    return null;
  }
}
