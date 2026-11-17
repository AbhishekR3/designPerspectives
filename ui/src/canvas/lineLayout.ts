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
 * No React or DOM imports. It imports routing.ts with a ".js" suffix because the root tests (NodeNext) load it too; Vite maps it to the .ts file.
 */
import { defaultLabelT, labelBox, orthoRoute, placeLabels, planPorts, pointAtT, separateRoutes, type Box, type LabelItem, type Port, type PortPair, type Pt, type RouteEdge } from "./routing.js";

export interface LineInput extends RouteEdge {
  /** Label position set by hand (fraction along the line). */
  fixedT?: number;
}

export interface LineLayout {
  ports: Record<string, PortPair>;
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

function sameLine(e: LineInput, o: LineInput | undefined): boolean {
  return (
    !!o &&
    e.id === o.id &&
    e.source === o.source &&
    e.target === o.target &&
    e.fixedT === o.fixedT &&
    samePt(e.sourceAnchor, o.sourceAnchor) &&
    samePt(e.targetAnchor, o.targetAnchor) &&
    samePt(e.control, o.control)
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

/**
 * Plans every line. `labelSize` is only asked for in a full pass. With `drag` (the previous full result and the dragged
 * box ids) and nothing else changed, the result is partial (see above).
 */
export function layoutLines(
  boxes: Record<string, Box>,
  lines: LineInput[],
  labelSize: (id: string) => { w: number; h: number },
  drag?: { prev: LinePrevious; dragged: ReadonlySet<string> },
): LineLayout {
  const ports = planPorts(boxes, lines, { avoidBoxes: true });
  // Every box is an obstacle for the lines that do not connect it (orthoRoute leaves out the two it is given).
  const obstacles = Object.values(boxes);

  if (drag && reusable(drag.prev, boxes, lines, drag.dragged)) {
    const old = drag.prev.layout;
    const routes: Record<string, Pt[]> = {};
    const labelTs: Record<string, number> = {};
    for (const e of lines) {
      const pp = ports[e.id];
      if (!pp) continue;
      const before = old.ports[e.id];
      const touched = drag.dragged.has(e.source) || drag.dragged.has(e.target) || !before || !samePort(before.source, pp.source) || !samePort(before.target, pp.target);
      const kept = old.routes[e.id];
      if (touched || !kept) {
        const pts = orthoRoute(pp.source, pp.target, boxes[e.source]!, boxes[e.target]!, e.control, obstacles);
        routes[e.id] = pts;
        labelTs[e.id] = e.fixedT ?? old.labelTs[e.id] ?? defaultLabelT(pts);
      } else {
        routes[e.id] = kept;
        labelTs[e.id] = old.labelTs[e.id] ?? defaultLabelT(kept);
      }
    }
    return { ports, routes, labelTs, items: [], partial: true };
  }

  const routes: Record<string, Pt[]> = {};
  const lanes: Record<string, Pt[]> = {}; // the lines free to move sideways (a line through a bend point the user set stays on it)
  const items: LabelItem[] = [];
  for (const e of lines) {
    const pp = ports[e.id];
    if (!pp) continue;
    const pts = orthoRoute(pp.source, pp.target, boxes[e.source]!, boxes[e.target]!, e.control, obstacles);
    routes[e.id] = pts;
    if (!e.control) lanes[e.id] = pts;
    items.push({ id: e.id, pts, size: labelSize(e.id), fixedT: e.fixedT });
  }
  // Lines that share a corridor are spread into lanes; labels are placed on the final routes and keep off other lines.
  Object.assign(routes, separateRoutes(lanes, obstacles));
  for (const it of items) it.pts = routes[it.id]!;
  const labelTs = placeLabels(
    items,
    obstacles,
    items.map((it) => ({ id: it.id, pts: it.pts })),
  );
  return { ports, routes, labelTs, items: items.map((it) => ({ id: it.id, pts: it.pts, size: it.size })), partial: false };
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

  const planned = redo.length ? planPorts(boxes, lines, { avoidBoxes: true }) : {};
  const obstacles = Object.values(boxes);
  const ports: Record<string, PortPair> = {};
  const routes: Record<string, Pt[]> = {};
  const labelTs: Record<string, number> = {};
  for (const e of kept) {
    ports[e.id] = old.ports[e.id]!;
    routes[e.id] = old.routes[e.id]!;
    const t = old.labelTs[e.id];
    if (t !== undefined) labelTs[e.id] = t;
  }
  const lanes: Record<string, Pt[]> = {};
  for (const e of redo) {
    const pp = planned[e.id];
    if (!pp) continue;
    ports[e.id] = pp;
    routes[e.id] = orthoRoute(pp.source, pp.target, boxes[e.source]!, boxes[e.target]!, e.control, obstacles);
    if (!e.control) lanes[e.id] = routes[e.id]!;
  }
  // The new lines are spread into lanes among themselves; the lines that stay are not moved to make room.
  Object.assign(routes, separateRoutes(lanes, obstacles));
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
  return { ports, routes, labelTs, items, partial: false };
}
