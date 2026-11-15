/**
 * Drafts: planned changes edited on a copy of the model, then applied to it or discarded.
 *
 *   architecture/drafts/<id>/draft.json                 title, description, created (date)
 *   architecture/drafts/<id>/workspace.json             the draft (edited like the main model)
 *   architecture/drafts/<id>/designperspectives.json
 *   architecture/drafts/<id>/base/workspace.json         the main model when the draft was made
 *   architecture/drafts/<id>/base/designperspectives.json
 *   architecture/drafts/<id>/code.json, code/<path>     planned code edits (see codefs.ts CodePlan)
 *
 * The base copy makes a three-way merge possible on apply (`merge.ts`): changes made to the main
 * model since the draft was made are kept, and an object changed on both sides is a conflict.
 * Drafts are plain files, so they can be committed and reviewed like any other change.
 */

import fs from "node:fs";
import path from "node:path";
import { prune, syncViews } from "./diagrams.js";
import { writeCodeFile } from "./code.js";
import { CodePlan, DiskCode, OverlayCode, safePath, sha1, type PlannedFile } from "./codefs.js";
import { diffModels, type Snapshot } from "./diff.js";
import { buildPlanItems, codingPlan } from "./plan.js";
import type { CodeSource } from "./codefs.js";
import { syncFlows } from "./flows.js";
import { isObj, stableJson } from "./json.js";
import { merge3 } from "./merge.js";
import { ModelError, slugify, unique } from "./ops.js";
import { FileSnapshot, NotFound, Project, SIDECAR_FILE, WORKSPACE_FILE, atomicWrite } from "./store.js";
import { flatten, unflatten, UnitError } from "./units.js";
import { addedErrors, errors } from "./validate.js";
import type { ApplyPreview, CodingPlan, Conflict, DraftInfo } from "../shared/types.js";

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
    return {
      id,
      title: s(meta.title) || id,
      description: s(meta.description),
      created: s(meta.created),
      branch: s(meta.branch),
      link: s(meta.link),
      plannedFiles: new CodePlan(f).files().size,
    };
  }

  /** The draft's planned code edits. */
  codePlan(id: string): CodePlan {
    return new CodePlan(this.folder(id));
  }

  /** The code as the draft plans it: the code folder with the planned edits on top. */
  code(id: string): OverlayCode {
    return new OverlayCode(new DiskCode(this.main.codeRoot), this.codePlan(id));
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

  update(id: string, patch: { title?: string; description?: string; branch?: string; link?: string }): void {
    const cur = this.info(id);
    const title = patch.title === undefined ? cur.title : patch.title.trim();
    if (!title) throw new ModelError("A draft needs a name.");
    if (title !== cur.title && this.list().some((d) => d.title === title)) throw new ModelError(`A draft named "${title}" already exists.`);
    const pick = (v: string | undefined, old: string) => (v === undefined ? old : v.trim());
    const meta: Record<string, string> = { title, description: pick(patch.description, cur.description), created: cur.created };
    const branch = pick(patch.branch, cur.branch);
    const link = pick(patch.link, cur.link);
    if (branch) meta.branch = branch;
    if (link) meta.link = link;
    atomicWrite(path.join(this.folder(id), DRAFT_FILE), stableJson(meta));
  }

  /** Discard a draft: delete its folder. */
  remove(id: string): void {
    const f = this.folder(id);
    fs.rmSync(f, { recursive: true, force: true });
    this.open.delete(id);
    this.bases.delete(id);
  }

  /** What applying would change in the main model, and what stops it. */
  preview(id: string, opts: { code?: boolean } = {}): ApplyPreview {
    const withCode = opts.code ?? true;
    const { merged, conflicts } = this.merged(id);
    const disk = new DiskCode(this.main.codeRoot);
    const plan = this.codePlan(id);
    const changes = diffModels(this.main, merged ?? this.main, "main", withCode ? { before: disk, after: this.code(id), planned: [...plan.files().keys()] } : undefined);
    const code = [...plan.files()].map(([path, p]) => ({ path, change: p.change }));
    return { changes, conflicts: [...conflicts, ...(withCode ? this.codeConflicts(id) : [])], code };
  }

  /** The coding plan of a draft; checked against `target` (the code folder or a branch) when given. */
  plan(id: string, target: CodeSource | null): CodingPlan {
    const draft = this.get(id);
    draft.reloadIfChanged();
    const base = this.base(id);
    const cs = diffModels(base, draft, "base");
    return codingPlan(this.info(id), buildPlanItems(base, draft, cs, this.codePlan(id)), target);
  }

  /** Planned files whose current version in the code folder is not the one they were planned on. */
  codeConflicts(id: string): Conflict[] {
    const disk = new DiskCode(this.main.codeRoot);
    const plan = this.codePlan(id);
    const out: Conflict[] = [];
    for (const [rel, p] of plan.files()) {
      const cur = disk.read(rel);
      const planned = p.change === "deleted" ? null : plan.content(rel);
      if (cur === planned) continue; // already like that
      const label = `File ${rel}`;
      if (!disk.hasRoot) out.push({ label, reason: "There is no code folder to write it to (start with --code-root)." });
      else if (p.base === null && cur !== null) out.push({ label, reason: "Planned as a new file, but a file with that name now exists in the code folder." });
      else if (p.base !== null && cur === null) out.push({ label, reason: "Removed from the code folder since the draft planned a change to it." });
      else if (p.base !== null && cur !== null && sha1(cur) !== p.base) out.push({ label, reason: "Changed in the code folder since the draft planned a change to it." });
    }
    return out;
  }

  /** Merge the draft into the main model (one undo step there); with `code`, also write the planned
   *  code edits to the code folder. Then delete the draft.
   *
   *  All or nothing: the code files are written first, each one backed up; then the model is
   *  applied. If either step fails, every touched file is put back as it was (created files and
   *  folders removed), the error is rethrown, and the draft stays. */
  apply(id: string, opts: { code?: boolean } = {}): void {
    const withCode = opts.code ?? true;
    const { merged, conflicts } = this.merged(id);
    const all = [...conflicts, ...(withCode ? this.codeConflicts(id) : [])];
    if (all.length || !merged) throw new ApplyConflict(all);
    const journal = new CodeJournal();
    try {
      if (withCode) this.writeCode(id, journal);
      this.main.edit((ws, sc) => {
        replaceContents(ws, merged.workspace);
        replaceContents(sc, merged.sidecar);
      });
    } catch (e) {
      journal.rollback();
      throw e;
    }
    this.remove(id);
  }

  private writeCode(id: string, journal: CodeJournal): void {
    const plan = this.codePlan(id);
    const root = this.main.codeRoot;
    for (const [rel, p] of plan.files()) {
      try {
        this.writeOne(root, rel, p, plan, journal);
      } catch (e) {
        if (e instanceof ModelError) throw e;
        // A file system error (e.g. ENOTDIR, EACCES): name the file, not the absolute path.
        const code = (e as NodeJS.ErrnoException).code;
        throw new ModelError(`Could not write ${rel} in the code folder${code ? ` (${code})` : ""}. Nothing was applied.`);
      }
    }
  }

  private writeOne(root: string | null, rel: string, p: PlannedFile, plan: CodePlan, journal: CodeJournal): void {
    const target = safePath(root, rel);
    if (p.change === "deleted") {
      if (!fs.existsSync(target)) return;
      journal.backup(target);
      fs.rmSync(target, { force: true });
      return;
    }
    const content = plan.content(rel) ?? "";
    if (fs.existsSync(target)) {
      if (fs.readFileSync(target, "utf-8") === content) return;
      journal.backup(target);
      writeCodeFile(root, rel, content, null);
    } else {
      journal.backup(target);
      atomicWrite(target, content);
    }
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
    const added = addedErrors(this.main.loadErrors, errors(result.workspace, result.sidecar));
    if (added.length) return { merged: null, conflicts: added.map((reason) => ({ label: "Model rule", reason })) };
    return { merged: result, conflicts: [] };
  }
}

/** Files and folders touched while applying a draft's code edits, so they can be put back. */
class CodeJournal {
  private files: { file: string; content: Buffer | null; mode: number }[] = [];
  private dirs: string[] = [];

  /** Record `file` as it is now (or that it does not exist), and the folders a write would create. */
  backup(file: string): void {
    if (fs.existsSync(file)) {
      const st = fs.statSync(file);
      this.files.push({ file, content: fs.readFileSync(file), mode: st.mode & 0o7777 });
      return;
    }
    this.files.push({ file, content: null, mode: 0 });
    // The topmost missing folder: removing it removes everything this apply created below it.
    let top: string | null = null;
    for (let d = path.dirname(file); !fs.existsSync(d); d = path.dirname(d)) {
      top = d;
      if (path.dirname(d) === d) break;
    }
    if (top) this.dirs.push(top);
  }

  /** Put every recorded file back, newest first. Failures are logged; the rest still run. */
  rollback(): void {
    for (const b of this.files.splice(0).reverse()) {
      try {
        if (b.content === null) {
          if (fs.existsSync(b.file)) fs.rmSync(b.file, { force: true });
        }
        else {
          fs.mkdirSync(path.dirname(b.file), { recursive: true });
          fs.writeFileSync(b.file, b.content);
          fs.chmodSync(b.file, b.mode);
        }
      } catch (e) {
        console.error(`Could not restore ${b.file}:`, e);
      }
    }
    for (const d of this.dirs.splice(0).reverse()) {
      try {
        fs.rmSync(d, { recursive: true, force: true });
      } catch (e) {
        console.error(`Could not remove ${d}:`, e);
      }
    }
  }
}

function replaceContents<T extends object>(target: T, source: T): void {
  for (const k of Object.keys(target)) delete (target as Record<string, unknown>)[k];
  Object.assign(target, source);
}
