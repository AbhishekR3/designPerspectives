/**
 * Import code (DEC-051): a page over the diagram. Scan the code, see what is decided and what is left, answer
 * what the code cannot say, then bring one level at a time into the model as a draft (your own coding agent, an
 * import file, or BMO). Nothing here changes the main model: every way ends as a draft that is reviewed first.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "../api";
import { BmoSheet } from "../common/BmoSheet";
import { Icon } from "../common/icons";
import { errorMessage, notify } from "../common/notify";
import { useBmoStatus } from "../hooks/useBmo";
import type { ChecklistApi } from "../hooks/useChecklist";
import type { Analysis, AppState, ImportDraftResult, ImportOverview, LevelAnalysis, ScanLevel } from "../types";
import { HandoffPanel, PastePanel, ResultNotice, type HandoffRequest } from "./ImportBringIn";
import { ImportIntake } from "./ImportIntake";

const LEVEL_NAME: Record<ScanLevel, string> = { c1: "C1 System context", c2: "C2 Containers", c3: "C3 Components", c4: "C4 Code" };
const MAX_DESCRIPTION = 60 * 1024;
const bytesOf = (s: string) => new TextEncoder().encode(s).length;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

interface Props {
  state: AppState;
  refresh(): Promise<unknown>;
  onClose(): void;
  /** Open an import draft (closes the page). */
  onOpenDraft(draftId: string): void;
  /** The checklist (DEC-084): BMO's questions land on it, and the import list is one of its starters. */
  checklist: ChecklistApi;
  /** Close this page and open the checklist card. */
  onOpenChecklist(): void;
}

/** A line about the checklist: add the import list when it is not all on it yet, and the way to open it. */
function ChecklistBlock({ checklist, onOpen }: { checklist: ChecklistApi; onOpen(): void }) {
  const list = checklist.data?.starters.find((s) => s.id === "import");
  const summary = checklist.data?.summary;
  if (!list || !summary) return null;
  const counted = summary.total - summary.skipped;
  return (
    <p className="row wrap small import-checklist" data-testid="import-checklist">
      {list.added >= list.total && (
        <span data-testid="import-checklist-progress">
          Checklist: {summary.done} of {counted} done
        </span>
      )}
      {list.added < list.total && checklist.can && (
        <button onClick={() => void checklist.addStarter("import")} data-testid="import-add-checklist">
          Add the import checklist
        </button>
      )}
      {(list.added >= list.total || summary.total > 0) && (
        <button className="ghost" onClick={onOpen} data-testid="import-open-checklist">
          Open the checklist
        </button>
      )}
    </p>
  );
}

function Section({ id, title, intro, children }: { id: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section className="import-sec" aria-labelledby={`import-h-${id}`} data-testid={`import-section-${id}`}>
      <h2 id={`import-h-${id}`}>{title}</h2>
      {intro && <p className="muted small import-intro">{intro}</p>}
      {children}
    </section>
  );
}

export function ImportPage({ state, refresh, onClose, onOpenDraft, checklist, onOpenChecklist }: Props) {
  const [overview, setOverview] = useState<ImportOverview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [example, setExample] = useState<string | null>(null);
  const [made, setMade] = useState<ImportDraftResult | null>(null);
  const canImport = state.can.import;
  const isArchitect = (!state.me || state.me.role === "architect") && !state.readOnly;
  const { status: bmo } = useBmoStatus();

  const load = useCallback(async () => {
    try {
      setOverview(await api.importOverview());
      setLoadError(null);
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, state.version]);
  useEffect(() => {
    let live = true;
    api.importExample().then(
      (x) => live && setExample(x.available ? x.text : null),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [state.version]);

  /** A draft was made: show what happened, and let the sidebar and the overview know. */
  const drafted = (r: ImportDraftResult) => {
    setMade(r);
    void checklist.reload();
    void refresh().catch(() => undefined);
    void load();
  };
  /** Run a route that answers with the overview (scan, ignore, finalize). */
  const act = async (fn: () => Promise<ImportOverview>): Promise<boolean> => {
    try {
      setOverview(await fn());
      return true;
    } catch (e) {
      notify.error(errorMessage(e));
      return false;
    }
  };
  const scan = async () => {
    setScanning(true);
    await act(() => api.importScan());
    setScanning(false);
  };

  const analysis = overview?.analysis ?? null;
  const ev = overview?.evidence ?? null;

  return (
    <div className="page import-page" data-testid="import-page">
      <header className="page-head">
        <button className="ghost" onClick={onClose} title="Back to the diagram" data-testid="import-close">
          <Icon name="back" size={14} /> Diagram
        </button>
        <h1>Import code</h1>
        <span className="muted small page-sub">Turn a codebase into a draft of the model, one level at a time</span>
      </header>
      <div className="import-body">
        {loadError && (
          <p className="error-text" data-testid="import-load-error">
            Could not load: {loadError}
          </p>
        )}
        {!overview && !loadError && <p className="muted">Loading…</p>}
        {!canImport && overview && (
          <p className="muted small" data-testid="import-readonly">
            Your role cannot scan or import here. You can read what is on this page.
          </p>
        )}
        {overview && <ChecklistBlock checklist={checklist} onOpen={onOpenChecklist} />}
        {overview && (
          <>
            <Section id="scan" title="What the scan found" intro="The scan reads only files, never BMO. The same code and settings always give the same numbers.">
              <div className="row wrap">
                <button className="primary" onClick={() => void scan()} disabled={!canImport || scanning} aria-busy={scanning} data-testid="import-scan">
                  {ev ? "Scan again" : "Run scan"}
                </button>
                {!ev && <span className="muted small">The code has not been scanned yet.</span>}
              </div>
              {ev && analysis && <ScanResult overview={overview} analysis={analysis} />}
            </Section>

            {analysis && (
              <Section id="ready" title="How much is left" intro="Done means decided in the model or ignored. Finalizing a level says you are happy with it.">
                <Readiness overview={overview} analysis={analysis} canFinalize={isArchitect} onOverview={setOverview} />
                <Candidates overview={overview} analysis={analysis} canIgnore={isArchitect} act={act} />
              </Section>
            )}

            <Section id="about" title="About this system" intro="Answers the code cannot give. They go into every prompt, so they are worth a minute.">
              <ImportIntake key={JSON.stringify(overview.intake)} intake={overview.intake} storedErrors={overview.intakeErrors} disabled={!canImport} onSaved={() => void load()} />
            </Section>

            <Section id="bring" title="Bring in a level" intro="Pick a level. It becomes a draft you review item by item; nothing reaches the main model until you apply it.">
              <BringIn state={state} bmoUsable={!!bmo?.canRun.ok} example={example} disabled={!canImport} onDraft={drafted} onOpenDraft={onOpenDraft} />
              {made && <ResultNotice result={made} onOpenDraft={onOpenDraft} onOpenChecklist={onOpenChecklist} />}
            </Section>

            <Section id="describe" title="From a description" intro="No code to read yet? Describe the system in words (up to 60 KB) and get a draft to review.">
              <Describe disabled={!canImport} onDraft={drafted} onOpenDraft={onOpenDraft} />
            </Section>

            <Section id="labels" title="Better labels" intro="Connections with no label, or only “Uses”, say little. BMO can suggest what flows.">
              <Labels disabled={!canImport} onDraft={drafted} onOpenDraft={onOpenDraft} />
            </Section>

            <Section id="drafts" title="Import drafts">
              {overview.importDrafts.length === 0 ? (
                <p className="empty-note" data-testid="import-drafts-empty">
                  No import drafts yet.
                </p>
              ) : (
                <ul className="import-drafts" data-testid="import-drafts">
                  {overview.importDrafts.map((d) => (
                    <li key={d.draftId} data-testid={`import-draft-${d.draftId}`}>
                      <div>
                        <strong>{d.title}</strong>
                        <div className="muted small">
                          {d.author ? `by ${d.author} · ` : ""}
                          {plural(d.total, "item")}: {d.byLevel.verified} verified, {d.byLevel.partly} partly verified, {d.byLevel.unverified} unverified · {d.byDecision.accepted} accepted,{" "}
                          {d.byDecision.pending} pending, {d.byDecision.rejected} rejected
                          {d.lowConfidence > 0 && ` · ${d.lowConfidence} low confidence waiting`}
                        </div>
                      </div>
                      <button onClick={() => onOpenDraft(d.draftId)} data-testid={`import-draft-open-${d.draftId}`}>
                        Open
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 1. what the scan found

function ScanResult({ overview, analysis }: { overview: ImportOverview; analysis: Analysis }) {
  const ev = overview.evidence!;
  const langs = Object.entries(ev.files.byLanguage)
    .map(([k, n]) => `${k} ${n}`)
    .join(", ");
  return (
    <div data-testid="scan-result">
      <div className="table-wrap">
        <table className="home-table" data-testid="scan-counts">
          <thead>
            <tr>
              <th>Level</th>
              <th>Facts found</th>
              <th>Candidates</th>
            </tr>
          </thead>
          <tbody>
            {analysis.levels.map((l) => (
              <tr key={l.level} data-testid={`scan-count-${l.level}`}>
                <td>{LEVEL_NAME[l.level]}</td>
                <td>{ev.facts[l.level]}</td>
                <td>{l.level === "c4" ? `${l.candidates} source files` : l.candidates}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small" data-testid="scan-files">
        {plural(ev.files.total, "file")} scanned{langs ? ` (${langs})` : ""}; {ev.imports} folder-to-folder import{ev.imports === 1 ? "" : "s"} found; {ev.files.binary} binary, {ev.files.skipped}{" "}
        skipped by a rule.
      </p>
      {ev.limits.length > 0 && (
        <details className="import-details" data-testid="scan-limits">
          <summary>Limits hit ({ev.limits.length})</summary>
          <ul>
            {ev.limits.map((l, i) => (
              <li key={i}>
                {l.path && <code>{l.path}</code>} {l.detail}
              </li>
            ))}
          </ul>
        </details>
      )}
      {ev.notParsed.length > 0 && (
        <details className="import-details" data-testid="scan-not-parsed">
          <summary>Not parsed ({ev.notParsed.length})</summary>
          <ul>
            {ev.notParsed.map((n, i) => (
              <li key={i}>
                <code>{n.path}</code> {n.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
      <details className="import-details" data-testid="scan-cannot-see">
        <summary>What the scan cannot see</summary>
        <ul>
          {analysis.cannotSee.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------- 2. readiness

function Readiness({ overview, analysis, canFinalize, onOverview }: { overview: ImportOverview; analysis: Analysis; canFinalize: boolean; onOverview(o: ImportOverview): void }) {
  const [refused, setRefused] = useState<{ level: ScanLevel; message: string; unmet: string[] } | null>(null);
  const t = analysis.totals;
  const finalize = async (level: ScanLevel, final: boolean) => {
    setRefused(null);
    try {
      onOverview(await api.importLevel(level, final));
    } catch (e) {
      if (e instanceof ApiError && Array.isArray(e.data?.unmet)) setRefused({ level, message: e.message, unmet: e.data!.unmet as string[] });
      else notify.error(errorMessage(e));
    }
  };
  const row = (l: LevelAnalysis) => {
    const final = overview.state.levels[l.level];
    return (
      <tr key={l.level} data-testid={`level-row-${l.level}`} className={l.inScope ? undefined : "out-of-scope"}>
        <td>{LEVEL_NAME[l.level]}</td>
        <td>{l.level === "c4" ? `${l.candidates} files` : l.candidates}</td>
        <td>{l.decided}</td>
        <td>
          {l.left}
          {l.percentIsCeiling ? "*" : ""}
        </td>
        <td data-testid={`level-state-${l.level}`}>{l.inScope ? l.state : "outside the depth you chose"}</td>
        <td className="small">{l.level === "c4" || l.tokens === 0 ? "nothing" : `about ${l.tokens.toLocaleString()} tokens, ${plural(l.passes, "pass", "passes")}`}</td>
        <td>{l.reviewMinutes > 0 ? `${l.reviewMinutes} min` : "–"}</td>
        <td className="nowrap">
          {canFinalize && l.inScope && (
            <button className="small" onClick={() => void finalize(l.level, !final)} data-testid={`${final ? "reopen" : "finalize"}-${l.level}`}>
              {final ? "Reopen" : "Finalize"}
            </button>
          )}
        </td>
      </tr>
    );
  };
  const fired = analysis.recommendation.rules.filter((r) => r.fired);
  return (
    <div data-testid="readiness">
      <div className="table-wrap">
        <table className="home-table" data-testid="readiness-table">
          <thead>
            <tr>
              <th>Level</th>
              <th>Candidates</th>
              <th>Decided</th>
              <th>Left</th>
              <th>State</th>
              <th>BMO would read</th>
              <th>Your review</th>
              <th />
            </tr>
          </thead>
          <tbody>{analysis.levels.map(row)}</tbody>
        </table>
      </div>
      {analysis.levels.some((l) => l.percentIsCeiling) && <p className="muted small">* Some files are in languages whose imports are not read, so edges between components are unknown.</p>}
      {refused && (
        <div className="warn-note stack" role="alert" data-testid="finalize-refused">
          <strong>{LEVEL_NAME[refused.level]} cannot be finalized yet.</strong>
          <ul data-testid="finalize-unmet">
            {refused.unmet.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </div>
      )}
      <p data-testid="readiness-totals">
        <strong>
          {t.decided} of {t.decided + t.left} decided ({t.percent}%)
        </strong>
        . {plural(t.effortItems, "item")} to review, about {t.reviewMinutes} minute{t.reviewMinutes === 1 ? "" : "s"}. BMO would read about {t.tokens.toLocaleString()} tokens in{" "}
        {plural(t.passes, "pass", "passes")}.
      </p>
      <p className="muted small">“100%” means every candidate the scan can find is decided. It does not mean the model is complete.</p>
      {t.intakeUnanswered.length > 0 && (
        <p className="small" data-testid="readiness-unanswered">
          Not answered yet in “About this system”: {t.intakeUnanswered.join(", ")}.
        </p>
      )}
      {analysis.broken.length > 0 && (
        <ul className="warn-note stack" data-testid="readiness-broken">
          {analysis.broken.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
      <div data-testid="recommendation">
        <p>
          <strong>{analysis.recommendation.mode === "step-by-step" ? "Recommended: one level at a time (C1, then C2, then C3)." : "A small repository: you can bring in everything in one go."}</strong>
        </p>
        {fired.length > 0 ? (
          <ul className="small" data-testid="recommendation-rules">
            {fired.map((r, i) => (
              <li key={i}>
                {r.rule} ({r.value}, limit {r.threshold})
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">No rule asked for step by step.</p>
        )}
      </div>
    </div>
  );
}

/** Candidates not decided yet, and the ignore list. */
function Candidates({ overview, analysis, canIgnore, act }: { overview: ImportOverview; analysis: Analysis; canIgnore: boolean; act(fn: () => Promise<ImportOverview>): Promise<boolean> }) {
  const [path, setPath] = useState("");
  const left = analysis.levels.flatMap((l) => l.items.filter((c) => c.status === "left"));
  const unmapped = analysis.levels.find((l) => l.level === "c4")?.unmapped ?? [];
  const unmappedTotal = analysis.levels.find((l) => l.level === "c4")?.unmappedTotal ?? unmapped.length;
  const ignore = overview.state.ignore;
  const add = async (p: string) => (await act(() => api.importIgnore(p))) && setPath("");
  return (
    <div data-testid="candidates">
      {left.length > 0 && (
        <details className="import-details" data-testid="candidates-left">
          <summary>Candidates not decided yet ({left.length})</summary>
          <ul className="import-list">
            {left.slice(0, 80).map((c) => (
              <li key={c.id} data-testid={`candidate-${c.id}`}>
                <span>
                  <strong>{c.name}</strong>{" "}
                  <span className="muted small">
                    {LEVEL_NAME[c.level]} · {c.paths[0] ?? c.id}
                  </span>
                </span>
                {canIgnore && (
                  <button className="tiny" onClick={() => void add(c.id)} data-testid={`ignore-candidate-${c.id}`}>
                    Ignore
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      {unmapped.length > 0 && (
        <details className="import-details" data-testid="unmapped-files">
          <summary>Files outside every component ({unmappedTotal})</summary>
          <p className="muted small">An upper bound until C3 is final. Ignore what is not part of the system.</p>
          <ul className="import-list">
            {unmapped.map((f) => (
              <li key={f}>
                <code>{f}</code>
                {canIgnore && (
                  <button className="tiny" onClick={() => void add(f)} data-testid={`ignore-file-${f}`}>
                    Ignore
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      <details className="import-details" open={ignore.length > 0} data-testid="ignore-list">
        <summary>Ignore list ({ignore.length})</summary>
        <p className="muted small">Paths, patterns or candidate names the scan and BMO leave out.</p>
        {ignore.length === 0 && <p className="empty-note">Nothing is ignored.</p>}
        <ul className="import-list">
          {ignore.map((p) => (
            <li key={p}>
              <code>{p}</code>
              {canIgnore && (
                <button className="tiny" onClick={() => void act(() => api.importIgnore(p, true))} data-testid={`ignore-remove-${p}`} aria-label={`Stop ignoring ${p}`}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
        {canIgnore && (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              if (path.trim()) void add(path.trim());
            }}
          >
            <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="e.g. vendor/** or c2:legacy-job" aria-label="Path to ignore" data-testid="ignore-input" />
            <button type="submit" disabled={!path.trim()} data-testid="ignore-add">
              Ignore
            </button>
          </form>
        )}
        {!canIgnore && <p className="muted small">Only an architect changes the ignore list.</p>}
      </details>
    </div>
  );
}

// ---------------------------------------------------------------- 4. bring in a level

type Tab = "handoff" | "paste" | "bmo";

function BringIn({
  state,
  bmoUsable,
  example,
  disabled,
  onDraft,
  onOpenDraft,
}: {
  state: AppState;
  bmoUsable: boolean;
  example: string | null;
  disabled: boolean;
  onDraft(r: ImportDraftResult): void;
  onOpenDraft(id: string): void;
}) {
  const [tab, setTab] = useState<Tab>("handoff");
  const [level, setLevel] = useState<"c1" | "c2" | "c3">("c1");
  const containers = state.elements.filter((e) => e.kind === "container");
  const [container, setContainer] = useState("");
  const [sheet, setSheet] = useState(false);
  const needsContainer = level === "c3";
  const chosen = container || containers[0]?.id || "";
  const request: HandoffRequest = { task: "import-level", level, ...(needsContainer && chosen ? { container: chosen } : {}) };
  const tabs: { id: Tab; label: string }[] = [
    { id: "handoff", label: "Use your own coding agent" },
    { id: "paste", label: "Paste an import file" },
    ...(bmoUsable ? [{ id: "bmo" as const, label: "Ask BMO" }] : []),
  ];
  return (
    <div data-testid="bring-in">
      <div className="row wrap">
        <label className="field inline">
          <span>Level</span>
          <select value={level} onChange={(e) => setLevel(e.target.value as "c1" | "c2" | "c3")} disabled={disabled} data-testid="bring-level">
            <option value="c1">C1 System context</option>
            <option value="c2">C2 Containers</option>
            <option value="c3">C3 Components</option>
          </select>
        </label>
        {needsContainer && (
          <label className="field inline">
            <span>Container</span>
            <select value={chosen} onChange={(e) => setContainer(e.target.value)} disabled={disabled} data-testid="bring-container">
              {containers.length === 0 && <option value="">No containers yet</option>}
              {containers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="seg import-tabs" role="tablist" aria-label="How to bring it in">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`small${tab === t.id ? " active" : ""}`} onClick={() => setTab(t.id)} data-testid={`tab-${t.id}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="import-panel">
        {tab === "handoff" && <HandoffPanel request={request} label="Write the prompt" disabled={disabled || (needsContainer && !chosen)} onDraft={onDraft} idPrefix="bring" />}
        {tab === "paste" && <PastePanel example={example} disabled={disabled} onDraft={onDraft} />}
        {tab === "bmo" && (
          <div data-testid="bmo-panel">
            <p className="muted small">BMO reads the files the scan found for this level and writes an import file. You see exactly what is sent before it goes.</p>
            <button className="primary" onClick={() => setSheet(true)} disabled={needsContainer && !chosen} data-testid="bmo-import-level">
              Ask BMO to import {level.toUpperCase()}
            </button>
          </div>
        )}
      </div>
      {sheet && (
        <BmoSheet
          title={`Ask BMO: import ${level.toUpperCase()}`}
          request={{ task: "import-level", level, ...(needsContainer && chosen ? { container: chosen } : {}) }}
          onClose={() => setSheet(false)}
          handoffNote="Use the “Use your own coding agent” tab instead: BMO writes the prompt and you run it yourself."
          onOpenDraft={onOpenDraft}
          onDone={(r) => r.output === "import-file" && onDraft(r)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 5. from a description, 6. labels

function Describe({ disabled, onDraft, onOpenDraft }: { disabled: boolean; onDraft(r: ImportDraftResult): void; onOpenDraft(id: string): void }) {
  const [text, setText] = useState("");
  const [sheet, setSheet] = useState(false);
  const size = bytesOf(text);
  const tooBig = size > MAX_DESCRIPTION;
  return (
    <div data-testid="describe">
      <label className="field">
        <span>Describe the system</span>
        <textarea
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Who uses it, what it is made of, what talks to what."
          aria-invalid={tooBig ? true : undefined}
          data-testid="describe-text"
        />
        <span className={tooBig ? "field-error" : "muted small"} data-testid="describe-size">
          {(size / 1024).toFixed(1)} KB of 60 KB{tooBig ? ": too long" : ""}
        </span>
      </label>
      <div className="row wrap">
        <button className="primary" onClick={() => setSheet(true)} disabled={!text.trim() || tooBig} data-testid="describe-bmo">
          Ask BMO
        </button>
      </div>
      <details className="import-details">
        <summary>Use your own coding agent instead</summary>
        <HandoffPanel request={{ task: "describe-to-model", text }} label="Write the prompt" disabled={disabled || !text.trim() || tooBig} onDraft={onDraft} idPrefix="describe" />
      </details>
      {sheet && (
        <BmoSheet
          title="Ask BMO: from a description"
          request={{ task: "describe-to-model", text }}
          onClose={() => setSheet(false)}
          handoffNote="You can still use your own coding agent: open “Use your own coding agent instead” below the box."
          onOpenDraft={onOpenDraft}
          onDone={(r) => r.output === "import-file" && onDraft(r)}
        />
      )}
    </div>
  );
}

function Labels({ disabled, onDraft, onOpenDraft }: { disabled: boolean; onDraft(r: ImportDraftResult): void; onOpenDraft(id: string): void }) {
  const [sheet, setSheet] = useState(false);
  return (
    <div data-testid="labels">
      <div className="row wrap">
        <button onClick={() => setSheet(true)} data-testid="suggest-labels">
          Suggest labels
        </button>
      </div>
      <details className="import-details">
        <summary>Use your own coding agent instead</summary>
        <HandoffPanel request={{ task: "suggest-labels" }} label="Write the prompt" disabled={disabled} onDraft={onDraft} idPrefix="labels" />
      </details>
      {sheet && (
        <BmoSheet
          title="Suggest labels"
          request={{ task: "suggest-labels" }}
          onClose={() => setSheet(false)}
          handoffNote="You can still use your own coding agent: open “Use your own coding agent instead” on this page."
          onOpenDraft={onOpenDraft}
          onDone={(r) => r.output === "import-file" && onDraft(r)}
        />
      )}
    </div>
  );
}
