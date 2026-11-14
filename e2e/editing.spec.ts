/** 0.2: add palette (drag and drop, click), connect to empty space, rename on the canvas, quick bar,
 *  labels that slide only along their line, line shapes and arrowheads, linked work. */

import type { Page } from "@playwright/test";
import { api, expect, openDiagram, test, waitUntil, type Server } from "./fixtures.js";

const elements = async (server: Server) => (await api(server, "/state")).elements as any[];

/** HTML5 drag and drop from the palette onto the canvas at (x, y) in page coordinates. */
async function dropItem(page: Page, testId: string, x: number, y: number) {
  await page.evaluate(
    ([id, px, py]) => {
      const src = document.querySelector(`[data-testid="${id}"]`)!;
      const pane = document.querySelector(".react-flow__pane")!;
      const dt = new DataTransfer();
      src.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }));
      for (const type of ["dragenter", "dragover", "drop"]) {
        pane.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: px as number, clientY: py as number }));
      }
    },
    [testId, x, y] as const,
  );
}

test("drag a database from the palette", async ({ page, server }) => {
  await openDiagram(page, "containers-internet-banking-system");
  const box = (await page.getByTestId("canvas").boundingBox())!;
  await dropItem(page, "add-container-database", box.x + box.width - 260, box.y + 200);
  const field = page.getByTestId("inline-name");
  await expect(field).toBeFocused();
  await field.fill("Ledger DB");
  await field.press("Enter");
  const el = await waitUntil(async () => (await elements(server)).find((e) => e.name === "Ledger DB"));
  expect([el.kind, el.archType, el.parentId]).toEqual(["container", "database", "internet-banking-system"]);
  await expect(page.getByTestId(`node-${el.id}`)).toHaveAttribute("data-shape", "database");
});

test("click a palette item, and the quick bar", async ({ page, server }) => {
  await openDiagram(page, "containers-internet-banking-system");
  await page.getByTestId("add-container-queue").click();
  await page.getByTestId("inline-name").press("Escape");
  const el = await waitUntil(async () => (await elements(server)).find((e) => e.name.startsWith("Queue")));
  expect(el.archType).toBe("queue");
  // Quick bar: change the symbol, then delete.
  await page.getByTestId("qb-symbol").selectOption("pipeline");
  await waitUntil(async () => (await elements(server)).find((e) => e.id === el.id)?.archType === "pipeline");
  await page.getByTestId("qb-delete").click();
  await waitUntil(async () => !(await elements(server)).some((e) => e.id === el.id));
});

test("a line to empty space adds a connected box", async ({ page, server }) => {
  await openDiagram(page, "containers-internet-banking-system");
  const before = new Set((await elements(server)).map((e) => e.id));
  const src = page.getByTestId("node-api-application");
  await src.hover();
  const h = (await src.locator(".connect-handle.h-r").boundingBox())!;
  const box = (await page.getByTestId("canvas").boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 120, box.y + box.height / 2 + 40, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByTestId("inline-name")).toBeFocused();
  await page.getByTestId("inline-name").press("Escape");
  const added = await waitUntil(async () => {
    const n = (await elements(server)).filter((e) => !before.has(e.id));
    return n.length ? n : null;
  });
  expect(added).toHaveLength(1);
  expect(added[0].kind).toBe("container");
  const rels = (await api(server, "/state")).relationships;
  expect(rels.some((r: any) => r.sourceId === "api-application" && r.destinationId === added[0].id)).toBe(true);
});

test("a label slides only along its line", async ({ page }) => {
  await openDiagram(page, "containers-internet-banking-system");
  const label = page.getByTestId("edge-web-application--single-page-application");
  const b = (await label.boundingBox())!;
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 200, cy + 200, { steps: 8 }); // pull far off the line
  await page.mouse.up();
  await page.waitForTimeout(500);
  // The label's centre must still lie on the line: its distance to the straight line between
  // the two boxes' centres stays small.
  const d = await page.evaluate(() => {
    const c = (id: string) => {
      const r = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
      return [r.x + r.width / 2, r.y + r.height / 2] as const;
    };
    const [ax, ay] = c("node-web-application");
    const [bx, by] = c("node-single-page-application");
    const [px, py] = c("edge-web-application--single-page-application");
    return Math.abs((by - ay) * px - (bx - ax) * py + bx * ay - by * ax) / Math.hypot(by - ay, bx - ax);
  });
  expect(d).toBeLessThan(25);
});

test("line shapes and arrowheads", async ({ page, server }) => {
  await openDiagram(page, "containers-internet-banking-system");
  await page.getByTestId("edge-web-application--single-page-application").click();
  for (const shape of ["smooth", "rounded", "orthogonal", "curved", "straight"]) {
    await page.getByTestId("line-shape").selectOption(shape);
    await page.waitForTimeout(250);
  }
  const d = await api(server, "/diagrams/containers-internet-banking-system");
  expect(d.edges.find((x: any) => x.id === "web-application--single-page-application").layout.routing).toBe("straight");
  await page.getByRole("button", { name: "Appearance" }).click();
  await page.getByTestId("style-arrow-head").selectOption("diamond");
  await waitUntil(async () => (await api(server, "/state")).styles["web-application--single-page-application"]?.arrowHead === "diamond");
  const p = page.locator('[data-testid="rf__edge-web-application--single-page-application"] path.react-flow__edge-path');
  await expect(p).toHaveAttribute("marker-end", "url('#dp-head-diamond')");
});

test("link work and the work overlay", async ({ page, server }) => {
  await openDiagram(page, "containers-internet-banking-system");
  await page.getByTestId("node-web-application").click();
  const sec = page.getByTestId("sec-work");
  await sec.locator("button.p-section-head").click();
  await sec.getByTestId("work-add").click();
  const row = sec.locator(".work-row").last();
  await row.getByTestId("work-type").selectOption("security");
  await row.getByTestId("work-title").fill("Session cookie lacks SameSite");
  await row.getByTestId("work-title").blur();
  const el = await waitUntil(async () => (await elements(server)).find((e) => e.id === "web-application" && e.work.length));
  expect([el.work[0].type, el.work[0].status]).toEqual(["security", "open"]);
  await page.getByTestId("dock-work").click();
  await page.locator("[data-testid='overlay-@work:security']").click();
  await expect(page.getByTestId("badge-web-application")).toContainText("1 open");
  await expect(page.getByTestId("badge-api-application")).toContainText("high");
});
