// Generates JSON Schema files from the Zod schemas in @designperspectives/contracts (spec Wave 0 scope item 3:
// "Zod source, generated JSON Schema"). Output: packages/contracts/schemas/<name>.schema.json.
// Usage: pnpm build && pnpm schemas [--check]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { SIDECAR_SCHEMAS, ProposalSchema } from "@designperspectives/contracts";

const OUT = join(import.meta.dirname, "../packages/contracts/schemas");

const NAMES = {
  "designperspectives.yaml": "workspace-settings",
  "sidecars/elements/*.yaml": "element-sidecar",
  "sidecars/relationships.yaml": "relationships-sidecar",
  "sidecars/characteristics.yaml": "characteristics",
  "sidecars/codemapping.yaml": "codemapping",
  "sidecars/layout/*.yaml": "layout",
  "sidecars/notes/*.md": "note-front-matter",
  "sidecars/risk/*.yaml": "risk-session",
  "decisions/**/ADR-*.md": "adr-front-matter",
  "approvals/*.sig.yaml": "approval-record",
  "permissions.yaml": "permissions",
};

function generate(name, pattern, schema) {
  // io "input": what may be written in a file (fields with defaults are optional).
  const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
  return {
    $id: `urn:designperspectives:schema:${name}`,
    title: name,
    description: pattern ? `Generated from Zod. Applies to architecture/${pattern}` : "Generated from Zod.",
    ...json,
  };
}

const entries = [
  ...Object.entries(SIDECAR_SCHEMAS).map(([pattern, schema]) => [NAMES[pattern], pattern, schema]),
  ["proposal", undefined, ProposalSchema],
];

const check = process.argv.includes("--check");
await mkdir(OUT, { recursive: true });
let stale = 0;
for (const [name, pattern, schema] of entries) {
  if (!name) throw new Error(`No schema file name for pattern ${pattern}`);
  const path = join(OUT, `${name}.schema.json`);
  const content = JSON.stringify(generate(name, pattern, schema), null, 2) + "\n";
  const current = await readFile(path, "utf8").catch(() => "");
  if (current === content) continue;
  stale++;
  if (check) console.error(`out of date: ${path}`);
  else await writeFile(path, content);
}
console.log(check ? `${entries.length} schemas checked, ${stale} out of date` : `${entries.length} schemas, ${stale} written`);
process.exit(check && stale ? 1 : 0);
