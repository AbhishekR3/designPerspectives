/**
 * Orthogonal edge routing: lines drawn with 90° turns whose ends are spread over the sides of
 * their boxes instead of meeting in one point.
 *
 * Two steps, both pure and deterministic (same input, same output):
 * - `planPorts` looks at all lines of one diagram together and gives each end a port: a side of
 *   its box and a point on that side. Lines that share a side get separate, ordered slots.
 * - `orthoRoute` draws one line between two ports with horizontal and vertical segments only,
 *   leaving and entering square to the sides and going around the two boxes it connects.
 *
 * This file has no imports: the UI (Vite) and the root tests (NodeNext) both load it.
 * Coordinates are diagram coordinates (y grows downwards).
 */

export type Pt = { x: number; y: number };
/** A box: top-left corner and size. */
export type Box = { x: number; y: number; w: number; h: number };
export type Side = "top" | "right" | "bottom" | "left";
/** A point on a box's border and the side it is on (the line leaves or enters square to it). */
export type Port = { x: number; y: number; side: Side };
/** One line to plan. Anchors are hand-set fractions of the box ({x,y} in 0..1, on the border); `control` a hand-set bend point. */
export interface RouteEdge {
  id: string;
  source: string;
  target: string;
  sourceAnchor?: Pt;
  targetAnchor?: Pt;
  control?: Pt;
}
export type PortPair = { source: Port; target: Port };

/** Smallest distance between two slots on one side. */
const MIN_GAP = 20;
/** Slots keep this share of the side (or CORNER_MIN px, whichever is larger) free at each corner. */
const CORNER_FRAC = 0.15;
const CORNER_MIN = 12;
/** When a side is too crowded, slots are squeezed to within this distance of the corners. */
const SQUEEZE_INSET = 4;
/** Auto slots move at least this far away from a hand-set anchor on the same side. */
const ANCHOR_CLEAR = 10;
/** Projections must overlap by this much before two boxes count as above/beside each other (straight line possible). */
const MIN_ALIGN = 20;
/** Length of the straight piece a line keeps next to a box before it may turn. */
const STUB = 20;
/** Cost of one turn, in px of length: a turn is worth a detour of this length. */
const BEND = 40;
/** Free space a line keeps from boxes it does not connect. */
const CLEARANCE = 15;
/** Smaller clearance tried when the full one leaves no way through. */
const TIGHT_CLEARANCE = 5;
/** Tie-break for parallel lines between the same pair (px): small enough never to beat real geometry. */
const PAIR_NUDGE = 0.01;

type End = "source" | "target";

const DIRS: Record<Side, Pt> = { right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, top: { x: 0, y: -1 } };
const OPPOSITE: Record<Side, Side> = { right: "left", left: "right", top: "bottom", bottom: "top" };
const horizontalSide = (s: Side) => s === "left" || s === "right";
const centre = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** The side a hand-set anchor lies on (same order as the canvas: left, right, top, bottom; nearest border if inside). */
export function sideOfAnchor(a: Pt): Side {
  if (a.x <= 0.001) return "left";
  if (a.x >= 0.999) return "right";
  if (a.y <= 0.001) return "top";
  if (a.y >= 0.999) return "bottom";
  const d: [number, Side][] = [
    [a.x, "left"],
    [1 - a.x, "right"],
    [a.y, "top"],
    [1 - a.y, "bottom"],
  ];
  return d.reduce((m, c) => (c[0] < m[0] ? c : m))[1];
}

/** The side of `b` that faces point `p` (by the larger outside distance; from the centre when `p` is inside). */
function sideFacingPoint(b: Box, p: Pt): Side {
  const ox = Math.max(b.x - p.x, p.x - (b.x + b.w));
  const oy = Math.max(b.y - p.y, p.y - (b.y + b.h));
  const c = centre(b);
  if (ox <= 0 && oy <= 0) {
    const nx = (p.x - c.x) / (b.w || 1);
    const ny = (p.y - c.y) / (b.h || 1);
    if (Math.abs(nx) >= Math.abs(ny)) return nx >= 0 ? "right" : "left";
    return ny >= 0 ? "bottom" : "top";
  }
  if (ox >= oy) return p.x >= c.x ? "right" : "left";
  return p.y >= c.y ? "bottom" : "top";
}

/**
 * Sides for a line from box `a` to box `b`, preferring the fewest turns:
 * above/below each other → facing top/bottom (straight line possible); beside each other → facing
 * left/right; diagonal → an L (one turn): leave along the axis with the larger gap, enter the other
 * box on the side facing back along the smaller one; overlapping boxes → facing sides on the axis
 * where the centres are further apart. A chosen side never makes the line cross its own box.
 */
function sidesBetween(a: Box, b: Box): [Side, Side] {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x); // >0 overlap, <0 gap
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  const ca = centre(a);
  const cb = centre(b);
  const right = cb.x >= ca.x;
  const down = cb.y >= ca.y;
  const vertical: [Side, Side] = down ? ["bottom", "top"] : ["top", "bottom"];
  const horizontal: [Side, Side] = right ? ["right", "left"] : ["left", "right"];
  if (ox >= 0 && oy >= 0) {
    const nx = Math.abs(cb.x - ca.x) / ((a.w + b.w) / 2 || 1);
    const ny = Math.abs(cb.y - ca.y) / ((a.h + b.h) / 2 || 1);
    return nx >= ny ? horizontal : vertical;
  }
  if (oy < 0 && ox >= MIN_ALIGN) return vertical;
  if (ox < 0 && oy >= MIN_ALIGN) return horizontal;
  // Diagonal (or only a sliver of overlap): one turn, when the corner clears both boxes (the ports
  // sit near the middle of their sides); else the other L; else facing sides and a Z.
  const downL: [Side, Side] = [vertical[0], horizontal[1]];
  const acrossL: [Side, Side] = [horizontal[0], vertical[1]];
  const downOk = (right ? ca.x <= b.x - STUB : ca.x >= b.x + b.w + STUB) && (down ? cb.y >= a.y + a.h + STUB : cb.y <= a.y - STUB);
  const acrossOk = (right ? cb.x >= a.x + a.w + STUB : cb.x <= a.x - STUB) && (down ? ca.y <= b.y - STUB : ca.y >= b.y + b.h + STUB);
  const verticalFirst = -oy >= -ox;
  if (verticalFirst ? downOk : acrossOk) return verticalFirst ? downL : acrossL;
  if (verticalFirst ? acrossOk : downOk) return verticalFirst ? acrossL : downL;
  return verticalFirst ? vertical : horizontal;
}

/** Absolute point at offset `off` along a side (from its left or top end). */
function pointOnSide(b: Box, side: Side, off: number): Pt {
  if (side === "top") return { x: b.x + off, y: b.y };
  if (side === "bottom") return { x: b.x + off, y: b.y + b.h };
  if (side === "left") return { x: b.x, y: b.y + off };
  return { x: b.x + b.w, y: b.y + off };
}
const sideLength = (b: Box, side: Side) => (horizontalSide(side) ? b.h : b.w);
/** Where a side starts along its own axis (x for top/bottom, y for left/right). */
const sideStart = (b: Box, side: Side) => (horizontalSide(side) ? b.y : b.x);
/** A point's coordinate along a side's axis. */
const along = (p: Pt, side: Side) => (horizontalSide(side) ? p.y : p.x);

/** `n` evenly spread positions within [lo, hi] (airy: n+1 equal parts; else MIN_GAP apart, centred), or null if they do not fit. */
function spreadRange(n: number, lo: number, hi: number): number[] | null {
  const len = hi - lo;
  if (len < 0) return null;
  if (n === 1) return [(lo + hi) / 2];
  const airy = len / (n + 1);
  if (airy >= MIN_GAP) return Array.from({ length: n }, (_, i) => lo + airy * (i + 1));
  if ((n - 1) * MIN_GAP > len) return null;
  const start = (lo + hi) / 2 - ((n - 1) * MIN_GAP) / 2;
  return Array.from({ length: n }, (_, i) => start + MIN_GAP * i);
}

/** The usable part of a side: away from the corners. */
function innerRange(b: Box, side: Side): [number, number] {
  const len = sideLength(b, side);
  const s = sideStart(b, side);
  const m = Math.min(Math.max(CORNER_MIN, CORNER_FRAC * len), len / 2);
  return [s + m, s + len - m];
}

/** `n` positions along a side: spread over its usable part, or squeezed evenly over the whole side when crowded. */
function spreadOnSide(n: number, b: Box, side: Side): number[] {
  const [lo, hi] = innerRange(b, side);
  const fit = spreadRange(n, lo, hi);
  if (fit) return fit;
  const s = sideStart(b, side);
  const len = sideLength(b, side);
  const inset = Math.min(SQUEEZE_INSET, len / 2);
  const gap = (len - 2 * inset) / (n - 1);
  return Array.from({ length: n }, (_, i) => s + inset + gap * i);
}

/**
 * Positions for an ordered group where some members want a given position (`prefs`): those keep
 * it, the rest are spread evenly between their neighbours (or the ends of [lo, hi]). Null when
 * nobody has a preference or the result is out of order, closer than MIN_GAP or outside [lo, hi].
 */
function withPreferences(prefs: (number | null)[], lo: number, hi: number): number[] | null {
  if (prefs.every((p) => p === null)) return null;
  const pos = [...prefs];
  let i = 0;
  while (i < pos.length) {
    if (pos[i] !== null) {
      i++;
      continue;
    }
    let j = i;
    while (j < pos.length && pos[j] === null) j++;
    const a = i > 0 ? pos[i - 1]! : lo;
    const z = j < pos.length ? pos[j]! : hi;
    for (let k = i; k < j; k++) pos[k] = a + ((z - a) * (k - i + 1)) / (j - i + 1);
    i = j;
  }
  const out = pos as number[];
  for (let k = 0; k < out.length; k++) {
    if (out[k]! < lo - 1e-6 || out[k]! > hi + 1e-6) return null;
    if (k > 0 && out[k]! - out[k - 1]! < MIN_GAP - 1e-6) return null;
  }
  return out;
}

/** Move positions that land within ANCHOR_CLEAR of a hand-set anchor off it, staying on the side. */
function clearAnchors(pos: number[], anchors: number[], b: Box, side: Side): number[] {
  if (!anchors.length) return pos;
  const s = sideStart(b, side);
  const e = s + sideLength(b, side);
  return pos.map((p) => {
    for (const a of anchors) {
      if (Math.abs(p - a) < ANCHOR_CLEAR) {
        const up = a + ANCHOR_CLEAR;
        const downP = a - ANCHOR_CLEAR;
        const preferUp = p >= a;
        const first = preferUp ? up : downP;
        const second = preferUp ? downP : up;
        p = first >= s && first <= e ? first : second >= s && second <= e ? second : p;
      }
    }
    return p;
  });
}

/** Whether `sideA` of `a` and `sideB` of `b` face each other across open space (a straight line can join them). */
function facing(a: Box, sideA: Side, b: Box, sideB: Side): boolean {
  if (OPPOSITE[sideA] !== sideB) return false;
  if (sideA === "right") return b.x >= a.x + a.w;
  if (sideA === "left") return a.x >= b.x + b.w;
  if (sideA === "bottom") return b.y >= a.y + a.h;
  return a.y >= b.y + b.h;
}

const SIDES: Side[] = ["right", "bottom", "left", "top"];

/**
 * The simple shape a line between `sa` of `a` and `sb` of `b` would take, from side midpoints:
 * straight (facing sides that overlap), Z through the gap middle (facing sides), L (one side
 * horizontal, one vertical) or a U round the outside (same side). Null when the sides do not make
 * such a shape (opposite sides that do not face each other, an L whose corner is too close).
 */
function skeleton(a: Box, sa: Side, b: Box, sb: Side): Pt[] | null {
  const ma = pointOnSide(a, sa, sideLength(a, sa) / 2);
  const mb = pointOnSide(b, sb, sideLength(b, sb) / 2);
  if (OPPOSITE[sa] === sb) {
    if (!facing(a, sa, b, sb)) return null;
    if (horizontalSide(sa)) {
      const lo = Math.max(a.y, b.y);
      const hi = Math.min(a.y + a.h, b.y + b.h);
      if (hi - lo >= MIN_ALIGN) {
        const y = (lo + hi) / 2;
        return [
          { x: ma.x, y },
          { x: mb.x, y },
        ];
      }
      const mx = (ma.x + mb.x) / 2;
      return [ma, { x: mx, y: ma.y }, { x: mx, y: mb.y }, mb];
    }
    const lo = Math.max(a.x, b.x);
    const hi = Math.min(a.x + a.w, b.x + b.w);
    if (hi - lo >= MIN_ALIGN) {
      const x = (lo + hi) / 2;
      return [
        { x, y: ma.y },
        { x, y: mb.y },
      ];
    }
    const my = (ma.y + mb.y) / 2;
    return [ma, { x: ma.x, y: my }, { x: mb.x, y: my }, mb];
  }
  if (sa === sb) {
    if (horizontalSide(sa)) {
      const X = sa === "right" ? Math.max(a.x + a.w, b.x + b.w) + 2 * STUB : Math.min(a.x, b.x) - 2 * STUB;
      return [ma, { x: X, y: ma.y }, { x: X, y: mb.y }, mb];
    }
    const Y = sa === "bottom" ? Math.max(a.y + a.h, b.y + b.h) + 2 * STUB : Math.min(a.y, b.y) - 2 * STUB;
    return [ma, { x: ma.x, y: Y }, { x: mb.x, y: Y }, mb];
  }
  const corner = horizontalSide(sa) ? { x: mb.x, y: ma.y } : { x: ma.x, y: mb.y };
  const o0 = DIRS[sa];
  const o1 = DIRS[sb];
  if ((corner.x - ma.x) * o0.x + (corner.y - ma.y) * o0.y < STUB) return null;
  if ((mb.x - corner.x) * o1.x + (mb.y - corner.y) * o1.y > -STUB) return null;
  return [ma, corner, mb];
}

/** The skeleton for a pair of sides with how many of `others` it crosses, its bends and length; null when it has no shape or goes through its own boxes. */
function scoreSides(a: Box, sa: Side, b: Box, sb: Side, others: Box[]): { cross: number; bends: number; len: number } | null {
  const sk = skeleton(a, sa, b, sb);
  if (!sk) return null;
  let len = 0;
  for (let i = 1; i < sk.length; i++) {
    if (hits(sk[i - 1]!, sk[i]!, a) || hits(sk[i - 1]!, sk[i]!, b)) return null;
    len += Math.abs(sk[i]!.x - sk[i - 1]!.x) + Math.abs(sk[i]!.y - sk[i - 1]!.y);
  }
  let cross = 0;
  for (const o of others) {
    for (let i = 1; i < sk.length; i++)
      if (hits(sk[i - 1]!, sk[i]!, o)) {
        cross++;
        break;
      }
  }
  return { cross, bends: sk.length - 2, len };
}

/** `proposed` sides, or when their shape crosses other boxes, the pair of sides whose shape crosses fewer (see `planPorts`). */
function avoidingSides(a: Box, b: Box, proposed: [Side, Side], others: Box[]): [Side, Side] {
  const base = scoreSides(a, proposed[0], b, proposed[1], others);
  if (!base || base.cross === 0) return proposed;
  let best: { sides: [Side, Side]; cross: number; bends: number; len: number } | null = null;
  for (const sa of SIDES)
    for (const sb of SIDES) {
      if (sa === proposed[0] && sb === proposed[1]) continue;
      const sc = scoreSides(a, sa, b, sb, others);
      if (!sc || sc.cross >= base.cross) continue;
      if (!best || sc.cross < best.cross || (sc.cross === best.cross && (sc.bends < best.bends || (sc.bends === best.bends && sc.len < best.len - 1e-9)))) best = { sides: [sa, sb], ...sc };
    }
  return best ? best.sides : proposed;
}

type EndInfo = { edge: RouteEdge; end: End; box: string; side: Side; fixed: Pt | null; key: number };

/**
 * Give every line end a port, looking at the whole diagram at once.
 *
 * - Hand-set anchors are kept exactly; their side is the border the fraction lies on.
 * - Other ends get a side (`sidesBetween`, or the side facing `control` when a bend point is set)
 *   and a slot. Ends sharing a side are ordered by the direction of their far end (so lines do not
 *   cross next to the box; parallel lines between the same pair keep one consistent order at both
 *   ends) and spread evenly, away from the corners and from hand-set anchors.
 * - When two sides face each other and all their lines join just those two sides, both get the
 *   same positions inside the overlap, so the lines are straight. A lone line facing an already
 *   placed port lines up with it when it can.
 *
 * - Obstacle-aware sides: when the simple shape of the line (straight, L or Z, drawn between the
 *   side midpoints) would cross another box, every other pair of sides is tried and the one whose
 *   shape crosses the fewest boxes wins (then fewest bends, then shortest; ties keep the first in
 *   the order right, bottom, left, top). The proposed sides stay unless another pair crosses fewer
 *   boxes. Lines with a hand-set anchor or bend point keep their sides. Off unless `opts.avoidBoxes` is true
 *   (the canvas turns it on; a diagram of boxes packed so close that every shape crosses a neighbour then keeps its sides).
 *
 * Lines whose boxes are missing are left out of the result.
 */
export function planPorts(boxes: Record<string, Box>, edges: RouteEdge[], opts: { avoidBoxes?: boolean } = {}): Record<string, PortPair> {
  const avoid = opts.avoidBoxes === true;
  const boxList = avoid ? Object.entries(boxes) : [];
  const list = edges.filter((e) => boxes[e.source] && boxes[e.target]);

  // Rank of each line among the lines of the same (unordered) pair, for the parallel-line tie-break.
  const pairs = new Map<string, RouteEdge[]>();
  for (const e of list) {
    const k = e.source < e.target ? `${e.source}\u0000${e.target}` : `${e.target}\u0000${e.source}`;
    pairs.set(k, [...(pairs.get(k) ?? []), e]);
  }
  const nudge = new Map<string, Pt>();
  for (const group of pairs.values()) {
    const sorted = [...group].sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
    sorted.forEach((e, i) => {
      const [lo, hi] = e.source < e.target ? [e.source, e.target] : [e.target, e.source];
      const ca = centre(boxes[lo]!);
      const cb = centre(boxes[hi]!);
      const len = Math.hypot(cb.x - ca.x, cb.y - ca.y);
      const n = len ? { x: -(cb.y - ca.y) / len, y: (cb.x - ca.x) / len } : { x: 1, y: 0 };
      nudge.set(e.id, { x: n.x * PAIR_NUDGE * i, y: n.y * PAIR_NUDGE * i });
    });
  }

  // Sides of both ends.
  const ends: EndInfo[] = [];
  for (const e of list) {
    const bs = boxes[e.source]!;
    const bt = boxes[e.target]!;
    const fs = e.sourceAnchor ? pointOnFraction(bs, e.sourceAnchor) : null;
    const ft = e.targetAnchor ? pointOnFraction(bt, e.targetAnchor) : null;
    let auto: [Side, Side];
    if (e.source === e.target) auto = ["right", "top"];
    else if (e.control) auto = [sideFacingPoint(bs, e.control), sideFacingPoint(bt, e.control)];
    else {
      auto = sidesBetween(bs, bt);
      if (avoid && !e.sourceAnchor && !e.targetAnchor) {
        const others = boxList.filter(([id]) => id !== e.source && id !== e.target).map(([, b]) => b);
        if (others.length) auto = avoidingSides(bs, bt, auto, others);
      }
    }
    // One hand-set end: the other end faces the point just outside it, where the line really starts.
    const stubOf = (p: Pt, a: Pt) => ({ x: p.x + DIRS[sideOfAnchor(a)].x * STUB, y: p.y + DIRS[sideOfAnchor(a)].y * STUB });
    if (e.source !== e.target && !e.control && fs && !ft) auto[1] = sideFacingPoint(bt, stubOf(fs, e.sourceAnchor!));
    if (e.source !== e.target && !e.control && ft && !fs) auto[0] = sideFacingPoint(bs, stubOf(ft, e.targetAnchor!));
    const ss = e.sourceAnchor ? sideOfAnchor(e.sourceAnchor) : auto[0];
    const ts = e.targetAnchor ? sideOfAnchor(e.targetAnchor) : auto[1];
    ends.push({ edge: e, end: "source", box: e.source, side: ss, fixed: fs, key: 0 });
    ends.push({ edge: e, end: "target", box: e.target, side: ts, fixed: ft, key: 0 });
  }
  const byEdge = new Map<string, { source: EndInfo; target: EndInfo }>();
  for (let i = 0; i < ends.length; i += 2) byEdge.set(ends[i]!.edge.id, { source: ends[i]!, target: ends[i + 1]! });
  const far = (x: EndInfo) => byEdge.get(x.edge.id)![x.end === "source" ? "target" : "source"];

  // Sort key: the angle of the far end seen from the box centre, increasing along the side
  // (left to right on top/bottom, top to bottom on left/right).
  for (const x of ends) {
    const b = boxes[x.box]!;
    const other = far(x);
    let ref: Pt;
    if (x.edge.source === x.edge.target) ref = { x: b.x + b.w + 40, y: b.y - 40 };
    else ref = x.edge.control ?? other.fixed ?? centre(boxes[other.box]!);
    const n = nudge.get(x.edge.id)!;
    const c = centre(b);
    const dx = ref.x + n.x - c.x;
    const dy = ref.y + n.y - c.y;
    x.key = x.side === "top" ? Math.atan2(dx, -dy) : x.side === "bottom" ? Math.atan2(dx, dy) : x.side === "left" ? Math.atan2(dy, -dx) : Math.atan2(dy, dx);
  }

  // Auto ends grouped by (box, side), in a stable order; hand-set anchors per side.
  const groups = new Map<string, EndInfo[]>();
  const anchors = new Map<string, number[]>();
  const gkey = (box: string, side: Side) => `${box}\u0000${side}`;
  for (const x of ends) {
    const k = gkey(x.box, x.side);
    if (x.fixed) anchors.set(k, [...(anchors.get(k) ?? []), along(x.fixed, x.side)]);
    else groups.set(k, [...(groups.get(k) ?? []), x]);
  }
  const cmp = (p: EndInfo, q: EndInfo) => p.key - q.key || (p.edge.id < q.edge.id ? -1 : p.edge.id > q.edge.id ? 1 : 0) || (p.end === q.end ? 0 : p.end === "source" ? -1 : 1);
  const order = [...groups.keys()].sort();
  for (const k of order) groups.get(k)!.sort(cmp);

  const placed = new Map<EndInfo, Pt>();
  for (const x of ends) if (x.fixed) placed.set(x, x.fixed);
  const done = new Set<string>();

  // 1. Two facing sides that only join each other: same positions on both, inside the overlap.
  for (const k of order) {
    if (done.has(k)) continue;
    const g = groups.get(k)!;
    const first = g[0]!;
    if (first.edge.source === first.edge.target) continue;
    const hk = gkey(far(first).box, far(first).side);
    const h = groups.get(hk);
    if (!h || done.has(hk) || h.length !== g.length || hk === k) continue;
    if (!g.every((x) => !far(x).fixed && far(x).box === far(first).box && far(x).side === far(first).side)) continue;
    const a = boxes[first.box]!;
    const b = boxes[far(first).box]!;
    if (!facing(a, first.side, b, far(first).side)) continue;
    const [alo, ahi] = innerRange(a, first.side);
    const [blo, bhi] = innerRange(b, far(first).side);
    let pos = spreadRange(g.length, Math.max(alo, blo), Math.min(ahi, bhi));
    if (!pos && g.length === 1) {
      const lo = Math.max(sideStart(a, first.side), sideStart(b, far(first).side));
      const hi = Math.min(sideStart(a, first.side) + sideLength(a, first.side), sideStart(b, far(first).side) + sideLength(b, far(first).side));
      if (hi > lo) pos = [(lo + hi) / 2];
    }
    if (!pos) continue;
    const ak = anchors.get(k) ?? [];
    const bk = anchors.get(hk) ?? [];
    if (pos.some((p) => [...ak, ...bk].some((q) => Math.abs(p - q) < ANCHOR_CLEAR))) continue;
    g.forEach((x, i) => {
      placed.set(x, pointOnSide(a, x.side, pos![i]! - sideStart(a, x.side)));
      const y = far(x);
      placed.set(y, pointOnSide(b, y.side, pos![i]! - sideStart(b, y.side)));
    });
    done.add(k).add(hk);
  }

  // 2. Crowded sides: spread their lines. A line whose far end can face it straight (a lone line
  // on a facing side, or a hand-set anchor there) keeps the straight position when the order and
  // spacing allow; the others are spread between those.
  for (const k of order) {
    const g = groups.get(k)!;
    if (done.has(k) || g.length < 2) continue;
    const first = g[0]!;
    const b = boxes[first.box]!;
    const [lo, hi] = innerRange(b, first.side);
    const prefs = g.map((x): number | null => {
      const y = far(x);
      const fb = boxes[y.box]!;
      if (x.edge.source === x.edge.target || !facing(b, x.side, fb, y.side)) return null;
      if (y.fixed) {
        const c = along(y.fixed, x.side);
        return c >= lo && c <= hi ? c : null;
      }
      const yk = gkey(y.box, y.side);
      if (groups.get(yk)!.length !== 1 || done.has(yk)) return null;
      const [flo, fhi] = innerRange(fb, y.side);
      const [a, z] = [Math.max(lo, flo), Math.min(hi, fhi)];
      return a <= z ? (a + z) / 2 : null;
    });
    const pos = clearAnchors(withPreferences(prefs, lo, hi) ?? spreadOnSide(g.length, b, first.side), anchors.get(k) ?? [], b, first.side);
    g.forEach((x, i) => placed.set(x, pointOnSide(b, x.side, pos[i]! - sideStart(b, x.side))));
    done.add(k);
  }

  // 3. Lone lines: line up with a facing port that is already placed, else the middle of the side.
  for (const k of order) {
    if (done.has(k)) continue;
    const x = groups.get(k)![0]!;
    const b = boxes[x.box]!;
    const y = far(x);
    const yp = placed.get(y);
    const [lo, hi] = innerRange(b, x.side);
    let p = (lo + hi) / 2;
    if (yp && x.edge.source !== x.edge.target && facing(b, x.side, boxes[y.box]!, y.side)) {
      const c = along(yp, x.side);
      const s = sideStart(b, x.side);
      const inset = Math.min(SQUEEZE_INSET * 2, sideLength(b, x.side) / 2);
      if (c >= s + inset && c <= s + sideLength(b, x.side) - inset) p = c;
    }
    p = clearAnchors([p], anchors.get(k) ?? [], b, x.side)[0]!;
    placed.set(x, pointOnSide(b, x.side, p - sideStart(b, x.side)));
    done.add(k);
  }

  const out: Record<string, PortPair> = {};
  for (const e of list) {
    const { source, target } = byEdge.get(e.id)!;
    const ps = placed.get(source)!;
    const pt = placed.get(target)!;
    out[e.id] = { source: { x: ps.x, y: ps.y, side: source.side }, target: { x: pt.x, y: pt.y, side: target.side } };
  }
  return out;
}

const pointOnFraction = (b: Box, a: Pt): Pt => ({ x: b.x + a.x * b.w, y: b.y + a.y * b.h });

// ------------------------------------------------------------------ one route

const DIR_LIST: Pt[] = [DIRS.right, DIRS.bottom, DIRS.left, DIRS.top]; // index: 0 right, 1 down, 2 left, 3 up
const dirIndex = (s: Side) => ({ right: 0, bottom: 1, left: 2, top: 3 })[s];

/** Remove repeated points and points in the middle of a straight run. */
function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 1e-6 && Math.abs(last.y - p.y) < 1e-6) continue;
    out.push(p);
  }
  for (let i = out.length - 2; i >= 1; i--) {
    const a = out[i - 1]!;
    const b = out[i]!;
    const c = out[i + 1]!;
    const sameX = Math.abs(a.x - b.x) < 1e-6 && Math.abs(b.x - c.x) < 1e-6;
    const sameY = Math.abs(a.y - b.y) < 1e-6 && Math.abs(b.y - c.y) < 1e-6;
    if (sameX || sameY) out.splice(i, 1);
  }
  return out;
}

/** Sorted distinct values; of values closer than 1e-6 the earliest in `v` is kept (so port coordinates stay exact). */
function uniq(v: number[]): number[] {
  const out: number[] = [];
  for (const n of v) if (!out.some((m) => Math.abs(m - n) < 1e-6)) out.push(n);
  return out.sort((a, b) => a - b);
}
/** Index of `v` in a list made by `uniq`. */
const indexIn = (list: number[], v: number) => list.findIndex((m) => Math.abs(m - v) < 1e-6);

/** Whether an axis-aligned segment crosses the open inside of a rectangle. */
function hits(a: Pt, b: Pt, r: Box): boolean {
  const e = 1e-6;
  const x1 = Math.min(a.x, b.x);
  const x2 = Math.max(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const y2 = Math.max(a.y, b.y);
  return x1 < r.x + r.w - e && x2 > r.x + e && y1 < r.y + r.h - e && y2 > r.y + e;
}

const grow = (b: Box, m: number): Box => ({ x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m });

/**
 * Shortest orthogonal path (length + BEND per turn) on a small grid of candidate lines, from the
 * source stub `s1` (heading `d0`) to the target stub `d1`, then into `dst` along `din`. With `via`,
 * the path must pass through that point. Returns null when the obstacles leave no way through.
 */
function search(s1: Pt, d0: number, d1: Pt, din: number, dst: Pt, xs: number[], ys: number[], preferX: number[], preferY: number[], obstacles: Box[], via: Pt | null): Pt[] | null {
  const nx = xs.length;
  const ny = ys.length;
  const ix = (v: number) => indexIn(xs, v);
  const iy = (v: number) => indexIn(ys, v);
  const sx = ix(s1.x);
  const sy = iy(s1.y);
  const tx = ix(d1.x);
  const ty = iy(d1.y);
  const vx = via ? ix(via.x) : -1;
  const vy = via ? iy(via.y) : -1;
  const phases = via ? 2 : 1;
  const state = (x: number, y: number, d: number, ph: number) => ((y * nx + x) * 4 + d) * phases + ph;
  const total = nx * ny * 4 * phases;
  const dist = new Float64Array(total).fill(Infinity);
  const prev = new Int32Array(total).fill(-1);
  // Which unit steps of the grid cross an obstacle (same test as `hits`): `hBlock[y*nx+x]` is the step
  // (x,y)-(x+1,y), `vBlock[y*nx+x]` the step (x,y)-(x,y+1).
  const hBlock = new Uint8Array(nx * ny);
  const vBlock = new Uint8Array(nx * ny);
  const e = 1e-6;
  for (const o of obstacles) {
    for (let y = 0; y < ny; y++) {
      if (!(ys[y]! < o.y + o.h - e && ys[y]! > o.y + e)) continue;
      for (let x = 0; x + 1 < nx; x++) if (xs[x]! < o.x + o.w - e && xs[x + 1]! > o.x + e) hBlock[y * nx + x] = 1;
    }
    for (let x = 0; x < nx; x++) {
      if (!(xs[x]! < o.x + o.w - e && xs[x]! > o.x + e)) continue;
      for (let y = 0; y + 1 < ny; y++) if (ys[y]! < o.y + o.h - e && ys[y + 1]! > o.y + e) vBlock[y * nx + x] = 1;
    }
  }
  // Binary heap of [cost, sequence, state]; the sequence keeps ties in insertion order (determinism).
  const heap: [number, number, number][] = [];
  let seq = 0;
  const push = (c: number, s: number) => {
    heap.push([c, seq++, s]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (less(heap[i]!, heap[p]!)) {
        [heap[i], heap[p]] = [heap[p]!, heap[i]!];
        i = p;
      } else break;
    }
  };
  const less = (a: [number, number, number], b: [number, number, number]) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
  const pop = (): [number, number, number] => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && less(heap[l]!, heap[m]!)) m = l;
        if (r < heap.length && less(heap[r]!, heap[m]!)) m = r;
        if (m === i) break;
        [heap[i], heap[m]] = [heap[m]!, heap[i]!];
        i = m;
      }
    }
    return top;
  };

  const start = state(sx, sy, d0, via && sx === vx && sy === vy ? 1 : 0);
  dist[start] = 0;
  push(0, start);
  let best = Infinity;
  let bestState = -1;
  const lastLeg = Math.hypot(dst.x - d1.x, dst.y - d1.y);
  while (heap.length) {
    const [c, , s] = pop();
    if (c > dist[s]! || c >= best) continue;
    const ph = s % phases;
    const d = Math.floor(s / phases) % 4;
    const cell = Math.floor(s / phases / 4);
    const x = cell % nx;
    const y = Math.floor(cell / nx);
    if (x === tx && y === ty && ph === phases - 1 && d !== (din + 2) % 4) {
      const fin = c + (d === din ? 0 : BEND) + lastLeg;
      if (fin < best) [best, bestState] = [fin, s];
    }
    for (let nd = 0; nd < 4; nd++) {
      if (nd === (d + 2) % 4) continue; // no U-turn on the spot
      const step = DIR_LIST[nd]!;
      const x2 = x + step.x;
      const y2 = y + step.y;
      if (x2 < 0 || y2 < 0 || x2 >= nx || y2 >= ny) continue;
      const a = { x: xs[x]!, y: ys[y]! };
      const b = { x: xs[x2]!, y: ys[y2]! };
      if (step.x !== 0 ? hBlock[y * nx + Math.min(x, x2)] : vBlock[Math.min(y, y2) * nx + x]) continue;
      const turn = nd === d ? 0 : BEND + (step.x === 0 ? (preferX.some((v) => Math.abs(v - xs[x]!) < 1e-6) ? 0 : 1) : preferY.some((v) => Math.abs(v - ys[y]!) < 1e-6) ? 0 : 1);
      const c2 = c + Math.abs(b.x - a.x) + Math.abs(b.y - a.y) + turn;
      const ph2 = ph === 0 && x2 === vx && y2 === vy ? 1 : ph;
      const s2 = state(x2, y2, nd, ph2);
      if (c2 < dist[s2]!) {
        dist[s2] = c2;
        prev[s2] = s;
        push(c2, s2);
      }
    }
  }
  if (bestState < 0) return null;
  const pts: Pt[] = [];
  for (let s = bestState; s >= 0; s = prev[s]!) {
    const cell = Math.floor(s / phases / 4);
    pts.push({ x: xs[cell % nx]!, y: ys[Math.floor(cell / nx)]! });
  }
  return pts.reverse();
}

/**
 * Route one line between two ports with horizontal and vertical segments only.
 *
 * The line leaves `src` square to its side and enters `dst` square to its side, keeping a short
 * straight stub (up to 20px, less when the boxes are closer) next to each box, and goes around
 * `srcBox` and `dstBox`. Fewest turns win, then the shortest length; free middle segments sit
 * halfway between the boxes. With `control` (a dragged bend point) the line passes through that
 * point: for a Z its middle segment moves to it.
 *
 * `obstacles` are the other boxes of the diagram. When the line above would run through one (or
 * within 15px of it), the search is repeated with the obstacles (grown by 15px) blocked and their
 * edges added to the grid, so the line goes around them; if that leaves no way through, with 5px;
 * if that fails too, the first line stands. Without obstacles the result does not change.
 * Returns the corner points, from `src` to `dst`, without repeated or collinear points.
 */
export function orthoRoute(src: Port, dst: Port, srcBox: Box, dstBox: Box, control?: Pt, obstacles?: Box[]): Pt[] {
  const gapX = Math.max(dstBox.x - (srcBox.x + srcBox.w), srcBox.x - (dstBox.x + dstBox.w));
  const gapY = Math.max(dstBox.y - (srcBox.y + srcBox.h), srcBox.y - (dstBox.y + dstBox.h));
  const maxGap = Math.max(gapX, gapY);
  const same = srcBox === dstBox || (srcBox.x === dstBox.x && srcBox.y === dstBox.y && srcBox.w === dstBox.w && srcBox.h === dstBox.h);
  const m = same || maxGap <= 0 ? STUB : Math.max(Math.min(STUB, maxGap / 2), 0);
  const o0 = DIRS[src.side];
  const o1 = DIRS[dst.side];
  const s1 = { x: src.x + o0.x * m, y: src.y + o0.y * m };
  const d1 = { x: dst.x + o1.x * m, y: dst.y + o1.y * m };
  const d0 = dirIndex(src.side);
  const din = (dirIndex(dst.side) + 2) % 4;

  const xs = [src.x, dst.x, s1.x, d1.x, srcBox.x - m, srcBox.x + srcBox.w + m, dstBox.x - m, dstBox.x + dstBox.w + m];
  const ys = [src.y, dst.y, s1.y, d1.y, srcBox.y - m, srcBox.y + srcBox.h + m, dstBox.y - m, dstBox.y + dstBox.h + m];
  const preferX = [src.x, dst.x];
  const preferY = [src.y, dst.y];
  if (gapX > 0) {
    const mid = srcBox.x < dstBox.x ? (srcBox.x + srcBox.w + dstBox.x) / 2 : (dstBox.x + dstBox.w + srcBox.x) / 2;
    xs.push(mid);
    preferX.push(mid);
  }
  if (gapY > 0) {
    const mid = srcBox.y < dstBox.y ? (srcBox.y + srcBox.h + dstBox.y) / 2 : (dstBox.y + dstBox.h + srcBox.y) / 2;
    ys.push(mid);
    preferY.push(mid);
  }
  if (control) {
    xs.push(control.x);
    ys.push(control.y);
    preferX.push(control.x);
    preferY.push(control.y);
  }
  const via = control ? { x: control.x, y: control.y } : null;
  const same4 = (p: Box, q: Box) => p.x === q.x && p.y === q.y && p.w === q.w && p.h === q.h;
  const others = (obstacles ?? []).filter((o) => !same4(o, srcBox) && !same4(o, dstBox));

  // Keep clear of both boxes (with the stub margin), then only of their insides, then of nothing.
  const tries: Box[][] = [[grow(srcBox, m), grow(dstBox, m)], [srcBox, dstBox], []];
  const gx = uniq(xs);
  const gy = uniq(ys);
  let base: Pt[] | null = null;
  for (const blocked of tries) {
    const path = search(s1, d0, d1, din, dst, gx, gy, preferX, preferY, blocked, via);
    if (path) {
      base = simplify([{ x: src.x, y: src.y }, ...path, { x: dst.x, y: dst.y }]);
      break;
    }
  }
  if (!base) {
    // Not reachable (cannot happen without obstacles); a plain Z keeps the line drawable.
    const mx = (src.x + dst.x) / 2;
    base = simplify([
      { x: src.x, y: src.y },
      { x: mx, y: src.y },
      { x: mx, y: dst.y },
      { x: dst.x, y: dst.y },
    ]);
  }
  if (!others.length) return base;

  const crosses = (pts: Pt[], boxes: Box[]) => boxes.some((o) => pts.some((p, i) => i > 0 && hits(pts[i - 1]!, p, o)));
  const margins = [CLEARANCE, TIGHT_CLEARANCE];
  for (const clear of margins) {
    // Only look for another way when this line goes through (or too close to) an obstacle.
    if (
      !crosses(
        base,
        others.map((o) => grow(o, clear)),
      )
    )
      return base;
    const grownOthers = others.map((o) => grow(o, clear));
    const ox = [...xs, ...grownOthers.flatMap((o) => [o.x, o.x + o.w])];
    const oy = [...ys, ...grownOthers.flatMap((o) => [o.y, o.y + o.h])];
    const hx = uniq(ox);
    const hy = uniq(oy);
    const path = search(s1, d0, d1, din, dst, hx, hy, preferX, preferY, [grow(srcBox, m), grow(dstBox, m), ...grownOthers], via);
    if (path) return simplify([{ x: src.x, y: src.y }, ...path, { x: dst.x, y: dst.y }]);
  }
  return base;
}

/**
 * Default place for a label, as a fraction along the line by length (as the canvas measures it):
 * the middle of the longest segment, so the label does not sit on a corner. Kept within 0.05..0.95.
 */
export function defaultLabelT(pts: Pt[]): number {
  let total = 0;
  let bestLen = -1;
  let bestMid = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > bestLen + 1e-9) [bestLen, bestMid] = [len, total + len / 2];
    total += len;
  }
  if (total <= 0) return 0.5;
  return Math.min(0.95, Math.max(0.05, bestMid / total));
}

/** One line whose label is to be placed: its route, the label's size, and a saved place (`fixedT`) if there is one. */
export interface LabelItem {
  id: string;
  pts: Pt[];
  size: { w: number; h: number };
  fixedT?: number;
}

const LABEL_T_MIN = 0.05;
const LABEL_T_MAX = 0.95;
/** A segment this long also offers places a little off its middle ends (0.15 and 0.85). */
const LONG_SEGMENT = 120;

function polylineLength(pts: Pt[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  return total;
}

/** The point at fraction `t` of the polyline's length (the same measure as `defaultLabelT` and the canvas use). */
function pointAtT(pts: Pt[], t: number): Pt {
  const total = polylineLength(pts);
  if (pts.length === 0) return { x: 0, y: 0 };
  let want = Math.min(Math.max(t, 0), 1) * total;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (want <= seg || i === pts.length - 1) {
      const k = seg ? Math.min(want / seg, 1) : 0;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    want -= seg;
  }
  return pts[0]!;
}

function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

const labelBox = (p: Pt, size: { w: number; h: number }): Box => ({ x: p.x - size.w / 2, y: p.y - size.h / 2, w: size.w, h: size.h });

/**
 * Choose where each line's label sits (as t along its route, the value `labelT` has) so labels
 * stay off each other and off the boxes where there is room.
 *
 * Items with `fixedT` keep it and still count as obstacles for the rest. For the others the
 * candidates are 0.5, 0.3 and 0.7 of every segment (and 0.15, 0.85 on long ones), longest segment
 * first, clamped to 0.05..0.95; the label is centred on the point. The score is 10 x the area
 * shared with labels already placed, plus 4 x the area shared with boxes, plus 0.5 per pixel of
 * distance from the default place (the middle of the longest segment); the lowest score wins, the
 * first candidate on a tie. Lines are placed longest route first, then by id, so the result does
 * not depend on the order of `items`. Lines that already have a clear default place keep it.
 */
export function placeLabels(items: LabelItem[], boxes: Box[]): Record<string, number> {
  const out: Record<string, number> = {};
  const placed: Box[] = [];
  const clampT = (t: number) => Math.min(LABEL_T_MAX, Math.max(LABEL_T_MIN, t));
  for (const it of items) {
    if (it.fixedT === undefined) continue;
    const t = clampT(it.fixedT);
    out[it.id] = t;
    placed.push(labelBox(pointAtT(it.pts, t), it.size));
  }
  const free = items.filter((it) => it.fixedT === undefined).sort((a, b) => polylineLength(b.pts) - polylineLength(a.pts) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const it of free) {
    const total = polylineLength(it.pts);
    if (total <= 0) {
      out[it.id] = 0.5;
      placed.push(labelBox(pointAtT(it.pts, 0.5), it.size));
      continue;
    }
    const dflt = defaultLabelT(it.pts);
    const home = pointAtT(it.pts, dflt);
    // Candidates, default first so it wins ties; then segments longest first.
    const cands: number[] = [dflt];
    const segs: { start: number; len: number }[] = [];
    let walked = 0;
    for (let i = 1; i < it.pts.length; i++) {
      const len = Math.hypot(it.pts[i]!.x - it.pts[i - 1]!.x, it.pts[i]!.y - it.pts[i - 1]!.y);
      segs.push({ start: walked, len });
      walked += len;
    }
    segs.sort((a, b) => b.len - a.len || a.start - b.start);
    for (const s of segs) {
      if (s.len <= 0) continue;
      const fr = s.len > LONG_SEGMENT ? [0.5, 0.3, 0.7, 0.15, 0.85] : [0.5, 0.3, 0.7];
      for (const f of fr) cands.push((s.start + s.len * f) / total);
    }
    let best = { t: dflt, score: Infinity };
    const seen = new Set<number>();
    for (const c of cands) {
      const t = clampT(c);
      const key = Math.round(t * 1000);
      if (seen.has(key)) continue;
      seen.add(key);
      const p = pointAtT(it.pts, t);
      const r = labelBox(p, it.size);
      let score = 0.5 * Math.hypot(p.x - home.x, p.y - home.y);
      for (const o of placed) score += 10 * overlapArea(r, o);
      for (const b of boxes) score += 4 * overlapArea(r, b);
      if (score < best.score - 1e-9) best = { t, score };
    }
    out[it.id] = best.t;
    placed.push(labelBox(pointAtT(it.pts, best.t), it.size));
  }
  return out;
}
