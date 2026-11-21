/**
 * The import tasks as the routes and the CLI run them without a model (COD-02): build the inputs of a task
 * from the stored scan, the intake, the review feedback and the model, write the handoff folder (a person's own
 * coding agent does the work), and check the result that comes back. Direct backends (`providerBackend.ts`) use the same inputs.
 *
 * The handoff folder holds the prompt; `architecture/import/handoff-request.json` (outside it, so a coding agent
 * cannot change it) remembers what was asked (task, level, container) and the prompt's hash, which `validate`
 * needs again when the result arrives.
 */

import fs from "node:fs";
import path from "node:path";
import { answerNotes } from "../core/checklist.js";
import type { CodeSource } from "../core/codeFiles.js";
import type { Drafts } from "../core/drafts.js";
import { buildIndex, CODE_KEY, getJson, ModelError } from "../core/modelEdits.js";
import type { Project } from "../core/project.js";
import { atomicWrite, isObj, stableJson } from "../core/util.js";
import { readState } from "../import/analysis.js";
import { importDir, readIntake } from "../import/intake.js";
import { readReview } from "../import/review.js";
import { readEvidence } from "../import/scan.js";
import type { HandoffOffer } from "../shared/types.js";
import { BmoError } from "./backend.js";
import { buildDigest } from "./codeExcerpts.js";
import { handoffPrompt, readHandoffResult, readManifest, writeHandoff } from "./handoffBackend.js";
import { modelText, unlabelledRelationships } from "./modelText.js";
import { HANDOFF_FOLDER } from "./prompts.js";
import { getTask, preview, type DescribeInput, type FeedbackNote, type ImportLevelInput, type SuggestLabelsInput, type Task, type TaskContext, type TaskResult } from "./tasks.js";

/** The tasks that make an import file; the only ones the import handoff offers. */
export const HANDOFF_TASKS = ["import-level", "describe-to-model", "suggest-labels"] as const;
export type HandoffTask = (typeof HANDOFF_TASKS)[number];

export interface HandoffRequest {
  task: HandoffTask;
  level?: "c1" | "c2" | "c3";
  /** C3: the ID of the container whose components are proposed. */
  container?: string;
  /** describe-to-model: the description. */
  text?: string;
}

/** One line to give a coding agent. */
export const HANDOFF_INSTRUCTION = `Read ${HANDOFF_FOLDER}/prompt.md and follow it; write the result to ${HANDOFF_FOLDER}/result.json.`;

const requestPath = (root: string): string => path.join(importDir(root), "handoff-request.json");
const descriptionPath = (root: string): string => path.join(importDir(root), "handoff-description.txt");

/** The description of the last describe-to-model handoff, or undefined (another task, or none yet). */
export function readHandoffDescription(root: string): string | undefined {
  try {
    return fs.readFileSync(descriptionPath(root), "utf-8");
  } catch {
    return undefined;
  }
}

/** Check a request body ({task, level?, container?, text?}); a ModelError says what is wrong. */
export function parseHandoffRequest(b: unknown): HandoffRequest {
  if (!isObj(b)) throw new ModelError("The request body must be a JSON object.");
  const task = b.task;
  if (typeof task !== "string" || !(HANDOFF_TASKS as readonly string[]).includes(task)) throw new ModelError(`"task" must be one of ${HANDOFF_TASKS.join(", ")}.`);
  const req: HandoffRequest = { task: task as HandoffTask };
  if (b.level !== undefined) {
    if (b.level !== "c1" && b.level !== "c2" && b.level !== "c3") throw new ModelError('"level" must be c1, c2 or c3.');
    req.level = b.level;
  }
  if (b.container !== undefined) {
    if (typeof b.container !== "string" || !b.container.trim()) throw new ModelError('"container" must be a container ID.');
    req.container = b.container.trim();
  }
  if (b.text !== undefined) {
    if (typeof b.text !== "string") throw new ModelError('"text" must be text.');
    req.text = b.text;
  }
  if (task === "import-level" && !req.level) throw new ModelError('The task "import-level" needs a "level" (c1, c2 or c3).');
  if (task === "describe-to-model" && !req.text?.trim()) throw new ModelError('The task "describe-to-model" needs the description as "text".');
  return req;
}

/** Typed feedback on the import drafts' review items and drafts, then the answers on the checklist (REC-05), for the next turn. */
export function importFeedback(drafts: Drafts): FeedbackNote[] {
  const out: FeedbackNote[] = [];
  for (const d of drafts.list()) {
    let review;
    try {
      review = readReview(drafts.main.dir, d.id);
    } catch {
      continue;
    }
    if (!review) continue;
    if (review.draftFeedback) out.push({ id: null, text: review.draftFeedback });
    for (const [key, item] of Object.entries(review.items).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      if (!item.feedback) continue;
      const id = key.startsWith("object:") || key.startsWith("relationship:") ? key.slice(key.indexOf(":") + 1) : key;
      out.push({ id, text: item.feedback });
    }
  }
  // Kept outside any draft, so an answer outlives the draft whose file asked the question.
  out.push(...answerNotes(drafts.main.root));
  return out;
}

function taskContext(project: Project, code: CodeSource): TaskContext {
  return { model: { workspace: project.workspace, sidecar: project.sidecar, decisions: project.decisions }, code, variant: "handoff" };
}

/**
 * The inputs of the requested task, from the project as it is now. A ModelError says what is missing (a scan, a container).
 * `maxDigestTokens`: a direct run's budget from the BMO settings; the digest is cut at the lower of it and the intake's budget.
 */
export function buildInputs(project: Project, drafts: Drafts, code: CodeSource, req: HandoffRequest, opts: { maxDigestTokens?: number } = {}): ImportLevelInput | DescribeInput | SuggestLabelsInput {
  project.reloadIfChanged();
  const ws = project.workspace;
  const summary = (root?: string) => modelText(ws, project.sidecar, root ? { root } : {});
  if (req.task === "describe-to-model") return { text: req.text ?? "", modelSummary: summary() };
  if (req.task === "suggest-labels") return { relationships: unlabelledRelationships(ws) };
  const level = req.level!;
  const evidence = readEvidence(project.root);
  if (!evidence) throw new ModelError("Scan the code first: BMO's prompt is built from the scan.");
  const { intake, errors } = readIntake(project.root);
  if (errors.length) throw new ModelError(`The intake has problems: ${errors.map((e) => (e.path ? `${e.path} ${e.message}` : e.message)).join("; ")}`);
  const state = readState(project.root);
  let container: { id: string; name: string; codePaths: string[] } | undefined;
  if (level === "c3") {
    if (!req.container) throw new ModelError('A C3 turn is for one container: give its ID as "container".');
    const idx = buildIndex(ws);
    if (!idx.elements.has(req.container) || idx.kindOf(req.container) !== "container") {
      const ids = [...idx.elements.keys()].filter((id) => idx.kindOf(id) === "container");
      throw new ModelError(`There is no container "${req.container}" in the model.${ids.length ? ` Containers: ${ids.join(", ")}.` : " Accept the C2 containers first."}`);
    }
    container = { id: req.container, name: idx.el(req.container).name, codePaths: getJson<string>(idx.el(req.container), CODE_KEY).map(String) };
  }
  const budgetTokens = Math.min(intake.settings.passBudgetTokens, opts.maxDigestTokens ?? Infinity);
  const digest = buildDigest(evidence, code, intake, { level, budgetTokens, ignore: state.ignore, ...(container ? { container } : {}) });
  return {
    level,
    digest,
    intake,
    feedback: importFeedback(drafts),
    modelSummary: summary(container?.id),
    ignore: state.ignore,
    ...(container ? { container: { id: container.id, name: container.name } } : {}),
  };
}

/** Build the prompt for the handoff variant and write the handoff folder; returns what the page shows ("Copy prompt") and what the CLI prints. */
export function writeImportHandoff(project: Project, drafts: Drafts, code: CodeSource, req: HandoffRequest): HandoffOffer {
  const task = getTask(req.task) as Task<unknown>;
  const inputs = buildInputs(project, drafts, code, req);
  let built;
  try {
    built = preview(task, inputs, taskContext(project, code));
  } catch (e) {
    if (e instanceof BmoError) throw new ModelError(e.message);
    throw e;
  }
  const manifest = writeHandoff(project.root, task, built);
  const { text: _text, ...rest } = req;
  atomicWrite(requestPath(project.root), stableJson({ ...rest, hash: manifest.hash }));
  // The description is what a person typed: kept by the server so the draft made from the result can check the notes against it.
  if (req.task === "describe-to-model") atomicWrite(descriptionPath(project.root), req.text ?? "");
  else fs.rmSync(descriptionPath(project.root), { force: true });
  return { ...manifest, prompt: handoffPrompt(task, built), folder: HANDOFF_FOLDER, instruction: HANDOFF_INSTRUCTION, estTokens: built.estTokens };
}

interface StoredRequest extends Omit<HandoffRequest, "text"> {
  hash: string;
}

function readRequest(root: string): StoredRequest | null {
  try {
    const v: unknown = JSON.parse(fs.readFileSync(requestPath(root), "utf-8"));
    if (!isObj(v) || typeof v.hash !== "string" || !(HANDOFF_TASKS as readonly string[]).includes(v.task as string)) return null;
    return {
      task: v.task as HandoffTask,
      hash: v.hash,
      ...(typeof v.level === "string" ? { level: v.level as "c1" | "c2" | "c3" } : {}),
      ...(typeof v.container === "string" ? { container: v.container } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Check the answer of the last handoff: `text` (pasted), or `result.json` of the handoff folder. A ModelError when
 * there is no handoff or no result, or the result was written for another prompt. The checks of the task itself
 * (levels, evidence, the import checks) come back as `{ok: false, errors, pasteBack}`.
 */
export function checkHandoffResult(project: Project, drafts: Drafts, code: CodeSource, text?: string): { task: HandoffTask; request: StoredRequest; result: TaskResult } {
  const req = readRequest(project.root);
  if (!req || !readManifest(project.root)) throw new ModelError("No handoff has been written yet: create the prompt first.");
  let raw = text;
  if (raw === undefined) {
    let r;
    try {
      r = readHandoffResult(project.root);
    } catch (e) {
      if (e instanceof BmoError) throw new ModelError(e.message);
      throw e;
    }
    if (!r) throw new ModelError(`There is no result yet. Give ${HANDOFF_FOLDER}/prompt.md to your coding agent and let it write ${HANDOFF_FOLDER}/result.json, or paste the result.`);
    if (!r.manifest || r.manifest.hash !== req.hash) throw new ModelError("result.json belongs to another prompt (the handoff was written again). Write the handoff again and run the new prompt.");
    raw = r.raw;
  }
  const task = getTask(req.task) as Task<unknown>;
  const inputs = buildInputs(project, drafts, code, { ...req, ...(req.task === "describe-to-model" ? { text: "-" } : {}) });
  let result: TaskResult;
  try {
    result = task.validate(raw, taskContext(project, code), inputs);
  } catch (e) {
    if (e instanceof BmoError) throw new ModelError(e.message);
    throw e;
  }
  return { task: req.task, request: req, result };
}
