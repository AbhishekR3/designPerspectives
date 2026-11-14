/**
 * The subset of the Structurizr workspace JSON that designPerspectives uses.
 *
 * Field names follow the schema in structurizr/structurizr, module `structurizr-json/structurizr.yaml`
 * (see docs/reviews/stage-a_review.md, section A0).
 *
 * Objects are kept as the plain JSON read from the file, so anything we do not model (deployment
 * nodes, documentation, styles, ...) survives a read and write unchanged. `dumpWorkspace` writes
 * known fields in a fixed order, then unknown ones, and leaves out empty defaults.
 */

import { readFileSync } from "node:fs";
import { isObj, ordered, stableJson, type Obj } from "./json.js";

export type Kind = "person" | "softwareSystem" | "container" | "component";

export interface Relationship {
  id: string;
  sourceId: string;
  destinationId: string;
  description?: string | null;
  technology?: string | null;
  tags?: string | null;
  url?: string | null;
  properties?: Record<string, string> | null;
  [extra: string]: unknown;
}

/** One element of any kind. `location` (people, systems), `technology` (containers, components),
 *  `containers` (systems) and `components` (containers) only appear where they apply. */
export interface Element {
  id: string;
  name: string;
  description?: string | null;
  tags?: string | null;
  url?: string | null;
  properties?: Record<string, string> | null;
  relationships: Relationship[];
  location?: string | null;
  technology?: string | null;
  containers?: Element[];
  components?: Element[];
  [extra: string]: unknown;
}

export interface Model {
  people: Element[];
  softwareSystems: Element[];
  [extra: string]: unknown;
}

export interface ElementView {
  id: string;
  x?: number | null;
  y?: number | null;
  [extra: string]: unknown;
}

export interface RelationshipView {
  id: string;
  description?: string | null;
  order?: string | null;
  response?: boolean | null;
  [extra: string]: unknown;
}

export interface View {
  key: string;
  order?: number | null;
  title?: string | null;
  description?: string | null;
  properties?: Record<string, string> | null;
  softwareSystemId?: string | null;
  containerId?: string | null;
  elementId?: string | null;
  elements: ElementView[];
  relationships: RelationshipView[];
  [extra: string]: unknown;
}

export const VIEW_LISTS = [
  "systemLandscapeViews",
  "systemContextViews",
  "containerViews",
  "componentViews",
  "dynamicViews",
] as const;
export type ViewList = (typeof VIEW_LISTS)[number];

export type Views = { [K in ViewList]: View[] } & { [extra: string]: unknown };

export interface Workspace {
  id?: number | null;
  name: string;
  description?: string | null;
  properties?: Record<string, string> | null;
  model: Model;
  views: Views;
  [extra: string]: unknown;
}

// Tags Structurizr gives every element/relationship of a type ("Element,Person" etc.).
export const DEFAULT_TAGS: Record<string, string[]> = {
  person: ["Element", "Person"],
  softwareSystem: ["Element", "Software System"],
  container: ["Element", "Container"],
  component: ["Element", "Component"],
  relationship: ["Relationship"],
};

export function tagsFor(kind: string, extra: string[] = []): string {
  const tags = [...DEFAULT_TAGS[kind]!];
  for (const t of extra) if (!tags.includes(t)) tags.push(t);
  return tags.join(",");
}

// ------------------------------------------------------------------ reading

class FormatError extends Error {}

function need(cond: boolean, msg: string): void {
  if (!cond) throw new FormatError(msg);
}

function reqStr(o: Obj, key: string, where: string): void {
  need(typeof o[key] === "string", `${where}: "${key}" must be text.`);
}

function normRel(r: unknown, where: string): Relationship {
  need(isObj(r), `${where}: a relationship must be an object.`);
  const o = r as Obj;
  for (const k of ["id", "sourceId", "destinationId"]) reqStr(o, k, where);
  return o as Relationship;
}

function normEl(e: unknown, where: string, childKey?: "containers" | "components", grandKey?: "components"): Element {
  need(isObj(e), `${where}: an element must be an object.`);
  const o = e as Obj;
  reqStr(o, "id", where);
  reqStr(o, "name", where);
  const w = `${where} "${String(o.id)}"`;
  o.relationships = (Array.isArray(o.relationships) ? o.relationships : []).map((r) => normRel(r, w));
  if (childKey) {
    o[childKey] = (Array.isArray(o[childKey]) ? (o[childKey] as unknown[]) : []).map((c) =>
      normEl(c, w, grandKey),
    );
  }
  return o as Element;
}

function normView(v: unknown, where: string): View {
  need(isObj(v), `${where}: a view must be an object.`);
  const o = v as Obj;
  reqStr(o, "key", where);
  o.elements = Array.isArray(o.elements) ? o.elements : [];
  o.relationships = Array.isArray(o.relationships) ? o.relationships : [];
  for (const e of o.elements as unknown[]) need(isObj(e) && typeof (e as Obj).id === "string", `${where} "${String(o.key)}": every element needs an id.`);
  for (const r of o.relationships as unknown[]) need(isObj(r) && typeof (r as Obj).id === "string", `${where} "${String(o.key)}": every relationship needs an id.`);
  return o as View;
}

/** Check and normalise parsed workspace JSON (adds empty lists so the code need not test for them). */
export function toWorkspace(data: unknown): Workspace {
  need(isObj(data), "A workspace must be a JSON object.");
  const o = data as Obj;
  reqStr(o, "name", "Workspace");
  need(isObj(o.model), 'Workspace: "model" is missing.');
  need(isObj(o.views), 'Workspace: "views" is missing.');
  const model = o.model as Obj;
  const views = o.views as Obj;
  model.people = (Array.isArray(model.people) ? model.people : []).map((p) => normEl(p, "Person"));
  model.softwareSystems = (Array.isArray(model.softwareSystems) ? model.softwareSystems : []).map((s) =>
    normEl(s, "Software system", "containers", "components"),
  );
  for (const name of VIEW_LISTS) {
    views[name] = (Array.isArray(views[name]) ? (views[name] as unknown[]) : []).map((v) => normView(v, "View"));
  }
  return o as Workspace;
}

export function parseWorkspace(text: string): Workspace {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new FormatError(`Not valid JSON: ${(e as Error).message}`);
  }
  return toWorkspace(data);
}

export function readWorkspace(path: string): Workspace {
  return parseWorkspace(readFileSync(path, "utf-8"));
}

export function emptyWorkspace(name = "Workspace"): Workspace {
  return toWorkspace({ name, model: {}, views: {} });
}

/** Every view, including view types we do not model (deployment, filtered, image), which still have keys. */
export function allViews(ws: Workspace): View[] {
  const out: View[] = [];
  for (const name of VIEW_LISTS) out.push(...ws.views[name]);
  for (const [name, value] of Object.entries(ws.views)) {
    if ((VIEW_LISTS as readonly string[]).includes(name)) continue;
    if (name.endsWith("Views") && Array.isArray(value)) {
      for (const v of value) if (isObj(v) && typeof v.key === "string") out.push({ elements: [], relationships: [], ...(v as Obj) } as unknown as View);
    }
  }
  return out;
}

// ------------------------------------------------------------------ writing

const nonEmpty = (_k: string, v: unknown) => Array.isArray(v) && v.length === 0;

const REL_KEYS = ["id", "sourceId", "destinationId", "description", "technology", "tags", "url", "properties"];
const EL_KEYS = ["id", "name", "description", "tags", "url", "properties", "relationships"];

function dumpRel(r: Relationship): Obj {
  return ordered(r, REL_KEYS);
}

function dumpEl(e: Element, kind: Kind): Obj {
  const o: Obj = { ...e, relationships: e.relationships.map(dumpRel) };
  if (kind === "person") return ordered(o, [...EL_KEYS, "location"], nonEmpty);
  if (kind === "softwareSystem") {
    o.containers = (e.containers ?? []).map((c) => dumpEl(c, "container"));
    return ordered(o, [...EL_KEYS, "location", "containers"], nonEmpty);
  }
  if (kind === "container") {
    o.components = (e.components ?? []).map((c) => dumpEl(c, "component"));
    return ordered(o, [...EL_KEYS, "technology", "components"], nonEmpty);
  }
  return ordered(o, [...EL_KEYS, "technology"], nonEmpty);
}

function dumpView(v: View): Obj {
  const o: Obj = {
    ...v,
    elements: v.elements.map((e) => ordered(e, ["id", "x", "y"])),
    relationships: v.relationships.map((r) => ordered(r, ["id", "description", "order", "response"])),
  };
  return ordered(
    o,
    ["key", "order", "title", "description", "properties", "softwareSystemId", "containerId", "elementId", "elements", "relationships"],
    nonEmpty,
  );
}

/** The workspace as written to disk: stable key order, no empty defaults, unknown fields kept. */
export function workspaceData(ws: Workspace): Obj {
  const model = ordered(
    {
      ...ws.model,
      people: ws.model.people.map((p) => dumpEl(p, "person")),
      softwareSystems: ws.model.softwareSystems.map((s) => dumpEl(s, "softwareSystem")),
    },
    ["people", "softwareSystems"],
    nonEmpty,
  );
  const viewsIn: Obj = { ...ws.views };
  for (const name of VIEW_LISTS) viewsIn[name] = ws.views[name].map(dumpView);
  const views = ordered(viewsIn, VIEW_LISTS, nonEmpty);
  return ordered({ ...ws, model, views }, ["id", "name", "description", "properties", "model", "views"]);
}

export function dumpWorkspace(ws: Workspace): string {
  return stableJson(workspaceData(ws));
}
