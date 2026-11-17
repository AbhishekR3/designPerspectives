/**
 * designPerspectives-only data that Structurizr has no place for (`architecture/designperspectives.json`).
 *
 * Holds:
 * - tag-group definitions and lenses
 * - `styles`:  colours/line styles per element or relationship ID (global, all diagrams)
 * - `layouts`: per-diagram data: box sizes, edge geometry (anchors, bend point, label position, routing),
 *              and, for diagrams Structurizr has no view for (connector detail, code), box positions
 * - `work`:    linked work settings: `severity`, how tools' severities become dp's (DEC-087)
 *
 * Tag *values* and descriptive fields live on the elements themselves, as Structurizr element
 * properties named `dp.*` (see modelEdits.ts).
 */

import { deepEqual, isObj, ordered, type Obj } from "./util.js";
import {
  DEFAULT_WORK_SEVERITY,
  LEVELS,
  SECTIONS,
  WORK_SEVERITY_TABLES,
  type CharacteristicDef,
  type CostSettings,
  type EdgeLayout,
  type Lens,
  type Level,
  type Pt,
  type Section,
  type Style,
  type TagGroup,
  type WorkSeverityChoice,
  type WorkSeverityMaps,
} from "../shared/types.js";

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

export const defaultWorkSeverity = (): WorkSeverityMaps => structuredClone(DEFAULT_WORK_SEVERITY);

const SEVERITY_CHOICES: readonly WorkSeverityChoice[] = ["critical", "high", "medium", "low", ""];
const SEVERITY_TABLE_MAX = 50;
const SEVERITY_NAME_MAX = 60;

/**
 * The severity mapping from a file or a request (DEC-087). A table or the scores left out take the defaults;
 * anything else that is wrong is an Error that says what. Names are trimmed and put in lower case.
 */
export function cleanWorkSeverity(v: unknown): WorkSeverityMaps {
  if (v === undefined || v === null) return defaultWorkSeverity();
  if (!isObj(v)) throw new Error("The severity mapping must be an object.");
  const out = defaultWorkSeverity();
  if (v.sarifScore !== undefined) {
    const s = objOr(v.sarifScore);
    const num = (k: "critical" | "high" | "medium") => {
      const n = s[k] === undefined ? out.sarifScore[k] : Number(s[k]);
      if (!Number.isFinite(n) || n < 0 || n > 10) throw new Error(`The SARIF score for ${k} must be a number from 0 to 10.`);
      return n;
    };
    out.sarifScore = { critical: num("critical"), high: num("high"), medium: num("medium") };
    if (!(out.sarifScore.critical > out.sarifScore.high && out.sarifScore.high > out.sarifScore.medium)) throw new Error("The SARIF scores must go down from critical to high to medium.");
  }
  for (const t of WORK_SEVERITY_TABLES) {
    if (v[t] === undefined) continue;
    if (!isObj(v[t])) throw new Error(`The severity table "${t}" must be an object of name → severity.`);
    const entries = Object.entries(v[t] as Obj);
    if (entries.length > SEVERITY_TABLE_MAX) throw new Error(`The severity table "${t}" has more than ${SEVERITY_TABLE_MAX} names.`);
    const table: Record<string, WorkSeverityChoice> = {};
    for (const [rawName, sev] of entries) {
      const name = rawName.trim().toLowerCase();
      if (!name || name.length > SEVERITY_NAME_MAX || [...name].some((ch) => ch.charCodeAt(0) < 32)) throw new Error(`"${rawName}" is not a usable name in the severity table "${t}".`);
      if (name in table) throw new Error(`"${name}" is listed twice in the severity table "${t}".`);
      if (typeof sev !== "string" || !(SEVERITY_CHOICES as readonly string[]).includes(sev))
        throw new Error(`"${name}" in the severity table "${t}" must map to critical, high, medium, low or "" (none).`);
      table[name] = sev as WorkSeverityChoice;
    }
    out[t] = table;
  }
  return out;
}

/** Same mapping, whatever the order of the names. */
export function sameWorkSeverity(a: WorkSeverityMaps, b: WorkSeverityMaps): boolean {
  const sorted = (t: Record<string, string>) => Object.entries(t).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0));
  return deepEqual(a.sarifScore, b.sarifScore) && WORK_SEVERITY_TABLES.every((t) => deepEqual(sorted(a[t]), sorted(b[t])));
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
  /**
   * The default line shape of this diagram; absent means rounded right angles. A string that is not one of LINE_SHAPES
   * (written by a newer version) is kept as it is so saving does not delete it; the diagram API treats it as absent.
   */
  lineShape?: LineShape | (string & {});
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
  /** Linked work settings (DEC-087); other keys a newer version writes are kept. */
  work: { severity: WorkSeverityMaps; [extra: string]: unknown };
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
    work: { severity: defaultWorkSeverity() },
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
  if ("work" in data) {
    const w = objOr(data.work);
    sc.work = { ...w, severity: cleanWorkSeverity(w.severity) };
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
      ...(typeof lineShape === "string" && lineShape !== "" ? { lineShape } : {}),
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
export const EDGE_LAYOUT_KEYS = ["sourceAnchor", "targetAnchor", "control", "points", "labelT", "labelOffset", "routing"] as const;
const LENS_KEYS = ["id", "name", "visibleLevels", "defaultOverlay", "hiddenTagGroups", "visibleSections", "showTechnology", "showDescriptions"];

export function styleData(s: Style): Obj {
  return ordered(s as Obj, STYLE_KEYS);
}

export function edgeLayoutData(e: EdgeLayout): Obj {
  const o: Obj = { ...e };
  for (const k of ["sourceAnchor", "targetAnchor", "control"]) if (isObj(o[k])) o[k] = ordered(o[k] as Obj, ["x", "y"]);
  if (Array.isArray(o.points)) o.points = o.points.map((p) => (isObj(p) ? ordered(p, ["x", "y"]) : p));
  return ordered(o, EDGE_LAYOUT_KEYS);
}

const SEVERITY_DATA_KEYS = ["sarifScore", "sarifLevel", "codeQuality", "sonar", "jira"];

/** The work settings as written: the severity mapping in a fixed key order, left out when it is the default. */
function workData(w: Sidecar["work"]): Obj {
  const { severity, ...rest } = w;
  const sev = ordered({ ...severity, sarifScore: ordered(severity.sarifScore as unknown as Obj, ["critical", "high", "medium"]) } as unknown as Obj, SEVERITY_DATA_KEYS);
  return ordered({ ...rest, severity: sameWorkSeverity(severity, DEFAULT_WORK_SEVERITY) ? undefined : sev } as Obj, ["severity"], (_k, v) => v === undefined);
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
    work: workData(sc.work),
  };
  const isDefaultChars =
    deepEqual(
      sc.characteristics.map((c) => ({ name: c.name, description: c.description })),
      DEFAULT_CHARACTERISTICS,
    ) && sc.characteristics.every((c) => Object.keys(c).length === 2);
  const isDefaultCost = deepEqual(out.cost, costData(defaultCost()));
  return ordered(out, ["version", "tagGroups", "characteristics", "cost", "work", "lenses", "styles", "layouts"], (k, v) => {
    if (k === "styles" || k === "layouts" || k === "work") return Object.keys(v as Obj).length === 0;
    if (k === "characteristics") return isDefaultChars;
    if (k === "cost") return isDefaultCost;
    return false;
  });
}

export type { Level, Section };
