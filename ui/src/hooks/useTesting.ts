import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "../api";
import { errorMessage, notify } from "../common/notify";
import type { Breakpoint, CallMessage, ReleaseAction, TestCallDetail, TestingState, Watch } from "../types";

/** A short random id for a breakpoint or a watch (the server accepts letters, digits, "_" and "-", up to 40). */
export const shortId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = window.setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (window.clearTimeout(t), resolve()), { once: true });
  });

/**
 * The system testing mode's server state: it loads `GET /testing`, then waits on `/testing/events` (a long poll that
 * answers when the state changes) for as long as the mode is on. A 403 (a viewer, a read-only server, a browser that is not
 * on this machine) stops the loop and sets `denied` to the server's message.
 */
export function useTesting(on: boolean, canTest: boolean) {
  const [state, setState] = useState<TestingState | null>(null);
  const [denied, setDenied] = useState<string | null>(null);
  const [selectedCall, setSelectedCall] = useState<string | null>(null);
  const [detail, setDetail] = useState<TestCallDetail | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!on) {
      setState(null);
      setDenied(null);
      setSelectedCall(null);
      return;
    }
    const ac = new AbortController();
    const { signal } = ac;
    void (async () => {
      let since = -1;
      while (!signal.aborted) {
        try {
          const s = since < 0 ? await api.testing(signal) : await api.testingEvents(since, signal);
          if (signal.aborted) return;
          since = s.version;
          setDenied(null);
          setState((prev) => (prev && prev.version === s.version ? prev : s));
          // Without the right to test there is nothing to wait for: one look was enough to learn why.
          if (!canTest) return;
        } catch (e) {
          if (signal.aborted) return;
          if (e instanceof ApiError && e.status === 403) {
            setDenied(e.message);
            return;
          }
          await sleep(2000, signal);
        }
      }
    })();
    return () => ac.abort();
  }, [on, canTest]);

  // A call that becomes paused is selected when nothing else is.
  const seenHeld = useRef<string[]>([]);
  useEffect(() => {
    const held = state?.held ?? [];
    const fresh = held.filter((id) => !seenHeld.current.includes(id));
    seenHeld.current = held;
    if (fresh.length) setSelectedCall((cur) => cur ?? fresh[0]);
  }, [state]);

  // The request and reply of the selected call, asked again whenever its state changes.
  // (A selected call that the run log no longer has, because it was cleared, simply shows nothing.)
  const selectedState = state?.calls.find((c) => c.id === selectedCall)?.state;
  useEffect(() => {
    if (!on || !selectedCall || !selectedState) {
      setDetail(null);
      return;
    }
    let live = true;
    api.testingCall(selectedCall).then(
      (d) => live && setDetail(d),
      () => live && setDetail(null),
    );
    return () => {
      live = false;
    };
  }, [on, selectedCall, selectedState]);

  const refresh = useCallback(async () => {
    try {
      const s = await api.testing();
      setState(s);
    } catch {
      /* the loop shows the problem */
    }
  }, []);

  /** Run a call to the server; an error is shown as it is. A 409 (someone else released the call) is a notice, and the state is read again. */
  const attempt = useCallback(
    async <T>(work: () => Promise<T>): Promise<T | undefined> => {
      try {
        return await work();
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          notify.info(e.message);
          void refresh();
        } else notify.error(errorMessage(e));
        return undefined;
      }
    },
    [refresh],
  );

  const actions = useMemo(
    () => ({
      openPoint: (relationshipId: string, stageId?: string) => attempt(() => api.openPoint(relationshipId, stageId)),
      /** Like `openPoint`, but a refusal is returned to the caller (the stage panel shows it) and not shown as an error. */
      tryOpenPoint: async (relationshipId: string, stageId?: string): Promise<{ error: string } | undefined> => {
        try {
          await api.openPoint(relationshipId, stageId);
          return undefined;
        } catch (e) {
          return { error: errorMessage(e) };
        }
      },
      startSaved: async () => {
        const r = await attempt(() => api.startSavedPoints());
        if (r && r.failed.length) notify.error(`Could not start: ${r.failed.join(", ")}`);
      },
      closePoint: (id: string) => attempt(() => api.closePoint(id)),
      setBreakpoints: (list: Breakpoint[]) => attempt(() => api.setBreakpoints(list)),
      setWatches: (list: Watch[]) => attempt(() => api.setWatches(list)),
      setHoldSeconds: (n: number) => attempt(() => api.setTestingOptions(n)),
      step: (on = true) => attempt(() => api.testingStep(on)),
      release: (id: string, action: ReleaseAction) => attempt(() => api.releaseCall(id, action)),
      releaseAll: () => attempt(() => api.releaseAll()),
      resend: async (id: string, request?: Partial<CallMessage>) => {
        const r = await attempt(() => api.resendCall(id, request));
        if (r) setSelectedCall(r.id);
      },
      clearCalls: () => attempt(() => api.clearCalls()),
    }),
    [attempt],
  );

  return { state, denied, selectedCall, setSelectedCall, detail, actions };
}

export type TestingActions = ReturnType<typeof useTesting>["actions"];
