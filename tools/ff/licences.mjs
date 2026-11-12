// FF8 — dependency licence policy (ADR-0001). Lists production dependencies with pnpm and checks each
// licence expression against the allow-list. Exceptions need a reason and are reported, not hidden.
import { execFileSync } from "node:child_process";

const ALLOWED = new Set([
  "MIT", "MIT-0", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "0BSD", "MPL-2.0", "EPL-2.0",
  "Unlicense", "CC0-1.0", "BlueOak-1.0.0", "Zlib", "Python-2.0", "CC-BY-4.0",
]);

/** Packages whose metadata does not state an allowed licence but whose licence was checked by hand. */
const REVIEWED = {
  // W0-SPIKE-LIKEC4: no licence field in package.json; the shipped LICENSE file is MIT.
  khroma: "MIT (LICENSE file; no package.json field)",
};

function allowed(expr) {
  const cleaned = String(expr).replace(/[()]/g, " ");
  if (/\bAND\b/.test(cleaned)) return cleaned.split(/\bAND\b/).every((p) => ALLOWED.has(p.trim()));
  return cleaned.split(/\bOR\b/).some((p) => ALLOWED.has(p.trim()));
}

const raw = execFileSync("pnpm", ["licenses", "list", "--json", "--prod", "-r"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const byLicence = JSON.parse(raw);
const failures = [];
const reviewed = [];
let count = 0;
for (const [licence, pkgs] of Object.entries(byLicence)) {
  for (const p of pkgs) {
    count++;
    if (allowed(licence)) continue;
    if (REVIEWED[p.name]) reviewed.push(`${p.name}: ${REVIEWED[p.name]}`);
    else failures.push(`${p.name}@${(p.versions ?? [p.version]).join(",")}: ${licence}`);
  }
}
console.log(`FF8: ${count} production packages checked; ${reviewed.length} reviewed exceptions.`);
for (const r of reviewed) console.log(`  reviewed: ${r}`);
if (failures.length) {
  console.error(`FF8 FAILED — licences outside the allow-list:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
