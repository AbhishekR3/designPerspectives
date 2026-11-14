/**
 * Overlays colour objects by one attribute: a tag group, an architecture characteristic (rating
 * 1-5), monthly cost (by band), technology, or changes against another version of the model. Filters focus on (dim everything else) or hide the
 * objects that have one value of an overlay.
 */
import type { AppState, CostSettings, Diagram, ElementSummary, TagGroup } from "./types";

export type OverlaySpec =
  | { kind: "tag"; name: string }
  | { kind: "char"; name: string }
  | { kind: "cost" }
  | { kind: "tech" }
  | { kind: "work"; type: string } // type: a work type, or "all"
  | { kind: "changes" }; // added / changed / removed, when a compared version is shown

/** A value of an overlay as shown in the legend: `key` identifies it in filters. */
export interface OverlayItem {
  key: string;
  label: string;
  color: string;
}

export interface Filter {
  spec: string; // encoded OverlaySpec
  key: string; // OverlayItem.key, or NONE
  label: string;
  mode: "focus" | "hide";
}

export const NONE = "__none";

// Weak (red) to strong (green); neighbouring ratings also differ in lightness.
export const RATING_COLORS: Record<number, string> = { 1: "#ef4444", 2: "#f97316", 3: "#eab308", 4: "#84cc16", 5: "#22c55e" };
const TECH_PALETTE = ["#38bdf8", "#a78bfa", "#f472b6", "#fb923c", "#4ade80", "#facc15", "#2dd4bf", "#f87171", "#818cf8", "#a3e635"];

/** Lens defaults and filters store overlays as strings: a tag group name, "@cost", "@tech" or "@char:<name>". */
export function encodeSpec(s: OverlaySpec): string {
  if (s.kind === "tag") return s.name;
  if (s.kind === "char") return `@char:${s.name}`;
  if (s.kind === "work") return `@work:${s.type}`;
  return `@${s.kind}`;
}
export function decodeSpec(v: string | null | undefined): OverlaySpec | null {
  if (!v) return null;
  if (v === "@cost") return { kind: "cost" };
  if (v === "@tech") return { kind: "tech" };
  if (v === "@changes") return { kind: "changes" };
  if (v.startsWith("@char:")) return { kind: "char", name: v.slice(6) };
  if (v.startsWith("@work:")) return { kind: "work", type: v.slice(6) || "all" };
  return { kind: "tag", name: v };
}
export const sameSpec = (a: OverlaySpec | null, b: OverlaySpec | null) => !!a && !!b && encodeSpec(a) === encodeSpec(b);

export function specExists(s: OverlaySpec, state: AppState, visibleGroups: TagGroup[]): boolean {
  if (s.kind === "tag") return visibleGroups.some((g) => g.name === s.name);
  if (s.kind === "char") return state.characteristics.some((c) => c.name === s.name);
  if (s.kind === "changes") return state.compare !== null;
  return true;
}

export const WORK_LABEL: Record<string, string> = {
  all: "All open work",
  security: "Security issues",
  pr: "Pull requests",
  issue: "Issues / bugs",
  backlog: "Backlog",
  update: "Required updates",
};
export const SEVERITY_COLORS: Record<string, string> = { critical: "#dc2626", high: "#f97316", medium: "#eab308", low: "#3b82f6", open: "#a78bfa" };
const SEV_ORDER = ["critical", "high", "medium", "low", "open"];

/** Work items that are not done, of one type (or all). */
export function openWork(el: { work?: { type: string; status: string; severity?: string }[] }, type = "all") {
  return (el.work ?? []).filter((w) => w.status !== "done" && (type === "all" || w.type === type));
}

export const CHANGE_COLORS: Record<string, string> = { added: "#22c55e", changed: "#f59e0b", inner: "#60a5fa", removed: "#ef4444" };
export const CHANGE_LABEL: Record<string, string> = { added: "Added", changed: "Changed", inner: "Changed inside", removed: "Removed" };
const CHANGE_ORDER = ["added", "changed", "inner", "removed"];

export function specLabel(s: OverlaySpec): string {
  if (s.kind === "cost") return "Cost";
  if (s.kind === "changes") return "Changes";
  if (s.kind === "work") return WORK_LABEL[s.type] ?? s.type;
  if (s.kind === "tech") return "Technology";
  return s.name;
}

export function formatMoney(v: number, currency: string): string {
  const digits = v >= 100 || Number.isInteger(v) ? 0 : 2;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: digits,
      minimumFractionDigits: 0,
      notation: v >= 10000 ? "compact" : "standard",
    }).format(v);
  } catch {
    return `${v.toFixed(digits)} ${currency}`;
  }
}

export function costBand(v: number, cs: CostSettings) {
  return cs.bands.find((b) => b.max === null || v <= b.max) ?? cs.bands[cs.bands.length - 1];
}

export function bandRange(i: number, cs: CostSettings): string {
  const b = cs.bands[i];
  const prev = i > 0 ? cs.bands[i - 1].max : null;
  const f = (v: number) => formatMoney(v, cs.currency);
  if (b.max === 0) return f(0);
  if (b.max === null) return prev === null ? "any" : `over ${f(prev)}`;
  return prev === null ? `up to ${f(b.max)}` : `${f(prev)}–${f(b.max)}`;
}

/** Whether an element has any cost recorded on it or inside it. */
const hasCost = (el: ElementSummary) => el.cost.length > 0 || el.costRollup > 0;

export function techColors(diagram: Diagram): Map<string, string> {
  const counts = new Map<string, number>();
  for (const n of diagram.nodes) for (const t of n.technologies ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return new Map(sorted.map(([t], i) => [t, TECH_PALETTE[i % TECH_PALETTE.length]]));
}

export function legendItems(s: OverlaySpec, state: AppState, diagram: Diagram): OverlayItem[] {
  if (s.kind === "tag") return (state.tagGroups.find((g) => g.name === s.name)?.values ?? []).map((v) => ({ key: v.name, label: v.name, color: v.color }));
  if (s.kind === "char") return [5, 4, 3, 2, 1].map((r) => ({ key: String(r), label: `${r}/5`, color: RATING_COLORS[r] }));
  if (s.kind === "cost") return state.costSettings.bands.map((b) => ({ key: b.name, label: b.name, color: b.color }));
  if (s.kind === "changes") return CHANGE_ORDER.map((k) => ({ key: k, label: CHANGE_LABEL[k], color: CHANGE_COLORS[k] }));
  if (s.kind === "work") return SEV_ORDER.map((k) => ({ key: k, label: k === "open" ? "Open, no severity" : k[0].toUpperCase() + k.slice(1), color: SEVERITY_COLORS[k] }));
  return [...techColors(diagram).entries()].map(([t, c]) => ({ key: t, label: t, color: c }));
}

export interface NodeOverlay {
  key: string | null; // null: the element has no value
  chip: string; // text shown on the element
  color: string | null;
}

export function overlayOf(s: OverlaySpec, el: ElementSummary & { change?: string }, state: AppState, techs: Map<string, string>): NodeOverlay {
  if (s.kind === "changes") {
    return el.change ? { key: el.change, chip: CHANGE_LABEL[el.change], color: CHANGE_COLORS[el.change] } : { key: null, chip: "Unchanged", color: null };
  }
  if (s.kind === "tag") {
    const v = el.tags[s.name] ?? null;
    const color = state.tagGroups.find((g) => g.name === s.name)?.values.find((x) => x.name === v)?.color ?? null;
    return { key: v, chip: v ?? "No value", color };
  }
  if (s.kind === "char") {
    const r = (el.characteristics ?? []).find((x) => x.name === s.name)?.rating;
    return r ? { key: String(r), chip: `${"★".repeat(r)}${"☆".repeat(5 - r)}`, color: RATING_COLORS[r] } : { key: null, chip: "Not rated", color: null };
  }
  if (s.kind === "work") {
    const items = openWork(el, s.type);
    if (!items.length) return { key: null, chip: "Nothing open", color: null };
    const worst = SEV_ORDER.find((k) => items.some((w) => (w.severity ?? "open") === k)) ?? "open";
    return { key: worst, chip: `${items.length} open${worst !== "open" ? ` · ${worst}` : ""}`, color: SEVERITY_COLORS[worst] };
  }
  if (s.kind === "cost") {
    if (!hasCost(el)) return { key: null, chip: "No cost", color: null };
    const b = costBand(el.costRollup, state.costSettings);
    return { key: b.name, chip: `${formatMoney(el.costRollup, state.costSettings.currency)}/mo`, color: b.color };
  }
  const t = (el.technologies ?? []).find((x) => techs.has(x));
  return t ? { key: t, chip: el.technologies.join(", "), color: techs.get(t)! } : { key: null, chip: "No technology", color: null };
}

/** Elements of a diagram an overlay applies to (stages and files have no such data). */
export const overlayable = (d: Diagram) => d.nodes.filter((n) => n.kind !== "stage" && n.kind !== "file");

export function matchesFilter(f: Filter, el: ElementSummary, state: AppState, techs: Map<string, string>): boolean {
  const s = decodeSpec(f.spec);
  if (!s) return false;
  if (s.kind === "tech") return f.key === NONE ? !(el.technologies ?? []).length : (el.technologies ?? []).includes(f.key);
  const ov = overlayOf(s, el, state, techs);
  return f.key === NONE ? ov.key === null : ov.key === f.key;
}

export function counts(s: OverlaySpec, d: Diagram, state: AppState, techs: Map<string, string>): { byKey: Map<string, number>; none: number } {
  const byKey = new Map<string, number>();
  let none = 0;
  for (const n of overlayable(d)) {
    if (s.kind === "tech") {
      if (!(n.technologies ?? []).length) none++;
      for (const t of n.technologies ?? []) byKey.set(t, (byKey.get(t) ?? 0) + 1);
      continue;
    }
    const k = overlayOf(s, n, state, techs).key;
    if (k === null) none++;
    else byKey.set(k, (byKey.get(k) ?? 0) + 1);
  }
  return { byKey, none };
}
