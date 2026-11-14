export const NODE_W = 225;
export const NODE_H = 120;
export const SMALL_W = 200;
export const SMALL_H = 100;
/** Minimum empty space kept between two boxes. */
export const GAP = 50;

export type Pos = { x: number; y: number };
export type Size = { w: number; h: number };
export type Rect = { x: number; y: number; w: number; h: number };

export function defaultSize(kind: string): Size {
  return kind === "stage" || kind === "file" ? { w: SMALL_W, h: SMALL_H } : { w: NODE_W, h: NODE_H };
}

// elkjs is large; load it only when a diagram needs laying out.
let elkPromise: Promise<{ layout(g: object): Promise<unknown> }> | null = null;
function getElk() {
  elkPromise ??= import("elkjs/lib/elk.bundled.js").then((m) => new m.default());
  return elkPromise;
}

const SPACING = {
  "elk.spacing.nodeNode": "90",
  "elk.layered.spacing.nodeNodeBetweenLayers": "150",
  "elk.layered.spacing.edgeNodeBetweenLayers": "50",
  "elk.layered.spacing.edgeEdgeBetweenLayers": "30",
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
};

type ElkNode = { id: string; x?: number; y?: number; children?: ElkNode[] };

/**
 * Layered layout for a whole diagram (the approach used by ELK/Sugiyama-style tools): boxes are
 * placed in layers along the direction of the relationships, crossings are minimised, and the
 * spacing leaves room for line labels. `grouped` boxes are laid out inside one parent box so
 * elements outside a diagram's boundary are placed outside it. Returns top-left positions.
 */
export async function autoLayout(
  nodes: { id: string; size: Size }[],
  edges: { source: string; target: string }[],
  grouped: string[] = [],
  direction: "DOWN" | "RIGHT" = "DOWN",
): Promise<Record<string, Pos>> {
  const ids = new Set(nodes.map((n) => n.id));
  const inGroup = new Set(grouped.filter((g) => ids.has(g)));
  const box = (n: { id: string; size: Size }) => ({ id: n.id, width: n.size.w, height: n.size.h });
  const children: object[] = nodes.filter((n) => !inGroup.has(n.id)).map(box);
  if (inGroup.size) {
    children.push({
      id: "__group__",
      layoutOptions: { ...SPACING, "elk.padding": "[top=80,left=60,bottom=70,right=60]" },
      children: nodes.filter((n) => inGroup.has(n.id)).map(box),
    });
  }
  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.padding": "[top=20,left=20,bottom=20,right=20]",
      ...SPACING,
    },
    children,
    edges: edges
      .filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target)
      .map((e, i) => ({ id: `e${i}`, sources: [e.source], targets: [e.target] })),
  };
  const out = (await (await getElk()).layout(graph)) as ElkNode;
  const pos: Record<string, Pos> = {};
  const walk = (n: ElkNode, ox: number, oy: number) => {
    for (const c of n.children ?? []) {
      const x = ox + (c.x ?? 0);
      const y = oy + (c.y ?? 0);
      if (c.id === "__group__") walk(c, x, y);
      else pos[c.id] = { x: Math.round(x), y: Math.round(y) };
    }
  };
  walk(out, 0, 0);
  return pos;
}

// ---------------------------------------------------------------- free-space placement

const overlaps = (a: Rect, b: Rect, gap: number) =>
  a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;

export function isFree(rect: Rect, others: Rect[], gap = GAP): boolean {
  return !others.some((o) => overlaps(rect, o, gap));
}

/**
 * The free spot for a box of `size` closest to `want` (its top-left). Candidates are tried on a
 * grid in growing rings around `want`; the first ring with a free candidate wins, and within a
 * ring the one nearest to `want`. Keeps `GAP` px clear around every other box.
 */
export function findFreeSpot(want: Pos, size: Size, others: Rect[], gap = GAP): Pos {
  const step = 40;
  const at = (x: number, y: number): Rect => ({ x, y, w: size.w, h: size.h });
  if (isFree(at(want.x, want.y), others, gap)) return { x: Math.round(want.x), y: Math.round(want.y) };
  for (let ring = 1; ring <= 60; ring++) {
    let best: Pos | null = null;
    let bestD = Infinity;
    for (let i = -ring; i <= ring; i++) {
      for (const [dx, dy] of [
        [i, -ring],
        [i, ring],
        [-ring, i],
        [ring, i],
      ]) {
        const x = want.x + dx * step;
        const y = want.y + dy * step;
        if (!isFree(at(x, y), others, gap)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) [best, bestD] = [{ x, y }, d];
      }
    }
    if (best) return { x: Math.round(best.x), y: Math.round(best.y) };
  }
  return { x: Math.round(want.x), y: Math.round(want.y) };
}

/**
 * Positions for boxes that have none yet, in an already laid-out diagram. A box that is connected to
 * a placed box goes next to it (to the right of its neighbour, or below it); others go below the drawing.
 */
export function placeMissing(
  placed: Record<string, Pos>,
  sizes: Record<string, Size>,
  missing: string[],
  edges: { source: string; target: string }[],
): Record<string, Pos> {
  const rects = (): Rect[] =>
    Object.entries(placed).map(([id, p]) => {
      const sz = sizes[id] ?? { w: NODE_W, h: NODE_H };
      return { x: p.x, y: p.y, w: sz.w, h: sz.h };
    });
  const out: Record<string, Pos> = {};
  for (const id of missing) {
    const size = sizes[id] ?? { w: NODE_W, h: NODE_H };
    const nb = edges.map((e) => (e.source === id ? e.target : e.target === id ? e.source : null)).find((n) => n && placed[n]);
    let want: Pos;
    if (nb) {
      const s = sizes[nb] ?? { w: NODE_W, h: NODE_H };
      want = { x: placed[nb].x + s.w + 120, y: placed[nb].y };
    } else {
      const all = Object.values(placed);
      want = all.length
        ? { x: Math.min(...all.map((p) => p.x)), y: Math.max(...Object.entries(placed).map(([k, p]) => p.y + (sizes[k]?.h ?? NODE_H))) + 100 }
        : { x: 0, y: 0 };
    }
    const spot = findFreeSpot(want, size, rects());
    placed[id] = spot;
    out[id] = spot;
  }
  return out;
}
