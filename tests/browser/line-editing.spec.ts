/** Dragging a piece of a right-angle line stores its corners; double-click and the line menu go back to the automatic shape; undo works. */
import type { Page } from "@playwright/test";
import { api, expect, openDiagram, test, waitUntil, type Server } from "./fixtures.js";

const KEY = "containers-internet-banking-system";

async function dragBy(page: Page, x: number, y: number, dx: number, dy: number, steps = 8) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps });
  await page.mouse.up();
}

const edgeOf = async (server: Server, id: string) => (await api(server, `/diagrams/${KEY}`)).edges.find((e: { id: string }) => e.id === id);

/** The drawn line's pieces are horizontal or vertical (the L commands of the path). */
async function straightPieces(page: Page, id: string): Promise<boolean> {
  const d = await page.locator(`[data-testid="rf__edge-${id}"] path.react-flow__edge-path`).getAttribute("d");
  let cur: [number, number] | null = null;
  for (const m of (d ?? "").matchAll(/([MLQ])([^MLQ]*)/g)) {
    const v = (m[2] ?? "")
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    const to: [number, number] = [v[v.length - 2] ?? 0, v[v.length - 1] ?? 0];
    if (m[1] === "L" && cur && Math.min(Math.abs(to[0] - cur[0]), Math.abs(to[1] - cur[1])) > 0.01) return false;
    cur = to;
  }
  return true;
}

test("drag a piece of a line, then go back to the automatic shape", async ({ page, server }) => {
  await openDiagram(page, KEY);
  const edges: { id: string; layout: Record<string, unknown> }[] = (await api(server, `/diagrams/${KEY}`)).edges;
  // a line with a piece long enough to have a handle
  let id: string | null = null;
  for (const e of edges) {
    await page.getByTestId(`edge-${e.id}`).click({ force: true });
    if ((await page.locator('[data-testid^="grip-seg-"]').count()) > 0) {
      id = e.id;
      break;
    }
  }
  expect(id, "a line with a piece handle").not.toBeNull();
  const handle = page.locator('[data-testid^="grip-seg-"]').first();
  const cursor = await handle.evaluate((el) => getComputedStyle(el).cursor);
  expect(["ns-resize", "ew-resize"]).toContain(cursor);
  const b = (await handle.boundingBox())!;
  // move it across its own direction
  const [dx, dy] = cursor === "ns-resize" ? [0, 40] : [40, 0];
  await dragBy(page, b.x + b.width / 2, b.y + b.height / 2, dx, dy);
  const saved = await waitUntil(async () => (await edgeOf(server, id!)).layout.points as { x: number; y: number }[] | undefined);
  expect(saved.length).toBeGreaterThan(0);
  expect(await straightPieces(page, id!)).toBe(true);

  // undo takes the corners away again
  await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
  await waitUntil(async () => (await edgeOf(server, id!)).layout.points === undefined);

  // drag again, then double-click a piece handle: back to automatic
  await page.getByTestId(`edge-${id}`).click({ force: true });
  // the line is drawn again once the change is loaded: take a handle that stays
  const b2 = await waitUntil(async () => page.locator('[data-testid^="grip-seg-"]').first().boundingBox());
  await dragBy(page, b2.x + b2.width / 2, b2.y + b2.height / 2, dx, dy);
  await waitUntil(async () => (await edgeOf(server, id!)).layout.points);
  await page.locator('[data-testid^="grip-seg-"]').first().dblclick();
  await waitUntil(async () => (await edgeOf(server, id!)).layout.points === undefined);

  // drag again, then "Reset line shape" in the line's menu
  await page.getByTestId(`edge-${id}`).click({ force: true });
  // the line is drawn again once the change is loaded: take a handle that stays
  const b3 = await waitUntil(async () => page.locator('[data-testid^="grip-seg-"]').first().boundingBox());
  await dragBy(page, b3.x + b3.width / 2, b3.y + b3.height / 2, dx, dy);
  await waitUntil(async () => (await edgeOf(server, id!)).layout.points);
  await page.getByTestId(`edge-${id}`).click({ button: "right", force: true });
  await page.getByTestId("ctx-reset-line-shape").click();
  await waitUntil(async () => (await edgeOf(server, id!)).layout.points === undefined);
});

test("a press on the line itself drags the piece under the pointer; a click only selects", async ({ page, server }) => {
  await openDiagram(page, KEY);
  const edges: { id: string }[] = (await api(server, `/diagrams/${KEY}`)).edges;
  const id = edges[0]!.id;
  await page.getByTestId(`edge-${id}`).click({ force: true });
  const hits = page.locator(`[data-testid="rf__edge-${id}"] [data-testid^="edge-hit-"]`);
  await expect(hits.first()).toBeAttached();
  // the longest piece
  const boxes = await hits.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })));
  const longest = boxes.reduce((m, r) => (Math.max(r.w, r.h) > Math.max(m.w, m.h) ? r : m));
  // a point on that piece that the line itself gets (the label sits on the line, often at a piece's middle)
  const horizontalPiece = longest.w > longest.h;
  const candidates = [0.25, 0.75, 0.15, 0.85, 0.5].map((f) =>
    horizontalPiece ? { x: longest.x + longest.w * f, y: longest.y + longest.h / 2 } : { x: longest.x + longest.w / 2, y: longest.y + longest.h * f },
  );
  const hitsAt = await Promise.all(candidates.map((c) => page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.getAttribute("data-testid") ?? "", [c.x, c.y])));
  const at =
    candidates[
      Math.max(
        0,
        hitsAt.findIndex((t) => t.startsWith("edge-hit-")),
      )
    ]!;
  // a click changes nothing
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(400);
  expect((await edgeOf(server, id)).layout.points).toBeUndefined();
  const horizontal = longest.w > longest.h;
  await dragBy(page, at.x, at.y, horizontal ? 0 : 50, horizontal ? 50 : 0);
  await waitUntil(async () => (await edgeOf(server, id)).layout.points);
  expect(await straightPieces(page, id)).toBe(true);
});
