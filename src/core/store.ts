/**
 * Reading and writing the two model files in `<project>/architecture/`.
 *
 * - `workspace.json`           Structurizr workspace (model, views, positions, flows)
 * - `designperspectives.json`  sidecar (tag groups, lenses, styles, layouts)
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
import { syncFlows } from "./flows.js";
import { stableJson } from "./json.js";
import { ModelError } from "./ops.js";
import { emptySidecar, parseSidecar, sidecarData, type Sidecar } from "./sidecar.js";
import { errors } from "./validate.js";
import { dumpWorkspace, emptyWorkspace, readWorkspace, type Workspace } from "./workspace.js";

export const ARCH_DIR = "architecture";
export const WORKSPACE_FILE = "workspace.json";
export const SIDECAR_FILE = "designperspectives.json";

/** The package's root folder (holds package.json, demo/ and static/), from src/ or dist/. */
export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function atomicWrite(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(tmp, text, "utf-8");
    fs.renameSync(tmp, file);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
}

type Snapshot = [Workspace, Sidecar];
type Stamp = string;

function stampOf(file: string): string {
  try {
    const s = fs.statSync(file, { bigint: true });
    return `${s.mtimeNs}:${s.size}`;
  } catch {
    return "-";
  }
}

export class Project {
  static HISTORY = 50;
  readonly root: string;
  readonly codeRoot: string;
  readonly dir: string;
  readonly wsPath: string;
  readonly scPath: string;
  workspace!: Workspace;
  sidecar!: Sidecar;
  loadErrors: string[] = [];
  undoStack: Snapshot[] = [];
  redoStack: Snapshot[] = [];
  private stamp: Stamp = "";

  constructor(root: string, codeRoot?: string | null) {
    this.root = path.resolve(root);
    this.codeRoot = codeRoot ? path.resolve(codeRoot) : this.root;
    this.dir = path.join(this.root, ARCH_DIR);
    this.wsPath = path.join(this.dir, WORKSPACE_FILE);
    this.scPath = path.join(this.dir, SIDECAR_FILE);
    this.load();
  }

  private fileStamp(): Stamp {
    return `${stampOf(this.wsPath)}|${stampOf(this.scPath)}`;
  }

  load(): void {
    if (!fs.existsSync(this.wsPath)) throw new NotFound(`No ${ARCH_DIR}/${WORKSPACE_FILE} in ${this.root}`);
    this.workspace = readWorkspace(this.wsPath);
    this.sidecar = fs.existsSync(this.scPath) ? parseSidecar(fs.readFileSync(this.scPath, "utf-8")) : emptySidecar();
    this.loadErrors = errors(this.workspace, this.sidecar);
    this.stamp = this.fileStamp();
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
  edit<T>(fn: (ws: Workspace, sc: Sidecar) => T, record = true): T {
    this.reloadIfChanged();
    const ws = structuredClone(this.workspace);
    const sc = structuredClone(this.sidecar);
    const result = fn(ws, sc);
    syncViews(ws);
    syncFlows(ws);
    prune(ws, sc);
    const before = new Set(this.loadErrors);
    const added = errors(ws, sc).filter((e) => !before.has(e));
    if (added.length) throw new ModelError(added.join(" "));
    if (record) {
      this.undoStack.push([this.workspace, this.sidecar]);
      this.undoStack.splice(0, Math.max(0, this.undoStack.length - Project.HISTORY));
      this.redoStack = [];
    }
    this.write(ws, sc);
    return result;
  }

  undo(): boolean {
    this.reloadIfChanged();
    const snap = this.undoStack.pop();
    if (!snap) return false;
    this.redoStack.push([this.workspace, this.sidecar]);
    this.write(...snap);
    return true;
  }

  redo(): boolean {
    this.reloadIfChanged();
    const snap = this.redoStack.pop();
    if (!snap) return false;
    this.undoStack.push([this.workspace, this.sidecar]);
    this.write(...snap);
    return true;
  }

  write(ws: Workspace, sc: Sidecar): void {
    atomicWrite(this.wsPath, dumpWorkspace(ws));
    atomicWrite(this.scPath, stableJson(sidecarData(sc)));
    this.workspace = ws;
    this.sidecar = sc;
    this.loadErrors = errors(ws, sc);
    this.stamp = this.fileStamp();
  }
}

export class NotFound extends Error {}
export class AlreadyExists extends Error {}

// -------------------------------------------------------------------- init

export const DEMO_DIR = path.join(PACKAGE_ROOT, "demo");

/** Create `<root>/architecture/` with the demo model or an empty one. Never overwrites. */
export function initProject(root: string, opts: { demo?: boolean; name?: string | null } = {}): string {
  const demo = opts.demo ?? true;
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
  if (demo) copySampleCode(root);
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
