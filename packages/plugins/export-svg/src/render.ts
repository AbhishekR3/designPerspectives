/**
 * Draws one laid-out ComputedView as SVG. Positions come only from the ComputedView (no layout here);
 * the key is generated from `keyForView`. Colour never carries meaning on its own: shapes, dashes and
 * "[Kind]" text do (spec file 05 rules 2–4).
 */
import { keyForView, kindLabel } from "@designperspectives/contracts";
import type { ComputedView, KeyEntry, ViewEdge, ViewNode } from "@designperspectives/contracts";
import { FONT, PALETTE, arrowMarker, boundaryShape, edgeLine, el, elementShape, text } from "./shapes.js";
import type { Box } from "./shapes.js";
import { clampLines, escapeXml, wrapText } from "./text.js";

const MARGIN = 20;
const TITLE_H = 40;
const HEAD_R = 14;
const KEY_GAP = 30;
const KEY_ROW = 36;
const SAMPLE_W = 60;
const SAMPLE_H = 26;
const CHAR_W = 6.5;

type Point = [number, number];

interface Frame {
  dx: number;
  dy: number;
  right: number;
  bottom: number;
}

/** Translation that puts the diagram's bounding box below the title, plus its far edges. */
function frameOf(view: ComputedView): Frame {
  const xs = [0, view.width, ...view.nodes.flatMap((n) => [n.x, n.x + n.width]), ...view.edges.flatMap((e) => e.points.map((p) => p[0]))];
  const ys = [0, view.height, ...view.nodes.flatMap((n) => [n.y, n.y + n.height]), ...view.edges.flatMap((e) => e.points.map((p) => p[1]))];
  const dx = MARGIN - Math.min(...xs);
  const dy = MARGIN + TITLE_H + HEAD_R * 2 - Math.min(...ys);
  return { dx, dy, right: Math.max(...xs) + dx, bottom: Math.max(...ys) + dy };
}

function boxOf(n: ViewNode, f: Frame): Box {
  return { x: n.x + f.dx, y: n.y + f.dy, width: n.width, height: n.height };
}

export function kindTag(kind: string, technology?: string): string {
  return technology ? `[${kindLabel(kind)}: ${technology}]` : `[${kindLabel(kind)}]`;
}

function depth(n: ViewNode, byId: ReadonlyMap<string, ViewNode>): number {
  let d = 0;
  for (let p = n.parent; p !== undefined && d < 64; p = byId.get(p)?.parent) d++;
  return d;
}

function drawBoundary(n: ViewNode, f: Frame): string[] {
  const b = boxOf(n, f);
  return [boundaryShape(b), text(b.x + 8, b.y + b.height - 8, `${n.title} ${kindTag(n.kind)}`, 12, { weight: "bold", cls: "boundary-label" })];
}

interface Line {
  value: string;
  size: number;
  height: number;
  weight?: string;
}

function cardLines(n: ViewNode): Line[] {
  const head: Line[] = [
    { value: n.title, size: 14, height: 18, weight: "bold" },
    { value: kindTag(n.kind, n.technology), size: 11, height: 15 },
  ];
  const room = Math.floor((n.height - 16 - 33) / 15);
  const desc = clampLines(wrapText(n.description ?? "", Math.floor((n.width - 16) / CHAR_W)), room);
  return [...head, ...desc.map((value) => ({ value, size: 12, height: 15 }))];
}

function drawCard(n: ViewNode, f: Frame): string[] {
  const b = boxOf(n, f);
  const lines = cardLines(n);
  let y = b.y + (b.height - lines.reduce((s, l) => s + l.height, 0)) / 2;
  const texts = lines.map((l) => {
    y += l.height;
    return text(b.x + b.width / 2, y - 4, l.value, l.size, { anchor: "middle", ...(l.weight ? { weight: l.weight } : {}) });
  });
  return [el("g", { class: "node", "data-id": n.id }, [...elementShape(n.kind, b, HEAD_R), ...texts].join(""))];
}

/** Point halfway along a polyline. */
export function midpoint(points: readonly Point[]): Point {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i]![0], p[1] - points[i]![1]));
  let rest = lengths.reduce((s, l) => s + l, 0) / 2;
  for (let i = 0; i < lengths.length; i++) {
    const len = lengths[i]!;
    if (rest <= len && len > 0) {
      const [a, b] = [points[i]!, points[i + 1]!];
      return [a[0] + ((b[0] - a[0]) * rest) / len, a[1] + ((b[1] - a[1]) * rest) / len];
    }
    rest -= len;
  }
  return points[0] ?? [0, 0];
}

function centre(n: ViewNode | undefined): Point {
  return n ? [n.x + n.width / 2, n.y + n.height / 2] : [0, 0];
}

function drawEdge(e: ViewEdge, f: Frame, byId: ReadonlyMap<string, ViewNode>, markerId: string): string[] {
  const raw: Point[] = e.points.length >= 2 ? e.points : [centre(byId.get(e.source)), centre(byId.get(e.target))];
  const pts = raw.map(([x, y]) => [x + f.dx, y + f.dy] as Point);
  const label = [...(e.label ? wrapText(e.label, 30) : []), ...(e.technology ? [`[${e.technology}]`] : [])];
  const out = [edgeLine(pts, e.async, markerId, "edge")];
  if (!label.length) return out;
  const [mx, my] = midpoint(pts);
  const w = Math.max(...label.map((l) => l.length)) * 6 + 8;
  const h = label.length * 13 + 4;
  out.push(el("rect", { class: "edge-label-bg", x: mx - w / 2, y: my - h / 2, width: w, height: h, fill: PALETTE.labelBg, "fill-opacity": "0.85" }));
  label.forEach((l, i) => out.push(text(mx, my - h / 2 + 13 * (i + 1) - 1, l, 11, { anchor: "middle", cls: "edge-label" })));
  return out;
}

function keySample(entry: KeyEntry, b: Box, markerId: string): string[] {
  if (entry.category === "relationship") return [edgeLine([[b.x, b.y + b.height / 2], [b.x + b.width, b.y + b.height / 2]], entry.id === "async", markerId, "key-sample")];
  if (entry.id.endsWith(":boundary")) return [boundaryShape(b, "key-sample boundary")];
  return elementShape(entry.id, b, 6);
}

function drawKey(entries: readonly KeyEntry[], top: number, markerId: string): string[] {
  const out = [text(MARGIN, top, "Key", 13, { weight: "bold", cls: "key-title" })];
  entries.forEach((entry, i) => {
    const b: Box = { x: MARGIN, y: top + 16 + i * KEY_ROW, width: SAMPLE_W, height: SAMPLE_H };
    out.push(el("g", { class: "key-row", "data-key": entry.id }, [...keySample(entry, b, markerId), text(MARGIN + SAMPLE_W + 16, b.y + 17, entry.label, 12)].join("")));
  });
  return out;
}

function group(cls: string, items: readonly string[]): string[] {
  return [`  <g class="${cls}">`, ...items.map((i) => `    ${i}`), "  </g>"];
}

export function renderSvg(view: ComputedView): string {
  const f = frameOf(view);
  const byId = new Map(view.nodes.map((n) => [n.id, n]));
  const markerId = `arrow-${view.id.replace(/[^A-Za-z0-9_-]/g, "_")}`;
  const key = keyForView(view);
  const keyTop = f.bottom + KEY_GAP;
  const width = Math.round(Math.max(f.right + MARGIN, MARGIN * 3 + SAMPLE_W + Math.max(0, ...key.map((k) => k.label.length)) * CHAR_W, MARGIN * 2 + view.title.length * 10));
  const height = Math.round(keyTop + 16 + key.length * KEY_ROW + MARGIN);
  const boundaries = view.nodes.filter((n) => n.isBoundary).sort((a, b) => depth(a, byId) - depth(b, byId) || (a.id < b.id ? -1 : 1));
  const title = escapeXml(view.title);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}" font-family="${FONT}">`,
    `  <title>${title}</title>`,
    ...(view.description ? [`  <desc>${escapeXml(view.description)}</desc>`] : []),
    `  <defs>${arrowMarker(markerId)}</defs>`,
    `  ${el("rect", { class: "background", x: 0, y: 0, width, height, fill: "#ffffff" })}`,
    `  ${text(MARGIN, MARGIN + 18, view.title, 18, { weight: "bold", cls: "view-title" })}`,
    ...group("boundaries", boundaries.flatMap((n) => drawBoundary(n, f))),
    ...group("edges", view.edges.flatMap((e) => drawEdge(e, f, byId, markerId))),
    ...group("nodes", view.nodes.filter((n) => !n.isBoundary).flatMap((n) => drawCard(n, f))),
    ...group("key", drawKey(key, keyTop, markerId)),
    "</svg>",
    "",
  ].join("\n");
}
