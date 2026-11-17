/**
 * One sheet for every BMO run (DEC-051): 1. what would be sent and where, 2. running (can be cancelled), 3. the result.
 * Everything BMO or a file says is shown as plain text. When BMO is off or not open to this person, the sheet
 * says why instead (and points to the handoff for the tasks that have one).
 */

import { useEffect, useRef, type ReactNode } from "react";
import { Modal } from "../panels/formParts";
import { useBmoRun, useBmoStatus, type BmoRequest } from "../hooks/useBmo";
import type { BmoPreview, BmoRunResult, BmoStatus } from "../types";
import { CopyButton } from "./CopyButton";

export const kb = (bytes: number): string => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`);

interface Props {
  title: string;
  request: BmoRequest;
  onClose(): void;
  /** For a task that has a handoff: said when BMO cannot run it for this person. */
  handoffNote?: ReactNode;
  /** Extra buttons beside Copy on a text result. */
  textActions?(text: string, close: () => void): ReactNode;
  /** A draft was made ("Open the draft"). */
  onOpenDraft?(draftId: string): void;
  /** A proposed decision was added ("Open decisions"). */
  onOpenDecisions?(): void;
  /** A run succeeded (the caller reloads what the result changed). */
  onDone?(result: BmoRunResult): void;
}

export function BmoSheet({ title, request, onClose, handoffNote, textActions, onOpenDraft, onOpenDecisions, onDone }: Props) {
  const { status, error: statusError } = useBmoStatus();
  const blocked = status && !status.canRun.ok ? status.canRun.reason || "BMO is not available." : null;
  const { phase, send, cancel, previewAgain } = useBmoRun(request, !!status && !blocked);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const reported = useRef<BmoRunResult | null>(null);
  useEffect(() => {
    if (phase.name === "done" && reported.current !== phase.result) {
      reported.current = phase.result;
      doneRef.current?.(phase.result);
    }
  }, [phase]);

  return (
    <Modal title={title} onClose={onClose} wide testId="bmo-sheet">
      {!status && !statusError && <p className="muted">Checking BMO…</p>}
      {statusError && <p className="error-text">Could not read the BMO status: {statusError}</p>}
      {status && blocked && <Explainer status={status} reason={blocked} handoffNote={handoffNote} />}
      {status && !blocked && phase.name === "loading" && (
        <p className="muted" data-testid="bmo-preview-loading">
          Building the prompt…
        </p>
      )}
      {status && !blocked && phase.name === "refused" && <Explainer status={status} reason={phase.detail} handoffNote={handoffNote} />}
      {status && !blocked && (phase.name === "preview" || phase.name === "running") && <PreviewView status={status} preview={phase.preview} cancelled={phase.name === "preview" && phase.cancelled} />}
      {phase.name === "running" && (
        <p role="status" className="bmo-running" data-testid="bmo-running">
          <span className="spinner" aria-hidden="true" /> BMO is working. You can cancel; nothing is changed until the answer is checked.
        </p>
      )}
      {phase.name === "done" && <ResultView result={phase.result} onClose={onClose} textActions={textActions} onOpenDraft={onOpenDraft} onOpenDecisions={onOpenDecisions} />}
      {phase.name === "failed" && (
        <div data-testid="bmo-failed">
          <p className="error-text" role="alert" data-testid="bmo-failed-detail">
            {phase.detail}
          </p>
          {phase.errors.length > 0 && (
            <ul className="bmo-errors" data-testid="bmo-errors">
              {phase.errors.map((e, i) => (
                <li key={i}>
                  {e.pointer && <code>{e.pointer}</code>} {e.message}
                </li>
              ))}
            </ul>
          )}
          {phase.stale && <p className="muted small">The model or the code changed since the preview. Look at the preview again before sending.</p>}
        </div>
      )}

      <div className="modal-actions">
        {phase.name === "preview" && status && !blocked && (
          <>
            <button onClick={onClose} data-testid="bmo-cancel">
              Cancel
            </button>
            <button className="primary" onClick={() => void send(phase.preview)} data-autofocus data-testid="bmo-send">
              Send to BMO
            </button>
          </>
        )}
        {phase.name === "running" && (
          <button onClick={cancel} data-testid="bmo-cancel-run">
            Cancel the run
          </button>
        )}
        {phase.name === "failed" && (
          <>
            {phase.pasteBack && <CopyButton text={phase.pasteBack} label="Copy these errors back to BMO" testId="bmo-copy-errors" />}
            {phase.stale && (
              <button onClick={previewAgain} data-testid="bmo-preview-again">
                Show the preview again
              </button>
            )}
            <button className="primary" onClick={onClose} data-testid="bmo-close">
              Close
            </button>
          </>
        )}
        {(phase.name === "done" || phase.name === "loading" || phase.name === "refused" || blocked || statusError) && phase.name !== "failed" && (
          <button className={phase.name === "done" ? "primary" : undefined} onClick={onClose} data-testid="bmo-close">
            Close
          </button>
        )}
      </div>
    </Modal>
  );
}

function Explainer({ status, reason, handoffNote }: { status: BmoStatus; reason: string; handoffNote?: ReactNode }) {
  return (
    <div data-testid="bmo-explainer">
      <p>
        <strong>BMO cannot run this here.</strong>
      </p>
      <p data-testid="bmo-explainer-reason">{reason}</p>
      {status.canAdmin ? (
        <p className="small">
          You can change this in the{" "}
          <a href="#/settings/credentials" data-testid="bmo-settings-link">
            BMO settings
          </a>
          .
        </p>
      ) : (
        <p className="small muted">An architect can change this in the BMO settings.</p>
      )}
      {handoffNote && (
        <p className="small" data-testid="bmo-handoff-note">
          {handoffNote}
        </p>
      )}
    </div>
  );
}

function PreviewView({ status, preview, cancelled }: { status: BmoStatus; preview: BmoPreview; cancelled: boolean }) {
  const d = preview.destination;
  const where = [d.provider, d.model, d.host].filter(Boolean).join(" · ") || "a test backend";
  return (
    <div className="bmo-preview" data-testid="bmo-preview">
      {cancelled && (
        <p className="muted small" role="status" data-testid="bmo-cancelled">
          Cancelled. Nothing was changed.
        </p>
      )}
      <h4>Where it goes</h4>
      <p data-testid="bmo-destination">{where}</p>
      {status.backend === "direct" && d.host && (
        <p className="muted small" data-testid="bmo-direct-note">
          dp sends the prompt and the listed file excerpts to {d.host} with your key.
        </p>
      )}
      <h4>
        Files that will be sent <span className="muted">{preview.files.length}</span>
      </h4>
      {preview.files.length === 0 ? (
        <p className="empty-note" data-testid="bmo-no-files">
          No file excerpts: only the model text and the question.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="home-table" data-testid="bmo-files">
            <thead>
              <tr>
                <th>File</th>
                <th>Size</th>
                <th>Lines</th>
                <th>Hidden values</th>
              </tr>
            </thead>
            <tbody>
              {preview.files.map((f) => (
                <tr key={f.path} data-testid={`bmo-file-${f.path}`}>
                  <td>
                    <code>{f.path}</code>
                  </td>
                  <td className="nowrap">{kb(f.bytes)}</td>
                  <td>{f.lines}</td>
                  <td>{f.redactions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="small" data-testid="bmo-size">
        About {preview.estTokens.toLocaleString()} tokens
        {preview.maxInputTokens ? ` (the most a run takes is ${preview.maxInputTokens.toLocaleString()})` : ""}. {preview.redactions} value{preview.redactions === 1 ? "" : "s"} hidden in the prompt.
        {preview.estCost && ` Estimated cost about ${preview.estCost.total.toFixed(4)} for the input, from the prices in the settings.`}
      </p>
      <details className="bmo-prompt" data-testid="bmo-prompt">
        <summary>Show the full prompt</summary>
        <h4>Instructions</h4>
        <pre className="bmo-text" data-testid="bmo-prompt-system">
          {preview.system}
        </pre>
        <h4>Request and data</h4>
        <pre className="bmo-text" data-testid="bmo-prompt-user">
          {preview.user}
        </pre>
      </details>
    </div>
  );
}

function ResultView({
  result,
  onClose,
  textActions,
  onOpenDraft,
  onOpenDecisions,
}: {
  result: BmoRunResult;
  onClose(): void;
  textActions?(text: string, close: () => void): ReactNode;
  onOpenDraft?(draftId: string): void;
  onOpenDecisions?(): void;
}) {
  const usage = result.usage
    ? [result.usage.inputTokens && `${result.usage.inputTokens.toLocaleString()} tokens in`, result.usage.outputTokens && `${result.usage.outputTokens.toLocaleString()} out`]
        .filter(Boolean)
        .join(", ")
    : "";
  return (
    <div data-testid="bmo-result">
      {result.output === "text" && (
        <>
          <pre className="bmo-text" data-testid="bmo-text">
            {result.text}
          </pre>
          <div className="row wrap">
            <CopyButton text={result.text} testId="bmo-copy" />
            {textActions?.(result.text, onClose)}
          </div>
        </>
      )}
      {result.output === "import-file" && (
        <>
          <p data-testid="bmo-draft-made">BMO made a draft. Nothing is in the main model until you review the draft and apply it.</p>
          <p className="small muted">
            {result.report.created.length} created · {result.report.updated.length} updated · {result.report.kept.length} kept as you had them · {result.report.notInImport.length} not in this import
            {result.warnings.length > 0 && ` · ${result.warnings.length} warning${result.warnings.length === 1 ? "" : "s"}`}
          </p>
          {onOpenDraft && (
            <button
              className="primary"
              onClick={() => {
                onClose();
                onOpenDraft(result.draftId);
              }}
              data-testid="bmo-open-draft"
            >
              Open the draft
            </button>
          )}
        </>
      )}
      {result.output === "decision" && (
        <>
          <p data-testid="bmo-decision-made">
            BMO added the decision “{result.decision.title}” ({result.decision.id}) as proposed, in this draft.
          </p>
          {onOpenDecisions && (
            <button
              className="primary"
              onClick={() => {
                onClose();
                onOpenDecisions();
              }}
              data-testid="bmo-open-decisions"
            >
              Open decisions
            </button>
          )}
        </>
      )}
      {(usage || result.model) && (
        <p className="muted small" data-testid="bmo-usage">
          {[result.model, usage].filter(Boolean).join(" · ")}
          {result.estCost && ` · about ${result.estCost.total.toFixed(4)}`}
        </p>
      )}
    </div>
  );
}
