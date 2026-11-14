/**
 * Planned change (drafts): the drafts list, the draft strip, the apply dialog, the list of
 * changes against the compared version, and the read-only panel of a removed object.
 */
import { useEffect, useState } from "react";
import { api, ApiError } from "./api";
import { Modal } from "./fields";
import { Icon } from "./icons";
import { CHANGE_COLORS, CHANGE_LABEL } from "./overlays";
import { KIND_LABEL, type AppState, type ApplyPreview, type ChangeSet, type Conflict, type DiagramEdge, type DiagramNode, type FieldChange, type ObjectChange } from "./types";

/** Sidebar section: the main model and each draft (a planned change); open one, or start a new draft. */
export function DraftList({ state, onSwitch, onNewDraft }: { state: AppState; onSwitch(ref: string): void; onNewDraft(): void }) {
  const items = [{ ref: "main", label: "Main model", sub: "" }, ...state.drafts.map((d) => ({ ref: `draft:${d.id}`, label: d.title, sub: d.created }))];
  return (
    <section data-testid="draft-list">
      <h3 title="A draft is a planned change: a copy of the model you edit, compare and then apply or discard">Drafts</h3>
      <ul className="tree">
        {items.map((it) => (
          <li key={it.ref}>
            <button
              className={`link ${it.ref === state.model.ref ? "active" : ""}`}
              onClick={() => it.ref !== state.model.ref && onSwitch(it.ref)}
              data-testid={it.ref === "main" ? "draft-main" : `draft-${it.ref.slice(6)}`}
              title={it.ref === "main" ? "The model in architecture/" : `Draft in architecture/drafts/${it.ref.slice(6)}/`}
            >
              {it.label} {it.sub && <span className="muted small">{it.sub}</span>}
            </button>
          </li>
        ))}
      </ul>
      {!state.readOnly && (
        <button className="add" onClick={onNewDraft} data-testid="new-draft">
          + New draft
        </button>
      )}
    </section>
  );
}

/** A strip above the canvas while a draft is open: what it is, its changes, and Apply / Discard. */
export function DraftBanner({
  state,
  showChanges,
  setShowChanges,
  onApply,
  onDiscard,
  onExit,
}: {
  state: AppState;
  showChanges: boolean;
  setShowChanges(v: boolean): void;
  onApply(): void;
  onDiscard(): void;
  onExit(): void;
}) {
  const s = state.compare?.summary;
  return (
    <div className="draft-strip" data-testid="draft-banner">
      <Icon name="layers" size={14} />
      <strong title={state.model.title}>{state.model.title}</strong>
      <label className="check small" title="Colour what this draft adds, changes and removes">
        <input type="checkbox" checked={showChanges} onChange={(e) => setShowChanges(e.target.checked)} data-testid="show-changes" />
        Show changes
      </label>
      {s && <SummaryChips s={s} compact />}
      {!state.readOnly && (
        <>
          <button className="primary small" onClick={onApply} data-testid="draft-apply">
            Apply…
          </button>
          <button className="small" onClick={onDiscard} data-testid="draft-discard">
            Discard
          </button>
        </>
      )}
      <span className="spacer" />
      <button className="ghost small" onClick={onExit} data-testid="draft-exit">
        Back to main
      </button>
    </div>
  );
}

const SIGN: Record<string, string> = { added: "+", changed: "~", removed: "−" };

/** Counts of added / changed / removed objects; `compact` (the banner) shows "+1 ~0 −5". */
function SummaryChips({ s, compact = false }: { s: { added: number; changed: number; removed: number; layout: number }; compact?: boolean }) {
  return (
    <span className="change-summary small" data-testid="change-summary">
      {(["added", "changed", "removed"] as const).map((k) => (
        <span key={k} className="change-count" title={`${s[k]} ${CHANGE_LABEL[k].toLowerCase()}`} data-count={k}>
          <span className="dot" style={{ background: CHANGE_COLORS[k] }} />
          {compact ? `${SIGN[k]}${s[k]}` : `${s[k]} ${CHANGE_LABEL[k].toLowerCase()}`}
        </span>
      ))}
      {s.layout > 0 && <span className="muted" title="Moved or resized boxes, line shapes, styles">{compact ? `· ${s.layout} layout` : `and ${s.layout} layout changes`}</span>}
    </span>
  );
}

/** Confirm applying a draft: what main will get, and conflicts that stop it. */
export function ApplyDialog({ draftId, title, onClose, onApplied }: { draftId: string; title: string; onClose(): void; onApplied(): void }) {
  const [preview, setPreview] = useState<ApplyPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api
      .applyPreview(draftId)
      .then((p) => {
        setPreview(p);
        setConflicts(p.conflicts);
      })
      .catch((e) => setError(String(e instanceof Error ? e.message : e)));
  }, [draftId]);
  const apply = async () => {
    setBusy(true);
    try {
      await api.applyDraft(draftId);
      onApplied();
    } catch (e) {
      if (e instanceof ApiError && e.conflicts.length) setConflicts(e.conflicts);
      else setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const cs = preview?.changes;
  const empty = cs && cs.summary.added + cs.summary.changed + cs.summary.removed + cs.summary.layout === 0;
  return (
    <Modal title={`Apply "${title}" to the main model`} onClose={onClose} wide>
      {!preview && !error && <p className="muted">Checking…</p>}
      {error && <p className="danger-text">{error}</p>}
      {conflicts.length > 0 && (
        <div data-testid="apply-conflicts">
          <h4 className="danger-text">Conflicts: the draft cannot be applied</h4>
          <p className="muted small">
            These objects were changed both in the main model (since the draft was made) and in the draft. Change one side so they agree, then
            apply again.
          </p>
          <ul className="conflict-list">
            {conflicts.map((c, i) => (
              <li key={i}>
                <strong>{c.label}</strong>: {c.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      {cs && conflicts.length === 0 && (
        <>
          <p>
            The main model will get these changes. Changes made to the main model since the draft was made are kept. Applying is one step you
            can undo; the draft is then removed.
          </p>
          <SummaryChips s={cs.summary} />
          {empty ? <p className="muted">The draft changes nothing.</p> : <ChangeList changes={cs} />}
        </>
      )}
      <div className="modal-actions">
        <button onClick={onClose}>Cancel</button>
        <button className="primary" onClick={apply} disabled={!preview || conflicts.length > 0 || busy} data-testid="apply-confirm">
          Apply
        </button>
      </div>
    </Modal>
  );
}

const TYPE_LABEL: Record<string, string> = { elements: "Elements", relationships: "Relationships", flows: "Flows", settings: "Settings" };

/** Every change, grouped by type. Clicking one opens the diagram that shows it. */
export function ChangeList({ changes, onPick }: { changes: ChangeSet; onPick?(c: ObjectChange): void }) {
  const groups = (["elements", "relationships", "flows", "settings"] as const).filter((g) => changes[g].length);
  if (!groups.length) return <p className="muted small">No changes{changes.summary.layout ? ` (only ${changes.summary.layout} layout changes)` : ""}.</p>;
  return (
    <div className="change-list" data-testid="change-list">
      {groups.map((g) => (
        <div key={g}>
          <h4>
            {TYPE_LABEL[g]} <span className="muted">{changes[g].length}</span>
          </h4>
          <ul>
            {changes[g].map((c) => (
              <li key={`${c.type}-${c.id}`}>
                <button
                  className="link change-item"
                  disabled={!onPick || !c.homeKey}
                  onClick={() => onPick?.(c)}
                  title={c.fields.map((f) => f.label).join(", ") || undefined}
                  data-testid={`change-${c.id}`}
                >
                  <span className="dot" style={{ background: CHANGE_COLORS[c.change] }} />
                  <span className="change-name">{c.name}</span>
                  <span className="muted small">
                    {kindLabel(c)} · {CHANGE_LABEL[c.change].toLowerCase()}
                    {c.fields.length > 0 && `: ${c.fields.map((f) => f.label.toLowerCase()).join(", ")}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function kindLabel(c: ObjectChange): string {
  if (c.type === "element") return KIND_LABEL[c.kind as keyof typeof KIND_LABEL] ?? c.kind;
  if (c.type === "relationship") return "Relationship";
  if (c.type === "flow") return "Flow";
  return "Setting";
}

/** Field-by-field changes of one object, shown at the top of its panel. */
export function ChangeDetails({ change, against }: { change: ObjectChange; against: string }) {
  return (
    <div className={`change-box ${change.change}`} data-testid="change-details" style={{ ["--chip" as string]: CHANGE_COLORS[change.change] }}>
      <div className="change-box-head">
        <span className="dot" style={{ background: CHANGE_COLORS[change.change] }} />
        {CHANGE_LABEL[change.change]} <span className="muted">compared with {against}</span>
      </div>
      {change.fields.map((f) => (
        <FieldDiff key={f.field} f={f} />
      ))}
    </div>
  );
}

function FieldDiff({ f }: { f: FieldChange }) {
  if (f.field === "other") return <div className="small muted">Other stored data changed.</div>;
  return (
    <div className="field-diff small">
      <div className="muted">{f.label}</div>
      <div className="before" title="Before">
        {show(f.before)}
      </div>
      <div className="after" title="After">
        {show(f.after)}
      </div>
    </div>
  );
}

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    if (!v.length) return "—";
    if (v.every((x) => typeof x === "string")) return v.join(", ");
    return v.map((x) => (typeof x === "object" && x ? Object.values(x).filter((y) => typeof y === "string" || typeof y === "number").join(" · ") : String(x))).join("; ");
  }
  if (typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>);
    return entries.length ? entries.map(([k, x]) => `${k}: ${String(x)}`).join(", ") : "—";
  }
  return String(v);
}

/** A box or line that only the compared version has. */
export function GhostPanel({ node, edge, change, against }: { node?: DiagramNode; edge?: DiagramEdge; change?: ObjectChange; against: string }) {
  return (
    <div className="panel-body" data-testid="ghost-panel">
      <div className="panel-kind">{node ? KIND_LABEL[node.kind] : "Relationship"} · not in this version</div>
      <h2 className="panel-title">{node ? node.name : edge?.description || "Relationship"}</h2>
      {node?.description && <p>{node.description}</p>}
      {(node?.technologies.length ?? 0) > 0 && <p className="muted small">{node!.technologies.join(", ")}</p>}
      <p className="muted small">
        {change?.change === "removed"
          ? `Removed: it exists in ${against} but not in the version you are looking at.`
          : `Not on this diagram any more (it is still in the model, shown on another diagram).`}
      </p>
    </div>
  );
}
