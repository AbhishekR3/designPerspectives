/** Automatic lines are rounded right angles, and the ends of lines that meet one box are spread apart. */
import { api, expect, openDiagram, test, waitUntil } from "./fixtures.js";

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

test("the end grips of a selected right-angle line sit on the ends of the drawn line", async ({ page, server }) => {
  await openDiagram(page, KEY);
  const diagram = await api(server, `/diagrams/${KEY}`);
  const edges: { id: string }[] = diagram.edges;
  expect(edges.length).toBeGreaterThan(3);
  for (const e of edges.slice(0, 4)) {
    await page.getByTestId(`edge-${e.id}`).click({ force: true });
    await expect(page.getByTestId("grip-source")).toBeVisible();
    // the ends of the path in screen coordinates
    const ends = await page.evaluate((id) => {
      const path = document.querySelector(`[data-testid="rf__edge-${id}"] path.react-flow__edge-path`) as SVGPathElement;
      const m = path.getScreenCTM()!;
      const at = (len: number) => {
        const p = path.getPointAtLength(len);
        return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
      };
      return { start: at(0), end: at(path.getTotalLength()) };
    }, e.id);
    const centre = async (testId: string) => {
      const b = (await page.getByTestId(testId).boundingBox())!;
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    const gs = await centre("grip-source");
    const gt = await centre("grip-target");
    expect(Math.hypot(gs.x - ends.start.x, gs.y - ends.start.y), `${e.id}: source grip`).toBeLessThanOrEqual(3);
    expect(Math.hypot(gt.x - ends.end.x, gt.y - ends.end.y), `${e.id}: target grip`).toBeLessThanOrEqual(3);
  }
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

test("no automatic line is drawn through a box it does not connect", async ({ page, server }) => {
  await openDiagram(page, KEY);
  const diagram = await api(server, `/diagrams/${KEY}`);
  const edges: { id: string; source: string; target: string }[] = diagram.edges;
  const crossings = await page.evaluate(
    (list) => {
      const rects = new Map<string, DOMRect>();
      for (const el of document.querySelectorAll<HTMLElement>(".react-flow__node[data-id]")) rects.set(el.dataset.id!, el.getBoundingClientRect());
      const out: string[] = [];
      for (const e of list) {
        const path = document.querySelector(`[data-testid="rf__edge-${e.id}"] path.react-flow__edge-path`) as SVGPathElement | null;
        if (!path) {
          out.push(`${e.id}: not drawn`);
          continue;
        }
        const m = path.getScreenCTM()!;
        const total = path.getTotalLength();
        const scale = Math.hypot(m.a, m.b) || 1;
        const inset = 4; // screen px; the line's own ends touch their boxes, and rounded corners are not exact
        for (const [id, r] of rects) {
          if (id === e.source || id === e.target || id.startsWith("boundary:")) continue;
          const steps = Math.max(2, Math.ceil((total * scale) / 3));
          for (let i = 0; i <= steps; i++) {
            const p = path.getPointAtLength((total * i) / steps);
            const x = p.x * m.a + p.y * m.c + m.e;
            const y = p.x * m.b + p.y * m.d + m.f;
            if (x > r.left + inset && x < r.right - inset && y > r.top + inset && y < r.bottom - inset) {
              out.push(`${e.id} crosses ${id}`);
              break;
            }
          }
        }
      }
      return out;
    },
    edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  );
  // Measured: 26 crossings before lines avoided boxes (by the same sampling: see tests/routing.test.ts), none now.
  expect(crossings, crossings.join("\n")).toEqual([]);
});

test("automatic lines in one corridor are spread into lanes instead of lying on each other", async ({ page, server }) => {
  await openDiagram(page, KEY);
  const diagram = await api(server, `/diagrams/${KEY}`);
  const ids: string[] = diagram.edges.map((e: { id: string }) => e.id);
  // The straight pieces (the L commands of a rounded path) of every line, in diagram coordinates.
  const pieces = await page.evaluate((list) => {
    return list.map((id) => {
      const path = document.querySelector(`[data-testid="rf__edge-${id}"] path.react-flow__edge-path`) as SVGPathElement | null;
      const out: { x1: number; y1: number; x2: number; y2: number }[] = [];
      let cur: [number, number] | null = null;
      for (const m of (path?.getAttribute("d") ?? "").matchAll(/([MLQ])([^MLQ]*)/g)) {
        const v = (m[2] ?? "")
          .trim()
          .split(/[\s,]+/)
          .map(Number);
        const to: [number, number] = [v[v.length - 2] ?? 0, v[v.length - 1] ?? 0];
        if (m[1] === "L" && cur) out.push({ x1: cur[0], y1: cur[1], x2: to[0], y2: to[1] });
        cur = to;
      }
      return out;
    });
  }, ids);
  // Pieces of two different lines on the same row or column (within 4px) that share more than 20px.
  const shared: string[] = [];
  for (let a = 0; a < ids.length; a++)
    for (let b = a + 1; b < ids.length; b++)
      for (const p of pieces[a]!)
        for (const q of pieces[b]!) {
          const horizontal = Math.abs(p.y1 - p.y2) < 0.01 && Math.abs(q.y1 - q.y2) < 0.01;
          const vertical = Math.abs(p.x1 - p.x2) < 0.01 && Math.abs(q.x1 - q.x2) < 0.01;
          if (!horizontal && !vertical) continue;
          const [c, d] = horizontal ? [p.y1, q.y1] : [p.x1, q.x1];
          if (Math.abs(c - d) > 4) continue;
          const [p1, p2, q1, q2] = horizontal ? [p.x1, p.x2, q.x1, q.x2] : [p.y1, p.y2, q.y1, q.y2];
          const overlap = Math.min(Math.max(p1, p2), Math.max(q1, q2)) - Math.max(Math.min(p1, p2), Math.min(q1, q2));
          if (overlap > 20) shared.push(`${ids[a]} ~ ${ids[b]}: ${overlap.toFixed(0)}px`);
        }
  // Measured on the demo geometry in tests/routing.test.ts: 6 before lanes, 1 now (two pieces at ports, which stay put).
  // One more is allowed for differences in the real box sizes.
  expect(shared.length, shared.join("\n")).toBeLessThanOrEqual(2);
});

test("few labels sit on another line", async ({ page, server }) => {
  await openDiagram(page, KEY);
  const diagram = await api(server, `/diagrams/${KEY}`);
  const ids: string[] = diagram.edges.map((e: { id: string }) => e.id);
  const crossed = await page.evaluate((list) => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(".edge-label")) {
      const own = (el.dataset.testid ?? "").replace(/^edge-/, "");
      const r = el.getBoundingClientRect();
      const inset = 2; // screen px: a line running along the label's border is not on it
      let hit = false;
      for (const id of list) {
        if (id === own || hit) continue;
        const path = document.querySelector(`[data-testid="rf__edge-${id}"] path.react-flow__edge-path`) as SVGPathElement | null;
        if (!path) continue;
        const m = path.getScreenCTM()!;
        const total = path.getTotalLength();
        const scale = Math.hypot(m.a, m.b) || 1;
        const steps = Math.max(2, Math.ceil((total * scale) / 3));
        for (let i = 0; i <= steps && !hit; i++) {
          const p = path.getPointAtLength((total * i) / steps);
          const x = p.x * m.a + p.y * m.c + m.e;
          const y = p.x * m.b + p.y * m.d + m.f;
          if (x > r.left + inset && x < r.right - inset && y > r.top + inset && y < r.bottom - inset) hit = true;
        }
      }
      if (hit) out.push(own);
    }
    return out;
  }, ids);
  // Measured on the demo geometry in tests/routing.test.ts (estimated label sizes): 19 of 27 labels were crossed by another line
  // before labels looked at lines, 11 now (the line weight is 8; 15 at 2); the diagram is dense, so some crossings cannot be avoided. Two more are allowed
  // because real font metrics change the label sizes a little.
  expect(crossed.length, crossed.join("\n")).toBeLessThanOrEqual(13);
});

test("moving one box by hand redraws only its own lines; every other line and label stays exactly where it was", async ({ page, server }) => {
  await openDiagram(page, KEY);
  const diagram = await api(server, `/diagrams/${KEY}`);
  const edges: { id: string; source: string; target: string }[] = diagram.edges;
  const moved = "web-application";
  const own = new Set(edges.filter((e) => e.source === moved || e.target === moved).map((e) => e.id));
  expect(own.size).toBeGreaterThan(0);
  expect(edges.length - own.size).toBeGreaterThan(3);

  const snapshot = () =>
    page.evaluate(
      (ids) =>
        Object.fromEntries(
          ids.map((id) => {
            const d = document.querySelector(`[data-testid="rf__edge-${id}"] path.react-flow__edge-path`)?.getAttribute("d") ?? null;
            const r = document.querySelector(`[data-testid="edge-${id}"]`)?.getBoundingClientRect();
            return [id, { d, label: r ? `${Math.round(r.x)},${Math.round(r.y)}` : null }];
          }),
        ),
      edges.map((e) => e.id),
    );
  await page.waitForTimeout(300);
  const before = await snapshot();

  const box = (await page.getByTestId(`node-${moved}`).boundingBox())!;
  const at = { x: box.x + box.width / 2, y: box.y + 12 };
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 40, at.y + 30, { steps: 8 });
  await page.mouse.up();
  // Wait until the move is saved and the model has been read back.
  const was = diagram.nodes.find((n: { id: string }) => n.id === moved).position;
  await waitUntil(async () => {
    const now = (await api(server, `/diagrams/${KEY}`)).nodes.find((n: { id: string }) => n.id === moved).position;
    return now.x !== was.x || now.y !== was.y;
  });
  await page.waitForTimeout(500);
  const after = await snapshot();

  for (const e of edges) {
    if (own.has(e.id)) continue;
    expect(after[e.id], `${e.id} did not change`).toEqual(before[e.id]);
  }
  expect([...own].some((id) => after[id]!.d !== before[id]!.d)).toBe(true);
});
