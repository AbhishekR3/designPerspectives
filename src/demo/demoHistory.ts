/**
 * Demo git history: `dp serve --demo` turns a new demo folder into a git repository whose commits
 * tell a short, made-up story (demo/history.json, written by scripts/make-demo.ts), so backtracking
 * has recent code and model changes to show.
 *
 * Each commit lists files: a string is the file's content at that commit, `true` is the file as
 * shipped (as written to the folder), `null` means the file does not exist yet. The first commit
 * also takes every other file in the folder. Commits are dated `daysAgo` days before now. After the
 * last commit the folder holds exactly the shipped files.
 *
 * Nothing happens when the folder is already inside a git repository or git is not installed: the
 * user's own history is never touched.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface DemoCommit {
  daysAgo: number;
  author: string;
  email: string;
  message: string;
  files: Record<string, string | true | null>;
}

export interface DemoHistory {
  note?: string;
  commits: DemoCommit[];
}

/** Ignored in the demo repository: trace files of a running system. */
const GITIGNORE = "# Trace files of a running system (OpenTelemetry, OTLP JSON), laid over the model.\ntraces/\n";

function run(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env }, timeout: 20_000 });
}

/** True when `dir` is inside a git work tree. False also when git is not installed. */
export function insideRepo(dir: string): boolean {
  try {
    return run(dir, ["rev-parse", "--is-inside-work-tree"]).trim() === "true";
  } catch {
    return false;
  }
}

export function gitAvailable(): boolean {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Write the history into `root` as commits. Returns the number of commits made, or 0 when it was
 * skipped (already a repository, or no git). `now` is the time the newest commit is measured from.
 */
export function writeDemoHistory(root: string, history: DemoHistory, now = Date.now()): number {
  if (!gitAvailable() || insideRepo(root)) return 0;
  const abs = (rel: string) => {
    const p = path.resolve(root, rel);
    if (!p.startsWith(path.resolve(root) + path.sep)) throw new Error(`Demo history names a file outside the folder: ${rel}`);
    return p;
  };
  // The shipped content of every file the history touches, to restore as each commit asks for it.
  const shipped = new Map<string, string | null>();
  for (const c of history.commits) for (const rel of Object.keys(c.files)) if (!shipped.has(rel)) shipped.set(rel, fs.existsSync(abs(rel)) ? fs.readFileSync(abs(rel), "utf-8") : null);
  const put = (rel: string, content: string | null) => {
    if (content === null) fs.rmSync(abs(rel), { force: true });
    else {
      fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
      fs.writeFileSync(abs(rel), content, "utf-8");
    }
  };
  if (!fs.existsSync(path.join(root, ".gitignore"))) fs.writeFileSync(path.join(root, ".gitignore"), GITIGNORE, "utf-8");
  run(root, ["-c", "init.defaultBranch=main", "init", "-q"]);
  let made = 0;
  for (const c of history.commits) {
    for (const [rel, v] of Object.entries(c.files)) put(rel, v === true ? (shipped.get(rel) ?? null) : v);
    const when = new Date(now - c.daysAgo * 86_400_000).toISOString();
    const env = { GIT_AUTHOR_NAME: c.author, GIT_AUTHOR_EMAIL: c.email, GIT_AUTHOR_DATE: when, GIT_COMMITTER_NAME: c.author, GIT_COMMITTER_EMAIL: c.email, GIT_COMMITTER_DATE: when };
    run(root, ["add", "-A"]);
    run(root, ["-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", c.message], env);
    made++;
  }
  // Whatever the history left different from the shipped files (it should be nothing) is restored, uncommitted.
  for (const [rel, content] of shipped) put(rel, content);
  return made;
}

/** The demo's history file, or null when the package has none. */
export function readDemoHistory(demoDir: string): DemoHistory | null {
  const f = path.join(demoDir, "history.json");
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf-8")) as DemoHistory) : null;
}
