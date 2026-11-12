/**
 * Fitness functions enforced on module dependencies (spec file 01 §6).
 * FF1  only the LikeC4 adapter imports LikeC4
 * FF2  no plug-in imports another plug-in
 * FF12 the renderer (UI) only talks to the host through the preload IPC bridge — no core, no Node
 * MK   the core never imports a plug-in (microkernel, ADR-0005); contracts import nothing internal
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "FF1-likec4-only-in-adapter",
      comment: "Only packages/plugins/model-likec4 may depend on LikeC4 (ADR-0004).",
      severity: "error",
      from: { pathNot: "^packages/plugins/model-likec4/" },
      to: { path: "(^|/)(@likec4|likec4)(/|\\+|@)" },
    },
    {
      name: "FF2-no-plugin-to-plugin",
      comment: "A plug-in never imports another plug-in [FoSA p.204].",
      severity: "error",
      from: { path: "^packages/plugins/([^/]+)/" },
      to: { path: "^packages/plugins/([^/]+)/", pathNot: "^packages/plugins/$1/" },
    },
    {
      name: "MK-core-does-not-import-plugins",
      severity: "error",
      from: { path: "^packages/(core|contracts)/" },
      to: { path: "^packages/plugins/" },
    },
    {
      name: "MK-contracts-are-leaf",
      comment: "Contracts depend on nothing internal.",
      severity: "error",
      from: { path: "^packages/contracts/" },
      to: { path: "^(packages/(core|plugins)|apps)/" },
    },
    {
      name: "FF12-renderer-no-core",
      comment: "The renderer has no business logic; it calls the host over IPC only.",
      severity: "error",
      from: { path: "^apps/desktop/src/renderer/" },
      to: { path: "^(packages/(core|plugins)/|apps/desktop/src/(main|preload)/)" },
    },
    {
      name: "FF12-renderer-no-node",
      severity: "error",
      from: { path: "^apps/desktop/src/renderer/" },
      to: { dependencyTypes: ["core"] },
    },
    {
      name: "no-circular",
      severity: "error",
      from: { pathNot: "(^|/)node_modules/" },
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)(dist|out|renderer-dist|node_modules)/|\\.test\\.ts$|(^|/)spikes/" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["source", "import", "default", "types"],
      extensions: [".ts", ".tsx", ".mts", ".js", ".mjs", ".json"],
      mainFields: ["module", "main", "types"],
    },
  },
};
