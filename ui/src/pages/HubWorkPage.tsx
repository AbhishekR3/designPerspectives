/**
 * Work across projects (WRK-05): the linked work of every project this person may see, from each main model,
 * with filters (project, status, type, severity, tool, what it is pinned to, text). Read-only: each row links to
 * its project, where items are edited and their status refreshed.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { errorMessage } from "../common/notify";
import { plural } from "../common/plural";
import { isOpenWork } from "../../../src/shared/workLinks";
import { projectLink } from "../hooks/useNavigation";
import { WORK_TOOLS, WORK_TOOL_LABEL, type HubInfo, type HubWorkList, type HubWorkRow } from "../types";
import { ago } from "./HomePage";

const SEVERITIES = ["critical", "high", "medium", "low"];
const rank = (s: string | undefined) => (s ? SEVERITIES.indexOf(s) : SEVERITIES.length);
const KIND_LABEL: Record<string, string> = {
  project: "Project",
  relationship: "Line",
  diagram: "Diagram",
  flow: "Flow",
  person: "Person",
  softwareSystem: "System",
  container: "Container",
  component: "Component",
};
const kindLabel = (k: string) => KIND_LABEL[k] ?? k;
const statusLabel = (s: string) => s.replace("-", " ");

export function HubWorkPage({ hub }: { hub: HubInfo }) {
  const isHub = hub.mode === "hub";
  const [data, setData] = useState<HubWorkList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("open");
  const [type, setType] = useState("");
  const [severity, setSeverity] = useState("");
  const [tool, setTool] = useState("");
  const [kind, setKind] = useState("");
  const [grouped, setGrouped] = useState(isHub);

  const load = useCallback(() => {
    api.hubWork().then(
      (d) => (setData(d), setError(null)),
      (e) => setError(errorMessage(e)),
    );
  }, []);
  useEffect(() => load(), [load]);
  // Others change the models too: read again when the window gets the focus back.
  useEffect(() => {
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const names = useMemo(() => new Map((data?.projects ?? []).map((p) => [p.id, p.name])), [data]);
  const types = useMemo(() => new Map((data?.types ?? []).map((t) => [t.id, t.label])), [data]);
  const kinds = useMemo(() => [...new Set(rows.map((r) => r.targetKind))].sort(), [rows]);
  const pr = (id: string) => (isHub ? id : null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => {
        const w = r.item;
        if (project && r.project !== project) return false;
        if (status === "open" ? !isOpenWork(w) : status !== "all" && w.status !== status) return false;
        if (type && w.type !== type) return false;
        if (tool && (tool === "none" ? r.tool !== null : r.tool !== tool)) return false;
        if (severity && (severity === "none" ? !!w.severity : w.severity !== severity)) return false;
        if (kind && r.targetKind !== kind) return false;
        return !q || [w.title, w.url, w.note, w.remote, r.label, names.get(r.project)].some((t) => t?.toLowerCase().includes(q));
      })
      .sort((a, b) => rank(a.item.severity) - rank(b.item.severity) || (names.get(a.project) ?? "").localeCompare(names.get(b.project) ?? "") || a.label.localeCompare(b.label) || a.index - b.index);
  }, [rows, names, query, project, status, type, tool, severity, kind]);

  const groups = useMemo(() => {
    if (!grouped) return [{ project: null as string | null, rows: shown }];
    const m = new Map<string, HubWorkRow[]>();
    for (const r of shown) m.set(r.project, [...(m.get(r.project) ?? []), r]);
    return (data?.projects ?? []).filter((p) => m.has(p.id)).map((p) => ({ project: p.id as string | null, rows: m.get(p.id)! }));
  }, [grouped, shown, data]);

  const open = rows.filter((r) => isOpenWork(r.item));
  const urgent = open.filter((r) => r.item.severity === "critical" || r.item.severity === "high").length;
  const security = open.filter((r) => r.item.type === "security").length;
  const columns = grouped ? 7 : 8;

  /** Where a row's "pinned to" goes: an element is shown on its diagram, a diagram or flow opens, anything else opens the project's Work page. */
  const pinHref = (r: HubWorkRow) => {
    if (r.target.type === "element") return projectLink(pr(r.project), { reveal: r.target.id });
    if (r.target.type === "diagram") return projectLink(pr(r.project), { key: r.target.id });
    return projectLink(pr(r.project), { page: "work" });
  };

  return (
    <div className="home" data-testid="hub-work-page">
      <header className="home-head">
        <div>
          <h1>Work</h1>
          <p className="muted">
            Issues, pull requests, security findings and tickets linked to {isHub ? "every project's model" : "the model"}, from the main version. Add items, change them and refresh their status in a
            project&apos;s own Work page.
          </p>
        </div>
      </header>
      {error && <p className="error-text">Could not load the linked work: {error}</p>}
      {!data && !error && <p className="muted">Reading the models…</p>}
      {data && (
        <>
          <div className="hub-work-stats" data-testid="hub-work-summary">
            <span>
              <strong>{open.length}</strong> open
            </span>
            <span>
              <strong>{urgent}</strong> critical or high
            </span>
            <span>
              <strong>{security}</strong> security
            </span>
            {isHub && (
              <span>
                in <strong>{data.projects.filter((p) => p.open > 0).length}</strong> of {plural(data.projects.length, "project")}
              </span>
            )}
          </div>
          {isHub && (
            <div className="dec-chips" role="group" aria-label="Project">
              <button className={`tiny${project === "" ? " on" : ""}`} onClick={() => setProject("")} data-testid="hub-work-project-all">
                Every project
              </button>
              {data.projects.map((p) => (
                <button
                  key={p.id}
                  className={`tiny${project === p.id ? " on" : ""}`}
                  onClick={() => setProject(project === p.id ? "" : p.id)}
                  title={p.error ? `Cannot be read: ${p.error}` : `${p.open} open of ${p.total}`}
                  data-testid={`hub-work-project-${p.id}`}
                >
                  {p.name} <span className="muted">{p.error ? "!" : p.open}</span>
                </button>
              ))}
            </div>
          )}
          {data.projects
            .filter((p) => p.error)
            .map((p) => (
              <p key={p.id} className="warn-note small">
                {p.name} cannot be read: {p.error}
              </p>
            ))}

          <div className="work-filters hub-work-filters" role="search">
            <input
              type="search"
              placeholder="Search titles, notes, projects and what they are pinned to…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search linked work"
              data-testid="hub-work-search"
            />
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" data-testid="hub-work-status">
              <option value="open">Not done</option>
              <option value="all">All</option>
              {data.statuses.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
            <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type" data-testid="hub-work-type">
              <option value="">Every type</option>
              {data.types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Severity" data-testid="hub-work-severity">
              <option value="">Any severity</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value="none">No severity</option>
            </select>
            <select value={tool} onChange={(e) => setTool(e.target.value)} aria-label="Tool" data-testid="hub-work-tool">
              <option value="">Every tool</option>
              {WORK_TOOLS.map((t) => (
                <option key={t} value={t}>
                  {WORK_TOOL_LABEL[t]}
                </option>
              ))}
              <option value="none">No tool</option>
            </select>
            <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Pinned to" data-testid="hub-work-kind">
              <option value="">Pinned to anything</option>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {kindLabel(k)}
                </option>
              ))}
            </select>
            {isHub && (
              <label className="check small">
                <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} data-testid="hub-work-group" /> Group by project
              </label>
            )}
          </div>

          {shown.length === 0 ? (
            <div className="work-empty" data-testid="hub-work-empty">
              <h2>{rows.length ? "Nothing matches" : "No linked work yet"}</h2>
              <p className="muted">
                {rows.length
                  ? "Change the filters to see more."
                  : "Open a project and use its Work button, or right-click a box, a line or empty space and choose Link work…, to pin issues, pull requests, findings and tickets."}
              </p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="home-table work-table" data-testid="hub-work-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    {!grouped && isHub && <th>Project</th>}
                    <th>Tool</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Severity</th>
                    <th>Pinned to</th>
                    <th>Remote status</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <Fragment key={g.project ?? "all"}>
                      {g.project && (
                        <tr className="work-group" data-testid="hub-work-group">
                          <th colSpan={columns}>
                            <a href={projectLink(pr(g.project), { page: "work" })}>{names.get(g.project) ?? g.project}</a> <span className="muted small">{plural(g.rows.length, "item")}</span>
                          </th>
                        </tr>
                      )}
                      {g.rows.map((r) => (
                        <tr key={`${r.project}/${r.target.type}:${"id" in r.target ? r.target.id : ""}#${r.index}`} className={isOpenWork(r.item) ? "" : "work-done"} data-testid="hub-work-row">
                          <td className="work-title">
                            {r.item.url ? (
                              <a href={r.item.url} target="_blank" rel="noopener noreferrer" title={r.item.url}>
                                {r.item.title || r.item.url}
                              </a>
                            ) : (
                              r.item.title
                            )}
                            {r.item.note && <div className="muted small work-note">{r.item.note}</div>}
                          </td>
                          {!grouped && isHub && (
                            <td className="small">
                              <a href={projectLink(pr(r.project), { page: "work" })}>{names.get(r.project) ?? r.project}</a>
                            </td>
                          )}
                          <td>{r.tool ? <span className="work-tool">{WORK_TOOL_LABEL[r.tool]}</span> : <span className="muted">—</span>}</td>
                          <td className="small">{types.get(r.item.type) ?? r.item.type}</td>
                          <td className={`small status-${r.item.status}`}>{statusLabel(r.item.status)}</td>
                          <td>{r.item.severity ? <span className={`work-sev sev-${r.item.severity}`}>{r.item.severity}</span> : <span className="muted">—</span>}</td>
                          <td className="small">
                            <a href={pinHref(r)} title={r.target.type === "element" ? "Show it on its diagram" : "Open it in the project"} data-testid="hub-work-pin">
                              <span className="work-kind">{kindLabel(r.targetKind)}</span> {r.label}
                            </a>
                          </td>
                          <td className="small">
                            {r.item.remote ? (
                              <>
                                {r.item.remote}
                                {r.item.checked && <div className="muted">checked {ago(r.item.checked)}</div>}
                              </>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
