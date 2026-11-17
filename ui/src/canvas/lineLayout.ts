/**
 * The right-angle lines of a diagram, planned together: line ends (ports), routes and where each label sits.
 *
 * `layoutLines` runs the whole pipeline (planPorts, orthoRoute for every line, separateRoutes, placeLabels).
 * While boxes are being dragged it can be given the previous full result and the dragged ids: then only the lines
 * that touch a dragged box (or whose planned ends changed) are routed again, the others keep their route and label,
 * and the lane separation and label placement are skipped. The full pipeline runs once more when the drag ends,
 * so the final picture is the same as without dragging.
 *
 * `updateLines` is what runs after a change by hand (a box moved or nudged, a line added, removed or changed): it plans
 * only the lines that changed or touch a box that moved, and every other line keeps its ends, route and label exactly.
 * Only opening a diagram (or another version of the model) and the layout actions a person asks for (Auto-layout,
 * Make room, Spread out) plan every line together with `layoutLines`.
 *
 * After lanes, every planned line goes through `straightenJogs`: a route that is only a few px from straight (a jog shorter
 * than 12px, often a lane piece next to the piece at a port) is made straight, by moving an inner piece or by sliding a
 * port along its side, before labels are placed. A line with hand-set `points` is not planned: its route goes through
 * them (`routeThrough`), its ends count as hand-set anchors for the other lines' ends, and its label is placed as usual.
 *
 * No React or DOM imports. It imports routing.ts with a ".js" suffix because the root tests (NodeNext) load it too; Vite maps it to the .ts file.
 */
import {
  defaultLabelT,
  hasJog,
  labelBox,
  orthoRoute,
  placeLabels,
  planPorts,
  pointAtT,
  routeThrough,
  separateRoutes,
  straightenJogs,
  type Box,
  type LabelItem,
  type Port,
  type PortPair,
  type Pt,
  type RouteEdge,
  type Side,
} from "./routing.js";

/** Jogs shorter than this are made straight by the planner: the same 12px as the near-straight rule of planPorts and separateRoutes (DEC-061). */
const PLANNED_JOG = 12;

export interface LineInput extends RouteEdge {
  /** Label position set by hand (fraction along the line). */
  fixedT?: number;
  /** Inner corners set by hand (canvas units): the line goes through them and is not planned. */
  points?: Pt[];
}

export interface LineLayout {
  ports: Record<string, PortPair>;
  /** The ends as planPorts gave them, before straightening slid some along their side (what a later pass compares with). */
  planned: Record<string, PortPair>;
  routes: Record<string, Pt[]>;
  /** Where each line's label sits (fraction along the line). */
  labelTs: Record<string, number>;
  /** The lines (in order) with the size of their label: what the whole-diagram pass placed. Empty after a partial pass. */
  items: { id: string; pts: Pt[]; size: { w: number; h: number } }[];
  /** True when only the lines near dragged boxes were routed again. */
  partial: boolean;
}

/** The result of an earlier full pass, with what it was computed from. */
export interface LinePrevious {
  boxes: Record<string, Box>;
  lines: LineInput[];
  layout: LineLayout;
}

const sameBox = (a: Box | undefined, b: Box | undefined) => !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
const samePt = (a: Pt | undefined, b: Pt | undefined) => (!a && !b) || (!!a && !!b && a.x === b.x && a.y === b.y);
const samePort = (a: Port, b: Port) => a.x === b.x && a.y === b.y && a.side === b.side;
const samePts = (a: Pt[] | undefined, b: Pt[] | undefined) => (!a && !b) || (!!a && !!b && a.length === b.length && a.every((p, i) => samePt(p, b[i])));

function sameLine(e: LineInput, o: LineInput | undefined): boolean {
  return (
    !!o &&
    e.id === o.id &&
    e.source === o.source &&
    e.target === o.target &&
    e.fixedT === o.fixedT &&
    samePt(e.sourceAnchor, o.sourceAnchor) &&
    samePt(e.targetAnchor, o.targetAnchor) &&
    samePt(e.control, o.control) &&
    samePts(e.points, o.points)
  );
}

function sameLines(a: LineInput[], b: LineInput[]): boolean {
  return a.length === b.length && a.every((e, i) => sameLine(e, b[i]));
}

/** Whether `prev` can be reused with only the lines at the dragged boxes routed again: same lines, same boxes except the dragged ones. */
export function reusable(prev: LinePrevious, boxes: Record<string, Box>, lines: LineInput[], dragged: ReadonlySet<string>): boolean {
  if (dragged.size === 0 || prev.layout.partial || !sameLines(prev.lines, lines)) return false;
  const ids = Object.keys(boxes);
  if (ids.length !== Object.keys(prev.boxes).length) return false;
  return ids.every((id) => dragged.has(id) || sameBox(prev.boxes[id], boxes[id]));
}

/** The routes of the lines with hand-set points (null for a line whose points cannot be used: it is planned as usual). */
function manualRoutes(boxes: Record<string, Box>, lines: LineInput[]): Map<string, { pts: Pt[]; source: Port; target: Port }> {
  const out = new Map<string, { pts: Pt[]; source: Port; target: Port }>();
  for (const e of lines) {
    const [bs, bt] = [boxes[e.source], boxes[e.target]];
    if (!e.points?.length || !bs || !bt) continue;
    const m = routeThrough(bs, bt, e.points, e.sourceAnchor, e.targetAnchor);
    if (m) out.set(e.id, m);
  }
  return out;
}

/**
 * The lines, with the hand-set corners of each line whose two boxes are both being dragged by the same distance moved
 * by that distance (`before`: where the boxes were when the drag started).
 */
export function carryLines(lines: LineInput[], before: Record<string, Pt>, boxes: Record<string, Box>, dragged: ReadonlySet<string>): LineInput[] {
  return lines.map((e) => {
    if (!e.points?.length || !dragged.has(e.source) || !dragged.has(e.target)) return e;
    const [a0, a1, b0, b1] = [before[e.source], boxes[e.source], before[e.target], boxes[e.target]];
    if (!a0 || !a1 || !b0 || !b1) return e;
    const [dx, dy] = [a1.x - a0.x, a1.y - a0.y];
    if (Math.abs(b1.x - b0.x - dx) > 0.5 || Math.abs(b1.y - b0.y - dy) > 0.5 || (dx === 0 && dy === 0)) return e;
    return { ...e, points: e.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
  });
}

/** The fraction of a box a port is at (what a hand-set anchor holds), exact. */
const fractionOf = (b: Box, p: Pt): Pt => ({ x: b.w ? (p.x - b.x) / b.w : 0, y: b.h ? (p.y - b.y) / b.h : 0 });

/** The lines as planPorts sees them: a line with hand-set points has both ends set by hand (where its route meets its boxes). */
function portInput(boxes: Record<string, Box>, lines: LineInput[], manual: Map<string, { source: Port; target: Port }>): RouteEdge[] {
  return lines.map((e) => {
    const m = manual.get(e.id);
    if (!m) return e;
    return { id: e.id, source: e.source, target: e.target, sourceAnchor: fractionOf(boxes[e.source]!, m.source), targetAnchor: fractionOf(boxes[e.target]!, m.target) };
  });
}

/**
 * Make the planned routes of `ids` straight where they are only a few px from it (straightenJogs), in id order. A port
 * slides only when it is not hand-set, keeping clear of the other ends on its side; a piece does not move onto another
 * line. `routes` and `ports` are updated in place.
 */
function straightenPlanned(ids: string[], lines: Map<string, LineInput>, boxes: Record<string, Box>, routes: Record<string, Pt[]>, ports: Record<string, PortPair>, obstacles: Box[]): void {
  const key = (box: string, side: Side) => `${box}\u0000${side}`;
  const coord = (p: Port) => (p.side === "left" || p.side === "right" ? p.y : p.x);
  let onSide: Map<string, { id: string; end: "source" | "target"; at: number }[]> | null = null;
  const sideIndex = () => {
    if (onSide) return onSide;
    onSide = new Map();
    for (const [id, pp] of Object.entries(ports)) {
      const e = lines.get(id);
      if (!e) continue;
      for (const end of ["source", "target"] as const) {
        const k = key(e[end], pp[end].side);
        onSide.set(k, [...(onSide.get(k) ?? []), { id, end, at: coord(pp[end]) }]);
      }
    }
    return onSide;
  };
  for (const id of [...ids].sort()) {
    const e = lines.get(id);
    const pts = routes[id];
    const pp = ports[id];
    if (!e || !pts || !pp || e.source === e.target || !hasJog(pts, PLANNED_JOG)) continue;
    const idx = sideIndex();
    const end = (which: "source" | "target", fixed: boolean) => ({
      box: boxes[e[which]]!,
      side: pp[which].side,
      fixed,
      others: (idx.get(key(e[which], pp[which].side)) ?? []).filter((o) => !(o.id === id && o.end === which)).map((o) => o.at),
    });
    const avoid = Object.entries(routes)
      .filter(([other]) => other !== id)
      .map(([, r]) => r);
    const next = straightenJogs(pts, {
      tolerance: PLANNED_JOG,
      obstacles,
      source: end("source", !!e.sourceAnchor),
      target: end("target", !!e.targetAnchor),
      avoid,
      moveInner: !e.control,
    });
    routes[id] = next;
    const [s, t] = [next[0]!, next[next.length - 1]!];
    if (s.x !== pp.source.x || s.y !== pp.source.y || t.x !== pp.target.x || t.y !== pp.target.y) {
      ports[id] = { source: { x: s.x, y: s.y, side: pp.source.side }, target: { x: t.x, y: t.y, side: pp.target.side } };
      for (const which of ["source", "target"] as const) {
        const entry = idx.get(key(e[which], pp[which].side))?.find((o) => o.id === id && o.end === which);
        if (entry) entry.at = coord(ports[id]![which]);
      }
    }
  }
}

/**
 * Plans every line. `labelSize` is only asked for in a full pass. With `drag` (the previous full result and the dragged
 * box ids) and nothing else changed, the result is partial (see above).
 */
export function layoutLines(
  boxes: Record<string, Box>,
  lines: LineInput[],
  labelSize: (id: string) => { w: number; h: number },
  drag?: { prev: LinePrevious; dragged: ReadonlySet<string>; from?: Record<string, Pt> },
): LineLayout {
  const reuse = !!drag && reusable(drag.prev, boxes, lines, drag.dragged);
  // While both boxes of a line with hand-set corners are dragged together, its corners go along (the canvas saves them so on release).
  const live = reuse ? carryLines(lines, drag!.from ?? drag!.prev.boxes, boxes, drag!.dragged) : lines;
  const manual = manualRoutes(boxes, live);
  const planned = planPorts(boxes, portInput(boxes, live, manual), { avoidBoxes: true });
  const ports: Record<string, PortPair> = { ...planned };
  // Every box is an obstacle for the lines that do not connect it (orthoRoute leaves out the two it is given).
  const obstacles = Object.values(boxes);
  const byId = new Map(lines.map((e) => [e.id, e]));
  const routeOf = (e: LineInput, pp: PortPair) => manual.get(e.id)?.pts ?? orthoRoute(pp.source, pp.target, boxes[e.source]!, boxes[e.target]!, e.control, obstacles);

  if (drag && reuse) {
    const old = drag.prev.layout;
    const routes: Record<string, Pt[]> = {};
    const labelTs: Record<string, number> = {};
    const fresh: string[] = [];
    for (const e of lines) {
      const pp = planned[e.id];
      if (!pp) continue;
      const before = old.planned[e.id];
      const touched = drag.dragged.has(e.source) || drag.dragged.has(e.target) || !before || !samePort(before.source, pp.source) || !samePort(before.target, pp.target);
      const kept = old.routes[e.id];
      if (touched || !kept) {
        const pts = routeOf(e, pp);
        routes[e.id] = pts;
        labelTs[e.id] = e.fixedT ?? old.labelTs[e.id] ?? defaultLabelT(pts);
        if (!manual.has(e.id)) fresh.push(e.id);
      } else {
        routes[e.id] = kept;
        ports[e.id] = old.ports[e.id] ?? pp;
        labelTs[e.id] = old.labelTs[e.id] ?? defaultLabelT(kept);
      }
    }
    straightenPlanned(fresh, byId, boxes, routes, ports, obstacles);
    return { ports, planned, routes, labelTs, items: [], partial: true };
  }

  const routes: Record<string, Pt[]> = {};
  const lanes: Record<string, Pt[]> = {}; // the lines free to move sideways (a line through a bend point or hand-set points stays on them)
  const items: LabelItem[] = [];
  for (const e of lines) {
    const pp = planned[e.id];
    if (!pp) continue;
    const pts = routeOf(e, pp);
    routes[e.id] = pts;
    if (!e.control && !manual.has(e.id)) lanes[e.id] = pts;
    items.push({ id: e.id, pts, size: labelSize(e.id), fixedT: e.fixedT });
  }
  // Lines that share a corridor are spread into lanes; near-straight routes are made straight; labels are placed on the
  // final routes and keep off other lines.
  Object.assign(routes, separateRoutes(lanes, obstacles));
  straightenPlanned(
    lines.filter((e) => !manual.has(e.id)).map((e) => e.id),
    byId,
    boxes,
    routes,
    ports,
    obstacles,
  );
  for (const it of items) it.pts = routes[it.id]!;
  const labelTs = placeLabels(
    items,
    obstacles,
    items.map((it) => ({ id: it.id, pts: it.pts })),
  );
  return { ports, planned, routes, labelTs, items: items.map((it) => ({ id: it.id, pts: it.pts, size: it.size })), partial: false };
}

/**
 * After a change by hand: plan only what changed and keep everything else where it was (see the top of this file).
 * A line is planned again when it is new or changed, when either of its boxes moved or changed size, or when its label
 * changed size. Its new ends come from planning every line, so they keep to the sides they should; its route is kept clear
 * of the boxes, and its label is placed clear of the boxes, the lines and the labels that stay. Lines that do not change
 * keep the exact ends, route and label they had in `prev`. The result is complete (not partial), so it can be the next `prev`.
 */
export function updateLines(prev: LinePrevious, boxes: Record<string, Box>, lines: LineInput[], labelSize: (id: string) => { w: number; h: number }): LineLayout {
  const old = prev.layout;
  const moved = new Set(Object.keys(boxes).filter((id) => !sameBox(prev.boxes[id], boxes[id])));
  const before = new Map(prev.lines.map((e) => [e.id, e]));
  const oldSize = new Map(old.items.map((it) => [it.id, it.size]));
  const sizes = new Map(lines.map((e) => [e.id, labelSize(e.id)]));
  const keeps = (e: LineInput) => {
    const s = oldSize.get(e.id);
    const n = sizes.get(e.id)!;
    return sameLine(e, before.get(e.id)) && !moved.has(e.source) && !moved.has(e.target) && !!old.ports[e.id] && !!old.routes[e.id] && !!s && s.w === n.w && s.h === n.h;
  };
  const kept = lines.filter(keeps);
  const redo = lines.filter((e) => !keeps(e));
  if (!redo.length && kept.length === prev.lines.length) return old;

  const manual = redo.length ? manualRoutes(boxes, lines) : new Map<string, { pts: Pt[]; source: Port; target: Port }>();
  const fromPlan = redo.length ? planPorts(boxes, portInput(boxes, lines, manual), { avoidBoxes: true }) : {};
  const obstacles = Object.values(boxes);
  const ports: Record<string, PortPair> = {};
  const planned: Record<string, PortPair> = {};
  const routes: Record<string, Pt[]> = {};
  const labelTs: Record<string, number> = {};
  for (const e of kept) {
    ports[e.id] = old.ports[e.id]!;
    planned[e.id] = old.planned[e.id] ?? old.ports[e.id]!;
    routes[e.id] = old.routes[e.id]!;
    const t = old.labelTs[e.id];
    if (t !== undefined) labelTs[e.id] = t;
  }
  const lanes: Record<string, Pt[]> = {};
  for (const e of redo) {
    const pp = fromPlan[e.id];
    if (!pp) continue;
    ports[e.id] = pp;
    planned[e.id] = pp;
    routes[e.id] = manual.get(e.id)?.pts ?? orthoRoute(pp.source, pp.target, boxes[e.source]!, boxes[e.target]!, e.control, obstacles);
    if (!e.control && !manual.has(e.id)) lanes[e.id] = routes[e.id]!;
  }
  // The new lines are spread into lanes among themselves and made straight where they nearly are; the lines that stay
  // are not moved to make room.
  Object.assign(routes, separateRoutes(lanes, obstacles));
  straightenPlanned(
    redo.filter((e) => routes[e.id] && !manual.has(e.id)).map((e) => e.id),
    new Map(lines.map((e) => [e.id, e])),
    boxes,
    routes,
    ports,
    obstacles,
  );
  // Labels that stay are obstacles for the new ones, like the boxes.
  const keptLabels = kept.flatMap((e) => (labelTs[e.id] === undefined ? [] : [labelBox(pointAtT(routes[e.id]!, labelTs[e.id]!), sizes.get(e.id)!)]));
  const fresh: LabelItem[] = redo.filter((e) => routes[e.id]).map((e) => ({ id: e.id, pts: routes[e.id]!, size: sizes.get(e.id)!, fixedT: e.fixedT }));
  Object.assign(
    labelTs,
    placeLabels(
      fresh,
      [...obstacles, ...keptLabels],
      lines.filter((e) => routes[e.id]).map((e) => ({ id: e.id, pts: routes[e.id]! })),
    ),
  );
  const items = lines.filter((e) => routes[e.id]).map((e) => ({ id: e.id, pts: routes[e.id]!, size: sizes.get(e.id)! }));
  return { ports, planned, routes, labelTs, items, partial: false };
}
