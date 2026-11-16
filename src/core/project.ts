/**
 * Reading and writing the two model files in `<project>/architecture/`.
 *
 * - `workspace.json`           Structurizr workspace (model, views, positions, flows)
 * - `designperspectives.json`  sidecar (tag groups, lenses, styles, layouts)
 * - `decisions/NNNN-*.md`      decision records (decisions.ts)
 *
 * Every edit runs on a copy; the copy is synced, validated and written atomically, then becomes
 * current. An edit is refused if it adds a validation error (errors already in a file opened from
 * elsewhere are reported but do not block unrelated edits). Files changed on disk (e.g. by
 * `git checkout`) are picked up on the next request.
 *
 * The server handles one request at a time per project (Node is single-threaded and every edit
 * here is synchronous), so no lock is needed.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prune, syncViews } from "./diagrams.js";
import { DECISIONS_DIR, decisionsDir, decisionsStamp, readDecisions, writeDecisions } from "./decisions.js";
import { syncFlows } from "./flows.js";
import { atomicWrite, stableJson } from "./util.js";
import { ModelError } from "./ops.js";
import { emptySidecar, parseSidecar, sidecarData, type Sidecar } from "./sidecar.js";
import { addedErrors, errors } from "./validate.js";
import { dumpWorkspace, emptyWorkspace, readWorkspace, type Workspace } from "./workspace.js";
import type { Decision } from "../shared/types.js";

export const ARCH_DIR = "architecture";
export const WORKSPACE_FILE = "workspace.json";
export const SIDECAR_FILE = "designperspectives.json";

/** The package's root folder (holds package.json, demo/ and static/), from src/ or dist/. */
export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// Kept here as a re-export: drafts.ts and others import it from project.ts.
export { atomicWrite };

type Snapshot = [Workspace, Sidecar, Decision[]];
type Stamp = string;

function stampOf(file: string): string {
  try {
    const s = fs.statSync(file, { bigint: true });
    return `${s.mtimeNs}:${s.size}`;
  } catch {
    return "-";
  }
}

/** A new revision tag; unique within the server process, so a reloaded or replaced model never repeats one. */
let revisions = 0;
export const nextRevision = (): string => `r${++revisions}`;

/** A model version the server can show: the main model, a draft, or a read-only copy. */
export interface ModelSource {
  readonly workspace: Workspace;
  /** Changes whenever the model is written or reloaded from disk (the UI's cheap "anything changed?" check). */
  readonly revision: string;
  readonly sidecar: Sidecar;
  /** Decision records, by file name. */
  readonly decisions: Decision[];
  readonly loadErrors: string[];
  readonly readOnly: boolean;
  reloadIfChanged(): boolean;
}

/** A read-only model version read from a folder's files (e.g. a draft's base copy). */
export class FileSnapshot implements ModelSource {
  readonly readOnly = true;
  workspace!: Workspace;
  sidecar!: Sidecar;
  decisions: Decision[] = [];
  loadErrors: string[] = [];
  revision = "";
  private stamp = "";
  private readonly dir: string;

  constructor(
    readonly wsPath: string,
    readonly scPath: string,
  ) {
    this.dir = path.dirname(wsPath);
    this.reloadIfChanged();
  }

  reloadIfChanged(): boolean {
    const now = `${stampOf(this.wsPath)}|${stampOf(this.scPath)}|${decisionsStamp(this.dir)}`;
    if (now === this.stamp) return false;
    if (!fs.existsSync(this.wsPath)) throw new NotFound(`No ${this.wsPath}`);
    this.workspace = readWorkspace(this.wsPath);
    this.sidecar = fs.existsSync(this.scPath) ? parseSidecar(fs.readFileSync(this.scPath, "utf-8")) : emptySidecar();
    this.decisions = readDecisions(this.dir);
    this.loadErrors = errors(this.workspace, this.sidecar, this.decisions);
    this.stamp = now;
    this.revision = nextRevision();
    return true;
  }
}

export class Project implements ModelSource {
  static HISTORY = 50;
  readonly readOnly = false;
  readonly root: string;
  readonly codeRoot: string;
  readonly dir: string;
  readonly wsPath: string;
  readonly scPath: string;
  workspace!: Workspace;
  sidecar!: Sidecar;
  decisions: Decision[] = [];
  loadErrors: string[] = [];
  undoStack: Snapshot[] = [];
  redoStack: Snapshot[] = [];
  revision = "";
  private stamp: Stamp = "";

  /** `dir`: the folder holding the model files (default `<root>/architecture`; drafts live elsewhere). */
  constructor(root: string, codeRoot?: string | null, dir?: string) {
    this.root = path.resolve(root);
    this.codeRoot = codeRoot ? path.resolve(codeRoot) : this.root;
    this.dir = dir ? path.resolve(dir) : path.join(this.root, ARCH_DIR);
    this.wsPath = path.join(this.dir, WORKSPACE_FILE);
    this.scPath = path.join(this.dir, SIDECAR_FILE);
    this.load();
  }

  private fileStamp(): Stamp {
    return `${stampOf(this.wsPath)}|${stampOf(this.scPath)}|${decisionsStamp(this.dir)}`;
  }

  /** The folder of decision records. */
  get decisionsDir(): string {
    return decisionsDir(this.dir);
  }

  load(): void {
    if (!fs.existsSync(this.wsPath)) throw new NotFound(`No ${path.relative(this.root, this.wsPath) || WORKSPACE_FILE} in ${this.root}`);
    this.workspace = readWorkspace(this.wsPath);
    this.sidecar = fs.existsSync(this.scPath) ? parseSidecar(fs.readFileSync(this.scPath, "utf-8")) : emptySidecar();
    this.decisions = readDecisions(this.dir);
    this.loadErrors = errors(this.workspace, this.sidecar, this.decisions);
    this.stamp = this.fileStamp();
    this.revision = nextRevision();
    this.undoStack = [];
    this.redoStack = [];
  }

  reloadIfChanged(): boolean {
    if (this.fileStamp() !== this.stamp) {
      this.load();
      return true;
    }
    return false;
  }

  /** Run `fn` on copies of the model; keep the result only if it adds no validation error. */
  edit<T>(fn: (ws: Workspace, sc: Sidecar, decisions: Decision[]) => T, record = true): T {
    this.reloadIfChanged();
    const ws = structuredClone(this.workspace);
    const sc = structuredClone(this.sidecar);
    const decs = structuredClone(this.decisions);
    const result = fn(ws, sc, decs);
    syncViews(ws);
    syncFlows(ws);
    prune(ws, sc);
    decs.sort((a, b) => a.file.localeCompare(b.file));
    const added = addedErrors(this.loadErrors, errors(ws, sc, decs));
    if (added.length) throw new ModelError(added.join(" "));
    if (record) {
      this.undoStack.push(this.snapshot());
      this.undoStack.splice(0, Math.max(0, this.undoStack.length - Project.HISTORY));
      this.redoStack = [];
    }
    this.write(ws, sc, decs);
    return result;
  }

  private snapshot(): Snapshot {
    return [this.workspace, this.sidecar, this.decisions];
  }

  undo(): boolean {
    this.reloadIfChanged();
    const snap = this.undoStack.pop();
    if (!snap) return false;
    this.redoStack.push(this.snapshot());
    this.write(...snap);
    return true;
  }

  redo(): boolean {
    this.reloadIfChanged();
    const snap = this.redoStack.pop();
    if (!snap) return false;
    this.undoStack.push(this.snapshot());
    this.write(...snap);
    return true;
  }

  /** Write the model; decision files are written only where they changed. `decs` defaults to the current ones. */
  write(ws: Workspace, sc: Sidecar, decs: Decision[] = this.decisions): void {
    atomicWrite(this.wsPath, dumpWorkspace(ws));
    atomicWrite(this.scPath, stableJson(sidecarData(sc)));
    writeDecisions(this.dir, this.decisions, decs);
    this.workspace = ws;
    this.sidecar = sc;
    this.decisions = decs;
    this.loadErrors = errors(ws, sc, decs);
    this.stamp = this.fileStamp();
    this.revision = nextRevision();
  }
}

export class NotFound extends Error {}
export class AlreadyExists extends Error {}

// -------------------------------------------------------------------- init

export const DEMO_DIR = path.join(PACKAGE_ROOT, "demo");

/** Create `<root>/architecture/` with an empty model (default) or the demo model. Never overwrites. */
export function initProject(root: string, opts: { demo?: boolean; name?: string | null } = {}): string {
  const demo = opts.demo ?? false;
  const arch = path.join(root, ARCH_DIR);
  const wsPath = path.join(arch, WORKSPACE_FILE);
  if (fs.existsSync(wsPath)) throw new AlreadyExists(`${wsPath} already exists`);
  fs.mkdirSync(arch, { recursive: true });
  let wsText: string;
  let scText: string;
  if (demo) {
    wsText = fs.readFileSync(path.join(DEMO_DIR, WORKSPACE_FILE), "utf-8");
    scText = fs.readFileSync(path.join(DEMO_DIR, SIDECAR_FILE), "utf-8");
  } else {
    wsText = dumpWorkspace(emptyWorkspace(opts.name || path.basename(path.resolve(root)) || "Workspace"));
    scText = stableJson(sidecarData(emptySidecar()));
  }
  atomicWrite(wsPath, wsText);
  atomicWrite(path.join(arch, SIDECAR_FILE), scText);
  if (demo) {
    const decs = path.join(DEMO_DIR, DECISIONS_DIR);
    if (fs.existsSync(decs)) fs.cpSync(decs, path.join(arch, DECISIONS_DIR), { recursive: true });
    copySampleCode(root);
  }
  return arch;
}

/** Copy the demo's example source files to `<root>/sample_code/` (never overwrites). */
export function copySampleCode(root: string): void {
  const src = path.join(DEMO_DIR, "sample_code");
  if (!fs.existsSync(src)) return;
  const walk = (from: string, to: string) => {
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      if (e.name === "__pycache__") continue;
      const a = path.join(from, e.name);
      const b = path.join(to, e.name);
      if (e.isDirectory()) walk(a, b);
      else if (!fs.existsSync(b)) {
        fs.mkdirSync(to, { recursive: true });
        fs.copyFileSync(a, b);
      }
    }
  };
  walk(src, path.join(root, "sample_code"));
}

export function staticDir(): string | null {
  const p = path.join(PACKAGE_ROOT, "static");
  return fs.existsSync(path.join(p, "index.html")) ? p : null;
}

export function version(): string {
  return JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf-8")).version as string;
}
