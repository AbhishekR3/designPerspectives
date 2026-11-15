import { useSyncExternalStore, type ReactNode } from "react";
import { Icon } from "./icons";

/**
 * One way to report results. An error stays until it is dismissed or replaced (there is one error slot);
 * a success disappears after a few seconds. `useModel` keeps its request errors in the same slot, so
 * there is a single visible mechanism: <Toasts /> (rendered once in App).
 */

/** A button offered with an error, such as "Retry". */
export interface ErrorAction {
  label: string;
  run(): void;
}

interface Snapshot {
  error: string | null;
  errorAction: ErrorAction | null;
  successes: { id: number; message: string; kind: "success" | "info" }[];
}

const SUCCESS_MS = 3000;
let snap: Snapshot = { error: null, errorAction: null, successes: [] };
let nextId = 1;
const listeners = new Set<() => void>();

function set(next: Partial<Snapshot>) {
  snap = { ...snap, ...next };
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const getSnapshot = () => snap;

const setError = (message: string | null, action: ErrorAction | null = null) => {
  if (snap.error !== message || snap.errorAction !== action) set({ error: message, errorAction: message === null ? null : action });
};

export const notify = {
  error: (message: string, action?: ErrorAction) => setError(message, action ?? null),
  clearError: () => setError(null),
  success: (message: string) => toast(message, "success"),
  /** A short notice that is not an error: it disappears by itself, like a success. */
  info: (message: string) => toast(message, "info"),
};

function toast(message: string, kind: "success" | "info") {
  const id = nextId++;
  set({ successes: [...snap.successes, { id, message, kind }] });
  window.setTimeout(() => set({ successes: snap.successes.filter((s) => s.id !== id) }), SUCCESS_MS);
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Await an action; on failure show the error and return undefined. */
export async function run<T>(action: () => Promise<T>, opts?: { success?: string }): Promise<T | undefined> {
  try {
    const value = await action();
    if (opts?.success) notify.success(opts.success);
    return value;
  } catch (e) {
    notify.error(errorMessage(e));
    return undefined;
  }
}

/** The current error and a setter for it (null clears it; an optional action is offered as a button). */
export function useErrorSlot(): [string | null, (message: string | null, action?: ErrorAction | null) => void] {
  const { error } = useSyncExternalStore(subscribe, getSnapshot);
  return [error, setError];
}

/** The toast host: `children` (such as the read-only banner) are shown above the toasts. */
export function Toasts({ children }: { children?: ReactNode }) {
  const { error, errorAction, successes } = useSyncExternalStore(subscribe, getSnapshot);
  if (!children && !error && successes.length === 0) return null;
  return (
    <div className="hud top-center">
      {children}
      {successes.map((s) => (
        <div className={`float toast ${s.kind}`} role="status" key={s.id} data-testid={`toast-${s.kind}`}>
          <span className="toast-msg">{s.message}</span>
        </div>
      ))}
      {error && (
        <div className="float toast error" role="alert" data-testid="error">
          <span className="toast-msg">{error}</span>
          {errorAction && (
            <button className="ghost" onClick={() => errorAction.run()} data-testid="error-action">
              {errorAction.label}
            </button>
          )}
          <button className="ghost icon" onClick={() => notify.clearError()} aria-label="Dismiss">
            <Icon name="close" size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
