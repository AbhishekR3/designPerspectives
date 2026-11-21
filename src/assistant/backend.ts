/**
 * BMO's backend interface (COD-02): BMO has no model of its own; it reaches an LLM through a `Backend`.
 * A backend gets one fixed request (system text, user text, an optional JSON Schema for the answer, an
 * output cap) and returns the answer as text. It never sees files, tools, endpoints chosen by a model or
 * anything else: what goes is exactly the prompt the person was shown (`preview` in tasks.ts).
 *
 * Backends: `handoffBackend.ts` (no call: a person runs the prompt in their own coding agent and brings back
 * `result.json`), `fakeBackend.ts` (canned answers for tests). The direct providers come later (stage S8).
 */

import { createHash } from "node:crypto";

export interface BmoRequest {
  /** Fixed instruction text of the task (no repository, model or user content). */
  system: string;
  /** The data blocks (repository excerpts, model text, the user's text), each fenced and redacted. */
  user: string;
  /** JSON Schema the answer must follow (import files, decisions); providers that support it enforce it. */
  schema?: object;
  maxOutputTokens: number;
  signal?: AbortSignal;
  /** The task this request is for (`import-level`, `explain`, ...). Informational: the fake backend answers by it. */
  task?: string;
}

export interface BmoResult {
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  /** The model that answered, when the provider says (it can differ from the one asked for after a fallback). */
  model?: string;
}

export interface Backend {
  id: string;
  run(req: BmoRequest): Promise<BmoResult>;
}

/**
 * Why BMO did not produce a result:
 * - `off`: BMO (or this backend) is not enabled, or there is nothing to read yet (no `result.json`);
 * - `refused`: the request is not allowed as it stands (the prompt changed since it was shown, unknown task);
 * - `invalid-output`: the answer cannot be used at all (empty, too long);
 * - `backend`: the backend failed (network, provider error);
 * - `too-large`: the input is over a limit.
 * The message is plain text for a person and never holds a secret or a provider's raw response headers.
 */
export type BmoErrorKind = "off" | "refused" | "invalid-output" | "backend" | "too-large";

export class BmoError extends Error {
  constructor(
    readonly kind: BmoErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "BmoError";
  }
}

/** Rough token count: bytes ÷ 4 (a rule of thumb, not a tokenizer). */
export const estimateTokens = (text: string): number => Math.ceil(Buffer.byteLength(text, "utf-8") / 4);

/** The hash that ties a run to the preview a person saw: sha1 over the system and user text. */
export const promptHash = (system: string, user: string): string => createHash("sha1").update(system, "utf-8").update("\u0000", "utf-8").update(user, "utf-8").digest("hex");

/** A backend failure as a `BmoError`, with the message cut short (providers can echo long bodies). */
export function asBmoError(e: unknown): BmoError {
  if (e instanceof BmoError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  return new BmoError("backend", `The backend failed: ${msg.slice(0, 300)}`);
}
