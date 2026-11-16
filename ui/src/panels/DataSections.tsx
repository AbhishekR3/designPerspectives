/**
 * The shared catalog and data sections of the panels (DEC-054):
 * - CatalogSection: an element's link to a shared catalog element (link, update from the catalog, unlink);
 * - DataSection: the data an element holds (its own, plus the catalog's for a linked copy);
 * - DataAccessSection: which of that data a relationship reads or writes.
 */

import { useState } from "react";
import { api } from "../api";
import { Section } from "../fields";
import { Icon } from "../icons";
import { DATA_KINDS, type AppState, type CatalogEntry, type DataAccess, type DataAsset, type DataKind, type ElementSummary, type Relationship } from "../types";
import type { Common } from "./common";

/** The element's data: the catalog element's (shared, read-only here) and its own. */
export function assetsOf(el: ElementSummary | undefined, catalog: CatalogEntry[] | null): { shared: DataAsset[]; own: DataAsset[] } {
  if (!el) return { shared: [], own: [] };
  const entry = el.catalogId && catalog ? catalog.find((c) => c.id === el.catalogId) : undefined;
  return { shared: entry?.data ?? [], own: el.data };
}

/** Fields of a linked copy that differ from its catalog element. */
function driftOf(el: ElementSummary, e: CatalogEntry): string[] {
  const out: string[] = [];
  if (el.name !== e.name) out.push("name");
  if (el.description !== e.description) out.push("description");
  if ((el.kind === "container" || el.kind === "component") && el.technologies.join(", ") !== e.technology) out.push("technology");
  return out;
}

export function CatalogSection({ element, catalog, mutate, readOnly }: { element: ElementSummary; catalog: CatalogEntry[]; mutate: Common["mutate"]; readOnly: boolean }) {
  const entry = element.catalogId ? catalog.find((c) => c.id === element.catalogId) : undefined;
  const candidates = catalog.filter((c) => c.kind === element.kind);
  if (!element.catalogId && !candidates.length) return null;
  const drift = entry ? driftOf(element, entry) : [];
  return (
    <Section title="Shared catalog" count={element.catalogId ? 1 : 0} testId="sec-catalog">
      {element.catalogId ? (
        <>
          <p className="panel-note" data-testid="catalog-linked">
            <Icon name="star" size={12} /> A copy of the shared catalog's <strong>{entry?.name ?? element.catalogId}</strong>
            {entry?.parentName ? ` (in ${entry.parentName})` : ""}. Its name, description and technology are kept in the catalog and copied here when the catalog changes.
          </p>
          {!entry && <p className="error-text small">That element is no longer in the catalog.</p>}
          {drift.length > 0 && (
            <p className="warn-note small" data-testid="catalog-drift-note">
              <Icon name="warning" size={12} /> Differs from the catalog: {drift.join(", ")}. {drift.includes("name") ? "Another element here has the catalog's name: rename it, then update." : ""}
            </p>
          )}
          {!readOnly && (
            <div className="row wrap">
              {entry && (
                <button className="small" onClick={() => void mutate(() => api.syncCatalog(element.id))} disabled={!drift.length} data-testid="catalog-sync">
                  Update from catalog
                </button>
              )}
              <button className="small ghost" onClick={() => void mutate(() => api.unlinkCatalog(element.id))} title="Make it this project's own element" data-testid="catalog-unlink">
                Unlink
              </button>
            </div>
          )}
        </>
      ) : (
        <label className="field">
          <span>This is the same as a shared element</span>
          <select value="" disabled={readOnly} onChange={(e) => e.target.value && void mutate(() => api.linkCatalog(element.id, e.target.value))} data-testid="catalog-link">
            <option value="">Link to a catalog element…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.parentName ? ` (in ${c.parentName})` : ""}
              </option>
            ))}
          </select>
          <span className="muted small">Its name, description and technology then come from the catalog, and its shared data shows here.</span>
        </label>
      )}
    </Section>
  );
}

const blank = (): DataAsset => ({ name: "", kind: "table" });

export function DataSection({ element, catalog, mutate }: { element: ElementSummary; catalog: CatalogEntry[] | null; mutate: Common["mutate"] }) {
  const { shared, own } = assetsOf(element, catalog);
  const [rows, setRows] = useState<DataAsset[]>(own);
  const [dirty, setDirty] = useState(false);
  const save = (next: DataAsset[]) => {
    setRows(next);
    setDirty(false);
    void mutate(() => api.updateElement(element.id, { data: next.filter((r) => r.name.trim()) }));
  };
  const set = (i: number, patch: Partial<DataAsset>) => {
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  return (
    <Section title="Data" count={shared.length + own.length} testId="sec-data">
      {shared.length > 0 && (
        <>
          <span className="muted small">Shared (from the catalog)</span>
          <ul className="data-list">
            {shared.map((a) => (
              <li key={a.name}>
                <strong>{a.name}</strong> <span className="muted small">{a.kind}</span>
                {a.owner && <span className="muted small"> · owner {a.owner}</span>}
                {a.sensitive && <span className="pill-badge err">sensitive</span>}
              </li>
            ))}
          </ul>
          <span className="muted small">{element.catalogId ? "This project's own" : "Own"}</span>
        </>
      )}
      {rows.map((r, i) => (
        <div key={i} className="data-row" data-testid={`data-row-${i}`}>
          <input
            value={r.name}
            placeholder="Name, e.g. customers"
            onChange={(e) => set(i, { name: e.target.value })}
            onBlur={() => dirty && save(rows)}
            aria-label="Data name"
            data-testid={`data-name-${i}`}
          />
          <select value={r.kind} onChange={(e) => save(rows.map((x, j) => (j === i ? { ...x, kind: e.target.value as DataKind } : x)))} aria-label="Kind">
            {DATA_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <input value={r.owner ?? ""} placeholder="Owner" onChange={(e) => set(i, { owner: e.target.value })} onBlur={() => dirty && save(rows)} aria-label="Owner" />
          <label className="data-sens" title="Holds sensitive or personal data">
            <input type="checkbox" checked={!!r.sensitive} onChange={(e) => save(rows.map((x, j) => (j === i ? { ...x, sensitive: e.target.checked || undefined } : x)))} /> sensitive
          </label>
          <button className="ghost icon edit-only" aria-label={`Remove ${r.name || "this row"}`} onClick={() => save(rows.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      <button className="add edit-only" onClick={() => setRows([...rows, blank()])} data-testid="data-add">
        + Add a table, topic or bucket
      </button>
    </Section>
  );
}

export function DataAccessSection({
  rel,
  state,
  catalog,
  mutate,
  title = "Data access",
}: {
  rel: Relationship;
  state: AppState;
  catalog: CatalogEntry[] | null;
  mutate: Common["mutate"];
  title?: string;
}) {
  const el = (id: string) => state.elements.find((e) => e.id === id);
  // The data at the destination first (a service writing to a database), then at the source.
  const ends = [rel.destinationId, rel.sourceId].map((id) => {
    const a = assetsOf(el(id), catalog);
    return { id, name: el(id)?.name ?? id, assets: [...a.shared, ...a.own] };
  });
  const offered = ends.filter((e) => e.assets.length);
  const modeOf = (asset: string) => rel.dataAccess.find((x) => x.asset === asset)?.mode ?? "";
  const unknown = rel.dataAccess.filter((x) => !ends.some((e) => e.assets.some((a) => a.name === x.asset)));
  if (!offered.length && !rel.dataAccess.length) return null;
  const setMode = (asset: string, mode: string) => {
    const next: DataAccess[] = rel.dataAccess.filter((x) => x.asset !== asset);
    if (mode === "read" || mode === "write") next.push({ asset, mode });
    void mutate(() => api.updateRelationship(rel.id, { dataAccess: next }));
  };
  return (
    <Section title={title} count={rel.dataAccess.length} testId="sec-data-access">
      {offered.map((e) => (
        <div key={e.id}>
          <span className="muted small">Data of {e.name}</span>
          {e.assets.map((a) => (
            <label key={a.name} className="data-access-row">
              <span>
                {a.name} <span className="muted small">{a.kind}</span>
              </span>
              <select value={modeOf(a.name)} onChange={(ev) => setMode(a.name, ev.target.value)} aria-label={`Access to ${a.name}`} data-testid={`access-${a.name}`}>
                <option value="">—</option>
                <option value="read">reads</option>
                <option value="write">writes</option>
              </select>
            </label>
          ))}
        </div>
      ))}
      {unknown.map((x) => (
        <p key={x.asset} className="warn-note small">
          <Icon name="warning" size={12} /> {x.mode === "write" ? "Writes" : "Reads"} "{x.asset}", which neither end lists.{" "}
          <button className="link edit-only" onClick={() => setMode(x.asset, "")}>
            Remove
          </button>
        </p>
      ))}
    </Section>
  );
}
