/**
 * "How it works" on the Work page (WRK-04): what linked work is, where its status comes from and how it changes,
 * how CI brings findings in, and the model's severity mapping, which people with edit rights can change. The
 * mapping is part of the model (the sidecar's `work.severity`), so a change is drafted and reviewed like any other.
 */

import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { CopyButton } from "../common/CopyButton";
import { DEFAULT_WORK_SEVERITY, WORK_SEVERITY_TABLES, WORK_TOOL_LABEL, type AppState, type WorkSeverityChoice, type WorkSeverityMaps, type WorkSeverityTable, type WorkToolId } from "../types";

const LINKS: Record<WorkToolId, string[]> = {
  github: ["…/owner/repo/issues/12", "…/owner/repo/pull/34"],
  gitlab: ["…/group/project/-/issues/12", "…/group/project/-/merge_requests/34"],
  sonar: ["…/project/issues?id=PROJECT&issues=KEY", "…/security_hotspots?id=PROJECT&hotspots=KEY", "…/dashboard?id=PROJECT (the quality gate)"],
  jira: ["…/browse/KEY-123"],
};

const TABLES: Record<WorkSeverityTable, { title: string; usedBy: string; placeholder: string }> = {
  sarifLevel: { title: "SARIF levels", usedBy: "dp work import --format sarif, for a finding without a security-severity score", placeholder: "error" },
  codeQuality: { title: "GitLab Code Quality", usedBy: "dp work import --format gitlab-codequality", placeholder: "major" },
  sonar: { title: "SonarQube severities", usedBy: "dp work import --format sonar-issues, and Refresh status on SonarQube issues and hotspots", placeholder: "major" },
  jira: { title: "Jira priorities", usedBy: "Refresh status on Jira issues. Add your site's own priority names here.", placeholder: "P1" },
};
const CHOICES: { value: WorkSeverityChoice; label: string }[] = [
  { value: "critical", label: "critical" },
  { value: "high", label: "high" },
  { value: "medium", label: "medium" },
  { value: "low", label: "low" },
  { value: "", label: "no severity" },
];

/** A table as rows that can be edited: the name is free text while typing; the table is rebuilt on save. */
type Rows = Record<WorkSeverityTable, { name: string; severity: WorkSeverityChoice }[]>;
const toRows = (m: WorkSeverityMaps): Rows => Object.fromEntries(WORK_SEVERITY_TABLES.map((t) => [t, Object.entries(m[t]).map(([name, severity]) => ({ name, severity }))])) as Rows;

/** The mapping the rows make, or why they make none. */
function fromRows(rows: Rows, score: Record<"critical" | "high" | "medium", string>): { maps: WorkSeverityMaps } | { error: string } {
  const s = { critical: Number(score.critical), high: Number(score.high), medium: Number(score.medium) };
  if (Object.values(score).some((v) => v.trim() === "") || Object.values(s).some((n) => !Number.isFinite(n) || n < 0 || n > 10)) return { error: "SARIF scores are numbers from 0 to 10." };
  if (!(s.critical > s.high && s.high > s.medium)) return { error: "SARIF scores must go down from critical to high to medium." };
  const maps = { sarifScore: s } as WorkSeverityMaps;
  for (const t of WORK_SEVERITY_TABLES) {
    const table: Record<string, WorkSeverityChoice> = {};
    for (const r of rows[t]) {
      const name = r.name.trim().toLowerCase();
      if (!name) continue;
      if (name in table) return { error: `"${name}" is listed twice in ${TABLES[t].title}.` };
      table[name] = r.severity;
    }
    maps[t] = table;
  }
  return { maps };
}

const sameMaps = (a: WorkSeverityMaps, b: WorkSeverityMaps) => {
  const norm = (m: WorkSeverityMaps) => JSON.stringify([m.sarifScore, ...WORK_SEVERITY_TABLES.map((t) => Object.entries(m[t]).sort(([x], [y]) => x.localeCompare(y)))]);
  return norm(a) === norm(b);
};

export function WorkGuide({ state, mutate }: { state: AppState; mutate(fn: () => Promise<unknown>): Promise<boolean> }) {
  const canEdit = !state.readOnly;
  const saved = state.workSeverity;
  const [rows, setRows] = useState<Rows>(() => toRows(saved));
  const [score, setScore] = useState(() => ({ critical: String(saved.sarifScore.critical), high: String(saved.sarifScore.high), medium: String(saved.sarifScore.medium) }));
  const [busy, setBusy] = useState(false);
  // The model changed under the form (undo, another tab, a draft switch): show what it holds now.
  const savedKey = JSON.stringify(saved);
  useEffect(() => {
    setRows(toRows(saved));
    setScore({ critical: String(saved.sarifScore.critical), high: String(saved.sarifScore.high), medium: String(saved.sarifScore.medium) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new saved value resets the form
  }, [savedKey]);

  const result = useMemo(() => fromRows(rows, score), [rows, score]);
  const changed = "maps" in result && !sameMaps(result.maps, saved);
  const isDefault = sameMaps(saved, DEFAULT_WORK_SEVERITY);

  const save = async (maps: WorkSeverityMaps | null) => {
    setBusy(true);
    try {
      await mutate(() => api.setWorkSettings(maps));
    } finally {
      setBusy(false);
    }
  };
  const setRow = (t: WorkSeverityTable, i: number, patch: Partial<Rows[WorkSeverityTable][number]>) => setRows((r) => ({ ...r, [t]: r[t].map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const connections = state.workConnections;
  const cli = [
    "# after the scanner has written its report",
    "dp work import results.sarif --format sarif --source codeql --close-missing",
    "git add architecture && git commit -m 'Update linked work from the scan'",
  ].join("\n");

  return (
    <div className="work-body work-guide" data-testid="work-guide">
      <section className="home-box">
        <h2>What linked work is</h2>
        <p>
          A linked work item is an issue, pull request, security finding, quality gate, backlog item or ticket that matters to the architecture. You pin it to a box, a line, a diagram, a flow or the
          whole project. Items are part of the model, kept in <code>workspace.json</code>: a draft can add or close them, and a review shows those changes with the rest.
        </p>
        <p className="muted small">
          The checklist is different: it holds modelling to-dos for this project and sits next to the model, not in it. Linked work points at things tracked in other tools.
        </p>
      </section>

      <section className="home-box" data-testid="work-guide-tools">
        <h2>Where status comes from</h2>
        <p>
          <strong>Refresh status</strong> asks each tool about the links it knows, and only when someone presses it. dp sends a stored token only to the server it belongs to. Links on other servers
          are kept, but dp never reads their status.
        </p>
        <div className="table-wrap">
          <table className="home-table">
            <thead>
              <tr>
                <th>Tool</th>
                <th>Server</th>
                <th>Links dp reads</th>
              </tr>
            </thead>
            <tbody>
              {connections.map((c) => (
                <tr key={c.id} data-testid="work-guide-connection">
                  <td>
                    <span className="work-tool">{WORK_TOOL_LABEL[c.tool]}</span>
                  </td>
                  <td className="small">
                    {c.base} <span className="muted">{c.builtIn ? "(built in)" : "(added by an architect)"}</span>
                  </td>
                  <td className="small">
                    {LINKS[c.tool].map((l) => (
                      <div key={l}>
                        <code>{l}</code>
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          Your own GitLab, SonarQube or Jira server is added by an architect on the Credentials page, under Tool connections (or with <code>dp integrations set</code>), along with the credential it
          uses.
        </p>
      </section>

      <section className="home-box">
        <h2>How status changes</h2>
        <div className="table-wrap">
          <table className="home-table">
            <thead>
              <tr>
                <th>The tool says</th>
                <th>The item becomes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>done (closed, merged, resolved, gate passed)</td>
                <td>done</td>
              </tr>
              <tr>
                <td>open, and the item was done</td>
                <td>open again</td>
              </tr>
              <tr>
                <td>in progress, and the item was open</td>
                <td>in progress</td>
              </tr>
              <tr>
                <td>anything else</td>
                <td>unchanged (a status you set by hand, such as blocked, stays)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted small">
          The tool&apos;s own words, such as &quot;Merged&quot; or &quot;Quality gate failed · 3 bugs&quot;, appear under Remote status, along with when they were read. A refresh that changes nothing
          writes nothing.
        </p>
      </section>

      <section className="home-box">
        <h2>Bringing findings in from CI</h2>
        <p>
          <code>dp work import</code> reads a scan report (SARIF, GitLab Code Quality, a SonarQube issues answer or dp&apos;s own list) and pins each finding to the box whose code paths hold its file.
          The longest matching path wins. Findings outside every box&apos;s code go on the project.
        </p>
        <ul className="small">
          <li>
            <code>--source NAME</code> marks the items as coming from one scanner, so a later run updates them instead of adding them again.
          </li>
          <li>
            <code>--close-missing</code> sets that scanner&apos;s items to done when a run no longer reports them.
          </li>
          <li>
            <code>--check</code> shows what would change and writes nothing. <code>--draft ID</code> writes into a draft instead of the main model.
          </li>
        </ul>
        <div className="work-cli">
          <pre>{cli}</pre>
          <CopyButton text={cli} label="Copy" testId="work-guide-copy" />
        </div>
        <p className="muted small">
          By default an import writes to the model in the CI branch. The pull request is where people review it, and a draft would leave the findings out of the model until someone applies it. Add{" "}
          <code>--draft</code> when a team wants an architect to accept findings first.
        </p>
      </section>

      <section className="home-box" data-testid="work-severity">
        <div className="row">
          <h2>Severity mapping</h2>
          <span className="grow" />
          {isDefault ? <span className="muted small">dp&apos;s defaults</span> : <span className="muted small">changed for this model</span>}
        </div>
        <p>
          Tools name severities in their own words. These tables turn them into dp&apos;s four levels for imports and status refreshes. Names match in any case, and a name that is not listed gives no
          severity. The mapping is part of the model, so a change can be drafted and reviewed. Items already in the model keep their severity until the next import or refresh.
        </p>
        <fieldset className="work-sev-score" disabled={!canEdit}>
          <legend>SARIF security-severity score (0 to 10)</legend>
          {(["critical", "high", "medium"] as const).map((k) => (
            <label key={k} className="field">
              <span>{k} from</span>
              <input type="number" min={0} max={10} step={0.1} value={score[k]} onChange={(e) => setScore((s) => ({ ...s, [k]: e.target.value }))} data-testid={`sev-score-${k}`} />
            </label>
          ))}
          <span className="muted small">below medium: low</span>
        </fieldset>
        <div className="work-sev-tables">
          {WORK_SEVERITY_TABLES.map((t) => (
            <fieldset key={t} className="work-sev-table" disabled={!canEdit} data-testid={`sev-table-${t}`}>
              <legend>{TABLES[t].title}</legend>
              <p className="muted small">{TABLES[t].usedBy}</p>
              {rows[t].map((r, i) => (
                <div key={i} className="row work-sev-row" data-testid="sev-row">
                  <input value={r.name} onChange={(e) => setRow(t, i, { name: e.target.value })} aria-label={`${TABLES[t].title}: name`} placeholder={TABLES[t].placeholder} data-testid="sev-name" />
                  <span className="muted">→</span>
                  <select
                    value={r.severity}
                    onChange={(e) => setRow(t, i, { severity: e.target.value as WorkSeverityChoice })}
                    aria-label={`${TABLES[t].title}: severity of ${r.name}`}
                    data-testid="sev-choice"
                  >
                    {CHOICES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  {canEdit && (
                    <button
                      type="button"
                      className="ghost icon small"
                      onClick={() => setRows((x) => ({ ...x, [t]: x[t].filter((_, j) => j !== i) }))}
                      aria-label={`Remove ${r.name}`}
                      data-testid="sev-remove"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              {canEdit && (
                <button type="button" className="ghost small" onClick={() => setRows((x) => ({ ...x, [t]: [...x[t], { name: "", severity: "medium" }] }))} data-testid={`sev-add-${t}`}>
                  + Add a name
                </button>
              )}
            </fieldset>
          ))}
        </div>
        {canEdit && (
          <div className="row end">
            {"error" in result && (
              <span className="error-text small" data-testid="sev-error">
                {result.error}
              </span>
            )}
            <span className="grow" />
            <button type="button" className="ghost" disabled={busy || isDefault} onClick={() => void save(null)} data-testid="sev-reset">
              Use dp&apos;s defaults
            </button>
            <button
              type="button"
              className="ghost"
              disabled={busy || !changed}
              onClick={() => {
                setRows(toRows(saved));
                setScore({ critical: String(saved.sarifScore.critical), high: String(saved.sarifScore.high), medium: String(saved.sarifScore.medium) });
              }}
            >
              Discard changes
            </button>
            <button type="button" className="primary" disabled={busy || !changed} onClick={() => "maps" in result && void save(result.maps)} data-testid="sev-save">
              Save mapping
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
