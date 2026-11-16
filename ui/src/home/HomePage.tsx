/**
 * The home page (DEC-053): every project as a card with a picture of its landscape, what needs a look,
 * what is being watched (revisit triggers and dates), the latest decisions, and the shared catalog.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { StatusBadge } from "../DecisionsPage";
import { Modal } from "../fields";
import { Icon } from "../icons";
import { errorMessage, notify } from "../notify";
import { HOME_VIEW_KEY, storage } from "../storage";
import { DECISION_KIND_INFO, type AttentionItem, type HomeSummary, type HubInfo, type ProjectCard, type Thumb } from "../types";
import { projectLink } from "../useNavigation";

/** "3 days ago" for an ISO date. */
export function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(s)) return "";
  const unit = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"} ago`;
  if (s < 90) return "just now";
  if (s < 3600) return unit(Math.round(s / 60), "minute");
  if (s < 86400) return unit(Math.round(s / 3600), "hour");
  if (s < 86400 * 45) return unit(Math.round(s / 86400), "day");
  if (s < 86400 * 400) return unit(Math.round(s / (86400 * 30)), "month");
  return unit(Math.round(s / (86400 * 365)), "year");
}

export function ThumbView({ thumb }: { thumb: Thumb | null }) {
  if (!thumb) return <div className="thumb empty">No diagram yet</div>;
  return (
    <svg className="thumb" viewBox={`0 0 ${thumb.w} ${thumb.h}`} role="img" aria-label="The project's landscape">
      {thumb.lines.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="thumb-line" />
      ))}
      {thumb.boxes.map((b, i) => (
        <rect
          key={i}
          x={b.x}
          y={b.y}
          width={Math.max(2, b.w)}
          height={Math.max(2, b.h)}
          rx={b.kind === "person" ? Math.min(b.w, b.h) / 2 : 2}
          className={`thumb-box k-${b.kind}${b.external ? " ext" : ""}`}
        />
      ))}
    </svg>
  );
}

/** Where an attention item leads. */
function hrefOf(hub: HubInfo, a: { project: string; target: AttentionItem["target"] }): string | null {
  const pr = hub.mode === "hub" ? a.project : null;
  const t = a.target;
  if (!t) return null;
  if (t.type === "diagram") return projectLink(pr, { key: t.id });
  if (t.type === "decision") return projectLink(pr, { page: `decisions/${t.id}` });
  if (t.type === "draft") return projectLink(pr, { model: `draft:${t.id}`, compare: "base" });
  if (t.type === "element") return projectLink(pr, { reveal: t.id });
  return `#/catalog?a=${encodeURIComponent(t.id)}`;
}

const SEV_ICON = { error: "warning", warn: "warning", info: "dots" } as const;

export function HomePage({ hub, onChanged }: { hub: HubInfo; onChanged(): Promise<void> }) {
  const [home, setHome] = useState<HomeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">(() => (storage.get(HOME_VIEW_KEY) === "list" ? "list" : "grid"));
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api.home().then(
      (h) => (setHome(h), setError(null)),
      (e) => setError(errorMessage(e)),
    );
  }, []);
  useEffect(() => {
    load();
    // Others change the models too: look again when the window gets the focus back.
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);

  const names = useMemo(() => new Map(hub.projects.map((p) => [p.id, p.name])), [hub]);
  const projectName = (id: string) => (hub.mode === "hub" ? (names.get(id) ?? id) : null);
  if (error) return <p className="page-pad error-text">Could not load the home page: {error}</p>;
  if (!home) return <p className="page-pad muted">Loading…</p>;

  const q = query.trim().toLowerCase();
  const cards = home.projects.filter((p) => !q || `${p.name} ${p.description} ${p.id}`.toLowerCase().includes(q));
  const setV = (v: "grid" | "list") => (storage.set(HOME_VIEW_KEY, v), setView(v));
  const problems = home.attention.filter((a) => a.severity !== "info").length;

  return (
    <div className="home" data-testid="home-page">
      <header className="home-head">
        <div>
          <h1>{home.name}</h1>
          <p className="muted">
            {home.mode === "hub" ? `${home.projects.filter((p) => !p.catalog).length} projects and a shared catalog` : "Overview of the model"}
            {problems > 0 ? ` · ${problems} thing${problems === 1 ? "" : "s"} need a look` : " · nothing needs a look"}
          </p>
        </div>
        <span className="grow" />
        {hub.mode === "hub" && hub.canAdmin && (
          <button className="primary" onClick={() => setCreating(true)} data-testid="project-new">
            <Icon name="plus" size={14} /> New project
          </button>
        )}
      </header>

      <div className="home-grid">
        <section className="home-projects" aria-label="Projects">
          <div className="home-toolbar">
            <h2>{home.mode === "hub" ? "Projects" : "Project"}</h2>
            <span className="grow" />
            {home.projects.length > 3 && <input type="search" placeholder="Find a project…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Find a project" />}
            <div className="seg" role="group" aria-label="View">
              <button className={`ghost icon${view === "grid" ? " on" : ""}`} onClick={() => setV("grid")} aria-pressed={view === "grid"} title="Cards" data-testid="view-grid">
                <Icon name="layout" size={14} />
              </button>
              <button className={`ghost icon${view === "list" ? " on" : ""}`} onClick={() => setV("list")} aria-pressed={view === "list"} title="List" data-testid="view-list">
                <Icon name="panel" size={14} />
              </button>
            </div>
          </div>
          {view === "grid" ? (
            <div className="p-cards">
              {cards.map((p) => (
                <ProjectTile key={p.id} p={p} hub={hub} role={hub.projects.find((x) => x.id === p.id)?.role ?? null} />
              ))}
            </div>
          ) : (
            <ProjectTable cards={cards} hub={hub} />
          )}

          {home.decisions.length > 0 && (
            <>
              <h2 className="home-h2">Latest decisions</h2>
              <table className="home-table" data-testid="home-decisions">
                <tbody>
                  {home.decisions.slice(0, 10).map((d) => (
                    <tr key={`${d.project}/${d.file}`}>
                      <td className="muted nowrap">{d.date}</td>
                      {hub.mode === "hub" && <td className="muted">{projectName(d.project)}</td>}
                      <td>
                        <a href={projectLink(hub.mode === "hub" ? d.project : null, { page: `decisions/${d.id}` })}>
                          <span className="dec-num">{d.id}</span> {d.title}
                        </a>
                      </td>
                      <td className="muted small nowrap">{DECISION_KIND_INFO[d.kind]?.label}</td>
                      <td>
                        <StatusBadge status={d.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>

        <aside className="home-side">
          <section className="home-box" data-testid="home-attention">
            <h2>Needs a look</h2>
            {home.attention.length === 0 ? (
              <p className="muted small">Nothing: no model problems, no drafts behind, no decisions due.</p>
            ) : (
              <ul className="attn">
                {home.attention.slice(0, 30).map((a, i) => {
                  const href = hrefOf(hub, a);
                  const body = (
                    <>
                      <Icon name={SEV_ICON[a.severity]} size={14} className={`sev-${a.severity}`} />
                      <span>
                        {projectName(a.project) && <span className="muted">{projectName(a.project)} · </span>}
                        {a.text}
                      </span>
                    </>
                  );
                  return (
                    <li key={i} className={`attn-item sev-${a.severity}`} data-kind={a.kind}>
                      {href ? <a href={href}>{body}</a> : <span>{body}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {home.shared && (
            <section className="home-box" data-testid="home-shared">
              <h2>Shared catalog</h2>
              <dl className="facts">
                <dt>Shared elements</dt>
                <dd>{home.shared.elements}</dd>
                <dt>Copies in projects</dt>
                <dd>{home.shared.linkedCopies}</dd>
                <dt>Tables and topics</dt>
                <dd>{home.shared.assets}</dd>
                <dt>Used by several projects</dt>
                <dd>{home.shared.sharedAssets}</dd>
                <dt>Written by several</dt>
                <dd className={home.shared.multiWriter ? "sev-warn" : ""}>{home.shared.multiWriter}</dd>
              </dl>
              <a href="#/catalog">Who uses what →</a>
            </section>
          )}

          {home.catalogUpdates.length > 0 && (
            <section className="home-box" data-testid="home-catalog-updates">
              <h2>Catalog changes copied</h2>
              <ul className="watch">
                {home.catalogUpdates.map((u, i) => (
                  <li key={i}>
                    <strong>{u.name}</strong> <span className="muted small">({u.fields.join(", ")})</span> →{" "}
                    {u.projects.map((p, j) => (
                      <span key={p.project}>
                        {j > 0 && ", "}
                        <a href={projectLink(p.project, { reveal: p.elementId })}>{projectName(p.project) ?? p.project}</a>
                      </span>
                    ))}
                    <span className="muted small"> · {ago(u.at)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {home.watch.length > 0 && (
            <section className="home-box" data-testid="home-watch">
              <h2>Watching</h2>
              <ul className="watch">
                {home.watch.slice(0, 20).map((w, i) => (
                  <li key={i}>
                    <a href={projectLink(hub.mode === "hub" ? w.project : null, { page: `decisions/${w.decision}` })}>
                      {w.date ? (
                        <>
                          <span className="date-chip">{w.date}</span> {w.text}: {w.title}
                        </>
                      ) : (
                        <>
                          <Icon name="eye" size={12} /> {w.text}
                        </>
                      )}
                    </a>
                    <span className="muted small">
                      {" "}
                      {projectName(w.project) && `${projectName(w.project)} · `}
                      {w.date ? "" : `${w.decision} ${w.title}`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
      {creating && (
        <NewProjectDialog
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            notify.success("Project created.");
            // The hub's project list first, so the new project is known when its page opens.
            void onChanged().then(() => (window.location.hash = projectLink(id)));
          }}
        />
      )}
    </div>
  );
}

function stats(p: ProjectCard): string {
  const c = p.counts;
  const parts = [
    [c.systems, "system"],
    [c.containers, "container"],
    [c.decisions, "decision"],
  ] as const;
  return parts
    .filter(([n]) => n)
    .map(([n, w]) => `${n} ${w}${n === 1 ? "" : "s"}`)
    .join(" · ");
}

function Badges({ p }: { p: ProjectCard }) {
  return (
    <span className="badges">
      {p.problems.errors > 0 && (
        <span className="pill-badge err">
          {p.problems.errors} problem{p.problems.errors === 1 ? "" : "s"}
        </span>
      )}
      {p.drafts.open > 0 && (
        <span className="pill-badge" title={p.drafts.behind ? `${p.drafts.behind} behind main` : undefined}>
          {p.drafts.open} draft{p.drafts.open === 1 ? "" : "s"}
        </span>
      )}
      {p.linked > 0 && <span className="pill-badge shared">{p.linked} shared</span>}
      {p.catalog && <span className="pill-badge shared">Catalog</span>}
    </span>
  );
}

function ProjectTile({ p, hub, role }: { p: ProjectCard; hub: HubInfo; role: string | null }) {
  const href = projectLink(hub.mode === "hub" ? p.id : null);
  return (
    <a className={`p-card${p.catalog ? " catalog" : ""}`} href={href} data-testid={`project-${p.id}`}>
      <ThumbView thumb={p.thumb} />
      <div className="p-card-body">
        <div className="p-card-title">
          <strong className="truncate">{p.name}</strong>
          <Badges p={p} />
          {role && hub.mode === "hub" && (
            <span className="pill-badge" title="Your role in this project" data-testid={`role-${p.id}`}>
              {role}
            </span>
          )}
        </div>
        {p.error ? <p className="error-text small">{p.error}</p> : <p className="muted small clamp2">{p.description || stats(p)}</p>}
        <p className="muted small p-card-foot">
          {stats(p)}
          {p.lastCommit && (
            <span title={p.lastCommit.subject}>
              {" "}
              · changed {ago(p.lastCommit.date)} by {p.lastCommit.author}
            </span>
          )}
        </p>
      </div>
    </a>
  );
}

function ProjectTable({ cards, hub }: { cards: ProjectCard[]; hub: HubInfo }) {
  return (
    <table className="home-table" data-testid="project-list">
      <thead>
        <tr>
          <th>Name</th>
          <th>Contents</th>
          <th>Last change</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {cards.map((p) => (
          <tr key={p.id}>
            <td>
              <a href={projectLink(hub.mode === "hub" ? p.id : null)}>{p.name}</a>
            </td>
            <td className="muted small">{p.error ?? stats(p)}</td>
            <td className="muted small">{p.lastCommit ? `${ago(p.lastCommit.date)} · ${p.lastCommit.author}` : "—"}</td>
            <td>
              <Badges p={p} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** A new project folder in the hub, from a blank model or the demo bank (like starting from a template). */
function NewProjectDialog({ onClose, onCreated }: { onClose(): void; onCreated(id: string): void }) {
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [idTouched, setIdTouched] = useState(false);
  const [template, setTemplate] = useState<"empty" | "demo">("empty");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const theId = idTouched ? id : slug(name);
  return (
    <Modal title="New project" onClose={onClose} testId="project-new-dialog">
      <form
        className="dec-new"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          api
            .addProject({ id: theId, name: name.trim(), template })
            .then(() => onCreated(theId))
            .catch((x) => setErr(errorMessage(x)))
            .finally(() => setBusy(false));
        }}
      >
        <label className="field">
          <span>Name</span>
          <input data-autofocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cards" data-testid="project-new-name" />
        </label>
        <label className="field">
          <span>Folder and ID</span>
          <input
            value={theId}
            onChange={(e) => {
              setIdTouched(true);
              setId(e.target.value);
            }}
            data-testid="project-new-id"
          />
        </label>
        <div className="field">
          <span>Start from</span>
          <div className="dec-kinds" role="radiogroup">
            {(
              [
                ["empty", "Blank model", "An empty landscape to build from scratch."],
                ["demo", "Demo bank", "The sample bank, to explore every feature."],
              ] as const
            ).map(([v, label, hint]) => (
              <label key={v} className={`dec-kind${template === v ? " on" : ""}`}>
                <input type="radio" name="tpl" checked={template === v} onChange={() => setTemplate(v)} data-testid={`project-new-${v}`} />
                <strong>{label}</strong>
                <span className="muted small">{hint}</span>
              </label>
            ))}
          </div>
        </div>
        {err && <p className="error-text">{err}</p>}
        <div className="row end">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy || !name.trim() || !theId} data-testid="project-new-create">
            Create
          </button>
        </div>
      </form>
    </Modal>
  );
}
