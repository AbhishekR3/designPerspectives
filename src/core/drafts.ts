/**
 * Drafts: planned changes edited on a copy of the model, then applied to it or discarded.
 *
 *   architecture/drafts/<id>/draft.json                 title, description, created (date), author, branch, link
 *   architecture/drafts/<id>/workspace.json             the draft (edited like the main model)
 *   architecture/drafts/<id>/designperspectives.json
 *   architecture/drafts/<id>/base/workspace.json         the main model when the draft was made
 *   architecture/drafts/<id>/base/designperspectives.json
 *   architecture/drafts/<id>/decisions/, base/decisions/  decision records (decisions.ts), the same way
 *   architecture/drafts/<id>/code.json, code/<path>     planned code edits (see codeFiles.ts CodePlan)
 *
 * The base copy makes a three-way merge possible on apply (`merge.ts`): changes made to the main
 * model since the draft was made are kept, and an object changed on both sides is a conflict.
 * Drafts are plain files, so they can be committed and reviewed like any other change.
 *
 * Partial apply (an import draft under review, DEC-051): the import module registers `DraftHooks`
 * (import/review.ts). Its `applyGuard` names the review items that are not accepted; `apply` resets their
 * units, plus what depends on them (`revertClosure`), to the base before the merge, so they cannot reach
 * main whoever calls apply. When something is held, the draft is not deleted but rebased: base := the new
 * main, draft := the new main with the held items on top. Writes, in this order: planned code files, main,
 * the draft's model files, the base copy, the import ledger, the review file. A crash after main is written
 * leaves the draft as it was (or rebased with the old base): applying it again finds the accepted items
 * already in main (no-ops) and still holds the rest. A failure while writing puts main, the draft and the
 * code back as they were. Undoing the apply restores main only (as for any apply, DEC-016).
 */

import fs from "node:fs";
import path from "node:path";
import { prune, syncViews } from "./diagrams.js";
import { writeCodeFile } from "./codeMap.js";
import { CodePlan, DiskCode, inProtectedFolder, OverlayCode, PROTECTED_MESSAGE, safePath, sha1, type PlannedFile } from "./codeFiles.js";
import { diffModels, type Snapshot } from "./diff.js";
import { buildPlanItems, codingPlan } from "./plan.js";
import type { CodeSource } from "./codeFiles.js";
import { DECISIONS_DIR, renumberAdded, writeDecisions } from "./decisions.js";
import { syncFlows } from "./flows.js";
import { isObj, stableJson } from "./util.js";
import { changedKeys, merge3, revertClosure, revertUnits, type ClosureOptions } from "./merge.js";
import { dropPending, dropReview, foldApplied, reviewPath } from "../import/ledger.js";
import { ModelError, slugify, unique } from "./ops.js";
import { FileSnapshot, NotFound, Project, SIDECAR_FILE, WORKSPACE_FILE, atomicWrite } from "./project.js";
import { flatten, isLayoutUnit, sameUnit, unflatten, unitLabel, UnitError, type Units } from "./units.js";
import type { Sidecar } from "./sidecar.js";
import type { Workspace } from "./workspace.js";
import { addedErrors, errors } from "./validate.js";
import type { ApplyHeld, ApplyOutcome, ApplyPreview, CodingPlan, Conflict, Decision, DraftInfo } from "../shared/types.js";

export const DRAFTS_DIR = "drafts";
export const DRAFT_FILE = "draft.json";
export const BASE_DIR = "base";
const ID_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;

/** What an apply guard holds back: review item key → the draft's unit keys that carry the item. */
export interface ApplyHold {
  items: Map<string, string[]>;
  /** The draft's unit keys that carry the accepted items. Only an accepted item (and what it brings) may reach main: with none, nothing is applied, whatever else the draft changed. */
  accepted: string[];
}

/** Hooks the import module registers (import/review.ts), so this module needs no review internals. */
export interface DraftHooks {
  /** For an import draft: the items that are not accepted (held on apply). null: not an import draft. */
  applyGuard(drafts: Drafts, id: string): ApplyHold | null;
  /** After a partial apply, once the draft holds only the held items (e.g. forget the applied items). */
  afterPartialApply?(drafts: Drafts, id: string): void;
}

let hooks: DraftHooks | null = null;

/** Register the import module's hooks (one set per process; the last one wins). */
export function registerDraftHooks(h: DraftHooks | null): void {
  hooks = h;
}

/** A draft's model as units, before and after holding back the guard's items. */
interface ApplyPlan {
  merged: Snapshot | null;
  conflicts: Conflict[];
  /** Set when an import draft has items held back. */
  hold: { held: ApplyHeld; rebased: Snapshot | null } | null;
}

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
  /** How far main has moved from each draft's base, by the revisions of the two models. */
  private behindCache = new Map<string, { key: string; n: number }>();

  /** `author`: who new drafts are credited to when the client does not say (e.g. the git user name). */
  constructor(
    readonly main: Project,
    private readonly author: string | null = null,
  ) {
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
      ...(s(meta.author) ? { author: s(meta.author) } : {}),
      behind: this.behind(id),
      branch: s(meta.branch),
      link: s(meta.link),
      plannedFiles: new CodePlan(f).files().size,
    };
  }

  /** Objects added, changed or removed in main since the draft started. Cached by the two models' revisions. */
  private behind(id: string): number {
    try {
      this.main.reloadIfChanged();
      const base = this.base(id);
      const key = `${this.main.revision}|${base.revision}`;
      const hit = this.behindCache.get(id);
      if (hit?.key === key) return hit.n;
      const { added, changed, removed } = diffModels(base, this.main, "main").summary;
      const n = added + changed + removed;
      this.behindCache.set(id, { key, n });
      return n;
    } catch {
      return 0; // no readable base copy (an older or hand-made draft)
    }
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

  /** `created`: the date recorded (YYYY-MM-DD; default today), so a generated draft can be made byte for byte again. */
  create(title: string, description = "", author?: string | null, created?: string): string {
    const t = title.trim();
    if (!t) throw new ModelError("A draft needs a name.");
    if (this.list().some((d) => d.title === t)) throw new ModelError(`A draft named "${t}" already exists.`);
    this.main.reloadIfChanged();
    const taken = new Set(fs.existsSync(this.dir) ? fs.readdirSync(this.dir) : []);
    const id = unique(slugify(t).slice(0, 60), taken);
    const f = path.join(this.dir, id);
    // Import state left by a draft folder deleted by hand would otherwise attach to this new draft.
    dropPending(this.main.dir, id);
    dropReview(this.main.dir, id);
    const ws = fs.readFileSync(this.main.wsPath, "utf-8");
    const sc = fs.existsSync(this.main.scPath) ? fs.readFileSync(this.main.scPath, "utf-8") : stableJson({ version: 1 });
    const decs = this.main.decisionsDir;
    for (const dir of [f, path.join(f, BASE_DIR)]) {
      atomicWrite(path.join(dir, WORKSPACE_FILE), ws);
      atomicWrite(path.join(dir, SIDECAR_FILE), sc);
      if (fs.existsSync(decs)) fs.cpSync(decs, path.join(dir, DECISIONS_DIR), { recursive: true });
    }
    const by = author?.trim() || this.author;
    atomicWrite(path.join(f, DRAFT_FILE), stableJson({ title: t, description: description.trim(), created: created ?? new Date().toISOString().slice(0, 10), ...(by ? { author: by } : {}) }));
    return id;
  }

  update(id: string, patch: { title?: string; description?: string; branch?: string; link?: string }): void {
    const cur = this.info(id);
    const title = patch.title === undefined ? cur.title : patch.title.trim();
    if (!title) throw new ModelError("A draft needs a name.");
    if (title !== cur.title && this.list().some((d) => d.title === title)) throw new ModelError(`A draft named "${title}" already exists.`);
    const pick = (v: string | undefined, old: string) => (v === undefined ? old : v.trim());
    const meta: Record<string, string> = { title, description: pick(patch.description, cur.description), created: cur.created };
    if (cur.author) meta.author = cur.author;
    const branch = pick(patch.branch, cur.branch);
    const link = pick(patch.link, cur.link);
    if (branch) meta.branch = branch;
    if (link) meta.link = link;
    atomicWrite(path.join(this.folder(id), DRAFT_FILE), stableJson(meta));
  }

  /** Discard a draft: delete its folder (and, for an import draft, its pending ledger, review state and import file). */
  remove(id: string): void {
    this.drop(id, false);
  }

  /** `applied`: the draft was applied whole; its import file is kept as the record of what was proposed. */
  private drop(id: string, applied: boolean): void {
    const f = this.folder(id);
    fs.rmSync(f, { recursive: true, force: true });
    dropPending(this.main.dir, id); // a discarded import draft leaves nothing in the import ledger
    dropReview(this.main.dir, id, { keepFile: applied });
    this.open.delete(id);
    this.bases.delete(id);
    this.behindCache.delete(id);
  }

  /** What applying would change in the main model, and what stops it. For an import draft with items
   *  that are not accepted, `changes` is what a partial apply would bring in and `held` says what stays. */
  preview(id: string, opts: { code?: boolean } = {}): ApplyPreview {
    const withCode = opts.code ?? true;
    const { merged, conflicts, hold } = this.planApply(id);
    const disk = new DiskCode(this.main.codeRoot);
    const plan = this.codePlan(id);
    const changes = diffModels(this.main, merged ?? this.main, "main", withCode ? { before: disk, after: this.code(id), planned: [...plan.files().keys()] } : undefined);
    const code = [...plan.files()].map(([path, p]) => ({ path, change: p.change }));
    return { changes, conflicts: [...conflicts, ...(withCode ? this.codeConflicts(id) : [])], code, ...(hold ? { held: hold.held } : {}) };
  }

  /**
   * Reset units of the draft (`units.ts` keys) to the draft's base, with what depends on them
   * (`revertClosure`): rejecting an element also takes out its new children, the relationships that touch
   * it and its positions, styles and layout entries. Flow steps over a relationship that goes are dropped
   * (`syncFlows`), and decisions stop naming objects that go, unless `opts` reverts those too. One undo
   * step in the draft; refused (ModelError) if the result breaks a model rule. Returns the keys reset.
   */
  revertUnits(id: string, unitKeys: Iterable<string>, opts: ClosureOptions = {}): string[] {
    const draft = this.get(id);
    draft.reloadIfChanged();
    const base = this.base(id);
    const B = flatten(base.workspace, base.sidecar, base.decisions);
    const T = flatten(draft.workspace, draft.sidecar, draft.decisions);
    const set = revertClosure(B, T, unitKeys, opts);
    const keys = [...set.keys].filter((k) => !sameIn(B, T, k)).sort();
    if (!keys.length) return [];
    const units = revertUnits(B, T, set.keys);
    const gone = new Set([...set.keys].filter((k) => (k.startsWith("el:") || k.startsWith("rel:")) && !units.has(k)).map((k) => k.slice(k.indexOf(":") + 1)));
    draft.edit((ws, sc, decs) => {
      let r: ReturnType<typeof unflatten>;
      try {
        r = unflatten(units);
      } catch (e) {
        if (e instanceof UnitError) throw new ModelError(e.message);
        throw e;
      }
      replaceContents(ws, r.ws);
      replaceContents(sc, r.sc);
      decs.splice(0, decs.length, ...r.decisions.map((d) => (d.affects.some((a) => gone.has(a)) ? { ...d, affects: d.affects.filter((a) => !gone.has(a)) } : d)));
    });
    return keys;
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
      if (inProtectedFolder(this.main.codeRoot, rel, [this.main.dir, path.join(this.main.root, ".dp")])) {
        out.push({ label, reason: PROTECTED_MESSAGE });
        continue;
      }
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
   *  folders removed), the error is rethrown, and the draft stays.
   *
   *  An import draft with items that are not accepted is applied in part (see the header): the held
   *  items stay in the draft, rebased on the new main, and so do its planned code edits (written again
   *  on a later apply, which finds them already there). Refused with a ModelError when nothing is accepted. */
  apply(id: string, opts: { code?: boolean } = {}): ApplyOutcome {
    const withCode = opts.code ?? true;
    const { merged, conflicts, hold } = this.planApply(id);
    const all = [...conflicts, ...(withCode ? this.codeConflicts(id) : [])];
    if (all.length || !merged) throw new ApplyConflict(all);
    if (hold?.held.nothingAccepted) {
      const n = hold.held.items;
      throw new ModelError(`Nothing is accepted yet: accept items in the review first (${n} item${n === 1 ? " is" : "s are"} waiting). Nothing was applied.`);
    }
    const rebased = hold?.rebased ?? null;
    if (hold && !rebased) throw new ApplyConflict([{ label: "Draft", reason: "The held items could not be kept in the draft." }]);
    const journal = new CodeJournal();
    const before = { ws: this.main.workspace, sc: this.main.sidecar, decs: this.main.decisions, undo: this.main.undoStack.length };
    let mainWritten = false;
    const draftBackup = rebased ? new FolderBackup(this.folder(id)) : null;
    try {
      if (withCode) this.writeCode(id, journal);
      this.main.edit((ws, sc, decs) => {
        replaceContents(ws, merged.workspace);
        replaceContents(sc, merged.sidecar);
        decs.splice(0, decs.length, ...(merged.decisions ?? []));
      });
      mainWritten = true;
      if (rebased) this.rebase(id, rebased);
    } catch (e) {
      if (mainWritten) this.restoreMain(before);
      if (draftBackup) {
        draftBackup.restore();
        this.open.delete(id);
        this.bases.delete(id);
      }
      journal.rollback();
      throw e;
    }
    try {
      // An import draft: what it wrote and main now holds becomes the import ledger's base (import/ledger.ts);
      // a partial apply keeps the entries of the held items pending.
      foldApplied(this.main.dir, this.main.workspace, id, { keepPending: !!rebased });
    } catch (e) {
      console.error(`designPerspectives: could not update the import ledger after applying draft "${id}":`, e);
    }
    if (rebased) {
      try {
        hooks?.afterPartialApply?.(this, id);
      } catch (e) {
        console.error(`designPerspectives: could not update the review of draft "${id}" after a partial apply:`, e);
      }
      return { kept: true, held: hold!.held.items };
    }
    this.drop(id, true);
    return { kept: false, held: 0 };
  }

  /** The draft becomes `rebased` over the main model as it is now: the draft's model files first, then the
   *  base copy (so a crash in between leaves a draft whose extra changes are already in main: no-ops).
   *  The draft's undo history is cleared: an undo would bring back the old base's view of main. */
  private rebase(id: string, rebased: Snapshot): void {
    const draft = this.get(id);
    draft.write(rebased.workspace, rebased.sidecar, rebased.decisions ?? []);
    draft.undoStack = [];
    draft.redoStack = [];
    this.writeBase(id);
    this.behindCache.delete(id);
  }

  /** Copy the main model's files into the draft's base folder (as `create` does). */
  private writeBase(id: string): void {
    const dir = path.join(this.folder(id), BASE_DIR);
    atomicWrite(path.join(dir, WORKSPACE_FILE), fs.readFileSync(this.main.wsPath, "utf-8"));
    atomicWrite(path.join(dir, SIDECAR_FILE), fs.existsSync(this.main.scPath) ? fs.readFileSync(this.main.scPath, "utf-8") : stableJson({ version: 1 }));
    const base = this.base(id);
    writeDecisions(dir, base.decisions, this.main.decisions);
    this.base(id); // reload the cached copy
  }

  /** Put main back as it was before an apply that failed after writing it (and forget that undo step). */
  private restoreMain(before: { ws: Workspace; sc: Sidecar; decs: Decision[]; undo: number }): void {
    try {
      this.main.write(before.ws, before.sc, before.decs);
      this.main.undoStack.splice(before.undo);
      this.main.redoStack = [];
    } catch (e) {
      console.error("designPerspectives: could not put the main model back after a failed apply:", e);
    }
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

  /**
   * The merge an apply would do. Without a guard (or with nothing held) this is the plain three-way merge
   * of base, main and draft. With held items: their units and the closure (`revertClosure`, following flows
   * and decisions too, so an accepted item that depends on a held one is held as well and reported in
   * `dependent`) are reset to the base in the draft's units before the merge; the rebased draft is the
   * merge of (draft without held items → new main, draft), so only the held items stay its changes.
   */
  private planApply(id: string): ApplyPlan {
    this.main.reloadIfChanged();
    const draft = this.get(id);
    draft.reloadIfChanged();
    const base = this.base(id);
    // Decisions the draft added under a number main has used since get new numbers first.
    const theirDecisions = renumberAdded(base.decisions, this.main.decisions, draft.decisions);
    const B = flatten(base.workspace, base.sidecar, base.decisions);
    const O = flatten(this.main.workspace, this.main.sidecar, this.main.decisions);
    const T = flatten(draft.workspace, draft.sidecar, theirDecisions);

    const guard = this.guard(id);
    const renamed = new Map(draft.decisions.map((d, i) => [`dec:${d.file}`, `dec:${theirDecisions[i]!.file}`]));
    const seeds: string[] = [];
    let items = 0;
    for (const unitKeys of guard?.items.values() ?? []) {
      const live = unitKeys.map((k) => renamed.get(k) ?? k).filter((k) => !sameIn(B, T, k));
      if (!live.length) continue;
      items++;
      seeds.push(...live);
    }
    if (!items) return { ...this.resolve(merge3(B, O, T)), hold: null };

    const set = revertClosure(B, T, seeds, { flows: true, decisions: true });
    const TH = revertUnits(B, T, set.keys);
    const seedSet = new Set(seeds);
    const rootOf = (k: string): string => {
      for (let i = 0; i < 100 && set.because.has(k); i++) k = set.because.get(k)!;
      return k;
    };
    const labelOf = (k: string) => {
      const u = T.get(k) ?? B.get(k);
      return u ? unitLabel(u) : k;
    };
    const dependent: Conflict[] = [...set.keys]
      .filter((k) => !seedSet.has(k) && !sameIn(B, T, k) && !isLayoutUnit((T.get(k) ?? B.get(k))!))
      .map((k) => ({ label: labelOf(k), reason: `Held because it depends on ${labelOf(rootOf(k))}, which is not accepted.` }));
    // Positions, styles, layout, tag groups and lenses are not items: they go along with an accepted item, never alone.
    const acceptedKeys = new Set((guard?.accepted ?? []).map((k) => renamed.get(k) ?? k));
    const nothingAccepted = ![...changedKeys(B, TH)].some((k) => acceptedKeys.has(k));
    const held: ApplyHeld = { items, dependent, nothingAccepted };

    const main = this.resolve(merge3(B, O, TH));
    if (!main.merged) return { ...main, hold: { held, rebased: null } };
    // The draft after the apply: the new main, with the held items (TH → T) on top.
    const newMain = flatten(main.merged.workspace, main.merged.sidecar, main.merged.decisions ?? []);
    const again = merge3(TH, newMain, T, { ours: "main", theirs: "the held items" });
    const rebased = this.resolve(again);
    if (!rebased.merged) return { merged: null, conflicts: rebased.conflicts.map((c) => ({ label: c.label, reason: `Kept in the draft: ${c.reason}` })), hold: { held, rebased: null } };
    return { merged: main.merged, conflicts: [], hold: { held, rebased: rebased.merged } };
  }

  /** The registered guard's hold for an import draft; null for any other draft. */
  private guard(id: string): ApplyHold | null {
    if (hooks) return hooks.applyGuard(this, id);
    // Fail safe: an import draft under review is never applied whole because the review rules were not loaded.
    if (fs.existsSync(reviewPath(this.main.dir, id))) {
      throw new ModelError(`Draft "${id}" is an import under review, but the review rules are not loaded in this process, so it cannot be applied safely.`);
    }
    return null;
  }

  /** Units after a merge → a model (views and flows synced, layout pruned), or why not. */
  private resolve({ units, conflicts }: { units: Units; conflicts: Conflict[] }): { merged: Snapshot | null; conflicts: Conflict[] } {
    if (conflicts.length) return { merged: null, conflicts };
    let result: Snapshot;
    try {
      const { ws, sc, decisions } = unflatten(units);
      syncViews(ws);
      syncFlows(ws);
      prune(ws, sc);
      result = { workspace: ws, sidecar: sc, decisions };
    } catch (e) {
      if (e instanceof UnitError || e instanceof ModelError) return { merged: null, conflicts: [{ label: "Model", reason: e.message }] };
      throw e;
    }
    // Model rules (e.g. both sides added a container with the same name) are checked here so the
    // preview can show them; errors already in the main model do not count.
    const added = addedErrors(this.main.loadErrors, errors(result.workspace, result.sidecar, result.decisions));
    if (added.length) return { merged: null, conflicts: added.map((reason) => ({ label: "Model rule", reason })) };
    return { merged: result, conflicts: [] };
  }
}

const sameIn = (a: Units, b: Units, key: string): boolean => sameUnit(a.get(key), b.get(key));

/** The model files of a draft folder (its own and its base copy's), byte for byte, to put back after a failed write. */
class FolderBackup {
  private files = new Map<string, Buffer>();
  private dirs: string[];

  constructor(folder: string) {
    const top = [WORKSPACE_FILE, SIDECAR_FILE].flatMap((f) => [path.join(folder, f), path.join(folder, BASE_DIR, f)]);
    this.dirs = [path.join(folder, DECISIONS_DIR), path.join(folder, BASE_DIR, DECISIONS_DIR)];
    for (const f of top) if (fs.existsSync(f)) this.files.set(f, fs.readFileSync(f));
    for (const d of this.dirs) {
      if (!fs.existsSync(d)) continue;
      for (const n of fs.readdirSync(d)) {
        const f = path.join(d, n);
        if (fs.statSync(f).isFile()) this.files.set(f, fs.readFileSync(f));
      }
    }
  }

  /** Write every recorded file back and remove files that appeared in the decision folders. Failures are logged. */
  restore(): void {
    for (const d of this.dirs) {
      if (!fs.existsSync(d)) continue;
      for (const n of fs.readdirSync(d)) {
        const f = path.join(d, n);
        if (!this.files.has(f)) fs.rmSync(f, { force: true });
      }
    }
    for (const [f, content] of this.files) {
      try {
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, content);
      } catch (e) {
        console.error(`Could not restore ${f}:`, e);
      }
    }
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
        } else {
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
