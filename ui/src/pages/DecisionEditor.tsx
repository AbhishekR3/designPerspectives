/** The form for one decision record: fields change with the kind (REC-04). Saves the whole record at once. */

import { useEffect, useState } from "react";
import { TagInput } from "../panels/formParts";
import { Icon } from "../common/icons";
import { objectName } from "./DecisionsPage";
import {
  DECISION_KIND_INFO,
  DECISION_KINDS,
  DECISION_STATUS_LABEL,
  DECISION_STATUSES,
  type AppState,
  type Decision,
  type DecisionAlternative,
  type DecisionKind,
  type DecisionStatus,
  type DecisionTrigger,
} from "../types";

/** Text that looks like a credential. Decision records are committed to git, so they must not hold one. */
const SECRET_TEXT = /\b(pass(word|wd)?|secret|token|api[-_ ]?key|private[-_ ]?key)\b\s*[:=]\s*\S{6,}|\b(sk|pk|ghp|gho|xox[abp]|AKIA)[-_]?[A-Za-z0-9]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/i;

const lines = (s: string) =>
  s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

interface Props {
  d: Decision;
  state: AppState;
  all: Decision[];
  onCancel(): void;
  onSave(body: Partial<Decision>): Promise<boolean>;
  /** Told whenever the form starts or stops differing from the stored decision (the page asks before dropping changes). */
  onDirty?(dirty: boolean): void;
}

export function DecisionEditor({ d, state, all, onCancel, onSave, onDirty }: Props) {
  const [f, setF] = useState<Decision>(() => structuredClone(d));
  // Conditions are edited as one line each.
  const [conds, setConds] = useState<string[]>(() => d.alternatives.map((a) => a.wouldChooseIf.join("\n")));
  const [busy, setBusy] = useState(false);
  const [first] = useState(() => JSON.stringify([f, conds]));
  const dirty = JSON.stringify([f, conds]) !== first;
  useEffect(() => {
    onDirty?.(dirty);
    return () => onDirty?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a change of `dirty` is reported
  }, [dirty]);
  const set = <K extends keyof Decision>(k: K, v: Decision[K]) => setF((x) => ({ ...x, [k]: v }));
  const setAlt = (i: number, patch: Partial<DecisionAlternative>) =>
    set(
      "alternatives",
      f.alternatives.map((a, j) => (j === i ? { ...a, ...patch } : a)),
    );
  const setTrigger = (i: number, patch: Partial<DecisionTrigger>) =>
    set(
      "triggers",
      f.triggers.map((t, j) => (j === i ? { ...t, ...patch } : t)),
    );
  const kind = f.kind;
  const hint = DECISION_KIND_INFO[kind].hint;

  const alternatives = () => f.alternatives.map((a, i) => ({ ...a, wouldChooseIf: lines(conds[i] ?? "") }));
  const body = (): Partial<Decision> => ({
    title: f.title,
    status: f.status,
    kind: f.kind,
    date: f.date,
    deciders: f.deciders,
    affects: f.affects,
    supersedes: f.supersedes,
    tags: f.tags,
    reviewBy: f.reviewBy,
    decideBy: f.decideBy,
    expires: f.expires,
    appliesTo: f.appliesTo,
    context: f.context,
    decision: f.decision,
    alternatives: alternatives().filter((a) => a.name.trim()),
    consequences: f.consequences,
    triggers: f.triggers.filter((t) => t.text.trim()),
  });
  const secret = SECRET_TEXT.test(JSON.stringify(body()));

  /** Every condition of every alternative becomes a revisit trigger (once). */
  const copyConditions = () => {
    const have = new Set(f.triggers.map((t) => t.text));
    const add: DecisionTrigger[] = [];
    alternatives().forEach((a) => a.wouldChooseIf.forEach((c) => !have.has(c) && (have.add(c), add.push({ text: c, met: false, alternative: a.name }))));
    set("triggers", [...f.triggers, ...add]);
  };
  const anyConditions = conds.some((c) => lines(c).length);

  const objects = [...state.elements.map((e) => ({ id: e.id, label: e.name })), ...state.relationships.map((r) => ({ id: r.id, label: objectName(state, r.id) ?? r.id }))];
  const others = all.filter((x) => x.id !== d.id && !x.error);

  return (
    <form
      className="dec-editor"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        void onSave(body()).finally(() => setBusy(false));
      }}
      data-testid="decision-editor"
    >
      <div className="dec-record-top">
        <span className="dec-num">{d.id}</span>
        <span className="muted">Editing</span>
        <span className="grow" />
        <button type="button" className="ghost" onClick={onCancel} data-testid="decision-cancel">
          Cancel
        </button>
        <button type="submit" className="primary" disabled={busy || !f.title.trim()} data-testid="decision-save">
          Save
        </button>
      </div>

      <label className="field">
        <span>Title</span>
        <input value={f.title} onChange={(e) => set("title", e.target.value)} data-testid="decision-title" />
      </label>
      <div className="dec-grid">
        <label className="field">
          <span>Kind</span>
          <select value={kind} onChange={(e) => set("kind", e.target.value as DecisionKind)} data-testid="decision-kind">
            {DECISION_KINDS.map((k) => (
              <option key={k} value={k}>
                {DECISION_KIND_INFO[k].label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select value={f.status} onChange={(e) => set("status", e.target.value as DecisionStatus)} data-testid="decision-status">
            {DECISION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {DECISION_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Date</span>
          <input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} />
        </label>
        <label className="field">
          <span>Review by</span>
          <input type="date" value={f.reviewBy} onChange={(e) => set("reviewBy", e.target.value)} data-testid="decision-review-by" />
        </label>
        {(kind === "deferred" || f.decideBy) && (
          <label className="field">
            <span>Decide by</span>
            <input type="date" value={f.decideBy} onChange={(e) => set("decideBy", e.target.value)} data-testid="decision-decide-by" />
          </label>
        )}
        {(kind === "time-boxed" || f.expires) && (
          <label className="field">
            <span>Expires</span>
            <input type="date" value={f.expires} onChange={(e) => set("expires", e.target.value)} data-testid="decision-expires" />
          </label>
        )}
      </div>
      <p className="muted small dec-hint">
        <strong>{DECISION_KIND_INFO[kind].label}:</strong> {hint}
      </p>
      {(kind === "policy" || f.appliesTo) && (
        <label className="field">
          <span>Applies to</span>
          <input value={f.appliesTo} onChange={(e) => set("appliesTo", e.target.value)} placeholder="e.g. every service that stores personal data" data-testid="decision-applies-to" />
        </label>
      )}
      <TagInput label="Decided by" value={f.deciders} suggestions={[...new Set(all.flatMap((x) => x.deciders))]} onChange={(v) => set("deciders", v)} placeholder="Add a person or team…" />
      <div className="field">
        <span>About</span>
        <div className="chips">
          {f.affects.map((id) => (
            <span className="chip" key={id}>
              {objectName(state, id) ?? `${id} (removed)`}
              <button
                type="button"
                className="icon"
                aria-label="Remove"
                onClick={() =>
                  set(
                    "affects",
                    f.affects.filter((x) => x !== id),
                  )
                }
              >
                ×
              </button>
            </span>
          ))}
          <select
            value=""
            onChange={(e) => e.target.value && set("affects", [...f.affects, e.target.value])}
            aria-label="Add an element or relationship"
            className="chip-input"
            data-testid="decision-affects-add"
          >
            <option value="">Add an element or relationship…</option>
            {objects
              .filter((o) => !f.affects.includes(o.id))
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
          </select>
        </div>
      </div>
      {(kind === "reversal" || f.supersedes.length > 0) && (
        <div className="field">
          <span>Replaces</span>
          <div className="chips">
            {f.supersedes.map((id) => (
              <span className="chip" key={id}>
                {id} {all.find((x) => x.id === id)?.title}
                <button
                  type="button"
                  className="icon"
                  aria-label="Remove"
                  onClick={() =>
                    set(
                      "supersedes",
                      f.supersedes.filter((x) => x !== id),
                    )
                  }
                >
                  ×
                </button>
              </span>
            ))}
            <select
              value=""
              onChange={(e) => e.target.value && set("supersedes", [...f.supersedes, e.target.value])}
              aria-label="Replaces decision"
              className="chip-input"
              data-testid="decision-supersedes-add"
            >
              <option value="">Add a decision this replaces…</option>
              {others
                .filter((o) => !f.supersedes.includes(o.id))
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.id} {o.title}
                  </option>
                ))}
            </select>
          </div>
          <span className="muted small">When this decision is accepted, the ones it replaces are marked superseded.</span>
        </div>
      )}
      <TagInput label="Tags" value={f.tags} suggestions={[...new Set(all.flatMap((x) => x.tags))]} onChange={(v) => set("tags", v)} placeholder="Add a tag…" />

      <label className="field">
        <span>Context</span>
        <textarea rows={4} value={f.context} onChange={(e) => set("context", e.target.value)} placeholder="What is the situation, and what forces are at play?" data-testid="decision-context" />
      </label>
      <label className="field">
        <span>{kind === "deferred" ? "Where it stands" : "Decision"}</span>
        <textarea
          rows={4}
          value={f.decision}
          onChange={(e) => set("decision", e.target.value)}
          placeholder={kind === "deferred" ? "What is missing before this can be decided, and the current thinking." : kind === "policy" ? "The rule." : "What we chose."}
          data-testid="decision-decision"
        />
      </label>

      <div className="field">
        <span>{kind === "conditional" ? "What we would choose instead, and when" : "Alternatives considered"}</span>
        <div className="dec-alts edit">
          {f.alternatives.map((a, i) => (
            <div key={i} className="dec-alt" data-testid={`decision-alt-${i}`}>
              <div className="row">
                <input
                  value={a.name}
                  onChange={(e) => setAlt(i, { name: e.target.value })}
                  placeholder="Option, e.g. Streaming pipeline"
                  aria-label="Alternative"
                  data-testid={`decision-alt-${i}-name`}
                />
                <button
                  type="button"
                  className="ghost icon"
                  aria-label="Remove this alternative"
                  title="Remove this alternative"
                  onClick={() => {
                    set(
                      "alternatives",
                      f.alternatives.filter((_, j) => j !== i),
                    );
                    setConds(conds.filter((_, j) => j !== i));
                  }}
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
              <label className="field">
                <span>Why not now</span>
                <textarea rows={2} value={a.whyNot} onChange={(e) => setAlt(i, { whyNot: e.target.value })} data-testid={`decision-alt-${i}-why`} />
              </label>
              <label className="field">
                <span>We would choose it if… (one condition per line)</span>
                <textarea
                  rows={2}
                  value={conds[i] ?? ""}
                  onChange={(e) => setConds(Object.assign([...conds], { [i]: e.target.value }))}
                  placeholder="we had a platform team on call"
                  data-testid={`decision-alt-${i}-if`}
                />
              </label>
              {a.notes && (
                <label className="field">
                  <span>Notes</span>
                  <textarea rows={2} value={a.notes} onChange={(e) => setAlt(i, { notes: e.target.value })} />
                </label>
              )}
            </div>
          ))}
          <button
            type="button"
            className="add"
            onClick={() => {
              set("alternatives", [...f.alternatives, { name: "", whyNot: "", wouldChooseIf: [], notes: "" }]);
              setConds([...conds, ""]);
            }}
            data-testid="decision-alt-add"
          >
            + Add an alternative
          </button>
        </div>
      </div>

      <label className="field">
        <span>Consequences</span>
        <textarea rows={3} value={f.consequences} onChange={(e) => set("consequences", e.target.value)} placeholder="What becomes easier or harder because of this." />
      </label>

      <div className="field">
        <span>Revisit when</span>
        <ul className="dec-triggers edit">
          {f.triggers.map((t, i) => (
            <li key={i}>
              <input type="checkbox" checked={t.met} onChange={(e) => setTrigger(i, { met: e.target.checked })} aria-label="Happened" title="It happened" />
              <input
                value={t.text}
                onChange={(e) => setTrigger(i, { text: e.target.value })}
                placeholder="Something that would change the answer"
                aria-label="Trigger"
                data-testid={`decision-trigger-${i}-text`}
              />
              <select value={t.alternative} onChange={(e) => setTrigger(i, { alternative: e.target.value })} aria-label="Would favour">
                <option value="">—</option>
                {f.alternatives
                  .filter((a) => a.name.trim())
                  .map((a) => (
                    <option key={a.name} value={a.name}>
                      → {a.name}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                className="ghost icon"
                aria-label="Remove this trigger"
                onClick={() =>
                  set(
                    "triggers",
                    f.triggers.filter((_, j) => j !== i),
                  )
                }
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="row">
          <button type="button" className="add" onClick={() => set("triggers", [...f.triggers, { text: "", met: false, alternative: "" }])} data-testid="decision-trigger-add">
            + Add a trigger
          </button>
          {anyConditions && (
            <button type="button" className="add" onClick={copyConditions} title="Each condition under the alternatives becomes a trigger to watch" data-testid="decision-copy-conditions">
              + Watch the alternatives' conditions
            </button>
          )}
        </div>
      </div>

      {secret && (
        <p className="warn-note" data-testid="decision-secret-warning">
          <Icon name="warning" size={14} /> This text looks like it contains a password or key. Decision records are committed to git: remove it before saving.
        </p>
      )}
    </form>
  );
}
