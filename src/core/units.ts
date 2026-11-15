/**
 * A model (workspace + sidecar) as a flat, ordered map of small **units**, one per object: an
 * element, a relationship, a view, a stored position, a tag group, a lens, a style, a layout entry.
 * Diffs and the three-way merge of drafts (`diff.ts`, `merge.ts`) compare units by key, so two
 * edits to different objects never collide.
 *
 *   ws:<key>                      workspace fields (name, description, unknown fields)
 *   model:<key>                   unknown model fields (deployment nodes, ...), kept whole
 *   el:<id>                       an element without its children and relationships
 *   rel:<id>                      a relationship (with the element that holds it)
 *   view:<key>                    a view; for diagram and flow views without the element list
 *   vel:<viewKey>:<elementId>     a stored position (or other per-view data) of one element
 *   vrel:<viewKey>:<relId>        per-view relationship data on a diagram view (rare)
 *   views:<key>                   other view lists and view configuration, kept whole
 *   sc:<key>                      sidecar fields (characteristics list, cost settings, unknown)
 *   tg:<name> · lens:<id> · style:<target> · lay:<diagram>:<section>:<id> · laymeta:<diagram>
 *
 * Element lists of diagram and flow views are left out: `syncViews` / `syncFlows` rebuild them
 * from the model. So `unflatten` must be followed by those two (as `Project.edit` does).
 *
 * Units are built from the data as written to disk (`workspaceData` / `sidecarData`), so keys
 * and values compare the way the files do.
 */

import { isObj, type Obj } from "./json.js";
import { parseKey, VIEW_LIST_OF_LEVEL } from "./diagrams.js";
import { sidecarData, toSidecar, type Sidecar } from "./sidecar.js";
import { toWorkspace, VIEW_LISTS, workspaceData, type Kind, type Workspace } from "./workspace.js";

export type Unit =
  | { t: "ws"; k: string; v: unknown }
  | { t: "model"; k: string; v: unknown }
  | { t: "el"; kind: Kind; parent: string | null; v: Obj }
  | { t: "rel"; owner: string; v: Obj }
  | { t: "view"; list: string; mode: "diagram" | "flow" | "whole"; v: Obj }
  | { t: "vel"; view: string; v: Obj }
  | { t: "vrel"; view: string; v: Obj }
  | { t: "views"; k: string; v: unknown }
  | { t: "sc"; k: string; v: unknown }
  | { t: "tg"; v: Obj }
  | { t: "lens"; v: Obj }
  | { t: "style"; target: string; v: Obj }
  | { t: "lay"; diagram: string; section: string; id: string; v: unknown }
  | { t: "laymeta"; diagram: string; v: Obj };

export type Units = Map<string, Unit>;

/** Units that only change how things look (not model content). */
export const isLayoutUnit = (u: Unit): boolean => u.t === "vel" || u.t === "lay" || u.t === "laymeta" || u.t === "style";

/** JSON with sorted object keys, so equal values compare equal whatever their key order. */
export function canon(v: unknown): string {
  return JSON.stringify(v, (_k, x) =>
    isObj(x)
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, x[k]]),
        )
      : x,
  );
}

export const sameUnit = (a: Unit | undefined, b: Unit | undefined): boolean => a === b || (a !== undefined && b !== undefined && canon(a) === canon(b));

const SIDECAR_SPLIT = new Set(["tagGroups", "lenses", "styles", "layouts"]);
const LAYOUT_SECTIONS = ["sizes", "edges", "positions"];

function viewMode(list: string, v: Obj): "diagram" | "flow" | "whole" {
  if (list === "dynamicViews") return "flow";
  const r = typeof v.key === "string" ? parseKey(v.key) : null;
  // Only views whose element list `syncViews` rebuilds may drop it here.
  return r && r.level in VIEW_LIST_OF_LEVEL && VIEW_LIST_OF_LEVEL[r.level] === list ? "diagram" : "whole";
}

const onlyId = (o: Obj) => Object.keys(o).every((k) => k === "id");

export function flatten(ws: Workspace, sc: Sidecar): Units {
  const out: Units = new Map();
  const w = workspaceData(ws);
  for (const [k, v] of Object.entries(w)) if (k !== "model" && k !== "views") out.set(`ws:${k}`, { t: "ws", k, v });

  const model = (w.model ?? {}) as Obj;
  for (const [k, v] of Object.entries(model)) if (k !== "people" && k !== "softwareSystems") out.set(`model:${k}`, { t: "model", k, v });
  const rels: [string, Unit][] = [];
  const addEl = (e: Obj, kind: Kind, parent: string | null) => {
    const { relationships, containers, components, ...rest } = e;
    out.set(`el:${String(e.id)}`, { t: "el", kind, parent, v: rest });
    for (const r of (relationships as Obj[] | undefined) ?? []) rels.push([`rel:${String(r.id)}`, { t: "rel", owner: String(e.id), v: r }]);
    for (const c of (containers as Obj[] | undefined) ?? []) addEl(c, "container", String(e.id));
    for (const c of (components as Obj[] | undefined) ?? []) addEl(c, "component", String(e.id));
  };
  for (const p of (model.people as Obj[] | undefined) ?? []) addEl(p, "person", null);
  for (const s of (model.softwareSystems as Obj[] | undefined) ?? []) addEl(s, "softwareSystem", null);
  for (const [k, u] of rels) out.set(k, u);

  const views = (w.views ?? {}) as Obj;
  for (const [list, value] of Object.entries(views)) {
    if (!(VIEW_LISTS as readonly string[]).includes(list)) {
      out.set(`views:${list}`, { t: "views", k: list, v: value });
      continue;
    }
    for (const view of value as Obj[]) {
      const key = String(view.key);
      const mode = viewMode(list, view);
      if (mode === "whole") {
        out.set(`view:${key}`, { t: "view", list, mode, v: view });
        continue;
      }
      const { elements, relationships, ...rest } = view;
      const v: Obj = mode === "flow" ? { ...rest, relationships: relationships ?? [] } : rest;
      out.set(`view:${key}`, { t: "view", list, mode, v });
      for (const e of (elements as Obj[] | undefined) ?? []) {
        if (!onlyId(e)) out.set(`vel:${key}:${String(e.id)}`, { t: "vel", view: key, v: e });
      }
      if (mode === "diagram") {
        for (const r of (relationships as Obj[] | undefined) ?? []) {
          if (!onlyId(r)) out.set(`vrel:${key}:${String(r.id)}`, { t: "vrel", view: key, v: r });
        }
      }
    }
  }

  const s = sidecarData(sc);
  for (const [k, v] of Object.entries(s)) if (!SIDECAR_SPLIT.has(k)) out.set(`sc:${k}`, { t: "sc", k, v });
  for (const g of (s.tagGroups as Obj[] | undefined) ?? []) out.set(`tg:${String(g.name)}`, { t: "tg", v: g });
  for (const l of (s.lenses as Obj[] | undefined) ?? []) out.set(`lens:${String(l.id)}`, { t: "lens", v: l });
  for (const [target, v] of Object.entries((s.styles as Obj | undefined) ?? {})) out.set(`style:${target}`, { t: "style", target, v: v as Obj });
  for (const [diagram, lay] of Object.entries((s.layouts as Obj | undefined) ?? {})) {
    const { sizes, edges, positions, ...meta } = lay as Obj;
    if (Object.keys(meta).length) out.set(`laymeta:${diagram}`, { t: "laymeta", diagram, v: meta });
    const sections: Obj = { sizes, edges, positions };
    for (const section of LAYOUT_SECTIONS) {
      for (const [id, v] of Object.entries((sections[section] as Obj | undefined) ?? {})) {
        out.set(`lay:${diagram}:${section}:${id}`, { t: "lay", diagram, section, id, v });
      }
    }
  }
  return out;
}

export class UnitError extends Error {}

/** Rebuild the workspace and sidecar from units (in map order). Run `syncViews` and `syncFlows`
 *  on the result before using it: view element lists are not stored in units. */
export function unflatten(units: Units): { ws: Workspace; sc: Sidecar } {
  const top: Obj = {};
  const model: Obj = { people: [], softwareSystems: [] };
  const views: Obj = {};
  for (const l of VIEW_LISTS) views[l] = [];
  const els = new Map<string, Obj>();
  const viewObjs = new Map<string, { o: Obj; mode: string }>();
  const sc: Obj = {};
  const tagGroups: Obj[] = [];
  const lenses: Obj[] = [];
  const styles: Obj = {};
  const layouts: Record<string, Obj> = {};
  const layout = (d: string) => (layouts[d] ??= { sizes: {}, edges: {}, positions: {} });
  // Elements and relationships are put in place after all elements exist, so a unit may come
  // before its parent (a merged draft that moved an element to a parent listed later).
  const elUnits: [Extract<Unit, { t: "el" }>, Obj][] = [];
  const relUnits: Extract<Unit, { t: "rel" }>[] = [];

  for (const u of units.values()) {
    switch (u.t) {
      case "ws":
        top[u.k] = u.v;
        break;
      case "model":
        model[u.k] = u.v;
        break;
      case "el": {
        const o: Obj = { ...structuredClone(u.v), relationships: [] };
        if (u.kind === "softwareSystem") o.containers = [];
        if (u.kind === "container") o.components = [];
        els.set(String(u.v.id), o);
        elUnits.push([u, o]);
        break;
      }
      case "rel":
        relUnits.push(u);
        break;
      case "view": {
        const o = structuredClone(u.v);
        if (u.mode !== "whole") {
          o.elements = [];
          if (u.mode === "diagram") o.relationships = [];
        }
        viewObjs.set(String(u.v.key), { o, mode: u.mode });
        ((views[u.list] ??= []) as Obj[]).push(o);
        break;
      }
      case "vel":
      case "vrel": {
        const view = viewObjs.get(u.view);
        if (!view) break; // the view is gone; its positions go with it
        (view.o[u.t === "vel" ? "elements" : "relationships"] as Obj[]).push(structuredClone(u.v));
        break;
      }
      case "views":
        views[u.k] = u.v;
        break;
      case "sc":
        sc[u.k] = u.v;
        break;
      case "tg":
        tagGroups.push(u.v);
        break;
      case "lens":
        lenses.push(u.v);
        break;
      case "style":
        styles[u.target] = u.v;
        break;
      case "lay":
        (layout(u.diagram)[u.section] as Obj)[u.id] = u.v;
        break;
      case "laymeta":
        Object.assign(layout(u.diagram), u.v);
        break;
    }
  }
  for (const [u, o] of elUnits) {
    if (u.parent === null) (model[u.kind === "person" ? "people" : "softwareSystems"] as Obj[]).push(o);
    else {
      const p = els.get(u.parent);
      if (!p) throw new UnitError(`"${String(u.v.name)}" is inside an element that does not exist (${u.parent}).`);
      (p[u.kind === "container" ? "containers" : "components"] as Obj[]).push(o);
    }
  }
  for (const u of relUnits) {
    const owner = els.get(u.owner);
    if (!owner) throw new UnitError(`Relationship "${String(u.v.id)}" belongs to an element that does not exist (${u.owner}).`);
    (owner.relationships as Obj[]).push(structuredClone(u.v));
  }
  const ws = toWorkspace(structuredClone({ ...top, model, views }));
  const sidecar = toSidecar(structuredClone({ ...sc, tagGroups, lenses, styles, layouts }));
  return { ws, sc: sidecar };
}

/** A short human label for a unit, used in conflict lists. */
export function unitLabel(u: Unit): string {
  const KIND: Record<string, string> = { person: "Person", softwareSystem: "Software system", container: "Container", component: "Component" };
  switch (u.t) {
    case "ws":
      return `Workspace ${u.k}`;
    case "model":
      return `Model data "${u.k}"`;
    case "el":
      return `${KIND[u.kind]} "${String(u.v.name)}"`;
    case "rel":
      return `Relationship "${String(u.v.description ?? "") || String(u.v.id)}"`;
    case "view":
      return u.mode === "flow" ? `Flow "${String(u.v.title ?? u.v.key)}"` : `View "${String(u.v.key)}"`;
    case "vel":
      return `Position of "${String(u.v.id)}" on ${u.view}`;
    case "vrel":
      return `Line "${String(u.v.id)}" on ${u.view}`;
    case "views":
      return `View settings "${u.k}"`;
    case "sc":
      return u.k === "characteristics" ? "Characteristics list" : u.k === "cost" ? "Cost settings" : `Setting "${u.k}"`;
    case "tg":
      return `Tag group "${String(u.v.name)}"`;
    case "lens":
      return `Lens "${String(u.v.name)}"`;
    case "style":
      return `Style of "${u.target}"`;
    case "lay":
      return `Layout of "${u.id}" on ${u.diagram}`;
    case "laymeta":
      return `Layout of ${u.diagram}`;
  }
}
