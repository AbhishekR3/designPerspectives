/**
 * Decision records (DEC-050): a page over the diagram listing the decisions of the shown model version,
 * one decision's record, and its editor. Decisions are part of the model, so in a draft this shows and
 * edits the draft's decisions.
 */

import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { confirmDialog } from "../common/dialogs";
import { Icon } from "../common/icons";
import { errorMessage, notify } from "../common/notify";
import { DecisionEditor } from "./DecisionEditor";
import { decisionFlags as sharedFlags, isoDay } from "../../../src/shared/decisionAlerts";
import { DECISION_KIND_INFO, DECISION_KINDS, DECISION_STATUS_LABEL, DECISION_STATUSES, type AppState, type Decision, type DecisionKind, type DecisionStatus, type DecisionSummary } from "../types";

export const today = (): string => isoDay();

/** What a decision asks of the reader now (shared rules with the server's home summary). */
export const decisionFlags = (d: DecisionSummary, now = today()) => sharedFlags(d, now);

export function StatusBadge({ status }: { status: DecisionStatus }) {
  return <span className={`dec-status s-${status}`}>{DECISION_STATUS_LABEL[status]}</span>;
}

interface Props {
  state: AppState;
  /** The selected decision's ID (from the URL), or null. */
  selected: string | null;
  onSelect(id: string | null): void;
  onClose(): void;
  /** Show an element or relationship on its diagram (closes the page). */
  onReveal(id: string): void;
  mutate(fn: () => Promise<unknown>): Promise<boolean>;
}

export function DecisionsPage({ state, selected, onSelect, onClose, onReveal, mutate }: Props) {
  const [all, setAll] = useState<Decision[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<DecisionStatus | "open" | "all">("all");
  const [kind, setKind] = useState<DecisionKind | "">("");
  // The decision being edited (its ID), so a decision opened for editing right after it is made stays in the editor.
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = editingId !== null && editingId === selected;
  const setEditing = (on: boolean) => setEditingId(on ? selected : null);
  const [creating, setCreating] = useState(false);
  const canEdit = !state.readOnly;

  // The full records; reloaded whenever the model (or its version) changes.
  useEffect(() => {
    let live = true;
    api
      .decisions()
      .then((d) => live && (setAll(d), setLoadError(null)))
      .catch((e) => live && setLoadError(errorMessage(e)));
    return () => {
      live = false;
    };
  }, [state.version]);

  useEffect(() => setEditingId(null), [state.model.ref]);

  const summaries = state.decisions;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const full = new Map((all ?? []).map((d) => [d.id, d]));
    return summaries
      .filter((d) => (status === "all" ? true : status === "open" ? d.status === "proposed" || decisionFlags(d).some((f) => f.tone === "warn") : d.status === status))
      .filter((d) => !kind || d.kind === kind)
      .filter((d) => {
        if (!q) return true;
        const f = full.get(d.id);
        const hay = [d.id, d.title, ...d.tags, ...(f ? [f.context, f.decision, ...f.alternatives.map((a) => a.name)] : [])].join(" ").toLowerCase();
        return hay.includes(q);
      })
      .slice()
      .reverse(); // newest number first
  }, [summaries, all, query, status, kind]);

  const current = selected ? (all?.find((d) => d.id === selected) ?? null) : null;
  const currentSummary = selected ? summaries.find((d) => d.id === selected) : undefined;
  const counts = Object.fromEntries(DECISION_STATUSES.map((s) => [s, summaries.filter((d) => d.status === s).length])) as Record<DecisionStatus, number>;
  const needsLook = summaries.filter((d) => d.status === "proposed" || decisionFlags(d).some((f) => f.tone === "warn")).length;

  const save = async (id: string, body: Partial<Decision>) => {
    const ok = await mutate(() => api.updateDecision(id, body));
    if (ok) setEditing(false);
    return ok;
  };

  return (
    <div className="page" data-testid="decisions-page">
      <header className="page-head">
        <button className="ghost" onClick={onClose} title="Back to the diagram" data-testid="decisions-close">
          <Icon name="back" size={14} /> Diagram
        </button>
        <h1>
          Decisions <span className="muted">{summaries.length}</span>
        </h1>
        <span className="muted small page-sub">{state.model.ref === "main" ? "Main model" : state.model.title}</span>
        <span className="grow" />
        {canEdit && (
          <button className="primary" onClick={() => setCreating(true)} data-testid="decision-new">
            <Icon name="plus" size={14} /> New decision
          </button>
        )}
      </header>

      <div className="dec-layout">
        <aside className="dec-list" aria-label="Decisions">
          <div className="dec-filters">
            <input type="search" placeholder="Search titles and text…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search decisions" data-testid="decisions-search" />
            <div className="dec-chips" role="group" aria-label="Status">
              <button className={`tiny${status === "all" ? " on" : ""}`} onClick={() => setStatus("all")}>
                All {summaries.length}
              </button>
              <button
                className={`tiny${status === "open" ? " on" : ""}`}
                onClick={() => setStatus("open")}
                title="Proposed, or asking for a look: a review date, deadline or trigger"
                data-testid="filter-attention"
              >
                Needs a look {needsLook}
              </button>
              {DECISION_STATUSES.filter((s) => counts[s]).map((s) => (
                <button key={s} className={`tiny${status === s ? " on" : ""}`} onClick={() => setStatus(s)} data-testid={`filter-${s}`}>
                  {DECISION_STATUS_LABEL[s]} {counts[s]}
                </button>
              ))}
            </div>
            <select value={kind} onChange={(e) => setKind(e.target.value as DecisionKind | "")} aria-label="Kind" data-testid="filter-kind">
              <option value="">Every kind</option>
              {DECISION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {DECISION_KIND_INFO[k].label}
                </option>
              ))}
            </select>
          </div>
          {shown.length === 0 ? (
            <p className="empty-note">{summaries.length ? "No decision matches." : "No decisions recorded yet."}</p>
          ) : (
            <ul className="dec-items">
              {shown.map((d) => (
                <li key={d.file}>
                  <button className={`dec-item${d.id === selected ? " on" : ""}`} onClick={() => onSelect(d.id)} data-testid={`decision-${d.id}`}>
                    <span className="dec-item-top">
                      <span className="dec-num">{d.id}</span>
                      <StatusBadge status={d.status} />
                      <span className="muted small">{DECISION_KIND_INFO[d.kind]?.label}</span>
                      <span className="grow" />
                      <span className="muted small">{d.date}</span>
                    </span>
                    <span className="dec-item-title">{d.title}</span>
                    {decisionFlags(d).filter((f) => f.tone === "warn").length > 0 && (
                      <span className="dec-flags">
                        {decisionFlags(d)
                          .filter((f) => f.tone === "warn")
                          .map((f) => (
                            <span key={f.text} className="dec-flag">
                              <Icon name="warning" size={12} /> {f.text}
                            </span>
                          ))}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="dec-detail" aria-live="polite">
          {loadError && <p className="error-text">Could not load the decisions: {loadError}</p>}
          {creating && (
            <NewDecision
              onCancel={() => setCreating(false)}
              onCreate={async (title, k) => {
                let id: string | null = null;
                const ok = await mutate(async () => {
                  id = (await api.createDecision({ title, kind: k })).id;
                });
                if (ok && id) {
                  setCreating(false);
                  setEditingId(id);
                  onSelect(id);
                }
              }}
            />
          )}
          {!creating && !selected && <DecisionsIntro state={state} onSelect={onSelect} />}
          {!creating && selected && !currentSummary && <p className="empty-note">There is no decision {selected} in this version of the model.</p>}
          {!creating && currentSummary?.error && (
            <div className="dec-record">
              <h2>{currentSummary.file}</h2>
              <p className="error-text" data-testid="decision-error">
                This file cannot be read: {currentSummary.error}. Fix it in a text editor; it is not changed here.
              </p>
            </div>
          )}
          {!creating && current && !current.error && !editing && (
            <DecisionRecord
              d={current}
              state={state}
              canEdit={canEdit}
              onEdit={() => setEditing(true)}
              onReveal={onReveal}
              onSelect={onSelect}
              onStatus={(s) => void mutate(() => api.setDecisionStatus(current.id, s))}
              onToggleTrigger={(i) => void save(current.id, { triggers: current.triggers.map((t, j) => (j === i ? { ...t, met: !t.met } : t)) })}
              onDelete={async () => {
                const yes = await confirmDialog({
                  title: `Delete decision ${current.id}?`,
                  message: `"${current.title}" and its file are removed. Decisions that replace it no longer point to it.`,
                  confirmLabel: "Delete",
                  danger: true,
                });
                if (yes && (await mutate(() => api.deleteDecision(current.id)))) {
                  notify.success(`Deleted decision ${current.id}.`);
                  onSelect(null);
                }
              }}
            />
          )}
          {!creating && current && !current.error && editing && (
            <DecisionEditor key={current.id} d={current} state={state} all={all ?? []} onCancel={() => setEditing(false)} onSave={(body) => save(current.id, body)} />
          )}
        </section>
      </div>
    </div>
  );
}

function NewDecision({ onCancel, onCreate }: { onCancel(): void; onCreate(title: string, kind: DecisionKind): Promise<void> }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<DecisionKind>("choice");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="dec-new"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim() || busy) return;
        setBusy(true);
        void onCreate(title.trim(), kind).finally(() => setBusy(false));
      }}
      data-testid="decision-new-form"
    >
      <h2>New decision</h2>
      <label className="field">
        <span>Title</span>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Build statements in a nightly batch" data-testid="decision-new-title" />
      </label>
      <div className="field">
        <span>Kind</span>
        <div className="dec-kinds" role="radiogroup" aria-label="Kind">
          {DECISION_KINDS.map((k) => (
            <label key={k} className={`dec-kind${kind === k ? " on" : ""}`}>
              <input type="radio" name="dec-kind" value={k} checked={kind === k} onChange={() => setKind(k)} data-testid={`decision-new-kind-${k}`} />
              <strong>{DECISION_KIND_INFO[k].label}</strong>
              <span className="muted small">{DECISION_KIND_INFO[k].hint}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="row end">
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={!title.trim() || busy} data-testid="decision-new-create">
          Create
        </button>
      </div>
    </form>
  );
}

/** Shown when no decision is selected: what the kinds are for, and what needs a look. */
function DecisionsIntro({ state, onSelect }: { state: AppState; onSelect(id: string): void }) {
  const look = state.decisions.filter((d) => decisionFlags(d).some((f) => f.tone === "warn"));
  return (
    <div className="dec-intro">
      <h2>Why the architecture is the way it is</h2>
      <p className="muted">
        A decision records what was chosen, what else was considered and why not, and what would change the answer. Each one is a Markdown file in <code>architecture/decisions/</code>, reviewed and
        versioned with the model.
      </p>
      {look.length > 0 && (
        <>
          <h3>Needs a look</h3>
          <ul className="dec-look">
            {look.map((d) => (
              <li key={d.file}>
                <button className="link" onClick={() => onSelect(d.id)}>
                  {d.id} {d.title}
                </button>{" "}
                <span className="muted small">{decisionFlags(d).find((f) => f.tone === "warn")?.text}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <h3>Kinds of decision</h3>
      <dl className="dec-kind-list">
        {DECISION_KINDS.map((k) => (
          <div key={k}>
            <dt>{DECISION_KIND_INFO[k].label}</dt>
            <dd className="muted">{DECISION_KIND_INFO[k].hint}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Names for element and relationship IDs. */
export function objectName(state: AppState, id: string): string | null {
  const el = state.elements.find((e) => e.id === id);
  if (el) return el.name;
  const r = state.relationships.find((x) => x.id === id);
  if (!r) return null;
  const n = (x: string) => state.elements.find((e) => e.id === x)?.name ?? x;
  return `${n(r.sourceId)} → ${n(r.destinationId)}${r.description ? `: ${r.description}` : ""}`;
}

function Prose({ text }: { text: string }) {
  return <div className="dec-prose">{text}</div>;
}

function DecisionRecord({
  d,
  state,
  canEdit,
  onEdit,
  onReveal,
  onSelect,
  onStatus,
  onToggleTrigger,
  onDelete,
}: {
  d: Decision;
  state: AppState;
  canEdit: boolean;
  onEdit(): void;
  onReveal(id: string): void;
  onSelect(id: string): void;
  onStatus(s: DecisionStatus): void;
  onToggleTrigger(i: number): void;
  onDelete(): void;
}) {
  const title = (id: string) => state.decisions.find((x) => x.id === id)?.title;
  const flags = decisionFlags(state.decisions.find((x) => x.id === d.id) ?? { ...d, triggers: { open: 0, met: d.triggers.filter((t) => t.met).length } });
  const conditional = d.kind === "conditional";
  return (
    <article className="dec-record" data-testid="decision-record">
      <div className="dec-record-top">
        <span className="dec-num">{d.id}</span>
        <StatusBadge status={d.status} />
        <span className="muted">{DECISION_KIND_INFO[d.kind].label}</span>
        <span className="grow" />
        {canEdit && (
          <>
            {d.status === "proposed" && (
              <>
                <button className="small" onClick={() => onStatus("accepted")} data-testid="decision-accept">
                  <Icon name="check" size={14} /> Accept
                </button>
                <button className="small ghost" onClick={() => onStatus("rejected")} data-testid="decision-reject">
                  Reject
                </button>
              </>
            )}
            {d.status === "accepted" && (
              <button className="small ghost" onClick={() => onStatus("deprecated")} title="No longer applies, and nothing replaces it" data-testid="decision-deprecate">
                Deprecate
              </button>
            )}
            <button className="small" onClick={onEdit} data-testid="decision-edit">
              <Icon name="edit" size={14} /> Edit
            </button>
            <button className="small ghost icon" onClick={onDelete} title="Delete this decision" aria-label="Delete this decision" data-testid="decision-delete">
              <Icon name="trash" size={14} />
            </button>
          </>
        )}
      </div>
      <h2 className="dec-title">{d.title}</h2>
      {flags.some((f) => f.tone === "warn") && (
        <div className="dec-flags big">
          {flags
            .filter((f) => f.tone === "warn")
            .map((f) => (
              <span key={f.text} className="dec-flag">
                <Icon name="warning" size={12} /> {f.text}
              </span>
            ))}
        </div>
      )}
      <dl className="dec-meta">
        <dt>Date</dt>
        <dd>{d.date || "—"}</dd>
        {d.deciders.length > 0 && (
          <>
            <dt>Decided by</dt>
            <dd>{d.deciders.join(", ")}</dd>
          </>
        )}
        {d.reviewBy && (
          <>
            <dt>Review by</dt>
            <dd>{d.reviewBy}</dd>
          </>
        )}
        {d.decideBy && (
          <>
            <dt>Decide by</dt>
            <dd>{d.decideBy}</dd>
          </>
        )}
        {d.expires && (
          <>
            <dt>Expires</dt>
            <dd>{d.expires}</dd>
          </>
        )}
        {d.appliesTo && (
          <>
            <dt>Applies to</dt>
            <dd>{d.appliesTo}</dd>
          </>
        )}
        {d.supersedes.length > 0 && (
          <>
            <dt>Replaces</dt>
            <dd>
              {d.supersedes.map((s) => (
                <button key={s} className="link dec-ref" onClick={() => onSelect(s)}>
                  {s} {title(s)}
                </button>
              ))}
            </dd>
          </>
        )}
        {d.supersededBy.length > 0 && (
          <>
            <dt>Replaced by</dt>
            <dd>
              {d.supersededBy.map((s) => (
                <button key={s} className="link dec-ref" onClick={() => onSelect(s)}>
                  {s} {title(s)}
                </button>
              ))}
            </dd>
          </>
        )}
        {d.tags.length > 0 && (
          <>
            <dt>Tags</dt>
            <dd>
              {d.tags.map((t) => (
                <span key={t} className="chip">
                  {t}
                </span>
              ))}
            </dd>
          </>
        )}
      </dl>
      {d.affects.length > 0 && (
        <div className="dec-about">
          <span className="muted small">About</span>
          {d.affects.map((id) => {
            const name = objectName(state, id);
            return name ? (
              <button key={id} className="chip link-chip" onClick={() => onReveal(id)} title="Show on its diagram" data-testid={`decision-about-${id}`}>
                {name}
              </button>
            ) : (
              <span key={id} className="chip gone" title="Not in this version of the model">
                {id} (removed)
              </span>
            );
          })}
        </div>
      )}
      {d.extra
        .filter((s) => !s.heading)
        .map((s, i) => (
          <Prose key={i} text={s.body} />
        ))}
      <h3>Context</h3>
      {d.context ? <Prose text={d.context} /> : <p className="empty-note">Not written yet.</p>}
      <h3>{d.kind === "deferred" ? "Where it stands" : "Decision"}</h3>
      {d.decision ? <Prose text={d.decision} /> : <p className="empty-note">Not written yet.</p>}
      {d.alternatives.length > 0 && (
        <>
          <h3>{conditional ? "What we would choose instead, and when" : "Alternatives considered"}</h3>
          <div className="dec-alts">
            {d.alternatives.map((a) => (
              <div key={a.name} className="dec-alt" data-testid="decision-alternative">
                <div className="dec-alt-name">{a.name}</div>
                {a.notes && <Prose text={a.notes} />}
                {a.whyNot && (
                  <p>
                    <span className="muted">Why not now: </span>
                    {a.whyNot}
                  </p>
                )}
                {a.wouldChooseIf.length > 0 && (
                  <>
                    <div className="muted">We would choose it if:</div>
                    <ul>
                      {a.wouldChooseIf.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {d.consequences && (
        <>
          <h3>Consequences</h3>
          <Prose text={d.consequences} />
        </>
      )}
      {d.triggers.length > 0 && (
        <>
          <h3>Revisit when</h3>
          <ul className="dec-triggers">
            {d.triggers.map((t, i) => (
              <li key={i} className={t.met ? "met" : ""}>
                <label>
                  <input type="checkbox" checked={t.met} disabled={!canEdit} onChange={() => onToggleTrigger(i)} data-testid={`decision-trigger-${i}`} />
                  <span>{t.text}</span>
                </label>
                {t.alternative && <span className="muted small"> → {t.alternative}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      {d.extra
        .filter((s) => s.heading)
        .map((s) => (
          <div key={s.heading}>
            <h3>{s.heading}</h3>
            <Prose text={s.body} />
          </div>
        ))}
      <p className="muted small dec-file">
        <Icon name="file" size={12} /> architecture/decisions/{d.file}
      </p>
    </article>
  );
}
