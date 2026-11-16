/** Orthogonal edge routing: port planning, routes and default label places (ui/src/routing.ts). */

import { describe, expect, test } from "vitest";
import { defaultLabelT, orthoRoute, placeLabels, planPorts, type Box, type Port, type Pt, type RouteEdge } from "../ui/src/routing.js";

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
});
