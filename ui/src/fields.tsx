import { createContext, useContext, useEffect, useId, useRef, useState } from "react";

/** True in the side panel when the model shown cannot be changed by this person (see `state.readOnly`). */
export const ReadOnlyContext = createContext(false);
export const useReadOnly = () => useContext(ReadOnlyContext);

/**
 * A group of editing controls. When the panel is read-only every control inside is disabled (so the fields show
 * their values and cannot be changed), and the controls that add or remove something (marked `edit-only`) are hidden.
 */
export function Fields({ loose = false, className = "", children }: { loose?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <fieldset className={`fields${loose ? " loose" : ""}${className ? ` ${className}` : ""}`} disabled={useReadOnly()}>
      {children}
    </fieldset>
  );
}

/** Text input that saves on blur or Enter (Escape reverts). */
export function TextField({
  label,
  value,
  onCommit,
  multiline = false,
  rows = 3,
  placeholder,
  testId,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onCommit(v: string): void;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  testId?: string;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (autoFocus) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [autoFocus]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  const common = {
    ref,
    value: draft,
    placeholder,
    "data-testid": testId,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        commit();
        (e.target as HTMLElement).blur();
      } else if (e.key === "Escape") {
        setDraft(value);
        (e.target as HTMLElement).blur();
      }
    },
  };
  return (
    <label className="field">
      {label && <span>{label}</span>}
      {multiline ? <textarea rows={rows} {...common} /> : <input type="text" {...common} />}
    </label>
  );
}

/** True while any modal dialog is open. The global keyboard shortcuts check this and do nothing. */
export const dialogOpen = (): boolean => document.querySelector('[aria-modal="true"]') !== null;

/** True when the keyboard event is aimed at something the user types into (input, textarea, select, contenteditable, the code editor). */
export const isTyping = (target: EventTarget | null): boolean => target instanceof Element && target.closest("input, textarea, select, [contenteditable], .cm-editor") !== null;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/** Open dialogs, oldest first; only the last one reacts to Escape and Tab. */
const modalStack: object[] = [];

/**
 * A modal dialog: labelled for screen readers, focus moves in on open (to the element marked data-autofocus
 * or autoFocus, else the first control) and back to the previous element on close, Tab stays inside, and
 * Escape closes only the top dialog (the event stops there, so it does not also clear the canvas selection).
 */
export function Modal({ title, onClose, children, wide = false, testId }: { title: string; onClose(): void; children: React.ReactNode; wide?: boolean; testId?: string }) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Read while rendering, before any child effect (such as an autoFocus) moves the focus.
  const [opener] = useState(() => document.activeElement);

  useEffect(() => {
    const token = {};
    modalStack.push(token);
    const root = box.current!;
    const controls = () => [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!root.contains(document.activeElement)) {
      const all = controls();
      const target = root.querySelector<HTMLElement>("[data-autofocus]") ?? all.find((el) => !el.closest(".modal-head")) ?? all[0] ?? root;
      target.focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== token) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
      } else if (e.key === "Tab") {
        const all = controls();
        if (all.length === 0) {
          e.preventDefault();
          root.focus();
          return;
        }
        const first = all[0];
        const last = all[all.length - 1];
        const active = document.activeElement;
        if (!root.contains(active) || active === root) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        } else if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      modalStack.splice(modalStack.indexOf(token), 1);
      if (opener instanceof HTMLElement && opener !== document.body && opener.isConnected) opener.focus();
    };
  }, [opener]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={box} data-testid={testId}>
        <div className="modal-head">
          <h2 id={titleId} data-testid={testId ? `${testId}-title` : undefined}>
            {title}
          </h2>
          <button className="icon" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Technology as tags: pick from known technologies (type to filter) or add a new one. */
export function TagInput({
  label,
  value,
  suggestions,
  onChange,
  testId,
}: {
  label: string;
  value: string[];
  suggestions: string[];
  onChange(v: string[]): void;
  testId?: string;
}) {
  const [text, setText] = useState("");
  const listId = useRef(`tags-${Math.random().toString(36).slice(2)}`).current;
  const add = (t: string) => {
    const v = t.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setText("");
  };
  return (
    <div className="field" data-testid={testId}>
      <span>{label}</span>
      <div className="chips">
        {value.map((t) => (
          <span className="chip" key={t}>
            {t}
            <button className="icon edit-only" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>
              ×
            </button>
          </span>
        ))}
        <input
          className="chip-input edit-only"
          list={listId}
          value={text}
          placeholder={value.length ? "Add…" : "Add a technology…"}
          onChange={(e) => {
            const v = e.target.value;
            setText(v);
            // Picking a suggestion from the list adds it at once.
            if (suggestions.includes(v) && !value.includes(v)) add(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(text);
            } else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => add(text)}
          data-testid={testId ? `${testId}-input` : undefined}
        />
        <datalist id={listId}>
          {suggestions.filter((s) => !value.includes(s)).map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
    </div>
  );
}

/** A collapsible group in the object panel. */
export function Section({ title, count, children, footer, defaultOpen = false, testId }: { title: string; count?: number; children: React.ReactNode; /** Shown below the controls, and usable also when the panel is read-only (a button that opens something). */ footer?: React.ReactNode; defaultOpen?: boolean; testId?: string }) {
  const [open, setOpen] = useState(defaultOpen || (count ?? 0) > 0);
  return (
    <section className="p-section" data-testid={testId}>
      <button className="p-section-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{open ? "▾" : "▸"}</span> {title}
        {count ? <span className="count">{count}</span> : null}
      </button>
      {open && (
        <div className="p-section-body">
          <Fields>{children}</Fields>
          {footer}
        </div>
      )}
    </section>
  );
}
