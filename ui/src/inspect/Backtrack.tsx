import { useEffect, useMemo, useState } from "react";
import { api, type BacktrackQuery } from "../api";
import { asRecord, SamplePayload } from "./SamplePayload";
import type { AppState, BacktrackResult, BacktrackStep, CommitInfo } from "../types";

const WINDOWS = [7, 14, 30, 90];

/** A field name compared loosely: case, "_" and "-" ignored (closing_balance = closingBalance). */
const norm = (k: string) => k.toLowerCase().replace(/[_-]/g, "");
/** The words in a field name (camelCase and snake_case split). */
const words = (k: string) =>
  k
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);

function fieldOf(rec: Record<string, unknown> | null, field: string): { key: string; value: unknown } | null {
  if (!rec) return null;
  const key = Object.keys(rec).find((k) => norm(k) === norm(field));
  return key === undefined ? null : { key, value: rec[key] };
}

/** A target field worth following first: one whose value changed on the way, else one that came from an earlier step, else the first. */
function defaultField(target: Record<string, unknown>, steps: BacktrackStep[]): string | null {
  const keys = Object.keys(target);
  const earlier = steps.slice(0, -1).map((s) => asRecord(s.example));
  const values = (k: string) => earlier.map((r) => fieldOf(r, k)).filter((v): v is { key: string; value: unknown } => v !== null);
  const changed = keys.find((k) => new Set([...values(k), { key: k, value: target[k] }].map((v) => JSON.stringify(v.value))).size > 1);
  return changed ?? keys.find((k) => values(k).length > 0) ?? keys[0] ?? null;
}

const ago = (iso: string) => {
  const d = Math.round((Date.now() - Date.parse(iso)) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};
const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));

/**
 * Backtracking: from one step back to where its data came from. Left, the steps from the chosen one
 * back to the first, with the ones changed recently marked. Right, the selected step: its data
 * against the step before, one field's values through every step, the code behind it (functions
 * changed recently marked) and the commits that changed its code and its part of the model.
 */
export function Backtrack({ state, query, onClose, onOpenFile, onReveal }: { state: AppState; query: BacktrackQuery; onClose(): void; onOpenFile(path: string): void; onReveal(id: string): void }) {
  const [days, setDays] = useState(14);
  const [result, setResult] = useState<BacktrackResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [field, setField] = useState<string | null>(null);
  const queryKey = JSON.stringify(query);

  useEffect(() => {
    let live = true;
    setError(null);
    api.backtrack(JSON.parse(queryKey) as BacktrackQuery, days).then(
      (r) => {
        if (!live) return;
        setResult(r);
        setPicked((p) => (p !== null && r.steps.some((s) => s.index === p) ? p : r.target));
      },
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
    // `state` changes after an edit (a sample fixed while backtracking): fetch again.
  }, [queryKey, days, state]);

  useEffect(() => {
    // Escape closes this screen, unless a dialog on top of it (the file editor) takes it first.
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector(".modal-backdrop") && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const steps = useMemo(() => result?.steps ?? [], [result]);
  const target = steps[steps.length - 1];
  const targetRec = target ? asRecord(target.example) : null;
  // The field to follow: the one picked, else a field of the target with the most history.
  const follow = field ?? (targetRec ? defaultField(targetRec, steps) : null);
  const step = steps.find((s) => s.index === picked) ?? target;
  const before = step ? [...steps.slice(0, steps.indexOf(step))].reverse().find((s) => s.example) : undefined;
  const suspects = steps.filter((s) => s.recent);
  const name = (id: string | null) => (id ? (state.elements.find((e) => e.id === id)?.name ?? id) : null);

  return (
    <div className="inspector backtrack" role="dialog" aria-modal="true" aria-label="Backtrack" data-testid="backtrack">
      <div className="inspector-head">
        <div className="inspector-title">
          <span className="panel-kind">Backtrack</span> <strong className="truncate">{result?.title ?? "…"}</strong>
        </div>
        <div className="row">
          <label className="small muted">
            Recent ={" "}
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} data-testid="backtrack-days">
              {WINDOWS.map((d) => (
                <option key={d} value={d}>
                  last {d} days
                </option>
              ))}
            </select>
          </label>
          <button className="primary" onClick={onClose} data-testid="backtrack-close">
            Close
          </button>
        </div>
      </div>
      {error && <div className="empty-note inspector-error">{error}</div>}
      {result && (
        <div className="backtrack-body">
          <div className="backtrack-steps panel-body" data-testid="backtrack-steps">
            {suspects.length > 0 ? (
              <div className="backtrack-suspects" data-testid="backtrack-suspects">
                <strong>Changed in the last {result.recentDays} days:</strong> {suspects.map((s) => `${s.index ? `${s.index}. ` : ""}${s.name}`).join(", ")}
              </div>
            ) : (
              <div className="muted small">
                Nothing on this path changed in the last {result.recentDays} days.
                {!result.codeHistory && " The code folder is not in a git repository, so code history is not shown."}
                {!result.modelHistory && " The model is not in a git repository, so model history is not shown."}
              </div>
            )}
            <ol className="backtrack-list">
              {[...steps].reverse().map((s) => {
                const v = follow ? fieldOf(asRecord(s.example), follow) : null;
                return (
                  <li key={s.index}>
                    <button className={`${s.index === step?.index ? "on" : ""}${s.recent ? " recent" : ""}`} onClick={() => setPicked(s.index)} data-testid={`backtrack-step-${s.index}`}>
                      <span className="bt-num">{s.index === 0 ? "in" : s.index}</span>
                      <span className="bt-main">
                        <span className="bt-name">{s.name}</span>
                        <span className="muted small truncate">{name(s.elementId) ?? s.description}</span>
                        {follow && v && (
                          <code className="small truncate">
                            {v.key}: {show(v.value)}
                          </code>
                        )}
                      </span>
                      {s.recent && <span className="bt-badge">changed</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
          {step && (
            <div className="backtrack-detail panel-body" data-testid="backtrack-detail">
              <h3 className="panel-title">
                {step.index === 0 ? "Data entering" : `Step ${step.index}`}: {step.name}
              </h3>
              {step.elementId && (
                <div className="small">
                  Done by{" "}
                  <button
                    className="link"
                    onClick={() => {
                      onClose();
                      onReveal(step.elementId!);
                    }}
                  >
                    {name(step.elementId)}
                  </button>
                  {step.description && <span className="muted"> · {step.description}</span>}
                </div>
              )}

              <h4>Data{step.format ? ` · ${step.format}` : ""}</h4>
              {step.example ? (
                <>
                  <SamplePayload text={step.example} previous={before?.example} testId="backtrack-sample" />
                  {asRecord(step.example) && (
                    <div className="backtrack-fields">
                      <span className="muted small">Follow a field back:</span>
                      {Object.keys(asRecord(step.example)!).map((k) => (
                        <button key={k} className={`chip${follow && norm(k) === norm(follow) ? " on" : ""}`} onClick={() => setField(k)}>
                          {k}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="empty-note">No sample for this step. Add one in the stage or flow step so this path can be followed.</div>
              )}
              {follow && <FieldHistory field={follow} steps={steps} onPick={setPicked} />}

              <h4>Code</h4>
              {step.files.length === 0 && <div className="empty-note">No code is mapped to {name(step.elementId) ?? "this step"}. Map files in its panel (Code section).</div>}
              {step.files.map((f) => (
                <div key={f.path} className="bt-file" data-testid="backtrack-file">
                  <div className="pd-head">
                    <button className="link" onClick={() => onOpenFile(f.path)} disabled={!f.exists}>
                      {f.path}
                    </button>
                    {!f.exists && <span className="muted small">missing</span>}
                    {f.uncommitted && <span className="bt-badge">not committed</span>}
                  </div>
                  {f.functions.length > 0 && (
                    <div className="bt-functions">
                      {f.functions.map((fn) => (
                        <span key={`${fn.name}:${fn.line}`} className={`chip small${fn.changed ? " changed" : ""}`} title={`${fn.kind}, line ${fn.line}${fn.changed ? ", changed recently" : ""}`}>
                          {fn.name}
                          {fn.changed && " •"}
                        </span>
                      ))}
                    </div>
                  )}
                  <Commits commits={f.commits} since={result.since} />
                </div>
              ))}

              <h4>Model history</h4>
              {step.modelChanges.length === 0 ? (
                <div className="muted small">{result.modelHistory ? "No commit changed this step in the model." : "The model is not in a git repository."}</div>
              ) : (
                <ul className="bt-commits">
                  {step.modelChanges.map((m, i) => (
                    <li key={`${m.sha}-${i}`} className={Date.parse(m.date) >= Date.parse(result.since) ? "recent" : ""}>
                      <span className="muted">{ago(m.date)}</span> {m.what}{" "}
                      <span className="muted">
                        · {m.author}: “{m.subject}”
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Commits({ commits, since }: { commits: CommitInfo[]; since: string }) {
  if (!commits.length) return null;
  return (
    <ul className="bt-commits">
      {commits.slice(0, 5).map((c) => (
        <li key={c.sha} className={Date.parse(c.date) >= Date.parse(since) ? "recent" : ""}>
          <span className="muted">{ago(c.date)}</span> {c.subject}{" "}
          <span className="muted">
            · {c.author} · {c.sha.slice(0, 7)}
          </span>
        </li>
      ))}
      {commits.length > 5 && <li className="muted small">… {commits.length - 5} older</li>}
    </ul>
  );
}

/** One field's value in every step, from the first to the last: where it appeared and where it changed. */
function FieldHistory({ field, steps, onPick }: { field: string; steps: BacktrackStep[]; onPick(i: number): void }) {
  let prev: { value: unknown } | null = null;
  const rows = steps.map((s) => {
    const rec = asRecord(s.example);
    const v = fieldOf(rec, field);
    let mark: "appears" | "changed" | "same" | "absent" | "no data";
    if (!s.example || !rec) mark = "no data";
    else if (!v) mark = "absent";
    else if (!prev) mark = "appears";
    else mark = JSON.stringify(prev.value) === JSON.stringify(v.value) ? "same" : "changed";
    if (v) prev = v;
    else if (rec) prev = null;
    return { s, v, mark };
  });
  // Fields with a word in common, for a value that was renamed or computed from another (amountMinor → amount).
  const mine = new Set(words(field));
  const related = new Set<string>();
  for (const s of steps) {
    const rec = asRecord(s.example);
    if (rec) for (const k of Object.keys(rec)) if (norm(k) !== norm(field) && words(k).some((w) => mine.has(w))) related.add(k);
  }
  return (
    <div className="bt-field" data-testid="backtrack-field">
      <h4>“{field}” through the steps</h4>
      <table className="bt-table">
        <tbody>
          {rows.map(({ s, v, mark }) => (
            <tr key={s.index} className={mark} onClick={() => onPick(s.index)}>
              <td className="bt-num">{s.index === 0 ? "in" : s.index}</td>
              <td>{s.name}</td>
              <td>
                <code>{v ? show(v.value) : "—"}</code>
              </td>
              <td className="small">{mark === "same" ? "" : mark}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {related.size > 0 && <div className="muted small">Related fields: {[...related].join(", ")}</div>}
    </div>
  );
}
