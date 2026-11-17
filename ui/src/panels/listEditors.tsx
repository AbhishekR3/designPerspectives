/** The shared list editors of the property panels: rows edited in place (notes, details, trade-offs,
 *  usage, sensitive data, connections, examples) and the value lists (characteristics, cost, linked work). */
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { errorMessage, notify } from "../common/notify";
import { RATING_COLORS, formatMoney } from "../colourOverlays";
import { TextField } from "./formParts";
import {
  type AppState,
  type CharacteristicDef,
  type CostItem,
  type DetailTable,
  type ElementSummary,
  type Rating,
  type Relationship,
  type SensitiveItem,
  type Tradeoff,
  type Usage,
  type WorkItem,
} from "../types";
import { sameKeys, type Common } from "./panelProps";

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

// ------------------------------------------------------------------ value lists (characteristics, cost, linked work)

export function CharacteristicsEditor({ rows, defs, onSave }: { rows: Rating[]; defs: CharacteristicDef[]; onSave(r: Rating[]): void }) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  useEffect(() => setNotes(Object.fromEntries(rows.map((r) => [r.name, r.note ?? ""]))), [rows]);
  const put = (name: string, patch: Partial<Rating>) => {
    const has = rows.some((r) => r.name === name);
    onSave(has ? rows.map((r) => (r.name === name ? { ...r, ...patch } : r)) : [...rows, { name, ...patch }]);
  };
  const unrated = defs.filter((d) => !rows.some((r) => r.name === d.name));
  const order = new Map(defs.map((d, i) => [d.name, i]));
  const sorted = [...rows].sort((a, b) => (order.get(a.name) ?? 99) - (order.get(b.name) ?? 99));
  return (
    <div data-testid="characteristics">
      {sorted.map((r) => (
        <div className="char-row" key={r.name}>
          <div className="row">
            <span className="char-name" title={defs.find((d) => d.name === r.name)?.description}>
              {r.name}
            </span>
            <span className="stars" role="radiogroup" aria-label={`${r.name} rating`}>
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  className={`star${(r.rating ?? 0) >= v ? " on" : ""}`}
                  style={(r.rating ?? 0) >= v ? { color: RATING_COLORS[r.rating!] } : undefined}
                  onClick={() => put(r.name, { rating: r.rating === v ? undefined : v })}
                  role="radio"
                  aria-checked={r.rating === v}
                  aria-label={`${v} of 5`}
                  title={`${v} of 5`}
                  data-testid={`rate-${r.name}-${v}`}
                >
                  ★
                </button>
              ))}
            </span>
            <button
              className={`tiny${r.driving ? " on" : ""}`}
              onClick={() => put(r.name, { driving: !r.driving })}
              title="A driving characteristic: one this object must be good at"
              aria-pressed={!!r.driving}
            >
              Driving
            </button>
            <button className="icon edit-only" aria-label={`Remove ${r.name}`} title={`Remove ${r.name}`} onClick={() => onSave(rows.filter((x) => x.name !== r.name))}>
              ×
            </button>
          </div>
          <input
            className={`small${notes[r.name] ? "" : " edit-only"}`}
            value={notes[r.name] ?? ""}
            placeholder="Why this rating? (optional)"
            onChange={(e) => setNotes({ ...notes, [r.name]: e.target.value })}
            onBlur={() => (notes[r.name] ?? "") !== (r.note ?? "") && put(r.name, { note: notes[r.name] })}
          />
        </div>
      ))}
      {unrated.length > 0 && (
        <select className="edit-only" value="" onChange={(e) => e.target.value && put(e.target.value, { rating: 3 })} data-testid="char-add-rating">
          <option value="">+ Rate a characteristic…</option>
          {unrated.map((d) => (
            <option key={d.name} value={d.name} title={d.description}>
              {d.name}
            </option>
          ))}
        </select>
      )}
      <p className="muted small edit-only">1: weak · 5: one of its strongest features. Driving: one it must be good at.</p>
    </div>
  );
}

/** Monthly cost line items; the total of a system or container includes everything inside it. */
export function CostEditor({ element, currency, onSave }: { element: ElementSummary; currency: string; onSave(r: CostItem[]): void }) {
  const inside = Math.round((element.costRollup - element.costTotal) * 100) / 100;
  return (
    <div data-testid="cost">
      <Rows<CostItem>
        rows={element.cost}
        blank={{ item: "", monthly: 0, note: "" }}
        onSave={(r) =>
          !sameKeys(
            r.filter((x) => x.item.trim()),
            element.cost,
          ) && onSave(r.filter((x) => x.item.trim() || x.monthly))
        }
        addLabel="+ Add cost line"
        testId="cost-rows"
        render={(r, set, commit) => (
          <div className="stack">
            <div className="row">
              <input value={r.item} placeholder="What (e.g. 3 VMs, licence)" onChange={(e) => set({ item: e.target.value })} onBlur={commit} />
              <input
                type="number"
                min={0}
                step="any"
                value={r.monthly}
                onChange={(e) => set({ monthly: Number(e.target.value) })}
                onBlur={commit}
                aria-label={`Monthly cost in ${currency}`}
                style={{ width: 90, flex: "none" }}
              />
            </div>
            <input className="small" value={r.note ?? ""} placeholder="Note (optional)" onChange={(e) => set({ note: e.target.value })} onBlur={commit} />
          </div>
        )}
      />
      <div className="cost-sum small">
        <div>
          This object: <strong>{formatMoney(element.costTotal, currency)}/mo</strong>
        </div>
        {inside > 0 && (
          <div>
            Inside it: {formatMoney(inside, currency)}/mo · Total: <strong>{formatMoney(element.costRollup, currency)}/mo</strong>
          </div>
        )}
      </div>
    </div>
  );
}

/** Security issues, pull requests, issues, backlog items and required updates linked to an object or line. */
export function WorkEditor({ rows, enums, onSave }: { rows: WorkItem[]; enums: AppState["enums"]; onSave(r: WorkItem[]): void }) {
  return (
    <Rows<WorkItem>
      rows={rows}
      blank={{ type: "issue", title: "", url: "", status: "open", severity: "" }}
      onSave={(r) =>
        !sameKeys(
          r.filter((x) => x.title.trim() || x.url?.trim()),
          rows,
        ) && onSave(r)
      }
      addLabel="+ Link work"
      testId="work"
      render={(r, set, commit) => (
        <div className="stack work-row">
          <div className="row">
            <select value={r.type} onChange={(e) => set({ type: e.target.value }, true)} aria-label="Type" data-testid="work-type">
              {enums.workTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <select value={r.status} onChange={(e) => set({ status: e.target.value }, true)} aria-label="Status" className={`status-${r.status}`}>
              {enums.workStatuses.map((st) => (
                <option key={st} value={st}>
                  {st.replace("-", " ")}
                </option>
              ))}
            </select>
            <select value={r.severity ?? ""} onChange={(e) => set({ severity: e.target.value || undefined }, true)} aria-label="Severity">
              <option value="">No severity</option>
              {enums.severities.map((sv) => (
                <option key={sv} value={sv}>
                  {sv}
                </option>
              ))}
            </select>
          </div>
          <input value={r.title} placeholder="Title, e.g. CVE-2026-1234 in TLS library" onChange={(e) => set({ title: e.target.value })} onBlur={commit} data-testid="work-title" />
          <div className="row">
            <input value={r.url ?? ""} placeholder="https:// link to the issue, PR or ticket" onChange={(e) => set({ url: e.target.value })} onBlur={commit} />
            {r.url && /^https?:\/\//i.test(r.url) && (
              <a href={r.url} target="_blank" rel="noreferrer noopener" title="Open the link" className="ext-link">
                ↗
              </a>
            )}
          </div>
        </div>
      )}
    />
  );
}

/** Editors for a sample payload and its format (relationship or stage). */
export function ExampleFields({
  example,
  format,
  onSave,
  testId,
  label = "Example data",
}: {
  example: string;
  format: string;
  onSave(patch: { example?: string; format?: string }): void;
  testId?: string;
  label?: string;
}) {
  return (
    <>
      <TextField label="Data format" value={format} placeholder="e.g. JSON event, CSV row, SQL" onCommit={(v) => onSave({ format: v })} testId={testId && `${testId}-format`} />
      <TextField label={label} value={example} multiline rows={6} placeholder='e.g. {"user_id": 42, "event": "login"}' onCommit={(v) => onSave({ example: v })} testId={testId} />
    </>
  );
}

const GH = /^https:\/\/github\.com\/[^/]+\/[^/]+\/(issues|pull)\/\d+/;

/** "Refresh from GitHub" under Linked work (DEC-059): every GitHub issue and pull request link of the shown version. */
export function WorkRefreshButton({ rows, mutate, readOnly }: { rows: WorkItem[]; mutate: Common["mutate"]; readOnly: boolean }) {
  const [busy, setBusy] = useState(false);
  if (readOnly || !rows.some((w) => w.url && GH.test(w.url))) return null;
  const run = async () => {
    setBusy(true);
    try {
      let msg = "";
      await mutate(async () => {
        const r = await api.refreshWork();
        msg = `Checked ${r.checked} GitHub link${r.checked === 1 ? "" : "s"}${r.usedCredential ? ` with ${r.usedCredential}` : " (no GitHub credential: public repositories only)"}: ${r.updated.length} status${r.updated.length === 1 ? "" : "es"} changed.`;
        if (r.failed.length) notify.error(`${r.failed.length} could not be read: ${r.failed.map((f) => `${f.url.replace("https://github.com/", "")} (${f.reason})`).join("; ")}`);
      });
      if (msg) notify.success(msg);
    } catch (e) {
      notify.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className="add" onClick={() => void run()} disabled={busy} title="Read the status of every GitHub issue and pull request linked in this model" data-testid="work-refresh">
      {busy ? "Asking GitHub…" : "↻ Refresh status from GitHub"}
    </button>
  );
}
