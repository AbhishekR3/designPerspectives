import type { TestCall, TestingState } from "../types";
import type { TestingActions } from "../hooks/useTesting";

/** The call that Continue, Step and Drop act on: the selected one when it is paused, else the oldest paused one. */
export function pausedTarget(state: TestingState | null, selectedId: string | null): TestCall | null {
  if (!state) return null;
  const held = state.held.map((id) => state.calls.find((c) => c.id === id)).filter((c): c is TestCall => !!c && (c.state === "held-request" || c.state === "held-response"));
  return held.find((c) => c.id === selectedId) ?? held[0] ?? null;
}

/** Let a paused call go on as it is (`step`: and pause the next call or reply that arrives). */
export function continueCall(call: TestCall, actions: TestingActions, step = false) {
  return actions.release(call.id, call.state === "held-response" ? { do: "continue-response", ...(step ? { step: true } : {}) } : { do: "continue", ...(step ? { step: true } : {}) });
}

export const dropCall = (call: TestCall, actions: TestingActions) => actions.release(call.id, { do: "drop" });

/** A short word for what a call is doing. */
export const CALL_STATE_LABEL: Record<TestCall["state"], string> = {
  "held-request": "paused",
  "held-response": "paused at reply",
  forwarded: "waiting",
  done: "done",
  dropped: "dropped",
  replied: "answered by you",
  passed: "passed",
  failed: "failed",
};

export const isPaused = (c: TestCall) => c.state === "held-request" || c.state === "held-response";
