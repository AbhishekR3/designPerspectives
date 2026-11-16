/** The drafts list in the sidebar, the strip above the canvas, and the new / rename draft form. */
import { useEffect, useRef, useState } from "react";
import { promptDialog } from "../common/dialogs";
import { errorMessage } from "../common/notify";
import { Modal } from "../panels/fields";
import { Icon } from "../common/icons";
import { CHANGE_COLORS, CHANGE_LABEL } from "../overlays";
import type { AppState, DraftInfo } from "../types";

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

/** Why a draft is read-only for the signed-in user, when it belongs to someone else (null when it can be changed, or when nobody can change anything). */
export function notYoursHint(d: DraftInfo | undefined, canStartDraft: boolean): string | null {
  if (!d || d.canEdit !== false || !canStartDraft) return null;
  return `${d.author ? `${d.author}'s draft` : "This draft has no recorded author"}: read-only for you. Start your own draft, or ask an architect.`;
}

/** One draft in the sidebar: title, author and date, and a "⋯" menu (also on right-click). */
function DraftRow({
  d,
  active,
  canEditDraft,
  hint,
  onOpen,
  onRename,
  onEditDescription,
  onDiscard,
}: {
  d: DraftInfo;
  active: boolean;
  canEditDraft: boolean;
  hint: string | null;
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
    <li className="draft-row" title={hint ?? undefined} onContextMenu={!hasMenu ? undefined : (e) => (e.preventDefault(), setOpen(true))}>
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
        {hint && (
          <span title={hint} data-testid={`draft-readonly-${d.id}`}>
            {by && " · "}read-only for you
          </span>
        )}
        {(by || hint) && d.behind > 0 && " "}
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
            canEditDraft={d.canEdit ?? state.can.createDraft}
            hint={notYoursHint(d, state.can.createDraft)}
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
  onCompareWith,
  onExit,
}: {
  state: AppState;
  isDraft: boolean;
  showChanges: boolean;
  setShowChanges(v: boolean): void;
  /** For a draft: what the changes are measured against, where it started ("base") or the main model as it is now ("main"). */
  onCompareWith(against: "base" | "main"): void;
  onApply(): void;
  onPlan(): void;
  onDiscard(): void;
  onStopCompare(): void;
  onExit(): void;
}) {
  const s = state.compare?.summary;
  // A draft is compared with its start or with main now (a toggle below); anything else (a git version) shows "compared with" and "Stop comparing".
  const draftToggle = isDraft && (state.compare?.against === "base" || state.compare?.against === "main");
  const comparingOther = state.compare && !draftToggle;
  const draft = isDraft ? state.drafts.find((d) => `draft:${d.id}` === state.model.ref) : undefined;
  const hint = notYoursHint(draft, state.can.createDraft);
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
        {draftToggle && (
          <span className="seg" role="group" aria-label="Compare this draft with" data-testid="compare-toggle">
            {(
              [
                ["base", "Since it started", "Compare with the main model as it was when this draft was made: only what this draft changed"],
                ["main", "Against main now", "Compare with the main model as it is now: also shows what main changed since the draft started"],
              ] as const
            ).map(([k, label, tip]) => (
              <button
                key={k}
                type="button"
                className={`small ${state.compare!.against === k ? "active" : ""}`}
                aria-pressed={state.compare!.against === k}
                title={tip}
                onClick={() => state.compare!.against !== k && onCompareWith(k)}
                data-testid={`compare-${k}`}
              >
                {label}
              </button>
            ))}
          </span>
        )}
        {draftToggle && state.compare!.against === "main" && (
          <span className="muted small truncate" title={`compared with ${state.compare!.title}`} data-testid="compare-title">
            compared with <strong>{state.compare!.title}</strong>
          </span>
        )}
        {hint && (
          <span className="muted small strip-note" data-testid="draft-readonly-note">
            {hint}
          </span>
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
export function SummaryChips({ s, compact = false }: { s: { added: number; changed: number; removed: number; layout: number; code?: number }; compact?: boolean }) {
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
