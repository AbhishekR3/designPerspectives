/**
 * The shared catalog and data use across projects (HUB-06). A hub's catalog is a normal project
 * whose elements are shared definitions (a customer database, an identity service). A project keeps
 * a linked copy (`dp.catalog`) of each one it uses, so its own workspace stays a complete Structurizr
 * file. Data assets (`dp.data`) on a catalog element are shared; a project's copy can add its own.
 * Relationships say which assets they read or write (`dp.data.access`). This module answers "who
 * uses what": linked copies that drifted, tables used or written by several projects, unknown data.
 */

import { buildIndex, CATALOG_KEY, catalogSource, DATA_KEY, ACCESS_KEY, getJson, getProps, ModelError, splitTech, syncFromCatalog, type Index } from "./modelEdits.js";
import type { Workspace } from "./workspace.js";
import type { AssetUse, CatalogEntry, DataAccess, DataAsset, SharedUsage } from "../shared/types.js";

export interface UsageProject {
  id: string;
  ws: Workspace;
}

const index = (ws: Workspace): Index | null => {
  try {
    return buildIndex(ws);
  } catch {
    return null; // duplicate IDs: reported by the project's own checks
  }
};

/** The catalog's elements, for pickers. */
export function catalogEntries(catalog: Workspace): CatalogEntry[] {
  const idx = index(catalog);
  if (!idx) return [];
  return [...idx.elements.values()].map((el) => {
    const parentId = idx.parentOf(el.id);
    return {
      id: el.id,
      name: el.name,
      kind: idx.kindOf(el.id),
      description: el.description || "",
      technology: splitTech(el.technology).join(", "),
      parentId,
      parentName: parentId ? (idx.elements.get(parentId)?.name ?? null) : null,
      data: getJson<DataAsset>(el, DATA_KEY),
    };
  });
}

/** Fields of a linked copy that differ from its catalog element. */
export function driftOf(copy: Index, copyId: string, catalog: Index, catalogId: string): string[] {
  const a = copy.el(copyId);
  const b = catalog.el(catalogId);
  const out: string[] = [];
  if (a.name !== b.name) out.push("name");
  if ((a.description || "") !== (b.description || "")) out.push("description");
  if (splitTech(a.technology).join(",") !== splitTech(b.technology).join(",")) out.push("technology");
  return out;
}

export function sharedUsage(projects: UsageProject[], catalog: Workspace | null): SharedUsage {
  const cat = catalog ? index(catalog) : null;
  const assets = new Map<string, AssetUse>();
  const elements = new Map<string, SharedUsage["elements"][number]>();
  const drift: SharedUsage["drift"] = [];
  const missing: SharedUsage["missing"] = [];
  const unknown: SharedUsage["unknown"] = [];

  const addAsset = (holderKey: string, a: DataAsset, holder: AssetUse["holder"], shared: boolean) => {
    const key = `${holderKey}/${a.name}`;
    if (assets.has(key)) return;
    assets.set(key, {
      key,
      name: a.name,
      kind: a.kind,
      description: a.description ?? "",
      owner: a.owner ?? "",
      sensitive: !!a.sensitive,
      shared,
      holder,
      access: [],
      projects: 0,
      writers: 0,
      flags: [],
    });
  };

  if (cat) {
    for (const el of cat.elements.values()) {
      elements.set(el.id, { catalogId: el.id, name: el.name, kind: cat.kindOf(el.id), technology: splitTech(el.technology).join(", "), data: getJson<DataAsset>(el, DATA_KEY).length, usedBy: [] });
      for (const a of getJson<DataAsset>(el, DATA_KEY)) addAsset(`cat:${el.id}`, a, { name: el.name, catalogId: el.id, project: null, elementId: el.id }, true);
    }
  }

  // Where each project's element keeps its data: the catalog element for a linked copy, else itself.
  const holderKey = (p: string, idx: Index, id: string) => {
    const linked = getProps(idx.el(id))[CATALOG_KEY];
    return linked && cat?.elements.has(linked) ? `cat:${linked}` : `${p}:${id}`;
  };
  const indexes = new Map<string, Index>();
  for (const p of projects) {
    const idx = index(p.ws);
    if (!idx) continue;
    indexes.set(p.id, idx);
    for (const el of idx.elements.values()) {
      const linked = getProps(el)[CATALOG_KEY];
      if (linked) {
        if (!cat || !cat.elements.has(linked)) missing.push({ project: p.id, elementId: el.id, name: el.name, catalogId: linked });
        else {
          const d = driftOf(idx, el.id, cat, linked);
          if (d.length) drift.push({ project: p.id, elementId: el.id, name: el.name, catalogId: linked, fields: d });
          elements.get(linked)!.usedBy.push({ project: p.id, elementId: el.id, drift: d });
        }
      }
      const hk = holderKey(p.id, idx, el.id);
      for (const a of getJson<DataAsset>(el, DATA_KEY)) {
        addAsset(hk, { ...a, owner: a.owner || p.id }, { name: el.name, catalogId: hk.startsWith("cat:") ? linked! : null, project: p.id, elementId: el.id }, false);
      }
    }
  }

  for (const p of projects) {
    const idx = indexes.get(p.id);
    if (!idx) continue;
    for (const r of idx.relationships.values()) {
      for (const a of getJson<DataAccess>(r, ACCESS_KEY)) {
        // The data belongs to the destination (a service writes to a database), or else to the source
        // (a pipeline reads from a topic that is the source of the relationship).
        const ends: [string, string][] = [
          [r.destinationId, r.sourceId],
          [r.sourceId, r.destinationId],
        ];
        const hit = ends.map(([holder, other]) => ({ asset: idx.elements.has(holder) ? assets.get(`${holderKey(p.id, idx, holder)}/${a.asset}`) : undefined, other })).find((x) => x.asset);
        if (!hit?.asset) {
          unknown.push({ project: p.id, relationshipId: r.id, asset: a.asset, holder: idx.elements.get(r.destinationId)?.name ?? r.destinationId });
          continue;
        }
        hit.asset.access.push({ project: p.id, elementId: hit.other, elementName: idx.elements.get(hit.other)?.name ?? hit.other, mode: a.mode, relationshipId: r.id });
      }
    }
  }

  for (const a of assets.values()) {
    a.projects = new Set(a.access.map((x) => x.project)).size;
    a.writers = new Set(a.access.filter((x) => x.mode === "write").map((x) => x.project)).size;
    if (a.projects > 1) a.flags.push("used-by-several");
    if (a.writers > 1) a.flags.push("several-writers");
  }
  return { mode: cat ? "hub" : "single", elements: [...elements.values()], assets: [...assets.values()], drift, missing, unknown };
}

/** One linked copy brought up to date with its catalog element. */
export interface CopyUpdate {
  elementId: string;
  catalogId: string;
  name: string;
  fields: string[];
}

/**
 * Bring every linked copy in `ws` that differs from its catalog element up to date (HUB-07), in place.
 * A copy that cannot take the catalog's name (another element here has it) is left as it is, and
 * stays listed as drift. Returns what changed.
 */
export function syncCopies(ws: Workspace, catalog: Workspace): CopyUpdate[] {
  const cat = index(catalog);
  const idx = index(ws);
  if (!cat || !idx) return [];
  const out: CopyUpdate[] = [];
  for (const el of [...idx.elements.values()]) {
    const linked = getProps(el)[CATALOG_KEY];
    if (!linked || !cat.elements.has(linked)) continue;
    const fields = driftOf(buildIndex(ws), el.id, cat, linked);
    if (!fields.length) continue;
    try {
      syncFromCatalog(ws, el.id, catalogSource(catalog, linked));
      out.push({ elementId: el.id, catalogId: linked, name: cat.el(linked).name, fields });
    } catch (e) {
      if (!(e instanceof ModelError)) throw e;
    }
  }
  return out;
}
