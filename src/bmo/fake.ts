/**
 * A fake backend for tests and end-to-end runs: canned answers by task ID, no model, no network. It records
 * every request, so a test can check exactly what would have been sent. Selected only by server options in
 * code, never from a request.
 */

import { BmoError, type Backend, type BmoRequest } from "./backend.js";

export type FakeAnswer = string | ((req: BmoRequest) => string);

export interface FakeBackend extends Backend {
  /** Every request received, in order. */
  readonly calls: BmoRequest[];
}

export function fakeBackend(answers: Record<string, FakeAnswer>, id = "fake"): FakeBackend {
  const calls: BmoRequest[] = [];
  return {
    id,
    calls,
    run(req) {
      calls.push(req);
      if (req.signal?.aborted) return Promise.reject(new BmoError("backend", "The run was cancelled."));
      const a = req.task !== undefined && Object.prototype.hasOwnProperty.call(answers, req.task) ? answers[req.task] : undefined;
      if (a === undefined) return Promise.reject(new BmoError("backend", `The fake backend has no answer for task "${req.task ?? "(none)"}".`));
      try {
        const text = typeof a === "function" ? a(req) : a;
        return Promise.resolve({ text, usage: { inputTokens: Math.ceil((req.system.length + req.user.length) / 4), outputTokens: Math.ceil(text.length / 4) } });
      } catch (e) {
        return Promise.reject(e instanceof Error ? e : new Error(String(e)));
      }
    },
  };
}
