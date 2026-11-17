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
 * Then `separateRoutes` spreads lines sharing a corridor into lanes and `placeLabels` places the labels. The last
 * section holds what hand edits use: `straightenJogs` (a route a few px from straight made straight, also used by the
 * planner), `moveSegment` (one piece of a route dragged), `routeThrough` (the route through corners set by hand) and `snapAxis`.
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
/** Two facing auto ports whose positions differ by less than this are moved into line (a straight line instead of a jog). */
const JOG_MAX = 12;
/** Distance between the lanes that lines sharing a corridor are spread into, and the largest gap that counts as sharing one. */
const LANE_GAP = 10;
const LANE_TOLERANCE = 6;
/** Segments must overlap by more than this to count as sharing a corridor. */
const LANE_MIN_OVERLAP = 2;
/** A nudged segment keeps this much clearance from a box (or what it had, if less). */
const LANE_CLEARANCE = 5;
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
    // Self-loops leave on the right and enter on the top: the later one must leave lower (outer) and enter further left (outer),
    // so its nudge at the target end points the other way (the loops nest instead of crossing).
    const flip = x.edge.source === x.edge.target && x.end === "target" ? -1 : 1;
    const n = nudge.get(x.edge.id)!;
    const c = centre(b);
    const dx = ref.x + flip * n.x - c.x;
    const dy = ref.y + flip * n.y - c.y;
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

  // 4. Tiny jogs: two facing auto ports that miss each other by a few px make a Z with a short middle
  // piece. Move one of them along its side onto the other's line when the slot rules still hold (it
  // stays inside the corner margins, in the same order and no closer to its neighbours than it was, at
  // least MIN_GAP from them when it can be). Hand-set anchors never move (an auto end facing one lines up with it).
  const onSide = new Map<string, EndInfo[]>();
  for (const x of ends) onSide.set(gkey(x.box, x.side), [...(onSide.get(gkey(x.box, x.side)) ?? []), x]);
  const canMove = (x: EndInfo, c: number): boolean => {
    const b = boxes[x.box]!;
    const cur = along(placed.get(x)!, x.side);
    const [lo, hi] = innerRange(b, x.side);
    const outside = (v: number) => Math.max(lo - v, v - hi, 0);
    if (outside(c) > outside(cur) + 1e-6) return false;
    for (const q of onSide.get(gkey(x.box, x.side))!) {
      if (q === x) continue;
      const qc = along(placed.get(q)!, x.side);
      if (Math.sign(c - qc) !== Math.sign(cur - qc)) return false;
      const need = q.fixed ? ANCHOR_CLEAR : MIN_GAP;
      if (Math.abs(c - qc) < Math.min(need, Math.abs(cur - qc)) - 1e-6) return false;
    }
    return true;
  };
  const moveTo = (x: EndInfo, c: number) => placed.set(x, pointOnSide(boxes[x.box]!, x.side, c - sideStart(boxes[x.box]!, x.side)));
  for (const e of [...list].sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0))) {
    if (e.source === e.target || e.control) continue;
    const { source, target } = byEdge.get(e.id)!;
    if ((source.fixed && target.fixed) || !facing(boxes[source.box]!, source.side, boxes[target.box]!, target.side)) continue;
    const cs = along(placed.get(source)!, source.side);
    const ct = along(placed.get(target)!, target.side);
    const d = Math.abs(cs - ct);
    if (d < 1e-6 || d >= JOG_MAX) continue;
    if (!source.fixed && canMove(source, ct)) moveTo(source, ct);
    else if (!target.fixed && canMove(target, cs)) moveTo(target, cs);
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
  const order = v.map((_, i) => i).sort((a, b) => v[a]! - v[b]! || a - b);
  const out: number[] = [];
  let first = -1; // index in `v` of the earliest value of the current cluster
  let last = NaN;
  for (const i of order) {
    if (out.length && Math.abs(v[i]! - last) < 1e-6) {
      if (i < first) {
        first = i;
        out[out.length - 1] = v[i]!;
      }
    } else {
      out.push(v[i]!);
      first = i;
    }
    last = v[i]!;
  }
  return out.sort((a, b) => a - b);
}
/** Index of `v` in a list made by `uniq` (-1 when absent). */
function indexIn(list: number[], v: number): number {
  const i = firstGE(list, v - 1e-6);
  return i < list.length && Math.abs(list[i]! - v) < 1e-6 ? i : -1;
}
/** First index of the sorted `list` whose value is >= `v` (list length when none). */
function firstGE(list: number[], v: number): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid]! < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
/** First index of the sorted `list` whose value is > `v` (list length when none). */
function firstGT(list: number[], v: number): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid]! <= v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

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
 * the path must pass through that point. Returns null when the obstacles leave no way through; `found.cost`
 * receives the cost of the path (its length and turns, with the last leg into `dst`).
 */
function search(
  s1: Pt,
  d0: number,
  d1: Pt,
  din: number,
  dst: Pt,
  xs: number[],
  ys: number[],
  preferX: number[],
  preferY: number[],
  obstacles: Box[],
  via: Pt | null,
  found?: { cost: number },
): Pt[] | null {
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
  // Zero-filled arrays (cheap even for large grids); `seen` tells which entries of `dist` and `prev` hold a value.
  const seen = new Uint8Array(total);
  const dist = new Float64Array(total);
  const prev = new Int32Array(total);
  // Which unit steps of the grid cross an obstacle (same test as `hits`): `hBlock[y*nx+x]` is the step
  // (x,y)-(x+1,y), `vBlock[y*nx+x]` the step (x,y)-(x,y+1). Each obstacle marks only the index ranges
  // it covers (found by binary search), not every step of the grid.
  const hBlock = new Uint8Array(nx * ny);
  const vBlock = new Uint8Array(nx * ny);
  const e = 1e-6;
  for (const o of obstacles) {
    // Grid lines strictly inside the obstacle, and the steps that overlap it.
    const y0 = firstGT(ys, o.y + e);
    const y1 = firstGE(ys, o.y + o.h - e);
    const x0 = firstGT(xs, o.x + e);
    const x1 = firstGE(xs, o.x + o.w - e);
    const sx0 = Math.max(0, x0 - 1);
    const sx1 = Math.min(nx - 1, x1);
    const sy0 = Math.max(0, y0 - 1);
    const sy1 = Math.min(ny - 1, y1);
    for (let y = y0; y < y1; y++) for (let x = sx0; x < sx1; x++) hBlock[y * nx + x] = 1;
    for (let x = x0; x < x1; x++) for (let y = sy0; y < sy1; y++) vBlock[y * nx + x] = 1;
  }
  // Whether the line a turn is made on is one that the route prefers (no extra cost for it).
  const prefX = new Uint8Array(nx);
  const prefY = new Uint8Array(ny);
  for (let x = 0; x < nx; x++) prefX[x] = preferX.some((v) => Math.abs(v - xs[x]!) < 1e-6) ? 1 : 0;
  for (let y = 0; y < ny; y++) prefY[y] = preferY.some((v) => Math.abs(v - ys[y]!) < 1e-6) ? 1 : 0;
  // A*: binary heap of states, each at most once (`pos` is its place in the heap, 1-based, 0 when absent; improving a
  // state moves it up). Ordered by cost so far plus the Manhattan distance to the target stub and one turn when it is
  // neither in line horizontally nor vertically (never more than what is left); then the larger cost so far (closer to
  // the target); then the order of insertion (determinism).
  const heap: number[] = [];
  const pos = new Int32Array(total);
  const keyF = new Float64Array(total);
  const keyQ = new Float64Array(total);
  let seq = 0;
  const before = (a: number, b: number) => keyF[a]! < keyF[b]! || (keyF[a] === keyF[b] && (dist[a]! > dist[b]! || (dist[a] === dist[b] && keyQ[a]! < keyQ[b]!)));
  const siftUp = (from: number) => {
    let i = from;
    const st = heap[i]!;
    while (i > 0) {
      const p = (i - 1) >> 1;
      const ps = heap[p]!;
      if (!before(st, ps)) break;
      heap[i] = ps;
      pos[ps] = i + 1;
      i = p;
    }
    heap[i] = st;
    pos[st] = i + 1;
  };
  const tgtX = xs[tx]!;
  const tgtY = ys[ty]!;
  const push = (c: number, x: number, y: number, dir: number, st: number) => {
    const ex = tgtX - xs[x]!;
    const ey = tgtY - ys[y]!;
    const ux = Math.abs(ex) < 1e-6 ? 0 : Math.sign(ex);
    const uy = Math.abs(ey) < 1e-6 ? 0 : Math.sign(ey);
    // Fewest turns still needed: one to start along the other axis; two when heading away from where it has to go (no U-turns).
    const horizontal = dir % 2 === 0;
    const heading = dir === 0 || dir === 1 ? 1 : -1;
    let turns = 0;
    if (ux !== 0 && uy !== 0) turns = (horizontal ? heading !== ux : heading !== uy) ? 2 : 1;
    else if (ux !== 0) turns = horizontal ? (heading === ux ? 0 : 2) : 1;
    else if (uy !== 0) turns = horizontal ? 1 : heading === uy ? 0 : 2;
    keyF[st] = c + Math.abs(ex) + Math.abs(ey) + turns * BEND;
    keyQ[st] = seq++;
    if (pos[st]) siftUp(pos[st]! - 1);
    else {
      heap.push(st);
      siftUp(heap.length - 1);
    }
  };
  const pop = (): number => {
    const top = heap[0]!;
    pos[top] = 0;
    const last = heap.pop()!;
    const n = heap.length;
    if (n) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const m = r < n && before(heap[r]!, heap[l]!) ? r : l;
        if (!before(heap[m]!, last)) break;
        heap[i] = heap[m]!;
        pos[heap[i]!] = i + 1;
        i = m;
      }
      heap[i] = last;
      pos[last] = i + 1;
    }
    return top;
  };

  const start = state(sx, sy, d0, via && sx === vx && sy === vy ? 1 : 0);
  seen[start] = 1;
  dist[start] = 0;
  push(0, sx, sy, d0, start);
  let best = Infinity;
  let bestState = -1;
  const lastLeg = Math.hypot(dst.x - d1.x, dst.y - d1.y);
  while (heap.length) {
    const s = pop();
    const c = dist[s]!;
    if (keyF[s]! + lastLeg >= best) break; // every state left in the heap is at least as far
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
      if (step.x !== 0 ? hBlock[y * nx + Math.min(x, x2)] : vBlock[Math.min(y, y2) * nx + x]) continue;
      const turn = nd === d ? 0 : BEND + (step.x === 0 ? 1 - prefX[x]! : 1 - prefY[y]!);
      const c2 = c + Math.abs(xs[x2]! - xs[x]!) + Math.abs(ys[y2]! - ys[y]!) + turn;
      const ph2 = ph === 0 && x2 === vx && y2 === vy ? 1 : ph;
      const s2 = state(x2, y2, nd, ph2);
      if (!seen[s2] || c2 < dist[s2]!) {
        seen[s2] = 1;
        dist[s2] = c2;
        prev[s2] = s;
        push(c2, x2, y2, nd, s2);
      }
    }
  }
  if (bestState < 0) return null;
  if (found) found.cost = best;
  const pts: Pt[] = [];
  for (let s = bestState; ; s = prev[s]!) {
    const cell = Math.floor(s / phases / 4);
    pts.push({ x: xs[cell % nx]!, y: ys[Math.floor(cell / nx)]! });
    if (s === start) break;
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
 * if that fails too, the first line stands. Without obstacles the result does not change. Only the
 * obstacles near the two boxes are looked at first (a window that grows until the path found is the
 * best there is), so the time depends on the obstacles around the line, not on all of them. The
 * function reads nothing but its arguments, so any subset of lines can be routed on its own.
 * Returns the corner points, from `src` to `dst`, without repeated or collinear points. Two facing ports on the same
 * point (touching boxes) give the two points `src` and `dst`, which coincide: a line of no length.
 */
export function orthoRoute(src: Port, dst: Port, srcBox: Box, dstBox: Box, control?: Pt, obstacles?: Box[]): Pt[] {
  // Two facing ports on the same point (boxes that touch, lines aligned): nothing to draw between them, and no way to
  // leave or enter square without going into the other box.
  if (!control && OPPOSITE[src.side] === dst.side && Math.abs(src.x - dst.x) < 1e-6 && Math.abs(src.y - dst.y) < 1e-6) {
    return [
      { x: src.x, y: src.y },
      { x: dst.x, y: dst.y },
    ];
  }
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
  // The search only looks at obstacles near the two boxes first (a window around them, grown by 250px); when that
  // leaves no way through, or not a short one, the window grows to 800px, then to the whole diagram. The window is also the limit of the grid.
  const region = [grow(srcBox, m), grow(dstBox, m), ...(control ? [{ x: control.x, y: control.y, w: 0, h: 0 }] : [])];
  const wx1 = Math.min(...region.map((r) => r.x));
  const wy1 = Math.min(...region.map((r) => r.y));
  const wx2 = Math.max(...region.map((r) => r.x + r.w));
  const wy2 = Math.max(...region.map((r) => r.y + r.h));
  const margins = [CLEARANCE, TIGHT_CLEARANCE];
  for (const clear of margins) {
    const grownOthers = others.map((o) => grow(o, clear));
    // Only look for another way when this line goes through (or too close to) an obstacle.
    if (!crosses(base, grownOthers)) return base;
    const blockedBoxes = [grow(srcBox, m), grow(dstBox, m)];
    for (const reach of WINDOWS) {
      const [x1, y1, x2, y2] = [wx1 - reach, wy1 - reach, wx2 + reach, wy2 + reach];
      const near = grownOthers.filter((o) => o.x < x2 && o.x + o.w > x1 && o.y < y2 && o.y + o.h > y1);
      const whole = near.length === grownOthers.length;
      const inX = (v: number) => whole || (v >= x1 && v <= x2);
      const inY = (v: number) => whole || (v >= y1 && v <= y2);
      const hx = uniq([...xs, ...near.flatMap((o) => [o.x, o.x + o.w]).filter(inX)]);
      const hy = uniq([...ys, ...near.flatMap((o) => [o.y, o.y + o.h]).filter(inY)]);
      const found = { cost: 0 };
      const path = search(s1, d0, d1, din, dst, hx, hy, preferX, preferY, [...blockedBoxes, ...near], via, found);
      // A path that leaves the window goes at least 2 x `reach` beyond the straight way, so a path found inside that is
      // no longer than that (plus the last leg) is the best there is; a longer one may have a better way outside.
      if (path && (whole || found.cost <= Math.abs(s1.x - d1.x) + Math.abs(s1.y - d1.y) + Math.hypot(dst.x - d1.x, dst.y - d1.y) + 2 * reach))
        return simplify([{ x: src.x, y: src.y }, ...path, { x: dst.x, y: dst.y }]);
      if (whole) break; // a wider window adds nothing
    }
  }
  return base;
}

/** How far (px) around the two boxes of a line the search looks for obstacles, narrowest first; the last is the whole diagram. */
const WINDOWS = [250, 800, Infinity];

// ------------------------------------------------------------------ lanes

/** Bundles up to this size try every lane order when the order from the ends adds crossings. */
const MAX_PERMUTED = 5;

/** All orders of 0..n-1, in lexicographic order. */
const permutationCache = new Map<number, number[][]>();
function permutations(n: number): number[][] {
  const cached = permutationCache.get(n);
  if (cached) return cached;
  const out: number[][] = [];
  const walk = (cur: number[], rest: number[]) => {
    if (!rest.length) out.push(cur);
    for (let k = 0; k < rest.length; k++) walk([...cur, rest[k]!], [...rest.slice(0, k), ...rest.slice(k + 1)]);
  };
  walk(
    [],
    Array.from({ length: n }, (_, k) => k),
  );
  permutationCache.set(n, out);
  return out;
}

/** One interior segment of a route: between `pts[i]` and `pts[i+1]`, with the way its two neighbours leave it. */
interface LaneSeg {
  id: string;
  i: number;
  /** Perpendicular coordinate (y of a horizontal segment, x of a vertical one). */
  coord: number;
  /** Extent along the segment. */
  lo: number;
  hi: number;
  /** Side (-1 towards smaller coordinates, +1 towards larger) the neighbouring segment leaves at the `lo` and `hi` end. */
  loDir: number;
  hiDir: number;
}

/** Distance from an axis-aligned segment to a box (0 when they touch or overlap; the larger of the two axis gaps). */
function segClearance(a: Pt, b: Pt, r: Box): number {
  const dx = Math.max(r.x - Math.max(a.x, b.x), Math.min(a.x, b.x) - (r.x + r.w), 0);
  const dy = Math.max(r.y - Math.max(a.y, b.y), Math.min(a.y, b.y) - (r.y + r.h), 0);
  return Math.max(dx, dy);
}

/** Whether the segments a-b and c-d cross strictly inside both (touching ends and shared pieces do not count). */
function segCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const pv = a.x === b.x;
  const qv = c.x === d.x;
  if (pv === qv) return false;
  const [v1, v2, h1, h2] = pv ? [a, b, c, d] : [c, d, a, b];
  return v1.x > Math.min(h1.x, h2.x) && v1.x < Math.max(h1.x, h2.x) && h1.y > Math.min(v1.y, v2.y) && h1.y < Math.max(v1.y, v2.y);
}

/** The smallest rectangle around some points: [x1, y1, x2, y2]. */
type Bounds = [number, number, number, number];
function boundsOf(pts: Pt[]): Bounds {
  let [x1, y1, x2, y2] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of pts) {
    if (p.x < x1) x1 = p.x;
    if (p.x > x2) x2 = p.x;
    if (p.y < y1) y1 = p.y;
    if (p.y > y2) y2 = p.y;
  }
  return [x1, y1, x2, y2];
}
const unionBounds = (a: Bounds, b: Bounds): Bounds => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
const growBounds = (a: Bounds, m: number): Bounds => [a[0] - m, a[1] - m, a[2] + m, a[3] + m];
/** Whether two rectangles touch or overlap. */
const meets = (a: Bounds, b: Bounds) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
const boxMeets = (r: Box, a: Bounds) => r.x <= a[2] && a[0] <= r.x + r.w && r.y <= a[3] && a[1] <= r.y + r.h;

/**
 * Spread lines that share a corridor into lanes, so they read as separate lines.
 *
 * Looks at the middle segments of the routes (not the first and last: those start at the ports, which
 * stay where they are). Segments of different lines that run the same way, within 6px of each other,
 * and overlap by more than 2px form a bundle. A bundle of n lines is moved to n lanes 10px apart,
 * centred on where the bundle was (the gap shrinks to 8, then 6, when the room is tight). The order of
 * the lanes follows where each line comes from and goes to, so the lines do not cross at the ends of
 * the bundle; when that order adds crossings, bundles of up to 5 lines try every order and take the one with
 * the fewest. Separate lines win over a clean crossing count: the best order is applied even when it adds a
 * crossing (DEC-061). A bundle is left alone only when no order fits: a line would be pushed into a box (or
 * closer to one than 5px, or than it was), or a neighbouring piece would get shorter than 12px or turn round.
 * Only the moved pieces and their neighbours are counted, against pieces of other lines near them, so the time
 * grows with the bundles, not with every pair of lines.
 *
 * A segment moves by changing its own coordinate and that of the two points it joins, so routes stay
 * orthogonal and connected. Tiny jogs (a middle piece under 12px between two parallel pieces) are made straight
 * when one of the pieces next to it can slide onto the other's line. Horizontal bundles are done first, then vertical ones (twice, as moving
 * one can bring another into reach). Finally repeated and collinear points are dropped. Pure and
 * deterministic: the result does not depend on the order of `routes`.
 */
export function separateRoutes(routes: Record<string, Pt[]>, boxes: Box[], opts: { gap?: number } = {}): Record<string, Pt[]> {
  const gap = opts.gap ?? LANE_GAP;
  const cur: Record<string, Pt[]> = {};
  for (const id of Object.keys(routes).sort()) cur[id] = routes[id]!.map((p) => ({ x: p.x, y: p.y }));

  const coordOf = (p: Pt, horizontal: boolean) => (horizontal ? p.y : p.x);
  const alongOf = (p: Pt, horizontal: boolean) => (horizontal ? p.x : p.y);
  const setCoord = (p: Pt, horizontal: boolean, v: number) => {
    if (horizontal) p.y = v;
    else p.x = v;
  };

  const segmentsOf = (horizontal: boolean): LaneSeg[] => {
    const out: LaneSeg[] = [];
    for (const [id, pts] of Object.entries(cur)) {
      for (let i = 1; i + 2 < pts.length; i++) {
        const a = pts[i]!;
        const b = pts[i + 1]!;
        if (Math.abs(coordOf(a, horizontal) - coordOf(b, horizontal)) > 1e-6 || Math.abs(alongOf(a, horizontal) - alongOf(b, horizontal)) < 1e-6) continue;
        const c = coordOf(a, horizontal);
        const dirA = Math.sign(coordOf(pts[i - 1]!, horizontal) - c);
        const dirB = Math.sign(coordOf(pts[i + 2]!, horizontal) - c);
        const aFirst = alongOf(a, horizontal) < alongOf(b, horizontal);
        out.push({
          id,
          i,
          coord: c,
          lo: Math.min(alongOf(a, horizontal), alongOf(b, horizontal)),
          hi: Math.max(alongOf(a, horizontal), alongOf(b, horizontal)),
          loDir: aFirst ? dirA : dirB,
          hiDir: aFirst ? dirB : dirA,
        });
      }
    }
    return out.sort((p, q) => p.coord - q.coord || (p.id < q.id ? -1 : p.id > q.id ? 1 : 0) || p.i - q.i);
  };

  /** Whether moving `pts[i]` and `pts[i+1]` to coordinate `v` keeps the segment and its two neighbours clear of the boxes (only `near` ones, those within reach of the route) and long enough. */
  const fits = (pts: Pt[], i: number, horizontal: boolean, v: number, jog = -1, near: Box[] = boxes): boolean => {
    const n = pts.length;
    const moved = (k: number): Pt => (k === i || k === i + 1 ? (horizontal ? { x: pts[k]!.x, y: v } : { x: v, y: pts[k]!.y }) : pts[k]!);
    for (const k of [i - 1, i, i + 1]) {
      const [oa, ob, na, nb] = [pts[k]!, pts[k + 1]!, moved(k), moved(k + 1)];
      for (const r of near) {
        if (hits(na, nb, r) && !hits(oa, ob, r)) return false;
        if (segClearance(na, nb, r) < Math.min(LANE_CLEARANCE, segClearance(oa, ob, r)) - 1e-6) return false;
      }
      if (k !== i && k !== jog) {
        // A neighbour keeps its direction and does not shrink to a stub: 12px (6px when it is the piece at a port).
        const [o, w] = horizontal ? [ob.y - oa.y, nb.y - na.y] : [ob.x - oa.x, nb.x - na.x];
        const atPort = k === 0 || k + 1 === n - 1;
        if (Math.sign(o) !== Math.sign(w) || Math.abs(w) < Math.min(Math.abs(o), atPort ? 6 : JOG_MAX) - 1e-6) return false;
      }
    }
    return true;
  };

  /**
   * Make tiny jogs straight: a short middle piece (under 12px) between two parallel pieces goes away
   * when one of those pieces can slide onto the other's line (not the pieces at the ports, which stay put).
   */
  const straightenJogs = () => {
    for (const id of Object.keys(cur)) {
      // Pieces only slide onto lines the route already has, so only boxes within reach of its bounds matter.
      const reach = growBounds(boundsOf(cur[id]!), LANE_CLEARANCE + 1);
      const near = boxes.filter((r) => boxMeets(r, reach));
      for (let pass = 0; pass < 4; pass++) {
        const pts = cur[id]!;
        let changed = false;
        for (let i = 1; i + 2 < pts.length && !changed; i++) {
          const [a, b] = [pts[i]!, pts[i + 1]!];
          const jogHorizontal = Math.abs(a.y - b.y) < 1e-6;
          const len = jogHorizontal ? Math.abs(a.x - b.x) : Math.abs(a.y - b.y);
          if (len < 1e-6 || len >= JOG_MAX) continue;
          // The neighbours run across the jog: slide the one before onto the one after, or the other way round.
          const [before, after] = jogHorizontal ? [a.x, b.x] : [a.y, b.y];
          // A U (the pieces on either side run in opposite directions) is not a jog: straightening it would fold the line back on itself.
          const [p0, p3] = [pts[i - 1]!, pts[i + 2]!];
          if (jogHorizontal ? Math.sign(a.y - p0.y) !== Math.sign(p3.y - b.y) : Math.sign(a.x - p0.x) !== Math.sign(p3.x - b.x)) continue;
          const tries: [number, number][] = [];
          if (i >= 2) tries.push([i - 1, after]);
          if (i + 3 < pts.length) tries.push([i + 1, before]);
          for (const [k, v] of tries) {
            if (!fits(pts, k, !jogHorizontal, v, i, near)) continue;
            setCoord(pts[k]!, !jogHorizontal, v);
            setCoord(pts[k + 1]!, !jogHorizontal, v);
            changed = true;
            break;
          }
        }
        if (!changed) break;
        cur[id] = simplify(pts);
      }
    }
  };

  /** The order (smallest coordinate first) in which the lines of a bundle should take their lanes, from where each leaves and enters it. */
  const laneOrder = (m: LaneSeg[]): number[] => {
    const vote = m.map(() => m.map(() => 0));
    for (let p = 0; p < m.length; p++)
      for (let q = p + 1; q < m.length; q++) {
        const [a, b] = [m[p]!, m[q]!];
        let v = 0;
        // At each end of the overlap the line whose neighbour starts there (the inner one) must be on the side that neighbour goes to.
        if (Math.abs(a.lo - b.lo) > 1e-6) v += a.lo > b.lo ? -a.loDir : b.loDir;
        if (Math.abs(a.hi - b.hi) > 1e-6) v += a.hi < b.hi ? -a.hiDir : b.hiDir;
        vote[p]![q] = v;
        vote[q]![p] = -v;
      }
    const left = m.map((_, k) => k);
    const order: number[] = [];
    while (left.length) {
      // vote[j][k] > 0: j wants a smaller coordinate than k. Take the one that is wanted first by most.
      let best = 0;
      let bestScore = Infinity;
      for (let a = 0; a < left.length; a++) {
        const k = left[a]!;
        let score = 0;
        for (const j of left) if (j !== k) score += Math.sign(vote[k]![j]!) * -1;
        if (score < bestScore - 1e-9) [best, bestScore] = [a, score];
      }
      order.push(left.splice(best, 1)[0]!);
    }
    return order;
  };

  const run = (horizontal: boolean) => {
    const segs = segmentsOf(horizontal);
    // Bundles: union of segments of different lines within the tolerance that overlap.
    const root = segs.map((_, k) => k);
    const find = (k: number): number => (root[k] === k ? k : (root[k] = find(root[k]!)));
    for (let p = 0; p < segs.length; p++)
      for (let q = p + 1; q < segs.length; q++) {
        const [a, b] = [segs[p]!, segs[q]!];
        if (b.coord - a.coord > LANE_TOLERANCE + 1e-6) break;
        if (a.id === b.id) continue;
        if (Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) > LANE_MIN_OVERLAP) root[find(q)] = find(p);
      }
    // Where each route is, so a bundle only looks at the routes and boxes within its reach.
    const bounds: Record<string, Bounds> = {};
    for (const id of Object.keys(cur)) bounds[id] = boundsOf(cur[id]!);
    const bundles = new Map<number, LaneSeg[]>();
    segs.forEach((s, k) => bundles.set(find(k), [...(bundles.get(find(k)) ?? []), s]));
    for (const m of [...bundles.values()].sort((a, b) => a[0]!.coord - b[0]!.coord || (a[0]!.id < b[0]!.id ? -1 : 1))) {
      if (m.length < 2) continue;
      const ids = [...new Set(m.map((s) => s.id))];
      // Only the moved pieces and their two neighbours change, so crossings are counted for those: against the
      // pieces of other lines near them (they move at most m.length * the largest gap), and between the lines of the bundle.
      // Crossings between pieces that do not change are the same for every order and are left out.
      const own = new Set(ids);
      const reach = m.length * Math.max(gap, 8) + 2;
      const changed = new Map<string, Set<number>>();
      for (const s of m) {
        const set = changed.get(s.id) ?? new Set<number>();
        for (const j of [s.i - 1, s.i, s.i + 1]) set.add(j);
        changed.set(s.id, set);
      }
      const cands = new Map<string, [Pt, Pt][]>();
      let nearArea: Bounds | null = null; // where the moved pieces can end up, with room for the clearance to boxes
      for (const id of ids) {
        const pts = cur[id]!;
        const area = growBounds([...changed.get(id)!].map((j) => boundsOf([pts[j]!, pts[j + 1]!])).reduce(unionBounds), reach);
        const around = growBounds(area, LANE_CLEARANCE);
        nearArea = nearArea ? unionBounds(nearArea, around) : around;
        const list: [Pt, Pt][] = [];
        for (const other of Object.keys(cur)) {
          if (own.has(other) || !meets(bounds[other]!, area)) continue;
          const q = cur[other]!;
          for (let j = 0; j + 1 < q.length; j++) if (meets(boundsOf([q[j]!, q[j + 1]!]), area)) list.push([q[j]!, q[j + 1]!]);
        }
        cands.set(id, list);
      }
      const crossings = (routes: Record<string, Pt[]>): number => {
        let n = 0;
        for (const id of ids) {
          const pts = routes[id]!;
          for (const j of changed.get(id)!) for (const [c, d] of cands.get(id)!) if (segCross(pts[j]!, pts[j + 1]!, c, d)) n++;
        }
        for (let x = 0; x < ids.length; x++)
          for (let y = x + 1; y < ids.length; y++) {
            const [pa, pb] = [routes[ids[x]!]!, routes[ids[y]!]!];
            const [ca, cb] = [changed.get(ids[x]!)!, changed.get(ids[y]!)!];
            for (let ja = 0; ja + 1 < pa.length; ja++) for (let jb = 0; jb + 1 < pb.length; jb++) if ((ca.has(ja) || cb.has(jb)) && segCross(pa[ja]!, pa[ja + 1]!, pb[jb]!, pb[jb + 1]!)) n++;
          }
        return n;
      };
      // Boxes close enough to a moved piece to matter.
      const area = nearArea!;
      const near = boxes.filter((r) => boxMeets(r, area));
      const before = crossings(cur);
      const centreCoord = (m[0]!.coord + m[m.length - 1]!.coord) / 2;
      /** The routes of the bundle's lines with the lines taking their lanes in `order` (smallest coordinate first), or null when that does not fit. */
      const spread = (order: number[], g: number): Record<string, Pt[]> | null => {
        const trial: Record<string, Pt[]> = {};
        for (const id of ids) trial[id] = cur[id]!.map((p) => ({ x: p.x, y: p.y }));
        for (let lane = 0; lane < order.length; lane++) {
          const s = m[order[lane]!]!;
          const v = centreCoord + (lane - (m.length - 1) / 2) * g;
          const pts = trial[s.id]!;
          if (!fits(pts, s.i, horizontal, v, -1, near)) return null;
          setCoord(pts[s.i]!, horizontal, v);
          setCoord(pts[s.i + 1]!, horizontal, v);
        }
        return trial;
      };
      for (const g of gap > 8 ? [gap, 8, 6] : [gap, gap - 2, gap - 4].filter((v) => v >= 4)) {
        // The order from the ends of the bundle first; when that adds crossings, the best of all orders (small bundles).
        const best: { trial: Record<string, Pt[]> | null; after: number } = { trial: null, after: Infinity };
        const consider = (order: number[]) => {
          const trial = spread(order, g);
          if (!trial) return;
          const after = crossings(trial);
          if (after < best.after) [best.trial, best.after] = [trial, after];
        };
        consider(laneOrder(m));
        if (best.after > before && m.length <= MAX_PERMUTED) for (const order of permutations(m.length)) consider(order);
        if (!best.trial) continue;
        for (const id of ids) {
          cur[id] = best.trial[id]!;
          bounds[id] = boundsOf(cur[id]!);
        }
        break;
      }
    }
  };

  // Repeated and collinear points go; a route of two points (a line of no length between touching boxes) stays as it is.
  const tidy = (pts: Pt[]) => (pts.length <= 2 ? pts : simplify(pts));
  for (let round = 0; round < 2; round++) {
    straightenJogs();
    run(true);
    for (const id of Object.keys(cur)) cur[id] = tidy(cur[id]!);
    run(false);
    for (const id of Object.keys(cur)) cur[id] = tidy(cur[id]!);
  }
  straightenJogs();
  for (const id of Object.keys(cur)) cur[id] = tidy(cur[id]!);
  return cur;
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
/** Score per px of another line inside a label: 8 moves labels off lines (11 of 27 crossed in the demo, 15 at 2) while the median move from the default place stays 25px. */
const LINE_WEIGHT = 8;
/** Spacing of the extra candidate places along a line. */
const LABEL_STEP = 20;

function polylineLength(pts: Pt[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  return total;
}

/** The point at fraction `t` of the polyline's length (the same measure as `defaultLabelT` and the canvas use). */
export function pointAtT(pts: Pt[], t: number): Pt {
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

/** Total length of the parts of a polyline's axis-aligned segments that lie strictly inside a rectangle. */
function lengthInside(pts: Pt[], r: Box): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if (a.y === b.y) {
      if (a.y > r.y && a.y < r.y + r.h) total += Math.max(0, Math.min(Math.max(a.x, b.x), r.x + r.w) - Math.max(Math.min(a.x, b.x), r.x));
    } else if (a.x === b.x) {
      if (a.x > r.x && a.x < r.x + r.w) total += Math.max(0, Math.min(Math.max(a.y, b.y), r.y + r.h) - Math.max(Math.min(a.y, b.y), r.y));
    }
  }
  return total;
}

export const labelBox = (p: Pt, size: { w: number; h: number }): Box => ({ x: p.x - size.w / 2, y: p.y - size.h / 2, w: size.w, h: size.h });

/**
 * Choose where each line's label sits (as t along its route, the value `labelT` has) so labels
 * stay off each other and off the boxes where there is room.
 *
 * Items with `fixedT` keep it and still count as obstacles for the rest. For the others the
 * candidates are 0.5, 0.3 and 0.7 of every segment (and 0.15, 0.85 on long ones), longest segment
 * first, clamped to 0.05..0.95; the label is centred on the point. The score is 10 x the area
 * shared with labels already placed, plus 4 x the area shared with boxes, plus 8 x the length of other
 * lines inside the label (`lines`: every route, the label's own line does not count), plus 0.5 per pixel of
 * distance from the default place (the middle of the longest segment); the lowest score wins, the
 * first candidate on a tie. Lines are placed longest route first, then by id, so the result does
 * not depend on the order of `items`. Lines that already have a clear default place keep it.
 */
export function placeLabels(items: LabelItem[], boxes: Box[], lines: { id: string; pts: Pt[] }[] = []): Record<string, number> {
  const out: Record<string, number> = {};
  const placed: Box[] = [];
  const clampT = (t: number) => Math.min(LABEL_T_MAX, Math.max(LABEL_T_MIN, t));
  for (const it of items) {
    if (it.fixedT === undefined) continue;
    const t = clampT(it.fixedT);
    out[it.id] = t;
    placed.push(labelBox(pointAtT(it.pts, t), it.size));
  }
  // Where each line is, so a label only looks at the boxes and lines near its own line (a label sits on it).
  const lineBounds = lines.map((l) => boundsOf(l.pts));
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
    // Then places every LABEL_STEP px along the line, for crowded diagrams where the fixed places are all crossed.
    for (let d = LABEL_STEP / 2; d < total; d += LABEL_STEP) cands.push(d / total);
    let best = { t: dflt, score: Infinity };
    const seen = new Set<number>();
    const reach = growBounds(boundsOf(it.pts), Math.max(it.size.w, it.size.h));
    const nearBoxes = boxes.filter((b) => boxMeets(b, reach));
    const nearLines = lines.map((l, k) => ({ l, b: lineBounds[k]! })).filter(({ l, b }) => l.id !== it.id && meets(b, reach));
    for (const c of cands) {
      const t = clampT(c);
      const key = Math.round(t * 1000);
      if (seen.has(key)) continue;
      seen.add(key);
      const p = pointAtT(it.pts, t);
      const r = labelBox(p, it.size);
      let score = 0.5 * Math.hypot(p.x - home.x, p.y - home.y);
      for (const o of placed) score += 10 * overlapArea(r, o);
      for (const b of nearBoxes) score += 4 * overlapArea(r, b);
      const rb: Bounds = [r.x, r.y, r.x + r.w, r.y + r.h];
      for (const { l, b } of nearLines) if (meets(b, rb)) score += LINE_WEIGHT * lengthInside(l.pts, r);
      if (score < best.score - 1e-9) best = { t, score };
    }
    out[it.id] = best.t;
    placed.push(labelBox(pointAtT(it.pts, best.t), it.size));
  }
  return out;
}

// ------------------------------------------------------------------ near-straight lines and hand-set routes

/**
 * A line this close (px) to straight is made straight: a shorter jog between two parallel pieces goes away, and a
 * dragged piece, end or bend point that comes this close to lining up snaps into line.
 */
export const STRAIGHT_TOLERANCE = 8;
/** A straight line (or a piece of one) within this many degrees of horizontal or vertical is made exactly so when it is dropped. */
export const STRAIGHT_DEGREES = 2;
/** Two pieces of different lines are not brought closer than this by straightening (the smallest lane gap). */
const LINE_KEEP_APART = 6;

/** One end of a route: its box and the side the line leaves from. `fixed`: the port stays (a hand-set anchor); `others`: where the other line ends on that side are (along the side). */
export interface RouteEnd {
  box: Box;
  side: Side;
  fixed?: boolean;
  others?: number[];
}

export interface JogOptions {
  /** Jogs shorter than this go (default STRAIGHT_TOLERANCE). */
  tolerance?: number;
  /** Boxes a moved piece must not cut through (nor come closer to than 5px, or than it was). The line's own boxes may be in the list. */
  obstacles?: Box[];
  /** The ends: without one, that end piece never moves. */
  source?: RouteEnd;
  target?: RouteEnd;
  /** Routes of other lines: a moved piece does not come closer to a parallel piece of one of them than 6px (or than it was). */
  avoid?: Pt[][];
  /** False: only the end pieces may move (by sliding their port along its side); inner pieces stay. */
  moveInner?: boolean;
}

/** Whether a port at `cur` (along its side) may slide to `v`: not a fixed end, inside the corner margins (or no further out than it was), and in the same order as the other ends on that side, no closer to them than MIN_GAP (or than it was). */
function canSlide(end: RouteEnd, cur: number, v: number): boolean {
  if (end.fixed) return false;
  const [lo, hi] = innerRange(end.box, end.side);
  const outside = (x: number) => Math.max(lo - x, x - hi, 0);
  if (outside(v) > outside(cur) + 1e-6) return false;
  for (const q of end.others ?? []) {
    if (Math.sign(v - q) !== Math.sign(cur - q)) return false;
    if (Math.abs(v - q) < Math.min(MIN_GAP, Math.abs(cur - q)) - 1e-6) return false;
  }
  return true;
}

/** Whether moving piece `k` of a right-angle route (horizontal or not) to coordinate `v` keeps it and its neighbours clear of boxes and other lines; the neighbour that is not `jog` keeps its direction. */
function canMovePiece(pts: Pt[], k: number, horizontal: boolean, v: number, jog: number, obstacles: Box[], avoid: Pt[][]): boolean {
  const moved = (j: number): Pt => (j === k || j === k + 1 ? (horizontal ? { x: pts[j]!.x, y: v } : { x: v, y: pts[j]!.y }) : pts[j]!);
  for (const j of [k - 1, k, k + 1]) {
    if (j < 0 || j + 1 >= pts.length) continue;
    const [oa, ob, na, nb] = [pts[j]!, pts[j + 1]!, moved(j), moved(j + 1)];
    for (const r of obstacles) {
      if (hits(na, nb, r) && !hits(oa, ob, r)) return false;
      if (segClearance(na, nb, r) < Math.min(LANE_CLEARANCE, segClearance(oa, ob, r)) - 1e-6) return false;
    }
    if (j !== k && j !== jog) {
      const [o, w] = horizontal ? [ob.y - oa.y, nb.y - na.y] : [ob.x - oa.x, nb.x - na.x];
      if (Math.sign(o) !== Math.sign(w) || Math.abs(w) < 1e-6) return false;
    }
  }
  const [a, b] = [pts[k]!, pts[k + 1]!];
  const old = horizontal ? a.y : a.x;
  const lo = Math.min(horizontal ? a.x : a.y, horizontal ? b.x : b.y);
  const hi = Math.max(horizontal ? a.x : a.y, horizontal ? b.x : b.y);
  for (const route of avoid) {
    for (let j = 0; j + 1 < route.length; j++) {
      const [c, d] = [route[j]!, route[j + 1]!];
      if (horizontal ? Math.abs(c.y - d.y) > 1e-6 : Math.abs(c.x - d.x) > 1e-6) continue;
      const overlap = Math.min(hi, Math.max(horizontal ? c.x : c.y, horizontal ? d.x : d.y)) - Math.max(lo, Math.min(horizontal ? c.x : c.y, horizontal ? d.x : d.y));
      if (overlap <= LANE_MIN_OVERLAP) continue;
      const at = horizontal ? c.y : c.x;
      if (Math.abs(at - v) < Math.min(LINE_KEEP_APART, Math.abs(at - old)) - 1e-6) return false;
    }
  }
  return true;
}

/**
 * Make a right-angle route straight where it is only a few px from straight: a jog (a piece shorter than the
 * tolerance between two parallel pieces that go the same way) goes away when one of those two pieces can slide onto
 * the other's line. An inner piece is moved rather than an end piece. An end piece moves only by sliding its port
 * along its box side: never a fixed end, inside the corner margins of the side, and keeping the order of (and
 * MIN_GAP from) the other line ends on that side. A moved piece and the pieces next to it must not cut through a box
 * or come closer to one than 5px (or than they were), nor come closer than 6px to a parallel piece of another line in
 * `avoid` (or than they were): a jog that cannot go without that stays. Repeated and collinear points are dropped after.
 * Pure: returns a new route.
 */
export function straightenJogs(pts: Pt[], opts: JogOptions = {}): Pt[] {
  const tol = opts.tolerance ?? STRAIGHT_TOLERANCE;
  const obstacles = opts.obstacles ?? [];
  const avoid = opts.avoid ?? [];
  let cur = pts.map((p) => ({ x: p.x, y: p.y }));
  for (let pass = 0; pass < 8 && cur.length >= 4; pass++) {
    const n = cur.length;
    let changed = false;
    for (let i = 1; i + 2 < n && !changed; i++) {
      const [p0, a, b, p3] = [cur[i - 1]!, cur[i]!, cur[i + 1]!, cur[i + 2]!];
      const jogH = Math.abs(a.y - b.y) < 1e-6;
      if (!jogH && Math.abs(a.x - b.x) > 1e-6) continue; // not a right-angle piece
      const len = jogH ? Math.abs(a.x - b.x) : Math.abs(a.y - b.y);
      if (len < 1e-6 || len >= tol) continue;
      // Both neighbours run across the jog, the same way (a U is not a jog).
      const across = (p: Pt, q: Pt) => (jogH ? Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) > 1e-6 : Math.abs(p.y - q.y) < 1e-6 && Math.abs(p.x - q.x) > 1e-6);
      if (!across(p0, a) || !across(b, p3)) continue;
      if (jogH ? Math.sign(a.y - p0.y) !== Math.sign(p3.y - b.y) : Math.sign(a.x - p0.x) !== Math.sign(p3.x - b.x)) continue;
      const pieceH = !jogH;
      const isEnd = (k: number) => k === 0 || k === n - 2;
      const tries = [
        { k: i - 1, v: jogH ? b.x : b.y },
        { k: i + 1, v: jogH ? a.x : a.y },
      ].sort((p, q) => Number(isEnd(p.k)) - Number(isEnd(q.k)));
      for (const { k, v } of tries) {
        if (isEnd(k)) {
          const end = k === 0 ? opts.source : opts.target;
          if (!end || horizontalSide(end.side) !== pieceH) continue;
          if (!canSlide(end, along(k === 0 ? cur[0]! : cur[n - 1]!, end.side), v)) continue;
        } else if (opts.moveInner === false) continue;
        if (!canMovePiece(cur, k, pieceH, v, i, obstacles, avoid)) continue;
        for (const j of [k, k + 1]) {
          if (pieceH) cur[j]!.y = v;
          else cur[j]!.x = v;
        }
        changed = true;
        break;
      }
    }
    if (!changed) break;
    cur = simplify(cur);
  }
  return cur;
}

/** Whether a right-angle route has a jog shorter than `tol` (a cheap test before straightenJogs). */
export function hasJog(pts: Pt[], tol = STRAIGHT_TOLERANCE): boolean {
  for (let i = 1; i + 2 < pts.length; i++) {
    const len = Math.abs(pts[i]!.x - pts[i + 1]!.x) + Math.abs(pts[i]!.y - pts[i + 1]!.y);
    if (len > 1e-6 && len < tol) return true;
  }
  return false;
}

/** Repeated points and points in the middle of a straight run dropped (a route of two points stays as it is). */
export function tidyRoute(pts: Pt[]): Pt[] {
  return pts.length <= 2 ? pts.map((p) => ({ x: p.x, y: p.y })) : simplify(pts);
}

/**
 * Move piece `i` of a right-angle route (between `pts[i]` and `pts[i+1]`) to the pointer `to`: a horizontal piece moves
 * up or down, a vertical one left or right, and the pieces next to it stretch. The new place snaps to another piece of
 * the same route, to the middle of either box or to a line end when it is within `tolerance` (STRAIGHT_TOLERANCE).
 * An end piece slides its port along the box side while the port stays inside the corner margins (and the end is not
 * `fixed`); otherwise the port stays and an elbow is added next to the box (a short piece out of the box, then across),
 * so the line still leaves square to its side. Pure: returns the new route (not tidied, so the pieces keep their numbers
 * while dragging); a piece that is not horizontal or vertical, or an index out of range, gives the route unchanged.
 */
export function moveSegment(pts: Pt[], i: number, to: Pt, opts: { source?: RouteEnd; target?: RouteEnd; tolerance?: number } = {}): Pt[] {
  const out = pts.map((p) => ({ x: p.x, y: p.y }));
  const n = pts.length;
  if (i < 0 || i + 1 >= n) return out;
  const [a, b] = [pts[i]!, pts[i + 1]!];
  const horizontal = Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.x - b.x) > 1e-6;
  const vertical = Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) > 1e-6;
  if (!horizontal && !vertical) return out;
  const coord = (p: Pt) => (horizontal ? p.y : p.x);
  const tol = opts.tolerance ?? STRAIGHT_TOLERANCE;
  let v = horizontal ? to.y : to.x;
  // Snap onto a parallel piece of the same route, the middle of a box or a line end.
  const targets: number[] = [];
  for (let j = 0; j + 1 < n; j++) {
    if (j === i) continue;
    const [c, d] = [pts[j]!, pts[j + 1]!];
    if (horizontal ? Math.abs(c.y - d.y) < 1e-6 : Math.abs(c.x - d.x) < 1e-6) targets.push(coord(c));
  }
  targets.push(coord(pts[0]!), coord(pts[n - 1]!));
  for (const e of [opts.source, opts.target]) if (e) targets.push(coord(centre(e.box)));
  let best = tol + 1e-9;
  for (const c of targets) if (Math.abs(c - v) < best) [best, v] = [Math.abs(c - v), c];
  if (best > tol) v = horizontal ? to.y : to.x;

  const set = (p: Pt, c: number) => {
    if (horizontal) p.y = c;
    else p.x = c;
  };
  set(out[i]!, v);
  set(out[i + 1]!, v);
  /** The port of one end stays and an elbow next to the box takes the line across to the moved piece. */
  const elbow = (port: Pt, next: Pt, end: RouteEnd | undefined): Pt[] => {
    const len = Math.hypot(next.x - port.x, next.y - port.y);
    const dir = end ? DIRS[end.side] : { x: Math.sign(next.x - port.x), y: Math.sign(next.y - port.y) };
    const k = Math.min(STUB, len / 2);
    const s = { x: port.x + dir.x * k, y: port.y + dir.y * k };
    const s2 = { ...s };
    set(s2, v);
    return [s, s2];
  };
  const slides = (end: RouteEnd | undefined, port: Pt) => {
    if (!end || end.fixed || horizontalSide(end.side) !== horizontal) return false;
    const [lo, hi] = innerRange(end.box, end.side);
    const cur = along(port, end.side);
    const outside = (x: number) => Math.max(lo - x, x - hi, 0);
    return outside(v) <= Math.max(outside(cur), 0) + 1e-6;
  };
  let result = out;
  if (i === n - 2 && !slides(opts.target, pts[n - 1]!)) {
    const [s, s2] = elbow(pts[n - 1]!, pts[n - 2]!, opts.target);
    result = [...result.slice(0, n - 1), s2!, s!, { ...pts[n - 1]! }];
  }
  if (i === 0 && !slides(opts.source, pts[0]!)) {
    const [s, s2] = elbow(pts[0]!, pts[1]!, opts.source);
    result = [{ ...pts[0]! }, s!, s2!, ...result.slice(1)];
  }
  return result;
}

/**
 * Where one end of a line with hand-set points meets its box, given the first point `p` after it: the port and any
 * elbow between them, so the line leaves square to the side. A hand-set anchor is kept; else, when `p` is straight out
 * from a side (within its length, a little away from the corners), the port is right across from it; else the side
 * facing `p` is used, with the port as close to `p` as the corner margins allow, and an elbow.
 */
function attach(box: Box, p: Pt, anchor?: Pt): { port: Port; extra: Pt[] } {
  let side: Side;
  let at: Pt;
  if (anchor) {
    side = sideOfAnchor(anchor);
    at = pointOnFraction(box, anchor);
  } else {
    const straight = SIDES.find((s) => {
      const out = s === "right" ? p.x - (box.x + box.w) : s === "left" ? box.x - p.x : s === "bottom" ? p.y - (box.y + box.h) : box.y - p.y;
      if (out <= 1e-6) return false;
      const c = along(p, s);
      const st = sideStart(box, s);
      const inset = Math.min(SQUEEZE_INSET, sideLength(box, s) / 2);
      return c >= st + inset - 1e-6 && c <= st + sideLength(box, s) - inset + 1e-6;
    });
    side = straight ?? sideFacingPoint(box, p);
    const [lo, hi] = innerRange(box, side);
    const c = straight ? along(p, side) : Math.min(Math.max(along(p, side), lo), hi);
    at = pointOnSide(box, side, c - sideStart(box, side));
  }
  const port: Port = { x: at.x, y: at.y, side };
  const d = DIRS[side];
  const out = (p.x - at.x) * d.x + (p.y - at.y) * d.y; // how far `p` lies out from the side
  if (Math.abs(along(p, side) - along(at, side)) < 1e-6 && out > 1e-6) return { port, extra: [] };
  if (out > 1e-6) return { port, extra: [horizontalSide(side) ? { x: p.x, y: at.y } : { x: at.x, y: p.y }] };
  // `p` is beside or behind the side (a hand-set anchor): a short piece out of the box, then across.
  const s = { x: at.x + d.x * STUB, y: at.y + d.y * STUB };
  return { port, extra: [s, horizontalSide(side) ? { x: s.x, y: p.y } : { x: p.x, y: s.y }] };
}

/**
 * The route of a right-angle line through its hand-set `points` (the inner corners, canvas units). Consecutive points
 * that are not in line are joined with an elbow (across first). Each end is joined square to its box (see `attach`), so
 * when a box has moved the end re-attaches, with an elbow where needed. Null when there are no points or one lies inside
 * either box (the caller routes the line automatically then).
 */
export function routeThrough(srcBox: Box, dstBox: Box, points: Pt[] | undefined, srcAnchor?: Pt, dstAnchor?: Pt): { pts: Pt[]; source: Port; target: Port } | null {
  if (!points?.length) return null;
  const inside = (b: Box, p: Pt) => p.x > b.x + 1e-6 && p.x < b.x + b.w - 1e-6 && p.y > b.y + 1e-6 && p.y < b.y + b.h - 1e-6;
  if (points.some((p) => inside(srcBox, p) || inside(dstBox, p))) return null;
  const chain: Pt[] = [{ x: points[0]!.x, y: points[0]!.y }];
  for (const q of points.slice(1)) {
    const last = chain[chain.length - 1]!;
    if (Math.abs(last.x - q.x) > 1e-6 && Math.abs(last.y - q.y) > 1e-6) chain.push({ x: q.x, y: last.y });
    chain.push({ x: q.x, y: q.y });
  }
  const s = attach(srcBox, chain[0]!, srcAnchor);
  const t = attach(dstBox, chain[chain.length - 1]!, dstAnchor);
  const pts = simplify([{ x: s.port.x, y: s.port.y }, ...s.extra, ...chain, ...[...t.extra].reverse(), { x: t.port.x, y: t.port.y }]);
  return { pts, source: s.port, target: t.port };
}

/** `p` moved so the line from `q` to it is exactly horizontal or vertical when it is within `deg` degrees of that (else `p`). */
export function snapAxis(p: Pt, q: Pt, deg = STRAIGHT_DEGREES): Pt {
  const dx = Math.abs(p.x - q.x);
  const dy = Math.abs(p.y - q.y);
  if (dx < 1e-9 && dy < 1e-9) return { ...p };
  const angle = (Math.atan2(Math.min(dx, dy), Math.max(dx, dy)) * 180) / Math.PI;
  if (angle > deg) return { ...p };
  return dx >= dy ? { x: p.x, y: q.y } : { x: q.x, y: p.y };
}

/**
 * Where a piece's handle goes: the middle of the piece, unless the line's label sits there (a label is placed on its line,
 * often at a piece's middle). Then the handle slides along the piece to just outside the label, so the label stays
 * clickable and double-clickable; null when the label covers the piece.
 */
export function handleBesideLabel(a: Pt, b: Pt, label: { x: number; y: number; w: number; h: number }, pad = 8): Pt | null {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const [x0, x1, y0, y1] = [label.x - label.w / 2 - pad, label.x + label.w / 2 + pad, label.y - label.h / 2 - pad, label.y + label.h / 2 + pad];
  if (mid.x < x0 || mid.x > x1 || mid.y < y0 || mid.y > y1) return mid;
  const horizontal = Math.abs(a.y - b.y) < 1e-6;
  const [lo, hi] = horizontal ? [Math.min(a.x, b.x) + 6, Math.max(a.x, b.x) - 6] : [Math.min(a.y, b.y) + 6, Math.max(a.y, b.y) - 6];
  const along = horizontal ? mid.x : mid.y;
  const options = (horizontal ? [x0, x1] : [y0, y1]).filter((v) => v >= lo && v <= hi).sort((p, q) => Math.abs(p - along) - Math.abs(q - along));
  if (!options.length) return null;
  return horizontal ? { x: options[0]!, y: mid.y } : { x: mid.x, y: options[0]! };
}
