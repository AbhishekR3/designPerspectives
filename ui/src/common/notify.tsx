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

/** One line of the notification log (the bell): an error or a notice shown in this tab, newest first. Kept for the session, in memory only. */
export interface LogEntry {
  id: number;
  kind: "error" | "info";
  message: string;
  /** When it was shown (ms since the epoch). */
  at: number;
}

interface Snapshot {
  error: string | null;
  errorAction: ErrorAction | null;
  successes: { id: number; message: string; kind: "success" | "info" }[];
  /** Errors and notices shown so far, newest first; a message gone from the screen can still be read here. */
  log: LogEntry[];
  /** How many log entries came in since the log was last opened. */
  unread: number;
}

const SUCCESS_MS = 3000;
const LOG_MAX = 50;
let snap: Snapshot = { error: null, errorAction: null, successes: [], log: [], unread: 0 };
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

/** While the session has ended (the sign-in page is shown) the failures of the calls that ended it are not reported. */
let suspended = false;

/** Add a line to the log. The same message as the newest line is not added again (a retry that fails the same way). */
function logged(kind: LogEntry["kind"], message: string): Pick<Snapshot, "log" | "unread"> {
  if (snap.log[0]?.kind === kind && snap.log[0].message === message) return { log: snap.log, unread: snap.unread };
  return { log: [{ id: nextId++, kind, message, at: Date.now() }, ...snap.log].slice(0, LOG_MAX), unread: snap.unread + 1 };
}

const setError = (message: string | null, action: ErrorAction | null = null) => {
  if (suspended && message !== null) return;
  if (snap.error !== message || snap.errorAction !== action)
    set({ error: message, errorAction: message === null ? null : action, ...(message !== null && snap.error !== message ? logged("error", message) : {}) });
};

export const notify = {
  error: (message: string, action?: ErrorAction) => setError(message, action ?? null),
  /** Stop (true) or resume (false) reporting errors; stopping also clears the one shown. */
  suspend: (on: boolean) => {
    suspended = on;
    if (on) setError(null);
  },
  clearError: () => setError(null),
  success: (message: string) => toast(message, "success"),
  /** A short notice that is not an error: it disappears by itself, like a success. */
  info: (message: string) => toast(message, "info"),
  /** The log was opened: nothing in it is new any more. */
  markRead: () => snap.unread && set({ unread: 0 }),
  clearLog: () => set({ log: [], unread: 0 }),
};

/** The notification log and how many of its lines are new (for the bell). */
export function useNotificationLog(): { log: LogEntry[]; unread: number } {
  const { log, unread } = useSyncExternalStore(subscribe, getSnapshot);
  return { log, unread };
}

function toast(message: string, kind: "success" | "info") {
  const id = nextId++;
  // A notice is kept in the log (it is gone from the screen in seconds); a success is not: it only confirms what the person just did.
  set({ successes: [...snap.successes, { id, message, kind }], ...(kind === "info" ? logged("info", message) : {}) });
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
    <div className="toasts">
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
          <button className="ghost icon" onClick={() => notify.clearError()} aria-label="Dismiss" title="Dismiss">
            <Icon name="close" size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
