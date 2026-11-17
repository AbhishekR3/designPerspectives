/**
 * History (DEC-058): the git commits that changed the models, newest first, each with what it changed
 * in each project, and what is not committed yet. Read-only: commit with your usual git tools.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { errorMessage } from "../common/notify";
import { CHANGE_COLORS } from "../colourOverlays";
import type { ChangeSummary, HistoryList, HubInfo } from "../types";
import { projectLink } from "../hooks/useNavigation";
import { ago } from "./HomePage";

function Summary({ s }: { s: ChangeSummary }) {
  const parts: [number, string, string][] = [
    [s.added, "added", `+${s.added}`],
    [s.changed, "changed", `~${s.changed}`],
    [s.removed, "removed", `−${s.removed}`],
  ];
  const shown = parts.filter(([n]) => n);
  return (
    <span className="hist-sum">
      {shown.map(([, kind, text]) => (
        <span key={kind} style={{ color: CHANGE_COLORS[kind as keyof typeof CHANGE_COLORS] }}>
          {text}
        </span>
      ))}
      {!shown.length && <span className="muted">{s.layout ? "layout only" : "drafts or files only"}</span>}
    </span>
  );
}

export function HistoryPage({ hub }: { hub: HubInfo }) {
  const [only, setOnly] = useState<string | null>(null);
  const [data, setData] = useState<HistoryList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const isHub = hub.mode === "hub";
  const name = useMemo(() => new Map(hub.projects.map((p) => [p.id, p.name])), [hub]);
  const pr = (id: string) => (isHub ? id : null);

  const load = useCallback(() => {
    setData(null);
    api.history(isHub ? only : null).then(
      (h) => (setData(h), setError(null)),
      (e) => setError(errorMessage(e)),
    );
  }, [only, isHub]);
  useEffect(() => load(), [load]);

  return (
    <div className="home" data-testid="history-page">
      <header className="home-head">
        <div>
          <h1>History</h1>
          <p className="muted">Commits that changed the model{isHub ? "s" : ""}, and what each one changed. Commit with your usual git tools; this page only reads git.</p>
        </div>
      </header>
      {isHub && (
        <div className="dec-chips" role="group" aria-label="Project">
          <button className={`tiny${only === null ? " on" : ""}`} onClick={() => setOnly(null)}>
            Every project
          </button>
          {hub.projects.map((p) => (
            <button key={p.id} className={`tiny${only === p.id ? " on" : ""}`} onClick={() => setOnly(p.id)} data-testid={`history-filter-${p.id}`}>
              {p.name}
            </button>
          ))}
        </div>
      )}
      {error && <p className="error-text">Could not load the history: {error}</p>}
      {!data && !error && <p className="muted">Reading git…</p>}
      {data && (
        <>
          {data.projects.some((p) => !p.git) && (
            <p className="warn-note">
              {data.projects
                .filter((p) => !p.git)
                .map((p) => name.get(p.project) ?? p.project)
                .join(", ")}{" "}
              {data.projects.filter((p) => !p.git).length === 1 ? "is" : "are"} not in a git repository: there is no history to show. Run <code>git init</code> and commit to start one.
            </p>
          )}
          {data.projects
            .filter((p) => p.uncommitted && p.uncommitted.added + p.uncommitted.changed + p.uncommitted.removed > 0)
            .map((p) => (
              <div key={p.project} className="home-box hist-pending" data-testid={`uncommitted-${p.project}`}>
                <span>
                  <strong>{isHub ? `${name.get(p.project) ?? p.project}: ` : ""}not committed yet</strong> <Summary s={p.uncommitted!} />
                </span>
                <a href={projectLink(pr(p.project), { compare: "ref:HEAD" })}>See the changes on the diagrams →</a>
              </div>
            ))}
          {data.commits.length === 0 && data.projects.some((p) => p.git) && <p className="muted">No commits have changed the model yet.</p>}
          <ol className="hist" data-testid="history-list">
            {data.commits.map((c) => (
              <li key={c.sha} className="hist-item" data-testid={`commit-${c.sha.slice(0, 7)}`}>
                <button className="hist-head" onClick={() => setOpen(open === c.sha ? null : c.sha)} aria-expanded={open === c.sha}>
                  <span className="hist-subject">{c.subject}</span>
                  <span className="muted small">
                    {c.author} · {ago(c.date)} · <code>{c.sha.slice(0, 7)}</code>
                  </span>
                  <span className="hist-projects">
                    {c.changes.map((ch) => (
                      <span key={ch.project} className="hist-proj">
                        {isHub && <span className="muted small">{name.get(ch.project) ?? ch.project} </span>}
                        <Summary s={ch.summary} />
                      </span>
                    ))}
                  </span>
                </button>
                {open === c.sha && (
                  <div className="hist-body">
                    {c.changes.map((ch) => (
                      <div key={ch.project}>
                        {isHub && <h3>{name.get(ch.project) ?? ch.project}</h3>}
                        {ch.items.length ? (
                          <ul>
                            {ch.items.map((it, i) => (
                              <li key={i}>
                                <span className="dot" style={{ background: CHANGE_COLORS[it.change] }} /> {it.name} <span className="muted small">{it.type}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="muted small">No change to the main model (drafts, layout or other files).</p>
                        )}
                        <a href={projectLink(pr(ch.project), { model: `ref:${c.sha}`, compare: ch.parent ? `ref:${ch.parent}` : undefined })} data-testid={`open-commit-${c.sha.slice(0, 7)}`}>
                          Open this version{ch.parent ? ", compared with the one before" : ""} →
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
