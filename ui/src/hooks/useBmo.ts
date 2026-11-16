/** BMO from the UI (DEC-051): the status of BMO, and one run: preview what would be sent, send it, show the result. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "../api";
import { errorMessage } from "../common/notify";
import type { BmoPreview, BmoRunResult, BmoStatus, BmoTaskId, FieldError } from "../types";

/** What a BMO task is asked to work on: only these selectors are sent; the server builds the prompt and picks the model. */
export interface BmoRequest {
  task: BmoTaskId;
  container?: string;
  diagram?: string;
  element?: string;
  relationship?: string;
  lens?: string;
  level?: "c1" | "c2" | "c3";
  text?: string;
}

export function useBmoStatus(): { status: BmoStatus | null; error: string | null; reload(): void } {
  const [status, setStatus] = useState<BmoStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    api.bmo().then(
      (s) => live && (setStatus(s), setError(null)),
      (e) => live && setError(errorMessage(e)),
    );
    return () => {
      live = false;
    };
  }, [n]);
  return { status, error, reload: useCallback(() => setN((x) => x + 1), []) };
}

export type BmoPhase =
  | { name: "loading" }
  /** The server will not do this for this person here (turned off, role, a task that makes a draft): the reason. */
  | { name: "refused"; detail: string }
  | { name: "preview"; preview: BmoPreview; cancelled: boolean }
  | { name: "running"; preview: BmoPreview }
  | { name: "done"; result: BmoRunResult }
  | { name: "failed"; detail: string; errors: FieldError[]; pasteBack: string | null; stale: boolean };

const AbortLike = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

/** Preview a task when `active`, then send it once the person confirms. Closing (unmounting) aborts a run in flight. */
export function useBmoRun(request: BmoRequest, active: boolean) {
  const [phase, setPhase] = useState<BmoPhase>({ name: "loading" });
  const abort = useRef<AbortController | null>(null);
  const [again, setAgain] = useState(0);
  const key = useMemo(() => JSON.stringify(request), [request]);

  useEffect(() => {
    if (!active) return;
    const ctl = new AbortController();
    setPhase({ name: "loading" });
    api.bmoPreview({ ...(JSON.parse(key) as BmoRequest) }, ctl.signal).then(
      (preview) => setPhase({ name: "preview", preview, cancelled: false }),
      (e) => {
        if (AbortLike(e)) return;
        if (e instanceof ApiError && (e.status === 403 || e.status === 409 || e.status === 422)) setPhase({ name: "refused", detail: e.message });
        else setPhase({ name: "failed", detail: errorMessage(e), errors: [], pasteBack: null, stale: false });
      },
    );
    return () => ctl.abort();
  }, [key, active, again]);

  useEffect(() => () => abort.current?.abort(), []);

  const send = useCallback(
    async (preview: BmoPreview) => {
      const ctl = new AbortController();
      abort.current = ctl;
      setPhase({ name: "running", preview });
      try {
        const result = await api.bmoRun({ ...(JSON.parse(key) as BmoRequest), hash: preview.hash }, ctl.signal);
        setPhase({ name: "done", result });
        return result;
      } catch (e) {
        if (AbortLike(e)) setPhase({ name: "preview", preview, cancelled: true });
        else {
          const data = e instanceof ApiError ? e.data : null;
          setPhase({
            name: "failed",
            detail: errorMessage(e),
            errors: Array.isArray(data?.errors) ? (data!.errors as FieldError[]) : [],
            pasteBack: typeof data?.pasteBack === "string" ? data.pasteBack : null,
            stale: e instanceof ApiError && e.status === 409,
          });
        }
        return null;
      } finally {
        abort.current = null;
      }
    },
    [key],
  );
  const cancel = useCallback(() => abort.current?.abort(), []);
  const previewAgain = useCallback(() => setAgain((n) => n + 1), []);
  return { phase, send, cancel, previewAgain };
}
