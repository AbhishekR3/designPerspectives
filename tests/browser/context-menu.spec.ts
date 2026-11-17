/** Right-click menus on boxes, lines and empty canvas. */

import type { Page } from "@playwright/test";
import { api, confirmDialog, expect, node, openDiagram, test, waitUntil, type Server } from "./fixtures.js";

const KEY = "containers-internet-banking-system";
const EDGE = "web-application--single-page-application";
const elements = async (server: Server) => (await api(server, "/state")).elements as any[];
const menu = (page: Page) => page.getByTestId("context-menu");

/** Right-click empty canvas: the right edge, mid-height (floating bars and the palette cover the rest). */
async function rightClickEmpty(page: Page, dy = 0) {
  const box = (await page.getByTestId("canvas").boundingBox())!;
  await page.getByTestId("canvas").click({ button: "right", position: { x: box.width - 40, y: box.height / 2 + dy } });
}

test("right-click a box: symbol, duplicate, delete", async ({ page, server }) => {
  await openDiagram(page, KEY);
  await node(page, "api-application").click({ button: "right" });
  await expect(menu(page)).toBeVisible();
  // Right-click also selects the box, like a left click.
  await expect(page.getByTestId("node-api-application")).toHaveClass(/selected/);
  await page.getByTestId("ctx-symbol").hover();
  await page.getByTestId("ctx-symbol-database").click();
  await expect(menu(page)).toHaveCount(0);
  await waitUntil(async () => (await elements(server)).find((e) => e.id === "api-application")?.archType === "database");

  await node(page, "api-application").click({ button: "right" });
  await page.getByTestId("ctx-duplicate").click();
  const copy = await waitUntil(async () => (await elements(server)).find((e) => e.name === "API Application copy"));
  await expect(node(page, copy.id)).toBeVisible();

  await node(page, copy.id).click({ button: "right" });
  await page.getByTestId("ctx-delete").click();
  await confirmDialog(page);
  await waitUntil(async () => !(await elements(server)).some((e) => e.id === copy.id));
});

test("right-click empty canvas: add here, paste here", async ({ page, server }) => {
  await openDiagram(page, KEY);
  const before = new Set((await elements(server)).map((e) => e.id));
  await rightClickEmpty(page);
  await expect(page.getByTestId("ctx-node-api-application")).toHaveCount(0); // a pane menu, not a box menu
  await page.getByTestId("ctx-add").hover();
  await page.getByTestId("ctx-add-container-queue").click();
  const field = page.getByTestId("inline-name");
  await expect(field).toBeFocused();
  await field.fill("Events");
  await field.press("Enter");
  const added = await waitUntil(async () => (await elements(server)).find((e) => !before.has(e.id) && e.name === "Events"));
  expect([added.kind, added.archType, added.parentId]).toEqual(["container", "queue", "internet-banking-system"]);
  // Placed near the click (the right edge of the view), not in the middle of the diagram.
  const canvas = (await page.getByTestId("canvas").boundingBox())!;
  const placed = (await node(page, added.id).boundingBox())!;
  expect(placed.x + placed.width / 2).toBeGreaterThan(canvas.x + canvas.width / 2);

  // Copy from a box's menu, paste from the canvas menu: the copy goes where the menu was opened.
  await node(page, "api-application").click({ button: "right" });
  await page.getByTestId("ctx-copy").click();
  await rightClickEmpty(page, 170);
  await expect(page.getByTestId("ctx-paste")).toHaveText(/Paste here/);
  await page.getByTestId("ctx-paste").click();
  const copy = await waitUntil(async () => (await elements(server)).find((e) => e.name === "API Application copy"));
  const d = await api(server, `/diagrams/${KEY}`);
  const pos = d.nodes.find((n: any) => n.id === copy.id).position;
  const orig = d.nodes.find((n: any) => n.id === "api-application").position;
  expect(pos).not.toEqual(orig);
  // One undo removes the pasted copy together with its position.
  await page.getByTestId("undo").click();
  await waitUntil(async () => !(await elements(server)).some((e) => e.id === copy.id));
});

test("right-click a line: shape, arrows, reset", async ({ page, server }) => {
  await openDiagram(page, KEY);
  const edge = async () => (await api(server, `/diagrams/${KEY}`)).edges.find((e: any) => e.id === EDGE);
  // Once the line is selected its bend grip sits on the label; a right-click there opens the same menu.
  const rightClickLine = () => page.getByTestId(`edge-${EDGE}`).click({ button: "right", force: true });
  await rightClickLine();
  await expect(menu(page)).toBeVisible();
  await expect(page.getByTestId("ctx-add")).toHaveCount(0); // a line menu, not the canvas menu
  await page.getByTestId("ctx-line-shape").hover();
  await page.getByTestId("ctx-line-orthogonal").click();
  await waitUntil(async () => (await edge()).layout.routing === "orthogonal");

  await rightClickLine();
  await expect(menu(page)).toBeVisible();
  await page.getByTestId("ctx-arrows").hover();
  await expect(page.getByTestId("ctx-arrow-end")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("ctx-arrow-both").click();
  await waitUntil(async () => (await edge()).style.arrow === "both");

  await rightClickLine();
  await page.getByTestId("ctx-reset-line").click();
  await waitUntil(async () => Object.keys((await edge()).layout).length === 0);
});

test("copy style from one box to another", async ({ page, server }) => {
  await openDiagram(page, KEY);
  await fetch(`${server.url}api/styles/api-application`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fill: "#fde047", fontSize: 18 }) });
  await page.reload();
  await openDiagram(page, KEY);
  await node(page, "api-application").click({ button: "right" });
  await page.getByTestId("ctx-copy-style").click();
  await node(page, "database").click({ button: "right" });
  await page.getByTestId("ctx-paste-style").click();
  await waitUntil(async () => (await api(server, `/diagrams/${KEY}`)).nodes.find((n: any) => n.id === "database")?.style.fill === "#fde047");
});

test("menu keys: arrows, Escape; canvas shortcuts stay off while it is open", async ({ page, server }) => {
  await openDiagram(page, KEY);
  await node(page, "api-application").click({ button: "right" });
  await expect(menu(page)).toBeFocused();
  // Delete goes to the menu, not to the selected box.
  await page.keyboard.press("Delete");
  await page.keyboard.press("Escape");
  await expect(menu(page)).toHaveCount(0);
  expect((await elements(server)).some((e) => e.id === "api-application")).toBe(true);

  // Keyboard into a submenu and back out: Symbol ▸ (first entry) → Enter.
  await node(page, "api-application").click({ button: "right" });
  for (let i = 0; i < 8 && !(await page.getByTestId("ctx-symbol").evaluate((b) => b.classList.contains("on"))); i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("ctx-symbol-box")).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("ctx-symbol-box")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(menu(page)).toHaveCount(0);

  // A click elsewhere closes it.
  await node(page, "api-application").click({ button: "right" });
  await page.getByTestId("search").click();
  await expect(menu(page)).toHaveCount(0);
});

test("flow diagrams: no editing items on lines", async ({ page }) => {
  // A flow is shown, not edited: its lines have no line or delete items.
  await openDiagram(page, "flow-sign-in");
  const firstEdge = page.locator(".edge-label").first();
  await firstEdge.click({ button: "right" });
  await expect(menu(page)).toBeVisible();
  await expect(page.getByTestId("ctx-line-shape")).toHaveCount(0);
  await expect(page.getByTestId("ctx-delete")).toHaveCount(0);
});
