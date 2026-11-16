/**
 * Planned change (drafts): the drafts list, the draft strip, the apply dialog, the list of
 * changes against the compared version, and the read-only panel of a removed object.
 */
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import { promptDialog } from "./dialogs";
import { errorMessage } from "./notify";
import { Modal } from "./fields";
import { Icon } from "./icons";
import { CHANGE_COLORS, CHANGE_LABEL } from "./overlays";
import {
  KIND_LABEL,
  DECISION_KIND_INFO,
  type AppState,
  type ApplyPreview,
  type DecisionKind,
  type DraftInfo,
  type ChangeSet,
  type CodingPlan,
  type Conflict,
  type DiagramEdge,
  type DiagramNode,
  type FieldChange,
  type ObjectChange,
} from "./types";

const OTHER_REF = "__other";

/** Muted "main +N": the main model changed N objects since the draft started. */
export function BehindBadge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span
      className="behind-badge muted small"
      title={`The main model changed ${n} object${n === 1 ? "" : "s"} since this draft started. Apply merges them; conflicts are shown first.`}
      data-testid="draft-behind"
    >
      main +{n}
    </span>
  );
}

/** One draft in the sidebar: title, author and date, and a "⋯" menu (also on right-click). */
function DraftRow({
  d,
  active,
  canEditDraft,
  onOpen,
  onRename,
  onEditDescription,
  onDiscard,
}: {
  d: DraftInfo;
  active: boolean;
  canEditDraft: boolean;
  onOpen(): void;
  onRename(): void;
  onEditDescription(): void;
  onDiscard(): void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) wrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);
  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  // Rename and Edit description are draft edits (engineers and architects); Discard is for the author or an architect.
  const canDiscard = d.canDiscard ?? canEditDraft;
  const hasMenu = canEditDraft || canDiscard;
  const by = [d.author, d.created].filter(Boolean).join(" · ");
  return (
    <li className="draft-row" onContextMenu={!hasMenu ? undefined : (e) => (e.preventDefault(), setOpen(true))}>
      <button
        className={`link draft-title ${active ? "active" : ""}`}
        onClick={onOpen}
        data-testid={`draft-${d.id}`}
        title={`${d.title}${d.description ? `\n${d.description}` : ""}\nDraft in architecture/drafts/${d.id}/`}
      >
        {d.title}
      </button>
      {hasMenu && (
        <span
          className="draft-menu-wrap"
          ref={wrap}
          onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && open) {
              e.stopPropagation();
              setOpen(false);
              toggle.current?.focus();
            }
          }}
        >
          <button
            ref={toggle}
            className="ghost icon"
            onClick={() => setOpen(!open)}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={`Actions for ${d.title}`}
            title="Rename, edit the description, discard"
            data-testid={`draft-menu-${d.id}`}
          >
            ⋯
          </button>
          {open && (
            <div className="pop-menu right" role="menu" data-testid={`draft-menu-popup-${d.id}`}>
              {canEditDraft && (
                <>
                  <button role="menuitem" onClick={pick(onRename)} data-testid="draft-rename">
                    Rename…
                  </button>
                  <button role="menuitem" onClick={pick(onEditDescription)} data-testid="draft-edit-description">
                    Edit description…
                  </button>
                </>
              )}
              {canDiscard && (
                <button role="menuitem" className="danger-text" onClick={pick(onDiscard)} data-testid="draft-discard">
                  Discard…
                </button>
              )}
            </div>
          )}
        </span>
      )}
      <div className="draft-sub muted small">
        {by}
        {by && d.behind > 0 && " "}
        <BehindBadge n={d.behind} />
      </div>
    </li>
  );
}

/** Sidebar section: the main model and each draft (a planned change); open one, or start a new
 *  draft. With git: compare with, or open (read-only), a branch, tag or commit. */
export function DraftList({
  state,
  onSwitch,
  onNewDraft,
  onCompareRef,
  onRename,
  onEditDescription,
  onDiscard,
}: {
  state: AppState;
  onSwitch(ref: string): void;
  onNewDraft(): void;
  onCompareRef(ref: string): void;
  onRename(d: DraftInfo): void;
  onEditDescription(d: DraftInfo): void;
  onDiscard(d: DraftInfo): void;
}) {
  const [gitRef, setGitRef] = useState(state.git?.branch ?? "HEAD");
  const pickRef = async (): Promise<string | null> => {
    if (gitRef !== OTHER_REF) return gitRef;
    return promptDialog({ title: "Branch, tag or commit", placeholder: "e.g. main, v1.0, HEAD~3, a1b2c3d", confirmLabel: "Use" });
  };
  return (
    <section data-testid="draft-list">
      <h3 title="A draft is a planned change: a copy of the model you edit, compare and then apply or discard">Drafts</h3>
      <ul className="tree">
        <li>
          <button
            className={`link ${state.model.ref === "main" ? "active" : ""}`}
            onClick={() => state.model.ref !== "main" && onSwitch("main")}
            data-testid="draft-main"
            title="The model in architecture/"
          >
            Main model
          </button>
        </li>
        {state.drafts.map((d) => (
          <DraftRow
            key={d.id}
            d={d}
            active={state.model.ref === `draft:${d.id}`}
            canEditDraft={state.can.createDraft}
            onOpen={() => state.model.ref !== `draft:${d.id}` && onSwitch(`draft:${d.id}`)}
            onRename={() => onRename(d)}
            onEditDescription={() => onEditDescription(d)}
            onDiscard={() => onDiscard(d)}
          />
        ))}
      </ul>
      {state.can.createDraft && (
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
      <strong className="strip-title" title={state.model.title} data-testid="strip-title">
        {state.model.title}
      </strong>
      <div className="strip-meta">
        {state.model.ref.startsWith("ref:") && <span className="muted small">read-only</span>}
        {comparingOther && (
          <span className="small truncate" data-testid="compare-title" title={`compared with ${state.compare!.title}`}>
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
        {isDraft && <BehindBadge n={state.drafts.find((d) => `draft:${d.id}` === state.model.ref)?.behind ?? 0} />}
      </div>
      <div className="strip-actions">
        {isDraft && (
          <button className="small" onClick={onPlan} title="What to build, and how much of it the code already does" data-testid="draft-plan">
            Coding plan…
          </button>
        )}
        {isDraft && state.can.applyDraft && (
          <button className="primary small" onClick={onApply} data-testid="draft-apply">
            Apply…
          </button>
        )}
        {isDraft && !state.can.applyDraft && state.can.createDraft && (
          <span className="muted small" data-testid="draft-apply-note">
            An architect applies drafts.
          </span>
        )}
        {isDraft && state.can.discardDraft && (
          <button className="small" onClick={onDiscard} data-testid="draft-discard">
            Discard
          </button>
        )}
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
      {s.layout > 0 && (
        <span className="muted" title="Moved or resized boxes, line shapes, styles">
          {compact ? `· ${s.layout} layout` : `and ${s.layout} layout changes`}
        </span>
      )}
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
    // The answers of an earlier choice (conflicts, an error) do not belong to this one.
    setPreview(null);
    setConflicts([]);
    setError(null);
    let current = true;
    api
      .applyPreview(draftId, withCode)
      .then((p) => {
        if (!current) return;
        setPreview(p);
        setConflicts(p.conflicts);
      })
      .catch((e) => current && setError(errorMessage(e)));
    return () => {
      current = false;
    };
  }, [draftId, withCode]);
  const apply = async () => {
    setBusy(true);
    try {
      await api.applyDraft(draftId, withCode);
      onApplied();
    } catch (e) {
      if (e instanceof ApiError && e.conflicts.length) setConflicts(e.conflicts);
      else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const cs = preview?.changes;
  const empty = cs && cs.summary.added + cs.summary.changed + cs.summary.removed + cs.summary.layout + cs.summary.code === 0;
  const writesCode = withCode && !!preview && preview.code.length > 0;
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
            These objects or files were changed both on the main side (since the draft was made) and in the draft. Change one side so they agree, then apply again
            {preview?.code.length ? ", or apply the model only" : ""}.
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
            The main model will get these changes; changes made to it since the draft was made are kept.{" "}
            {writesCode
              ? "The code edits are written to the code folder and the draft is deleted. Undo restores the model only, not those files or the draft."
              : "The draft is then deleted. Undo restores the model, not the draft."}
          </p>
          <SummaryChips s={cs.summary} />
          {empty ? <p className="muted">The draft changes nothing.</p> : <ChangeList changes={cs} />}
        </>
      )}
      <div className="modal-actions">
        <button onClick={onClose}>Cancel</button>
        <button className="primary" onClick={apply} disabled={!preview || conflicts.length > 0 || busy} aria-busy={busy} data-testid="apply-confirm">
          Apply
        </button>
      </div>
    </Modal>
  );
}

const TYPE_LABEL: Record<string, string> = { elements: "Elements", relationships: "Relationships", flows: "Flows", decisions: "Decisions", settings: "Settings" };

/** Every change, grouped by type. Clicking one opens the diagram that shows it (a decision: the decision). */
export function ChangeList({ changes, onPick }: { changes: ChangeSet; onPick?(c: ObjectChange): void }) {
  const groups = (["elements", "relationships", "flows", "decisions", "settings"] as const).filter((g) => changes[g]?.length);
  if (!groups.length && !changes.code.length) return <p className="empty-note">No changes{changes.summary.layout ? ` (only ${changes.summary.layout} layout changes)` : ""}.</p>;
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
                  disabled={!onPick || (!c.homeKey && !(c.type === "decision" && c.change !== "removed"))}
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
            Code{" "}
            <span className="muted">
              {changes.summary.code} file{changes.summary.code === 1 ? "" : "s"}
            </span>
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
  if (c.type === "decision") return `${DECISION_KIND_INFO[c.kind as DecisionKind]?.label ?? c.kind} decision`;
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
    return v
      .map((x) =>
        typeof x === "object" && x
          ? Object.values(x)
              .filter((y) => typeof y === "string" || typeof y === "number")
              .join(" · ")
          : String(x),
      )
      .join("; ");
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
  const copiedTimer = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);
  // The branch last saved (or being saved), so Enter followed by the blur it causes saves once.
  const savedBranch = useRef(draft?.branch ?? "");
  useEffect(() => {
    let current = true;
    setError(null);
    setPlan(null);
    api
      .plan(draftId, against === "none" ? null : against)
      .then((p) => current && setPlan(p))
      .catch((e) => {
        if (!current) return;
        setError(`The check failed: ${errorMessage(e)}`);
        // Still show the steps, unchecked, under the error.
        if (against !== "none")
          api
            .plan(draftId, null)
            .then((p) => current && setPlan(p))
            .catch(() => undefined);
      });
    return () => {
      current = false;
    };
  }, [draftId, against]);
  const saveBranch = async () => {
    const v = branch.trim();
    if (v === savedBranch.current) return;
    const before = savedBranch.current;
    savedBranch.current = v;
    try {
      await api.updateDraft(draftId, { branch: v });
      onSaved();
      if (v && state.git) setAgainst(`ref:${v}`);
    } catch (e) {
      savedBranch.current = before;
      setError(errorMessage(e));
    }
  };
  const copy = async () => {
    if (!plan) return;
    try {
      await navigator.clipboard.writeText(plan.markdown);
      setCopied(true);
      window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 1500);
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
        What the code has to do for this draft. Steps with a code path or an import between mapped objects are checked against the code; the rest are checked by hand. Write the code on a branch, check
        progress here or with <code>dp plan {draftId} --against &lt;branch&gt;</code>, then apply the draft.
      </p>
      <div className="row plan-controls">
        <label className="field inline">
          <span>Branch</span>
          <input
            value={branch}
            placeholder="e.g. feature/audit-log"
            onChange={(e) => setBranch(e.target.value)}
            onBlur={() => void saveBranch()}
            onKeyDown={(e) => e.key === "Enter" && void saveBranch()}
            disabled={!state.can.createDraft}
            data-testid="plan-branch"
          />
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
      {!plan && !error && (
        <p className="muted" data-testid="plan-loading">
          Checking…
        </p>
      )}
      {error && (
        <p className="danger-text" data-testid="plan-error">
          {error}
        </p>
      )}
      {plan?.checkedAgainst && (
        <p data-testid="plan-summary">
          Checked against {plan.checkedAgainst}: <strong>{plan.summary.done} done</strong> · {plan.summary.open} open · {plan.summary.manual} to check by hand
        </p>
      )}
      {plan && !work.length && <p className="empty-note">No code work: the draft changes only the model's documentation.</p>}
      {plan && !showMd && (
        <div className="plan-list" data-testid="plan-list">
          {sections.map((s) => (
            <div key={s}>
              <h4>{s}</h4>
              <ul>
                {work
                  .filter((i) => i.section === s)
                  .map((i) => (
                    <li key={i.id} className={`plan-item ${STATUS[i.status].cls}`} data-testid={`plan-${i.id}`} data-status={i.status}>
                      <span className="plan-status" title={STATUS[i.status].label}>
                        {STATUS[i.status].icon}
                      </span>
                      <div>
                        <div className="plan-title">{i.title}</div>
                        {i.details.map((d, k) => (
                          <div key={k} className="muted small">
                            {d}
                          </div>
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
                  <li key={i.id} className="muted small">
                    {i.title}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {plan && showMd && <textarea className="code-editor" readOnly value={plan.markdown} data-testid="plan-markdown" />}
      <div className="modal-actions">
        <button className="ghost" onClick={() => setShowMd(!showMd)}>
          {showMd ? "Show list" : "Show Markdown"}
        </button>
        <span className="spacer" />
        <button onClick={() => void copy()} disabled={!plan} data-testid="plan-copy" aria-live="polite">
          {copied ? "Copied" : "Copy Markdown"}
        </button>
        <button className="primary" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}

/**
 * The form for a draft's name and description: "New draft" (both fields), or just one of them from the
 * row menu. `onSubmit` may throw: its message (a duplicate title, say) is shown in the dialog.
 */
export function DraftDialog({
  mode,
  draft,
  onSubmit,
  onClose,
}: {
  mode: "new" | "rename" | "description";
  draft?: DraftInfo;
  onSubmit(values: { title: string; description: string }): Promise<void>;
  onClose(): void;
}) {
  const [title, setTitle] = useState(draft?.title ?? "");
  const [description, setDescription] = useState(draft?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canSubmit = title.trim() !== "" && !busy;
  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ title: title.trim(), description: description.trim() });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  const heading = mode === "new" ? "New draft" : mode === "rename" ? "Rename draft" : "Edit description";
  return (
    <Modal title={heading} onClose={onClose} testId={mode === "new" ? "new-draft-dialog" : "edit-draft-dialog"}>
      <form
        className="draft-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {mode === "new" && <p className="muted small">A draft is a planned change: a copy of the model you edit, then apply or discard.</p>}
        {mode !== "description" && (
          <label className="field">
            <span>Title</span>
            <input
              type="text"
              autoFocus
              value={title}
              maxLength={120}
              placeholder="e.g. Add audit log"
              onChange={(e) => setTitle(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              aria-invalid={error ? true : undefined}
              data-testid="draft-title"
            />
          </label>
        )}
        {mode !== "rename" && (
          <label className="field">
            <span>Description (optional)</span>
            <textarea
              rows={4}
              value={description}
              autoFocus={mode === "description"}
              placeholder="What this change is for, and why"
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && (e.preventDefault(), void submit())}
              data-testid="draft-description"
            />
          </label>
        )}
        {error && (
          <div className="dialog-error" role="alert" data-testid="draft-error">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!canSubmit} aria-busy={busy} data-testid={mode === "new" ? "draft-create" : "draft-save"}>
            {mode === "new" ? "Create" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
