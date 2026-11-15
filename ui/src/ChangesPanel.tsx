/**
 * Planned change (drafts): the drafts list, the draft strip, the apply dialog, the list of
 * changes against the compared version, and the read-only panel of a removed object.
 */
import { useEffect, useState } from "react";
import { api, ApiError } from "./api";
import { promptDialog } from "./dialogs";
import { Modal } from "./fields";
import { Icon } from "./icons";
import { CHANGE_COLORS, CHANGE_LABEL } from "./overlays";
import { KIND_LABEL, type AppState, type ApplyPreview, type ChangeSet, type CodingPlan, type Conflict, type DiagramEdge, type DiagramNode, type FieldChange, type ObjectChange } from "./types";

const OTHER_REF = "__other";

/** Sidebar section: the main model and each draft (a planned change); open one, or start a new
 *  draft. With git: compare with, or open (read-only), a branch, tag or commit. */
export function DraftList({
  state,
  onSwitch,
  onNewDraft,
  onCompareRef,
}: {
  state: AppState;
  onSwitch(ref: string): void;
  onNewDraft(): void;
  onCompareRef(ref: string): void;
}) {
  const [gitRef, setGitRef] = useState(state.git?.branch ?? "HEAD");
  const pickRef = async (): Promise<string | null> => {
    if (gitRef !== OTHER_REF) return gitRef;
    return promptDialog({ title: "Branch, tag or commit", placeholder: "e.g. main, v1.0, HEAD~3, a1b2c3d", confirmLabel: "Use" });
  };
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
      {state.git && (
        <div className="git-row" title="Compare with the model in a git branch, tag or commit, or open that version read-only">
          <span className="muted small">Git</span>
          <select value={gitRef} onChange={(e) => setGitRef(e.target.value)} data-testid="git-ref" aria-label="Git branch, tag or commit">
            {state.git.refs.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
            <option value={OTHER_REF}>Other…</option>
          </select>
          <button
            className="small"
            onClick={async () => {
              const r = await pickRef();
              if (r) onCompareRef(r);
            }}
            data-testid="git-compare"
          >
            Compare
          </button>
          <button
            className="small ghost"
            onClick={async () => {
              const r = await pickRef();
              if (r) onSwitch(`ref:${r}`);
            }}
            data-testid="git-open"
          >
            Open
          </button>
        </div>
      )}
    </section>
  );
}

/** A strip above the canvas whenever something other than the plain main model is shown: a
 *  draft (with Apply / Discard), a git version (read-only), or a comparison. */
export function VersionStrip({
  state,
  isDraft,
  showChanges,
  setShowChanges,
  onApply,
  onPlan,
  onDiscard,
  onStopCompare,
  onExit,
}: {
  state: AppState;
  isDraft: boolean;
  showChanges: boolean;
  setShowChanges(v: boolean): void;
  onApply(): void;
  onPlan(): void;
  onDiscard(): void;
  onStopCompare(): void;
  onExit(): void;
}) {
  const s = state.compare?.summary;
  const comparingOther = state.compare && state.compare.against !== "base";
  return (
    <div className="draft-strip" data-testid={isDraft ? "draft-banner" : "version-strip"}>
      <Icon name="layers" size={14} />
      <strong title={state.model.title}>{state.model.title}</strong>
      {state.model.ref.startsWith("ref:") && <span className="muted small">read-only</span>}
      {comparingOther && (
        <span className="small" data-testid="compare-title">
          compared with <strong>{state.compare!.title}</strong>
        </span>
      )}
      {isDraft && !comparingOther && (
        <label className="check small" title="Colour what this draft adds, changes and removes">
          <input type="checkbox" checked={showChanges} onChange={(e) => setShowChanges(e.target.checked)} data-testid="show-changes" />
          Show changes
        </label>
      )}
      {s && <SummaryChips s={s} compact />}
      {isDraft && (
        <button className="small" onClick={onPlan} title="What to build, and how much of it the code already does" data-testid="draft-plan">
          Coding plan…
        </button>
      )}
      {isDraft && !state.readOnly && (
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
      {comparingOther && (
        <button className="ghost small" onClick={onStopCompare} data-testid="stop-compare">
          Stop comparing
        </button>
      )}
      {state.model.ref !== "main" && (
        <button className="ghost small" onClick={onExit} data-testid="draft-exit">
          Back to main
        </button>
      )}
    </div>
  );
}

const SIGN: Record<string, string> = { added: "+", changed: "~", removed: "−" };

/** Counts of added / changed / removed objects; `compact` (the banner) shows "+1 ~0 −5". */
function SummaryChips({ s, compact = false }: { s: { added: number; changed: number; removed: number; layout: number; code?: number }; compact?: boolean }) {
  return (
    <span className="change-summary small" data-testid="change-summary">
      {(["added", "changed", "removed"] as const).map((k) => (
        <span key={k} className="change-count" title={`${s[k]} ${CHANGE_LABEL[k].toLowerCase()}`} data-count={k}>
          <span className="dot" style={{ background: CHANGE_COLORS[k] }} />
          {compact ? `${SIGN[k]}${s[k]}` : `${s[k]} ${CHANGE_LABEL[k].toLowerCase()}`}
        </span>
      ))}
      {(s.code ?? 0) > 0 && (
        <span className="muted" title="Code files added, changed or removed behind mapped objects" data-count="code">
          {compact ? `· ${s.code} code` : `${s.code} code file${s.code === 1 ? "" : "s"}`}
        </span>
      )}
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
  const [withCode, setWithCode] = useState(true);
  useEffect(() => {
    setPreview(null);
    api
      .applyPreview(draftId, withCode)
      .then((p) => {
        setPreview(p);
        setConflicts(p.conflicts);
      })
      .catch((e) => setError(String(e instanceof Error ? e.message : e)));
  }, [draftId, withCode]);
  const apply = async () => {
    setBusy(true);
    try {
      await api.applyDraft(draftId, withCode);
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
      {preview && preview.code.length > 0 && (
        <label className="check" title="Without this, only the model changes are applied; write the code yourself (see the coding plan)">
          <input type="checkbox" checked={withCode} onChange={(e) => setWithCode(e.target.checked)} data-testid="apply-with-code" />
          Also write the {preview.code.length} planned code edit{preview.code.length === 1 ? "" : "s"} to the code folder
        </label>
      )}
      {error && <p className="danger-text">{error}</p>}
      {conflicts.length > 0 && (
        <div data-testid="apply-conflicts">
          <h4 className="danger-text">Conflicts: the draft cannot be applied</h4>
          <p className="muted small">
            These objects or files were changed both on the main side (since the draft was made) and in the draft. Change one side so they
            agree, then apply again{preview?.code.length ? ", or apply the model only" : ""}.
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
  if (!groups.length && !changes.code.length) return <p className="muted small">No changes{changes.summary.layout ? ` (only ${changes.summary.layout} layout changes)` : ""}.</p>;
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
      {changes.code.length > 0 && (
        <div data-testid="code-changes">
          <h4>
            Code <span className="muted">{changes.summary.code} file{changes.summary.code === 1 ? "" : "s"}</span>
          </h4>
          <ul>
            {changes.code.map((c) => (
              <li key={c.ownerId || "none"}>
                <button
                  className="link change-item"
                  disabled={!onPick || !c.homeKey}
                  onClick={() => onPick?.({ id: c.ownerId, type: "setting", kind: "code", name: c.ownerName, change: "changed", fields: [], homeKey: c.homeKey })}
                  data-testid={`code-change-${c.ownerId || "none"}`}
                >
                  <span className="dot" style={{ background: CHANGE_COLORS.inner }} />
                  <span className="change-name">{c.ownerName}</span>
                  <span className="muted small">
                    {c.files.map((f) => `${f.path.split("/").pop()} ${CHANGE_LABEL[f.change].toLowerCase()}`).join(", ")}
                    {c.imports.length > 0 && ` · ${c.imports.length} import${c.imports.length === 1 ? "" : "s"} ${[...new Set(c.imports.map((i) => i.change))].join("/")}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
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

const STATUS: Record<string, { icon: string; label: string; cls: string }> = {
  done: { icon: "✓", label: "Done", cls: "done" },
  open: { icon: "○", label: "Open", cls: "open" },
  manual: { icon: "?", label: "Check by hand", cls: "manual" },
  unchecked: { icon: "·", label: "Not checked yet", cls: "unchecked" },
};

/** The draft's coding plan: what to build, and how much of it the code already does. */
export function PlanDialog({ state, draftId, onClose, onSaved }: { state: AppState; draftId: string; onClose(): void; onSaved(): void }) {
  const draft = state.drafts.find((d) => d.id === draftId);
  const [branch, setBranch] = useState(draft?.branch ?? "");
  const [against, setAgainst] = useState<string>(draft?.branch && state.git ? `ref:${draft.branch}` : "disk");
  const [plan, setPlan] = useState<CodingPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setError(null);
    api
      .plan(draftId, against === "none" ? null : against)
      .then(setPlan)
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
        if (against !== "none") setAgainst("none");
      });
  }, [draftId, against]);
  const saveBranch = async () => {
    if (branch.trim() === (draft?.branch ?? "")) return;
    try {
      await api.updateDraft(draftId, { branch: branch.trim() });
      onSaved();
      if (branch.trim() && state.git) setAgainst(`ref:${branch.trim()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const copy = async () => {
    if (!plan) return;
    try {
      await navigator.clipboard.writeText(plan.markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Copying is not allowed here; select the text in the Markdown view instead.");
    }
  };
  const work = plan?.items.filter((i) => i.status !== "info") ?? [];
  const docs = plan?.items.filter((i) => i.status === "info") ?? [];
  const sections = [...new Set(work.map((i) => i.section))];
  const [showMd, setShowMd] = useState(false);
  return (
    <Modal title={`Coding plan: ${draft?.title ?? draftId}`} onClose={onClose} wide>
      <p className="muted small">
        What the code has to do for this draft. Steps with a code path or an import between mapped objects are checked against the code;
        the rest are checked by hand. Write the code on a branch, check progress here or with <code>dp plan {draftId} --against &lt;branch&gt;</code>,
        then apply the draft.
      </p>
      <div className="row plan-controls">
        <label className="field inline">
          <span>Branch</span>
          <input value={branch} placeholder="e.g. feature/audit-log" onChange={(e) => setBranch(e.target.value)} onBlur={saveBranch} onKeyDown={(e) => e.key === "Enter" && saveBranch()} disabled={state.readOnly} data-testid="plan-branch" />
        </label>
        <label className="field inline">
          <span>Check against</span>
          <select value={against} onChange={(e) => setAgainst(e.target.value)} data-testid="plan-against">
            <option value="none">Not checked</option>
            <option value="disk">The code folder (working copy)</option>
            {state.git && draft?.branch && <option value={`ref:${draft.branch}`}>Branch {draft.branch}</option>}
          </select>
        </label>
      </div>
      {error && <p className="danger-text">{error}</p>}
      {plan?.checkedAgainst && (
        <p data-testid="plan-summary">
          Checked against {plan.checkedAgainst}: <strong>{plan.summary.done} done</strong> · {plan.summary.open} open · {plan.summary.manual} to check by hand
        </p>
      )}
      {plan && !work.length && <p className="muted">No code work: the draft changes only the model's documentation.</p>}
      {plan && !showMd && (
        <div className="plan-list" data-testid="plan-list">
          {sections.map((s) => (
            <div key={s}>
              <h4>{s}</h4>
              <ul>
                {work.filter((i) => i.section === s).map((i) => (
                  <li key={i.id} className={`plan-item ${STATUS[i.status].cls}`} data-testid={`plan-${i.id}`} data-status={i.status}>
                    <span className="plan-status" title={STATUS[i.status].label}>{STATUS[i.status].icon}</span>
                    <div>
                      <div className="plan-title">{i.title}</div>
                      {i.details.map((d, k) => (
                        <div key={k} className="muted small">{d}</div>
                      ))}
                      {i.evidence && <div className="small plan-evidence">{i.evidence}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {docs.length > 0 && (
            <div>
              <h4>Model-only changes (no code work)</h4>
              <ul>
                {docs.map((i) => (
                  <li key={i.id} className="muted small">{i.title}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {plan && showMd && <textarea className="code-editor" readOnly value={plan.markdown} data-testid="plan-markdown" />}
      <div className="modal-actions">
        <button className="ghost" onClick={() => setShowMd(!showMd)}>{showMd ? "Show list" : "Show Markdown"}</button>
        <span className="spacer" />
        <button onClick={copy} disabled={!plan} data-testid="plan-copy">{copied ? "Copied" : "Copy Markdown"}</button>
        <button className="primary" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
