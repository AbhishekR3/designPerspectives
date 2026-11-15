import { useEffect, useState, useSyncExternalStore } from "react";
import { Modal } from "./fields";

/**
 * The app's own confirm and prompt dialogs, in place of the browser's window.confirm / window.prompt.
 * Call `confirmDialog` / `promptDialog` from anywhere (they return a promise); <DialogHost /> (rendered
 * once in App) shows them, one at a time, the rest wait in a queue.
 */

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  /** A destructive action: the confirm button is red. */
  danger?: boolean;
}

export interface PromptOptions {
  title: string;
  label?: string;
  initial?: string;
  placeholder?: string;
  confirmLabel?: string;
  /** Returns a message to show (and block confirming) when the trimmed value is not acceptable. */
  validate?(value: string): string | null;
}

type Request =
  | ({ kind: "confirm"; id: number; resolve(v: boolean): void } & ConfirmOptions)
  | ({ kind: "prompt"; id: number; resolve(v: string | null): void } & PromptOptions);

let queue: Request[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const current = () => queue[0] ?? null;

export function confirmDialog(o: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    queue = [...queue, { ...o, kind: "confirm", id: nextId++, resolve }];
    emit();
  });
}

/** Resolves with the trimmed value, or null when cancelled. */
export function promptDialog(o: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    queue = [...queue, { ...o, kind: "prompt", id: nextId++, resolve }];
    emit();
  });
}

export function DialogHost() {
  const req = useSyncExternalStore(subscribe, current);
  return req ? <DialogView key={req.id} req={req} /> : null;
}

function DialogView({ req }: { req: Request }) {
  const [value, setValue] = useState(req.kind === "prompt" ? (req.initial ?? "") : "");
  const trimmed = value.trim();
  const problem = req.kind === "prompt" && trimmed ? (req.validate?.(trimmed) ?? null) : null;
  const canConfirm = req.kind === "confirm" || (!!trimmed && !problem);

  const finish = (confirmed: boolean) => {
    queue = queue.filter((r) => r !== req);
    if (req.kind === "confirm") req.resolve(confirmed);
    else req.resolve(confirmed ? trimmed : null);
    emit();
  };
  const confirm = () => canConfirm && finish(true);

  // Enter confirms from anywhere in the dialog, except on a button (which then does its own thing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.isComposing || (e.target as HTMLElement).closest("button, textarea")) return;
      e.preventDefault();
      confirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <Modal title={req.title} onClose={() => finish(false)} testId="dialog">
      {req.kind === "confirm" && req.message && <p className="dialog-message">{req.message}</p>}
      {req.kind === "prompt" && (
        <label className="field">
          {req.label && <span>{req.label}</span>}
          <input
            type="text"
            autoFocus
            value={value}
            placeholder={req.placeholder}
            onChange={(e) => setValue(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            aria-invalid={problem ? true : undefined}
            data-testid="dialog-input"
          />
        </label>
      )}
      {problem && (
        <div className="dialog-error" role="alert">
          {problem}
        </div>
      )}
      <div className="modal-actions">
        <button onClick={() => finish(false)} data-testid="dialog-cancel">
          Cancel
        </button>
        <button
          className={req.kind === "confirm" && req.danger ? "danger" : "primary"}
          onClick={confirm}
          disabled={!canConfirm}
          data-autofocus={req.kind === "confirm" ? "" : undefined}
          data-testid="dialog-confirm"
        >
          {req.confirmLabel ?? "OK"}
        </button>
      </div>
    </Modal>
  );
}

/** "Delete "X" and the N element(s) inside it?" (the wording shared by every way to delete an element). */
export function confirmDeleteElement(el: { name: string; childCount: number }, opts: { connections?: boolean } = {}): Promise<boolean> {
  return confirmDialog({
    title: `Delete "${el.name}"${el.childCount ? ` and the ${el.childCount} element(s) inside it` : ""}?`,
    message: opts.connections ? "Its connections are deleted too." : undefined,
    confirmLabel: "Delete",
    danger: true,
  });
}

export const confirmDeleteRelationship = () =>
  confirmDialog({ title: "Delete this relationship?", message: "Flow steps that use it are removed too.", confirmLabel: "Delete", danger: true });
