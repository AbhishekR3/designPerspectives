/**
 * Shared catalog and data (DEC-054): which projects use each shared element, which copies drifted
 * from the catalog, and who reads and writes each table, topic or bucket, across projects. In a
 * single project: its own data and who reads and writes it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Icon } from "../icons";
import { errorMessage, notify } from "../notify";
import { KIND_LABEL, type AssetUse, type HubInfo, type SharedUsage } from "../types";
import { projectLink } from "../useNavigation";

type Filter = "all" | "several" | "writers" | "sensitive";

export function CatalogPage({ hub }: { hub: HubInfo }) {
  const [u, setU] = useState<SharedUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const focus = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("a");

  const load = useCallback(() => {
    api.catalogUsage().then(
      (x) => (setU(x), setError(null)),
      (e) => setError(errorMessage(e)),
    );
  }, []);
  useEffect(() => {
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);
  useEffect(() => {
    if (u && focus) document.querySelector(`[data-asset="${CSS.escape(focus)}"]`)?.scrollIntoView({ block: "center" });
  }, [u, focus]);

  const isHub = hub.mode === "hub";
  const name = useMemo(() => new Map(hub.projects.map((p) => [p.id, p.name])), [hub]);
  const pr = (id: string) => (isHub ? id : null);
  const who = (a: AssetUse["access"][number]) => (
    <a key={`${a.project}/${a.relationshipId}`} href={projectLink(pr(a.project), { reveal: a.elementId })} className="who">
      {isHub && <span className="muted">{name.get(a.project) ?? a.project} · </span>}
      {a.elementName}
    </a>
  );

  if (error) return <p className="page-pad error-text">Could not load: {error}</p>;
  if (!u) return <p className="page-pad muted">Loading…</p>;
  const assets = u.assets.filter((a) =>
    filter === "several" ? a.flags.includes("used-by-several") : filter === "writers" ? a.flags.includes("several-writers") : filter === "sensitive" ? a.sensitive : true,
  );
  const projects = hub.projects.filter((p) => !p.catalog);

  const sync = async (project: string, elementId: string) => {
    try {
      await api.syncCatalog(elementId, project);
      notify.success("Updated from the catalog.");
      load();
    } catch (e) {
      notify.error(errorMessage(e));
    }
  };
  const addTo = async (project: string, catalogId: string) => {
    try {
      const { id } = await api.fromCatalog(catalogId, null, project);
      notify.success(`Added to ${name.get(project) ?? project}.`);
      window.location.hash = projectLink(project, { reveal: id });
    } catch (e) {
      notify.error(errorMessage(e));
    }
  };

  return (
    <div className="home" data-testid="catalog-page">
      <header className="home-head">
        <div>
          <h1>{isHub ? "Shared catalog" : "Data"}</h1>
          <p className="muted">
            {isHub
              ? "Elements several projects use, the copies each project keeps, and who reads and writes each table, topic or bucket."
              : "The data each element holds and which relationships read or write it. In a hub, the same view spans every project."}
          </p>
        </div>
        <span className="grow" />
        {isHub && hub.catalog && (
          <a className="button-link" href={projectLink(hub.catalog)} data-testid="catalog-edit">
            <Icon name="edit" size={14} /> Edit the catalog
          </a>
        )}
      </header>

      {(u.drift.length > 0 || u.missing.length > 0) && (
        <section className="home-box warn" data-testid="catalog-drift">
          <h2>Copies that differ from the catalog</h2>
          <ul className="attn">
            {u.drift.map((d) => (
              <li key={`${d.project}/${d.elementId}`} className="attn-item sev-warn">
                <span>
                  <a href={projectLink(pr(d.project), { reveal: d.elementId })}>
                    {isHub && `${name.get(d.project) ?? d.project} · `}
                    {d.name}
                  </a>{" "}
                  <span className="muted">differs in {d.fields.join(", ")}</span>
                </span>
                <button className="small" onClick={() => void sync(d.project, d.elementId)} data-testid={`sync-${d.project}-${d.elementId}`}>
                  Update from catalog
                </button>
              </li>
            ))}
            {u.missing.map((m) => (
              <li key={`${m.project}/${m.elementId}`} className="attn-item sev-error">
                <a href={projectLink(pr(m.project), { reveal: m.elementId })}>
                  {isHub && `${name.get(m.project) ?? m.project} · `}
                  {m.name}
                </a>{" "}
                <span className="muted">is a copy of "{m.catalogId}", which is no longer in the catalog</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isHub && (
        <section>
          <h2 className="home-h2">Shared elements</h2>
          {u.elements.length === 0 ? (
            <p className="muted">The catalog is empty. Open it and add the systems, databases and people several projects share.</p>
          ) : (
            <div className="table-wrap">
              <table className="home-table" data-testid="catalog-elements">
                <thead>
                  <tr>
                    <th>Element</th>
                    <th>Used by</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {u.elements.map((e) => {
                    const free = projects.filter((p) => !e.usedBy.some((x) => x.project === p.id));
                    return (
                      <tr key={e.catalogId} data-testid={`shared-${e.catalogId}`}>
                        <td>
                          <strong>{e.name}</strong>
                          <div className="muted small">
                            {KIND_LABEL[e.kind]}
                            {e.technology && ` · ${e.technology}`}
                            {e.data > 0 && ` · ${e.data} shared data`}
                          </div>
                        </td>
                        <td>
                          {e.usedBy.length === 0 ? (
                            <span className="muted">No project yet</span>
                          ) : (
                            e.usedBy.map((x) => (
                              <a
                                key={x.project}
                                className={`chip link-chip${x.drift.length ? " drift" : ""}`}
                                href={projectLink(pr(x.project), { reveal: x.elementId })}
                                title={x.drift.length ? `Differs: ${x.drift.join(", ")}` : undefined}
                              >
                                {name.get(x.project) ?? x.project}
                                {x.drift.length > 0 && " ⚠"}
                              </a>
                            ))
                          )}
                        </td>
                        <td>
                          {free.length > 0 && hub.canAdmin && (
                            <select
                              value=""
                              onChange={(ev) => ev.target.value && void addTo(ev.target.value, e.catalogId)}
                              aria-label={`Add ${e.name} to a project`}
                              data-testid={`add-to-${e.catalogId}`}
                            >
                              <option value="">Add to…</option>
                              {free.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section>
        <div className="home-toolbar">
          <h2 className="home-h2">Data</h2>
          <span className="grow" />
          <div className="dec-chips" role="group" aria-label="Show">
            {(
              [
                ["all", `All ${u.assets.length}`],
                ["several", `Used by several ${u.assets.filter((a) => a.flags.includes("used-by-several")).length}`],
                ["writers", `Several writers ${u.assets.filter((a) => a.flags.includes("several-writers")).length}`],
                ["sensitive", `Sensitive ${u.assets.filter((a) => a.sensitive).length}`],
              ] as const
            ).map(([f, label]) => (
              <button key={f} className={`tiny${filter === f ? " on" : ""}`} onClick={() => setFilter(f)} data-testid={`data-filter-${f}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {u.assets.length === 0 ? (
          <p className="muted">
            No data listed yet. Select a database, broker or store and add its tables or topics under <strong>Data</strong> in its panel; then say on each line which ones it reads or writes.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="home-table" data-testid="catalog-assets">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Held by</th>
                  <th>Read by</th>
                  <th>Written by</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => (
                  <tr key={a.key} data-asset={a.key} className={a.key === focus ? "focus" : ""} data-testid={`asset-${a.name}`}>
                    <td>
                      <strong>{a.name}</strong> <span className="muted small">{a.kind}</span>
                      {a.sensitive && <span className="pill-badge err">sensitive</span>}
                      <div>
                        {a.flags.includes("several-writers") && <span className="pill-badge warn">written by {a.writers} projects</span>}
                        {a.flags.includes("used-by-several") && !a.flags.includes("several-writers") && <span className="pill-badge shared">used by {a.projects} projects</span>}
                      </div>
                      {a.description && <div className="muted small">{a.description}</div>}
                    </td>
                    <td>
                      {a.holder.name}
                      <div className="muted small">
                        {a.shared ? "shared" : isHub ? `private to ${name.get(a.holder.project ?? "") ?? a.holder.project}` : "own"}
                        {a.owner && ` · owner ${name.get(a.owner) ?? a.owner}`}
                      </div>
                    </td>
                    <td>{a.access.filter((x) => x.mode === "read").map(who)}</td>
                    <td>{a.access.filter((x) => x.mode === "write").map(who)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {u.unknown.length > 0 && (
          <p className="muted small">
            <Icon name="warning" size={12} /> {u.unknown.length} relationship{u.unknown.length === 1 ? " uses" : "s use"} data the element at the other end does not list:{" "}
            {u.unknown.map((x) => `"${x.asset}" on ${x.holder}`).join(", ")}.
          </p>
        )}
      </section>
    </div>
  );
}
