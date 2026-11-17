/**
 * Making room between boxes: a pure function from box rectangles to new top-left positions.
 *
 * Two actions use it. "Make room" widens only the gaps that are too tight and leaves
 * well-spaced parts alone (factor 1). "Spread out" does the same and also grows every gap
 * by a factor (for example 1.2).
 *
 * How it works. Each axis is handled on its own (x first, then y on the result) as a monotone
 * stretch of that axis applied to box centres:
 *   1. Centres that lie within ALIGN px of each other form one cluster (a column or a row).
 *      A cluster moves as a unit, so boxes that were lined up stay lined up.
 *   2. Two boxes are neighbours on an axis when one lies after the other on it and their
 *      extents on the other axis overlap or come within `crossTol`. A neighbour pair must
 *      end up with centre distance >= half the two sizes + `need`, where `need` is the base
 *      gap plus what lies in the gap (line lanes, labels) plus clearance for a boundary.
 *      Pairs that already meet it add nothing by themselves. A pair is skipped when another
 *      neighbour box sits between the two (the chain through that box covers it).
 *   3. Sweeping the clusters in order gives each a displacement D (a whole number of pixels,
 *      never negative, never decreasing): D[k] is the largest of "D[k-1] plus the extra
 *      spacing asked for by `factor`" and "D[j] plus the shortfall" over the pairs that end
 *      in cluster k. Because every box is only displaced by its cluster's D, the order
 *      never changes, alignment is exact, sizes are untouched and no distance shrinks.
 *   4. The result is shifted so the top-left corner of the bounding box of all boxes stays
 *      where it was (nothing jumps on screen at the corner the viewer is anchored to). With
 *      `anchor: "centre"` the centre of that bounding box stays where it was instead (used when
 *      only some boxes are spread: the group grows around its middle). With `fixed` boxes the shift
 *      is the one that keeps the first fixed box where it was, and every fixed box is put back at the end.
 *   0. Before all that, boxes whose centres coincide on both axes (within ALIGN) are pulled apart along x (see
 *      splitCoincident), because a cluster moves as a unit and could never separate them.
 *
 * Whole-pixel displacements keep integer positions integer, so a second "Make room" on the
 * result finds nothing to do (as long as the lanes and labels it is given do not change).
 *
 * No imports: the small types are defined here.
 */

export type Pt = { x: number; y: number };
/** x, y = top-left corner. */
export type Box = { id: string; x: number; y: number; w: number; h: number };
export type Rect = { x: number; y: number; w: number; h: number };

export interface SpreadInput {
  boxes: Box[];
  /** Line routes (polylines) of the current layout; their segments crossing a gap are counted as lanes. */
  routes?: Pt[][];
  /** Label rectangles of the current layout; labels centred in a gap make it wider. */
  labels?: Rect[];
  /** Ids of the boxes inside the diagram's boundary (drawn around them with padding and a title on top). */
  grouped?: Set<string> | string[];
}

export interface SpreadOptions {
  /** Growth of every gap (centre distance between neighbouring columns/rows). 1 = only make room. Values below 1 count as 1. */
  factor?: number;
  /** Minimum empty space between two neighbouring boxes (the app's GAP). */
  base?: number;
  /** Space per line running through a gap. */
  laneSpacing?: number;
  /** How far apart on the other axis two boxes may be and still count as neighbours. */
  crossTol?: number;
  /** Clearance between the boundary and an outside box. */
  boundaryPad?: number;
  /** Extra clearance on the side where the boundary's title sits (the top), on the y axis. */
  boundaryHeader?: number;
  /** Which point of the bounding box of all boxes stays where it was: its top-left corner (default) or its centre. */
  anchor?: "topLeft" | "centre";
  /**
   * Ids of boxes that must not move (for example boxes that cannot be saved): they end where they began, and the others
   * make room around them (the whole layout is shifted instead of the fixed box). When fixed boxes would need different
   * shifts on one axis (they are too close to each other for everything in between), the first fixed one on that axis
   * decides and the others are put back, so their neighbours may then be closer than asked.
   */
  fixed?: Iterable<string>;
}

interface Resolved {
  factor: number;
  base: number;
  laneSpacing: number;
  crossTol: number;
  boundaryPad: number;
  boundaryHeader: number;
}

/** Centres within this many px on an axis count as lined up. */
const ALIGN = 8;
/** Space added around the largest label in a gap. */
const LABEL_PAD = 16;
const EPS = 1e-6;
/** Most passes over both axes (each only ever adds space, so it settles after a few). */
const MAX_ROUNDS = 8;

type Axis = 0 | 1;

/** A segment running along one axis, seen from the other: position across the gap and extent along it. */
interface Lane {
  p: number;
  lo: number;
  hi: number;
}

interface Model {
  n: number;
  ids: string[];
  /** Top-left per axis (0 = x, 1 = y). */
  lo: [number[], number[]];
  size: [number[], number[]];
  inGroup: boolean[];
  isFixed: boolean[];
  /** lanes[ax]: segments that cross a gap measured along ax (they run along the other axis). */
  lanes: [Lane[], Lane[]];
  /** Label centres and sizes. */
  labelC: [number[], number[]];
  labelS: [number[], number[]];
}

interface Pair {
  a: number;
  b: number;
  /** How many px the centre distance falls short of what is required (> 0). */
  deficit: number;
}

function resolve(o: SpreadOptions | undefined): Resolved {
  return {
    factor: Math.max(1, o?.factor ?? 1),
    base: o?.base ?? 50,
    laneSpacing: o?.laneSpacing ?? 12,
    crossTol: o?.crossTol ?? 40,
    boundaryPad: o?.boundaryPad ?? 40,
    boundaryHeader: o?.boundaryHeader ?? 40,
  };
}

function buildModel(input: SpreadInput, fixed?: Iterable<string>): Model {
  const boxes = input.boxes;
  const pinned = new Set(fixed ?? []);
  const grouped = input.grouped instanceof Set ? input.grouped : new Set(input.grouped ?? []);
  const lanes: [Lane[], Lane[]] = [[], []];
  for (const route of input.routes ?? []) {
    for (let i = 1; i < route.length; i++) {
      const p = route[i - 1];
      const q = route[i];
      const dx = Math.abs(q!.x - p!.x);
      const dy = Math.abs(q!.y - p!.y);
      // a segment that mostly runs along y crosses gaps measured along x, and the other way round
      if (dy > 0 && dy >= dx) lanes[0].push({ p: (p!.x + q!.x) / 2, lo: Math.min(p!.y, q!.y), hi: Math.max(p!.y, q!.y) });
      if (dx > 0 && dx > dy) lanes[1].push({ p: (p!.y + q!.y) / 2, lo: Math.min(p!.x, q!.x), hi: Math.max(p!.x, q!.x) });
    }
  }
  const labels = input.labels ?? [];
  return {
    n: boxes.length,
    ids: boxes.map((b) => b.id),
    lo: [boxes.map((b) => b.x), boxes.map((b) => b.y)],
    size: [boxes.map((b) => b.w), boxes.map((b) => b.h)],
    inGroup: boxes.map((b) => grouped.has(b.id)),
    isFixed: boxes.map((b) => pinned.has(b.id)),
    lanes,
    labelC: [labels.map((l) => l.x + l.w / 2), labels.map((l) => l.y + l.h / 2)],
    labelS: [labels.map((l) => l.w), labels.map((l) => l.h)],
  };
}

/**
 * Boxes whose centres are within ALIGN of each other on both axes are in one cluster on both axes and would never be
 * separated. For each such pair the right one (smaller centre x first, then smaller id, so the order they already have is
 * kept) and every box after it in that order move right until the pair is just past ALIGN apart; the x pass then spaces
 * them. Moving the whole tail keeps the order and every distance between the other boxes. Fixed boxes do not move: if the
 * right one is fixed, the left one and every box before it move left instead; a pair of fixed boxes is left as it is.
 */
function splitCoincident(m: Model): void {
  const cx = (i: number) => m.lo[0][i]! + m.size[0][i]! / 2;
  const cy = (i: number) => m.lo[1][i]! + m.size[1][i]! / 2;
  /** Whether box i comes before box j in the order along x (centre, then id). */
  const before = (i: number, j: number) => cx(i) < cx(j) || (cx(i) === cx(j) && m.ids[i]! < m.ids[j]!);
  const order = m.ids.map((_, i) => i).sort((i, j) => (m.ids[i]! < m.ids[j]! ? -1 : m.ids[i]! > m.ids[j]! ? 1 : i - j));
  const done: number[] = [];
  for (const i of order) {
    for (let guard = 0; guard < m.n + 1; guard++) {
      const other = done.find((j) => Math.abs(cx(i) - cx(j)) <= ALIGN && Math.abs(cy(i) - cy(j)) <= ALIGN);
      if (other === undefined) break;
      const [l, r] = before(i, other) ? [i, other] : [other, i];
      const by = Math.ceil(cx(l) + ALIGN + 1 - cx(r));
      if (!m.isFixed[r]) {
        const tail = m.ids.map((_, j) => j).filter((j) => !m.isFixed[j] && (j === r || !before(j, r)));
        for (const j of tail) m.lo[0][j]! += by;
      } else if (!m.isFixed[l]) {
        const head = m.ids.map((_, j) => j).filter((j) => !m.isFixed[j] && (j === l || before(j, l)));
        for (const j of head) m.lo[0][j]! -= by;
      } else break;
    }
    done.push(i);
  }
}

/** Clusters of centres (sorted, then cut when a centre is more than ALIGN past the cluster's first). Cluster ids and means are in increasing order. */
function cluster(cs: number[]): { cl: number[]; mean: number[] } {
  const order = cs.map((_, i) => i).sort((i, j) => cs[i]! - cs[j]! || i - j);
  const cl = new Array<number>(cs.length).fill(0);
  const mean: number[] = [];
  let first = 0;
  let sum = 0;
  let count = 0;
  let k = -1;
  for (const i of order) {
    if (k < 0 || cs[i]! - first > ALIGN) {
      if (k >= 0) mean.push(sum / count);
      k++;
      first = cs[i]!;
      sum = 0;
      count = 0;
    }
    cl[i] = k;
    sum += cs[i]!;
    count++;
  }
  if (k >= 0) mean.push(sum / count);
  return { cl, mean };
}

function centres(m: Model, ax: Axis): number[] {
  return m.lo[ax].map((v, i) => v + m.size[ax][i]! / 2);
}

/** Space between two boxes' extents on an axis; negative = they overlap. */
function gapOn(m: Model, i: number, j: number, ax: Axis): number {
  return Math.max(m.lo[ax][i]!, m.lo[ax][j]!) - Math.min(m.lo[ax][i]! + m.size[ax][i]!, m.lo[ax][j]! + m.size[ax][j]!);
}

/** How far apart on the cross axis two boxes may be and still be neighbours: wider when exactly one is in the boundary (its drawn outline sticks out). */
function tolerance(m: Model, i: number, j: number, o: Resolved): number {
  return o.crossTol + (m.inGroup[i] !== m.inGroup[j] ? o.boundaryPad : 0);
}

/** What the gap between a (earlier on `ax`) and b must hold besides the boxes themselves: base gap, lanes, labels, boundary clearance. */
function needBetween(m: Model, a: number, b: number, ax: Axis, o: Resolved): number {
  const ot: Axis = ax === 0 ? 1 : 0;
  let need = o.base;
  const gapLo = m.lo[ax][a]! + m.size[ax][a]!;
  const gapHi = m.lo[ax][b];
  if (gapHi! > gapLo) {
    // the cross range the gap is "seen" over: where the boxes overlap, or the space between them if they do not
    let cLo = Math.max(m.lo[ot][a]!, m.lo[ot][b]!);
    let cHi = Math.min(m.lo[ot][a]! + m.size[ot][a]!, m.lo[ot][b]! + m.size[ot][b]!);
    if (cLo > cHi) [cLo, cHi] = [cHi, cLo];
    let lanes = 0;
    for (const s of m.lanes[ax]) if (s.p > gapLo && s.p < gapHi! && s.lo < cHi && s.hi > cLo) lanes++;
    need += lanes * o.laneSpacing;
    let label = 0;
    for (let l = 0; l < m.labelC[ax].length; l++) {
      const c = m.labelC[ax][l];
      const d = m.labelC[ot][l];
      if (c! > gapLo && c! < gapHi! && d! >= cLo && d! <= cHi) label = Math.max(label, m.labelS[ax][l]!);
    }
    if (label > 0) need += label + LABEL_PAD;
  }
  if (m.inGroup[a] !== m.inGroup[b]) {
    need += o.boundaryPad;
    // the boundary's title sits at its top: an outside box above it needs room for the title too
    if (ax === 1 && !m.inGroup[a]) need += o.boundaryHeader;
  }
  return need;
}

/** The neighbour pairs on an axis that fall short of their required distance, with the shortfall. */
function shortPairs(m: Model, ax: Axis, o: Resolved, cla: number[], clo: number[], cs: number[], co: number[]): Pair[] {
  const ot: Axis = ax === 0 ? 1 : 0;
  const out: Pair[] = [];
  for (let i = 0; i < m.n; i++) {
    for (let j = i + 1; j < m.n; j++) {
      if (cla[i] === cla[j]) continue; // lined up on this axis: nothing to put between them here
      const gapB = gapOn(m, i, j, ot);
      if (gapB > tolerance(m, i, j, o)) continue;
      const gapA = gapOn(m, i, j, ax);
      if (gapA < 0) {
        if (gapB >= 0) continue; // side by side on the other axis: that axis separates them
        // overlapping on both axes: separate along the axis where the centres are further apart (tie: x),
        // or along this one if the other has them lined up
        const dA = Math.abs(cs[i]! - cs[j]!);
        const dB = Math.abs(co[i]! - co[j]!);
        const chosen: Axis = dA > dB ? ax : dB > dA ? ot : 0;
        if (chosen !== ax && clo[i] !== clo[j]) continue;
      }
      const a = cla[i]! < cla[j]! ? i : j;
      const b = a === i ? j : i;
      const deficit = (m.size[ax][a]! + m.size[ax][b]!) / 2 + needBetween(m, a, b, ax, o) - (cs[b]! - cs[a]!);
      if (deficit <= EPS) continue;
      // a neighbour box between them already separates them through the chain a - k - b
      let cLo = Math.max(m.lo[ot][a]!, m.lo[ot][b]!);
      let cHi = Math.min(m.lo[ot][a]! + m.size[ot][a]!, m.lo[ot][b]! + m.size[ot][b]!);
      if (cLo > cHi) [cLo, cHi] = [cHi, cLo];
      let blocked = false;
      for (let k = 0; k < m.n && !blocked; k++) {
        if (cla[k]! <= cla[a]! || cla[k]! >= cla[b]!) continue;
        if (gapOn(m, a, k, ot) > tolerance(m, a, k, o) || gapOn(m, k, b, ot) > tolerance(m, k, b, o)) continue;
        blocked = m.lo[ot][k]! <= cHi && m.lo[ot][k]! + m.size[ot][k]! >= cLo;
      }
      if (!blocked) out.push({ a, b, deficit });
    }
  }
  return out;
}

function pairsFor(m: Model, ax: Axis, o: Resolved) {
  const ot: Axis = ax === 0 ? 1 : 0;
  const cs = centres(m, ax);
  const co = centres(m, ot);
  const ca = cluster(cs);
  const co2 = cluster(co);
  return { pairs: shortPairs(m, ax, o, ca.cl, co2.cl, cs, co), ca };
}

/** Stretches one axis in place: moves the boxes by whole-pixel displacements, then anchors the bounding box's low edge. */
function stretchAxis(m: Model, ax: Axis, o: Resolved): boolean {
  const { pairs, ca } = pairsFor(m, ax, o);
  const k = ca.mean.length;
  const into: { from: number; by: number }[][] = Array.from({ length: k }, () => []);
  for (const p of pairs) into[ca.cl[p.b]!]!.push({ from: ca.cl[p.a]!, by: Math.ceil(p.deficit - EPS) });
  const d = new Array<number>(k).fill(0);
  for (let c = 1; c < k; c++) {
    let v = d[c - 1]! + Math.ceil((o.factor - 1) * (ca.mean[c]! - ca.mean[c - 1]!) - EPS);
    for (const e of into[c]!) v = Math.max(v, d[e.from]! + e.by);
    d[c] = v;
  }
  if (d.every((v) => v === 0)) return false;
  let oldMin = Infinity;
  let newMin = Infinity;
  for (let i = 0; i < m.n; i++) {
    oldMin = Math.min(oldMin, m.lo[ax][i]!);
    newMin = Math.min(newMin, m.lo[ax][i]! + d[ca.cl[i]!]!);
  }
  let shift = Math.round(oldMin - newMin);
  // with fixed boxes the layout is shifted so the first fixed box (in this axis' order) stays where it was
  let pin = Infinity;
  for (let i = 0; i < m.n; i++) if (m.isFixed[i]) pin = Math.min(pin, ca.cl[i]!);
  if (pin !== Infinity) shift = -d[pin]!;
  for (let i = 0; i < m.n; i++) m.lo[ax][i]! += d[ca.cl[i]!]! + shift;
  return true;
}

/**
 * New top-left per box id (whole pixels). Boxes that do not need to move keep their coordinates.
 * The top-left corner of the bounding box of all boxes stays where it was (or its centre, with `anchor: "centre"`).
 */
export function spreadLayout(input: SpreadInput, opts?: SpreadOptions): Record<string, { x: number; y: number }> {
  const o = resolve(opts);
  const m = buildModel(input, opts?.fixed);
  const orig: [number[], number[]] = [m.lo[0].slice(), m.lo[1].slice()];
  const hasFixed = m.isFixed.some(Boolean);
  if (m.n > 1) {
    splitCoincident(m);
    // Moving one axis can turn two boxes into neighbours on the other (they drift out of overlap or into
    // tolerance), so repeat until nothing more is needed. Only the first round applies `factor`.
    let again = { ...o };
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const movedX = stretchAxis(m, 0, again);
      const movedY = stretchAxis(m, 1, again);
      if (!movedX && !movedY) break;
      again = { ...o, factor: 1 };
    }
  }
  if (opts?.anchor === "centre" && m.n > 0 && !hasFixed) {
    // the bounding box grew (or stayed): move everything so its centre is where it was
    for (const ax of [0, 1] as const) {
      const mid = (lo: number[]) => (Math.min(...lo) + Math.max(...lo.map((v, i) => v + m.size[ax][i]!))) / 2;
      const shift = Math.round(mid(orig[ax]) - mid(m.lo[ax]));
      if (shift !== 0) for (let i = 0; i < m.n; i++) m.lo[ax][i]! += shift;
    }
  }
  // fixed boxes never move (see `fixed`)
  for (let i = 0; i < m.n; i++) {
    if (m.isFixed[i]) {
      m.lo[0][i] = orig[0][i]!;
      m.lo[1][i] = orig[1][i]!;
    }
  }
  const out: Record<string, { x: number; y: number }> = {};
  for (let i = 0; i < m.n; i++) {
    const x = m.lo[0][i] === orig[0][i] ? orig[0][i]! : Math.round(m.lo[0][i]!);
    const y = m.lo[1][i] === orig[1][i] ? orig[1][i]! : Math.round(m.lo[1][i]!);
    out[m.ids[i]!] = { x, y };
  }
  return out;
}

/** How many neighbour pairs of boxes are closer than they should be (0 = nothing for "Make room" to do). */
export function crowdedPairs(input: SpreadInput, opts?: SpreadOptions): number {
  const o = resolve(opts);
  const m = buildModel(input, opts?.fixed);
  if (m.n < 2) return 0;
  splitCoincident(m);
  const seen = new Set<number>();
  for (const ax of [0, 1] as const) for (const p of pairsFor(m, ax, o).pairs) seen.add(Math.min(p.a, p.b) * m.n + Math.max(p.a, p.b));
  return seen.size;
}

/** The part of the input that concerns the chosen boxes: those boxes, the lines that run between them and the labels inside their bounding box. */
export function selectionInput(input: SpreadInput, selected: Iterable<string>): SpreadInput {
  const ids = new Set(selected);
  const boxes = input.boxes.filter((b) => ids.has(b.id));
  if (!boxes.length) return { boxes };
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  const inside = (p: Pt) => p.x >= x0 - 1 && p.x <= x1 + 1 && p.y >= y0 - 1 && p.y <= y1 + 1;
  const grouped = input.grouped instanceof Set ? input.grouped : new Set(input.grouped ?? []);
  return {
    boxes,
    grouped: boxes.filter((b) => grouped.has(b.id)).map((b) => b.id),
    routes: (input.routes ?? []).filter((r) => r.length > 0 && r.every(inside)),
    labels: (input.labels ?? []).filter((l) => inside({ x: l.x + l.w / 2, y: l.y + l.h / 2 })),
  };
}

/**
 * Spread only the chosen boxes among themselves (around the centre of their bounding box), then, if one of them
 * now sits closer than the base gap to a box that was not chosen, make room in the whole diagram with the chosen
 * boxes at their new places, so the others move only as far as needed. New top-left per box id (every box).
 */
export function spreadSelected(input: SpreadInput, selected: Iterable<string>, opts?: SpreadOptions): Record<string, { x: number; y: number }> {
  const ids = new Set(selected);
  const first = spreadLayout(selectionInput(input, ids), { ...opts, anchor: "centre" });
  const now = input.boxes.map((b) => (first[b.id] ? { ...b, ...first[b.id] } : b));
  const base = resolve(opts).base;
  const tooClose = (a: Box, b: Box) => Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w) < base && Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h) < base;
  const was = new Map(input.boxes.map((b) => [b.id, b]));
  const movedSel = now.filter((b) => ids.has(b.id) && (b.x !== was.get(b.id)!.x || b.y !== was.get(b.id)!.y));
  const pushed = movedSel.some((s) => now.some((u) => !ids.has(u.id) && tooClose(s, u)));
  const out: Record<string, { x: number; y: number }> = {};
  for (const b of now) out[b.id] = { x: b.x, y: b.y };
  if (!pushed) return out;
  const second = spreadLayout({ ...input, boxes: now }, { ...opts, factor: 1, anchor: "topLeft" });
  for (const id of Object.keys(second)) out[id] = second[id]!;
  return out;
}

/**
 * Corners of a line set by hand (`EdgeLayout.points`), carried along when boxes move apart: each coordinate moves as the
 * boxes around it on that axis moved. A coordinate within a box's extent on that axis moves with that box (the line's
 * own boxes, `prefer`, first; else the box whose middle is nearest). A coordinate in a gap moves in proportion between
 * the boxes on either side of the gap (the nearest edge before it and after it); beyond every box it moves with the
 * nearest one. So corners stay in the gaps they were in, and a corner straight out from a side of its box stays straight
 * out from it. `before`: the boxes before the move; `after`: their new top-left corners (boxes not in it did not move).
 * Pure; new points are rounded to 0.1 px.
 */
export function movePoints(before: Box[], after: Record<string, Pt>, pts: Pt[], prefer: string[] = []): Pt[] {
  const shift = (b: Box, ax: 0 | 1) => {
    const p = after[b.id];
    return p ? (ax === 0 ? p.x - b.x : p.y - b.y) : 0;
  };
  const along = (c: number, ax: 0 | 1): number => {
    const lo = (b: Box) => (ax === 0 ? b.x : b.y);
    const size = (b: Box) => (ax === 0 ? b.w : b.h);
    const within = before.filter((b) => c >= lo(b) - EPS && c <= lo(b) + size(b) + EPS);
    if (within.length) {
      const own = within.find((b) => prefer.includes(b.id));
      const pick = own ?? within.reduce((m, b) => (Math.abs(lo(b) + size(b) / 2 - c) < Math.abs(lo(m) + size(m) / 2 - c) ? b : m));
      return c + shift(pick, ax);
    }
    let prev: Box | null = null;
    let next: Box | null = null;
    for (const b of before) {
      if (lo(b) + size(b) <= c && (!prev || lo(b) + size(b) > lo(prev) + size(prev))) prev = b;
      if (lo(b) >= c && (!next || lo(b) < lo(next))) next = b;
    }
    if (prev && next) {
      const a = lo(prev) + size(prev);
      const z = lo(next);
      const k = z > a ? (c - a) / (z - a) : 0.5;
      return c + shift(prev, ax) * (1 - k) + shift(next, ax) * k;
    }
    const only = prev ?? next;
    return c + (only ? shift(only, ax) : 0);
  };
  const r = (v: number) => Math.round(v * 10) / 10;
  return pts.map((p) => ({ x: r(along(p.x, 0)), y: r(along(p.y, 1)) }));
}
