/**
 * Structurizr export plug-in: `structurizr-dsl` (workspace.dsl) and `structurizr-json` (workspace.json).
 * Depends only on @designperspectives/contracts (FF2: no plug-in imports another plug-in).
 */
import type { PluginModule } from "@designperspectives/contracts";
import { CONTRACTS_VERSION } from "@designperspectives/contracts";
import { StructurizrDslExporter } from "./dsl.js";
import { StructurizrJsonExporter } from "./json.js";

export { StructurizrDslExporter, toStructurizrDsl } from "./dsl.js";
export { StructurizrJsonExporter, toStructurizrJson } from "./json.js";
export { exportPlan } from "./build.js";

const plugin: PluginModule = {
  manifest: {
    id: "@designperspectives/plugin-export-structurizr",
    version: "0.1.0",
    contracts: "^" + CONTRACTS_VERSION,
    provides: ["Exporter"],
  },
  exporters: [new StructurizrDslExporter(), new StructurizrJsonExporter()],
};

export default plugin;
