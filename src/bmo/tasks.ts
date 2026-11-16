/**
 * BMO's tasks (plan section 6): what BMO can be asked, how each prompt is built and how each answer is
 * checked. A task takes plain data (workspace text, change sets, strings, a digest) so the routes can
 * assemble its inputs from any model version; tasks never reach into a Project or the drafts.
 *
 * Flow: `preview(task, inputs, ctx)` builds the exact prompt and its hash; the person sees the prompt and the
 * list of file excerpts (`attachments`); `runTask(..., confirmHash)` rebuilds it and refuses to run if the
 * hash differs (what was shown is what goes). The answer is checked by the task's `validate`:
 * - "import-file": the JSON is taken from the answer (a fenced code block or leading prose is tolerated,
 *   nothing cleverer), then `parseImportFile`, the task's own rules, and `checkImport`;
 * - "decision": a strict JSON object checked by the import schema's decision rules;
 * - "text": shown, never stored.
 * Problems come back as `{ok: false, errors, pasteBack}`: the text a person copies back to BMO. Nothing is
 * ever repaired. `runTask` throws only `BmoError`.
 */

import type { CodeSource } from "../core/codeFiles.js";
import { buildIndex } from "../core/ops.js";
import { intakeData, type Intake } from "../import/intake.js";
import { checkImport, type ModelView } from "../import/checks.js";
import { parseImportFile, pointer, schemaErrors, IMPORT_SCHEMA } from "../import/schema.js";
import { stableJson } from "../core/util.js";

import type { ChangeSet, FieldError, ImportFile, ImportObjectType } from "../shared/types.js";
import { asBmoError, BmoError, estimateTokens, promptHash, type Backend } from "./backend.js";
import type { Digest, Sent } from "./digest.js";
import { changesText, type LabelCandidate } from "./modelText.js";
import {
  challengeSystem,
  dataBlock,
  DECISION_FIELDS,
  DECISION_SCHEMA,
  decisionSystem,
  describeSystem,
  draftSummarySystem,
  explainSystem,
  importLevelSystem,
  intakeText,
  PROMPT_VERSION,
  suggestLabelsSystem,
  userText,
  type Block,
  type Variant,
} from "./prompts.js";
import { redactValue, secretIn } from "./redact.js";

export type { Sent };

export type TaskOutput = "import-file" | "text" | "decision";

export interface TaskContext {
  /** The model version an answer is checked against (IDs resolve, names unique). */
  model: ModelView;
  /** Where code paths and file evidence are checked; null: not checked (a warning says so). */
  code: CodeSource | null;
  /** "direct" (default): the backend gets only this prompt. "handoff": a person's own coding agent runs it. */
  variant?: Variant;
  /** A run whose prompt is larger than this (estimated tokens) is refused as too large. */
  maxInputTokens?: number;
}

export interface BuiltPrompt {
  system: string;
  user: string;
  /** Exactly the file excerpts the prompt includes (after redaction and cutting). */
  attachments: Sent[];
  estTokens: number;
  /** Values hidden in the data blocks (the excerpts' own counts are in `attachments`). */
  redactions: number;
  /** Extra files the handoff writes next to the prompt (name → content), already redacted. */
  handoffFiles?: Record<string, string>;
}

export interface Preview extends BuiltPrompt {
  task: TaskId;
  promptVersion: string;
  output: TaskOutput;
  hash: string;
}

/** A decision proposed by BMO: the input of `createDecision`, status always "proposed". */
export interface DecisionProposal {
  title: string;
  status: "proposed";
  context: string;
  decision: string;
  alternatives: { name: string; whyNot?: string }[];
  affects: string[];
}

export type TaskResult =
  | { ok: true; output: "import-file"; file: ImportFile; warnings: FieldError[] }
  | { ok: true; output: "decision"; decision: DecisionProposal; warnings: FieldError[] }
  | { ok: true; output: "text"; text: string }
  | { ok: false; output: TaskOutput; errors: FieldError[]; pasteBack: string };

export interface Task<I> {
  id: TaskId;
  /** Shown to the person ("Import a level", "Explain"). */
  title: string;
  promptVersion: string;
  output: TaskOutput;
  maxOutputTokens: number;
  build(inputs: I, ctx: TaskContext): BuiltPrompt;
  /** Check an answer. `inputs` are the ones the prompt was built from (the level, the relationships asked about). */
  validate(raw: string, ctx: TaskContext, inputs: I): TaskResult;
}

// ------------------------------------------------------------------ inputs

/** Typed guidance from the person, saved as written: about one object (`id`) or the whole draft (`id: null`). */
export interface FeedbackNote {
  id: string | null;
  text: string;
}

export interface ImportLevelInput {
  level: "c1" | "c2" | "c3";
  /** `buildDigest` for this level (and, at C3, this container). */
  digest: Digest;
  intake: Intake;
  feedback: FeedbackNote[];
  /** `modelText` of the current model, so IDs stay stable. */
  modelSummary: string;
  /** C3: the container whose components are proposed. */
  container?: { id: string; name: string };
  /** The import ignore list (shown to a handoff agent as must-not-open). */
  ignore?: string[];
}

export interface DescribeInput {
  /** The person's own description of a system, at most 60 KB. */
  text: string;
  modelSummary: string;
}

export interface ExplainInput {
  /** `diagramText` or `objectText`. */
  subject: string;
  lens: { name: string; sections: readonly string[] };
}

export interface DraftChangesInput {
  draft: { title: string; description?: string };
  changes: ChangeSet;
  /** `diffMarkdown` of the same changes, when the route has it. */
  markdown?: string;
}

export interface ChallengeInput {
  /** `diagramText` of the diagram to challenge. */
  subject: string;
  /** Problems dp found by rule (model errors, `dp check` warnings). */
  lints: string[];
}

export interface SuggestLabelsInput {
  /** `unlabelledRelationships(ws)`, or a part of it. */
  relationships: LabelCandidate[];
  /** Optional excerpts of the ends' code (a digest). */
  digest?: Digest;
}

export interface TaskInputs {
  "import-level": ImportLevelInput;
  "describe-to-model": DescribeInput;
  explain: ExplainInput;
  "decision-from-draft": DraftChangesInput;
  "draft-summary": DraftChangesInput;
  challenge: ChallengeInput;
  "suggest-labels": SuggestLabelsInput;
}
export type TaskId = keyof TaskInputs;

export const MAX_DESCRIPTION_BYTES = 60 * 1024;
export const MAX_TEXT_ANSWER = 100_000;
/** Answers longer than this are not read (an import file is at most 2 MB). */
export const MAX_ANSWER_BYTES = 2 * 1024 * 1024 + 64 * 1024;

// ------------------------------------------------------------------ helpers

function built(system: string, blocks: Block[], attachments: Sent[] = [], handoffFiles?: Record<string, string>): BuiltPrompt {
  const user = userText(blocks);
  const out: BuiltPrompt = {
    system,
    user,
    attachments,
    estTokens: estimateTokens(system) + estimateTokens(user),
    redactions: blocks.reduce((n, b) => n + b.redactions, 0),
  };
  if (handoffFiles) out.handoffFiles = handoffFiles;
  return out;
}

const feedbackText = (notes: FeedbackNote[]): string =>
  notes.length ? notes.map((n) => `- ${n.id ? `about ${n.id}` : "about the whole draft"}: ${n.text.replace(/\s+/g, " ").trim()}`).join("\n") + "\n" : "(no feedback yet)\n";

/** The text to copy back to BMO: what was wrong, by JSON pointer, and what to send again. */
export function pasteBackText(taskId: TaskId, errors: FieldError[]): string {
  const lines = errors.map((e) => `- ${e.pointer || "(whole answer)"}: ${e.message}`);
  return [`dp could not use your answer (task ${taskId}, prompt ${PROMPT_VERSION}). Fix these problems and send the whole corrected answer again, in the same format:`, ...lines].join("\n") + "\n";
}

const fail = (taskId: TaskId, output: TaskOutput, errors: FieldError[]): TaskResult => ({ ok: false, output, errors, pasteBack: pasteBackText(taskId, errors) });

/**
 * The JSON text in an answer: the answer itself, the first fenced code block that holds an object, or
 * everything from the first line that starts with "{" (leading prose). Nothing cleverer.
 */
export function extractJson(raw: string): string {
  const t = raw.replace(/^\uFEFF/, "").trim();
  if (t.startsWith("{")) return t;
  for (const m of t.matchAll(/```[A-Za-z0-9_-]*[ \t]*\n([\s\S]*?)\n?```/g)) {
    if (m[1]!.trim().startsWith("{")) return m[1]!.trim();
  }
  const i = t.search(/^\{/m);
  return i >= 0 ? t.slice(i).trim() : t;
}

function tooLong(raw: string): FieldError | null {
  const bytes = Buffer.byteLength(raw, "utf-8");
  return bytes > MAX_ANSWER_BYTES ? { pointer: "", message: `The answer is ${bytes} bytes; at most ${MAX_ANSWER_BYTES} are read.` } : null;
}

/** Parse, apply the task's own rules, then the model and code checks. */
function validateImport(taskId: TaskId, raw: string, ctx: TaskContext, rules: (file: ImportFile, err: (p: string, m: string) => void, warn: (p: string, m: string) => void) => void): TaskResult {
  const big = tooLong(raw);
  if (big) return fail(taskId, "import-file", [big]);
  const { file, errors } = parseImportFile(extractJson(raw));
  if (!file) return fail(taskId, "import-file", errors);
  const errs: FieldError[] = [];
  const warnings: FieldError[] = [];
  rules(
    file,
    (p, m) => errs.push({ pointer: p, message: m }),
    (p, m) => warnings.push({ pointer: p, message: m }),
  );
  if (file.promptVersion !== undefined && file.promptVersion !== PROMPT_VERSION)
    warnings.push({ pointer: "/promptVersion", message: `Written for prompt ${file.promptVersion}; this is prompt ${PROMPT_VERSION}.` });
  const check = checkImport(file, ctx.model, ctx.code);
  errs.push(...check.errors);
  warnings.push(...check.warnings);
  if (errs.length) return fail(taskId, "import-file", errs);
  return { ok: true, output: "import-file", file, warnings };
}

function validateText(taskId: TaskId, raw: string, ctx: TaskContext): TaskResult {
  let t = raw.replace(/^\uFEFF/, "").trim();
  // A handoff agent writes {"text": "..."} to result.json.
  if (ctx.variant === "handoff" && t.startsWith("{")) {
    try {
      const v: unknown = JSON.parse(t);
      if (v && typeof v === "object" && typeof (v as { text?: unknown }).text === "string") t = ((v as { text: string }).text ?? "").trim();
    } catch {
      // Not JSON: the text as written.
    }
  }
  // The whole answer in one fence: unwrap it.
  const fenced = /^```[A-Za-z0-9_-]*[ \t]*\n([\s\S]*?)\n?```$/.exec(t);
  if (fenced) t = fenced[1]!.trim();
  if (!t) return fail(taskId, "text", [{ pointer: "", message: "The answer is empty." }]);
  if (t.length > MAX_TEXT_ANSWER) return fail(taskId, "text", [{ pointer: "", message: `The answer has ${t.length} characters; at most ${MAX_TEXT_ANSWER} are shown. Answer more briefly.` }]);
  return { ok: true, output: "text", text: t };
}

const levelKinds: Record<"c1" | "c2" | "c3", ImportObjectType[]> = { c1: ["person", "system"], c2: ["container"], c3: ["component"] };

function evidenceRules(file: ImportFile, warn: (p: string, m: string) => void): void {
  file.objects.forEach((o, i) => {
    if (!o.evidence?.length) warn(pointer(pointer("/objects", i), "evidence"), `"${o.id}" has no evidence; it will be unverified and needs an explicit accept.`);
  });
  file.relationships.forEach((r, i) => {
    if (!r.evidence?.length) warn(pointer(pointer("/relationships", i), "evidence"), `"${r.source}" -> "${r.target}" has no evidence; it will be unverified and needs an explicit accept.`);
  });
}

// ------------------------------------------------------------------ the tasks

const importLevel: Task<ImportLevelInput> = {
  id: "import-level",
  title: "Import a level",
  promptVersion: PROMPT_VERSION,
  output: "import-file",
  maxOutputTokens: 32_000,
  build(i, ctx) {
    if (i.level === "c3" && !i.container) throw new BmoError("refused", "A C3 turn is for one container: choose the container first.");
    if (i.digest.level !== i.level) throw new BmoError("refused", `The evidence digest is for ${i.digest.level.toUpperCase()}, not ${i.level.toUpperCase()}.`);
    const variant = ctx.variant ?? "direct";
    const mustNotOpen = [...i.intake.mustNotOpen, ...i.intake.scope.exclude, ...(i.ignore ?? []).filter((g) => !g.includes(":"))];
    const blocks = [
      dataBlock("intake", intakeText(i.intake)),
      ...(i.container ? [dataBlock("container", `Container for this turn: ${i.container.id} ${JSON.stringify(i.container.name)}\n`)] : []),
      dataBlock("model", i.modelSummary),
      dataBlock("feedback", feedbackText(i.feedback)),
      ...(variant === "handoff" ? [dataBlock("must-not-open", mustNotOpen.length ? mustNotOpen.map((g) => `- ${g}`).join("\n") + "\n" : "(none beyond the fixed rules)\n")] : []),
      dataBlock("evidence-digest", i.digest.text),
    ];
    const files =
      variant === "handoff"
        ? {
            "evidence-digest.md": blocks[blocks.length - 1]!.text.split("\n").slice(1, -1).join("\n") + "\n",
            "intake.json": stableJson(redactValue(intakeData(i.intake))),
            "feedback.json": stableJson(redactValue(i.feedback.map((n) => ({ id: n.id, text: n.text })))),
          }
        : undefined;
    return built(importLevelSystem(i.level, variant), blocks, i.digest.attachments, files);
  },
  validate(raw, ctx, i) {
    return validateImport("import-level", raw, ctx, (file, err, warn) => {
      if (file.level !== i.level) err("/level", `This turn is ${i.level.toUpperCase()}: "level" must be "${i.level}".`);
      const kinds = levelKinds[i.level];
      file.objects.forEach((o, n) => {
        const at = pointer("/objects", n);
        if (!kinds.includes(o.type)) err(pointer(at, "type"), `This turn is ${i.level.toUpperCase()}: only ${kinds.join(" and ")} objects. Propose "${o.id}" in its own level's turn.`);
        else if (i.level === "c3" && i.container && o.parent !== i.container.id)
          err(pointer(at, "parent"), `This turn is for the components of "${i.container.id}": "parent" must be "${i.container.id}".`);
      });
      evidenceRules(file, warn);
    });
  },
};

const describeToModel: Task<DescribeInput> = {
  id: "describe-to-model",
  title: "Model from a description",
  promptVersion: PROMPT_VERSION,
  output: "import-file",
  maxOutputTokens: 32_000,
  build(i, ctx) {
    const bytes = Buffer.byteLength(i.text, "utf-8");
    if (bytes > MAX_DESCRIPTION_BYTES) throw new BmoError("too-large", `The description is ${bytes} bytes; at most ${MAX_DESCRIPTION_BYTES} (60 KB) can be sent. Shorten it or send it in parts.`);
    if (!i.text.trim()) throw new BmoError("refused", "The description is empty.");
    return built(describeSystem(ctx.variant ?? "direct"), [dataBlock("model", i.modelSummary), dataBlock("description", i.text)]);
  },
  validate(raw, ctx) {
    return validateImport("describe-to-model", raw, ctx, (file, err) => {
      const onlyUser = (at: string, ev: { kind: string }[] | undefined) => {
        if (!ev?.length) return err(pointer(at, "evidence"), 'Give evidence of kind "user": the part of the description it comes from.');
        ev.forEach((e, j) => {
          if (e.kind !== "user") err(pointer(pointer(at, "evidence"), j), `Only "user" evidence here: this answer comes from a description, not from ${e.kind === "file" ? "files" : "the scan"}.`);
        });
      };
      file.objects.forEach((o, n) => onlyUser(pointer("/objects", n), o.evidence));
      file.relationships.forEach((r, n) => onlyUser(pointer("/relationships", n), r.evidence));
      (file.decisions ?? []).forEach((d, n) => d.evidence && onlyUser(pointer("/decisions", n), d.evidence));
    });
  },
};

const suggestLabels: Task<SuggestLabelsInput> = {
  id: "suggest-labels",
  title: "Suggest relationship labels",
  promptVersion: PROMPT_VERSION,
  output: "import-file",
  maxOutputTokens: 16_000,
  build(i, ctx) {
    if (!i.relationships.length) throw new BmoError("refused", 'There are no relationships with an empty or "Uses" label.');
    const end = (e: LabelCandidate["source"]) =>
      `${e.kind} ${e.id} ${JSON.stringify(e.name)}${e.technologies.length ? ` [${e.technologies.join(", ")}]` : ""}${e.codePaths.length ? ` code: ${e.codePaths.join(", ")}` : ""}`;
    const list = i.relationships
      .map((r) =>
        [
          `- id: ${r.id}`,
          `  source: ${end(r.source)}`,
          `  target: ${end(r.target)}`,
          `  current label: ${JSON.stringify(r.description)}`,
          ...(r.technologies.length ? [`  technology: ${r.technologies.join(", ")}`] : []),
          ...(r.codePaths.length ? [`  code: ${r.codePaths.join(", ")}`] : []),
        ].join("\n"),
      )
      .join("\n");
    const blocks = [dataBlock("relationships", list + "\n")];
    if (i.digest) blocks.push(dataBlock("evidence-digest", i.digest.text));
    return built(suggestLabelsSystem(ctx.variant ?? "direct"), blocks, i.digest?.attachments ?? []);
  },
  validate(raw, ctx, i) {
    const asked = new Map(i.relationships.map((r) => [r.id, r]));
    return validateImport("suggest-labels", raw, ctx, (file, err, warn) => {
      if (file.objects.length) err("/objects", 'Only relationships in this answer: "objects" must be an empty list.');
      if (file.flows?.length) err("/flows", "No flows in this answer.");
      if (file.decisions?.length) err("/decisions", "No decisions in this answer.");
      file.relationships.forEach((r, n) => {
        const at = pointer("/relationships", n);
        const q = r.id === undefined ? undefined : asked.get(r.id);
        if (r.id === undefined) return err(pointer(at, "id"), 'Give "id": the ID of the relationship as listed.');
        if (!q) return err(pointer(at, "id"), `"${r.id}" is not one of the relationships asked about.`);
        if (r.source !== q.source.id) err(pointer(at, "source"), `"${r.id}" goes from "${q.source.id}"; "source" must be "${q.source.id}".`);
        if (r.target !== q.target.id) err(pointer(at, "target"), `"${r.id}" goes to "${q.target.id}"; "target" must be "${q.target.id}".`);
        if (r.via !== undefined) err(pointer(at, "via"), 'No "via" here: only a new label for an existing relationship.');
      });
      evidenceRules(file, warn);
    });
  },
};

const explain: Task<ExplainInput> = {
  id: "explain",
  title: "Explain",
  promptVersion: PROMPT_VERSION,
  output: "text",
  maxOutputTokens: 2_000,
  build(i, ctx) {
    const lens = `Lens: ${i.lens.name}\nSections this audience sees: ${i.lens.sections.length ? i.lens.sections.join(", ") : "(none beyond names and descriptions)"}\n`;
    return built(explainSystem(ctx.variant ?? "direct"), [dataBlock("lens", lens), dataBlock("subject", i.subject)]);
  },
  validate: (raw, ctx) => validateText("explain", raw, ctx),
};

const draftBlocks = (i: DraftChangesInput): Block[] => {
  const head = `Draft: ${i.draft.title}\n${i.draft.description ? `Description: ${i.draft.description}\n` : ""}`;
  return [dataBlock("draft", head), dataBlock("changes", changesText(i.changes) + (i.markdown ? `\n${i.markdown}` : ""))];
};

const decisionFromDraft: Task<DraftChangesInput> = {
  id: "decision-from-draft",
  title: "Propose a decision",
  promptVersion: PROMPT_VERSION,
  output: "decision",
  maxOutputTokens: 4_000,
  build: (i, ctx) => built(decisionSystem(ctx.variant ?? "direct"), draftBlocks(i)),
  validate(raw, ctx) {
    const id = "decision-from-draft";
    const big = tooLong(raw);
    if (big) return fail(id, "decision", [big]);
    let v: unknown;
    try {
      v = JSON.parse(extractJson(raw));
    } catch (e) {
      return fail(id, "decision", [{ pointer: "", message: `Not valid JSON: ${(e as Error).message}` }]);
    }
    if (!v || typeof v !== "object" || Array.isArray(v)) return fail(id, "decision", [{ pointer: "", message: "Must be one JSON object." }]);
    const o = v as Record<string, unknown>;
    const errs: FieldError[] = [];
    for (const k of Object.keys(o)) {
      if (k === "status") {
        if (o.status !== "proposed") errs.push({ pointer: "/status", message: 'The status is always "proposed"; leave it out.' });
      } else if (!(DECISION_FIELDS as readonly string[]).includes(k)) errs.push({ pointer: pointer("", k), message: `Unknown field "${k}". Allowed: ${DECISION_FIELDS.join(", ")}.` });
    }
    const known = Object.fromEntries(Object.entries(o).filter(([k]) => (DECISION_FIELDS as readonly string[]).includes(k)));
    const wrapped = { schemaVersion: 1, level: "all", objects: [], relationships: [], decisions: [{ ...known, status: "proposed" }] };
    for (const e of schemaErrors(wrapped)) errs.push({ pointer: e.pointer.replace(/^\/decisions\/0/, ""), message: e.message });
    for (const k of ["title", "context", "decision"] as const) if (typeof o[k] === "string" && !(o[k] as string).trim()) errs.push({ pointer: `/${k}`, message: "Must not be empty." });
    if (errs.length) return fail(id, "decision", errs);
    const d: DecisionProposal = {
      title: (o.title as string).trim(),
      status: "proposed",
      context: (o.context as string).trim(),
      decision: (o.decision as string).trim(),
      alternatives: ((o.alternatives as DecisionProposal["alternatives"] | undefined) ?? []).map((a) =>
        a.whyNot === undefined ? { name: a.name.trim() } : { name: a.name.trim(), whyNot: a.whyNot.trim() },
      ),
      affects: (o.affects as string[] | undefined) ?? [],
    };
    const names = d.alternatives.map((a) => a.name);
    names.forEach((n, k) => names.indexOf(n) !== k && errs.push({ pointer: `/alternatives/${k}/name`, message: `Two alternatives are named "${n}".` }));
    const idx = buildIndex(ctx.model.workspace);
    d.affects.forEach((a, k) => {
      if (!idx.elements.has(a) && !idx.relationships.has(a)) errs.push({ pointer: `/affects/${k}`, message: `No element or relationship "${a}" in the draft.` });
    });
    const strings: [string, string][] = [
      ["/title", d.title],
      ["/context", d.context],
      ["/decision", d.decision],
      ...d.alternatives.flatMap((a, k): [string, string][] => [[`/alternatives/${k}/name`, a.name], ...(a.whyNot ? [[`/alternatives/${k}/whyNot`, a.whyNot] as [string, string]] : [])]),
    ];
    for (const [p, s] of strings) {
      const why = secretIn(s);
      if (why) errs.push({ pointer: p, message: `This ${why}. A decision holds no secret values: remove it.` });
    }
    if (errs.length) return fail(id, "decision", errs);
    return { ok: true, output: "decision", decision: d, warnings: [] };
  },
};

const draftSummary: Task<DraftChangesInput> = {
  id: "draft-summary",
  title: "Summary for a pull request",
  promptVersion: PROMPT_VERSION,
  output: "text",
  maxOutputTokens: 2_000,
  build: (i, ctx) => built(draftSummarySystem(ctx.variant ?? "direct"), draftBlocks(i)),
  validate: (raw, ctx) => validateText("draft-summary", raw, ctx),
};

const challenge: Task<ChallengeInput> = {
  id: "challenge",
  title: "Challenge",
  promptVersion: PROMPT_VERSION,
  output: "text",
  maxOutputTokens: 2_000,
  build(i, ctx) {
    const lints = i.lints.length ? i.lints.map((l) => `- ${l.replace(/\s+/g, " ").trim()}`).join("\n") + "\n" : "(dp found no problems by rule)\n";
    return built(challengeSystem(ctx.variant ?? "direct"), [dataBlock("subject", i.subject), dataBlock("lint", lints)]);
  },
  validate: (raw, ctx) => validateText("challenge", raw, ctx),
};

/** Every task, by ID. */
export const TASKS: { [K in TaskId]: Task<TaskInputs[K]> } = {
  "import-level": importLevel,
  "describe-to-model": describeToModel,
  explain,
  "decision-from-draft": decisionFromDraft,
  "draft-summary": draftSummary,
  challenge,
  "suggest-labels": suggestLabels,
};
export const TASK_IDS = Object.keys(TASKS) as TaskId[];

export function getTask(id: string): Task<TaskInputs[TaskId]> {
  if (!Object.prototype.hasOwnProperty.call(TASKS, id)) throw new BmoError("refused", `BMO has no task "${id}".`);
  return TASKS[id as TaskId] as Task<TaskInputs[TaskId]>;
}

/** The JSON Schema an answer must follow (handed to backends that enforce one), or undefined for text. */
export function answerSchema(output: TaskOutput): object | undefined {
  return output === "import-file" ? IMPORT_SCHEMA : output === "decision" ? DECISION_SCHEMA : undefined;
}

// ------------------------------------------------------------------ preview and run

function buildSafe<I>(task: Task<I>, inputs: I, ctx: TaskContext): BuiltPrompt {
  try {
    return task.build(inputs, ctx);
  } catch (e) {
    if (e instanceof BmoError) throw e;
    throw new BmoError("refused", `The prompt could not be built: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** The exact prompt a run would send, the file excerpts in it and its hash (the run must be confirmed with that hash). */
export function preview<I>(task: Task<I>, inputs: I, ctx: TaskContext): Preview {
  const b = buildSafe(task, inputs, ctx);
  return { ...b, task: task.id, promptVersion: task.promptVersion, output: task.output, hash: promptHash(b.system, b.user) };
}

export interface RunOutcome {
  result: TaskResult;
  usage?: { inputTokens?: number; outputTokens?: number };
  /** The model that answered, when the backend says so. */
  model?: string;
  backend: string;
  hash: string;
}

/**
 * Run a task: rebuild the prompt, refuse unless it is the one the person confirmed (`confirmHash` from
 * `preview`), send it, check the answer. Throws only `BmoError`.
 */
export async function runTask<I>(task: Task<I>, inputs: I, ctx: TaskContext, backend: Backend, confirmHash: string, opts: { signal?: AbortSignal } = {}): Promise<RunOutcome> {
  const p = preview(task, inputs, ctx);
  if (!confirmHash || confirmHash !== p.hash) {
    throw new BmoError("refused", "The prompt is not the one that was shown (the model, the code or the inputs changed since the preview). Look at the preview again and confirm it.");
  }
  if (ctx.maxInputTokens !== undefined && p.estTokens > ctx.maxInputTokens) {
    throw new BmoError("too-large", `The prompt is about ${p.estTokens} tokens; this backend takes at most ${ctx.maxInputTokens}. Lower the digest budget or split the work.`);
  }
  let res;
  try {
    const schema = answerSchema(task.output);
    res = await backend.run({ system: p.system, user: p.user, ...(schema ? { schema } : {}), maxOutputTokens: task.maxOutputTokens, ...(opts.signal ? { signal: opts.signal } : {}), task: task.id });
  } catch (e) {
    throw asBmoError(e);
  }
  if (!res || typeof res.text !== "string") throw new BmoError("invalid-output", "The backend returned no text.");
  let result: TaskResult;
  try {
    result = task.validate(res.text, ctx, inputs);
  } catch (e) {
    if (e instanceof BmoError) throw e;
    throw new BmoError("invalid-output", `The answer could not be checked: ${e instanceof Error ? e.message.slice(0, 300) : String(e)}`);
  }
  const out: RunOutcome = { result, backend: backend.id, hash: p.hash };
  if (res.usage) out.usage = res.usage;
  if (res.model) out.model = res.model;
  return out;
}
