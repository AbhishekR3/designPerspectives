import { describe, expect, test } from "vitest";
import { crowdedPairs, spreadLayout, type Box, type Pt, type Rect, type SpreadInput } from "../ui/src/spread.js";

/** Small seeded generator so the random cases are the same on every run. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const box = (id: string, x: number, y: number, w = 100, h = 60): Box => ({ id, x, y, w, h });

function moved(boxes: Box[], pos: Record<string, { x: number; y: number }>): Box[] {
  return boxes.map((b) => ({ ...b, ...pos[b.id] }));
}

const cx = (b: Box) => b.x + b.w / 2;
const cy = (b: Box) => b.y + b.h / 2;
/** Empty space between two boxes on x (negative = overlap). */
const gapX = (a: Box, b: Box) => Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w);
const gapY = (a: Box, b: Box) => Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h);
const overlap = (a: Box, b: Box) => gapX(a, b) < 0 && gapY(a, b) < 0;
const left = (boxes: Box[]) => Math.min(...boxes.map((b) => b.x));
const top = (boxes: Box[]) => Math.min(...boxes.map((b) => b.y));

function randomBoxes(r: () => number, n: number, span = 900): Box[] {
  return Array.from({ length: n }, (_, i) => box(`b${i}`, Math.floor(r() * span), Math.floor(r() * span), 60 + 2 * Math.floor(r() * 70), 40 + 2 * Math.floor(r() * 50)));
}

/** A grid of columns x rows with the given gaps. */
function grid(cols: number, rows: number, gx: number, gy: number, w = 100, h = 60, x0 = 0, y0 = 0): Box[] {
  const out: Box[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push(box(`g${r}${c}`, x0 + c * (w + gx), y0 + r * (h + gy), w, h));
  return out;
}

describe("spreadLayout", () => {
  test("two boxes 10px apart end up at least base apart", () => {
    const boxes = [box("a", 0, 0), box("b", 110, 0)];
    const after = moved(boxes, spreadLayout({ boxes }));
    expect(gapX(after[0]!, after[1]!)).toBeGreaterThanOrEqual(50);
    expect(after[1]!.y).toBe(0);
    const stacked = [box("a", 0, 0), box("b", 0, 70)];
    const s = moved(stacked, spreadLayout({ boxes: stacked }));
    expect(gapY(s[0]!, s[1]!)).toBeGreaterThanOrEqual(50);
    // the base gap is an option
    const wide = moved(boxes, spreadLayout({ boxes }, { base: 120 }));
    expect(gapX(wide[0]!, wide[1]!)).toBeGreaterThanOrEqual(120);
  });

  test("well-spaced boxes do not move with factor 1", () => {
    const boxes = [...grid(4, 3, 60, 60), box("far", 900, 500)];
    expect(spreadLayout({ boxes })).toEqual(Object.fromEntries(boxes.map((b) => [b.id, { x: b.x, y: b.y }])));
    expect(crowdedPairs({ boxes })).toBe(0);
  });

  test("only the tight part moves: boxes beyond a tight gap shift, the well-spaced side stays", () => {
    const boxes = [box("a", 0, 0), box("b", 200, 0), box("c", 310, 0), box("d", 520, 0)];
    const pos = spreadLayout({ boxes });
    expect(pos.a).toEqual({ x: 0, y: 0 });
    expect(pos.b).toEqual({ x: 200, y: 0 });
    expect(pos.c!.x).toBeGreaterThanOrEqual(350);
    // d moves exactly as far as c: the gap between them was fine and stays the same
    expect(pos.d!.x - pos.c!.x).toBe(210);
  });

  test("order on both axes is preserved and no distance shrinks (200 random layouts)", () => {
    const r = rng(7);
    for (let t = 0; t < 200; t++) {
      const boxes = randomBoxes(r, 3 + Math.floor(r() * 14));
      const after = moved(boxes, spreadLayout({ boxes }, { factor: t % 2 ? 1.2 : 1 }));
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          for (const f of [cx, cy]) {
            const before = f(boxes[j]!) - f(boxes[i]!);
            const now = f(after[j]!) - f(after[i]!);
            expect(Math.sign(now)).toBe(Math.sign(before));
            expect(Math.abs(now)).toBeGreaterThanOrEqual(Math.abs(before));
          }
        }
      }
    }
  });

  test("aligned columns and rows stay aligned", () => {
    const boxes = grid(4, 3, 10, 15);
    const after = moved(boxes, spreadLayout({ boxes }));
    for (let r = 0; r < 3; r++) for (let c = 1; c < 4; c++) expect(after[r * 4 + c]!.y).toBe(after[r * 4]!.y);
    for (let c = 0; c < 4; c++) for (let r = 1; r < 3; r++) expect(after[r * 4 + c]!.x).toBe(after[c]!.x);
    expect(crowdedPairs({ boxes: after })).toBe(0);
    // centres within a few px count as lined up, and keep their small offsets
    const jittered = boxes.map((b, i) => ({ ...b, x: b.x + (i % 3) * 2, y: b.y + (i % 2) * 5 }));
    const j = moved(jittered, spreadLayout({ boxes: jittered }));
    for (let i = 0; i < jittered.length; i++)
      for (let k = i + 1; k < jittered.length; k++) {
        if (Math.abs(cx(jittered[i]!) - cx(jittered[k]!)) <= 8) expect(cx(j[i]!) - cx(j[k]!)).toBe(cx(jittered[i]!) - cx(jittered[k]!));
        if (Math.abs(cy(jittered[i]!) - cy(jittered[k]!)) <= 8) expect(cy(j[i]!) - cy(j[k]!)).toBe(cy(jittered[i]!) - cy(jittered[k]!));
      }
  });

  test("sizes never change and ids are all returned", () => {
    const r = rng(3);
    const boxes = randomBoxes(r, 20);
    const pos = spreadLayout({ boxes }, { factor: 1.3 });
    expect(Object.keys(pos).sort()).toEqual(boxes.map((b) => b.id).sort());
    for (const b of boxes) {
      expect(Number.isInteger(pos[b.id]!.x)).toBe(true);
      expect(Number.isInteger(pos[b.id]!.y)).toBe(true);
    }
    expect(boxes.map((b) => [b.w, b.h])).toEqual(randomBoxes(rng(3), 20).map((b) => [b.w, b.h]));
  });

  test("overlapping boxes are separated along one axis only", () => {
    const boxes = [box("a", 0, 0, 100, 100), box("b", 50, 30, 100, 100)];
    const after = moved(boxes, spreadLayout({ boxes }));
    expect(overlap(after[0]!, after[1]!)).toBe(false);
    expect(gapX(after[0]!, after[1]!)).toBeGreaterThanOrEqual(50);
    expect(after[1]!.y).toBe(30);
    // equal distances: x wins
    const tie = [box("a", 0, 0, 100, 100), box("b", 40, 40, 100, 100)];
    const t = moved(tie, spreadLayout({ boxes: tie }));
    expect(t[1]!.y).toBe(40);
    expect(gapX(t[0]!, t[1]!)).toBeGreaterThanOrEqual(50);
    // further apart in y: separated vertically
    const tall = [box("a", 0, 0, 100, 100), box("b", 20, 60, 100, 100)];
    const v = moved(tall, spreadLayout({ boxes: tall }));
    expect(v[1]!.x).toBe(20);
    expect(gapY(v[0]!, v[1]!)).toBeGreaterThanOrEqual(50);
  });

  test("lines running through a gap make it wider", () => {
    const boxes = [box("a", 0, 0), box("b", 160, 0)]; // 60px gap: fine without lines
    expect(spreadLayout({ boxes })).toEqual({ a: { x: 0, y: 0 }, b: { x: 160, y: 0 } });
    const lane = (x: number): Pt[] => [
      { x, y: 10 },
      { x, y: 50 },
    ];
    const routes = [lane(120), lane(130), lane(140)];
    const after = moved(boxes, spreadLayout({ boxes, routes }));
    expect(gapX(after[0]!, after[1]!)).toBeGreaterThanOrEqual(50 + 3 * 12);
    // horizontal segments and lines outside the gap do not count
    const none: Pt[][] = [
      [
        { x: 100, y: 30 },
        { x: 160, y: 30 },
      ],
      lane(50),
      lane(200),
      [
        { x: 120, y: 300 },
        { x: 120, y: 400 },
      ],
    ];
    expect(spreadLayout({ boxes, routes: none })).toEqual({ a: { x: 0, y: 0 }, b: { x: 160, y: 0 } });
    // the lane spacing is an option
    const wide = moved(boxes, spreadLayout({ boxes, routes }, { laneSpacing: 30 }));
    expect(gapX(wide[0]!, wide[1]!)).toBeGreaterThanOrEqual(50 + 3 * 30);
    // vertical gaps count horizontal segments
    const stack = [box("a", 0, 0), box("b", 0, 120)];
    const h: Pt[][] = [
      [
        { x: 10, y: 80 },
        { x: 90, y: 80 },
      ],
      [
        { x: 10, y: 90 },
        { x: 90, y: 90 },
      ],
    ];
    const s = moved(stack, spreadLayout({ boxes: stack, routes: h }));
    expect(gapY(s[0]!, s[1]!)).toBeGreaterThanOrEqual(50 + 2 * 12);
  });

  test("labels in a gap make it wider", () => {
    const boxes = [box("a", 0, 0), box("b", 160, 0)];
    const labels: Rect[] = [{ x: 110, y: 20, w: 40, h: 20 }];
    const after = moved(boxes, spreadLayout({ boxes, labels }));
    expect(gapX(after[0]!, after[1]!)).toBeGreaterThanOrEqual(40 + 16 + 50);
    const faraway: Rect[] = [{ x: 110, y: 400, w: 40, h: 20 }];
    expect(spreadLayout({ boxes, labels: faraway })).toEqual({ a: { x: 0, y: 0 }, b: { x: 160, y: 0 } });
    // along y the label's height counts
    const stack = [box("a", 0, 0), box("b", 0, 120)];
    const s = moved(stack, spreadLayout({ boxes: stack, labels: [{ x: 20, y: 70, w: 80, h: 30 }] }));
    expect(gapY(s[0]!, s[1]!)).toBeGreaterThanOrEqual(50 + 30 + 16);
  });

  test("an outside box keeps clear of the boundary around grouped boxes", () => {
    const grouped = new Set(["g"]);
    const side = [box("g", 0, 0), box("o", 150, 0)];
    const s = moved(side, spreadLayout({ boxes: side, grouped }));
    expect(gapX(s[0]!, s[1]!)).toBeGreaterThanOrEqual(50 + 40);
    // both inside, or both outside: no extra clearance
    const bothIn = moved(side, spreadLayout({ boxes: side, grouped: ["g", "o"] }));
    expect(bothIn[1]!.x).toBe(150);
    // outside above: room for the title as well
    const above = [box("o", 0, 0), box("g", 0, 110)];
    const a = moved(above, spreadLayout({ boxes: above, grouped }));
    expect(gapY(a[0]!, a[1]!)).toBeGreaterThanOrEqual(50 + 40 + 40);
    // outside below: padding only
    const below = [box("g", 0, 0), box("o", 0, 110)];
    const b = moved(below, spreadLayout({ boxes: below, grouped }));
    expect(gapY(b[0]!, b[1]!)).toBeGreaterThanOrEqual(50 + 40);
    expect(gapY(b[0]!, b[1]!)).toBeLessThan(50 + 40 + 40);
    // options
    const tuned = moved(above, spreadLayout({ boxes: above, grouped }, { boundaryPad: 10, boundaryHeader: 0 }));
    expect(gapY(tuned[0]!, tuned[1]!)).toBeGreaterThanOrEqual(60);
    expect(gapY(tuned[0]!, tuned[1]!)).toBeLessThan(110);
  });

  test("factor 1.2 grows every gap by at least 20 percent and keeps the order", () => {
    const boxes = grid(4, 3, 60, 70);
    const after = moved(boxes, spreadLayout({ boxes }, { factor: 1.2 }));
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        expect(gapX(after[r * 4 + c]!, after[r * 4 + c + 1]!)).toBeGreaterThanOrEqual(60 * 1.2);
      }
    }
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) expect(gapY(after[r * 4 + c]!, after[(r + 1) * 4 + c]!)).toBeGreaterThanOrEqual(70 * 1.2);
    // tight gaps are first made room for, then still grow
    const tight = grid(3, 2, 10, 10);
    const t = moved(tight, spreadLayout({ boxes: tight }, { factor: 1.2 }));
    expect(gapX(t[0]!, t[1]!)).toBeGreaterThanOrEqual(50);
    expect(gapY(t[0]!, t[3]!)).toBeGreaterThanOrEqual(50);
    // a bigger factor than 1 never does less than make room
    expect(crowdedPairs({ boxes: t })).toBe(0);
    // values below 1 never shrink anything
    expect(spreadLayout({ boxes }, { factor: 0.5 })).toEqual(spreadLayout({ boxes }));
  });

  test("the top-left corner of the bounding box stays where it was", () => {
    const r = rng(11);
    for (let t = 0; t < 50; t++) {
      const boxes = randomBoxes(r, 12);
      for (const factor of [1, 1.2]) {
        const after = moved(boxes, spreadLayout({ boxes }, { factor }));
        expect(left(after)).toBe(left(boxes));
        expect(top(after)).toBe(top(boxes));
      }
    }
  });

  test("deterministic", () => {
    const boxes = randomBoxes(rng(5), 30);
    const routes: Pt[][] = [
      [
        { x: 100, y: 100 },
        { x: 100, y: 300 },
        { x: 400, y: 300 },
      ],
    ];
    const a = spreadLayout({ boxes, routes, grouped: ["b1", "b2"] }, { factor: 1.2 });
    const b = spreadLayout({ boxes: boxes.map((x) => ({ ...x })), routes, grouped: new Set(["b1", "b2"]) }, { factor: 1.2 });
    expect(b).toEqual(a);
  });

  test("Make room twice changes nothing the second time", () => {
    const r = rng(21);
    for (let t = 0; t < 100; t++) {
      const boxes = randomBoxes(r, 4 + Math.floor(r() * 12), 700);
      const grouped = t % 2 ? boxes.filter((_, i) => i % 3 === 0).map((b) => b.id) : undefined;
      const once = moved(boxes, spreadLayout({ boxes, grouped }));
      expect(crowdedPairs({ boxes: once, grouped })).toBe(0);
      const twice = spreadLayout({ boxes: once, grouped });
      expect(twice).toEqual(Object.fromEntries(once.map((b) => [b.id, { x: b.x, y: b.y }])));
    }
  });

  test("no boxes and one box", () => {
    expect(spreadLayout({ boxes: [] })).toEqual({});
    expect(spreadLayout({ boxes: [box("a", 5, 7)] }, { factor: 2 })).toEqual({ a: { x: 5, y: 7 } });
    expect(crowdedPairs({ boxes: [box("a", 5, 7)] })).toBe(0);
  });

  test("C2-like diagram: a grouped block in 3 rows with tight gaps and two outside boxes", () => {
    const W = 200;
    const H = 100;
    const boxes: Box[] = [];
    const rows = [4, 3, 3];
    const y0 = 200;
    rows.forEach((n, r) => {
      for (let c = 0; c < n; c++) boxes.push(box(`c${r}${c}`, 100 + c * (W + 20 + ((r + c) % 2) * 10), y0 + r * (H + 20 + (c % 2) * 10), W, H));
    });
    const grouped = boxes.map((b) => b.id);
    boxes.push(box("above", 250, y0 - H - 30, W, H)); // 30px above the first row
    const lastBottom = Math.max(...boxes.map((b) => b.y + b.h));
    boxes.push(box("below", 350, lastBottom + 30, W, H));
    const input: SpreadInput = { boxes, grouped };
    expect(crowdedPairs(input)).toBeGreaterThan(10);
    const after = moved(boxes, spreadLayout(input));
    expect(crowdedPairs({ boxes: after, grouped })).toBe(0);
    for (const o of ["above", "below"]) {
      const out = after.find((b) => b.id === o)!;
      for (const g of after.filter((b) => b.id !== "above" && b.id !== "below")) {
        if (gapX(out, g) < 40) expect(gapY(out, g)).toBeGreaterThanOrEqual(o === "above" ? 130 : 90);
      }
    }
    for (let i = 0; i < after.length; i++) for (let j = i + 1; j < after.length; j++) expect(overlap(after[i]!, after[j]!)).toBe(false);
    // the spread-out version is wider again, still with nothing crowded
    const spread = moved(boxes, spreadLayout(input, { factor: 1.2 }));
    expect(crowdedPairs({ boxes: spread, grouped })).toBe(0);
    expect(Math.max(...spread.map((b) => b.x + b.w)) - left(spread)).toBeGreaterThan(Math.max(...after.map((b) => b.x + b.w)) - left(after));
  });

  test("50 boxes with routes and labels take well under 5 ms", () => {
    const r = rng(99);
    const boxes = grid(10, 5, 25, 25, 120, 70);
    const routes: Pt[][] = [];
    const labels: Rect[] = [];
    for (let i = 0; i < 70; i++) {
      const a = boxes[Math.floor(r() * 50)];
      const b = boxes[Math.floor(r() * 50)];
      const mid = (a!.x + b!.x) / 2 + 60;
      routes.push([
        { x: a!.x + 60, y: a!.y + 35 },
        { x: mid, y: a!.y + 35 },
        { x: mid, y: b!.y + 35 },
        { x: b!.x + 60, y: b!.y + 35 },
      ]);
      labels.push({ x: mid - 30, y: (a!.y + b!.y) / 2, w: 60, h: 16 });
    }
    const grouped = boxes.slice(0, 40).map((b) => b.id);
    for (let i = 0; i < 20; i++) spreadLayout({ boxes, routes, labels, grouped }, { factor: 1.2 }); // warm up
    const runs = 50;
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) spreadLayout({ boxes, routes, labels, grouped }, { factor: 1.2 });
    const per = (performance.now() - t0) / runs;
    expect(per).toBeLessThan(5);
  });
});
