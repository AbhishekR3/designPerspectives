/**
 * Review of an import draft (DEC-051): how many items are verified, what is accepted, and the items with low
 * confidence worked one at a time. The levels are computed by the tool from the files (never from what BMO
 * says about itself). Shown in the changes panel while an import draft is open; read-only when the draft is not yours.
 */

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { Icon } from "../common/icons";
import { errorMessage, notify } from "../common/notify";
import type { ImportReviewResponse, ReviewCheck, ReviewItem, ReviewRule, ReviewState } from "../types";

const LEVEL_LABEL: Record<ReviewItem["level"], string> = { verified: "Verified", partly: "Partly verified", unverified: "Unverified" };

const RULE_LABEL: Record<ReviewRule, string> = {
  "scan-fact": "Found by the scan",
  "user-note": "Stated by a person",
  "manifest-path": "A manifest sits at its code path",
  "manifest-service": "The scan found this service in a manifest",
  "file-exists": "The cited file exists",
  "lines-exist": "The cited lines exist",
  "text-found": "The name or quoted text is in the file",
  "import-edge": "The code imports across this connection",
  "flow-step": "Each step of the flow",
  "no-evidence": "No evidence was given",
};
const KIND_LABEL = { object: "Object", relationship: "Connection", flow: "Flow", decision: "Decision" } as const;

/** Items a person can still act on: those that are not rejected. */
const counts = (review: ReviewState) => {
  const items = Object.values(review.items);
  const by = (f: (i: ReviewItem) => boolean) => items.filter(f).length;
  return {
    total: items.length,
    verified: by((i) => i.level === "verified"),
    partly: by((i) => i.level === "partly"),
    unverified: by((i) => i.level === "unverified"),
    accepted: by((i) => i.decision === "accepted"),
    pending: by((i) => i.decision === "pending"),
    rejected: by((i) => i.decision === "rejected"),
  };
};

/** What a reviewer can do about an item that is not verified, from the checks that failed (DEC-064: the tool, not the file, decides). */
function nextStep(item: ReviewItem): string | null {
  if (item.level === "verified") return null;
  const failed = new Set(item.checks.filter((c) => !c.ok).map((c) => c.rule));
  if (failed.has("user-note"))
    return "A person's note counts only when its exact words are in what someone typed: the intake answers, feedback saved for this draft, or the description. Accept it yourself if you know it is right.";
  if (failed.has("no-evidence")) return "Nothing in the code or in what a person typed backs this. Accept it if you know it is right; otherwise reject it, or tell BMO what is wrong.";
  return "The checks above did not verify it. Accept it if you know it is right; otherwise reject it, or tell BMO what is wrong.";
}

function CheckLine({ c }: { c: ReviewCheck }) {
  return (
    <li className={c.ok ? "ok" : "bad"} data-testid={`review-check-${c.rule}`}>
      <Icon name={c.ok ? "check" : "warning"} size={12} /> <span>{RULE_LABEL[c.rule] ?? c.rule}</span>
      {c.path && (
        <span className="muted small">
          {" "}
          <code>
            {c.path}
            {c.line ? `:${c.line}` : ""}
          </code>
        </span>
      )}
      {c.note && <span className="muted small"> {c.note}</span>}
    </li>
  );
}

interface Props {
  draftId: string;
  /** May the signed-in person change this draft (its reviewer)? Without it the block is read-only. */
  canEdit: boolean;
  /** The model's version: the review is read again when it changes. */
  version: number | string;
  /** Show an item on the diagram (`object:<id>` and `relationship:<id>` keys). */
  onPick(key: string, item: ReviewItem): void;
  /** Reload the model after a decision (a reject changes the draft). */
  onChanged(): Promise<void>;
}

export function ImportReview({ draftId, canEdit, version, onPick, onChanged }: Props) {
  const [data, setData] = useState<ImportReviewResponse | null>(null);
  const [none, setNone] = useState(false);
  /** The draft was made by an import, but its review file is missing or unreadable (the server refuses to apply it until it is made again). */
  const [lost, setLost] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [index, setIndex] = useState(0);
  const [skipped, setSkipped] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.importReview();
      setData(r);
      setNone(false);
      setLost(null);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setNone(true);
      else if (e instanceof ApiError && e.status === 422 && /review of this draft is missing/i.test(e.message)) setLost(e.message);
      else setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, draftId, version]);

  if (none) return null;
  if (lost && !data) {
    return (
      <section className="import-review" data-testid="import-review-lost" aria-label="Review import">
        <h3 className="panel-subtitle">Review import</h3>
        <p className="small" role="alert">
          {lost}
        </p>
        {canEdit && (
          <button
            className="small primary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              api
                .reviewVerifyAll()
                .then(() => load())
                .then(() => onChanged())
                .catch((e) => notify.error(errorMessage(e)))
                .finally(() => setBusy(false));
            }}
            data-testid="review-rebuild"
          >
            Check again and rebuild the review
          </button>
        )}
      </section>
    );
  }
  if (!data) return error ? <p className="error-text small">Could not load the review: {error}</p> : null;
  const { review } = data;
  const c = counts(review);
  const low = data.lowConfidenceKeys;
  const at = Math.min(index, Math.max(0, low.length - 1));
  const key = low[at];
  const item = key ? review.items[key] : undefined;

  /** Run one change, show its answer, reload the model. */
  const act = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    try {
      const r = await fn();
      await load();
      await onChanged();
      return r;
    } catch (e) {
      notify.error(errorMessage(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  const decide = async (k: string, action: "accept" | "reject" | "verify" | "pending") => {
    const r = await act(() => api.reviewItem(k, { action }));
    if (r && action === "reject" && r.alsoRejected.length) notify.info(`Also rejected, because they depend on it: ${r.alsoRejected.map((x) => review.items[x]?.name ?? x).join(", ")}.`);
  };
  const acceptAll = async () => {
    const r = await act(() => api.reviewAcceptAll());
    if (r) setSkipped(r.skipped.length);
  };

  return (
    <section className="import-review" data-testid="import-review" aria-label="Review import">
      <h3 className="panel-subtitle">Review import</h3>
      <p className="small" data-testid="review-counts">
        <span data-testid="review-count-verified">{c.verified} verified</span> · <span data-testid="review-count-partly">{c.partly} partly verified</span> ·{" "}
        <span data-testid="review-count-unverified">{c.unverified} unverified</span>
      </p>
      <p className="small muted" data-testid="review-decisions">
        <span data-testid="review-count-accepted">{c.accepted} accepted</span> · <span data-testid="review-count-pending">{c.pending} pending</span>
        {c.rejected > 0 && <span data-testid="review-count-rejected"> · {c.rejected} rejected</span>}
      </p>
      {!canEdit && (
        <p className="muted small" data-testid="review-readonly">
          This draft is not yours: you can read the review, but only its author or an architect can change it.
        </p>
      )}
      {canEdit && (
        <div className="row wrap">
          <button
            className="small"
            onClick={() => void acceptAll()}
            disabled={busy || c.pending === 0}
            title="Accepts the pending items that are verified or partly verified. Unverified items need one decision each."
            data-testid="review-accept-all"
          >
            Accept all verified
          </button>
        </div>
      )}
      {skipped !== null && (
        <p className="small" role="status" data-testid="review-skipped">
          {skipped === 0 ? "No unverified items were left out." : `${skipped} unverified item${skipped === 1 ? " was" : "s were"} not accepted. They need one decision each, below.`}
        </p>
      )}

      <h4>
        Low confidence{" "}
        <span className="muted" data-testid="review-low-count">
          ({low.length})
        </span>
      </h4>
      {low.length === 0 && (
        <p className="empty-note" data-testid="review-low-empty">
          No unverified item is waiting for a decision.
        </p>
      )}
      {key && item && (
        <div className="review-item" data-testid="review-item" data-key={key}>
          <div className="row between">
            <button className="link review-item-name" onClick={() => onPick(key, item)} title="Show it on the diagram" data-testid="review-item-pick">
              {item.name}
            </button>
            <span className="muted small">
              {at + 1} of {low.length}
            </span>
          </div>
          <div className="muted small">
            {KIND_LABEL[item.kind]} · <span className={`review-level ${item.level}`}>{LEVEL_LABEL[item.level]}</span>
          </div>
          <ul className="review-checks" data-testid="review-checks">
            {item.checks.map((ck, i) => (
              <CheckLine key={i} c={ck} />
            ))}
          </ul>
          {canEdit && nextStep(item) && (
            <p className="muted small review-next-step" data-testid="review-next-step">
              {nextStep(item)}
            </p>
          )}
          {canEdit && (
            <>
              <div className="row wrap">
                <button className="small" onClick={() => void decide(key, "verify")} disabled={busy} data-testid="review-verify">
                  Verify again
                </button>
                <button className="small primary" onClick={() => void decide(key, "accept")} disabled={busy} data-testid="review-accept">
                  Accept
                </button>
                <button className="small danger" onClick={() => void decide(key, "reject")} disabled={busy} data-testid="review-reject">
                  Reject
                </button>
              </div>
              <FeedbackBox
                key={key}
                label="Tell BMO"
                placeholder="What should BMO know about this item?"
                initial={item.feedback ?? ""}
                testId="review-item-feedback"
                onSave={(text) => act(() => api.reviewItem(key, { action: "feedback", text })).then((r) => r !== undefined)}
              />
            </>
          )}
          {low.length > 1 && (
            <div className="row">
              <button className="ghost small" onClick={() => setIndex((at + low.length - 1) % low.length)} data-testid="review-prev">
                Previous
              </button>
              <button className="ghost small" onClick={() => setIndex((at + 1) % low.length)} data-testid="review-next">
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {canEdit && (
        <FeedbackBox
          label="Tell BMO about the whole draft"
          placeholder="Anything BMO should change in the next version of this import."
          initial={review.draftFeedback ?? ""}
          testId="review-draft-feedback"
          onSave={(text) => act(() => api.reviewDraftFeedback(text)).then((r) => r !== undefined)}
        />
      )}

      <button className="ghost small" onClick={() => setShowAll(!showAll)} aria-expanded={showAll} data-testid="review-all-toggle">
        {showAll ? "Hide all items" : `All items (${c.total})`}
      </button>
      {showAll && (
        <ul className="review-all" data-testid="review-all">
          {Object.entries(review.items).map(([k, it]) => (
            <li key={k} data-testid={`review-row-${k}`} data-decision={it.decision}>
              <button className="link" onClick={() => onPick(k, it)} title="Show it on the diagram">
                {it.name}
              </button>
              <span className="muted small">
                {KIND_LABEL[it.kind]} · {LEVEL_LABEL[it.level].toLowerCase()} · {it.decision}
                {it.by ? ` by ${it.by}` : ""}
              </span>
              {canEdit && (
                <span className="row">
                  {it.decision !== "accepted" && (
                    <button className="tiny" onClick={() => void decide(k, "accept")} disabled={busy} data-testid={`review-row-accept-${k}`}>
                      Accept
                    </button>
                  )}
                  {it.decision !== "rejected" && (
                    <button className="tiny" onClick={() => void decide(k, "reject")} disabled={busy} data-testid={`review-row-reject-${k}`}>
                      Reject
                    </button>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** A text box with a Save button: feedback for BMO, kept as written. */
function FeedbackBox({ label, placeholder, initial, testId, onSave }: { label: string; placeholder: string; initial: string; testId: string; onSave(text: string): Promise<boolean> }) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  useEffect(() => {
    setText(initial);
    setSaved(initial);
  }, [initial]);
  return (
    <label className="field review-feedback">
      <span>{label}</span>
      <textarea rows={2} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} data-testid={testId} />
      <span className="row">
        <button
          className="small"
          disabled={text === saved}
          onClick={(e) => {
            e.preventDefault();
            void onSave(text).then((ok) => ok && setSaved(text));
          }}
          data-testid={`${testId}-save`}
        >
          Save
        </button>
        {text === saved && saved && <span className="muted small">Saved</span>}
      </span>
    </label>
  );
}
