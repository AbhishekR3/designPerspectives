import { useEffect, useRef, useState } from "react";
import { TextField } from "./fields";
import { type AppState, type DetailTable, type Relationship, type SensitiveItem, type Tradeoff, type Usage } from "../types";
import { sameKeys } from "./common";

// ------------------------------------------------------------------ small editors

/** A list of rows edited in place. Rows are saved when a field loses focus or a choice is made. */
export function Rows<T extends object>({
  rows,
  blank,
  onSave,
  render,
  addLabel,
  testId,
}: {
  rows: T[];
  blank: T;
  onSave(rows: T[]): void;
  render(row: T, set: (patch: Partial<T>, commit?: boolean) => void, commit: () => void): React.ReactNode;
  addLabel: string;
  testId: string;
}) {
  const [draft, setDraftState] = useState<T[]>(rows);
  // Saves read the latest rows from this ref: a field can lose focus before React re-renders
  // after its last keystroke, and saving from the render's copy would drop that keystroke.
  const latest = useRef<T[]>(rows);
  const setDraft = (next: T[]) => {
    latest.current = next;
    setDraftState(next);
  };
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Do not replace rows while one of them is being edited: a refresh from the previous save can
    // arrive between keystrokes and would undo what was just typed. The next save brings it back.
    const active = document.activeElement;
    if (active && box.current?.contains(active) && active.matches("input, textarea, select")) return;
    latest.current = rows;
    setDraftState(rows);
  }, [rows]);
  const update = (i: number, patch: Partial<T>, commit = false) => {
    const next = latest.current.map((r, j) => (j === i ? { ...r, ...patch } : r));
    setDraft(next);
    if (commit) onSave(next);
  };
  return (
    <div data-testid={testId} ref={box}>
      {draft.map((r, i) => (
        <div className="rowed" key={i}>
          {render(
            r,
            (patch, commit) => update(i, patch, commit),
            () => onSave(latest.current),
          )}
          <button className="icon edit-only" aria-label="Remove" title="Remove" onClick={() => onSave(latest.current.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      <button className="edit-only" onClick={() => setDraft([...latest.current, { ...blank }])} data-testid={`${testId}-add`}>
        {addLabel}
      </button>
    </div>
  );
}

export function NotesEditor({ value, onSave }: { value: string; onSave(v: string): void }) {
  return <TextField label="" value={value} multiline rows={5} placeholder="Free-form notes about this object…" onCommit={onSave} testId="field-notes" />;
}

const DETAIL_TEMPLATES: Record<string, DetailTable> = {
  "Connection details": {
    title: "Connection",
    columns: ["Setting", "Value"],
    rows: [
      ["Host", ""],
      ["Port", ""],
      ["Database / service", ""],
      ["Credentials", "Where the secret is kept (do not type passwords)"],
    ],
  },
  Columns: { title: "Table", columns: ["Column", "Type", "Nullable", "Notes"], rows: [["", "", "", ""]] },
  "Blank table": { title: "Details", columns: ["Name", "Value"], rows: [["", ""]] },
};

/** Free tables of extra information: connection details, a database's columns, anything tabular. */
export function DetailsEditor({ tables, onSave }: { tables: DetailTable[]; onSave(t: DetailTable[]): void }) {
  const [draft, setDraft] = useState<DetailTable[]>(tables);
  useEffect(() => setDraft(tables), [tables]);
  const set = (i: number, t: DetailTable) => setDraft(draft.map((x, j) => (j === i ? t : x)));
  const commit = (next = draft) => !sameKeys(next, tables) && onSave(next);
  return (
    <div data-testid="details">
      <p className="muted small edit-only">Do not store passwords or keys here; name where they are kept.</p>
      {draft.map((t, i) => (
        <div className="detail-table" key={i} data-testid={`detail-${i}`}>
          <div className="row">
            <input className="detail-title" value={t.title} onChange={(e) => set(i, { ...t, title: e.target.value })} onBlur={() => commit()} aria-label="Table title" />
            <button className="icon edit-only" aria-label="Remove table" title="Remove table" onClick={() => commit(draft.filter((_, j) => j !== i))}>
              ×
            </button>
          </div>
          <table>
            <thead>
              <tr>
                {t.columns.map((c, k) => (
                  <th key={k}>
                    <input value={c} onChange={(e) => set(i, { ...t, columns: t.columns.map((x, m) => (m === k ? e.target.value : x)) })} onBlur={() => commit()} aria-label="Column name" />
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((cell, k) => (
                    <td key={k}>
                      <input value={cell} onChange={(e) => set(i, { ...t, rows: t.rows.map((x, m) => (m === ri ? x.map((y, n) => (n === k ? e.target.value : y)) : x)) })} onBlur={() => commit()} />
                    </td>
                  ))}
                  <td>
                    <button
                      className="icon edit-only"
                      aria-label="Remove row"
                      title="Remove row"
                      onClick={() => commit(draft.map((x, j) => (j === i ? { ...t, rows: t.rows.filter((_, m) => m !== ri) } : x)))}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row edit-only">
            <button onClick={() => set(i, { ...t, rows: [...t.rows, t.columns.map(() => "")] })} data-testid={`detail-${i}-add-row`}>
              + Row
            </button>
            <button onClick={() => commit(draft.map((x, j) => (j === i ? { ...t, columns: [...t.columns, "New column"], rows: t.rows.map((r) => [...r, ""]) } : x)))}>+ Column</button>
          </div>
        </div>
      ))}
      <label className="field inline edit-only">
        <span>Add</span>
        <select value="" onChange={(e) => e.target.value && commit([...draft, structuredClone(DETAIL_TEMPLATES[e.target.value])])} data-testid="detail-template">
          <option value="">Table…</option>
          {Object.keys(DETAIL_TEMPLATES).map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function TradeoffsEditor({ rows, onSave }: { rows: Tradeoff[]; onSave(r: Tradeoff[]): void }) {
  return (
    <Rows<Tradeoff>
      rows={rows}
      blank={{ kind: "benefit", text: "" }}
      onSave={(r) =>
        !sameKeys(
          r.filter((x) => x.text.trim()),
          rows,
        ) && onSave(r)
      }
      addLabel="+ Add tradeoff"
      testId="tradeoffs"
      render={(r, set, commit) => (
        <>
          <select value={r.kind} onChange={(e) => set({ kind: e.target.value as Tradeoff["kind"] }, true)} aria-label="Kind">
            <option value="benefit">Benefit</option>
            <option value="cost">Cost</option>
            <option value="risk">Risk</option>
          </select>
          <input value={r.text} placeholder="What is the tradeoff?" onChange={(e) => set({ text: e.target.value })} onBlur={commit} />
        </>
      )}
    />
  );
}

export function UsageEditor({ rows, frequencies, onSave }: { rows: Usage[]; frequencies: string[]; onSave(r: Usage[]): void }) {
  return (
    <Rows<Usage>
      rows={rows}
      blank={{ users: "", frequency: "daily", volume: "" }}
      onSave={(r) =>
        !sameKeys(
          r.filter((x) => x.users.trim()),
          rows,
        ) && onSave(r)
      }
      addLabel="+ Add user group"
      testId="usage"
      render={(r, set, commit) => (
        <div className="stack">
          <input value={r.users} placeholder="Who uses it?" onChange={(e) => set({ users: e.target.value })} onBlur={commit} />
          <div className="row">
            <select value={r.frequency} onChange={(e) => set({ frequency: e.target.value }, true)} aria-label="How often">
              {frequencies.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <input value={r.volume ?? ""} placeholder="Volume (optional)" onChange={(e) => set({ volume: e.target.value })} onBlur={commit} />
          </div>
        </div>
      )}
    />
  );
}

export function SensitiveEditor({ rows, levels, onSave }: { rows: SensitiveItem[]; levels: string[]; onSave(r: SensitiveItem[]): void }) {
  return (
    <Rows<SensitiveItem>
      rows={rows}
      blank={{ item: "", level: "confidential" }}
      onSave={(r) =>
        !sameKeys(
          r.filter((x) => x.item.trim()),
          rows,
        ) && onSave(r)
      }
      addLabel="+ Add sensitive item"
      testId="sensitive"
      render={(r, set, commit) => (
        <>
          <input value={r.item} placeholder="Document or information" onChange={(e) => set({ item: e.target.value })} onBlur={commit} />
          <select value={r.level} onChange={(e) => set({ level: e.target.value }, true)} aria-label="Level">
            {levels.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </>
      )}
    />
  );
}

/** Ratings 1-5 of the architecture characteristics that matter for this object. */
export function ConnectionList({
  title,
  rels,
  other,
  inside,
  selfId,
  state,
  onReveal,
  testId,
}: {
  title: string;
  rels: Relationship[];
  other(r: Relationship): string;
  inside(r: Relationship): string;
  selfId: string;
  state: AppState;
  onReveal(id: string): void;
  testId: string;
}) {
  const byId = new Map(state.elements.map((e) => [e.id, e]));
  return (
    <div className="connections" data-testid={testId}>
      <h4>
        {title} <span className="count">{rels.length}</span>
      </h4>
      {rels.length === 0 && <div className="empty-note">None</div>}
      <ul>
        {rels.map((r) => {
          const o = byId.get(other(r));
          return (
            <li key={r.id}>
              <button className="link" onClick={() => onReveal(other(r))} title="Show this element">
                {o?.name ?? other(r)}
              </button>
              <div className="muted small">
                {r.description}
                {r.technologies.length > 0 && ` [${r.technologies.join(", ")}]`}
                {inside(r) !== selfId && <> · via {byId.get(inside(r))?.name ?? inside(r)}</>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
