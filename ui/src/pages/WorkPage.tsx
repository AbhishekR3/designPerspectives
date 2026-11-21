/**
 * Linked work (WRK-02): a page over the diagram listing every work item of the shown model version, whatever it is
 * pinned to (a box, a line, a diagram, a flow or the project), with filters, status editing, a way to add an item
 * and the status refresh from the tools.
 */

import { Fragment, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Icon } from "../common/icons";
import { plural } from "../common/plural";
import { refreshWorkStatus } from "../common/workRefresh";
import { isOpenWork } from "../../../src/shared/workLinks";
import { ago } from "./HomePage";
import { WorkGuide } from "./WorkGuide";
import { WORK_TOOLS, WORK_TOOL_LABEL, type AppState, type WorkItem, type WorkList, type WorkRow, type WorkTarget } from "../types";

const SEVERITIES = ["critical", "high", "medium", "low"];
const rank = (s: string | undefined) => (s ? SEVERITIES.indexOf(s) : SEVERITIES.length);

export const targetKey = (t: WorkTarget): string => (t.type === "project" ? "project" : `${t.type}:${t.id}`);
const sameTarget = (a: WorkTarget, b: WorkTarget) => targetKey(a) === targetKey(b);
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

/** The number on the toolbar button: the open items that are critical or high, else every open item. */
export function workBadge(rows: WorkRow[]): { count: number; urgent: boolean } {
  const open = rows.filter((r) => isOpenWork(r.item));
  const urgent = open.filter((r) => r.item.severity === "critical" || r.item.severity === "high").length;
  return urgent ? { count: urgent, urgent: true } : { count: open.length, urgent: false };
}

/** A request from outside to start an item: the target it is about (`n` tells two requests for the same target apart). */
export interface WorkAddRequest {
  target: WorkTarget;
  n: number;
}

interface Props {
  state: AppState;
  onClose(): void;
  /** Show what an item is pinned to on its diagram (closes the page); a project has nothing to show. */
  onReveal(target: WorkTarget): void;
  mutate(fn: () => Promise<unknown>): Promise<boolean>;
  /** Open with the add form showing and this target chosen. */
  initialAdd?: WorkAddRequest | null;
  /** Every item (`useWork`): null until it is read. */
  work: WorkList | null;
  loadError: string | null;
}

export function WorkPage({ state, work: data, loadError, onClose, onReveal, mutate, initialAdd }: Props) {
  const [query, setQuery] = useState("");
  const [tool, setTool] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("open");
  const [severity, setSeverity] = useState("");
  const [kind, setKind] = useState("");
  const [grouped, setGrouped] = useState(false);
  const [adding, setAdding] = useState<WorkTarget | null>(initialAdd?.target ?? null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"items" | "guide">("items");
  const canEdit = !state.readOnly;

  // "Link work…" in a right-click menu while the page is already open.
  const lastRequest = initialAdd?.n;
  useEffect(() => {
    if (initialAdd) {
      setAdding(initialAdd.target);
      setView("items");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new request opens the form
  }, [lastRequest]);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const open = useMemo(() => rows.filter((r) => isOpenWork(r.item)), [rows]);
  const kinds = useMemo(() => [...new Set(rows.map((r) => r.targetKind))].sort(), [rows]);
  const types = useMemo(() => new Map(state.enums.workTypes.map((t) => [t.id, t.label])), [state.enums.workTypes]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => {
        const w = r.item;
        if (status === "open" ? !isOpenWork(w) : status !== "all" && w.status !== status) return false;
        if (type && w.type !== type) return false;
        if (tool && (tool === "none" ? r.tool !== null : r.tool !== tool)) return false;
        if (severity && (severity === "none" ? !!w.severity : w.severity !== severity)) return false;
        if (kind && r.targetKind !== kind) return false;
        return !q || [w.title, w.url, w.note, w.remote, r.label].some((t) => t?.toLowerCase().includes(q));
      })
      .sort((a, b) => rank(a.item.severity) - rank(b.item.severity) || a.label.localeCompare(b.label) || a.index - b.index);
  }, [rows, query, status, type, tool, severity, kind]);

  const groups = useMemo(() => {
    const m = new Map<string, { target: WorkTarget; label: string; kind: string; rows: WorkRow[] }>();
    for (const r of shown) {
      const k = targetKey(r.target);
      if (!m.has(k)) m.set(k, { target: r.target, label: r.label, kind: r.targetKind, rows: [] });
      m.get(k)!.rows.push(r);
    }
    return [...m.values()];
  }, [shown]);

  /** Change one item: its target's whole list goes back with the one row changed. */
  const patch = (r: WorkRow, change: Partial<WorkItem>) => {
    const list = rows
      .filter((x) => sameTarget(x.target, r.target))
      .sort((a, b) => a.index - b.index)
      .map((x) => (x.index === r.index ? { ...x.item, ...change } : x.item));
    void mutate(() => api.setWork(r.target, list));
  };

  const refresh = async () => {
    setBusy(true);
    try {
      await refreshWorkStatus(mutate);
    } finally {
      setBusy(false);
    }
  };

  const byTool = WORK_TOOLS.map((t) => [t, open.filter((r) => r.tool === t).length] as const).filter(([, n]) => n > 0);
  const securityOpen = open.filter((r) => r.item.type === "security").length;
  const hasLinks = rows.some((r) => r.tool);
  const columns = grouped ? 7 : 8;

  return (
    <div className="page" data-testid="work-page">
      <header className="page-head">
        <button className="ghost" onClick={onClose} title="Back to the diagram" data-testid="work-close">
          <Icon name="back" size={14} /> Diagram
        </button>
        <h1>
          Linked work <span className="muted">{rows.length}</span>
        </h1>
        <span className="muted small page-sub" data-testid="work-summary">
          {plural(open.length, "item")} open
          {securityOpen > 0 && ` · ${securityOpen} security`}
          {byTool.map(([t, n]) => ` · ${WORK_TOOL_LABEL[t]} ${n}`).join("")}
        </span>
        <div className="seg import-tabs" role="tablist" aria-label="Linked work">
          <button role="tab" aria-selected={view === "items"} className={`small${view === "items" ? " active" : ""}`} onClick={() => setView("items")} data-testid="work-tab-items">
            Items
          </button>
          <button role="tab" aria-selected={view === "guide"} className={`small${view === "guide" ? " active" : ""}`} onClick={() => setView("guide")} data-testid="work-tab-guide">
            How it works
          </button>
        </div>
        <span className="grow" />
        {view === "items" && canEdit && hasLinks && (
          <button onClick={() => void refresh()} disabled={busy} title="Read the status of every linked issue, pull request, finding and ticket from its tool" data-testid="work-page-refresh">
            {busy ? "Asking the tools…" : "↻ Refresh status"}
          </button>
        )}
        {view === "items" && canEdit && (
          <button className="primary" onClick={() => setAdding(adding ?? { type: "project" })} data-testid="work-page-add">
            <Icon name="plus" size={14} /> Add item
          </button>
        )}
      </header>

      {view === "guide" && <WorkGuide state={state} mutate={mutate} />}
      {view === "items" && adding && <AddForm state={state} initial={adding} onCancel={() => setAdding(null)} mutate={mutate} onDone={() => setAdding(null)} />}

      {view === "items" && (
        <>
          <div className="work-filters" role="search">
            <input
              type="search"
              placeholder="Search titles, notes and what they are pinned to…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search linked work"
              data-testid="work-search"
            />
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" data-testid="work-filter-status">
              <option value="open">Not done</option>
              <option value="all">All</option>
              {state.enums.workStatuses.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
            <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type" data-testid="work-filter-type">
              <option value="">Every type</option>
              {state.enums.workTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Severity" data-testid="work-filter-severity">
              <option value="">Any severity</option>
              {state.enums.severities.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value="none">No severity</option>
            </select>
            <select value={tool} onChange={(e) => setTool(e.target.value)} aria-label="Tool" data-testid="work-filter-tool">
              <option value="">Every tool</option>
              {WORK_TOOLS.map((t) => (
                <option key={t} value={t}>
                  {WORK_TOOL_LABEL[t]}
                </option>
              ))}
              <option value="none">No tool</option>
            </select>
            <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Pinned to" data-testid="work-filter-kind">
              <option value="">Pinned to anything</option>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {kindLabel(k)}
                </option>
              ))}
            </select>
            <label className="check small">
              <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} data-testid="work-group" /> Group by what it is pinned to
            </label>
          </div>

          <div className="work-body">
            {loadError && <p className="error-text">Could not load the linked work: {loadError}</p>}
            {data && shown.length === 0 && (
              <div className="work-empty" data-testid="work-empty">
                <h2>{rows.length ? "Nothing matches" : "No linked work yet"}</h2>
                <p className="muted">
                  {rows.length
                    ? "Change the filters to see more."
                    : "Link the issues, pull requests, security findings and tickets that concern the architecture: right-click a box, a line or empty space and choose Link work…, or add one here. dp reads their status from GitHub, GitLab, SonarQube and Jira."}
                </p>
                {canEdit && !rows.length && (
                  <button className="primary" onClick={() => setAdding({ type: "project" })}>
                    Add the first item
                  </button>
                )}
              </div>
            )}
            {shown.length > 0 && (
              <div className="table-wrap">
                <table className="home-table work-table" data-testid="work-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Tool</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Severity</th>
                      {!grouped && <th>Pinned to</th>}
                      <th>Remote status</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(grouped ? groups : [{ target: null, label: "", kind: "", rows: shown }]).map((g) => (
                      <Fragment key={g.target ? targetKey(g.target) : "all"}>
                        {g.target && (
                          <tr className="work-group" data-testid="work-group-row">
                            <th colSpan={columns}>
                              <PinButton target={g.target} label={g.label} kind={g.kind} onReveal={onReveal} /> <span className="muted small">{plural(g.rows.length, "item")}</span>
                            </th>
                          </tr>
                        )}
                        {g.rows.map((r) => (
                          <tr key={`${targetKey(r.target)}#${r.index}`} className={isOpenWork(r.item) ? "" : "work-done"} data-testid="work-row">
                            <td className="work-title">
                              {r.item.url ? (
                                <a href={r.item.url} target="_blank" rel="noopener noreferrer" title={r.item.url}>
                                  {r.item.title || r.item.url}
                                </a>
                              ) : (
                                r.item.title
                              )}
                            </td>
                            <td>{r.tool ? <span className="work-tool">{WORK_TOOL_LABEL[r.tool]}</span> : <span className="muted">—</span>}</td>
                            <td className="small">{types.get(r.item.type) ?? r.item.type}</td>
                            <td>
                              {canEdit ? (
                                <select
                                  className={`small status-${r.item.status}`}
                                  value={r.item.status}
                                  onChange={(e) => patch(r, { status: e.target.value })}
                                  aria-label={`Status of ${r.item.title}`}
                                  data-testid="work-status"
                                >
                                  {state.enums.workStatuses.map((s) => (
                                    <option key={s} value={s}>
                                      {statusLabel(s)}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                statusLabel(r.item.status)
                              )}
                            </td>
                            <td>{r.item.severity ? <span className={`work-sev sev-${r.item.severity}`}>{r.item.severity}</span> : <span className="muted">—</span>}</td>
                            {!grouped && (
                              <td>
                                <PinButton target={r.target} label={r.label} kind={r.targetKind} onReveal={onReveal} />
                              </td>
                            )}
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
                            <td className="small work-note">{r.item.note}</td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** What an item is pinned to: a button that shows it (a project has nothing to show). */
function PinButton({ target, label, kind, onReveal }: { target: WorkTarget; label: string; kind: string; onReveal(t: WorkTarget): void }) {
  const inner = (
    <>
      <span className="work-kind">{kindLabel(kind)}</span> {label}
    </>
  );
  if (target.type === "project") return <span data-testid="work-pin">{inner}</span>;
  return (
    <button className="link work-pin" onClick={() => onReveal(target)} title="Show it on its diagram" data-testid="work-pin">
      {inner}
    </button>
  );
}

/** Every place an item can be pinned to, as options: the project, elements, relationships, diagrams and flows. */
function targetOptions(state: AppState): { value: string; label: string }[] {
  const names = new Map(state.elements.map((e) => [e.id, e.name]));
  const out = [{ value: "project", label: "Project" }];
  for (const e of state.elements) out.push({ value: `element:${e.id}`, label: `${e.name} (${kindLabel(e.kind)})` });
  for (const r of state.relationships) {
    out.push({ value: `relationship:${r.id}`, label: `${names.get(r.sourceId) ?? r.sourceId} → ${names.get(r.destinationId) ?? r.destinationId}${r.description ? `: ${r.description}` : ""}` });
  }
  const seen = new Set<string>();
  for (const d of state.diagrams) {
    if (d.level === "connector" || d.level === "code" || seen.has(d.key)) continue;
    seen.add(d.key);
    out.push({ value: `diagram:${d.key}`, label: `Diagram: ${d.title}` });
  }
  for (const f of state.flows) if (!seen.has(f.key)) out.push({ value: `diagram:${f.key}`, label: `Flow: ${f.title}` });
  return out;
}

const parseTarget = (v: string): WorkTarget => {
  if (v === "project") return { type: "project" };
  const i = v.indexOf(":");
  return { type: v.slice(0, i) as "element" | "relationship" | "diagram", id: v.slice(i + 1) };
};

function AddForm({ state, initial, onCancel, onDone, mutate }: { state: AppState; initial: WorkTarget; onCancel(): void; onDone(): void; mutate: Props["mutate"] }) {
  const options = useMemo(() => targetOptions(state), [state]);
  const [to, setTo] = useState(targetKey(initial));
  const [f, setF] = useState({ title: "", url: "", type: "issue", severity: "", status: "open", note: "" });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const [busy, setBusy] = useState(false);
  // A new request for another target while the form is open.
  useEffect(() => setTo(targetKey(initial)), [initial]);
  const valid = !!(f.title.trim() || f.url.trim());
  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const item: Partial<WorkItem> = { type: f.type, title: f.title.trim(), status: f.status };
      if (f.url.trim()) item.url = f.url.trim();
      if (f.severity) item.severity = f.severity;
      if (f.note.trim()) item.note = f.note.trim();
      if (await mutate(() => api.pushWork({ items: [{ to: parseTarget(to), item }] }))) onDone();
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="home-box work-add"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      data-testid="work-add-form"
    >
      <div className="dec-grid">
        <label className="field">
          <span>Title</span>
          <input autoFocus value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="CVE-2026-1234 in the TLS library" data-testid="work-add-title" />
        </label>
        <label className="field">
          <span>Link</span>
          <input value={f.url} onChange={(e) => set("url", e.target.value)} placeholder="https:// issue, pull request, finding or ticket" data-testid="work-add-url" />
        </label>
        <label className="field">
          <span>Pinned to</span>
          <select value={to} onChange={(e) => setTo(e.target.value)} data-testid="work-add-target">
            {!options.some((o) => o.value === to) && <option value={to}>{to}</option>}
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="dec-grid">
        <label className="field">
          <span>Type</span>
          <select value={f.type} onChange={(e) => set("type", e.target.value)} data-testid="work-add-type">
            {state.enums.workTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Severity</span>
          <select value={f.severity} onChange={(e) => set("severity", e.target.value)} data-testid="work-add-severity">
            <option value="">None</option>
            {state.enums.severities.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select value={f.status} onChange={(e) => set("status", e.target.value)} data-testid="work-add-status">
            {state.enums.workStatuses.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Note</span>
        <input value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="Why it matters here (optional)" data-testid="work-add-note" />
      </label>
      <div className="row end">
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={!valid || busy} aria-busy={busy} data-testid="work-add-save">
          Add
        </button>
      </div>
    </form>
  );
}
