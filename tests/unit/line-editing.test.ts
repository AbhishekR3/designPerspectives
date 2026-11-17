/** Editing lines by hand: near-straight routes made straight, a dragged piece of a line, corners set by hand (EdgeLayout.points) and their sidecar round trip. */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { edgeLayoutData } from "../../src/core/designPerspectivesFile.js";
import { layoutLines, updateLines, type LineInput } from "../../ui/src/canvas/lineLayout.js";
import { movePoints } from "../../ui/src/canvas/makeRoom.js";
import { handleBesideLabel, hasJog, moveSegment, routeThrough, snapAxis, straightenJogs, type Box, type Pt } from "../../ui/src/canvas/routing.js";
import { Client, demoDir, ok } from "./helpers.js";

/** Every piece is horizontal or vertical. */
function orthogonal(pts: Pt[]): boolean {
  return pts.every((p, i) => i === 0 || p.x === pts[i - 1]!.x || p.y === pts[i - 1]!.y);
}
const onBox = (p: Pt, b: Box) => p.x >= b.x - 1e-6 && p.x <= b.x + b.w + 1e-6 && p.y >= b.y - 1e-6 && p.y <= b.y + b.h + 1e-6 && (p.x === b.x || p.x === b.x + b.w || p.y === b.y || p.y === b.y + b.h);

describe("straightenJogs", () => {
  // The owner's screenshot: a line runs down a lane at x=139, then just above its box jogs 5px to x=134 and goes on down.
  const S: Box = { x: 0, y: 0, w: 100, h: 100 };
  const T: Box = { x: 40, y: 500, w: 200, h: 100 };
  const route: Pt[] = [
    { x: 100, y: 50 },
    { x: 139, y: 50 },
    { x: 139, y: 470 },
    { x: 134, y: 470 },
    { x: 134, y: 500 },
  ];

  test("a 5px jog near the end goes: the inner piece moves onto the end piece's line", () => {
    const out = straightenJogs(route, { source: { box: S, side: "right" }, target: { box: T, side: "top" }, obstacles: [S, T] });
    expect(out).toEqual([
      { x: 100, y: 50 },
      { x: 134, y: 50 },
      { x: 134, y: 500 },
    ]);
    // the input is not changed
    expect(route[1]).toEqual({ x: 139, y: 50 });
  });

  test("when the inner piece would run onto another line, the port slides along its side instead", () => {
    const other = [
      { x: 0, y: 60 },
      { x: 129, y: 60 },
      { x: 129, y: 460 },
    ];
    const out = straightenJogs(route, { source: { box: S, side: "right" }, target: { box: T, side: "top" }, obstacles: [S, T], avoid: [other] });
    expect(out).toEqual([
      { x: 100, y: 50 },
      { x: 139, y: 50 },
      { x: 139, y: 500 },
    ]);
    // a hand-set end does not slide: the jog stays
    expect(straightenJogs(route, { source: { box: S, side: "right" }, target: { box: T, side: "top", fixed: true }, obstacles: [S, T], avoid: [other] })).toEqual(route);
  });

  test("a jog stays when removing it would cut through a box", () => {
    const wall: Box = { x: 120, y: 200, w: 16, h: 100 }; // x 120..136: the lane at 139 passes it, 134 would not
    const out = straightenJogs(route, { source: { box: S, side: "right" }, target: { box: T, side: "top", fixed: true }, obstacles: [S, T, wall] });
    expect(out).toEqual(route);
  });

  test("a jog between two end pieces slides a port, inside the corner margins and clear of the other ends on that side", () => {
    const A: Box = { x: 0, y: 0, w: 100, h: 100 };
    const B: Box = { x: 30, y: 300, w: 100, h: 100 };
    const z: Pt[] = [
      { x: 50, y: 100 },
      { x: 50, y: 200 },
      { x: 55, y: 200 },
      { x: 55, y: 300 },
    ];
    // the source port slides from x=50 to x=55
    expect(straightenJogs(z, { source: { box: A, side: "bottom" }, target: { box: B, side: "top" } })).toEqual([
      { x: 55, y: 100 },
      { x: 55, y: 300 },
    ]);
    // with the source hand-set, the target slides onto x=50 (inside B's margins 45..115)
    expect(straightenJogs(z, { source: { box: A, side: "bottom", fixed: true }, target: { box: B, side: "top" } })).toEqual([
      { x: 50, y: 100 },
      { x: 50, y: 300 },
    ]);
    // another line ends at x=60 on A's bottom: sliding to 55 would come closer than it is (10px), and B's port is fixed
    expect(straightenJogs(z, { source: { box: A, side: "bottom", others: [60] }, target: { box: B, side: "top", fixed: true } })).toEqual(z);
    // a port never leaves the corner margins of its side: B at x=60 has margins 75..145, so 50 is out of reach
    const far: Box = { x: 60, y: 300, w: 100, h: 100 };
    expect(straightenJogs(z, { source: { box: A, side: "bottom", fixed: true }, target: { box: far, side: "top" } })).toEqual(z);
  });

  test("a U is not a jog, and long pieces are left alone", () => {
    const u: Pt[] = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 5, y: 100 },
      { x: 5, y: 0 },
    ];
    expect(straightenJogs(u)).toEqual(u);
    const step: Pt[] = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 20, y: 100 },
      { x: 20, y: 200 },
      { x: 40, y: 200 },
    ];
    expect(straightenJogs(step)).toEqual(step);
    expect(hasJog(step)).toBe(false);
    expect(hasJog(route)).toBe(true);
  });
});

describe("the planner makes near-straight lines straight", () => {
  // A diagram where lanes leave line e6 with an 11px jog between two end pieces (found by a random search).
  const boxes: Record<string, Box> = {
    b0: { x: 625, y: 194, w: 225, h: 120 },
    b1: { x: 768, y: 405, w: 225, h: 120 },
    b2: { x: 1181, y: 362, w: 225, h: 120 },
    b3: { x: 531, y: 791, w: 225, h: 120 },
    b5: { x: 843, y: 790, w: 225, h: 120 },
    b6: { x: 60, y: 839, w: 225, h: 120 },
    b8: { x: 491, y: 423, w: 225, h: 120 },
  };
  const pairs = [
    ["b8", "b3"],
    ["b3", "b0"],
    ["b5", "b0"],
    ["b2", "b5"],
    ["b3", "b5"],
    ["b8", "b6"],
    ["b5", "b3"],
    ["b3", "b5"],
    ["b3", "b1"],
    ["b2", "b3"],
    ["b5", "b2"],
  ];
  const lines: LineInput[] = pairs.map(([source, target], i) => ({ id: `e${i}`, source: source!, target: target! }));

  test("no jog under 12px is left where a port can slide, and every route still ends on its boxes", () => {
    const out = layoutLines(boxes, lines, () => ({ w: 100, h: 30 }));
    expect(hasJog(out.routes.e6!, 12)).toBe(false);
    for (const e of lines) {
      const pts = out.routes[e.id]!;
      expect(orthogonal(pts), e.id).toBe(true);
      expect(onBox(pts[0]!, boxes[e.source]!), e.id).toBe(true);
      expect(onBox(pts[pts.length - 1]!, boxes[e.target]!), e.id).toBe(true);
      // the ports given out are where the route starts and ends
      expect({ x: out.ports[e.id]!.source.x, y: out.ports[e.id]!.source.y }).toEqual(pts[0]);
      expect({ x: out.ports[e.id]!.target.x, y: out.ports[e.id]!.target.y }).toEqual(pts[pts.length - 1]);
    }
  });
});

describe("moveSegment", () => {
  const S: Box = { x: 0, y: 0, w: 100, h: 100 };
  const T: Box = { x: 300, y: 250, w: 100, h: 100 };
  const R: Pt[] = [
    { x: 100, y: 50 },
    { x: 200, y: 50 },
    { x: 200, y: 300 },
    { x: 300, y: 300 },
  ];
  const ends = { source: { box: S, side: "right" as const }, target: { box: T, side: "left" as const } };

  test("an inner piece moves across and its neighbours stretch", () => {
    expect(moveSegment(R, 1, { x: 250, y: 170 }, ends)).toEqual([
      { x: 100, y: 50 },
      { x: 250, y: 50 },
      { x: 250, y: 300 },
      { x: 300, y: 300 },
    ]);
  });

  test("it snaps onto a line end or a box middle within the tolerance", () => {
    expect(moveSegment(R, 1, { x: 296, y: 170 }, ends)[1]).toEqual({ x: 300, y: 50 });
    expect(moveSegment(R, 1, { x: 346, y: 170 }, ends)[1]).toEqual({ x: 350, y: 50 }); // T's middle
    expect(moveSegment(R, 1, { x: 240, y: 170 }, ends)[1]).toEqual({ x: 240, y: 50 });
  });

  test("an end piece slides its port along the side while it stays inside the corner margins", () => {
    expect(moveSegment(R, 0, { x: 150, y: 70 }, ends)).toEqual([
      { x: 100, y: 70 },
      { x: 200, y: 70 },
      { x: 200, y: 300 },
      { x: 300, y: 300 },
    ]);
  });

  test("past the side, or at a hand-set end, the port stays and an elbow keeps the line square to its box", () => {
    const out = moveSegment(R, 0, { x: 150, y: 150 }, ends);
    expect(out).toEqual([
      { x: 100, y: 50 },
      { x: 120, y: 50 },
      { x: 120, y: 150 },
      { x: 200, y: 150 },
      { x: 200, y: 300 },
      { x: 300, y: 300 },
    ]);
    expect(orthogonal(out)).toBe(true);
    const fixed = moveSegment(R, 0, { x: 150, y: 70 }, { ...ends, source: { ...ends.source, fixed: true } });
    expect(fixed[0]).toEqual({ x: 100, y: 50 });
    expect(fixed[1]).toEqual({ x: 120, y: 50 });
    // the last piece: elbow next to the target
    const last = moveSegment(R, 2, { x: 250, y: 500 }, ends);
    expect(last[last.length - 1]).toEqual({ x: 300, y: 300 });
    expect(last[last.length - 2]).toEqual({ x: 280, y: 300 });
    expect(orthogonal(last)).toBe(true);
  });

  test("a piece that is not horizontal or vertical, or an index out of range, changes nothing", () => {
    const diag = [
      { x: 0, y: 0 },
      { x: 50, y: 60 },
    ];
    expect(moveSegment(diag, 0, { x: 10, y: 10 })).toEqual(diag);
    expect(moveSegment(R, 5, { x: 10, y: 10 })).toEqual(R);
  });
});

describe("routeThrough", () => {
  const S: Box = { x: 0, y: 0, w: 100, h: 100 };
  const T: Box = { x: 300, y: 300, w: 100, h: 100 };
  const points = [
    { x: 150, y: 50 },
    { x: 150, y: 350 },
  ];

  test("the ends meet the boxes right across from the first and last corner", () => {
    const r = routeThrough(S, T, points)!;
    expect(r.pts).toEqual([{ x: 100, y: 50 }, ...points, { x: 300, y: 350 }]);
    expect(r.source.side).toBe("right");
    expect(r.target.side).toBe("left");
  });

  test("an end whose box moved re-attaches square to it with an elbow", () => {
    const moved = { ...T, y: 500 };
    const r = routeThrough(S, moved, points)!;
    expect(orthogonal(r.pts)).toBe(true);
    expect(r.pts[0]).toEqual({ x: 100, y: 50 });
    const end = r.pts[r.pts.length - 1]!;
    expect(onBox(end, moved)).toBe(true);
    expect(r.target.side).toBe("left");
    // the piece into the box is square to its side (horizontal into a left side)
    expect(r.pts[r.pts.length - 2]!.y).toBe(end.y);
  });

  test("a hand-set anchor is kept; a corner inside a box, or no corners, gives null", () => {
    const r = routeThrough(S, T, points, { x: 0.5, y: 1 })!;
    expect(r.pts[0]).toEqual({ x: 50, y: 100 });
    expect(r.pts[1]).toEqual({ x: 50, y: 120 });
    expect(orthogonal(r.pts)).toBe(true);
    expect(routeThrough(S, T, [{ x: 50, y: 50 }])).toBeNull();
    expect(routeThrough(S, T, [])).toBeNull();
    expect(routeThrough(S, T, undefined)).toBeNull();
  });
});

describe("snapping and carrying corners", () => {
  test("snapAxis makes a line within 2 degrees exactly horizontal or vertical", () => {
    expect(snapAxis({ x: 100, y: 3 }, { x: 0, y: 0 })).toEqual({ x: 100, y: 0 });
    expect(snapAxis({ x: 2, y: 100 }, { x: 0, y: 0 })).toEqual({ x: 0, y: 100 });
    expect(snapAxis({ x: 100, y: 5 }, { x: 0, y: 0 })).toEqual({ x: 100, y: 5 });
  });

  test("movePoints carries corners with the boxes around them", () => {
    const before = [
      { id: "a", x: 0, y: 0, w: 100, h: 100 },
      { id: "b", x: 300, y: 0, w: 100, h: 100 },
    ];
    const out = movePoints(before, { b: { x: 400, y: 0 } }, [
      { x: 200, y: 50 }, // halfway in the gap: half of b's move
      { x: 350, y: 150 }, // in b's column: all of it
      { x: 50, y: 150 }, // in a's column: none
      { x: 500, y: 150 }, // beyond b: with b
    ]);
    expect(out).toEqual([
      { x: 250, y: 50 },
      { x: 450, y: 150 },
      { x: 50, y: 150 },
      { x: 600, y: 150 },
    ]);
  });
});

describe("lines with corners set by hand in the planner", () => {
  const boxes: Record<string, Box> = { a: { x: 0, y: 0, w: 200, h: 100 }, b: { x: 400, y: 300, w: 200, h: 100 }, c: { x: 400, y: 0, w: 200, h: 100 } };
  const manual: LineInput = {
    id: "e1",
    source: "a",
    target: "b",
    points: [
      { x: 300, y: 50 },
      { x: 300, y: 350 },
    ],
  };
  const lines: LineInput[] = [manual, { id: "e2", source: "a", target: "c" }];
  const size = () => ({ w: 80, h: 20 });

  test("the route goes through the corners and the other ends on that side keep clear of its end", () => {
    const out = layoutLines(boxes, lines, size);
    expect(out.routes.e1).toEqual([{ x: 200, y: 50 }, ...manual.points!, { x: 400, y: 350 }]);
    expect(out.ports.e1!.source).toEqual({ x: 200, y: 50, side: "right" });
    expect(Math.abs(out.ports.e2!.source.y - 50)).toBeGreaterThanOrEqual(10);
    expect(out.labelTs.e1).toBeDefined();
  });

  test("while both boxes of the line are dragged together its corners go along; with one box the end re-attaches", () => {
    const first = layoutLines(boxes, lines, size);
    const prev = { boxes, lines, layout: first };
    const both = { ...boxes, a: { ...boxes.a!, x: 40, y: 30 }, b: { ...boxes.b!, x: 440, y: 330 } };
    const part = layoutLines(both, lines, size, { prev, dragged: new Set(["a", "b"]) });
    expect(part.partial).toBe(true);
    expect(part.routes.e1).toEqual(first.routes.e1!.map((p) => ({ x: p.x + 40, y: p.y + 30 })));
    const one = { ...boxes, b: { ...boxes.b!, y: 600 } };
    const r = layoutLines(one, lines, size, { prev, dragged: new Set(["b"]) }).routes.e1!;
    expect(orthogonal(r)).toBe(true);
    expect(r.slice(1, 3)).toEqual(manual.points);
    expect(onBox(r[r.length - 1]!, one.b!)).toBe(true);
  });

  test("changing the corners plans that line again and leaves the others exactly as they were (DEC-067)", () => {
    const first = layoutLines(boxes, lines, size);
    const changed: LineInput[] = [
      {
        ...manual,
        points: [
          { x: 320, y: 50 },
          { x: 320, y: 350 },
        ],
      },
      lines[1]!,
    ];
    const next = updateLines({ boxes, lines, layout: first }, boxes, changed, size);
    expect(next.routes.e1![1]).toEqual({ x: 320, y: 50 });
    expect(next.routes.e2).toBe(first.routes.e2);
    expect(next.labelTs.e2).toBe(first.labelTs.e2);
  });
});

describe("EdgeLayout.points in the sidecar", () => {
  const rid = "atm--mainframe-banking-system";

  test("saved in canvas units, rounded to 0.1, after control in the file; an empty list or null removes them", async () => {
    const dir = demoDir();
    const c = new Client(dir);
    await ok(
      c.put("/api/diagrams/landscape/layout", {
        edges: {
          [rid]: {
            control: { x: 5, y: 6 },
            points: [
              { y: 20, x: 10.04 },
              { x: 30, y: 40.06 },
            ],
            labelT: 0.4,
          },
        },
      }),
    );
    const e = (await ok(c.get("/api/diagrams/landscape"))).edges.find((x: any) => x.id === rid);
    expect(e.layout.points).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40.1 },
    ]);
    const file = JSON.parse(fs.readFileSync(path.join(dir, "architecture", "designperspectives.json"), "utf-8"));
    const saved = file.layouts.landscape.edges[rid];
    expect(Object.keys(saved)).toEqual(["control", "points", "labelT"]);
    expect(Object.keys(saved.points[0])).toEqual(["x", "y"]);
    // undo takes it back like any other geometry change
    await ok(c.post("/api/undo"));
    expect((await ok(c.get("/api/diagrams/landscape"))).edges.find((x: any) => x.id === rid).layout.points).toBeUndefined();
    await ok(c.put("/api/diagrams/landscape/layout", { edges: { [rid]: { points: [{ x: 1, y: 2 }] } } }));
    await ok(c.put("/api/diagrams/landscape/layout", { edges: { [rid]: { points: [] } } }));
    expect((await ok(c.get("/api/diagrams/landscape"))).edges.find((x: any) => x.id === rid).layout).toEqual({});
    await ok(c.put("/api/diagrams/landscape/layout", { edges: { [rid]: { points: [{ x: 1, y: 2 }] } } }));
    await ok(c.put("/api/diagrams/landscape/layout", { edges: { [rid]: { points: null, labelT: 0.3 } } }));
    expect((await ok(c.get("/api/diagrams/landscape"))).edges.find((x: any) => x.id === rid).layout).toEqual({ labelT: 0.3 });
  });

  test("anything but a list of at most 50 points with finite numbers is refused and nothing is written", async () => {
    const dir = demoDir();
    const c = new Client(dir);
    const file = path.join(dir, "architecture", "designperspectives.json");
    const before = fs.readFileSync(file, "utf-8");
    const bad: unknown[] = ["1,2", { x: 1, y: 2 }, [{ x: "1", y: 2 }], [{ x: null, y: 2 }], [{ x: 1 }], [null], Array.from({ length: 51 }, (_, i) => ({ x: i, y: i }))];
    for (const points of bad) {
      const r = await c.put("/api/diagrams/landscape/layout", { edges: { [rid]: { points } } });
      expect(r.status, JSON.stringify(points)).toBe(422);
    }
    expect(fs.readFileSync(file, "utf-8")).toBe(before);
    // 50 is fine
    await ok(c.put("/api/diagrams/landscape/layout", { edges: { [rid]: { points: Array.from({ length: 50 }, (_, i) => ({ x: i, y: 0 })) } } }));
  });

  test("written with x before y, in the fixed key order", () => {
    expect(JSON.stringify(edgeLayoutData({ labelT: 0.5, points: [{ y: 1, x: 2 }], control: { y: 4, x: 3 } }))).toBe('{"control":{"x":3,"y":4},"points":[{"x":2,"y":1}],"labelT":0.5}');
  });
});

describe("a piece's handle keeps clear of the line's label", () => {
  const label = { x: 100, y: 100, w: 60, h: 20 };
  test("in the middle when the label is elsewhere", () => {
    expect(handleBesideLabel({ x: 0, y: 300 }, { x: 200, y: 300 }, label)).toEqual({ x: 100, y: 300 });
  });
  test("slides along the piece to the nearer side of the label", () => {
    // a vertical piece through the label: the label spans y 90..110, plus 8 on each side
    expect(handleBesideLabel({ x: 100, y: 0 }, { x: 100, y: 210 }, label)).toEqual({ x: 100, y: 118 });
    expect(handleBesideLabel({ x: 0, y: 100 }, { x: 260, y: 100 }, label)).toEqual({ x: 138, y: 100 });
  });
  test("null when the label covers the whole piece", () => {
    expect(handleBesideLabel({ x: 80, y: 100 }, { x: 120, y: 100 }, label)).toBeNull();
  });
});
