/** Planning the right-angle lines of a diagram, in full and while boxes are dragged (ui/src/canvas/lineLayout.ts). */

import { describe, expect, test } from "vitest";
import { layoutLines, type LineInput } from "../../ui/src/canvas/lineLayout.js";
import type { Box } from "../../ui/src/canvas/routing.js";

/** A 5 x 4 grid of boxes with lines between neighbours and a few longer ones. */
function grid() {
  const boxes: Record<string, Box> = {};
  for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) boxes[`b${r}${c}`] = { x: c * 320, y: r * 220, w: 200, h: 100 };
  const lines: LineInput[] = [];
  let n = 0;
  const add = (s: string, t: string) => lines.push({ id: `e${n++}`, source: s, target: t });
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 5; c++) {
      if (c < 4) add(`b${r}${c}`, `b${r}${c + 1}`);
      if (r < 3) add(`b${r}${c}`, `b${r + 1}${c}`);
    }
  add("b00", "b33");
  add("b02", "b30");
  return { boxes, lines };
}
const size = () => ({ w: 140, h: 40 });

describe("layoutLines", () => {
  test("a full pass plans every line", () => {
    const { boxes, lines } = grid();
    const out = layoutLines(boxes, lines, size);
    expect(out.partial).toBe(false);
    expect(Object.keys(out.routes)).toHaveLength(lines.length);
    expect(Object.keys(out.labelTs)).toHaveLength(lines.length);
    expect(out.items).toHaveLength(lines.length);
  });

  test("while dragging, only lines at the dragged box are routed again", () => {
    const { boxes, lines } = grid();
    const full = layoutLines(boxes, lines, size);
    const prev = { boxes, lines, layout: full };
    const moved = { ...boxes, b11: { ...boxes.b11!, x: boxes.b11!.x + 40, y: boxes.b11!.y + 30 } };
    const part = layoutLines(moved, lines, size, { prev, dragged: new Set(["b11"]) });
    expect(part.partial).toBe(true);
    let same = 0;
    for (const e of lines) {
      const touches = e.source === "b11" || e.target === "b11";
      if (touches) {
        expect(part.routes[e.id]).not.toBe(full.routes[e.id]);
        // the line still ends on the moved box
        const end = e.source === "b11" ? part.routes[e.id]![0]! : part.routes[e.id]!.at(-1)!;
        const b = moved.b11!;
        expect(end.x >= b.x - 1e-6 && end.x <= b.x + b.w + 1e-6 && end.y >= b.y - 1e-6 && end.y <= b.y + b.h + 1e-6).toBe(true);
      } else if (part.routes[e.id] === full.routes[e.id]) same++;
      // every label keeps a place
      expect(part.labelTs[e.id]).toBeDefined();
    }
    // most of the other lines are reused as they are (a few may follow a re-planned line end)
    expect(same).toBeGreaterThan(lines.length / 2);
    // untouched lines keep their label place
    for (const e of lines) if (part.routes[e.id] === full.routes[e.id]) expect(part.labelTs[e.id]).toBe(full.labelTs[e.id]);
  });

  test("the full pass that runs after a drag is deterministic: the same boxes give the same lines", () => {
    const { boxes, lines } = grid();
    const moved = { ...boxes, b11: { ...boxes.b11!, x: boxes.b11!.x + 40, y: boxes.b11!.y + 30 } };
    const a = layoutLines(moved, lines, size);
    const b = layoutLines(moved, lines, size);
    expect(a.partial).toBe(false);
    expect(a.routes).toEqual(b.routes);
    expect(a.labelTs).toEqual(b.labelTs);
  });

  test("anything else changed: the full pass runs", () => {
    const { boxes, lines } = grid();
    const full = layoutLines(boxes, lines, size);
    const prev = { boxes, lines, layout: full };
    // another box than the dragged one changed (resized)
    const resized = { ...boxes, b22: { ...boxes.b22!, w: 260 } };
    expect(layoutLines(resized, lines, size, { prev, dragged: new Set(["b11"]) }).partial).toBe(false);
    // a line changed
    const bent = lines.map((e, i) => (i === 0 ? { ...e, control: { x: 5, y: 5 } } : e));
    expect(layoutLines(boxes, bent, size, { prev, dragged: new Set(["b11"]) }).partial).toBe(false);
    // a box appeared
    expect(layoutLines({ ...boxes, extra: { x: 2000, y: 2000, w: 100, h: 60 } }, lines, size, { prev, dragged: new Set(["b11"]) }).partial).toBe(false);
    // nothing dragged
    expect(layoutLines(boxes, lines, size, { prev, dragged: new Set() }).partial).toBe(false);
  });

  test("a hand-set label place is kept in a partial pass", () => {
    const { boxes, lines } = grid();
    const fixed = lines.map((e, i) => (i === 0 ? { ...e, fixedT: 0.3 } : e));
    const full = layoutLines(boxes, fixed, size);
    const moved = { ...boxes, b00: { ...boxes.b00!, x: 20, y: 10 } };
    const part = layoutLines(moved, fixed, size, { prev: { boxes, lines: fixed, layout: full }, dragged: new Set(["b00"]) });
    expect(part.partial).toBe(true);
    expect(part.labelTs.e0).toBe(0.3);
  });
});
