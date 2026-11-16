/** Orthogonal edge routing: port planning, routes and default label places (ui/src/routing.ts). */

import { describe, expect, test } from "vitest";
import { defaultLabelT, orthoRoute, placeLabels, planPorts, separateRoutes, type Box, type Port, type Pt, type RouteEdge } from "../ui/src/routing.js";

const OUT: Record<Port["side"], Pt> = { right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, top: { x: 0, y: -1 } };

function onBorder(p: Port, b: Box): boolean {
  const e = 1e-6;
  const inX = p.x >= b.x - e && p.x <= b.x + b.w + e;
  const inY = p.y >= b.y - e && p.y <= b.y + b.h + e;
  if (p.side === "left") return Math.abs(p.x - b.x) < e && inY;
  if (p.side === "right") return Math.abs(p.x - (b.x + b.w)) < e && inY;
  if (p.side === "top") return Math.abs(p.y - b.y) < e && inX;
  return Math.abs(p.y - (b.y + b.h)) < e && inX;
}

/** Whether an axis-aligned segment passes through the open inside of a box. */
function crossesInside(a: Pt, b: Pt, r: Box): boolean {
  const e = 1e-6;
  return Math.min(a.x, b.x) < r.x + r.w - e && Math.max(a.x, b.x) > r.x + e && Math.min(a.y, b.y) < r.y + r.h - e && Math.max(a.y, b.y) > r.y + e;
}

const bends = (pts: Pt[]) => pts.length - 2;

/** The properties every route must have. */
function checkRoute(pts: Pt[], src: Port, dst: Port, sb: Box, db: Box, opts: { inside?: boolean } = {}) {
  expect(pts.length).toBeGreaterThanOrEqual(2);
  expect(pts[0]).toEqual({ x: src.x, y: src.y });
  expect(pts[pts.length - 1]).toEqual({ x: dst.x, y: dst.y });
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    expect(a.x === b.x || a.y === b.y, `segment ${i} is axis-aligned`).toBe(true);
    expect(a.x !== b.x || a.y !== b.y, `segment ${i} has length`).toBe(true);
    if (opts.inside !== false) {
      expect(crossesInside(a, b, sb), `segment ${i} stays out of the source box`).toBe(false);
      expect(crossesInside(a, b, db), `segment ${i} stays out of the target box`).toBe(false);
    }
  }
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, b, c] = [pts[i - 1]!, pts[i]!, pts[i + 1]!];
    expect((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y), `no collinear point at ${i}`).toBe(false);
  }
  // Leaves and enters square to the sides, outwards / inwards.
  const first = { x: Math.sign(pts[1]!.x - pts[0]!.x), y: Math.sign(pts[1]!.y - pts[0]!.y) };
  expect(first).toEqual({ x: OUT[src.side].x || 0, y: OUT[src.side].y || 0 });
  const n = pts.length;
  const last = { x: Math.sign(pts[n - 2]!.x - pts[n - 1]!.x), y: Math.sign(pts[n - 2]!.y - pts[n - 1]!.y) };
  expect(last).toEqual({ x: OUT[dst.side].x || 0, y: OUT[dst.side].y || 0 });
}

/** Plan and route every edge; check the general properties. */
function routeAll(boxes: Record<string, Box>, edges: RouteEdge[]) {
  const plan = planPorts(boxes, edges);
  const routes: Record<string, Pt[]> = {};
  for (const e of edges) {
    const p = plan[e.id]!;
    const sb = boxes[e.source]!;
    const tb = boxes[e.target]!;
    expect(onBorder(p.source, sb), `${e.id} source on its box border`).toBe(true);
    expect(onBorder(p.target, tb), `${e.id} target on its box border`).toBe(true);
    routes[e.id] = orthoRoute(p.source, p.target, sb, tb, e.control);
    checkRoute(routes[e.id]!, p.source, p.target, sb, tb);
  }
  return { plan, routes };
}

/** Whether two axis-aligned polylines cross (touching ends excluded). */
function polylinesCross(p: Pt[], q: Pt[]): boolean {
  for (let i = 1; i < p.length; i++)
    for (let j = 1; j < q.length; j++) {
      const [a, b, c, d] = [p[i - 1]!, p[i]!, q[j - 1]!, q[j]!];
      const pv = a.x === b.x;
      const qv = c.x === d.x;
      if (pv === qv) continue;
      const [v1, v2, h1, h2] = pv ? [a, b, c, d] : [c, d, a, b];
      const x = v1.x;
      const y = h1.y;
      if (x > Math.min(h1.x, h2.x) && x < Math.max(h1.x, h2.x) && y > Math.min(v1.y, v2.y) && y < Math.max(v1.y, v2.y)) return true;
    }
  return false;
}

describe("planPorts", () => {
  test("three lines into one box from the left get distinct, ordered ports and straight lines", () => {
    const boxes: Record<string, Box> = {
      b: { x: 400, y: 0, w: 220, h: 300 },
      a1: { x: 0, y: 0, w: 200, h: 80 },
      a2: { x: 0, y: 110, w: 200, h: 80 },
      a3: { x: 0, y: 220, w: 200, h: 80 },
    };
    const edges: RouteEdge[] = [
      { id: "e3", source: "a3", target: "b" },
      { id: "e1", source: "a1", target: "b" },
      { id: "e2", source: "a2", target: "b" },
    ];
    const { plan, routes } = routeAll(boxes, edges);
    const ys = ["e1", "e2", "e3"].map((id) => plan[id]!.target);
    for (const t of ys) expect(t.side).toBe("left");
    expect(ys[0]!.y).toBeLessThan(ys[1]!.y);
    expect(ys[1]!.y).toBeLessThan(ys[2]!.y);
    expect(ys[1]!.y - ys[0]!.y).toBeGreaterThanOrEqual(20);
    expect(ys[2]!.y - ys[1]!.y).toBeGreaterThanOrEqual(20);
    // Every source sits beside the box, so each line is straight.
    for (const id of ["e1", "e2", "e3"]) expect(bends(routes[id]!)).toBe(0);
    expect(polylinesCross(routes.e1!, routes.e2!) || polylinesCross(routes.e2!, routes.e3!) || polylinesCross(routes.e1!, routes.e3!)).toBe(false);
  });

  test("lines leaving one side fan out in order, the aligned one straight", () => {
    const boxes: Record<string, Box> = {
      a: { x: 0, y: 0, w: 200, h: 100 },
      b1: { x: -300, y: 300, w: 200, h: 100 },
      b2: { x: 0, y: 300, w: 200, h: 100 },
      b3: { x: 300, y: 300, w: 200, h: 100 },
    };
    const edges: RouteEdge[] = ["b3", "b1", "b2"].map((t) => ({ id: `to-${t}`, source: "a", target: t }));
    const { plan, routes } = routeAll(boxes, edges);
    const ports = ["to-b1", "to-b2", "to-b3"].map((id) => plan[id]!.source);
    for (const p of ports) expect(p.side).toBe("bottom");
    expect(ports[0]!.x).toBeLessThan(ports[1]!.x);
    expect(ports[1]!.x).toBeLessThan(ports[2]!.x);
    expect(bends(routes["to-b2"]!)).toBe(0);
    expect(bends(routes["to-b1"]!)).toBe(1);
    expect(bends(routes["to-b3"]!)).toBe(1);
    for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) expect(polylinesCross(routes[edges[i]!.id]!, routes[edges[j]!.id]!)).toBe(false);
  });

  test("a crowded side spreads its lines in order, at least 20px apart, away from the corners", () => {
    const boxes: Record<string, Box> = { b: { x: 0, y: 400, w: 200, h: 100 } };
    const edges: RouteEdge[] = [];
    for (let i = 5; i >= 0; i--) {
      boxes[`a${i}`] = { x: 10 + 30 * i, y: 0, w: 30, h: 60 };
      edges.push({ id: `e${i}`, source: `a${i}`, target: "b" });
    }
    const { plan } = routeAll(boxes, edges);
    const xs = [0, 1, 2, 3, 4, 5].map((i) => plan[`e${i}`]!.target);
    for (const p of xs) expect(p.side).toBe("top");
    for (let i = 1; i < xs.length; i++) expect(xs[i]!.x - xs[i - 1]!.x).toBeGreaterThanOrEqual(20);
    expect(xs[0]!.x).toBeGreaterThanOrEqual(12);
    expect(xs[5]!.x).toBeLessThanOrEqual(188);
    // Too many for the airy spread: squeezed evenly over the side, still ordered and distinct.
    for (let i = 6; i < 14; i++) {
      boxes[`a${i}`] = { x: 10 + 13 * i - 80, y: 100 + 10 * i, w: 30, h: 10 };
      edges.push({ id: `e${i}`, source: `a${i}`, target: "b" });
    }
    const plan2 = planPorts(boxes, edges);
    const top = edges
      .map((e) => plan2[e.id]!.target)
      .filter((p) => p.side === "top")
      .map((p) => p.x);
    expect(top.length).toBeGreaterThan(10);
    expect(new Set(top).size).toBe(top.length);
    for (const x of top) expect(x >= 0 && x <= 200).toBe(true);
  });

  test("two lines in opposite directions between one pair get separate ports and do not cross", () => {
    for (const [ax, ay, bx, by] of [
      [0, 0, 400, 0],
      [0, 0, 0, 300],
      [0, 0, 400, 300],
      [0, 300, 400, 0],
      [400, 0, 0, 300],
    ]) {
      const boxes: Record<string, Box> = { a: { x: ax!, y: ay!, w: 200, h: 100 }, b: { x: bx!, y: by!, w: 200, h: 100 } };
      const edges: RouteEdge[] = [
        { id: "ab", source: "a", target: "b" },
        { id: "ba", source: "b", target: "a" },
      ];
      const { plan, routes } = routeAll(boxes, edges);
      const atA = [plan.ab!.source, plan.ba!.target];
      const atB = [plan.ab!.target, plan.ba!.source];
      expect(atA[0]).not.toEqual(atA[1]);
      expect(atB[0]).not.toEqual(atB[1]);
      expect(polylinesCross(routes.ab!, routes.ba!), `crossing for ${[ax, ay, bx, by]}`).toBe(false);
    }
  });

  test("hand-set anchors are kept exactly and auto ports keep clear of them", () => {
    const boxes: Record<string, Box> = { a: { x: 0, y: 0, w: 200, h: 100 }, b: { x: 400, y: 0, w: 200, h: 100 } };
    const edges: RouteEdge[] = [
      { id: "e1", source: "a", target: "b", sourceAnchor: { x: 1, y: 0.5 }, targetAnchor: { x: 0.25, y: 1 } },
      { id: "e2", source: "a", target: "b" },
    ];
    const plan = planPorts(boxes, edges);
    expect(plan.e1!.source).toEqual({ x: 200, y: 50, side: "right" });
    expect(plan.e1!.target).toEqual({ x: 450, y: 100, side: "bottom" });
    // The auto line also uses a's right side but not on top of the anchor.
    expect(plan.e2!.source.side).toBe("right");
    expect(Math.abs(plan.e2!.source.y - 50)).toBeGreaterThanOrEqual(10);
    const r = orthoRoute(plan.e1!.source, plan.e1!.target, boxes.a!, boxes.b!);
    checkRoute(r, plan.e1!.source, plan.e1!.target, boxes.a!, boxes.b!);
  });

  test("a bend point picks the sides facing it", () => {
    const boxes: Record<string, Box> = { a: { x: 0, y: 0, w: 200, h: 100 }, b: { x: 400, y: 0, w: 200, h: 100 } };
    const plan = planPorts(boxes, [{ id: "e", source: "a", target: "b", control: { x: 300, y: -200 } }]);
    expect(plan.e!.source.side).toBe("top");
    expect(plan.e!.target.side).toBe("top");
  });

  test("lines to missing boxes are left out; self-loops get ports", () => {
    const boxes: Record<string, Box> = { a: { x: 0, y: 0, w: 200, h: 100 } };
    const { plan } = routeAll(boxes, [{ id: "loop", source: "a", target: "a" }]);
    expect(plan.loop!.source.side).toBe("right");
    expect(plan.loop!.target.side).toBe("top");
    expect(planPorts(boxes, [{ id: "x", source: "a", target: "gone" }])).toEqual({});
  });

  test("the same input gives the same output", () => {
    const boxes: Record<string, Box> = {
      a: { x: 0, y: 0, w: 200, h: 100 },
      b: { x: 350, y: 250, w: 220, h: 120 },
      c: { x: 700, y: 0, w: 200, h: 100 },
      d: { x: 330, y: 600, w: 200, h: 100 },
    };
    const edges: RouteEdge[] = [
      { id: "1", source: "a", target: "b" },
      { id: "2", source: "c", target: "b" },
      { id: "3", source: "b", target: "d" },
      { id: "4", source: "a", target: "d" },
      { id: "5", source: "d", target: "c", control: { x: 950, y: 650 } },
    ];
    const one = routeAll(boxes, edges);
    const two = routeAll(
      structuredClone(boxes),
      [...edges].reverse().map((e) => ({ ...e })),
    );
    expect(two.plan).toEqual(one.plan);
    expect(two.routes).toEqual(one.routes);
  });
});

describe("orthoRoute", () => {
  const a: Box = { x: 0, y: 0, w: 200, h: 100 };

  test("aligned boxes give a straight line", () => {
    const b: Box = { x: 400, y: 0, w: 200, h: 100 };
    const plan = planPorts({ a, b }, [{ id: "e", source: "a", target: "b" }]);
    const r = orthoRoute(plan.e!.source, plan.e!.target, a, b);
    checkRoute(r, plan.e!.source, plan.e!.target, a, b);
    expect(r).toEqual([
      { x: 200, y: 50 },
      { x: 400, y: 50 },
    ]);
    // Stacked boxes of different widths: still straight, in the middle of the overlap.
    const c: Box = { x: 120, y: 300, w: 200, h: 100 };
    const p2 = planPorts({ a, c }, [{ id: "e", source: "a", target: "c" }]);
    const r2 = orthoRoute(p2.e!.source, p2.e!.target, a, c);
    checkRoute(r2, p2.e!.source, p2.e!.target, a, c);
    expect(bends(r2)).toBe(0);
    expect(r2[0]!.x).toBe(160);
  });

  test("diagonal boxes give an L with one bend", () => {
    for (const b of [
      { x: 400, y: 300, w: 200, h: 100 },
      { x: -500, y: 300, w: 200, h: 100 },
      { x: 400, y: -400, w: 200, h: 100 },
      { x: 500, y: 150, w: 200, h: 100 },
    ]) {
      const plan = planPorts({ a, b }, [{ id: "e", source: "a", target: "b" }]);
      const r = orthoRoute(plan.e!.source, plan.e!.target, a, b);
      checkRoute(r, plan.e!.source, plan.e!.target, a, b);
      expect(bends(r), JSON.stringify(b)).toBe(1);
    }
  });

  test("offset facing ports give a Z whose middle sits halfway between the boxes", () => {
    const b: Box = { x: 400, y: 60, w: 200, h: 100 };
    const src: Port = { x: 200, y: 30, side: "right" };
    const dst: Port = { x: 400, y: 140, side: "left" };
    const r = orthoRoute(src, dst, a, b);
    checkRoute(r, src, dst, a, b);
    expect(r).toEqual([
      { x: 200, y: 30 },
      { x: 300, y: 30 },
      { x: 300, y: 140 },
      { x: 400, y: 140 },
    ]);
  });

  test("awkward cases: same side, back to back, overlapping, adjacent", () => {
    const cases: [Port, Port, Box, Box][] = [
      // Both ends on the top side.
      [{ x: 100, y: 0, side: "top" }, { x: 500, y: 0, side: "top" }, a, { x: 400, y: 0, w: 200, h: 100 }],
      // Back to back: leave right, enter the right side of a box further right.
      [{ x: 200, y: 50, side: "right" }, { x: 600, y: 50, side: "right" }, a, { x: 400, y: 0, w: 200, h: 100 }],
      // Leave left towards a box on the right.
      [{ x: 0, y: 50, side: "left" }, { x: 400, y: 50, side: "left" }, a, { x: 400, y: 0, w: 200, h: 100 }],
      // Target above, ports pointing away from each other.
      [{ x: 100, y: 100, side: "bottom" }, { x: 100, y: -300, side: "top" }, a, { x: 0, y: -300, w: 200, h: 100 }],
      // Boxes only 10px apart.
      [{ x: 200, y: 50, side: "right" }, { x: 210, y: 70, side: "left" }, a, { x: 210, y: 0, w: 200, h: 100 }],
      // Self-loop.
      [{ x: 200, y: 50, side: "right" }, { x: 150, y: 0, side: "top" }, a, a],
    ];
    for (const [s, d, sb, db] of cases) {
      const r = orthoRoute(s, d, sb, db);
      checkRoute(r, s, d, sb, db);
      expect(bends(r)).toBeLessThanOrEqual(4);
    }
    // Overlapping boxes: still a valid orthogonal line (it may cross the overlap).
    const o: Box = { x: 150, y: 50, w: 200, h: 100 };
    const r = orthoRoute({ x: 200, y: 50, side: "right" }, { x: 150, y: 100, side: "left" }, a, o);
    checkRoute(r, { x: 200, y: 50, side: "right" }, { x: 150, y: 100, side: "left" }, a, o, { inside: false });
  });

  test("a bend point moves the middle segment", () => {
    const b: Box = { x: 400, y: 60, w: 200, h: 100 };
    const src: Port = { x: 200, y: 30, side: "right" };
    const dst: Port = { x: 400, y: 140, side: "left" };
    const r = orthoRoute(src, dst, a, b, { x: 260, y: 90 });
    checkRoute(r, src, dst, a, b);
    expect(r).toEqual([
      { x: 200, y: 30 },
      { x: 260, y: 30 },
      { x: 260, y: 140 },
      { x: 400, y: 140 },
    ]);
    // A bend point off a straight line pulls the line through it.
    const s2: Port = { x: 200, y: 50, side: "right" };
    const d2: Port = { x: 400, y: 50, side: "left" };
    const b2: Box = { x: 400, y: 0, w: 200, h: 100 };
    const r2 = orthoRoute(s2, d2, a, b2, { x: 300, y: -80 });
    checkRoute(r2, s2, d2, a, b2);
    expect(r2.some((p, i) => i > 0 && (p.y === -80 || r2[i - 1]!.y === -80) && Math.min(p.x, r2[i - 1]!.x) <= 300 && Math.max(p.x, r2[i - 1]!.x) >= 300)).toBe(true);
  });
});

describe("defaultLabelT", () => {
  test("the middle of the longest segment", () => {
    // Lengths 100, 300, 100: the middle of the long one is at 250 of 500.
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 300 },
      { x: 200, y: 300 },
    ];
    expect(defaultLabelT(pts)).toBeCloseTo(0.5);
    // Lengths 300, 50: middle of the first, 150 of 350.
    expect(
      defaultLabelT([
        { x: 0, y: 0 },
        { x: 300, y: 0 },
        { x: 300, y: 50 },
      ]),
    ).toBeCloseTo(150 / 350);
    // Kept within 0.05..0.95; a zero-length line gives the middle.
    expect(
      defaultLabelT([
        { x: 0, y: 0 },
        { x: 1000, y: 0 },
        { x: 1000, y: 1 },
      ]),
    ).toBeLessThanOrEqual(0.95);
    expect(defaultLabelT([{ x: 5, y: 5 }])).toBe(0.5);
  });
});

describe("random diagrams", () => {
  test("every planned route is valid", () => {
    // Small deterministic generator, so a failure always reproduces.
    let seed = 7;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let t = 0; t < 200; t++) {
      const boxes: Record<string, Box> = {};
      const want = 3 + Math.floor(rnd() * 6);
      for (let tries = 0; Object.keys(boxes).length < want && tries < 200; tries++) {
        const b = { x: Math.round(rnd() * 1200), y: Math.round(rnd() * 900), w: 120 + Math.round(rnd() * 120), h: 70 + Math.round(rnd() * 60) };
        if (Object.values(boxes).some((o) => b.x < o.x + o.w + 30 && b.x + b.w + 30 > o.x && b.y < o.y + o.h + 30 && b.y + b.h + 30 > o.y)) continue;
        boxes[`n${Object.keys(boxes).length}`] = b;
      }
      const ids = Object.keys(boxes);
      const edges: RouteEdge[] = [];
      for (let i = 0, m = 2 + Math.floor(rnd() * 10); i < m; i++) {
        const e: RouteEdge = { id: `e${i}`, source: ids[Math.floor(rnd() * ids.length)]!, target: ids[Math.floor(rnd() * ids.length)]! };
        if (rnd() < 0.1) e.sourceAnchor = { x: 1, y: Math.round(rnd() * 100) / 100 };
        if (rnd() < 0.1) e.control = { x: Math.round(rnd() * 1400), y: Math.round(rnd() * 1000) };
        edges.push(e);
      }
      const plan = planPorts(boxes, edges);
      for (const e of edges) {
        const p = plan[e.id]!;
        const sb = boxes[e.source]!;
        const tb = boxes[e.target]!;
        expect(onBorder(p.source, sb) && onBorder(p.target, tb)).toBe(true);
        // A bend point may sit inside a box; then the line has to pass through it.
        checkRoute(orthoRoute(p.source, p.target, sb, tb, e.control), p.source, p.target, sb, tb, { inside: !e.control });
      }
    }
  });
});

describe("placeLabels", () => {
  const SIZE = { w: 150, h: 32 };
  /** The point at fraction t of the polyline's length. */
  const at = (pts: Pt[], t: number): Pt => {
    let want = t * pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i]!.x, p.y - pts[i]!.y), 0);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (want <= len || i === pts.length - 1) {
        const k = len ? Math.min(want / len, 1) : 0;
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      }
      want -= len;
    }
    return pts[0]!;
  };
  const rectAt = (pts: Pt[], t: number): Box => {
    const p = at(pts, t);
    return { x: p.x - SIZE.w / 2, y: p.y - SIZE.h / 2, w: SIZE.w, h: SIZE.h };
  };
  const overlaps = (a: Box, b: Box) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0;
  // Two vertical lines 20px apart in a corridor: their default places (middle of the longest segment) coincide.
  const A: Pt[] = [
    { x: 100, y: 0 },
    { x: 100, y: 200 },
  ];
  const B: Pt[] = [
    { x: 120, y: 0 },
    { x: 120, y: 200 },
  ];

  test("lines 20px apart in a corridor get labels that do not overlap", () => {
    const t = placeLabels(
      [
        { id: "a", pts: A, size: SIZE },
        { id: "b", pts: B, size: SIZE },
      ],
      [],
    );
    expect(overlaps(rectAt(A, t.a!), rectAt(B, t.b!))).toBe(false);
    for (const v of Object.values(t)) {
      expect(v).toBeGreaterThanOrEqual(0.05);
      expect(v).toBeLessThanOrEqual(0.95);
    }
  });

  test("a lone label keeps the default place", () => {
    const pts: Pt[] = [
      { x: 0, y: 0 },
      { x: 0, y: 40 },
      { x: 300, y: 40 },
      { x: 300, y: 80 },
    ];
    expect(placeLabels([{ id: "a", pts, size: SIZE }], [])).toEqual({ a: defaultLabelT(pts) });
  });

  test("a saved place is kept, and still counts as an obstacle", () => {
    const t = placeLabels(
      [
        { id: "a", pts: A, size: SIZE, fixedT: 0.5 },
        { id: "b", pts: B, size: SIZE },
      ],
      [],
    );
    expect(t.a).toBe(0.5);
    expect(overlaps(rectAt(A, t.a!), rectAt(B, t.b!))).toBe(false);
    expect(placeLabels([{ id: "a", pts: A, size: SIZE, fixedT: 0.99 }], []).a).toBe(0.95);
  });

  test("deterministic and independent of the order of the items", () => {
    const items = [
      { id: "a", pts: A, size: SIZE },
      { id: "b", pts: B, size: SIZE },
      {
        id: "c",
        pts: [
          { x: 140, y: 0 },
          { x: 140, y: 200 },
        ],
        size: SIZE,
      },
    ];
    const one = placeLabels(items, []);
    expect(placeLabels(items, [])).toEqual(one);
    expect(placeLabels([...items].reverse(), [])).toEqual(one);
  });

  test("a label stays off a third box when there is room", () => {
    // A long horizontal line with a box right under its middle: the default place sits on the box.
    const pts: Pt[] = [
      { x: 0, y: 100 },
      { x: 600, y: 100 },
    ];
    const box: Box = { x: 250, y: 90, w: 100, h: 60 };
    const t = placeLabels([{ id: "a", pts, size: SIZE }], [box]);
    expect(overlaps(rectAt(pts, t.a!), box)).toBe(false);
  });

  test("nothing to place, and a line of one point, do not throw", () => {
    expect(placeLabels([], [])).toEqual({});
    expect(placeLabels([{ id: "a", pts: [{ x: 5, y: 5 }], size: SIZE }], [])).toEqual({ a: 0.5 });
  });
});

describe("avoiding other boxes", () => {
  const W = 225;
  const H = 120;
  const box = (x: number, y: number, w = W, h = H): Box => ({ x, y, w, h });

  /** Plan and route every line with the other boxes as obstacles (as the canvas does). */
  function routeAvoiding(boxes: Record<string, Box>, edges: RouteEdge[], avoid = true) {
    const plan = planPorts(boxes, edges, { avoidBoxes: avoid });
    const all = Object.values(boxes);
    const routes: Record<string, Pt[]> = {};
    for (const e of edges) {
      const p = plan[e.id]!;
      routes[e.id] = orthoRoute(p.source, p.target, boxes[e.source]!, boxes[e.target]!, e.control, avoid ? all : undefined);
    }
    return { plan, routes };
  }

  /** The boxes (other than the line's own two) whose inside a route passes through. */
  function crossed(pts: Pt[], boxes: Record<string, Box>, e: RouteEdge): string[] {
    return Object.keys(boxes).filter((id) => id !== e.source && id !== e.target && pts.some((p, i) => i > 0 && crossesInside(pts[i - 1]!, p, boxes[id]!)));
  }

  test("a box between two aligned boxes: the line goes around it", () => {
    const boxes = { a: box(0, 0), mid: box(0, 300), b: box(0, 600) };
    const e: RouteEdge = { id: "e", source: "a", target: "b" };
    const before = routeAvoiding(boxes, [e], false);
    expect(crossed(before.routes.e!, boxes, e)).toEqual(["mid"]);
    const { plan, routes } = routeAvoiding(boxes, [e]);
    expect(crossed(routes.e!, boxes, e)).toEqual([]);
    checkRoute(routes.e!, plan.e!.source, plan.e!.target, boxes.a, boxes.b);
    // Around, not through: it keeps the 15px clearance from the box it passes.
    for (let i = 1; i < routes.e!.length; i++) expect(crossesInside(routes.e![i - 1]!, routes.e![i]!, { x: -15 + 1e-3, y: 300 - 15 + 1e-3, w: W + 30 - 2e-3, h: H + 30 - 2e-3 })).toBe(false);
  });

  test("orthoRoute alone goes around an obstacle, and without obstacles nothing changes", () => {
    const a = box(0, 0);
    const b = box(0, 600);
    const mid = box(0, 300);
    const src: Port = { x: 112.5, y: 120, side: "bottom" };
    const dst: Port = { x: 112.5, y: 600, side: "top" };
    expect(orthoRoute(src, dst, a, b, undefined, [])).toEqual(orthoRoute(src, dst, a, b));
    expect(orthoRoute(src, dst, a, b, undefined, [a, b])).toEqual(orthoRoute(src, dst, a, b));
    // An obstacle that is not in the way leaves the route as it was.
    expect(orthoRoute(src, dst, a, b, undefined, [box(900, 300)])).toEqual(orthoRoute(src, dst, a, b));
    const pts = orthoRoute(src, dst, a, b, undefined, [mid]);
    checkRoute(pts, src, dst, a, b);
    for (let i = 1; i < pts.length; i++) expect(crossesInside(pts[i - 1]!, pts[i]!, mid)).toBe(false);
  });

  // The demo's containers diagram: the customer's lines to three boxes below it.
  const demo = { customer: box(899, 20), web: box(843, 375), spa: box(928, 645), mobile: box(1243, 645) };
  const demoEdges: RouteEdge[] = [
    { id: "c-web", source: "customer", target: "web" },
    { id: "c-spa", source: "customer", target: "spa" },
    { id: "c-mobile", source: "customer", target: "mobile" },
    { id: "web-spa", source: "web", target: "spa" },
  ];

  test("customer, web application, SPA and mobile app: no line runs through a box it does not connect", () => {
    const before = routeAvoiding(demo, demoEdges, false);
    const bad = demoEdges.filter((e) => crossed(before.routes[e.id]!, demo, e).length > 0).map((e) => e.id);
    expect(bad).toContain("c-mobile");
    expect(bad).toContain("c-spa");
    const { plan, routes } = routeAvoiding(demo, demoEdges);
    for (const e of demoEdges) {
      expect(crossed(routes[e.id]!, demo, e), e.id).toEqual([]);
      checkRoute(routes[e.id]!, plan[e.id]!.source, plan[e.id]!.target, demo[e.source as keyof typeof demo], demo[e.target as keyof typeof demo]);
    }
    // The customer's line to the mobile app leaves sideways and arrives from above.
    expect(plan["c-mobile"]!.source.side).toBe("right");
    expect(plan["c-mobile"]!.target.side).toBe("top");
  });

  test("the sides switch when the preferred shape is blocked, and stay when it is not", () => {
    const a = box(0, 0);
    const b = box(0, 600);
    const free = planPorts({ a, b }, [{ id: "e", source: "a", target: "b" }], { avoidBoxes: true });
    expect([free.e!.source.side, free.e!.target.side]).toEqual(["bottom", "top"]);
    const boxes = { a, b, mid: box(0, 300) };
    const blocked = planPorts(boxes, [{ id: "e", source: "a", target: "b" }], { avoidBoxes: true });
    expect([blocked.e!.source.side, blocked.e!.target.side]).not.toEqual(["bottom", "top"]);
    // Off by default.
    const off = planPorts(boxes, [{ id: "e", source: "a", target: "b" }]);
    expect([off.e!.source.side, off.e!.target.side]).toEqual(["bottom", "top"]);
    // Hand-set anchors and bend points win.
    const anchored = planPorts(boxes, [{ id: "e", source: "a", target: "b", sourceAnchor: { x: 0.5, y: 1 } }], { avoidBoxes: true });
    expect(anchored.e!.source.side).toBe("bottom");
    const bent = planPorts(boxes, [{ id: "e", source: "a", target: "b", control: { x: 112, y: 300 } }], { avoidBoxes: true });
    expect([bent.e!.source.side, bent.e!.target.side]).toEqual(["bottom", "top"]);
  });

  test("a target boxed in on all sides still gets a line", () => {
    const t = box(500, 500, 100, 100);
    // Four walls, 8px from the target on every side: no clearance fits, and the gaps are closed.
    const walls = [box(380, 380, 340, 112), box(380, 608, 340, 112), box(380, 380, 112, 340), box(608, 380, 112, 340)];
    const a = box(0, 0);
    const src: Port = { x: 112.5, y: 120, side: "bottom" };
    const dst: Port = { x: 550, y: 500, side: "top" };
    const pts = orthoRoute(src, dst, a, t, undefined, walls);
    expect(pts[0]).toEqual({ x: src.x, y: src.y });
    expect(pts[pts.length - 1]).toEqual({ x: dst.x, y: dst.y });
    for (let i = 1; i < pts.length; i++) expect(pts[i - 1]!.x === pts[i]!.x || pts[i - 1]!.y === pts[i]!.y).toBe(true);
    // And through planPorts + orthoRoute.
    const boxes: Record<string, Box> = { a, t };
    walls.forEach((w, i) => (boxes[`w${i}`] = w));
    const { routes } = routeAvoiding(boxes, [{ id: "e", source: "a", target: "t" }]);
    expect(routes.e!.length).toBeGreaterThanOrEqual(2);
  });

  test("the same input gives the same result", () => {
    const one = routeAvoiding(demo, demoEdges);
    const two = routeAvoiding(demo, demoEdges);
    expect(two).toEqual(one);
    const shuffled = routeAvoiding(demo, [...demoEdges].reverse());
    expect(shuffled.plan).toEqual(one.plan);
    expect(shuffled.routes).toEqual(one.routes);
  });

  // The 19 boxes and 27 lines of the demo's containers diagram (positions as the server sends them; size defaults to 225x120).
  const POS: Record<string, [number, number]> = {
    "single-page-application": [928, 645],
    "mobile-app": [1243, 645],
    "web-application": [843, 375],
    "api-application": [928, 925],
    database: [792, 1295],
    "payments-service": [1243, 925],
    "payment-events": [1355, 1295],
    "notification-service": [1558, 925],
    "session-cache": [1049, 1295],
    "statement-store": [442, 1295],
    "statement-job": [528, 375],
    "personal-banking-customer": [899, 20],
    "analytics-platform": [20, 1740],
    "monitoring-platform": [1280, 1740],
    "mainframe-banking-system": [335, 1740],
    "e-mail-system": [650, 1740],
    "fraud-detection-system": [965, 1740],
    "sms-gateway": [1595, 1740],
    "push-notification-service": [1910, 1740],
  };
  const LINES: [string, string][] = [
    ["personal-banking-customer", "web-application"],
    ["personal-banking-customer", "single-page-application"],
    ["personal-banking-customer", "mobile-app"],
    ["web-application", "single-page-application"],
    ["api-application", "monitoring-platform"],
    ["payments-service", "monitoring-platform"],
    ["notification-service", "monitoring-platform"],
    ["mainframe-banking-system", "statement-store"],
    ["push-notification-service", "mobile-app"],
    ["single-page-application", "api-application"],
    ["single-page-application", "payments-service"],
    ["mobile-app", "api-application"],
    ["mobile-app", "payments-service"],
    ["api-application", "analytics-platform"],
    ["api-application", "statement-store"],
    ["api-application", "database"],
    ["api-application", "session-cache"],
    ["api-application", "mainframe-banking-system"],
    ["api-application", "e-mail-system"],
    ["payments-service", "session-cache"],
    ["payments-service", "mainframe-banking-system"],
    ["payments-service", "fraud-detection-system"],
    ["payments-service", "payment-events"],
    ["notification-service", "payment-events"],
    ["notification-service", "e-mail-system"],
    ["notification-service", "sms-gateway"],
    ["notification-service", "push-notification-service"],
  ];
  const demoBoxes: Record<string, Box> = Object.fromEntries(Object.entries(POS).map(([id, [x, y]]) => [id, box(x, y)]));
  const demoLines: RouteEdge[] = LINES.map(([source, target]) => ({ id: `${source}--${target}`, source, target }));

  test("the whole containers diagram: fewer boxes crossed than without avoidance", () => {
    const count = (avoid: boolean) => {
      const { routes } = routeAvoiding(demoBoxes, demoLines, avoid);
      return demoLines.reduce((n, e) => n + crossed(routes[e.id]!, demoBoxes, e).length, 0);
    };
    const [after, before] = [count(true), count(false)]; // measured: 26 before, 0 after
    expect(before).toBeGreaterThan(after);
    expect(after).toBe(0);
  });

  test("a full pass over the 19-box, 27-line containers diagram is fast", () => {
    const pass = () => {
      const plan = planPorts(demoBoxes, demoLines, { avoidBoxes: true });
      const all = Object.values(demoBoxes);
      for (const e of demoLines) orthoRoute(plan[e.id]!.source, plan[e.id]!.target, demoBoxes[e.source]!, demoBoxes[e.target]!, undefined, all);
    };
    for (let i = 0; i < 5; i++) pass(); // warm up
    const times: number[] = [];
    for (let i = 0; i < 21; i++) {
      const t0 = performance.now();
      pass();
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const median = times[10]!;
    expect(median).toBeLessThan(50);
  });

  // Label sizes of the same 27 lines (the canvas's estimate, in the order of LINES).
  const LABEL_SIZES: [number, number][] = [
    [160, 33],
    [180, 34],
    [180, 34],
    [180, 34],
    [180, 46],
    [180, 46],
    [180, 46],
    [180, 63],
    [149, 33],
    [112, 33],
    [112, 33],
    [112, 33],
    [112, 33],
    [149, 33],
    [128, 33],
    [144, 33],
    [180, 46],
    [112, 33],
    [112, 20],
    [154, 33],
    [96, 33],
    [154, 33],
    [170, 33],
    [175, 33],
    [112, 33],
    [149, 33],
    [175, 33],
  ];

  /** The canvas's whole pass over the demo containers diagram, with or without lanes and line-aware labels. */
  function fullPass(lanes: boolean) {
    const plan = planPorts(demoBoxes, demoLines, { avoidBoxes: true });
    const all = Object.values(demoBoxes);
    let routes: Record<string, Pt[]> = {};
    for (const e of demoLines) routes[e.id] = orthoRoute(plan[e.id]!.source, plan[e.id]!.target, demoBoxes[e.source]!, demoBoxes[e.target]!, undefined, all);
    const plain = routes;
    if (lanes) routes = separateRoutes(routes, all);
    const items = demoLines.map((e, i) => ({ id: e.id, pts: routes[e.id]!, size: { w: LABEL_SIZES[i]![0], h: LABEL_SIZES[i]![1] } }));
    const lines = demoLines.map((e) => ({ id: e.id, pts: routes[e.id]! }));
    const ts = placeLabels(items, all, lanes ? lines : undefined);
    return { plan, routes, plain, items, ts };
  }

  /** Pairs of lines with a collinear overlap of more than 20px within 4px of each other (every segment counts). */
  function sharedOverlaps(routes: Record<string, Pt[]>): number {
    const ids = Object.keys(routes).sort();
    let n = 0;
    for (let a = 0; a < ids.length; a++)
      for (let b = a + 1; b < ids.length; b++)
        for (let i = 1; i < routes[ids[a]!]!.length; i++)
          for (let j = 1; j < routes[ids[b]!]!.length; j++) {
            const [p1, p2, q1, q2] = [routes[ids[a]!]![i - 1]!, routes[ids[a]!]![i]!, routes[ids[b]!]![j - 1]!, routes[ids[b]!]![j]!];
            for (const h of [true, false]) {
              const [c, d] = h ? [p1.y === p2.y ? p1.y : NaN, q1.y === q2.y ? q1.y : NaN] : [p1.x === p2.x ? p1.x : NaN, q1.x === q2.x ? q1.x : NaN];
              if (!(Math.abs(c - d) <= 4)) continue;
              const [l1, l2, m1, m2] = h ? [p1.x, p2.x, q1.x, q2.x] : [p1.y, p2.y, q1.y, q2.y];
              if (Math.min(Math.max(l1, l2), Math.max(m1, m2)) - Math.max(Math.min(l1, l2), Math.min(m1, m2)) > 20) n++;
            }
          }
    return n;
  }

  /** Interior pieces (between two turns) shorter than 12px. */
  const tinyJogs = (routes: Record<string, Pt[]>) =>
    Object.values(routes).reduce((n, pts) => n + pts.slice(1, -2).filter((p, k) => Math.abs(p.x - pts[k + 2]!.x) + Math.abs(p.y - pts[k + 2]!.y) < 12).length, 0);

  /** Labels whose rectangle has a piece of another line strictly inside it. */
  function labelsCrossed(res: ReturnType<typeof fullPass>): number {
    let n = 0;
    for (const it of res.items) {
      const t = res.ts[it.id]!;
      const total = it.pts.slice(1).reduce((s, p, i) => s + Math.abs(p.x - it.pts[i]!.x) + Math.abs(p.y - it.pts[i]!.y), 0);
      let want = t * total;
      let at = it.pts[0]!;
      for (let i = 1; i < it.pts.length; i++) {
        const len = Math.abs(it.pts[i]!.x - it.pts[i - 1]!.x) + Math.abs(it.pts[i]!.y - it.pts[i - 1]!.y);
        if (want <= len || i === it.pts.length - 1) {
          const k = len ? Math.min(want / len, 1) : 0;
          at = { x: it.pts[i - 1]!.x + (it.pts[i]!.x - it.pts[i - 1]!.x) * k, y: it.pts[i - 1]!.y + (it.pts[i]!.y - it.pts[i - 1]!.y) * k };
          break;
        }
        want -= len;
      }
      const r: Box = { x: at.x - it.size.w / 2, y: at.y - it.size.h / 2, w: it.size.w, h: it.size.h };
      const hit = Object.entries(res.routes).some(
        ([id, pts]) =>
          id !== it.id &&
          pts.some((q, i) => {
            if (i === 0) return false;
            const p = pts[i - 1]!;
            return p.y === q.y
              ? p.y > r.y && p.y < r.y + r.h && Math.max(p.x, q.x) > r.x && Math.min(p.x, q.x) < r.x + r.w
              : p.x > r.x && p.x < r.x + r.w && Math.max(p.y, q.y) > r.y && Math.min(p.y, q.y) < r.y + r.h;
          }),
      );
      if (hit) n++;
    }
    return n;
  }

  test("the demo containers diagram: lines are spread, jogs and crossed labels are fewer", () => {
    const before = fullPass(false);
    const after = fullPass(true);
    // Measured on this geometry: shared overlaps 6 -> 1 (the one left is two pieces at ports, which stay put), tiny jogs 1 -> 1
    // (the one left is a jog round a box's 15px clearance that cannot slide), labels crossed by another line 19 -> 11 (15 at a line weight of 2; 8 keeps label-label overlaps at 0 and label-box overlap area at 5, and moves labels from their default place by a median of 25px, mean 94px, at most 408px).
    expect([sharedOverlaps(before.routes), tinyJogs(before.routes), labelsCrossed(before)]).toEqual([6, 1, 19]);
    expect(sharedOverlaps(after.routes)).toBeLessThanOrEqual(1);
    expect(tinyJogs(after.routes)).toBeLessThanOrEqual(1);
    expect(labelsCrossed(after)).toBeLessThanOrEqual(11);
    expect(labelsCrossed(after)).toBeLessThan(labelsCrossed(before));
    // The ends stay where the ports are, and every line is still right-angled and has no repeated or collinear point.
    for (const e of demoLines) {
      const pts = after.routes[e.id]!;
      const p = after.plan[e.id]!;
      expect(pts[0]).toEqual({ x: p.source.x, y: p.source.y });
      expect(pts[pts.length - 1]).toEqual({ x: p.target.x, y: p.target.y });
      checkRoute(pts, p.source, p.target, demoBoxes[e.source]!, demoBoxes[e.target]!);
    }
  });

  test("the whole pass, with lanes and line-aware labels, is fast", () => {
    const pass = () => {
      const plan = planPorts(demoBoxes, demoLines, { avoidBoxes: true });
      const all = Object.values(demoBoxes);
      const routes: Record<string, Pt[]> = {};
      for (const e of demoLines) routes[e.id] = orthoRoute(plan[e.id]!.source, plan[e.id]!.target, demoBoxes[e.source]!, demoBoxes[e.target]!, undefined, all);
      const lanes = separateRoutes(routes, all);
      const items = demoLines.map((e, i) => ({ id: e.id, pts: lanes[e.id]!, size: { w: LABEL_SIZES[i]![0], h: LABEL_SIZES[i]![1] } }));
      placeLabels(
        items,
        all,
        items.map((it) => ({ id: it.id, pts: it.pts })),
      );
    };
    for (let i = 0; i < 5; i++) pass();
    const times: number[] = [];
    for (let i = 0; i < 21; i++) {
      const t0 = performance.now();
      pass();
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    expect(times[10]!).toBeLessThan(50); // measured about 2.6ms; the bound is loose so a slow machine does not fail it
  });
});

describe("separateRoutes", () => {
  const route = (...c: number[]): Pt[] => c.reduce<Pt[]>((out, v, i) => (i % 2 ? out : [...out, { x: v, y: c[i + 1]! }]), []);
  /** Three lines crossing a corridor at y=100, each staggered so their order at both ends is the same (top to bottom: c, b, a). */
  const corridor = (): Record<string, Pt[]> => ({
    a: route(50, 0, 50, 100, 300, 100, 300, 200),
    b: route(100, 0, 100, 100, 350, 100, 350, 200),
    c: route(150, 0, 150, 100, 400, 100, 400, 200),
  });
  const orthogonal = (pts: Pt[]) => pts.every((p, i) => i === 0 || (p.x === pts[i - 1]!.x) !== (p.y === pts[i - 1]!.y));
  const crossings = (r: Record<string, Pt[]>) => {
    const ids = Object.keys(r);
    let n = 0;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if (polylinesCross(r[ids[i]!]!, r[ids[j]!]!)) n++;
    return n;
  };

  test("three lines in one corridor end up in lanes at least 8px apart, without new crossings", () => {
    const before = corridor();
    const out = separateRoutes(before, []);
    const y = (id: string) => out[id]![1]!.y;
    expect(y("c") < y("b") && y("b") < y("a")).toBe(true);
    expect(y("b") - y("c")).toBeGreaterThanOrEqual(8);
    expect(y("a") - y("b")).toBeGreaterThanOrEqual(8);
    // Centred on where the bundle was.
    expect((y("a") + y("c")) / 2).toBeCloseTo(100, 6);
    expect(crossings(out)).toBeLessThanOrEqual(crossings(before));
    for (const id of Object.keys(out)) expect(out[id]![1]!.y).toBe(out[id]![2]!.y);
  });

  test("the ends stay where they are and every route stays orthogonal, connected and free of collinear points", () => {
    const before = corridor();
    const out = separateRoutes(before, []);
    for (const id of Object.keys(before)) {
      expect(out[id]![0]).toEqual(before[id]![0]);
      expect(out[id]![out[id]!.length - 1]).toEqual(before[id]![before[id]!.length - 1]);
      expect(orthogonal(out[id]!)).toBe(true);
      for (let i = 1; i + 1 < out[id]!.length; i++) {
        const [p, q, r] = [out[id]![i - 1]!, out[id]![i]!, out[id]![i + 1]!];
        expect((p.x === q.x && q.x === r.x) || (p.y === q.y && q.y === r.y)).toBe(false);
      }
    }
    // The input is not changed.
    expect(before).toEqual(corridor());
  });

  test("a bundle beside a box is not pushed into it", () => {
    const grown = (b: Box, m: number): Box => ({ x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m });
    // A box whose top is 11px below the corridor: the 10px and 8px spreads would bring the lowest lane within 1px and 3px of it.
    const box: Box = { x: 180, y: 111, w: 60, h: 40 };
    const out = separateRoutes(corridor(), [box]);
    for (const pts of Object.values(out)) for (let i = 1; i < pts.length; i++) expect(crossesInside(pts[i - 1]!, pts[i]!, grown(box, 4.99))).toBe(false);
    // Still spread (with a smaller gap).
    const ys = Object.values(out)
      .map((p) => p[1]!.y)
      .sort((a, b) => a - b);
    expect(ys[1]! - ys[0]!).toBeGreaterThanOrEqual(5.99);
    expect(ys[2]! - 100).toBeLessThanOrEqual(6.01);
    // A box so close that no lane can move towards it: the lines are not moved into it either.
    const tight: Box = { x: 180, y: 102, w: 60, h: 40 };
    for (const pts of Object.values(separateRoutes(corridor(), [tight]))) for (let i = 1; i < pts.length; i++) expect(crossesInside(pts[i - 1]!, pts[i]!, tight)).toBe(false);
  });

  test("lines that leave a bundle on opposite sides cross once rather than lie on top of each other", () => {
    const r = { p: route(50, 0, 50, 100, 300, 100, 300, 200), q: route(100, 200, 100, 100, 250, 100, 250, 0) };
    // p leaves the corridor downwards at both ends, q upwards, and they overlap only in the middle: the lanes are separate.
    const out = separateRoutes(r, []);
    expect(Math.abs(out.p![1]!.y - out.q![1]!.y)).toBeGreaterThanOrEqual(6);
  });

  test("a 6px jog in the middle of a route is made straight, the ends staying put", () => {
    const r = { j: route(100, 0, 100, 50, 106, 50, 106, 150, 300, 150, 300, 200) };
    const out = separateRoutes(r, []);
    expect(out.j).toEqual(route(100, 0, 100, 150, 300, 150, 300, 200));
    // A jog at the port (the first piece cannot move) is left as it is when the other side cannot move either.
    const stuck = { j: route(100, 0, 100, 50, 106, 50, 106, 60) };
    expect(separateRoutes(stuck, []).j).toEqual(stuck.j);
  });

  test("the same input gives the same result, whatever the order of the routes", () => {
    const one = separateRoutes(corridor(), []);
    expect(separateRoutes(corridor(), [])).toEqual(one);
    const c = corridor();
    const reversed = separateRoutes({ c: c.c!, b: c.b!, a: c.a! }, []);
    expect(reversed).toEqual(one);
  });
});

describe("planPorts: tiny jogs", () => {
  // b3 has three lines on its left side and b1 two of them across a 10px gap: the spread slots miss each other by 1-2px.
  const boxes: Record<string, Box> = { b0: { x: 89, y: 598, w: 191, h: 61 }, b1: { x: 354, y: 501, w: 122, h: 72 }, b3: { x: 486, y: 499, w: 180, h: 100 } };
  const edges: RouteEdge[] = [
    { id: "e0", source: "b3", target: "b0" },
    { id: "e1", source: "b1", target: "b3" },
    { id: "e2", source: "b3", target: "b1" },
  ];

  test("facing ports a few px off line up, so the lines are straight", () => {
    const plan = planPorts(boxes, edges);
    for (const id of ["e1", "e2"]) {
      const e = edges.find((x) => x.id === id)!;
      expect(plan[id]!.source.y).toBe(plan[id]!.target.y);
      expect(orthoRoute(plan[id]!.source, plan[id]!.target, boxes[e.source]!, boxes[e.target]!)).toHaveLength(2);
    }
    // The slot rules still hold on b3's left side: at least 20px between the three ports.
    const ys = [plan.e0!.source.y, plan.e1!.target.y, plan.e2!.source.y].sort((a, b) => a - b);
    expect(ys[1]! - ys[0]!).toBeGreaterThanOrEqual(20);
    expect(ys[2]! - ys[1]!).toBeGreaterThanOrEqual(20);
  });

  test("a hand-set anchor is never moved; the auto end facing it lines up with it", () => {
    // The anchor sits 0.6px off where the other end would have been.
    const anchored: RouteEdge[] = [edges[0]!, { ...edges[1]!, sourceAnchor: { x: 1, y: 0.38 } }, edges[2]!];
    const plan = planPorts(boxes, anchored);
    expect(plan.e1!.source).toEqual({ x: 476, y: 501 + 0.38 * 72, side: "right" });
    expect(plan.e1!.target.y).toBe(plan.e1!.source.y);
  });
});

describe("placeLabels: keeping off other lines", () => {
  const SIZE = { w: 150, h: 32 };
  const a: Pt[] = [
    { x: 0, y: 100 },
    { x: 600, y: 100 },
  ];
  const b: Pt[] = [
    { x: 300, y: 0 },
    { x: 300, y: 200 },
  ];
  const labelAt = (pts: Pt[], t: number): Box => ({ x: pts[0]!.x + (pts[1]!.x - pts[0]!.x) * t - SIZE.w / 2, y: pts[0]!.y + (pts[1]!.y - pts[0]!.y) * t - SIZE.h / 2, w: SIZE.w, h: SIZE.h });

  test("a label moves off a line that crosses its default place when there is room", () => {
    const items = [{ id: "a", pts: a, size: SIZE }];
    const lines = [
      { id: "a", pts: a },
      { id: "b", pts: b },
    ];
    // Without the other lines the label sits in the middle, on b.
    const plain = labelAt(a, placeLabels(items, [])["a"]!);
    expect(plain.x < 300 && plain.x + plain.w > 300).toBe(true);
    const r = labelAt(a, placeLabels(items, [], lines)["a"]!);
    expect(r.x < 300 && r.x + r.w > 300).toBe(false);
  });

  test("a line's own pieces do not count against its label", () => {
    // A U-shaped line: its own two arms are inside the default label place, which is fine.
    const u: Pt[] = [
      { x: 0, y: 0 },
      { x: 0, y: 20 },
      { x: 100, y: 20 },
      { x: 100, y: 0 },
    ];
    const items = [{ id: "u", pts: u, size: SIZE }];
    expect(placeLabels(items, [], [{ id: "u", pts: u }])).toEqual(placeLabels(items, []));
  });

  test("the same input gives the same result", () => {
    const items = [
      { id: "a", pts: a, size: SIZE },
      { id: "b", pts: b, size: SIZE },
    ];
    const lines = [
      { id: "a", pts: a },
      { id: "b", pts: b },
    ];
    expect(placeLabels(items, [], lines)).toEqual(placeLabels([...items].reverse(), [], lines));
  });
});
