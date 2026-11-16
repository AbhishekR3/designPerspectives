/** Automatic lines are rounded right angles, and the ends of lines that meet one box are spread apart. */
import { api, expect, openDiagram, test } from "./fixtures.js";

const KEY = "containers-internet-banking-system";

test("automatic lines use right angles only and their ends on a box are apart", async ({ page, server }) => {
  await openDiagram(page, KEY);
  const diagram = await api(server, `/diagrams/${KEY}`);
  const edges: { id: string; source: string; target: string; layout: { routing?: string } }[] = diagram.edges;
  expect(edges.length).toBeGreaterThan(3);
  // Nothing saved: these lines take the automatic shape.
  expect(edges.every((e) => e.layout.routing === undefined)).toBe(true);

  const geometry = await page.evaluate(
    (ids) => {
      return ids.map((id) => {
        const path = document.querySelector(`[data-testid="rf__edge-${id}"] path.react-flow__edge-path`) as SVGPathElement | null;
        if (!path) return null;
        const d = path.getAttribute("d") ?? "";
        const total = path.getTotalLength();
        const a = path.getPointAtLength(0);
        const b = path.getPointAtLength(total);
        return { id, d, start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y } };
      });
    },
    edges.map((e) => e.id),
  );

  const ends = new Map<string, { x: number; y: number }[]>();
  for (const [i, g] of geometry.entries()) {
    const e = edges[i]!;
    expect(g, `edge ${e.id} is drawn`).not.toBeNull();
    // Straight pieces (the L commands of a rounded path) are horizontal or vertical; the corners are Q curves.
    let cur: [number, number] | null = null;
    for (const m of g!.d.matchAll(/([MLQ])([^MLQ]*)/g)) {
      const v = (m[2] ?? "")
        .trim()
        .split(/[\s,]+/)
        .map(Number);
      const to: [number, number] = [v[v.length - 2] ?? 0, v[v.length - 1] ?? 0];
      if (m[1] === "L" && cur) expect(Math.min(Math.abs(to[0] - cur[0]), Math.abs(to[1] - cur[1])), `${g!.id}: ${g!.d}`).toBeLessThan(0.01);
      cur = to;
    }
    ends.set(e.source, [...(ends.get(e.source) ?? []), g!.start]);
    ends.set(e.target, [...(ends.get(e.target) ?? []), g!.end]);
  }

  // Every box that has several line ends keeps them at least 15 diagram units apart.
  let crowded = 0;
  for (const [node, pts] of ends) {
    if (pts.length < 2) continue;
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        const [a, b] = [pts[i]!, pts[j]!];
        const gap = Math.hypot(a.x - b.x, a.y - b.y);
        expect(gap, `ends on ${node}`).toBeGreaterThanOrEqual(15);
      }
    crowded++;
  }
  expect(crowded).toBeGreaterThan(0);
});

/** Pairs of line labels (`.edge-label`) on the page whose boxes share area. */
async function overlappingLabels(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() => {
    const labels = [...document.querySelectorAll<HTMLElement>(".edge-label")].map((el) => ({ id: el.dataset.testid ?? "", r: el.getBoundingClientRect() }));
    const out: string[] = [];
    for (let i = 0; i < labels.length; i++)
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i]!.r;
        const b = labels[j]!.r;
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 1 && h > 1) out.push(`${labels[i]!.id} x ${labels[j]!.id}`);
      }
    return out;
  });
}

test("labels of lines that run side by side do not sit on each other", async ({ page }) => {
  await openDiagram(page, KEY);
  const pairs = await overlappingLabels(page);
  // The two lines from Personal Banking Customer leave the same box side by side: their labels used to coincide.
  const a = "edge-personal-banking-customer--web-application";
  const b = "edge-personal-banking-customer--single-page-application";
  expect(pairs.filter((p) => p.includes(a) && p.includes(b))).toEqual([]);
  // Across the whole diagram: 14 pairs overlapped before labels were placed (measured), none now. Two are allowed
  // so a different font on another machine, which changes the label sizes a little, does not fail the test.
  expect(pairs.length, pairs.join("\n")).toBeLessThanOrEqual(2);
});
