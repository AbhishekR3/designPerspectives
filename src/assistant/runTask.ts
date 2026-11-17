/**
 * BMO as the server routes and the CLI run it (DEC-051): from a few selectors (a task, a level, a diagram, an
 * object, a lens, a pasted description, a chat question with the IDs it refers to and the earlier turns) the server itself assembles the task's inputs from the model, the code and the
 * drafts, builds the prompt, shows it (`previewOf`), and, when the person confirms its hash, sends it through the
 * backend the server chose and takes the answer (`runBmo`). Nothing a client sends is ever prompt text, an endpoint,
 * a provider, a model or a file to read; the selectors are checked strictly and unknown fields are refused.
 *
 * Where the answers go:
 * - "text": returned to the caller only. Not stored in a file and not in the run log.
 *   The chat (`ask`) is the same: the conversation lives in the browser tab; earlier turns come back as selectors, are
 *   checked and capped, and are placed in a data block marked as earlier conversation, never in the system text.
 * - "import-file": `importToDraft` makes a draft (credited to the caller); the file's `source` is set by the server.
 * - "decision": `createDecision` in the selected draft, status proposed, one undo step.
 * An answer that cannot be used is `BmoInvalid` (errors and the text to paste back); nothing is repaired.
 *
 * Every run that reached the backend is logged (`logRun`): who, task, hash, destination, usage, outcome and the files
 * sent; never the key, and the prompt only with `keepPrompts`.
 */

import { createHash } from "node:crypto";
import type { CodeSource } from "../core/codeFiles.js";
import { diagramOf, diffModels } from "../core/diff.js";
import * as decisions from "../core/decisions.js";
import type { Drafts } from "../core/drafts.js";
import { buildIndex, elementSummary, ModelError, relationshipSummary } from "../core/modelEdits.js";
import { NotFound, type ModelSource, type Project } from "../core/project.js";
import { checkProject, diffMarkdown } from "../core/cliReports.js";
import { ARCHITECT, BUILTIN_LENSES, SECTIONS } from "../core/designPerspectivesFile.js";
import { readState } from "../import/analysis.js";
import { readIntake } from "../import/intake.js";
import { ImportRejected, importToDraft } from "../import/importer.js";
import { BMO_ASK_LIMITS, type BmoAskInfo, type BmoPreview, type BmoRunResult, type Diagram, type FieldError, type ImportFile, type Lens } from "../shared/types.js";
import { asBmoError, BmoError, type Backend } from "./backend.js";
import { buildInputs, parseHandoffRequest } from "./importTasks.js";
import { logRun } from "./providerBackend.js";
import { objectExcerpts, objectExcerptText, type ObjectExcerpts } from "./codeExcerpts.js";
import { diagramText, objectText, overviewText, parentChain } from "./modelText.js";
import { estimateCost, effectiveModel, runTokenLimit, destination as settingsBase, type BmoSettings } from "./settings.js";
import {
  getTask,
  pasteBackText,
  preview,
  runTask,
  TASK_IDS,
  TASKS,
  type AskInput,
  type AskTurn,
  type ChallengeInput,
  type DraftChangesInput,
  type ExplainInput,
  type Task,
  type TaskContext,
  type TaskId,
} from "./tasks.js";

// ------------------------------------------------------------------ selectors

/** What a client may say about a task. Everything else (the prompt, the endpoint, the model, the files) is the server's. */
export interface Selectors {
  task: TaskId;
  /** import-level: c1, c2 or c3. */
  level?: "c1" | "c2" | "c3";
  /** import-level at c3: the container's ID. */
  container?: string;
  /** describe-to-model: the person's description. */
  text?: string;
  /** explain, challenge: a diagram key. */
  diagram?: string;
  /** explain: an element ID. */
  element?: string;
  /** explain: a relationship ID. */
  relationship?: string;
  /** explain, ask: a lens, by ID or name (ask: the Architect lens when not given). */
  lens?: string;
  /** ask: the IDs of the elements and relationships the person referred to (at most BMO_ASK_LIMITS.refs). */
  refs?: string[];
  /** ask: earlier turns of the chat, oldest first (at most BMO_ASK_LIMITS.turns). */
  history?: AskTurn[];
}

const SELECTOR_KEYS = ["task", "level", "container", "text", "diagram", "element", "relationship", "lens", "refs", "history"] as const;
const MAX_SELECTOR = 500;

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Check a request body strictly; `extra`: other fields the caller reads itself (`hash`). A ModelError says what is wrong. */
export function parseSelectors(b: unknown, extra: readonly string[] = []): Selectors {
  if (!isObject(b)) throw new ModelError("The request body must be a JSON object.");
  const allowed = new Set<string>([...SELECTOR_KEYS, ...extra]);
  for (const k of Object.keys(b)) {
    if (!allowed.has(k))
      throw new ModelError(`Unknown field "${k}". BMO builds the prompt itself and the server chooses the backend, the model and the endpoint; send only: ${[...allowed].join(", ")}.`);
  }
  const task = b.task;
  if (typeof task !== "string" || !(TASK_IDS as readonly string[]).includes(task)) throw new ModelError(`"task" must be one of ${TASK_IDS.join(", ")}.`);
  const out: Selectors = { task: task as TaskId };
  for (const k of ["container", "diagram", "element", "relationship", "lens"] as const) {
    const v = b[k];
    if (v === undefined) continue;
    if (typeof v !== "string" || !v.trim() || v.length > MAX_SELECTOR) throw new ModelError(`"${k}" must be text (up to ${MAX_SELECTOR} characters).`);
    out[k] = v.trim();
  }
  if (b.level !== undefined) {
    if (b.level !== "c1" && b.level !== "c2" && b.level !== "c3") throw new ModelError('"level" must be c1, c2 or c3.');
    out.level = b.level;
  }
  if (b.text !== undefined) {
    if (typeof b.text !== "string") throw new ModelError('"text" must be text.');
    out.text = b.text;
  }
  if ((b.refs !== undefined || b.history !== undefined) && task !== "ask") throw new ModelError('"refs" and "history" are only for the task "ask".');
  if (b.refs !== undefined) out.refs = parseRefs(b.refs);
  if (b.history !== undefined) out.history = parseHistory(b.history);
  return out;
}

function parseRefs(v: unknown): string[] {
  const L = BMO_ASK_LIMITS;
  if (!Array.isArray(v)) throw new ModelError('"refs" must be a list of element or relationship IDs.');
  if (v.length > L.refs) throw new ModelError(`"refs" holds ${v.length} IDs; at most ${L.refs} objects can be referenced in one question.`);
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== "string" || !x.trim() || x.length > MAX_SELECTOR) throw new ModelError(`Every entry of "refs" must be an ID (text up to ${MAX_SELECTOR} characters).`);
    if (!out.includes(x.trim())) out.push(x.trim());
  }
  return out;
}

function parseHistory(v: unknown): AskTurn[] {
  const L = BMO_ASK_LIMITS;
  if (!Array.isArray(v)) throw new ModelError('"history" must be a list of earlier turns, {"role": "you" or "bmo", "text": ...}.');
  if (v.length > L.turns) throw new ModelError(`"history" holds ${v.length} turns; at most ${L.turns} earlier turns are sent.`);
  let total = 0;
  return v.map((t, i) => {
    if (!isObject(t)) throw new ModelError(`"history" entry ${i + 1} must be {"role": "you" or "bmo", "text": ...}.`);
    for (const k of Object.keys(t)) if (k !== "role" && k !== "text") throw new ModelError(`"history" entry ${i + 1}: unknown field "${k}"; only "role" and "text".`);
    if (t.role !== "you" && t.role !== "bmo") throw new ModelError(`"history" entry ${i + 1}: "role" must be "you" or "bmo".`);
    if (typeof t.text !== "string" || !t.text.trim()) throw new ModelError(`"history" entry ${i + 1}: "text" must be text.`);
    if (t.text.length > L.turnChars) throw new ModelError(`"history" entry ${i + 1} has ${t.text.length} characters; at most ${L.turnChars}.`);
    total += t.text.length;
    if (total > L.historyChars) throw new ModelError(`The earlier turns have more than ${L.historyChars} characters together; send fewer.`);
    return { role: t.role, text: t.text };
  });
}

// ------------------------------------------------------------------ planning a task

/** What a task does to the project when it succeeds. */
export type Effect = "none" | "new-draft" | "edit-draft";

/** The tasks that make a draft (the caller needs the right to create one) or write into one (the right to edit it). */
export const EFFECT: Record<TaskId, Effect> = {
  "import-level": "new-draft",
  "describe-to-model": "new-draft",
  "suggest-labels": "new-draft",
  explain: "none",
  challenge: "none",
  "draft-summary": "none",
  "decision-from-draft": "edit-draft",
  ask: "none",
};

/** The model version a task reads (explain, challenge, the draft tasks): `ref` is `main` or `draft:<id>`. */
export interface BmoView {
  src: ModelSource;
  ref: string;
  code: CodeSource;
}

export interface BmoEnv {
  project: Project;
  drafts: Drafts;
  disk: CodeSource;
  view: BmoView;
}

export interface Planned {
  task: Task<unknown>;
  inputs: unknown;
  context: TaskContext;
  effect: Effect;
  /** The draft a draft task works on. */
  draftId?: string;
  /** ask: what the question carries besides itself (shown in the preview). */
  ask?: BmoAskInfo;
}

const draftOf = (env: BmoEnv): string => {
  if (!env.view.ref.startsWith("draft:")) throw new ModelError("This task works on a draft: select one first (header X-DP-Model: draft:<id>, or --draft).");
  const id = env.view.ref.slice("draft:".length);
  env.drafts.info(id); // NotFound for an unknown draft
  return id;
};

function lensOf(src: ModelSource, name: string | undefined): Lens {
  if (!name) throw new ModelError('Say which lens the answer is for ("lens": its name or ID); it decides which sections of the model are sent.');
  const all = [...BUILTIN_LENSES, ...src.sidecar.lenses] as Lens[];
  const hit = all.find((l) => l.id === name) ?? all.find((l) => l.name.toLowerCase() === name.toLowerCase());
  if (!hit) throw new ModelError(`There is no lens "${name}". Lenses: ${all.map((l) => l.name).join(", ")}.`);
  return hit;
}

function diagramFor(env: BmoEnv, key: string): Diagram {
  const d = diagramOf(env.view.src, key, env.view.code);
  if (!d) throw new NotFound(`No diagram ${key}`);
  return d;
}

/** One relationship as text (the explain task's subject): its ends, label, technology, kind, notes, code. Sensitive items are left out. */
export function relationshipText(src: ModelSource, id: string, sections: readonly string[] = []): string {
  const idx = buildIndex(src.workspace);
  const r = idx.relationships.get(id);
  if (!r) throw new NotFound(`No relationship ${id}`);
  const s = relationshipSummary(r);
  const end = (e: string) => `${e} ${JSON.stringify(idx.elements.get(e)?.name ?? e)}`;
  const out = [`Relationship: ${s.id}`, `From: ${end(s.sourceId)}`, `To: ${end(s.destinationId)}`, `Label: ${JSON.stringify(s.description)}`];
  if (s.technologies.length) out.push(`Technology: ${s.technologies.join(", ")}`);
  if (s.kind) out.push(`Kind: ${s.kind}`);
  if (sections.includes("notes") && s.notes) out.push(`Notes: ${s.notes.replace(/\s+/g, " ").trim().slice(0, 2000)}`);
  if (sections.includes("code") && s.codePaths.length) out.push(`Code: ${s.codePaths.join(", ")}`);
  return out.join("\n") + "\n";
}

/** Problems dp can see without a model: relationships with no real label, elements with no description, containers and components with no technology. */
export function diagramLints(d: Diagram): string[] {
  if (d.level === "code") return [];
  const out: string[] = [];
  const names = new Map(d.nodes.map((n) => [n.id, n.name]));
  for (const e of d.edges) {
    if (e.derived || e.ghost) continue;
    const t = e.description.trim();
    if (!t || t.toLowerCase() === "uses")
      out.push(`The relationship "${names.get(e.source) ?? e.source}" -> "${names.get(e.target) ?? e.target}" has ${t ? 'only the label "Uses"' : "no description"}.`);
  }
  for (const n of d.nodes) {
    if (!n.inScope) continue;
    if (!n.description?.trim()) out.push(`The ${n.kind} "${n.name}" has no description.`);
    if ((n.kind === "container" || n.kind === "component") && !n.technologies?.length) out.push(`The ${n.kind} "${n.name}" has no technology.`);
  }
  return out;
}

const MAX_LINTS = 60;

/** The lint lines of the `challenge` task: model problems that touch the diagram, then the computable checks. */
function challengeLints(env: BmoEnv, d: Diagram): string[] {
  // checkProject reads the main model, its drafts and the code mapping; another version has only its own load errors.
  const check = env.view.ref === "main" ? checkProject(env.project) : { errors: [...env.view.src.loadErrors], warnings: [] as string[] };
  const names = d.nodes.map((n) => `"${n.name}"`);
  const touches = (w: string) => names.some((n) => w.includes(n));
  const all = [...check.errors.map((e) => `Model problem: ${e}`), ...check.warnings.filter(touches).map((w) => `Warning: ${w}`), ...diagramLints(d)];
  return all.length > MAX_LINTS ? [...all.slice(0, MAX_LINTS), `(and ${all.length - MAX_LINTS} more)`] : all;
}

/** The changes of a draft against the main model it was made from: what the changes panel shows, and the same as Markdown. */
function draftChanges(env: BmoEnv, id: string): DraftChangesInput {
  const base = env.drafts.base(id);
  const draft = env.drafts.get(id);
  const cs = diffModels(base, draft, "base", { before: env.disk, after: env.drafts.code(id), planned: [...env.drafts.codePlan(id).files().keys()] });
  const info = env.drafts.info(id);
  return {
    draft: { title: info.title, ...(info.description ? { description: info.description } : {}) },
    changes: cs,
    markdown: diffMarkdown(cs, base, draft, "the main model when the draft was made", `the draft "${info.title}"`),
  };
}

/**
 * The task and its inputs, assembled from the selectors and the model: the one place that decides what a prompt
 * is made of. Throws ModelError / NotFound for a missing or wrong selector. `passBudgetTokens`: the settings' budget,
 * which caps the code digest and sets the size over which a run is refused (`runTokenLimit`).
 */
export function planTask(env: BmoEnv, sel: Selectors, passBudgetTokens?: number): Planned {
  const task = getTask(sel.task) as Task<unknown>;
  const effect = EFFECT[sel.task];
  const maxInputTokens = passBudgetTokens === undefined ? undefined : runTokenLimit(passBudgetTokens);
  const withMax = (c: TaskContext): TaskContext => (maxInputTokens === undefined ? c : { ...c, maxInputTokens });
  const mainContext = (): TaskContext => withMax({ model: { workspace: env.project.workspace, sidecar: env.project.sidecar, decisions: env.project.decisions }, code: env.disk, variant: "direct" });
  const viewContext = (): TaskContext =>
    withMax({ model: { workspace: env.view.src.workspace, sidecar: env.view.src.sidecar, decisions: env.view.src.decisions }, code: env.view.code, variant: "direct" });
  switch (sel.task) {
    case "import-level":
    case "describe-to-model":
    case "suggest-labels": {
      const req = parseHandoffRequest({
        task: sel.task,
        ...(sel.level ? { level: sel.level } : {}),
        ...(sel.container ? { container: sel.container } : {}),
        ...(sel.text !== undefined ? { text: sel.text } : {}),
      });
      return { task, inputs: buildInputs(env.project, env.drafts, env.disk, req, passBudgetTokens === undefined ? {} : { maxDigestTokens: passBudgetTokens }), context: mainContext(), effect };
    }
    case "explain": {
      const given = [sel.diagram, sel.element, sel.relationship].filter((x) => x !== undefined).length;
      if (given !== 1) throw new ModelError('Say what to explain: exactly one of "diagram", "element" or "relationship".');
      const lens = lensOf(env.view.src, sel.lens);
      const sections = lens.visibleSections;
      let subject: string;
      if (sel.diagram) subject = diagramText(diagramFor(env, sel.diagram), { sections, showTechnology: lens.showTechnology, showDescriptions: lens.showDescriptions });
      else if (sel.element) {
        if (!buildIndex(env.view.src.workspace).elements.has(sel.element)) throw new NotFound(`No element ${sel.element}`);
        subject = objectText(env.view.src.workspace, env.view.src.sidecar, sel.element, sections);
      } else subject = relationshipText(env.view.src, sel.relationship!, sections);
      const inputs: ExplainInput = { subject, lens: { name: lens.name, sections } };
      return { task, inputs, context: viewContext(), effect };
    }
    case "challenge": {
      if (!sel.diagram) throw new ModelError('Say which diagram to challenge ("diagram": its key).');
      const d = diagramFor(env, sel.diagram);
      const inputs: ChallengeInput = { subject: diagramText(d, { sections: SECTIONS }), lints: challengeLints(env, d) };
      return { task, inputs, context: viewContext(), effect };
    }
    case "decision-from-draft":
    case "draft-summary": {
      const id = draftOf(env);
      return { task, inputs: draftChanges(env, id), context: viewContext(), effect, draftId: id };
    }
    case "ask":
      return planAsk(env, sel, { ...(passBudgetTokens === undefined ? {} : { passBudgetTokens }), ...(maxInputTokens === undefined ? {} : { maxInputTokens }) });
  }
}

/** The ask task's code excerpts use at most this many tokens (and at most the settings' and the intake's budget): one question, not a whole level. */
export const ASK_CODE_TOKENS = 24_000;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const MAX_PART_RELATIONSHIPS = 80;

/**
 * One referenced element as text: `objectText`, the chain of its parents, and (for a system or container) the
 * relationships of what it contains with objects outside it, since those are often where its connections are recorded.
 */
function askElementText(src: ModelSource, id: string, sections: readonly string[]): string {
  const idx = buildIndex(src.workspace);
  const chain = parentChain(src.workspace, id);
  const out = [objectText(src.workspace, src.sidecar, id, sections).trimEnd()];
  if (chain) out.push(`Parents (outermost first): ${chain}`);
  const inside = new Set(idx.descendants(id));
  const name = (e: string) => JSON.stringify(idx.elements.get(e)?.name ?? e);
  const lines: string[] = [];
  for (const r of idx.relationships.values()) {
    const fromInside = inside.has(r.sourceId);
    if (fromInside === inside.has(r.destinationId)) continue;
    const part = fromInside ? r.sourceId : r.destinationId;
    const other = fromInside ? r.destinationId : r.sourceId;
    if (other === id) continue;
    lines.push(`- ${r.id}: ${name(part)} ${fromInside ? "->" : "<-"} ${other} ${name(other)} ${JSON.stringify(r.description || "")}`);
  }
  if (lines.length) {
    out.push("Relationships of what it contains with objects outside it:", ...lines.slice(0, MAX_PART_RELATIONSHIPS));
    if (lines.length > MAX_PART_RELATIONSHIPS) out.push(`- (and ${lines.length - MAX_PART_RELATIONSHIPS} more)`);
  }
  return out.join("\n") + "\n";
}

/** One referenced relationship as text: `relationshipText`, and where each end sits. */
function askRelationshipText(src: ModelSource, id: string, sections: readonly string[]): string {
  const idx = buildIndex(src.workspace);
  const r = idx.relationships.get(id)!;
  const end = (label: string, e: string) => {
    const chain = parentChain(src.workspace, e);
    const el = idx.elements.get(e);
    return `${label}: ${el ? `${idx.kindOf(e)} ${e} ${JSON.stringify(el.name)}` : e}${chain ? ` inside ${chain}` : ""}`;
  };
  return relationshipText(src, id, sections) + `${end("Source", r.sourceId)}\n${end("Destination", r.destinationId)}\n`;
}

/**
 * The ask task: the question, the objects referred to (each with its neighbourhood), the context when none is,
 * the code excerpts of those objects when the lens shows code, and the earlier turns. When the prompt is over the
 * run size limit (`maxInputTokens`), the oldest turns go first, then the last-ranked excerpts; the preview says what went.
 * `passBudgetTokens`: the settings' budget, which (with the intake's and ASK_CODE_TOKENS) caps the excerpts.
 */
export function planAsk(env: BmoEnv, sel: Selectors, opts: { passBudgetTokens?: number; maxInputTokens?: number } = {}): Planned {
  const L = BMO_ASK_LIMITS;
  const task = getTask("ask") as Task<unknown>;
  const { passBudgetTokens } = opts;
  const context: TaskContext = {
    model: { workspace: env.view.src.workspace, sidecar: env.view.src.sidecar, decisions: env.view.src.decisions },
    code: env.view.code,
    variant: "direct",
    ...(opts.maxInputTokens === undefined ? {} : { maxInputTokens: opts.maxInputTokens }),
  };
  const question = (sel.text ?? "").trim();
  if (!question) throw new ModelError('Type a question ("text").');
  if (question.length > L.questionChars) throw new ModelError(`The question has ${question.length} characters; at most ${L.questionChars}. Shorten it or ask in parts.`);
  for (const k of ["element", "relationship", "container", "level"] as const) {
    if (sel[k] !== undefined) throw new ModelError(`"${k}" is not used by "ask": refer to objects with "refs".`);
  }
  const src = env.view.src;
  const lens = sel.lens ? lensOf(src, sel.lens) : ARCHITECT;
  const sections = lens.visibleSections;
  const idx = buildIndex(src.workspace);
  const refs = sel.refs ?? [];
  const objects: BmoAskInfo["objects"] = [];
  const texts: string[] = [];
  const codePaths: string[] = [];
  for (const id of refs) {
    if (idx.elements.has(id)) {
      const s = elementSummary(idx, id);
      objects.push({ id, name: s.name, kind: idx.kindOf(id) });
      texts.push(askElementText(src, id, sections));
      codePaths.push(...s.codePaths);
    } else if (idx.relationships.has(id)) {
      const s = relationshipSummary(idx.relationships.get(id)!);
      const name = (e: string) => idx.elements.get(e)?.name ?? e;
      objects.push({ id, name: `${name(s.sourceId)} → ${name(s.destinationId)}${s.description ? `: ${s.description}` : ""}`, kind: "relationship" });
      texts.push(askRelationshipText(src, id, sections));
      codePaths.push(...s.codePaths);
    } else throw new ModelError(`There is no element or relationship "${id}" in this version of the model.`);
  }
  const d = sel.diagram ? diagramFor(env, sel.diagram) : null;
  const trimmed: string[] = [];
  let ctxText: string | undefined;
  let kind: BmoAskInfo["context"] = "objects";
  if (!objects.length) {
    if (d) {
      ctxText = diagramText(d, { sections, showTechnology: lens.showTechnology, showDescriptions: lens.showDescriptions });
      kind = "diagram";
    } else {
      ctxText = overviewText(src.workspace);
      kind = "overview";
    }
  }
  const viewing = objects.length && d ? `The person is looking at the diagram ${JSON.stringify(d.title)} (key ${d.key}).` : undefined;

  // Code excerpts: only when the lens shows code, and only through the same gate and redaction as the import digest.
  let excerpts: ObjectExcerpts | null = null;
  if (sections.includes("code") && codePaths.length) {
    const { intake, errors } = readIntake(env.project.root);
    let ignore: string[] | null;
    try {
      ignore = readState(env.project.root).ignore;
    } catch {
      ignore = null;
    }
    if (errors.length || ignore === null) trimmed.push("No code excerpts: the import intake or ignore list has problems, so dp cannot tell which files are closed. Fix them on the Import page.");
    else if (!env.view.code.hasRoot) trimmed.push(`No code excerpts: there is no code to read in ${env.view.code.label}.`);
    else {
      const budgetTokens = Math.min(ASK_CODE_TOKENS, intake.settings.passBudgetTokens, passBudgetTokens ?? Infinity);
      excerpts = objectExcerpts(env.view.code, intake, codePaths, { budgetTokens, ignore });
      const closed = excerpts.leftOut.filter((l) => l.reason.startsWith("not opened")).length;
      const over = excerpts.leftOut.length - closed;
      if (closed) trimmed.push(`${plural(closed, "file")} under the code paths ${closed === 1 ? "was" : "were"} not opened (hidden, closed by the intake, or likely to hold secrets).`);
      if (over) trimmed.push(`${plural(over, "file")} under the code paths did not fit in the code budget of ${budgetTokens.toLocaleString("en-US")} tokens.`);
    }
  } else if (codePaths.length) trimmed.push(`No code excerpts: the lens "${lens.name}" does not show code.`);

  const given = sel.history ?? [];
  let history = [...given];
  let entries = excerpts?.entries ?? [];
  const inputsOf = (): AskInput => ({
    question,
    lens: { name: lens.name, sections },
    objects: texts,
    ...(ctxText !== undefined ? { context: ctxText } : {}),
    ...(viewing ? { viewing } : {}),
    history,
    ...(excerpts && entries.length ? { code: { text: objectExcerptText(entries, excerpts.leftOut), attachments: entries.map((e) => e.sent) } } : {}),
  });
  const max = context.maxInputTokens;
  const tokens = () => buildSafeTokens(task, inputsOf(), context);
  if (max !== undefined && tokens() > max) {
    while (history.length && tokens() > max) history = history.slice(1);
    const droppedTurns = given.length - history.length;
    if (droppedTurns) trimmed.push(`${plural(droppedTurns, "earlier turn")} left out to stay within the size limit.`);
    const had = entries.length;
    while (entries.length && tokens() > max) entries = entries.slice(0, -1);
    if (had > entries.length) trimmed.push(`${plural(had - entries.length, "code excerpt")} left out to stay within the size limit.`);
  }
  const ask: BmoAskInfo = { objects, context: kind, history: { sent: history.length, given: given.length }, trimmed };
  return { task, inputs: inputsOf(), context, effect: EFFECT.ask, ask };
}

/** The estimated tokens of a task's prompt (0 when it cannot be built: the preview then says why). */
function buildSafeTokens(task: Task<unknown>, inputs: unknown, ctx: TaskContext): number {
  try {
    return task.build(inputs, ctx).estTokens;
  } catch {
    return 0;
  }
}

// ------------------------------------------------------------------ preview and run

/** Where a run goes: the plugged-in backend (tests), or what the settings say. */
export interface Destination {
  provider: string | null;
  model: string | null;
  host: string | null;
}

export function destinationOf(s: BmoSettings, injected: Backend | null): Destination {
  if (injected) return { provider: injected.id, model: null, host: null };
  const base = settingsBase(s);
  return { provider: s.provider ?? null, model: effectiveModel(s), host: base ? new URL(base).host : null };
}

/** The hash a run must be confirmed with: the prompt's, and where it goes. A settings change between the preview and the run (another provider, host or model) makes the hash differ, so the run is refused. */
export const confirmHashOf = (promptHash: string, dest: Destination): string =>
  createHash("sha1")
    .update(promptHash, "utf-8")
    .update("\u0000", "utf-8")
    .update(JSON.stringify([dest.provider, dest.host, dest.model]), "utf-8")
    .digest("hex");

/** The exact prompt of a plan, the files in it and its hash. Throws BmoError (`refused`, `too-large`) when it cannot be built. */
export function previewOf(plan: Planned, s: BmoSettings, dest: Destination): BmoPreview {
  const p = preview(plan.task, plan.inputs, plan.context);
  return {
    task: p.task,
    output: p.output,
    promptVersion: p.promptVersion,
    hash: confirmHashOf(p.hash, dest),
    estTokens: p.estTokens,
    maxInputTokens: plan.context.maxInputTokens ?? null,
    destination: dest,
    files: p.attachments.map((a) => ({ path: a.path, bytes: a.bytes, lines: a.lines, redactions: a.redactions })),
    redactions: p.redactions,
    system: p.system,
    user: p.user,
    estCost: estimateCost(s, p.estTokens),
    ...(plan.ask ? { ask: plan.ask } : {}),
  };
}

/** The answer was not usable: what is wrong, by JSON pointer, and the text to paste back to BMO. */
export class BmoInvalid extends Error {
  constructor(
    readonly errors: FieldError[],
    readonly pasteBack: string,
    readonly warnings: FieldError[] = [],
  ) {
    super(
      `The answer could not be used: ${errors.length} problem${errors.length === 1 ? "" : "s"}.${errors[0] ? ` First: ${errors[0].pointer ? `${errors[0].pointer}: ` : ""}${errors[0].message}` : ""}`,
    );
    this.name = "BmoInvalid";
  }
}

/** The run's hash is not the one that was shown: the model, the code or the inputs changed since the preview. */
export class StalePreview extends BmoError {
  constructor() {
    super("refused", "The prompt is not the one that was shown (the model, the code or the inputs changed since the preview). Look at the preview again and confirm it.");
    this.name = "StalePreview";
  }
}

export interface RunDeps {
  env: BmoEnv;
  settings: BmoSettings;
  backend: Backend;
  dest: Destination;
  /** The `.dp` folder (hub or project) the run log goes to. */
  dpDir: string;
  /** The signed-in user, or null. */
  who: string | null;
  /** Credit for a draft an import file makes (default: the Drafts' author). */
  author?: string | null;
  signal?: AbortSignal;
}

const freeTitle = (drafts: Drafts, base: string): string => {
  const taken = new Set(drafts.list().map((d) => d.title));
  for (let n = 1; ; n++) {
    const t = n === 1 ? base : `${base} (${n})`;
    if (!taken.has(t)) return t;
  }
};

const IMPORT_TITLE: Record<string, string> = {
  "describe-to-model": "BMO: from a description",
  "suggest-labels": "BMO: relationship labels",
};

function makeImportDraft(
  deps: RunDeps,
  plan: Planned,
  file: ImportFile,
  model: string | null,
): { draftId: string; report: NonNullable<ReturnType<typeof importToDraft>>["report"]; warnings: FieldError[] } {
  const { env } = deps;
  const level = (plan.inputs as { level?: string }).level;
  const base = plan.task.id === "import-level" ? `BMO: import ${(level ?? "").toUpperCase()}` : (IMPORT_TITLE[plan.task.id] ?? "BMO import");
  // Where the answer came from is set by the server, whatever the answer says about itself.
  const stamped: ImportFile = { ...file, source: { kind: "bmo", backend: deps.backend.id, ...(model ? { model } : {}) } };
  env.project.reloadIfChanged();
  const r = importToDraft(env.drafts, stamped, {
    title: freeTitle(env.drafts, base),
    description: `Proposed by BMO (${plan.task.id}, prompt ${plan.task.promptVersion}). Review each item before accepting it.`,
    author: deps.author,
    code: env.disk,
    ...(plan.task.id === "describe-to-model" ? { sourceText: (plan.inputs as { text: string }).text } : {}),
  });
  return { draftId: r.draftId, report: r.report, warnings: r.warnings };
}

/**
 * Run a plan: rebuild the prompt, refuse unless it is the one confirmed (`StalePreview`), send it to the backend,
 * check the answer and carry it out (see the file header). Throws `BmoError` (including `StalePreview`),
 * `BmoInvalid`, or a `ModelError` when carrying the answer out fails.
 */
export async function runBmo(deps: RunDeps, plan: Planned, confirmHash: string): Promise<BmoRunResult> {
  const p = preview(plan.task, plan.inputs, plan.context);
  if (!confirmHash || confirmHash !== confirmHashOf(p.hash, deps.dest)) throw new StalePreview();
  const when = new Date().toISOString();
  const log = (outcome: Parameters<typeof logRun>[1]["outcome"], extra: { error?: string; usage?: { inputTokens?: number; outputTokens?: number } } = {}) => {
    try {
      logRun(
        deps.dpDir,
        {
          task: plan.task.id,
          promptHash: p.hash,
          provider: deps.dest.provider ?? deps.backend.id,
          model: deps.dest.model,
          host: deps.dest.host,
          who: deps.who,
          when,
          outcome,
          attachments: p.attachments.map((a) => ({ path: a.path, bytes: a.bytes })),
          prompt: { system: p.system, user: p.user },
          ...extra,
        },
        deps.settings.keepPrompts,
      );
    } catch (e) {
      // The answer is already paid for; a log that cannot be written must not hide it. The server log says so.
      console.error(`designPerspectives: could not write the BMO run log: ${(e as Error).message}`);
    }
  };

  let outcome;
  try {
    outcome = await runTask(plan.task, plan.inputs, plan.context, deps.backend, p.hash, deps.signal ? { signal: deps.signal } : {});
  } catch (e) {
    const err = asBmoError(e);
    log(err.kind, { error: err.message });
    throw err;
  }
  const usage = outcome.usage;
  const info = { usage: usage ?? null, model: outcome.model ?? deps.dest.model, estCost: usage ? estimateCost(deps.settings, usage) : null };
  const res = outcome.result;
  if (!res.ok) {
    log("invalid", { ...(usage ? { usage } : {}), error: `The answer had ${res.errors.length} problem${res.errors.length === 1 ? "" : "s"}.` });
    throw new BmoInvalid(res.errors, res.pasteBack);
  }
  try {
    let result: BmoRunResult;
    if (res.output === "text") result = { output: "text", text: res.text, ...info };
    else if (res.output === "import-file") result = { output: "import-file", ...makeImportDraft(deps, plan, res.file, info.model), ...info };
    else {
      const id = plan.draftId!;
      const made = deps.env.drafts.get(id).edit((_ws, _sc, decs) => {
        const did = decisions.createDecision(decs, res.decision);
        const d = decs.find((x) => x.id === did)!;
        return { id: did, file: d.file, title: d.title };
      });
      result = { output: "decision", decision: made, ...info };
    }
    log("ok", usage ? { usage } : {});
    return result;
  } catch (e) {
    log("invalid", { ...(usage ? { usage } : {}), error: e instanceof Error ? e.message : "The answer could not be carried out." });
    if (e instanceof ImportRejected) throw new BmoInvalid(e.errors, pasteBackText(plan.task.id, e.errors), e.warnings);
    throw e;
  }
}

/** The task list the status shows. */
export const taskList = () => TASK_IDS.map((id) => ({ id, title: TASKS[id].title, output: TASKS[id].output }));
