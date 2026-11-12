// Clones the pinned fixture repositories (fixtures/manifest.json) into fixtures/repos/<name> at the exact commit.
// Usage: node fixtures/clone-fixtures.mjs [--tier small|large|all] [--only name,name] [--verify]
// Fixtures are never vendored: fixtures/repos/ is git-ignored. Re-running is idempotent.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const here = import.meta.dirname;
const { values } = parseArgs({ options: { tier: { type: "string", default: "small" }, only: { type: "string" }, verify: { type: "boolean", default: false } } });
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
const only = values.only ? new Set(values.only.split(",")) : undefined;
const selected = manifest.fixtures.filter((f) => (only ? only.has(f.name) : values.tier === "all" || f.tier === values.tier));

const git = (args, cwd) => execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" }).trim();
const reposDir = join(here, "repos");
mkdirSync(reposDir, { recursive: true });

let failures = 0;
for (const f of selected) {
  const dir = join(reposDir, f.name);
  try {
    if (!existsSync(join(dir, ".git"))) {
      mkdirSync(dir, { recursive: true });
      git(["init", "-q"], dir);
      git(["remote", "add", "origin", f.url], dir);
    }
    let head = "";
    try {
      head = git(["rev-parse", "--verify", "-q", "HEAD"], dir);
    } catch {
      head = "";
    }
    if (head !== f.commit) {
      git(["fetch", "-q", "--depth", "1", "origin", f.commit], dir);
      git(["checkout", "-q", "--detach", "FETCH_HEAD"], dir);
    }
    const actual = git(["rev-parse", "HEAD"], dir);
    if (actual !== f.commit) throw new Error(`HEAD is ${actual}, expected ${f.commit}`);
    console.log(`ok   ${f.name.padEnd(32)} ${f.commit.slice(0, 7)} ${f.licence}`);
  } catch (err) {
    failures++;
    console.error(`FAIL ${f.name}: ${String(err.stderr || err.message).trim()}`);
  }
}
process.exit(failures ? 1 : 0);
