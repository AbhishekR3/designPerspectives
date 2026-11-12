/**
 * Workspace service of the desktop host: opens a workspace with the core Model Store and answers the
 * read-only queries of IPC API v1. The renderer never sees the model directly, only these projections.
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { Diagnostic, ModelPort } from "@designperspectives/contracts";
import { keyForView } from "@designperspectives/contracts";
import { contractSampleModel } from "@designperspectives/contracts/testing";
import { emptySidecarSet, ModelStore, readArchitectureFiles, type LoadedWorkspace } from "@designperspectives/core";
import type { ElementRow, ViewPayload, WorkspaceSummary } from "../shared/ipc.js";

interface OpenWorkspace {
  name: string;
  root: string;
  loaded: LoadedWorkspace;
  /** Host notes shown in the status bar (e.g. "temporary sample workspace"). */
  notes: Diagnostic[];
}

export interface WorkspaceServiceOptions {
  port: ModelPort;
  /** Used when `open()` gets no root: `DP_WORKSPACE`, else the repository's example. */
  defaultRoot: string;
}

async function hasModelFiles(root: string, ext: string): Promise<boolean> {
  const files = await readArchitectureFiles(root);
  return files.some((f) => f.path.startsWith("model/") && f.path.endsWith(ext));
}

export class WorkspaceService {
  private readonly store: ModelStore;
  private current: OpenWorkspace | undefined;

  constructor(private readonly options: WorkspaceServiceOptions) {
    this.store = new ModelStore(options.port);
  }

  async open(root?: string): Promise<WorkspaceSummary> {
    const target = root ?? this.options.defaultRoot;
    const notes: Diagnostic[] = [];
    let actualRoot = target;
    let name = basename(target);
    if (!(await hasModelFiles(target, this.options.port.fileExtension))) {
      if (root !== undefined) throw new Error(`No model files found under ${join(target, "architecture", "model")}`);
      actualRoot = await this.createSampleWorkspace();
      name = "Internet Banking (temporary sample)";
      notes.push({
        severity: "info",
        code: "desktop/temporary-workspace",
        message: `No model files in ${target}; opened a temporary sample workspace at ${actualRoot}.`,
      });
    }
    const loaded = await this.store.load(actualRoot);
    this.current = { name, root: actualRoot, loaded, notes };
    return this.summary(this.current);
  }

  listElements(): ElementRow[] {
    const { model } = this.require().loaded;
    return [...model.elements]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((e) => ({
        id: e.id,
        kind: e.kind,
        title: e.title,
        ...(e.technology ? { technology: e.technology } : {}),
        ...(e.description ? { description: e.description } : {}),
      }));
  }

  async getView(viewId: string): Promise<ViewPayload> {
    const { model } = this.require().loaded;
    const view = await this.options.port.layoutView(model, viewId);
    return { view, key: keyForView(view) };
  }

  private require(): OpenWorkspace {
    if (!this.current) throw new Error("No workspace is open");
    return this.current;
  }

  private summary(w: OpenWorkspace): WorkspaceSummary {
    const { model, diagnostics } = w.loaded;
    return {
      name: w.name,
      root: w.root,
      elementCount: model.elements.length,
      relationshipCount: model.relationships.length,
      views: model.views.map((v) => ({ id: v.id, type: v.type, title: v.title })),
      diagnostics: [...w.notes, ...diagnostics],
    };
  }

  /** Prints the contract sample model with the model port into a fresh temporary folder. */
  private async createSampleWorkspace(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "dp-desktop-sample-"));
    await this.store.save(dir, [], { model: contractSampleModel(), sidecars: emptySidecarSet() });
    return dir;
  }
}
