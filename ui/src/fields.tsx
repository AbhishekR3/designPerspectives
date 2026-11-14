import { useEffect, useRef, useState } from "react";

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

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose(): void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? " wide" : ""}`} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
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
            <button className="icon" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>
              ×
            </button>
          </span>
        ))}
        <input
          className="chip-input"
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
export function Section({ title, count, children, defaultOpen = false, testId }: { title: string; count?: number; children: React.ReactNode; defaultOpen?: boolean; testId?: string }) {
  const [open, setOpen] = useState(defaultOpen || (count ?? 0) > 0);
  return (
    <section className="p-section" data-testid={testId}>
      <button className="p-section-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{open ? "▾" : "▸"}</span> {title}
        {count ? <span className="count">{count}</span> : null}
      </button>
      {open && <div className="p-section-body">{children}</div>}
    </section>
  );
}
