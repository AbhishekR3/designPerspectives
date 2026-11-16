/** Confirm applying a draft, and the draft's coding plan. */
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import { errorMessage } from "../common/notify";
import { Modal } from "../panels/fields";
import { BmoSheet } from "../common/BmoSheet";
import type { AppState, ApplyPreview, ApplyResponse, CodingPlan, Conflict, ReviewState } from "../types";
import { ChangeList } from "./ChangeList";
import { SummaryChips } from "./DraftList";

/** Confirm applying a draft: what main will get, and conflicts that stop it. */
export function ApplyDialog({
  draftId,
  title,
  branch,
  onClose,
  onApplied,
}: {
  draftId: string;
  title: string;
  branch?: string;
  onClose(): void;
  onApplied(r: ApplyResponse, acceptedItems: number | null): void;
}) {
  const [preview, setPreview] = useState<ApplyPreview | null>(null);
  // An import draft with items that are not accepted: how many are accepted (read from its review).
  const [review, setReview] = useState<ReviewState | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [busy, setBusy] = useState(false);
  // A draft with a branch has its code written there, so the planned edits are not written to the working copy unless asked for.
  const [withCode, setWithCode] = useState(!branch);
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
  const held = preview?.held;
  useEffect(() => {
    if (!held) return setReview(null);
    let current = true;
    api
      .importReview()
      .then((r) => current && setReview(r.review))
      .catch(() => current && setReview(null));
    return () => {
      current = false;
    };
  }, [held, draftId]);
  const accepted = review ? Object.values(review.items).filter((i) => i.decision === "accepted").length : null;
  // The server says when no item is accepted: then nothing is applied, whatever else the draft changed (positions, styles, tag groups).
  const nothing = !!held && held.nothingAccepted;
  const apply = async () => {
    setBusy(true);
    try {
      const r = await api.applyDraft(draftId, withCode);
      onApplied(r, accepted);
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
    <>
      <Modal title={`Apply "${title}" to the main model`} onClose={onClose} wide>
        {!preview && !error && <p className="muted">Checking…</p>}
        {preview && preview.code.length > 0 && (
          <label className="check" title="Without this, only the model changes are applied; write the code yourself (see the coding plan)">
            <input type="checkbox" checked={withCode} onChange={(e) => setWithCode(e.target.checked)} data-testid="apply-with-code" />
            Also write the {preview.code.length} planned code edit{preview.code.length === 1 ? "" : "s"} to the code folder
          </label>
        )}
        {!withCode && preview && preview.code.length > 0 && (
          <p className="muted small" data-testid="apply-code-dropped">
            The {preview.code.length} planned code edit{preview.code.length === 1 ? "" : "s"} will not be written. They are removed with the draft when it is applied.
          </p>
        )}
        {branch && preview && preview.code.length > 0 && (
          <p className="muted small" data-testid="apply-branch-hint">
            This draft has a branch ({branch}), so the code is expected to come from there.
          </p>
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
        {cs && conflicts.length === 0 && held && (
          <div className="apply-held" data-testid="apply-held">
            <p data-testid="apply-held-summary">
              <strong>
                {nothing
                  ? `${held.items} item${held.items === 1 ? "" : "s"} stay${held.items === 1 ? "s" : ""} in the draft.`
                  : `${accepted === null ? "The accepted items" : `${accepted} accepted item${accepted === 1 ? "" : "s"}`} will be applied. ${held.items} stay${held.items === 1 ? "s" : ""} in the draft.`}
              </strong>{" "}
              The draft stays open so you can decide on the rest.
            </p>
            {nothing && (
              <p className="warn-note" data-testid="apply-nothing-accepted">
                Nothing is accepted yet, so there is nothing to apply. Accept at least one item in Review import.
              </p>
            )}
            {held.dependent.length > 0 && (
              <div data-testid="apply-held-dependent">
                <p className="muted small">These accepted changes stay in the draft too, because they depend on an item that is not accepted:</p>
                <ul className="conflict-list">
                  {held.dependent.map((c, i) => (
                    <li key={i}>
                      <strong>{c.label}</strong>: {c.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {cs && conflicts.length === 0 && (
          <>
            <p>
              The main model will get these changes; changes made to it since the draft was made are kept.{" "}
              {held
                ? "The draft is not deleted."
                : writesCode
                  ? "The code edits are written to the code folder and the draft is deleted. Undo restores the model only, not those files or the draft."
                  : "The draft is then deleted. Undo restores the model, not the draft."}
            </p>
            <SummaryChips s={cs.summary} />
            {empty ? <p className="muted">The draft changes nothing.</p> : <ChangeList changes={cs} />}
          </>
        )}
        <div className="modal-actions">
          <button onClick={() => setSummaryOpen(true)} disabled={!preview} title="BMO writes a short summary of this draft for a pull request" data-testid="apply-summary">
            Summary for a pull request
          </button>
          <span className="spacer" />
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            onClick={apply}
            disabled={!preview || conflicts.length > 0 || busy || nothing}
            title={nothing ? "Nothing is accepted yet" : undefined}
            aria-busy={busy}
            data-testid="apply-confirm"
          >
            Apply
          </button>
        </div>
      </Modal>
      {summaryOpen && <BmoSheet title="Summary for a pull request" request={{ task: "draft-summary" }} onClose={() => setSummaryOpen(false)} />}
    </>
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
            disabled={!(draft?.canEdit ?? state.can.createDraft)}
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
