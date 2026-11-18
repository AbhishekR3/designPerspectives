/**
 * Installs a git pre-push hook that runs `npm run ci` (scripts/ci-local.ts) before every push, so a push that would
 * fail the checks stops on this machine. Skip it once with `git push --no-verify`.
 *
 *   npm run hooks:install
 *
 * The hook goes in this repository's own hooks folder (found with git, so it also works in a worktree). It is never
 * committed. It replaces a pre-push hook of ours and refuses to overwrite any other.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MARK = "# designPerspectives pre-push hook";
const HOOK = `#!/bin/sh
${MARK}: runs the CI steps on this machine. Skip once with: git push --no-verify
cd "$(git rev-parse --show-toplevel)" && exec npm run ci
`;

const hooksDir = path.resolve(ROOT, execFileSync("git", ["rev-parse", "--git-path", "hooks"], { cwd: ROOT, encoding: "utf8" }).trim());
const file = path.join(hooksDir, "pre-push");
if (fs.existsSync(file) && !fs.readFileSync(file, "utf8").includes(MARK)) {
  console.error(`${file} already exists and is not ours. Not overwriting it.`);
  process.exit(1);
}
fs.mkdirSync(hooksDir, { recursive: true });
fs.writeFileSync(file, HOOK, { mode: 0o755 });
console.log(`Installed ${file}. \`git push\` now runs \`npm run ci\` first.`);
