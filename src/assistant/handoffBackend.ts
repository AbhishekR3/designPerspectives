/**
 * The handoff backend (DEC-051, built first): dp calls no model. It writes BMO's prompt to
 * `architecture/import/handoff/`, a person gives `prompt.md` to their own coding agent ("Read this file and
 * follow it"), the agent writes `result.json` next to it, and dp checks that file with the same `validate`
 * as any other backend's answer.
 *
 * Files written (atomically, with no dates or other varying content, so the same prompt gives the same files):
 * - `prompt.md`: the instructions (system text) and the material (user text) in one file;
 * - `handoff.json`: which task and prompt the folder is for, and the prompt's hash;
 * - `schema.json`: the JSON Schema of the result (import files and decisions);
 * - `evidence-digest.md`, `intake.json`, `feedback.json`: copies of the material (import turns), redacted.
 * Files of an earlier handoff that this one does not write are removed, `result.json` included: a result
 * belongs to the prompt it was written for.
 *
 * `readHandoffResult` reads `result.json` (a plain file of at most `MAX_ANSWER_BYTES`), and `handoffBackend`
 * presents it as a `Backend`, refusing a result written for another prompt.
 */

import fs from "node:fs";
import path from "node:path";
import { atomicWrite, isObj, stableJson } from "../core/util.js";
import { ensureImportGitignore, importDir } from "../import/intake.js";
import type { HandoffManifest } from "../shared/types.js";
import { BmoError, promptHash, type Backend } from "./backend.js";
import { HANDOFF_FOLDER, PROMPT_VERSION } from "./prompts.js";
import { answerSchema, MAX_ANSWER_BYTES, TASK_IDS, type BuiltPrompt, type Task, type TaskId, type TaskOutput } from "./tasks.js";

export const RESULT_FILE = "result.json";
export const MANIFEST_FILE = "handoff.json";
/** Every file name the handoff folder may hold; only these are ever written or removed. */
export const HANDOFF_FILES = ["prompt.md", MANIFEST_FILE, "schema.json", "evidence-digest.md", "intake.json", "feedback.json", RESULT_FILE] as const;

export type { HandoffManifest };

export const handoffDir = (projectDir: string): string => path.join(importDir(projectDir), "handoff");

function resultSection(output: TaskOutput): string {
  if (output === "import-file")
    return [
      "Write one import file (JSON) to `result.json`. It must follow `schema.json` in this folder. dp checks it when it is loaded; if it has problems, dp lists them in a form you can paste back to the agent, and nothing reaches the model until a person accepts it in a draft.",
    ].join("\n");
  if (output === "decision")
    return 'Write one JSON object to `result.json`: `{"title": ..., "context": ..., "decision": ..., "alternatives": [{"name": ..., "whyNot": ...}], "affects": [IDs]}`, following `schema.json` in this folder. dp adds it to the draft as a proposed decision when a person accepts it.';
  return 'Write `{"text": "<your answer>"}` to `result.json`. dp shows the text; it is not stored.';
}

/** The text of `prompt.md`: a short note for the person and the agent, the result format, the instructions, the material. */
export function handoffPrompt<I>(task: Task<I>, built: BuiltPrompt): string {
  return [
    `# BMO: ${task.title}`,
    "",
    `Read this file and follow it; write the result to \`result.json\` in this folder (\`${HANDOFF_FOLDER}/\`).`,
    "",
    `This file was written by designPerspectives (dp) for the task \`${task.id}\`, prompt version ${task.promptVersion}. It has three parts: the result to write, the instructions, and the material in fenced data blocks. Run it in your own coding agent, then load the result in dp. This folder (\`${HANDOFF_FOLDER}/\`) can hold excerpts of your code, so it is not committed to git: dp lists it in \`architecture/import/.gitignore\`.`,
    "",
    "## The result",
    "",
    resultSection(task.output),
    "",
    "## Instructions",
    "",
    built.system.trimEnd(),
    "",
    "## Material",
    "",
    built.user.trimEnd(),
    "",
  ].join("\n");
}

/**
 * Write the handoff folder for a prompt built with `variant: "handoff"`. Returns the manifest. Files from an
 * earlier handoff that are not part of this one (and any `result.json`) are removed.
 */
export function writeHandoff<I>(projectDir: string, task: Task<I>, built: BuiltPrompt): HandoffManifest {
  const dir = handoffDir(projectDir);
  const files = new Map<string, string>();
  files.set("prompt.md", handoffPrompt(task, built));
  const schema = answerSchema(task.output);
  if (schema) files.set("schema.json", stableJson(schema));
  for (const [name, text] of Object.entries(built.handoffFiles ?? {})) {
    if (!(HANDOFF_FILES as readonly string[]).includes(name) || name === RESULT_FILE || name === MANIFEST_FILE || name === "prompt.md" || name === "schema.json") {
      throw new BmoError("refused", `The handoff cannot write "${name}".`);
    }
    files.set(name, text);
  }
  const manifest: HandoffManifest = {
    task: task.id,
    promptVersion: task.promptVersion,
    output: task.output,
    hash: promptHash(built.system, built.user),
    files: [...files.keys(), MANIFEST_FILE].sort(),
  };
  files.set(MANIFEST_FILE, stableJson(manifest));
  fs.mkdirSync(dir, { recursive: true });
  ensureImportGitignore(importDir(projectDir));
  for (const name of HANDOFF_FILES) if (!files.has(name)) fs.rmSync(path.join(dir, name), { force: true });
  for (const [name, text] of [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) atomicWrite(path.join(dir, name), text);
  return manifest;
}

/** The manifest of the handoff folder, or null when there is none (or it is not one dp wrote). */
export function readManifest(projectDir: string): HandoffManifest | null {
  try {
    const v: unknown = JSON.parse(fs.readFileSync(path.join(handoffDir(projectDir), MANIFEST_FILE), "utf-8"));
    if (!isObj(v) || typeof v.task !== "string" || !(TASK_IDS as string[]).includes(v.task) || typeof v.hash !== "string" || typeof v.promptVersion !== "string") return null;
    if (v.output !== "import-file" && v.output !== "text" && v.output !== "decision") return null;
    return { task: v.task as TaskId, promptVersion: v.promptVersion, output: v.output, hash: v.hash, files: Array.isArray(v.files) ? v.files.filter((f): f is string => typeof f === "string") : [] };
  } catch {
    return null;
  }
}

export interface HandoffResult {
  /** The text of `result.json`, to be checked by the task's `validate`. */
  raw: string;
  /** What the folder was written for (null: no manifest; the caller must know the task). */
  manifest: HandoffManifest | null;
}

/** `result.json` of the handoff folder, or null when there is none yet. Throws `BmoError` for a link, a folder or a file that is too large. */
export function readHandoffResult(projectDir: string): HandoffResult | null {
  const file = path.join(handoffDir(projectDir), RESULT_FILE);
  let st: fs.Stats;
  try {
    st = fs.lstatSync(file);
  } catch {
    return null;
  }
  if (!st.isFile()) throw new BmoError("refused", "result.json must be a plain file (not a link or a folder).");
  if (st.size > MAX_ANSWER_BYTES) throw new BmoError("too-large", `result.json is ${st.size} bytes; at most ${MAX_ANSWER_BYTES} are read.`);
  const raw = fs.readFileSync(file, "utf-8");
  if (Buffer.byteLength(raw, "utf-8") > MAX_ANSWER_BYTES) throw new BmoError("too-large", `result.json is over ${MAX_ANSWER_BYTES} bytes.`);
  return { raw, manifest: readManifest(projectDir) };
}

/**
 * The handoff as a `Backend`: it calls nothing. `run` answers with `result.json` when the folder was written
 * for exactly this prompt (same hash), so `runTask` checks it like any other answer.
 */
export function handoffBackend(projectDir: string): Backend {
  return {
    id: "handoff",
    run(req) {
      const r = readHandoffResult(projectDir);
      if (!r) return Promise.reject(new BmoError("off", `There is no result yet. Give ${HANDOFF_FOLDER}/prompt.md to your coding agent and let it write ${HANDOFF_FOLDER}/${RESULT_FILE}.`));
      if (!r.manifest || r.manifest.hash !== promptHash(req.system, req.user)) {
        return Promise.reject(new BmoError("refused", "result.json was written for another prompt (the folder was rewritten, or the inputs changed). Write the handoff again and run the new prompt."));
      }
      if (r.manifest.promptVersion !== PROMPT_VERSION) return Promise.reject(new BmoError("refused", `The handoff was written by prompt ${r.manifest.promptVersion}; this dp uses ${PROMPT_VERSION}.`));
      return Promise.resolve({ text: r.raw });
    },
  };
}
