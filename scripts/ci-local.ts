/**
 * Runs the steps of .gitlab-ci.yml on this machine, in the same order, so a push can be checked without
 * a CI service.
 *
 *   npm run ci              every step (about 3 minutes; the browser tests are most of it)
 *   npm run ci -- --quick   skips the browser tests and the package smoke test
 *   npm run hooks:install   runs `npm run ci` before every `git push` (skip once with `git push --no-verify`)
 *
 * It runs on this machine's Node only, so it cannot show a failure that happens only on another Node version or
 * another operating system. It stops at the first failing step and says which one.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUICK = process.argv.includes("--quick");
const SHELL = process.platform === "win32";

/** Runs a command in the repository, showing its output. Returns its exit code. */
function run(cmd: string, args: string[], cwd = ROOT): number {
  return spawnSync(cmd, args, { cwd, stdio: "inherit", shell: SHELL }).status ?? 1;
}

/** Runs a command and returns its output. */
function read(cmd: string, args: string[]): string {
  return spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", shell: SHELL }).stdout.trim();
}

/** A step fails with a message, or returns nothing when it passed. */
type Step = { name: string; skipInQuick?: boolean; run: () => string | undefined };

/** A command that must exit 0. */
const must = (cmd: string, args: string[], cwd?: string) => (): string | undefined => (run(cmd, args, cwd) === 0 ? undefined : `\`${[cmd, ...args].join(" ")}\` failed`);

/** The folder has no changes against the last commit (what CI checks after a build). */
function clean(folder: string, fix: string): string | undefined {
  const changes = read("git", ["status", "--porcelain", folder]);
  return changes === "" ? undefined : `${folder} differs from what is committed:\n${changes}\n${fix}`;
}

const steps: Step[] = [
  { name: "Typecheck", run: must("npm", ["run", "typecheck"]) },
  { name: "Lint", run: must("npm", ["run", "lint"]) },
  { name: "Formatting", run: must("npm", ["run", "format:check"]) },
  { name: "Unit and API tests", run: must("npm", ["test"]) },
  { name: "Test list (tests/TESTS.csv) is up to date", run: must("npm", ["run", "test:list", "--", "--check"]) },
  {
    name: "Build UI, and the built UI is committed",
    run: () => must("npm", ["--prefix", "ui", "run", "build"])() ?? clean("static/", "Commit the rebuilt static/."),
  },
  { name: "Browser tests", skipInQuick: true, run: must("npm", ["run", "test:browser"]) },
  {
    name: "Demo model is up to date",
    run: () => must("npm", ["run", "make-demo"])() ?? clean("demo/", "Commit the regenerated demo/."),
  },
  {
    name: "Demo model, its sample draft and its code mapping check clean",
    run: () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dp-demo-check-"));
      try {
        return must("npm", ["run", "dp", "--", "init", "--demo", dir])() ?? must("npm", ["run", "dp", "--", "check", "--strict", dir])();
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  },
  {
    name: "Package installs and runs",
    skipInQuick: true,
    run: () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dp-pack-"));
      try {
        const pack = spawnSync("npm", ["pack", "--silent", "--pack-destination", dir], { cwd: ROOT, encoding: "utf8", shell: SHELL });
        if (pack.status !== 0) return `\`npm pack\` failed:\n${pack.stderr}`;
        const tgz = path.join(dir, pack.stdout.trim().split("\n").pop() ?? "");
        const prefix = path.join(dir, "install");
        const smoke = path.join(dir, "smoke");
        fs.mkdirSync(prefix);
        const dp = path.join(prefix, "node_modules", ".bin", "dp");
        return must("npm", ["install", "--prefix", prefix, tgz])() ?? must(dp, ["--version"])() ?? must(dp, ["init", smoke])() ?? must(dp, ["validate", smoke])();
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  },
];

let failed = false;
const started = Date.now();
for (const step of steps) {
  if (QUICK && step.skipInQuick) {
    console.log(`\n--- skipped (--quick): ${step.name}`);
    continue;
  }
  console.log(`\n=== ${step.name}`);
  const problem = step.run();
  if (problem) {
    console.error(`\nFAILED: ${step.name}\n${problem}`);
    failed = true;
    break;
  }
}
const seconds = Math.round((Date.now() - started) / 1000);
console.log(failed ? `\nCI checks failed after ${seconds}s.` : `\nAll CI checks passed in ${seconds}s${QUICK ? " (quick: browser tests and package test skipped)" : ""}.`);
process.exit(failed ? 1 : 0);
