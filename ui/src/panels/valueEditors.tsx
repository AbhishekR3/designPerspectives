import { useEffect, useState } from "react";
import { RATING_COLORS, formatMoney } from "../overlays";
import {
  type AppState,
  type CharacteristicDef,
  type CostItem,
  type Rating,
  type WorkItem,
  type ElementSummary,
} from "../types";
import { sameKeys } from "./common";
import { Rows } from "./sectionEditors";

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
export function CostEditor({ element, currency, onSave }: { element: ElementSummary; currency: string; onSave(r: CostItem[]): void }) {
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
export function WorkEditor({ rows, enums, onSave }: { rows: WorkItem[]; enums: AppState["enums"]; onSave(r: WorkItem[]): void }) {
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
