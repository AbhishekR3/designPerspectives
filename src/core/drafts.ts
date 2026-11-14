/**
 * Drafts: planned changes edited on a copy of the model, then applied to it or discarded.
 *
 *   architecture/drafts/<id>/draft.json                 title, description, created (date)
 *   architecture/drafts/<id>/workspace.json             the draft (edited like the main model)
 *   architecture/drafts/<id>/designperspectives.json
 *   architecture/drafts/<id>/base/workspace.json         the main model when the draft was made
 *   architecture/drafts/<id>/base/designperspectives.json
 *
 * The base copy makes a three-way merge possible on apply (`merge.ts`): changes made to the main
 * model since the draft was made are kept, and an object changed on both sides is a conflict.
 * Drafts are plain files, so they can be committed and reviewed like any other change.
 */

import fs from "node:fs";
import path from "node:path";
import { prune, syncViews } from "./diagrams.js";
import { diffModels, type Snapshot } from "./diff.js";
import { syncFlows } from "./flows.js";
import { isObj, stableJson } from "./json.js";
import { merge3 } from "./merge.js";
import { ModelError, slugify, unique } from "./ops.js";
import { FileSnapshot, NotFound, Project, SIDECAR_FILE, WORKSPACE_FILE, atomicWrite } from "./store.js";
import { flatten, unflatten, UnitError } from "./units.js";
import { errors } from "./validate.js";
import type { ApplyPreview, Conflict, DraftInfo } from "../shared/types.js";

export const DRAFTS_DIR = "drafts";
export const DRAFT_FILE = "draft.json";
export const BASE_DIR = "base";
const ID_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;

/** Apply was refused; `conflicts` says why. */
export class ApplyConflict extends Error {
  constructor(readonly conflicts: Conflict[]) {
    super(`The draft cannot be applied: ${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"}.`);
  }
}

export class Drafts {
  readonly dir: string;
  private open = new Map<string, Project>();
  private bases = new Map<string, FileSnapshot>();

  constructor(readonly main: Project) {
    this.dir = path.join(main.dir, DRAFTS_DIR);
  }

  private folder(id: string): string {
    if (!ID_RE.test(id)) throw new NotFound(`No draft "${id}".`);
    const f = path.join(this.dir, id);
    if (!fs.existsSync(path.join(f, WORKSPACE_FILE))) throw new NotFound(`No draft "${id}".`);
    return f;
  }

  list(): DraftInfo[] {
    if (!fs.existsSync(this.dir)) return [];
    const out: DraftInfo[] = [];
    for (const e of fs.readdirSync(this.dir, { withFileTypes: true })) {
      if (!e.isDirectory() || !ID_RE.test(e.name) || !fs.existsSync(path.join(this.dir, e.name, WORKSPACE_FILE))) continue;
      out.push(this.info(e.name));
    }
    return out.sort((a, b) => a.created.localeCompare(b.created) || a.title.localeCompare(b.title));
  }

  info(id: string): DraftInfo {
    const f = this.folder(id);
    let meta: Record<string, unknown> = {};
    try {
      const m = JSON.parse(fs.readFileSync(path.join(f, DRAFT_FILE), "utf-8"));
      if (isObj(m)) meta = m;
    } catch {
      /* no or broken draft.json: fall back to the folder name */
    }
    const s = (v: unknown) => (typeof v === "string" ? v : "");
    return { id, title: s(meta.title) || id, description: s(meta.description), created: s(meta.created) };
  }

  /** The draft as an editable project (its own undo history). */
  get(id: string): Project {
    const f = this.folder(id);
    let p = this.open.get(id);
    if (!p) {
      p = new Project(this.main.root, this.main.codeRoot, f);
      this.open.set(id, p);
    }
    return p;
  }

  /** The main model as it was when the draft was made. */
  base(id: string): FileSnapshot {
    const f = this.folder(id);
    let b = this.bases.get(id);
    if (!b) {
      b = new FileSnapshot(path.join(f, BASE_DIR, WORKSPACE_FILE), path.join(f, BASE_DIR, SIDECAR_FILE));
      this.bases.set(id, b);
    } else b.reloadIfChanged();
    return b;
  }

  create(title: string, description = ""): string {
    const t = title.trim();
    if (!t) throw new ModelError("A draft needs a name.");
    if (this.list().some((d) => d.title === t)) throw new ModelError(`A draft named "${t}" already exists.`);
    this.main.reloadIfChanged();
    const taken = new Set(fs.existsSync(this.dir) ? fs.readdirSync(this.dir) : []);
    const id = unique(slugify(t).slice(0, 60), taken);
    const f = path.join(this.dir, id);
    const ws = fs.readFileSync(this.main.wsPath, "utf-8");
    const sc = fs.existsSync(this.main.scPath) ? fs.readFileSync(this.main.scPath, "utf-8") : stableJson({ version: 1 });
    for (const dir of [f, path.join(f, BASE_DIR)]) {
      atomicWrite(path.join(dir, WORKSPACE_FILE), ws);
      atomicWrite(path.join(dir, SIDECAR_FILE), sc);
    }
    atomicWrite(path.join(f, DRAFT_FILE), stableJson({ title: t, description: description.trim(), created: new Date().toISOString().slice(0, 10) }));
    return id;
  }

  update(id: string, patch: { title?: string; description?: string }): void {
    const cur = this.info(id);
    const title = patch.title === undefined ? cur.title : patch.title.trim();
    if (!title) throw new ModelError("A draft needs a name.");
    if (title !== cur.title && this.list().some((d) => d.title === title)) throw new ModelError(`A draft named "${title}" already exists.`);
    const description = patch.description === undefined ? cur.description : patch.description.trim();
    atomicWrite(path.join(this.folder(id), DRAFT_FILE), stableJson({ title, description, created: cur.created }));
  }

  /** Discard a draft: delete its folder. */
  remove(id: string): void {
    const f = this.folder(id);
    fs.rmSync(f, { recursive: true, force: true });
    this.open.delete(id);
    this.bases.delete(id);
  }

  /** What applying would change in the main model, and what stops it. */
  preview(id: string): ApplyPreview {
    const { merged, conflicts } = this.merged(id);
    const changes = diffModels(this.main, merged ?? this.main, "main");
    return { changes, conflicts };
  }

  /** Merge the draft into the main model (one undo step there), then delete the draft. */
  apply(id: string): void {
    const { merged, conflicts } = this.merged(id);
    if (conflicts.length || !merged) throw new ApplyConflict(conflicts);
    this.main.edit((ws, sc) => {
      replaceContents(ws, merged.workspace);
      replaceContents(sc, merged.sidecar);
    });
    this.remove(id);
  }

  private merged(id: string): { merged: Snapshot | null; conflicts: Conflict[] } {
    this.main.reloadIfChanged();
    const draft = this.get(id);
    draft.reloadIfChanged();
    const base = this.base(id);
    const { units, conflicts } = merge3(
      flatten(base.workspace, base.sidecar),
      flatten(this.main.workspace, this.main.sidecar),
      flatten(draft.workspace, draft.sidecar),
    );
    if (conflicts.length) return { merged: null, conflicts };
    let result: Snapshot;
    try {
      const { ws, sc } = unflatten(units);
      syncViews(ws);
      syncFlows(ws);
      prune(ws, sc);
      result = { workspace: ws, sidecar: sc };
    } catch (e) {
      if (e instanceof UnitError || e instanceof ModelError) return { merged: null, conflicts: [{ label: "Model", reason: e.message }] };
      throw e;
    }
    // Model rules (e.g. both sides added a container with the same name) are checked here so the
    // preview can show them; errors already in the main model do not count.
    const before = new Set(this.main.loadErrors);
    const added = errors(result.workspace, result.sidecar).filter((e) => !before.has(e));
    if (added.length) return { merged: null, conflicts: added.map((reason) => ({ label: "Model rule", reason })) };
    return { merged: result, conflicts: [] };
  }
}

function replaceContents<T extends object>(target: T, source: T): void {
  for (const k of Object.keys(target)) delete (target as Record<string, unknown>)[k];
  Object.assign(target, source);
}
