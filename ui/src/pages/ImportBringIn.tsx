/**
 * The ways to bring a level into the model as a draft (DEC-051): hand the prompt to your own coding agent and read
 * its result.json back, paste or drop an import file, or ask BMO directly. Each ends as a draft that is reviewed
 * before anything reaches the main model. Errors are shown by field, with the text to send back to the agent.
 */

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import { CopyButton } from "../common/CopyButton";
import { errorMessage } from "../common/notify";
import type { FieldError, HandoffOffer, ImportCheck, ImportDraftResult, ImportReport } from "../types";

/** The text to send back when the server gave none (an import file that was refused): every problem, then the ask. */
export const errorsText = (errors: FieldError[]): string =>
  `The import file was refused. Fix these problems and send the complete file again:\n${errors.map((e) => `- ${e.pointer || "(the whole file)"}: ${e.message}`).join("\n")}\n`;

export interface Problems {
  detail: string;
  errors: FieldError[];
  warnings: FieldError[];
  pasteBack: string | null;
}

/** What a refused call tells: the sentence, the problems by field, and the text for the agent. */
export function problemsOf(e: unknown): Problems {
  const data = e instanceof ApiError ? e.data : null;
  const errors = Array.isArray(data?.errors) ? (data!.errors as FieldError[]) : [];
  return {
    detail: errorMessage(e),
    errors,
    warnings: Array.isArray(data?.warnings) ? (data!.warnings as FieldError[]) : [],
    pasteBack: typeof data?.pasteBack === "string" ? data.pasteBack : errors.length ? errorsText(errors) : null,
  };
}

const FieldList = ({ items, testId, tone }: { items: FieldError[]; testId: string; tone: "error" | "warning" }) =>
  items.length === 0 ? null : (
    <ul className={`field-problems ${tone}`} data-testid={testId}>
      {items.map((e, i) => (
        <li key={i}>
          {e.pointer && <code>{e.pointer}</code>} {e.message}
        </li>
      ))}
    </ul>
  );

export function ProblemsView({ problems, testId }: { problems: Problems; testId: string }) {
  return (
    <div className="problems" data-testid={testId}>
      <p className="error-text" role="alert" data-testid={`${testId}-detail`}>
        {problems.detail}
      </p>
      <FieldList items={problems.errors} tone="error" testId={`${testId}-errors`} />
      <FieldList items={problems.warnings} tone="warning" testId={`${testId}-warnings`} />
      {problems.pasteBack && (
        <div className="row">
          <CopyButton text={problems.pasteBack} label="Copy these errors back to BMO" testId={`${testId}-copy`} />
          <span className="muted small">Paste them to your agent; it sends a corrected file.</span>
        </div>
      )}
    </div>
  );
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What an import did, and the way into the draft. */
export function ResultNotice({ result, onOpenDraft, onOpenChecklist }: { result: ImportDraftResult; onOpenDraft(id: string): void; onOpenChecklist?(): void }) {
  const r: ImportReport = result.report;
  const list = (title: string, names: string[], id: string) =>
    names.length > 0 && (
      <details data-testid={`import-report-${id}`}>
        <summary>
          {title} ({names.length})
        </summary>
        <ul>
          {names.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </details>
    );
  return (
    <div className="import-result" role="status" data-testid="import-result">
      <p>
        <strong>The draft is ready.</strong> Nothing is in the main model until you review it and apply it.
      </p>
      <p className="small" data-testid="import-report-summary">
        <span data-testid="report-created">{count(r.created.length, "item")} created</span> · <span data-testid="report-updated">{r.updated.length} updated</span> ·{" "}
        <span data-testid="report-kept">{r.kept.length} kept your edit</span> · <span data-testid="report-not-in">{r.notInImport.length} not in this import</span>
        {r.unchanged > 0 && ` · ${r.unchanged} unchanged`}
      </p>
      {list(
        "Created",
        r.created.map((c) => c.name),
        "created",
      )}
      {list(
        "Updated",
        r.updated.map((c) => `${c.name}: ${c.fields.join(", ")}`),
        "updated",
      )}
      {list(
        "Kept your edit",
        r.kept.map((k) => `${k.name}, ${k.field}: ${k.message}`),
        "kept",
      )}
      {list(
        "Not in this import",
        r.notInImport.map((c) => c.name),
        "not-in",
      )}
      {result.warnings.length > 0 && (
        <details data-testid="import-report-warnings">
          <summary>Warnings ({result.warnings.length})</summary>
          <FieldList items={result.warnings} tone="warning" testId="import-result-warnings" />
        </details>
      )}
      {result.checklistAdded > 0 && (
        <p className="small" data-testid="import-checklist-added">
          BMO asked {count(result.checklistAdded, "question or assumption", "questions or assumptions")}: they are on the checklist.{" "}
          {onOpenChecklist && (
            <button className="ghost small" onClick={onOpenChecklist} data-testid="import-open-checklist-result">
              Open the checklist
            </button>
          )}
        </p>
      )}
      <button className="primary" onClick={() => onOpenDraft(result.draftId)} data-testid="import-open-draft">
        Open the draft
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- the handoff

export type HandoffRequest = { task: "import-level" | "describe-to-model" | "suggest-labels"; level?: "c1" | "c2" | "c3"; container?: string; text?: string };

/** Write the prompt and files for the person's own coding agent, then read the result back. */
export function HandoffPanel({ request, label, disabled, onDraft, idPrefix }: { request: HandoffRequest; label: string; disabled: boolean; onDraft(r: ImportDraftResult): void; idPrefix: string }) {
  const [offer, setOffer] = useState<HandoffOffer | null>(null);
  const [problems, setProblems] = useState<Problems | null>(null);
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState<"write" | "read" | null>(null);
  const t = (s: string) => `${idPrefix}-${s}`;
  // Another level or container: the prompt written before was for the other one, so it goes.
  const requestKey = JSON.stringify(request);
  useEffect(() => {
    setOffer(null);
    setProblems(null);
    setPasted("");
  }, [requestKey]);

  const write = async () => {
    setBusy("write");
    setProblems(null);
    try {
      setOffer(await api.importHandoff(request));
    } catch (e) {
      setOffer(null);
      setProblems(problemsOf(e));
    } finally {
      setBusy(null);
    }
  };
  const read = async () => {
    setBusy("read");
    setProblems(null);
    try {
      onDraft(await api.importHandoffResult(pasted.trim() ? pasted : undefined));
    } catch (e) {
      setProblems(problemsOf(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="handoff" data-testid={t("handoff")}>
      <p className="muted small">BMO writes the prompt and the files your coding agent needs. Nothing is sent anywhere by dp.</p>
      <div className="row">
        <button onClick={() => void write()} disabled={disabled || busy !== null} aria-busy={busy === "write"} data-testid={t("handoff-write")}>
          {label}
        </button>
      </div>
      {offer && (
        <div className="handoff-offer" data-testid={t("handoff-offer")}>
          <p className="small">Give your coding agent this one line:</p>
          <div className="row wrap">
            <code className="handoff-line" data-testid={t("handoff-instruction")}>
              {offer.instruction}
            </code>
            <CopyButton text={offer.instruction} label="Copy line" testId={t("handoff-copy-line")} />
            <CopyButton text={offer.prompt} label="Copy prompt" testId={t("handoff-copy-prompt")} />
          </div>
          <p className="small muted">
            The files are in <code data-testid={t("handoff-folder")}>{offer.folder}</code>
            {offer.files.length > 0 && <>: {offer.files.join(", ")}</>}. About {offer.estTokens.toLocaleString()} tokens.
          </p>
          <label className="field">
            <span>
              Then bring the result back: paste what the agent wrote, or leave this empty to read <code>result.json</code> from that folder
            </span>
            <textarea rows={4} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder='{"schemaVersion": 1, ...}' data-testid={t("handoff-result-text")} />
          </label>
          <div className="row">
            <button className="primary" onClick={() => void read()} disabled={disabled || busy !== null} aria-busy={busy === "read"} data-testid={t("handoff-read")}>
              Read result.json
            </button>
          </div>
        </div>
      )}
      {problems && <ProblemsView problems={problems} testId={t("handoff-problems")} />}
    </div>
  );
}

// ---------------------------------------------------------------- paste or drop an import file

const MAX_FILE = 2 * 1024 * 1024;

export function PastePanel({ example, disabled, onDraft }: { example: string | null; disabled: boolean; onDraft(r: ImportDraftResult): void }) {
  const [text, setText] = useState("");
  const [check, setCheck] = useState<ImportCheck | null>(null);
  const [problems, setProblems] = useState<Problems | null>(null);
  const [busy, setBusy] = useState<"check" | "create" | null>(null);
  const [drag, setDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const change = (v: string) => {
    setText(v);
    setCheck(null);
    setProblems(null);
  };
  const load = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_FILE) return setProblems({ detail: `That file is ${(f.size / 1048576).toFixed(1)} MB; an import file is at most 2 MB.`, errors: [], warnings: [], pasteBack: null });
    change(await f.text());
  };
  const doCheck = async () => {
    setBusy("check");
    setProblems(null);
    try {
      setCheck(await api.importCheck(text));
    } catch (e) {
      setCheck(null);
      setProblems(problemsOf(e));
    } finally {
      setBusy(null);
    }
  };
  const create = async () => {
    setBusy("create");
    setProblems(null);
    try {
      const r = await api.importFile(text);
      setCheck(null);
      // The file is in a draft now: an empty box, so a second click cannot make the same draft again.
      setText("");
      onDraft(r);
    } catch (e) {
      setProblems(problemsOf(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="paste" data-testid="paste-panel">
      <label className="field">
        <span>Import file (JSON). Paste it, or drop a file on the box.</span>
        <textarea
          rows={8}
          className={`paste-box${drag ? " drag" : ""}`}
          value={text}
          onChange={(e) => change(e.target.value)}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void load(e.dataTransfer.files[0]);
          }}
          placeholder='{"schemaVersion": 1, "level": "c2", "objects": [], "relationships": []}'
          disabled={disabled}
          data-testid="paste-text"
        />
      </label>
      <div className="row wrap">
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => void load(e.target.files?.[0])}
          data-testid="paste-file"
        />
        <button onClick={() => fileInput.current?.click()} disabled={disabled} data-testid="paste-choose-file">
          Choose a file…
        </button>
        {example && (
          <button onClick={() => change(example)} disabled={disabled} title="A ready-made import file for the demo model" data-testid="paste-example">
            Try the example
          </button>
        )}
        <span className="grow" />
        <button onClick={() => void doCheck()} disabled={disabled || !text.trim() || busy !== null} aria-busy={busy === "check"} data-testid="paste-check">
          Check
        </button>
        <button className="primary" onClick={() => void create()} disabled={disabled || !text.trim() || busy !== null} aria-busy={busy === "create"} data-testid="paste-create">
          Create draft
        </button>
      </div>
      {check && (
        <div data-testid="paste-check-result">
          {check.errors.length === 0 ? (
            <p className="ok-note" data-testid="paste-ok">
              The file is valid{check.warnings.length ? `, with ${count(check.warnings.length, "warning")}` : ""}.
            </p>
          ) : (
            <p className="error-text">{count(check.errors.length, "problem")} found.</p>
          )}
          <FieldList items={check.errors} tone="error" testId="paste-errors" />
          <FieldList items={check.warnings} tone="warning" testId="paste-warnings" />
          {check.errors.length > 0 && (
            <div className="row">
              <CopyButton text={errorsText(check.errors)} label="Copy these errors back to BMO" testId="paste-check-copy" />
            </div>
          )}
        </div>
      )}
      {problems && <ProblemsView problems={problems} testId="paste-problems" />}
    </div>
  );
}
