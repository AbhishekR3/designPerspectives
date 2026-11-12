/**
 * Desktop IPC API, version 1 (plan task 0b-10). The renderer can only reach the host through these calls,
 * exposed by the preload script as `window.dp` (contextBridge). Shared by main, preload and renderer;
 * contains types and constants only (no logic, no Node imports) so FF12 holds.
 */
import type { ComputedView, Diagnostic, ElementKind, JobStatus, KeyEntry, ViewType } from "@designperspectives/contracts";

export const IPC_API_VERSION = 1;

export const IPC_CHANNELS = {
  version: "dp:v1:version",
  openWorkspace: "dp:v1:workspace.open",
  listElements: "dp:v1:workspace.elements",
  getView: "dp:v1:view.get",
  startDemoJob: "dp:v1:jobs.startDemo",
  cancelJob: "dp:v1:jobs.cancel",
  /** Main → renderer push channel. */
  jobUpdate: "dp:v1:jobs.update",
} as const;

export interface VersionInfo {
  app: string;
  contracts: string;
  ipcApi: number;
  electron: string;
  node: string;
}

export interface ViewSummary {
  id: string;
  type: ViewType;
  title: string;
}

export interface WorkspaceSummary {
  name: string;
  root: string;
  elementCount: number;
  relationshipCount: number;
  views: ViewSummary[];
  diagnostics: Diagnostic[];
}

export interface ElementRow {
  id: string;
  kind: ElementKind;
  title: string;
  technology?: string;
  description?: string;
}

export interface ViewPayload {
  view: ComputedView;
  key: KeyEntry[];
}

/** Result envelope: IPC handlers never throw across the bridge. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Shape of `window.dp` in the renderer. */
export interface DesktopApi {
  version(): Promise<Result<VersionInfo>>;
  /** Opens the workspace at `root` (a folder containing `architecture/`); without a root, opens the bundled demo. */
  openWorkspace(root?: string): Promise<Result<WorkspaceSummary>>;
  listElements(): Promise<Result<ElementRow[]>>;
  getView(viewId: string): Promise<Result<ViewPayload>>;
  startDemoJob(steps: number): Promise<Result<string>>;
  cancelJob(jobId: string): Promise<Result<void>>;
  onJobUpdate(listener: (status: JobStatus) => void): () => void;
}
