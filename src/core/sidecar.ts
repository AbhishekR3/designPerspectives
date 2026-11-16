/**
 * designPerspectives-only data that Structurizr has no place for (`architecture/designperspectives.json`).
 *
 * Holds:
 * - tag-group definitions and lenses
 * - `styles`:  colours/line styles per element or relationship ID (global, all diagrams)
 * - `layouts`: per-diagram data: box sizes, edge geometry (anchors, bend point, label position, routing),
 *              and, for diagrams Structurizr has no view for (connector detail, code), box positions
 *
 * Tag *values* and descriptive fields live on the elements themselves, as Structurizr element
 * properties named `dp.*` (see ops.ts).
 */

import { deepEqual, isObj, ordered, type Obj } from "./json.js";
import { LEVELS, SECTIONS, type CharacteristicDef, type CostSettings, type EdgeLayout, type Lens, type Level, type Pt, type Section, type Style, type TagGroup } from "../shared/types.js";

export { LEVELS, SECTIONS };

/**
 * Defaults: names from the characteristic tables and style scorecards in Richards & Ford,
 * *Fundamentals of Software Architecture*; descriptions are short paraphrases, not quotations.
 * The 1-5 rating scale follows the book's star ratings for architecture styles; rating individual
 * objects is a designPerspectives choice.
 */
export const DEFAULT_CHARACTERISTICS: CharacteristicDef[] = [
  { name: "Scalability", description: "Keeps working as the number of users or requests grows." },
  { name: "Elasticity", description: "Copes with sudden bursts of load." },
  { name: "Performance", description: "Response time and throughput." },
  { name: "Availability", description: "Share of time the system is up and usable." },
  { name: "Fault tolerance", description: "Keeps working when part of it fails." },
  { name: "Deployability", description: "How easy, frequent and low-risk deployments are." },
  { name: "Testability", description: "How completely and easily it can be tested." },
  { name: "Maintainability", description: "How easy it is to change and enhance." },
  { name: "Evolvability", description: "How well it accommodates new requirements over time." },
  { name: "Modularity", description: "How well it is divided into independent parts." },
  { name: "Security", description: "Protection of data and functions from misuse." },
  { name: "Simplicity", description: "How easy it is to understand." },
];

export function defaultCost(): CostSettings {
  return {
    currency: "USD",
    bands: [
      { name: "Free", max: 0, color: "#e5e7eb" },
      { name: "Low", max: 100, color: "#22c55e" },
      { name: "Medium", max: 1000, color: "#eab308" },
      { name: "High", max: 5000, color: "#f97316" },
      { name: "Very high", max: null, color: "#ef4444" },
    ],
  };
}

export function makeLens(p: Partial<Lens> & { id: string; name: string }): Lens {
  return {
    visibleLevels: [...LEVELS],
    defaultOverlay: null,
    hiddenTagGroups: [],
    visibleSections: [...SECTIONS],
    showTechnology: true,
    showDescriptions: true,
    builtin: false,
    ...p,
  };
}

/** A named set of defaults for one audience. Not access control: everything stays reachable. */
export const ENGINEER: Lens = makeLens({
  id: "engineer",
  name: "Engineer",
  visibleLevels: ["container", "component", "code"],
  builtin: true,
});
/** Everything: all levels and sections, technology and descriptions shown. The default for a model with no containers yet. */
export const ARCHITECT: Lens = makeLens({ id: "architect", name: "Architect", builtin: true });
/** For stakeholders outside engineering: the big picture, without technology, cost or code. */
export const OVERVIEW: Lens = makeLens({
  id: "overview",
  name: "Overview",
  visibleLevels: ["landscape", "context"],
  visibleSections: SECTIONS.filter((x) => !["cost", "notes", "tradeoffs", "sensitive", "code"].includes(x)),
  showTechnology: false,
  builtin: true,
});
export const BUILTIN_LENSES: Lens[] = [ENGINEER, ARCHITECT, OVERVIEW];

export interface Size {
  w: number;
  h: number;
}

export const LINE_SHAPES = ["straight", "curved", "smooth", "orthogonal", "rounded"] as const;
export type LineShape = NonNullable<EdgeLayout["routing"]>;
export const isLineShape = (v: unknown): v is LineShape => typeof v === "string" && (LINE_SHAPES as readonly string[]).includes(v);

export interface DiagramLayout {
  /** The default line shape of this diagram; absent means rounded right angles. */
  lineShape?: LineShape;
  sizes: Record<string, Size>;
  edges: Record<string, EdgeLayout>;
  positions: Record<string, Pt>;
}

export interface Sidecar {
  version: number;
  tagGroups: TagGroup[];
  characteristics: CharacteristicDef[];
  cost: CostSettings;
  lenses: Lens[];
  styles: Record<string, Style>;
  layouts: Record<string, DiagramLayout>;
  [extra: string]: unknown;
}

export function emptySidecar(): Sidecar {
  return {
    version: 1,
    tagGroups: [],
    characteristics: DEFAULT_CHARACTERISTICS.map((c) => ({ ...c })),
    cost: defaultCost(),
    lenses: [],
    styles: {},
    layouts: {},
  };
}

export function emptyLayout(): DiagramLayout {
  return { sizes: {}, edges: {}, positions: {} };
}

// ------------------------------------------------------------------ reading

const objOr = (v: unknown): Obj => (isObj(v) ? v : {});
const arrOr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function needStr(o: Obj, key: string, where: string): string {
  if (typeof o[key] !== "string") throw new Error(`${where}: "${key}" must be text.`);
  return o[key] as string;
}

export function toSidecar(data: unknown): Sidecar {
  if (!isObj(data)) throw new Error("The sidecar file must be a JSON object.");
  const sc = { ...emptySidecar(), ...data } as Sidecar;
  sc.tagGroups = arrOr(data.tagGroups).map((g) => {
    const o = objOr(g);
    needStr(o, "name", "Tag group");
    o.values = arrOr(o.values).map((v) => {
      const vo = objOr(v);
      needStr(vo, "name", `Tag group "${String(o.name)}"`);
      needStr(vo, "color", `Tag group "${String(o.name)}"`);
      return vo;
    });
    return o as unknown as TagGroup;
  });
  if ("characteristics" in data) {
    sc.characteristics = arrOr(data.characteristics).map((c) => {
      const o = objOr(c);
      needStr(o, "name", "Characteristic");
      return { ...o, name: o.name as string, description: typeof o.description === "string" ? o.description : "" };
    });
  }
  if ("cost" in data) {
    const c = objOr(data.cost);
    sc.cost = {
      ...c,
      currency: typeof c.currency === "string" ? c.currency : "USD",
      bands:
        "bands" in c
          ? arrOr(c.bands).map((b) => {
              const o = objOr(b);
              needStr(o, "name", "Cost band");
              needStr(o, "color", "Cost band");
              const max = o.max === undefined || o.max === null ? null : Number(o.max);
              if (max !== null && !Number.isFinite(max)) throw new Error(`Cost band "${String(o.name)}": "max" must be a number.`);
              return { ...o, name: o.name as string, color: o.color as string, max };
            })
          : defaultCost().bands,
    };
  }
  sc.lenses = arrOr(data.lenses).map((l) => {
    const o = objOr(l);
    needStr(o, "id", "Lens");
    needStr(o, "name", "Lens");
    const lens = makeLens({ ...(o as Partial<Lens>), id: o.id as string, name: o.name as string });
    lens.builtin = false;
    return lens;
  });
  sc.styles = {};
  for (const [k, v] of Object.entries(objOr(data.styles))) sc.styles[k] = objOr(v) as Style;
  sc.layouts = {};
  for (const [k, v] of Object.entries(objOr(data.layouts))) {
    const { lineShape, ...o } = objOr(v);
    sc.layouts[k] = {
      ...o,
      ...(isLineShape(lineShape) ? { lineShape } : {}),
      sizes: objOr(o.sizes) as Record<string, Size>,
      edges: objOr(o.edges) as Record<string, EdgeLayout>,
      positions: objOr(o.positions) as Record<string, Pt>,
    };
  }
  return sc;
}

export function parseSidecar(text: string): Sidecar {
  return toSidecar(JSON.parse(text));
}

// ------------------------------------------------------------------ writing

export const STYLE_KEYS = ["fill", "text", "stroke", "strokeStyle", "strokeWidth", "fontSize", "arrow", "arrowHead"] as const;
export const EDGE_LAYOUT_KEYS = ["sourceAnchor", "targetAnchor", "control", "labelT", "labelOffset", "routing"] as const;
const LENS_KEYS = ["id", "name", "visibleLevels", "defaultOverlay", "hiddenTagGroups", "visibleSections", "showTechnology", "showDescriptions"];

export function styleData(s: Style): Obj {
  return ordered(s as Obj, STYLE_KEYS);
}

export function edgeLayoutData(e: EdgeLayout): Obj {
  const o: Obj = { ...e };
  for (const k of ["sourceAnchor", "targetAnchor", "control"]) if (isObj(o[k])) o[k] = ordered(o[k] as Obj, ["x", "y"]);
  return ordered(o, EDGE_LAYOUT_KEYS);
}

function costData(c: CostSettings): Obj {
  return ordered({ ...c, bands: c.bands.map((b) => ordered(b as unknown as Obj, ["name", "max", "color"])) } as Obj, ["currency", "bands"]);
}

export function lensData(lens: Lens): Obj {
  const { builtin: _b, ...rest } = lens;
  return ordered(rest as Obj, LENS_KEYS);
}

/** The sidecar as written to disk. Defaults (characteristics list, cost settings) and empty
 *  styles/layouts are left out, so files of projects that do not use them stay unchanged. */
export function sidecarData(sc: Sidecar): Obj {
  const styles: Obj = {};
  for (const [k, v] of Object.entries(sc.styles)) {
    const d = styleData(v);
    if (Object.keys(d).length) styles[k] = d;
  }
  const layouts: Obj = {};
  for (const [key, lay] of Object.entries(sc.layouts)) {
    const o: Obj = { ...lay };
    o.sizes = Object.fromEntries(Object.entries(lay.sizes).map(([k, v]) => [k, ordered(v as unknown as Obj, ["w", "h"])]));
    o.edges = Object.fromEntries(Object.entries(lay.edges).map(([k, v]) => [k, edgeLayoutData(v)]));
    o.positions = Object.fromEntries(Object.entries(lay.positions).map(([k, v]) => [k, ordered(v as unknown as Obj, ["x", "y"])]));
    const d = ordered(o, ["lineShape", "sizes", "edges", "positions"], (_k, v) => isObj(v) && Object.keys(v).length === 0);
    if (Object.keys(d).length) layouts[key] = d;
  }
  const out: Obj = {
    ...sc,
    tagGroups: sc.tagGroups.map((g) => ordered({ ...g, values: g.values.map((v) => ordered(v as unknown as Obj, ["name", "color"])) } as Obj, ["name", "values"])),
    characteristics: sc.characteristics.map((c) => ordered(c as unknown as Obj, ["name", "description"])),
    cost: costData(sc.cost),
    lenses: sc.lenses.map(lensData),
    styles,
    layouts,
  };
  const isDefaultChars =
    deepEqual(
      sc.characteristics.map((c) => ({ name: c.name, description: c.description })),
      DEFAULT_CHARACTERISTICS,
    ) && sc.characteristics.every((c) => Object.keys(c).length === 2);
  const isDefaultCost = deepEqual(out.cost, costData(defaultCost()));
  return ordered(out, ["version", "tagGroups", "characteristics", "cost", "lenses", "styles", "layouts"], (k, v) => {
    if (k === "styles" || k === "layouts") return Object.keys(v as Obj).length === 0;
    if (k === "characteristics") return isDefaultChars;
    if (k === "cost") return isDefaultCost;
    return false;
  });
}

export type { Level, Section };
