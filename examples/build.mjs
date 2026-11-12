// Regenerates the demo workspaces' tool-owned files from their TypeScript model definitions.
// Usage: pnpm build && pnpm --filter @designperspectives/examples build [--check]
// Model files (.c4) are printed by the LikeC4 adapter; sidecars are re-printed canonically.
import { resolve } from "node:path";
import { ModelStore, readArchitectureFiles } from "@designperspectives/core";
import { LikeC4ModelPort } from "@designperspectives/plugin-model-likec4";

const EXAMPLES = [
  { root: "internet-banking", module: "./internet-banking/model.ts", fn: "internetBankingModel" },
];

const check = process.argv.includes("--check");
let dirty = 0;
for (const ex of EXAMPLES) {
  const root = resolve(import.meta.dirname, ex.root);
  const store = new ModelStore(new LikeC4ModelPort());
  const files = await readArchitectureFiles(root);
  const current = await store.loadFiles(files.filter((f) => !f.path.startsWith("model/")));
  const model = (await import(ex.module))[ex.fn]();
  const state = { model, sidecars: current.sidecars };
  const plan = store.plan(files, state);
  const changed = [...plan.write.map((f) => f.path), ...plan.remove];
  if (check) {
    dirty += changed.length;
    for (const p of changed) console.log(`${ex.root}: out of date: ${p}`);
    continue;
  }
  await store.save(root, files, state);
  console.log(`${ex.root}: ${changed.length ? changed.join(", ") : "up to date"}`);
}
process.exit(check && dirty ? 1 : 0);
