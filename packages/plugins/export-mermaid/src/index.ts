/**
 * Mermaid exporter plug-in: one `.mmd` flowchart per view, `mermaid/<view-id>.mmd`.
 * Needs no layout: membership and edges are computed from the model (see membership.ts).
 */
import { CONTRACTS_VERSION, sortModel } from "@designperspectives/contracts";
import type { Exporter, ExportInput, ExportOptions, PluginModule, SourceFile } from "@designperspectives/contracts";
import { buildDiagram } from "./diagram.js";
import { renderMermaid } from "./render.js";

export { buildDiagram } from "./diagram.js";
export { renderMermaid } from "./render.js";

export class MermaidExporter implements Exporter {
  readonly format = "mermaid";
  readonly description = "Mermaid flowchart (.mmd) per view, with subgraphs for boundaries";
  readonly needsLayout = false;

  export(input: ExportInput, options?: ExportOptions): SourceFile[] {
    const model = sortModel(input.model);
    const wanted = options?.viewIds ? new Set(options.viewIds) : undefined;
    return model.views
      .filter((v) => !wanted || wanted.has(v.id))
      .map((v) => ({ path: `mermaid/${v.id}.mmd`, content: renderMermaid(buildDiagram(model, v)) }));
  }
}

const plugin: PluginModule = {
  manifest: {
    id: "@designperspectives/plugin-export-mermaid",
    version: "0.1.0",
    contracts: `^${CONTRACTS_VERSION}`,
    provides: ["Exporter"],
  },
  exporters: [new MermaidExporter()],
};
export default plugin;
