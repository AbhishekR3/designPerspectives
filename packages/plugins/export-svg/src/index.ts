/**
 * SVG exporter plug-in: one `svg/<view-id>.svg` per laid-out ComputedView, drawn from the
 * ComputedView only, with an auto-generated key (spec file 05 rule 2).
 */
import { CONTRACTS_VERSION } from "@designperspectives/contracts";
import type { Exporter, ExportInput, ExportOptions, PluginModule, SourceFile } from "@designperspectives/contracts";
import { renderSvg } from "./render.js";

export { renderSvg } from "./render.js";

export class SvgExporter implements Exporter {
  readonly format = "svg";
  readonly description = "SVG image per laid-out view, with an auto-generated key";
  readonly needsLayout = true;

  export(input: ExportInput, options?: ExportOptions): SourceFile[] {
    const wanted = options?.viewIds ? new Set(options.viewIds) : undefined;
    return [...input.views]
      .filter((v) => !wanted || wanted.has(v.id))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((v) => ({ path: `svg/${v.id}.svg`, content: renderSvg(v) }));
  }
}

const plugin: PluginModule = {
  manifest: {
    id: "@designperspectives/plugin-export-svg",
    version: "0.1.0",
    contracts: `^${CONTRACTS_VERSION}`,
    provides: ["Exporter"],
  },
  exporters: [new SvgExporter()],
};
export default plugin;
