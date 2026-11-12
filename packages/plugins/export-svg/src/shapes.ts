/** SVG primitives shared by the diagram and its key. Neutral palette; meaning carried by shape, dash and text. */
import { escapeXml } from "./text.js";

export const FONT = "Helvetica, Arial, sans-serif";
export const PALETTE = { cardFill: "#f5f5f5", personFill: "#ececec", stroke: "#333333", boundary: "#666666", edge: "#444444", text: "#222222", labelBg: "#ffffff" };
export const ASYNC_DASH = "6 4";
export const BOUNDARY_DASH = "8 4";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const r = Math.round;

function attrs(a: Record<string, string | number | undefined>): string {
  return Object.entries(a)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}="${typeof v === "number" ? r(v) : escapeXml(v!)}"`)
    .join(" ");
}

export function el(tag: string, a: Record<string, string | number | undefined>, content?: string): string {
  return content === undefined ? `<${tag} ${attrs(a)}/>` : `<${tag} ${attrs(a)}>${content}</${tag}>`;
}

export function text(x: number, y: number, value: string, size: number, opts: { weight?: string; anchor?: string; cls?: string } = {}): string {
  return el("text", { class: opts.cls, x, y, "font-size": size, "font-weight": opts.weight, "text-anchor": opts.anchor, fill: PALETTE.text }, escapeXml(value));
}

/**
 * Element shape for a node kind: person = rounded card with a circle head above it,
 * dataStore = card with a cylinder-ish top ellipse, everything else = rounded card.
 */
export function elementShape(kind: string, b: Box, headRadius: number): string[] {
  const cx = b.x + b.width / 2;
  if (kind === "person") {
    return [
      el("rect", { class: "shape person", x: b.x, y: b.y, width: b.width, height: b.height, rx: 12, fill: PALETTE.personFill, stroke: PALETTE.stroke, "stroke-width": 1 }),
      el("circle", { class: "shape person-head", cx, cy: b.y - headRadius / 2, r: headRadius, fill: PALETTE.personFill, stroke: PALETTE.stroke, "stroke-width": 1 }),
    ];
  }
  if (kind === "dataStore") {
    const ry = Math.max(3, Math.min(8, b.height / 6));
    return [
      el("rect", { class: "shape data-store", x: b.x, y: b.y, width: b.width, height: b.height, fill: PALETTE.cardFill, stroke: PALETTE.stroke, "stroke-width": 1 }),
      el("ellipse", { class: "shape data-store-top", cx, cy: b.y, rx: b.width / 2, ry, fill: PALETTE.cardFill, stroke: PALETTE.stroke, "stroke-width": 1 }),
    ];
  }
  return [el("rect", { class: "shape card", x: b.x, y: b.y, width: b.width, height: b.height, rx: 8, fill: PALETTE.cardFill, stroke: PALETTE.stroke, "stroke-width": 1 })];
}

export function boundaryShape(b: Box, cls = "boundary"): string {
  return el("rect", { class: cls, x: b.x, y: b.y, width: b.width, height: b.height, rx: 4, fill: "none", stroke: PALETTE.boundary, "stroke-width": 1, "stroke-dasharray": BOUNDARY_DASH });
}

export function edgeLine(points: ReadonlyArray<readonly [number, number]>, isAsync: boolean, markerId: string, cls: string): string {
  return el("polyline", {
    class: `${cls} ${isAsync ? "async" : "sync"}`,
    points: points.map(([x, y]) => `${r(x)},${r(y)}`).join(" "),
    fill: "none",
    stroke: PALETTE.edge,
    "stroke-width": "1.5",
    "stroke-dasharray": isAsync ? ASYNC_DASH : undefined,
    "marker-end": `url(#${markerId})`,
  });
}

export function arrowMarker(id: string): string {
  return el("marker", { id, viewBox: "0 0 10 10", refX: 10, refY: 5, markerWidth: 8, markerHeight: 8, orient: "auto-start-reverse" }, el("path", { d: "M0,0 L10,5 L0,10 z", fill: PALETTE.edge }));
}
