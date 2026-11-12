/**
 * LikeC4 ModelPort adapter (ADR-0004). This package is the only one allowed to import `@likec4/*` (FF1).
 * Write path (plan Q6): tool-owned `.c4` files produced by our own canonical printer, re-parsed by LikeC4.
 */
import { createHash } from "node:crypto";
import type { ComputedView, Diagnostic, LoadResult, Model, ModelPort, PluginModule, SourceFile } from "@designperspectives/contracts";
import { CONTRACTS_VERSION, sortDiagnostics } from "@designperspectives/contracts";
import { printModel } from "./printer.js";
import { readModel } from "./reader.js";
import { toComputedView } from "./layout.js";
import type { LcError, LcInstance, LcLayoutView, LcParsedModel } from "./likec4-types.js";

export { printModel } from "./printer.js";

const WORKSPACE_PREFIX = "/workspace/";

type FromSources = (sources: Record<string, string>, options: Record<string, unknown>) => Promise<LcInstance>;

let fromSourcesFn: Promise<FromSources> | undefined;
function likec4(): Promise<FromSources> {
  fromSourcesFn ??= import("@likec4/language-services/node").then((m) => (m as unknown as { fromSources: FromSources }).fromSources);
  return fromSourcesFn;
}

function toDiagnostic(e: LcError): Diagnostic {
  const file = e.sourceFsPath?.startsWith(WORKSPACE_PREFIX) ? e.sourceFsPath.slice(WORKSPACE_PREFIX.length) : e.sourceFsPath;
  const line = e.range?.start.line ?? e.line;
  const firstLine = e.message.split("\n")[0]!.slice(0, 200);
  return {
    severity: "error",
    code: "likec4/syntax",
    message: firstLine,
    ...(file ? { file } : {}),
    // LikeC4 reports 0-based positions (observed in spike probe 5); diagnostics are 1-based.
    ...(line !== undefined ? { line: line + 1 } : {}),
    ...(e.range ? { column: e.range.start.character + 1 } : {}),
  };
}

async function open(files: readonly SourceFile[]): Promise<LcInstance> {
  const sources = Object.fromEntries(files.filter((f) => f.path.endsWith(".c4")).map((f) => [f.path, f.content]));
  const fromSources = await likec4();
  return fromSources(sources, { logger: false, printErrors: false, graphviz: "wasm" });
}

interface LayoutCacheEntry {
  key: string;
  views: Promise<{ layouted: Record<string, LcLayoutView>; parsed: LcParsedModel }>;
}

export class LikeC4ModelPort implements ModelPort {
  readonly id = "likec4";
  readonly fileExtension = ".c4";
  private cache: LayoutCacheEntry | undefined;

  async load(files: readonly SourceFile[]): Promise<LoadResult> {
    const instance = await open(files);
    try {
      const errors = instance.getErrors().map(toDiagnostic);
      if (errors.length) return { model: { elements: [], relationships: [], deploymentNodes: [], deploymentInstances: [], views: [] }, diagnostics: sortDiagnostics(errors) };
      const parsed = (await instance.parsedModel()).$data;
      const { model, diagnostics } = readModel(parsed);
      return { model, diagnostics: sortDiagnostics(diagnostics) };
    } finally {
      await instance.dispose();
    }
  }

  print(model: Model): SourceFile[] {
    return printModel(model);
  }

  async layoutView(model: Model, viewId: string): Promise<ComputedView> {
    const def = model.views.find((v) => v.id === viewId);
    if (!def) throw new Error(`Unknown view "${viewId}"`);
    const { layouted, parsed } = await this.layoutAll(model);
    const lv = layouted[viewId];
    if (!lv) throw new Error(`LikeC4 produced no layout for view "${viewId}"`);
    return toComputedView(lv, def, model, parsed);
  }

  private layoutAll(model: Model): LayoutCacheEntry["views"] {
    const files = printModel(model);
    const key = createHash("sha256").update(JSON.stringify(files)).digest("hex");
    if (this.cache?.key === key) return this.cache.views;
    const views = (async () => {
      const instance = await open(files);
      try {
        const errors = instance.getErrors();
        if (errors.length) throw new Error(`Model does not parse: ${errors.map((e) => toDiagnostic(e).message).join("; ")}`);
        const parsed = (await instance.parsedModel()).$data;
        const layouted = (await instance.layoutedModel()).$data.views;
        return { layouted, parsed };
      } finally {
        await instance.dispose();
      }
    })();
    this.cache = { key, views };
    return views;
  }
}

const plugin: PluginModule = {
  manifest: {
    id: "@designperspectives/plugin-model-likec4",
    version: "0.1.0",
    contracts: `^${CONTRACTS_VERSION}`,
    provides: ["ModelPort"],
  },
  modelPorts: [new LikeC4ModelPort()],
};
export default plugin;
