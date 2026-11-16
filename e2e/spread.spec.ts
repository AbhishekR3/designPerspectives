/** Make room and Spread out: the Internet Banking System containers diagram. */
import fs from "node:fs";
import path from "node:path";
import { api, expect, node, openDiagram, test, waitUntil, type Server } from "./fixtures.js";

const KEY = "containers-internet-banking-system";
type P = Record<string, { x: number; y: number }>;
type Size = { w: number; h: number };
const NODE = { w: 225, h: 120 }; // the default box size of a person, system or container

/** Positions and sizes of the boxes as saved (waits until the first layout has been saved). */
async function saved(server: Server): Promise<{ pos: P; size: Record<string, Size>; inScope: string[] }> {
  return waitUntil(async () => {
    const d = await api(server, `/diagrams/${KEY}`);
    const nodes = d.nodes as { id: string; position: { x: number; y: number } | null; size: Size | null; inScope: boolean }[];
    if (!nodes.length || nodes.some((n) => !n.position)) return null;
    return {
      pos: Object.fromEntries(nodes.map((n) => [n.id, n.position!])) as P,
      size: Object.fromEntries(nodes.map((n) => [n.id, n.size ?? NODE])),
      inScope: nodes.filter((n) => n.inScope).map((n) => n.id),
    };
  });
}

async function putPositions(server: Server, positions: P): Promise<void> {
  const r = await fetch(`${server.url}api/diagrams/${KEY}/positions`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ positions }) });
  expect(r.status).toBe(200);
}

const gapX = (p: P, s: Record<string, Size>, a: string, b: string) => Math.max(p[a]!.x, p[b]!.x) - Math.min(p[a]!.x + s[a]!.w, p[b]!.x + s[b]!.w);
const gapY = (p: P, s: Record<string, Size>, a: string, b: string) => Math.max(p[a]!.y, p[b]!.y) - Math.min(p[a]!.y + s[a]!.h, p[b]!.y + s[b]!.h);

test("Make room widens boxes squeezed together, keeps their order, and one undo restores them", async ({ page, server }) => {
  await openDiagram(page, KEY);
  const before = await saved(server);
  // Three boxes of the system squeezed to 15px apart, in free space below everything.
  const ids = ["single-page-application", "mobile-app", "web-application"];
  const bottom = Math.max(...Object.keys(before.pos).map((id) => before.pos[id]!.y + before.size[id]!.h));
  const left = Math.min(...Object.values(before.pos).map((p) => p.x));
  const squeezed: P = { ...before.pos };
  ids.forEach((id, i) => (squeezed[id] = { x: left + i * (NODE.w + 15), y: bottom + 250 }));
  await putPositions(server, squeezed);
  await page.reload();
  await openDiagram(page, KEY);
  await expect(page.getByTestId("make-room")).toBeVisible();
  await expect(page.getByTestId("spread-out")).toBeVisible();

  await page.getByTestId("make-room").click();
  const after = await waitUntil(async () => {
    const s = await saved(server);
    return ids.some((id) => s.pos[id]!.x !== squeezed[id]!.x || s.pos[id]!.y !== squeezed[id]!.y) ? s : null;
  });

  // On screen the crowded neighbours are now at least 50 diagram units apart (screen pixels divided by the zoom).
  await page.waitForTimeout(700); // the view fits again
  const rect = async (id: string) => (await node(page, id).boundingBox())!;
  const [a, b, c] = [await rect(ids[0]!), await rect(ids[1]!), await rect(ids[2]!)];
  const zoom = a.width / NODE.w;
  expect((b.x - (a.x + a.width)) / zoom).toBeGreaterThanOrEqual(49.5);
  expect((c.x - (b.x + b.width)) / zoom).toBeGreaterThanOrEqual(49.5);
  // The same in the saved positions, and no box overlaps another.
  expect(gapX(after.pos, after.size, ids[0]!, ids[1]!)).toBeGreaterThanOrEqual(50);
  expect(gapX(after.pos, after.size, ids[1]!, ids[2]!)).toBeGreaterThanOrEqual(50);
  const all = Object.keys(after.pos);
  for (const [i, p] of all.entries()) {
    for (const q of all.slice(i + 1)) {
      expect(gapX(after.pos, after.size, p, q) < 0 && gapY(after.pos, after.size, p, q) < 0, `${p} overlaps ${q}`).toBe(false);
      // Nothing changes sides, and no distance shrinks.
      for (const [axis, size] of [
        ["x", "w"],
        ["y", "h"],
      ] as const) {
        const dist = (pos: P) => pos[q]![axis] + after.size[q]![size] / 2 - (pos[p]![axis] + after.size[p]![size] / 2);
        expect(Math.sign(dist(after.pos))).toBe(Math.sign(dist(squeezed)));
        expect(Math.abs(dist(after.pos))).toBeGreaterThanOrEqual(Math.abs(dist(squeezed)));
      }
    }
  }

  // One undo puts every box back where it was before Make room.
  await page.getByTestId("undo").click();
  await waitUntil(async () => {
    const s = await saved(server);
    return JSON.stringify(s.pos) === JSON.stringify(squeezed);
  });
});

test("Spread out grows the space between neighbouring boxes by at least 15 percent", async ({ page, server }) => {
  await openDiagram(page, KEY);
  const before = await saved(server);
  const ids = Object.keys(before.pos);
  // The two boxes side by side that are closest together.
  let pair: [string, string] | null = null;
  let best = Infinity;
  for (const [i, a] of ids.entries()) {
    for (const b of ids.slice(i + 1)) {
      const g = gapX(before.pos, before.size, a, b);
      if (g > 0 && gapY(before.pos, before.size, a, b) < 0 && g < best) {
        best = g;
        pair = [a, b];
      }
    }
  }
  expect(pair).not.toBeNull();
  const [a, b] = pair!;
  await page.getByTestId("spread-out").click();
  const after = await waitUntil(async () => {
    const s = await saved(server);
    return JSON.stringify(s.pos) !== JSON.stringify(before.pos) ? s : null;
  });
  expect(gapX(after.pos, after.size, a, b)).toBeGreaterThanOrEqual(best * 1.15);
  expect(Math.sign(after.pos[b]!.x - after.pos[a]!.x)).toBe(Math.sign(before.pos[b]!.x - before.pos[a]!.x));
});

test("with three boxes selected, Spread out spreads only those, around their centre, in one undo step", async ({ page, server }) => {
  await openDiagram(page, KEY);
  const before = await saved(server);
  const ids = ["single-page-application", "mobile-app", "web-application"];
  const far = "database";
  const bottom = Math.max(...Object.keys(before.pos).map((id) => before.pos[id]!.y + before.size[id]!.h));
  const left = Math.min(...Object.values(before.pos).map((p) => p.x));
  // The three in a row 60px apart in free space below everything, and one other box far away to the right of them.
  const start: P = { ...before.pos };
  ids.forEach((id, i) => (start[id] = { x: left + i * (NODE.w + 60), y: bottom + 250 }));
  start[far] = { x: left + 1800, y: bottom + 250 };
  await putPositions(server, start);
  await page.reload();
  await openDiagram(page, KEY);

  await node(page, ids[0]!).click();
  await node(page, ids[1]!).click({ modifiers: ["Shift"] });
  await node(page, ids[2]!).click({ modifiers: ["Shift"] });
  await expect(page.getByTestId("multi-count")).toHaveText("3 objects selected");
  await expect(page.getByTestId("spread-out")).toHaveAttribute("aria-label", "Spread out (selected boxes)");
  await expect(page.getByTestId("make-room")).toHaveAttribute("title", /Make room \(selected boxes\)/);
  await page.getByTestId("spread-out").click();
  const after = await waitUntil(async () => {
    const s = await saved(server);
    return ids.some((id) => s.pos[id]!.x !== start[id]!.x) ? s : null;
  });

  // The gaps between the three grew by at least 15 percent; the unselected boxes did not move.
  expect(gapX(after.pos, after.size, ids[0]!, ids[1]!)).toBeGreaterThanOrEqual(60 * 1.15);
  expect(gapX(after.pos, after.size, ids[1]!, ids[2]!)).toBeGreaterThanOrEqual(60 * 1.15);
  for (const id of Object.keys(start).filter((i) => !ids.includes(i))) expect(after.pos[id], id).toEqual(start[id]);
  // The group grew around its centre.
  const mid = (p: P) => (Math.min(...ids.map((i) => p[i]!.x)) + Math.max(...ids.map((i) => p[i]!.x + NODE.w))) / 2;
  expect(Math.abs(mid(after.pos) - mid(start))).toBeLessThanOrEqual(1);

  // One undo restores every box.
  await page.getByTestId("undo").click();
  await waitUntil(async () => {
    const s = await saved(server);
    return JSON.stringify(s.pos) === JSON.stringify(start);
  });

  // The right-click menu on one of the selected boxes offers the same two actions, named for the selection.
  await node(page, ids[0]!).click();
  await node(page, ids[1]!).click({ modifiers: ["Shift"] });
  await node(page, ids[2]!).click({ modifiers: ["Shift"] });
  await node(page, ids[1]!).click({ button: "right" });
  await expect(page.getByTestId("ctx-make-room")).toHaveText(/Make room \(selected boxes\)/);
  await expect(page.getByTestId("ctx-spread-out")).toHaveText(/Spread out \(selected boxes\)/);
});

test("Make room on a diagram with plenty of space shows a notice and saves nothing", async ({ page, server }) => {
  await openDiagram(page, KEY);
  const before = await saved(server);
  const ids = Object.keys(before.pos);
  const roomy: P = {};
  ids.forEach((id, i) => (roomy[id] = { x: (i % 4) * 700, y: Math.floor(i / 4) * 500 }));
  await putPositions(server, roomy);
  await page.reload();
  await openDiagram(page, KEY);
  const files = ["workspace.json", "designperspectives.json"].map((f) => path.join(server.root, "architecture", f));
  const stamp = () => files.map((f) => `${fs.statSync(f).mtimeMs}:${fs.statSync(f).size}`);
  const stamped = stamp();

  await page.getByTestId("make-room").click();
  await expect(page.getByTestId("toast-info").filter({ hasText: "Nothing is too close." }).last()).toBeVisible();
  await page.waitForTimeout(500);
  expect((await saved(server)).pos).toEqual(roomy);
  expect(stamp()).toEqual(stamped);

  // The empty-canvas menu offers the same two actions.
  const box = (await page.getByTestId("canvas").boundingBox())!;
  await page.getByTestId("canvas").click({ button: "right", position: { x: box.width - 15, y: box.height / 2 } });
  await expect(page.getByTestId("ctx-make-room")).toBeVisible();
  await expect(page.getByTestId("ctx-spread-out")).toBeVisible();
  await page.getByTestId("ctx-make-room").click();
  await expect(page.getByTestId("toast-info").filter({ hasText: "Nothing is too close." }).last()).toBeVisible();
});

test.describe("read-only", () => {
  test.use({ readOnly: true });
  test("the buttons are not offered", async ({ page }) => {
    await openDiagram(page, KEY);
    await expect(page.getByTestId("make-room")).toHaveCount(0);
    await expect(page.getByTestId("spread-out")).toHaveCount(0);
  });
});
