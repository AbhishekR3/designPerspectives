/**
 * The checklist (`architecture/checklist.json`, DEC-084): what to do, ask and confirm while a model is made, from
 * starting a project or importing a codebase to the last label.
 *
 * Like the comments (DEC-049) the file sits next to the model and is not part of it: no undo step, not diffed
 * or merged with drafts, one list for the project whatever version is shown. It is plain JSON with a stable
 * layout (items in the order they were added), so it reads well in `git diff` and the team shares it through git.
 *
 * An item comes from a person, from a starter list (`STARTERS`, shipped here) or from the `questions` and
 * `assumptions` of an import file (`addFromImport`, called by the importer). A starter item may carry a rule
 * that dp checks itself (checklistRules.ts): such an item is never ticked by hand; it shows as done while the
 * rule passes, and a person may only skip it.
 *
 * What a person writes as an answer is text a person typed: `typedAnswers` gives it to the import review, where
 * a `user` note that quotes it counts as evidence (DEC-064), and `answerNotes` gives it to BMO's next turn.
 * The text of a BMO question or assumption is the model's and never counts, even after a person edits it.
 *
 * A file changed on disk (by `git checkout`, a merge, another process) is picked up on the next read.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { CHECKLIST_KINDS, CHECKLIST_RULES, CHECKLIST_STATUSES, type ChecklistItem, type ChecklistKind, type ChecklistRule, type ChecklistSource, type ChecklistStatus } from "../shared/types.js";
import { cleanTarget } from "./comments.js";
import { ModelError } from "./modelEdits.js";
import { NotFound } from "./project.js";
import { atomicWrite, isObj, stableJson, type Obj } from "./util.js";

export const CHECKLIST_FILE = "checklist.json";
export const TEXT_MAX = 500;
export const ANSWER_MAX = 4000;
export const SECTION_MAX = 60;
export const NAME_MAX = 80;
export const MAX_ITEMS = 2000;
/** The section of an item a person adds without naming one. */
export const DEFAULT_SECTION = "My items";
/** The section the questions and assumptions of import files go to. */
export const BMO_SECTION = "Questions from BMO";

const GONE = "That checklist item no longer exists. It may have been deleted by someone else.";
const isTime = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));
const squash = (s: string) => s.replace(/\s+/g, " ").trim();
/** Two texts are the same item when they match ignoring case, spacing and a closing full stop or question mark. */
export const sameText = (a: string, b: string) =>
  squash(a)
    .toLowerCase()
    .replace(/[.?!]+$/, "") ===
  squash(b)
    .toLowerCase()
    .replace(/[.?!]+$/, "");

// ------------------------------------------------------------------ starter lists

export interface StarterItem {
  key: string;
  section: string;
  text: string;
  kind?: ChecklistKind;
  rule?: ChecklistRule;
}

export interface Starter {
  id: string;
  title: string;
  description: string;
  items: StarterItem[];
}

/** Items shared by both lists keep one key, so adding both lists does not repeat them. */
const SHARED: Record<string, StarterItem> = {
  people: { key: "people", section: "Scope and people", text: "Add the people who use the system, admins and support staff included.", rule: "people" },
  external: {
    key: "external",
    section: "Scope and people",
    text: "Add the systems it depends on and the ones that call it: payments, identity, email, other teams' services, partners.",
  },
  ownership: { key: "ownership", section: "Scope and people", text: "Agree which systems your team owns, which belong to other teams and which are vendors'." },
  descriptions: { key: "descriptions", section: "Detail", text: "Describe every person, system, container and component in one sentence.", rule: "descriptions" },
  technology: { key: "technology", section: "Detail", text: "Give every container and component its technology.", rule: "technology" },
  labels: { key: "labels", section: "Detail", text: 'Label every line with what flows ("Sends payment requests"), not "Uses".', rule: "labels" },
  modelErrors: { key: "model-errors", section: "Before you share it", text: "Fix the problems dp reports in the model.", rule: "model-errors" },
};

export const STARTERS: Starter[] = [
  {
    id: "start",
    title: "Starting a project",
    description: "What a model needs before people can rely on it, from the people who use the system to the last label.",
    items: [
      { key: "purpose", section: "Scope and people", text: "Name the system and write its purpose in one line." },
      { key: "audience", section: "Scope and people", text: "Decide who the diagrams are for, and pick or make a lens for each audience." },
      SHARED.people!,
      SHARED.external!,
      SHARED.ownership!,
      { key: "containers", section: "Structure", text: "Draw the containers of every system you own: apps, services, datastores, queues.", rule: "containers" },
      { key: "components", section: "Structure", text: "Break the containers that matter most into components." },
      { key: "code-paths", section: "Structure", text: "Map containers and components to the code folders they live in.", rule: "code-paths" },
      SHARED.descriptions!,
      SHARED.technology!,
      SHARED.labels!,
      { key: "flows", section: "Decisions and flows", text: "Model the main user journeys as flows.", rule: "flows" },
      { key: "decisions", section: "Decisions and flows", text: "Record the key decisions and why they were made.", rule: "decisions" },
      SHARED.modelErrors!,
      { key: "walkthrough", section: "Before you share it", text: "Walk through the diagrams with someone who knows the system and note what they correct." },
    ],
  },
  {
    id: "import",
    title: "Importing a codebase",
    description: "The import one level at a time: what the code cannot tell, the scan, each C4 level and its review, and what is left after.",
    items: [
      { key: "intake", section: "Before the scan", text: "Answer the intake: the system, who it is for, ownership and where it runs.", rule: "intake" },
      { key: "must-not-open", section: "Before the scan", text: "List the files and folders BMO must never open (.env, secrets, customer data)." },
      {
        key: "other-repos",
        section: "Before the scan",
        kind: "question",
        text: "Which other repositories belong to this system? The scan cannot see them, so they would look like external systems.",
      },
      { key: "known-services", section: "Before the scan", kind: "question", text: "Which third-party services and other teams' systems do you know it talks to?" },
      { key: "scan", section: "Bring it in", text: "Scan the code.", rule: "scan" },
      { key: "level-c1", section: "Bring it in", text: "Bring in the system context (C1), review it and mark it final.", rule: "level-c1" },
      { key: "level-c2", section: "Bring it in", text: "Bring in the containers (C2), review them and mark them final.", rule: "level-c2" },
      { key: "level-c3", section: "Bring it in", text: "Bring in the components (C3) one container at a time, review them and mark them final.", rule: "level-c3" },
      { key: "review", section: "Bring it in", text: "Accept, correct or reject every unverified item in the import drafts.", rule: "review" },
      { key: "bmo-questions", section: "Bring it in", text: `Answer BMO's questions and confirm or correct its assumptions (listed under "${BMO_SECTION}").` },
      { key: "unmapped", section: "After the import", text: "Map the source files that no component maps, or ignore them.", rule: "unmapped" },
      SHARED.descriptions!,
      SHARED.labels!,
      SHARED.modelErrors!,
    ],
  },
];

export function starter(id: unknown): Starter {
  const s = STARTERS.find((x) => x.id === id);
  if (!s) throw new ModelError(`There is no starter list "${String(id)}". Lists: ${STARTERS.map((x) => x.id).join(", ")}.`);
  return s;
}

// ------------------------------------------------------------------ cleaning requests

export function cleanItemText(v: unknown): string {
  const text = typeof v === "string" ? squash(v) : "";
  if (!text) throw new ModelError("Write something first: the item is empty.");
  if (text.length > TEXT_MAX) throw new ModelError(`An item can be at most ${TEXT_MAX} characters (this one has ${text.length}). Put the details in its answer or note.`);
  return text;
}

/** An answer or note: trimmed, line breaks kept; empty means "no answer". */
export function cleanAnswer(v: unknown): string {
  if (typeof v !== "string") throw new ModelError("The answer must be text.");
  const text = v.replace(/\r\n?/g, "\n").trim();
  if (text.length > ANSWER_MAX) throw new ModelError(`An answer can be at most ${ANSWER_MAX} characters (this one has ${text.length}).`);
  return text;
}

export function cleanSection(v: unknown): string {
  if (v === undefined || v === null || v === "") return DEFAULT_SECTION;
  const s = typeof v === "string" ? squash(v) : "";
  if (!s) return DEFAULT_SECTION;
  if (s.length > SECTION_MAX) throw new ModelError(`A section name can be at most ${SECTION_MAX} characters.`);
  return s;
}

export function cleanChecklistKind(v: unknown): ChecklistKind {
  if (v === undefined) return "task";
  if (!CHECKLIST_KINDS.includes(v as ChecklistKind)) throw new ModelError(`The kind must be one of: ${CHECKLIST_KINDS.join(", ")}.`);
  return v as ChecklistKind;
}

function cleanStatus(v: unknown): ChecklistStatus {
  if (!CHECKLIST_STATUSES.includes(v as ChecklistStatus)) throw new ModelError(`The status must be one of: ${CHECKLIST_STATUSES.join(", ")}.`);
  return v as ChecklistStatus;
}

const cleanName = (v: string) => squash(v).slice(0, NAME_MAX) || "Anonymous";

// ------------------------------------------------------------------ the file

function parseItem(v: unknown): ChecklistItem | null {
  if (!isObj(v) || typeof v.id !== "string" || !v.id || typeof v.text !== "string" || !v.text.trim() || !isTime(v.at)) return null;
  const source: ChecklistSource = v.source === "starter" || v.source === "bmo" ? v.source : "person";
  const item: ChecklistItem = {
    id: v.id,
    kind: CHECKLIST_KINDS.includes(v.kind as ChecklistKind) ? (v.kind as ChecklistKind) : "task",
    section: typeof v.section === "string" && v.section.trim() ? v.section.slice(0, SECTION_MAX) : DEFAULT_SECTION,
    text: v.text.slice(0, TEXT_MAX),
    status: CHECKLIST_STATUSES.includes(v.status as ChecklistStatus) ? (v.status as ChecklistStatus) : "open",
    source,
    author: typeof v.author === "string" && v.author.trim() ? v.author.slice(0, NAME_MAX) : "Anonymous",
    at: v.at,
  };
  if (typeof v.answer === "string" && v.answer.trim()) {
    item.answer = v.answer.slice(0, ANSWER_MAX);
    if (typeof v.answeredBy === "string") item.answeredBy = v.answeredBy.slice(0, NAME_MAX);
    if (isTime(v.answeredAt)) item.answeredAt = v.answeredAt;
  }
  if (isObj(v.target)) {
    try {
      item.target = cleanTarget(v.target);
    } catch {
      /* a bad target is dropped */
    }
  }
  if (CHECKLIST_RULES.includes(v.rule as ChecklistRule)) item.rule = v.rule as ChecklistRule;
  if (item.rule && item.status === "done") item.status = "open"; // a rule item is never ticked by hand
  if (typeof v.starter === "string" && v.starter) item.starter = v.starter.slice(0, 80);
  if (typeof v.draft === "string" && v.draft) item.draft = v.draft.slice(0, 200);
  if (item.status === "done") {
    if (typeof v.doneBy === "string") item.doneBy = v.doneBy.slice(0, NAME_MAX);
    if (isTime(v.doneAt)) item.doneAt = v.doneAt;
  }
  return item;
}

/** The items of a checklist file; entries that are not valid are dropped (a hand edit must not break the app). */
export function parseChecklist(text: string): ChecklistItem[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  const list = isObj(data) && Array.isArray(data.items) ? data.items : [];
  const seen = new Set<string>();
  const out: ChecklistItem[] = [];
  for (const raw of list) {
    const item = parseItem(raw);
    if (item && !seen.has(item.id)) {
      seen.add(item.id);
      out.push(item);
    }
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

/** Keys in a fixed order, optional fields left out when empty. */
function itemData(i: ChecklistItem): Obj {
  const o: Obj = { id: i.id, kind: i.kind, section: i.section, text: i.text, status: i.status, source: i.source };
  if (i.rule) o.rule = i.rule;
  if (i.starter) o.starter = i.starter;
  if (i.draft) o.draft = i.draft;
  if (i.target) o.target = { type: i.target.type, id: i.target.id };
  if (i.answer) {
    o.answer = i.answer;
    if (i.answeredBy) o.answeredBy = i.answeredBy;
    if (i.answeredAt) o.answeredAt = i.answeredAt;
  }
  Object.assign(o, { author: i.author, at: i.at });
  if (i.status === "done") {
    if (i.doneBy) o.doneBy = i.doneBy;
    if (i.doneAt) o.doneAt = i.doneAt;
  }
  return o;
}

function stampOf(file: string): string {
  try {
    const s = fs.statSync(file, { bigint: true });
    return `${s.mtimeNs}:${s.size}`;
  } catch {
    return "-";
  }
}

export interface ItemPatch {
  text?: unknown;
  kind?: unknown;
  section?: unknown;
  status?: unknown;
  answer?: unknown;
  /** A target, or null to take it away. */
  target?: unknown;
}

export class ChecklistStore {
  private items: ChecklistItem[] = [];
  private stamp = "";

  constructor(
    readonly file: string,
    private readonly now: () => number = Date.now,
  ) {
    this.reload();
  }

  private reload(): void {
    const s = stampOf(this.file);
    if (s === this.stamp) return;
    this.items = fs.existsSync(this.file) ? parseChecklist(fs.readFileSync(this.file, "utf-8")) : [];
    this.stamp = s;
  }

  private save(): void {
    if (this.items.length === 0 && !fs.existsSync(this.file)) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    atomicWrite(this.file, stableJson({ items: this.items.map(itemData) }));
    this.stamp = stampOf(this.file);
  }

  private time(): string {
    return new Date(this.now()).toISOString();
  }

  private room(n = 1): void {
    if (this.items.length + n > MAX_ITEMS) throw new ModelError(`The checklist can hold at most ${MAX_ITEMS} items. Delete the done and skipped ones first.`);
  }

  list(): ChecklistItem[] {
    this.reload();
    return structuredClone(this.items);
  }

  get(id: string): ChecklistItem | undefined {
    this.reload();
    const i = this.items.find((x) => x.id === id);
    return i ? structuredClone(i) : undefined;
  }

  private need(id: string): ChecklistItem {
    this.reload();
    const i = this.items.find((x) => x.id === id);
    if (!i) throw new NotFound(GONE);
    return i;
  }

  /** An item a person adds. */
  add(p: { text: unknown; kind?: unknown; section?: unknown; target?: unknown; author: string }): ChecklistItem {
    this.reload();
    this.room();
    const item: ChecklistItem = {
      id: `k-${crypto.randomBytes(5).toString("hex")}`,
      kind: cleanChecklistKind(p.kind),
      section: cleanSection(p.section),
      text: cleanItemText(p.text),
      status: "open",
      source: "person",
      author: cleanName(p.author),
      at: this.time(),
    };
    if (p.target !== undefined && p.target !== null) item.target = cleanTarget(p.target);
    this.items.push(item);
    this.save();
    return structuredClone(item);
  }

  /** Add the items of a starter list that are not on the checklist yet (by key). Returns how many were added. */
  addStarter(id: unknown, author: string): number {
    this.reload();
    const s = starter(id);
    const have = new Set(this.items.map((i) => i.starter).filter(Boolean));
    const fresh = s.items.filter((x) => !have.has(x.key));
    this.room(fresh.length);
    const at = this.time();
    for (const x of fresh) {
      const item: ChecklistItem = {
        id: `k-${crypto.randomBytes(5).toString("hex")}`,
        kind: x.kind ?? "task",
        section: x.section,
        text: x.text,
        status: "open",
        source: "starter",
        starter: x.key,
        author: cleanName(author),
        at,
      };
      if (x.rule) item.rule = x.rule;
      this.items.push(item);
    }
    if (fresh.length) this.save();
    return fresh.length;
  }

  /**
   * The questions and assumptions of an import file, as open items under BMO_SECTION. A text that is already on
   * the checklist (same words, see `sameText`) is not added again. Returns how many were added; never throws for
   * the cap (an import must not fail because the checklist is full): what does not fit is left out.
   */
  addFromImport(draftId: string, questions: readonly string[], assumptions: readonly string[]): number {
    this.reload();
    const at = this.time();
    let added = 0;
    const take = (kind: ChecklistKind, list: readonly string[]) => {
      for (const raw of list) {
        const text = squash(raw).slice(0, TEXT_MAX);
        if (!text || this.items.length >= MAX_ITEMS) continue;
        if (this.items.some((i) => sameText(i.text, text))) continue;
        this.items.push({ id: `k-${crypto.randomBytes(5).toString("hex")}`, kind, section: BMO_SECTION, text, status: "open", source: "bmo", draft: draftId, author: "BMO", at });
        added++;
      }
    };
    take("question", questions);
    take("assumption", assumptions);
    if (added) this.save();
    return added;
  }

  /** Change an item. `by`: the person (recorded when ticking or answering). */
  update(id: string, patch: ItemPatch, by: string): ChecklistItem {
    const item = this.need(id);
    const next = structuredClone(item);
    if (patch.text !== undefined) next.text = cleanItemText(patch.text);
    if (patch.kind !== undefined) next.kind = cleanChecklistKind(patch.kind);
    if (patch.section !== undefined) next.section = cleanSection(patch.section);
    if (patch.target !== undefined) {
      if (patch.target === null) delete next.target;
      else next.target = cleanTarget(patch.target);
    }
    if (patch.answer !== undefined) {
      const answer = cleanAnswer(patch.answer);
      if (answer !== (next.answer ?? "")) {
        if (answer) {
          next.answer = answer;
          next.answeredBy = cleanName(by);
          next.answeredAt = this.time();
        } else {
          delete next.answer;
          delete next.answeredBy;
          delete next.answeredAt;
        }
      }
    }
    if (patch.status !== undefined) {
      const status = cleanStatus(patch.status);
      if (status === "done" && next.rule) throw new ModelError("dp ticks this item itself while the model passes its check. Skip it if it does not apply.");
      if (status !== next.status) {
        next.status = status;
        if (status === "done") {
          next.doneBy = cleanName(by);
          next.doneAt = this.time();
        } else {
          delete next.doneBy;
          delete next.doneAt;
        }
      }
    }
    Object.assign(item, next);
    for (const k of ["answer", "answeredBy", "answeredAt", "target", "doneBy", "doneAt"] as const) if (!(k in next)) delete item[k];
    this.save();
    return structuredClone(item);
  }

  remove(id: string): void {
    this.reload();
    const n = this.items.findIndex((i) => i.id === id);
    if (n < 0) throw new NotFound(GONE);
    this.items.splice(n, 1);
    this.save();
  }

  /** Delete these items (the ones not there any more are passed over); returns how many went. */
  removeMany(ids: readonly string[]): number {
    this.reload();
    const gone = new Set(ids);
    const before = this.items.length;
    this.items = this.items.filter((i) => !gone.has(i.id));
    const n = before - this.items.length;
    if (n) this.save();
    return n;
  }
}

/** Where a project keeps its checklist. */
export const checklistPath = (root: string): string => path.join(root, "architecture", CHECKLIST_FILE);

/** The answers people wrote on a project's checklist (for the import review's `user` notes, DEC-064). */
export function typedAnswers(root: string): string[] {
  try {
    return parseChecklist(fs.readFileSync(checklistPath(root), "utf-8"))
      .flatMap((i) => [i.answer ?? "", i.source === "person" ? i.text : ""])
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** The answered items as notes for BMO's next turn: the item (labelled as such) and what the person answered. */
export function answerNotes(root: string): { id: string | null; text: string }[] {
  let items: ChecklistItem[];
  try {
    items = parseChecklist(fs.readFileSync(checklistPath(root), "utf-8"));
  } catch {
    return [];
  }
  const label: Record<ChecklistKind, string> = { task: "Note on the checklist item", question: "Answer to the question", assumption: "Correction of the assumption" };
  const out: { id: string | null; text: string }[] = [];
  for (const i of items) {
    const id = i.target && i.target.type !== "diagram" ? i.target.id : null;
    if (i.answer) out.push({ id, text: `${label[i.kind]} "${i.text}": ${i.answer}` });
    // Not typed by the person, so never evidence; still worth telling BMO so it neither asks again nor doubts it.
    else if (i.kind === "assumption" && i.status === "done") out.push({ id, text: `The person confirmed the assumption "${i.text}".` });
    else if (i.kind === "question" && i.status === "skipped") out.push({ id, text: `The person does not know the answer to "${i.text}"; do not ask it again.` });
  }
  return out;
}
