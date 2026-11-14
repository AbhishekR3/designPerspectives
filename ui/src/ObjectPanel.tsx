import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { CodePaths } from "./CodeParts";
import { Section, TagInput, TextField } from "./fields";
import { RATING_COLORS, formatMoney, openWork } from "./overlays";
import { ShapeIcon } from "./shapes";
import { StylePanel } from "./StylePanel";
import {
  KIND_LABEL,
  type AppState,
  type CharacteristicDef,
  type CostItem,
  type Diagram,
  type Rating,
  type WorkItem,
  type DiagramNode,
  type EdgeLayout,
  type DetailTable,
  type ElementSummary,
  type Lens,
  type Relationship,
  type SensitiveItem,
  type Stage,
  type Tradeoff,
  type Usage,
} from "./types";

export { homeDiagramOf } from "./types";

export interface Common {
  state: AppState;
  diagram: Diagram;
  lens: Lens;
  mutate(fn: () => Promise<unknown>): Promise<boolean>;
  onSelect(sel: { type: "node" | "edge"; id: string } | null): void;
  onOpen(key: string): void;
  onReveal(elementId: string): void;
  onOpenFile(path: string): void;
  focusName: boolean;
}

// ------------------------------------------------------------------ small editors

/** A list of rows edited in place. Rows are saved when a field loses focus or a choice is made. */
function Rows<T extends object>({
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
  useEffect(() => {
    latest.current = rows;
    setDraftState(rows);
  }, [rows]);
  const update = (i: number, patch: Partial<T>, commit = false) => {
    const next = latest.current.map((r, j) => (j === i ? { ...r, ...patch } : r));
    setDraft(next);
    if (commit) onSave(next);
  };
  return (
    <div data-testid={testId}>
      {draft.map((r, i) => (
        <div className="rowed" key={i}>
          {render(r, (patch, commit) => update(i, patch, commit), () => onSave(latest.current))}
          <button className="icon" aria-label="Remove" onClick={() => onSave(latest.current.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      <button onClick={() => setDraft([...latest.current, { ...blank }])} data-testid={`${testId}-add`}>
        {addLabel}
      </button>
    </div>
  );
}

const sameKeys = <T,>(a: T[], b: T[]) => JSON.stringify(a) === JSON.stringify(b);

function NotesEditor({ value, onSave }: { value: string; onSave(v: string): void }) {
  return <TextField label="" value={value} multiline rows={5} placeholder="Free-form notes about this object…" onCommit={onSave} testId="field-notes" />;
}

const DETAIL_TEMPLATES: Record<string, DetailTable> = {
  "Connection details": { title: "Connection", columns: ["Setting", "Value"], rows: [["Host", ""], ["Port", ""], ["Database / service", ""], ["Credentials", "Where the secret is kept (do not type passwords)"]] },
  "Columns": { title: "Table", columns: ["Column", "Type", "Nullable", "Notes"], rows: [["", "", "", ""]] },
  "Blank table": { title: "Details", columns: ["Name", "Value"], rows: [["", ""]] },
};

/** Free tables of extra information: connection details, a database's columns, anything tabular. */
function DetailsEditor({ tables, onSave }: { tables: DetailTable[]; onSave(t: DetailTable[]): void }) {
  const [draft, setDraft] = useState<DetailTable[]>(tables);
  useEffect(() => setDraft(tables), [tables]);
  const set = (i: number, t: DetailTable) => setDraft(draft.map((x, j) => (j === i ? t : x)));
  const commit = (next = draft) => !sameKeys(next, tables) && onSave(next);
  return (
    <div data-testid="details">
      <p className="muted small">Do not store passwords or keys here; name where they are kept.</p>
      {draft.map((t, i) => (
        <div className="detail-table" key={i} data-testid={`detail-${i}`}>
          <div className="row">
            <input className="detail-title" value={t.title} onChange={(e) => set(i, { ...t, title: e.target.value })} onBlur={() => commit()} aria-label="Table title" />
            <button className="icon" aria-label="Remove table" onClick={() => commit(draft.filter((_, j) => j !== i))}>
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
                    <button className="icon" aria-label="Remove row" onClick={() => commit(draft.map((x, j) => (j === i ? { ...t, rows: t.rows.filter((_, m) => m !== ri) } : x)))}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row">
            <button onClick={() => set(i, { ...t, rows: [...t.rows, t.columns.map(() => "")] })} data-testid={`detail-${i}-add-row`}>
              + Row
            </button>
            <button onClick={() => commit(draft.map((x, j) => (j === i ? { ...t, columns: [...t.columns, "New column"], rows: t.rows.map((r) => [...r, ""]) } : x)))}>+ Column</button>
          </div>
        </div>
      ))}
      <label className="field inline">
        <span>Add</span>
        <select
          value=""
          onChange={(e) => e.target.value && commit([...draft, structuredClone(DETAIL_TEMPLATES[e.target.value])])}
          data-testid="detail-template"
        >
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

function TradeoffsEditor({ rows, onSave }: { rows: Tradeoff[]; onSave(r: Tradeoff[]): void }) {
  return (
    <Rows<Tradeoff>
      rows={rows}
      blank={{ kind: "benefit", text: "" }}
      onSave={(r) => !sameKeys(r.filter((x) => x.text.trim()), rows) && onSave(r)}
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

function UsageEditor({ rows, frequencies, onSave }: { rows: Usage[]; frequencies: string[]; onSave(r: Usage[]): void }) {
  return (
    <Rows<Usage>
      rows={rows}
      blank={{ users: "", frequency: "daily", volume: "" }}
      onSave={(r) => !sameKeys(r.filter((x) => x.users.trim()), rows) && onSave(r)}
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

function SensitiveEditor({ rows, levels, onSave }: { rows: SensitiveItem[]; levels: string[]; onSave(r: SensitiveItem[]): void }) {
  return (
    <Rows<SensitiveItem>
      rows={rows}
      blank={{ item: "", level: "confidential" }}
      onSave={(r) => !sameKeys(r.filter((x) => x.item.trim()), rows) && onSave(r)}
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
function CharacteristicsEditor({ rows, defs, onSave }: { rows: Rating[]; defs: CharacteristicDef[]; onSave(r: Rating[]): void }) {
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
            <button className="icon" aria-label={`Remove ${r.name}`} onClick={() => onSave(rows.filter((x) => x.name !== r.name))}>
              ×
            </button>
          </div>
          <input
            className="small"
            value={notes[r.name] ?? ""}
            placeholder="Why this rating? (optional)"
            onChange={(e) => setNotes({ ...notes, [r.name]: e.target.value })}
            onBlur={() => (notes[r.name] ?? "") !== (r.note ?? "") && put(r.name, { note: notes[r.name] })}
          />
        </div>
      ))}
      {unrated.length > 0 && (
        <select value="" onChange={(e) => e.target.value && put(e.target.value, { rating: 3 })} data-testid="char-add-rating">
          <option value="">+ Rate a characteristic…</option>
          {unrated.map((d) => (
            <option key={d.name} value={d.name} title={d.description}>
              {d.name}
            </option>
          ))}
        </select>
      )}
      <p className="muted small">1: weak · 5: one of its strongest features. Driving: one it must be good at.</p>
    </div>
  );
}

/** Monthly cost line items; the total of a system or container includes everything inside it. */
function CostEditor({ element, currency, onSave }: { element: ElementSummary; currency: string; onSave(r: CostItem[]): void }) {
  const inside = Math.round((element.costRollup - element.costTotal) * 100) / 100;
  return (
    <div data-testid="cost">
      <Rows<CostItem>
        rows={element.cost}
        blank={{ item: "", monthly: 0, note: "" }}
        onSave={(r) => !sameKeys(r.filter((x) => x.item.trim()), element.cost) && onSave(r.filter((x) => x.item.trim() || x.monthly))}
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
function WorkEditor({ rows, enums, onSave }: { rows: WorkItem[]; enums: AppState["enums"]; onSave(r: WorkItem[]): void }) {
  return (
    <Rows<WorkItem>
      rows={rows}
      blank={{ type: "issue", title: "", url: "", status: "open", severity: "" }}
      onSave={(r) => !sameKeys(r.filter((x) => x.title.trim() || x.url?.trim()), rows) && onSave(r)}
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

function ConnectionList({
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
      {rels.length === 0 && <div className="muted">None</div>}
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

// ------------------------------------------------------------------ element

export function ObjectPanel({ element, ...p }: Common & { element: ElementSummary }) {
  const { state, lens, mutate } = p;
  const save = (patch: object) => mutate(() => api.updateElement(element.id, patch));
  const has = (s: (typeof lens.visibleSections)[number]) => lens.visibleSections.includes(s);
  const subtree = new Set([element.id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const e of state.elements)
      if (e.parentId && subtree.has(e.parentId) && !subtree.has(e.id)) {
        subtree.add(e.id);
        grew = true;
      }
  }
  const incoming = state.relationships.filter((r) => subtree.has(r.destinationId) && !subtree.has(r.sourceId));
  const outgoing = state.relationships.filter((r) => subtree.has(r.sourceId) && !subtree.has(r.destinationId));
  const groups = state.tagGroups.filter((g) => !lens.hiddenTagGroups.includes(g.name));
  const parent = element.parentId ? state.elements.find((e) => e.id === element.parentId) : null;
  const [newLink, setNewLink] = useState({ label: "", url: "" });
  const drill = element.kind === "softwareSystem" ? `containers-${element.id}` : element.kind === "container" ? `components-${element.id}` : null;
  const style = state.styles[element.id] ?? {};
  const hasTech = element.kind === "container" || element.kind === "component";

  return (
    <div className="panel-body" data-testid="object-panel">
      <div className="panel-kind">
        {KIND_LABEL[element.kind]}
        {parent && <span className="muted"> in {parent.name}</span>}
      </div>
      <TextField label="Name" value={element.name} onCommit={(v) => save({ name: v })} testId="field-name" autoFocus={p.focusName} />
      <TextField label="Description" value={element.description} multiline onCommit={(v) => save({ description: v })} testId="field-description" />
      {element.kind !== "person" && (
        <label className="field">
          <span>Symbol</span>
          <div className="row">
            <ShapeIcon type={element.archType || "box"} />
            <select value={element.archType || "box"} onChange={(e) => save({ archType: e.target.value })} data-testid="field-arch" style={{ flex: 1 }}>
              {state.enums.archTypes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        </label>
      )}
      {hasTech && has("technology") && (
        <TagInput label="Technology" value={element.technologies} suggestions={state.technologies} onChange={(v) => save({ technology: v })} testId="field-technology" />
      )}
      <TextField label="Owner" value={element.owner} onCommit={(v) => save({ owner: v })} testId="field-owner" />
      {(element.kind === "person" || element.kind === "softwareSystem") && (
        <label className="check">
          <input type="checkbox" checked={element.location === "External"} onChange={(e) => save({ external: e.target.checked })} />
          External (outside our organisation)
        </label>
      )}
      {groups.length > 0 && (
        <div className="tag-fields">
          <h4>Tags</h4>
          {groups.map((g) => (
            <label className="field inline" key={g.name}>
              <span>{g.name}</span>
              <select value={element.tags[g.name] ?? ""} data-testid={`tag-${g.name}`} onChange={(e) => save({ tags: { [g.name]: e.target.value || null } })}>
                <option value="">—</option>
                {g.values.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}

      {has("characteristics") && element.kind !== "person" && (
        <Section title="Characteristics" count={element.characteristics.length} testId="sec-characteristics">
          <CharacteristicsEditor rows={element.characteristics} defs={state.characteristics} onSave={(r) => save({ characteristics: r })} />
        </Section>
      )}
      {has("cost") && element.kind !== "person" && (
        <Section title={`Cost${element.costRollup ? ` · ${formatMoney(element.costRollup, state.costSettings.currency)}/mo` : ""}`} count={element.cost.length} testId="sec-cost">
          <CostEditor element={element} currency={state.costSettings.currency} onSave={(r) => save({ cost: r })} />
        </Section>
      )}
      {has("work") && (
        <Section title={`Linked work${openWork(element).length ? ` · ${openWork(element).length} open` : ""}`} count={element.work.length} testId="sec-work">
          <WorkEditor rows={element.work} enums={state.enums} onSave={(r) => save({ work: r })} />
        </Section>
      )}
      {has("details") && (
        <Section title="Details" count={element.details.length} testId="sec-details">
          <DetailsEditor tables={element.details} onSave={(t) => save({ details: t })} />
        </Section>
      )}
      {has("notes") && (
        <Section title="Notes" count={element.notes ? 1 : 0} testId="sec-notes">
          <NotesEditor value={element.notes} onSave={(v) => save({ notes: v })} />
        </Section>
      )}
      {has("tradeoffs") && (
        <Section title="Tradeoffs" count={element.tradeoffs.length} testId="sec-tradeoffs">
          <TradeoffsEditor rows={element.tradeoffs} onSave={(r) => save({ tradeoffs: r })} />
        </Section>
      )}
      {has("usage") && (
        <Section title="Usage" count={element.usage.length} testId="sec-usage">
          <UsageEditor rows={element.usage} frequencies={state.enums.frequencies} onSave={(r) => save({ usage: r })} />
        </Section>
      )}
      {has("sensitive") && (
        <Section title="Sensitive information" count={element.sensitive.length} testId="sec-sensitive">
          <SensitiveEditor rows={element.sensitive} levels={state.enums.sensitivity} onSave={(r) => save({ sensitive: r })} />
        </Section>
      )}
      {has("code") && (
        <Section title="Code" count={element.codePaths.length} testId="sec-code">
          <CodePaths
            paths={element.codePaths}
            onSave={(paths) => save({ codePaths: paths })}
            onOpenDiagram={element.kind === "person" ? undefined : () => p.onOpen(`code-${element.id}`)}
          />
        </Section>
      )}
      <Section title="Links" count={element.links.length + (element.url ? 1 : 0)}>
        <TextField label="Main link (URL)" value={element.url} onCommit={(v) => save({ url: v })} placeholder="https://" />
        <ul className="links">
          {element.links.map((l, i) => (
            <li key={i}>
              <a href={l.url} target="_blank" rel="noreferrer">
                {l.label || l.url}
              </a>
              <button className="icon" aria-label="Remove link" onClick={() => save({ links: element.links.filter((_, j) => j !== i) })}>
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="row">
          <input placeholder="Label" value={newLink.label} onChange={(e) => setNewLink({ ...newLink, label: e.target.value })} />
          <input placeholder="https://" value={newLink.url} onChange={(e) => setNewLink({ ...newLink, url: e.target.value })} />
          <button
            disabled={!newLink.url.trim()}
            onClick={async () => {
              if (await save({ links: [...element.links, newLink] })) setNewLink({ label: "", url: "" });
            }}
          >
            Add
          </button>
        </div>
      </Section>
      <Section title="Appearance" count={Object.keys(style).length} testId="sec-style">
        <StylePanel target={element.id} style={style} edge={false} mutate={mutate} />
      </Section>

      <ConnectionList title="Incoming" rels={incoming} other={(r) => r.sourceId} inside={(r) => r.destinationId} selfId={element.id} state={state} onReveal={p.onReveal} testId="incoming" />
      <ConnectionList title="Outgoing" rels={outgoing} other={(r) => r.destinationId} inside={(r) => r.sourceId} selfId={element.id} state={state} onReveal={p.onReveal} testId="outgoing" />
      <div className="panel-actions">
        {drill && <button onClick={() => p.onOpen(drill)}>Open {element.kind === "softwareSystem" ? "containers" : "components"}</button>}
        {element.kind === "softwareSystem" && <button onClick={() => p.onOpen(`context-${element.id}`)}>Open context</button>}
        <button onClick={() => mutate(() => api.duplicate(element.id))} data-testid="duplicate-element">
          Duplicate
        </button>
        <button
          className="danger"
          data-testid="delete-element"
          onClick={() => {
            const n = element.childCount;
            const msg = n ? `Delete "${element.name}" and the ${n} element(s) inside it?` : `Delete "${element.name}"?`;
            if (window.confirm(`${msg} Its connections are deleted too.`)) mutate(() => api.deleteElement(element.id)).then((ok) => ok && p.onSelect(null));
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ stage and file (connector / code diagrams)

export function StagePanel({ node, ...p }: Common & { node: DiagramNode }) {
  const { state, mutate, diagram } = p;
  const relId = diagram.scope!;
  const rel = state.relationships.find((r) => r.id === relId);
  if (!rel) return null;
  const stages = rel.stages;
  const idx = stages.findIndex((s) => s.id === node.stageId);
  const st = stages[idx];
  if (!st) return null;
  const saveStages = (next: Stage[]) => mutate(() => api.updateRelationship(relId, { stages: next }));
  const patch = (changes: Partial<Stage>) => saveStages(stages.map((s, i) => (i === idx ? { ...s, ...changes } : s)));
  const move = (d: number) => {
    const next = [...stages];
    [next[idx], next[idx + d]] = [next[idx + d], next[idx]];
    saveStages(next);
  };
  const components = state.elements.filter((e) => e.kind === "component" || e.kind === "container");
  return (
    <div className="panel-body" data-testid="stage-panel">
      <div className="panel-kind">Stage {idx + 1} of {stages.length}</div>
      <TextField label="Name" value={st.name} onCommit={(v) => patch({ name: v })} testId="stage-name" />
      <TextField label="Description" value={st.description ?? ""} multiline onCommit={(v) => patch({ description: v })} />
      <TagInput label="Technology" value={st.technologies ?? []} suggestions={state.technologies} onChange={(v) => patch({ technologies: v })} testId="stage-tech" />
      <label className="field">
        <span>Symbol</span>
        <select value={st.archType ?? "pipeline"} onChange={(e) => patch({ archType: e.target.value })}>
          {state.enums.archTypes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Implemented by (opens when double-clicked)</span>
        <select value={st.elementId ?? ""} onChange={(e) => patch({ elementId: e.target.value || undefined })} data-testid="stage-element">
          <option value="">— none —</option>
          {components.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} ({KIND_LABEL[e.kind]})
            </option>
          ))}
        </select>
      </label>
      {node.drillKey && <button onClick={() => p.onOpen(node.drillKey!)}>Open what implements this stage</button>}
      <Section title="Appearance" testId="sec-style">
        <StylePanel target={node.id} style={node.style} edge={false} mutate={mutate} />
      </Section>
      <div className="panel-actions">
        <button disabled={idx === 0} onClick={() => move(-1)}>
          Move earlier
        </button>
        <button disabled={idx === stages.length - 1} onClick={() => move(1)}>
          Move later
        </button>
        <button className="danger" onClick={() => saveStages(stages.filter((_, i) => i !== idx)).then((ok) => ok && p.onSelect(null))}>
          Delete stage
        </button>
      </div>
    </div>
  );
}

export function FilePanel({ node, ...p }: Common & { node: DiagramNode }) {
  const imports = p.diagram.edges.filter((e) => e.source === node.id).map((e) => e.target);
  const importedBy = p.diagram.edges.filter((e) => e.target === node.id).map((e) => e.source);
  const name = (id: string) => p.diagram.nodes.find((n) => n.id === id)?.name ?? id;
  return (
    <div className="panel-body" data-testid="file-panel">
      <div className="panel-kind">File</div>
      <h2 className="panel-title">{node.name}</h2>
      <div className="muted small">{node.filePath}</div>
      <button className="primary" onClick={() => p.onOpenFile(node.filePath!)} data-testid="open-file">
        Open file to edit
      </button>
      <div className="connections">
        <h4>
          Imports <span className="count">{imports.length}</span>
        </h4>
        <ul>{imports.map((i) => <li key={i}>{name(i)}</li>)}</ul>
        <h4>
          Imported by <span className="count">{importedBy.length}</span>
        </h4>
        <ul>{importedBy.map((i) => <li key={i}>{name(i)}</li>)}</ul>
      </div>
      <Section title="Appearance">
        <StylePanel target={node.id} style={node.style} edge={false} mutate={p.mutate} />
      </Section>
    </div>
  );
}

// ------------------------------------------------------------------ relationship

export function EdgePanel({ edgeId, ...p }: Common & { edgeId: string }) {
  const { state, diagram, mutate, lens } = p;
  const edge = diagram.edges.find((e) => e.id === edgeId);
  if (!edge) return null;
  const byId = new Map(state.elements.map((e) => [e.id, e]));
  const rels = edge.relationshipIds.map((id) => state.relationships.find((r) => r.id === id)).filter(Boolean) as Relationship[];
  const name = (id: string) => byId.get(id)?.name ?? diagram.nodes.find((n) => n.id === id)?.name ?? id;
  const style = edge.style;
  const setLayout = (layout: EdgeLayout) => mutate(() => api.layout(diagram.key, { edges: { [edge.id]: layout } }));
  const has = (s: (typeof lens.visibleSections)[number]) => lens.visibleSections.includes(s);
  const lineControls = diagram.level !== "flow" && (
    <>
      <label className="field inline">
        <span>Line shape</span>
        <select
          value={edge.layout.routing ?? "auto"}
          onChange={(e) => {
            const next = { ...edge.layout };
            if (e.target.value === "auto") delete next.routing;
            else next.routing = e.target.value as EdgeLayout["routing"];
            setLayout(next);
          }}
          data-testid="line-shape"
        >
          <option value="auto">Automatic</option>
          <option value="straight">Straight</option>
          <option value="curved">Curved (through the bend point)</option>
          <option value="smooth">Smooth S-curve</option>
          <option value="orthogonal">Right angles (elbow)</option>
          <option value="rounded">Rounded right angles</option>
        </select>
      </label>
      <button onClick={() => setLayout({})} disabled={Object.keys(edge.layout).length === 0} data-testid="reset-line">
        Reset line position
      </button>
      <p className="muted small">Drag the round grips on a selected line to move its ends to any point on a box, bend it, or slide its label.</p>
    </>
  );

  if (edge.id.startsWith("file:")) {
    return (
      <div className="panel-body" data-testid="edge-panel">
        <div className="panel-kind">Import</div>
        <p>
          {name(edge.source)} imports {name(edge.target)}.
        </p>
        <Section title="Appearance">
          <StylePanel target={edge.id} style={style} edge mutate={mutate} />
        </Section>
        {lineControls}
      </div>
    );
  }

  if (edge.derived) {
    return (
      <div className="panel-body" data-testid="edge-panel">
        <div className="panel-kind">Derived connection</div>
        <p className="muted">
          {name(edge.source)} → {name(edge.target)} is not drawn in the model directly. It comes from these relationships between elements inside them:
        </p>
        <ul className="rel-list">
          {rels.map((r) => {
            const t = edge.drillTargets.find((d) => d.relationshipId === r.id);
            return (
              <li key={r.id}>
                <button className="link" onClick={() => p.onReveal(r.sourceId)}>
                  {name(r.sourceId)}
                </button>{" "}
                →{" "}
                <button className="link" onClick={() => p.onReveal(r.destinationId)}>
                  {name(r.destinationId)}
                </button>
                <div className="muted small">
                  {r.description}
                  {r.technologies.length > 0 && ` [${r.technologies.join(", ")}]`}
                </div>
                {t && (
                  <button className="link small" onClick={() => p.onOpen(t.key)} data-testid={`open-drill-${r.id}`}>
                    Open where it is drawn
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <Section title="Appearance">
          <StylePanel target={edge.id} style={style} edge mutate={mutate} />
        </Section>
        {lineControls}
      </div>
    );
  }
  const r = rels[0];
  if (!r) return null;
  const save = (patch: object) => mutate(() => api.updateRelationship(r.id, patch));
  const detailKey = edge.detailKey ?? `connector-${r.id}`;
  return (
    <div className="panel-body" data-testid="edge-panel">
      <div className="panel-kind">Relationship</div>
      <p>
        <button className="link" onClick={() => p.onReveal(r.sourceId)}>
          {name(r.sourceId)}
        </button>{" "}
        →{" "}
        <button className="link" onClick={() => p.onReveal(r.destinationId)}>
          {name(r.destinationId)}
        </button>
      </p>
      <TextField label="Description" value={r.description} onCommit={(v) => save({ description: v })} testId="field-rel-description" autoFocus={p.focusName} />
      {has("technology") && <TagInput label="Technology / protocol" value={r.technologies} suggestions={state.technologies} onChange={(v) => save({ technology: v })} testId="field-rel-technology" />}
      <label className="field">
        <span>Kind</span>
        <select value={r.kind} onChange={(e) => save({ kind: e.target.value })} data-testid="field-rel-kind">
          <option value="">— not set —</option>
          {state.enums.connectorKinds.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <button className="primary" onClick={() => p.onOpen(detailKey)} data-testid="open-connector">
        Open connector detail{r.stages.length ? ` (${r.stages.length} stages)` : ""}
      </button>
      {has("work") && (
        <Section title={`Linked work${openWork(r).length ? ` · ${openWork(r).length} open` : ""}`} count={r.work.length} testId="sec-rel-work">
          <WorkEditor rows={r.work} enums={p.state.enums} onSave={(rows) => save({ work: rows })} />
        </Section>
      )}
      {has("notes") && (
        <Section title="Notes" count={r.notes ? 1 : 0}>
          <NotesEditor value={r.notes} onSave={(v) => save({ notes: v })} />
        </Section>
      )}
      {has("sensitive") && (
        <Section title="Sensitive information" count={r.sensitive.length}>
          <SensitiveEditor rows={r.sensitive} levels={state.enums.sensitivity} onSave={(v) => save({ sensitive: v })} />
        </Section>
      )}
      {has("code") && (
        <Section title="Code" count={r.codePaths.length}>
          <CodePaths paths={r.codePaths} onSave={(v) => save({ codePaths: v })} onOpenDiagram={() => p.onOpen(`code-${r.id}`)} />
        </Section>
      )}
      <Section title="Appearance" count={Object.keys(style).length}>
        <StylePanel target={edge.id.startsWith("conn:") ? r.id : edge.id} style={style} edge mutate={mutate} />
      </Section>
      {lineControls}
      <div className="panel-actions">
        <button
          className="danger"
          onClick={() => {
            if (window.confirm("Delete this relationship? Flow steps that use it are removed too.")) mutate(() => api.deleteRelationship(r.id)).then((ok) => ok && p.onSelect(null));
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ connector diagram (nothing selected)

export function ConnectorPanel(p: Common) {
  const { state, diagram, mutate } = p;
  const c = diagram.connector;
  const rel = state.relationships.find((r) => r.id === diagram.scope);
  if (!c || !rel) return null;
  const save = (patch: object) => mutate(() => api.updateRelationship(rel.id, patch));
  return (
    <div className="panel-body" data-testid="connector-panel">
      <div className="panel-kind">Connector detail</div>
      <h2 className="panel-title">{c.name}</h2>
      <p className="muted">{rel.description}</p>
      <label className="field">
        <span>Kind</span>
        <select value={rel.kind} onChange={(e) => save({ kind: e.target.value })}>
          <option value="">— not set —</option>
          {state.enums.connectorKinds.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <TagInput label="Technology / protocol" value={rel.technologies} suggestions={state.technologies} onChange={(v) => save({ technology: v })} />
      <h4>
        Stages <span className="count">{rel.stages.length}</span>
      </h4>
      <ol className="stage-list">
        {rel.stages.map((s) => (
          <li key={s.id}>
            <button className="link" onClick={() => p.onSelect({ type: "node", id: `stage:${rel.id}:${s.id}` })}>
              {s.name}
            </button>
          </li>
        ))}
      </ol>
      <button
        className="primary"
        data-testid="add-stage"
        onClick={() => {
          const name = window.prompt("Name of the new stage (a step inside this connector)");
          if (name) save({ stages: [...rel.stages, { id: "", name }] });
        }}
      >
        + Add stage
      </button>
      {c.codeKey && <button onClick={() => p.onOpen(c.codeKey!)}>Open code of this connector</button>}
      {!c.codeKey && (
        <Section title="Code of this connector">
          <CodePaths paths={rel.codePaths} onSave={(v) => save({ codePaths: v })} />
        </Section>
      )}
      <p className="muted small">Stages are the steps inside a pipeline or protocol. A stage can point at the component that implements it; double-click the stage to open that component.</p>
      <button onClick={() => p.onOpen(diagram.breadcrumb[Math.max(0, diagram.breadcrumb.length - 2)].key)}>Back to the diagram</button>
    </div>
  );
}

export function CodeDiagramPanel(p: Common) {
  const { state, diagram, mutate } = p;
  const ownerId = diagram.scope!;
  const isRel = state.relationships.some((r) => r.id === ownerId);
  const owner = isRel ? state.relationships.find((r) => r.id === ownerId)! : state.elements.find((e) => e.id === ownerId)!;
  if (!owner || !diagram.code) return null;
  const save = (paths: string[]) => mutate(() => (isRel ? api.updateRelationship(ownerId, { codePaths: paths }) : api.updateElement(ownerId, { codePaths: paths })));
  return (
    <div className="panel-body" data-testid="code-panel">
      <div className="panel-kind">Code</div>
      <h2 className="panel-title">{diagram.code.ownerName}</h2>
      <p className="muted small">Files appear as boxes; lines are imports found by scanning the code. Double-click a file to open and edit it.</p>
      {!diagram.code.hasRoot && <p className="error">No code folder is set. Start with --code-root.</p>}
      <CodePaths paths={diagram.code.paths} onSave={save} />
      {diagram.code.missing.length > 0 && <p className="warning">Not found in the code folder: {diagram.code.missing.join(", ")}</p>}
      {diagram.code.truncated && <p className="muted small">Only the first files are shown.</p>}
    </div>
  );
}
