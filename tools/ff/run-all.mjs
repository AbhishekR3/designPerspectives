// Runs the fitness functions that are not part of the Vitest suite. FF3, FF4 and FF6 run inside `pnpm test`.
import { spawnSync } from "node:child_process";

const steps = [
  ["FF1/FF2/FF12 dependency rules", "pnpm", ["exec", "depcruise", "packages", "apps", "--config", ".dependency-cruiser.cjs", "--output-type", "err"]],
  ["FF8 licences", "node", ["tools/ff/licences.mjs"]],
  ["FF11 complexity (hard limit 10)", "pnpm", ["exec", "eslint", "--config", "eslint.ff11.config.js", "packages/core/src", "packages/contracts/src"]],
];
let failed = 0;
for (const [name, cmd, args] of steps) {
  console.log(`\n== ${name}`);
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) {
    failed++;
    console.error(`!! ${name} failed`);
  }
}
process.exit(failed ? 1 : 0);
