import type { Diagnostic } from "@designperspectives/contracts";
import type { SidecarSet } from "./types.js";
import { nodeOffset, positionAt } from "./yaml-io.js";
import type { DocPath, ParsedYaml } from "./yaml-io.js";

export interface LoadState {
  set: SidecarSet;
  diagnostics: Diagnostic[];
}

/** The file being loaded. */
export interface FileContext {
  state: LoadState;
  /** Path relative to `architecture/`. */
  file: string;
  parsed: ParsedYaml;
}

/** Records an error pointing at the YAML node at `path` (or its nearest existing ancestor). */
export function reportAt(ctx: FileContext, code: string, path: DocPath, message: string, subject?: string): void {
  const position = positionAt(ctx.parsed, nodeOffset(ctx.parsed.doc, path));
  const diagnostic: Diagnostic = { severity: "error", code, message, file: ctx.file, ...position };
  ctx.state.diagnostics.push(subject === undefined ? diagnostic : { ...diagnostic, subject });
}
