/**
 * Ports of the microkernel (spec file 01 §5.4, ADR-0005).
 * The core talks to plug-ins only through these interfaces. Contract version follows semver:
 * a plug-in declares the contract range it implements and the Plug-in Host rejects mismatches.
 */
import type { Diagnostic } from "./diagnostics.js";
import type { ComputedView, Model } from "./model.js";

/** Version of the contract set in this package. Bump the major on any breaking port change. */
export const CONTRACTS_VERSION = "0.1.0";

/** A text file inside the workspace's `architecture/` folder, path relative to that folder, POSIX separators. */
export interface SourceFile {
  path: string;
  content: string;
}

export interface LoadResult {
  model: Model;
  diagnostics: Diagnostic[];
}

/**
 * ModelPort — the only way the core reads or writes the model DSL (ADR-0004, FF1).
 * Implementations: LikeC4 adapter (default). A Structurizr backend may follow.
 */
export interface ModelPort {
  readonly id: string;
  /** File extension of model source files, e.g. ".c4". */
  readonly fileExtension: string;
  /** Parse model source files (paths relative to `architecture/`). Never throws on user errors: returns diagnostics. */
  load(files: readonly SourceFile[]): Promise<LoadResult>;
  /**
   * Print a model to canonical source files (plan Q6: tool-owned files, own printer).
   * Must be deterministic: the same model always yields byte-identical files.
   */
  print(model: Model): SourceFile[];
  /** Lay out one view of a model (positions in pixels, deterministic). */
  layoutView(model: Model, viewId: string): Promise<ComputedView>;
}

export interface ExportOptions {
  /** Restrict to these views; all views when absent. */
  viewIds?: string[];
}

/** Exporter — converts the model (and optionally computed views) into an interchange format. */
export interface Exporter {
  /** Format id used by `dp export --format <id>`. */
  readonly format: string;
  readonly description: string;
  /** Whether the exporter needs laid-out views. */
  readonly needsLayout: boolean;
  export(input: ExportInput, options?: ExportOptions): SourceFile[];
}

export interface ExportInput {
  model: Model;
  /** Laid-out views, present when `needsLayout` is true. */
  views: ComputedView[];
  workspaceName: string;
}

// ---- Jobs (ADR-0012) -----------------------------------------------------------------------

export interface JobProgress {
  /** 0..1, or undefined when indeterminate. */
  fraction?: number;
  message?: string;
}

export type JobState = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface JobStatus {
  id: string;
  type: string;
  state: JobState;
  progress: JobProgress;
  error?: string;
}

/** A unit of long-running work executed off the UI thread. */
export interface JobHandler<I = unknown, O = unknown> {
  readonly type: string;
  run(input: I, ctx: JobContext): Promise<O>;
}

export interface JobContext {
  readonly signal: AbortSignal;
  reportProgress(p: JobProgress): void;
}

// ---- Plug-ins ------------------------------------------------------------------------------

export const PORT_NAMES = [
  "ModelPort",
  "Exporter",
  "Importer",
  "LanguageAnalyzer",
  "ManifestReader",
  "InterfaceReader",
  "IacReader",
  "CloudCollector",
  "TraceSource",
  "LlmProvider",
  "Renderer",
  "FitnessTarget",
  "PerspectivePack",
  "Lint",
  "Job",
] as const;
export type PortName = (typeof PORT_NAMES)[number];

export interface PluginManifest {
  /** npm-style id, e.g. "@designperspectives/plugin-export-mermaid". */
  id: string;
  version: string;
  /** Semver range of CONTRACTS_VERSION this plug-in implements, e.g. "^0.1.0". */
  contracts: string;
  provides: PortName[];
  /**
   * "in-process" (default) or "worker": heavy or untrusted plug-ins run in a Job Worker
   * (ADR-0005 consequences). Only Job-providing plug-ins may request "worker" in Wave 0.
   */
  isolation?: "in-process" | "worker";
}

/** What a plug-in module default-exports. */
export interface PluginModule {
  manifest: PluginManifest;
  modelPorts?: ModelPort[];
  exporters?: Exporter[];
  jobs?: JobHandler[];
}
