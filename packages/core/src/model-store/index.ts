/**
 * Model Store (spec file 01 §5.3): loads and saves the model through the ModelPort plus the sidecar files,
 * with canonical serialisation (FF6: load → save without edits gives zero diff).
 */
import type { Diagnostic, Model, ModelPort, SourceFile } from "@designperspectives/contracts";
import { hasErrors, isValidElementId, sortDiagnostics } from "@designperspectives/contracts";
import { classifySidecarPath, loadSidecars, printSidecars, renameElementInSidecars, type SidecarSet } from "../sidecars/index.js";
import { validateModel } from "../model-validation/index.js";
import { readArchitectureFiles, removeArchitectureFiles, writeArchitectureFiles } from "./fs.js";
import { renameElementInModel } from "./rename-model.js";
import { locateSubjects } from "./locate.js";
import { crossCheck } from "./cross-check.js";

export { ARCHITECTURE_DIR, readArchitectureFiles } from "./fs.js";
export { renameElementInModel } from "./rename-model.js";

export interface WorkspaceState {
  model: Model;
  sidecars: SidecarSet;
}

export interface LoadedWorkspace extends WorkspaceState {
  /** Files as read from disk (used to compute what a save changes). */
  files: SourceFile[];
  diagnostics: Diagnostic[];
}

function isModelFile(path: string, port: ModelPort): boolean {
  return path.startsWith("model/") && path.endsWith(port.fileExtension);
}

export class ModelStore {
  constructor(private readonly port: ModelPort) {}

  /** Parses files (paths relative to `architecture/`). Never throws on user content. */
  async loadFiles(files: readonly SourceFile[]): Promise<LoadedWorkspace> {
    const modelFiles = files.filter((f) => isModelFile(f.path, this.port));
    const loaded = await this.port.load(modelFiles);
    const side = loadSidecars(files);
    const validation = hasErrors(loaded.diagnostics) ? [] : validateModel(loaded.model);
    const located = locateSubjects([...validation, ...crossCheck(loaded.model, side.sidecars)], this.port.print(loaded.model));
    return {
      model: loaded.model,
      sidecars: side.sidecars,
      files: [...files],
      diagnostics: sortDiagnostics([...loaded.diagnostics, ...side.diagnostics, ...located]),
    };
  }

  async load(root: string): Promise<LoadedWorkspace> {
    return this.loadFiles(await readArchitectureFiles(root));
  }

  /** The complete set of files the store would write for this state (canonical form). */
  print(state: WorkspaceState): SourceFile[] {
    return [...this.port.print(state.model), ...printSidecars(state.sidecars)].sort((a, b) => (a.path < b.path ? -1 : 1));
  }

  /** Files to write and files to remove so that disk equals `print(state)`. Unknown files are left alone. */
  plan(previous: readonly SourceFile[], state: WorkspaceState): { write: SourceFile[]; remove: string[] } {
    const next = this.print(state);
    const before = new Map(previous.map((f) => [f.path, f.content]));
    const nextPaths = new Set(next.map((f) => f.path));
    const write = next.filter((f) => before.get(f.path) !== f.content);
    const owned = (p: string): boolean => isModelFile(p, this.port) || classifySidecarPath(p) !== undefined;
    const remove = previous.map((f) => f.path).filter((p) => owned(p) && !nextPaths.has(p));
    return { write, remove };
  }

  async save(root: string, previous: readonly SourceFile[], state: WorkspaceState): Promise<{ written: string[]; removed: string[] }> {
    const { write, remove } = this.plan(previous, state);
    await writeArchitectureFiles(root, write);
    await removeArchitectureFiles(root, remove);
    return { written: write.map((f) => f.path), removed: remove };
  }

  /**
   * ID refactor (spec file 04 §3, plan finding F3): renames an element and its descendants everywhere —
   * model, views, deployment instances and every sidecar reference — as one state change.
   */
  renameElement(state: WorkspaceState, from: string, to: string): { state: WorkspaceState; diagnostics: Diagnostic[] } {
    const fail = (message: string) => ({ state, diagnostics: [{ severity: "error" as const, code: "refactor/rename", subject: from, message }] });
    if (!state.model.elements.some((e) => e.id === from)) return fail(`No element with id "${from}".`);
    if (!isValidElementId(to)) return fail(`"${to}" is not a valid element id.`);
    if (state.model.elements.some((e) => e.id === to || e.id.startsWith(`${to}.`))) return fail(`An element with id "${to}" already exists.`);
    const next = { model: renameElementInModel(state.model, from, to), sidecars: renameElementInSidecars(state.sidecars, from, to) };
    const errors = validateModel(next.model).filter((d) => d.severity === "error");
    return errors.length ? { state, diagnostics: errors } : { state: next, diagnostics: [] };
  }
}
