/** Stage P2 canvas fixes: no Cut, one add per click, a Delete key that follows the menu, one rename request,
 *  shortcuts that stay quiet while typing, a toolbar that fits read-only views, and ? for help. */

import { api, clickEmptyCanvas, expect, node, openDiagram, test, waitUntil, type Server } from "./fixtures.js";

const elements = async (server: Server) => (await api(server, "/state")).elements as any[];

test("there is no Cut: not in the menu, and Ctrl+X does nothing", async ({ page, server }) => {
  await openDiagram(page, "containers-internet-banking-system");
  const n = node(page, "api-application");
  await n.click();
  await n.click({ button: "right" });
  await expect(page.getByTestId("ctx-copy")).toBeVisible();
  await expect(page.getByTestId("ctx-cut")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await n.click();
  await page.keyboard.press("Control+x");
  await expect(page.getByTestId("dialog")).toHaveCount(0);
  expect((await elements(server)).some((e) => e.id === "api-application")).toBe(true);
});

test("a double click on a palette item adds one box", async ({ page, server }) => {
  await openDiagram(page, "containers-internet-banking-system");
  const before = (await elements(server)).filter((e) => e.name.startsWith("Queue")).length;
  await page.getByTestId("add-container-queue").dblclick();
  await page.getByTestId("inline-name").press("Escape");
  await waitUntil(async () => (await elements(server)).filter((e) => e.name.startsWith("Queue")).length > before);
  await page.waitForTimeout(800);
  expect((await elements(server)).filter((e) => e.name.startsWith("Queue")).length).toBe(before + 1);
});

test("Enter in the inline name sends one rename", async ({ page, server }) => {
  await openDiagram(page, "containers-internet-banking-system");
  const patches: string[] = [];
  page.on("request", (r) => r.method() === "PATCH" && /\/api\/elements\//.test(r.url()) && patches.push(r.url()));
  await page.getByTestId("add-container").click();
  await page.getByTestId("inline-name").fill("Ledger");
  await page.getByTestId("inline-name").press("Enter");
  await waitUntil(async () => (await elements(server)).find((e) => e.name === "Ledger"));
  await page.waitForTimeout(600);
  expect(patches).toHaveLength(1);
});

test("the Delete key does nothing while typing in a field, and asks first on the canvas", async ({ page, server }) => {
  await openDiagram(page, "containers-internet-banking-system");
  await node(page, "api-application").click();
  const field = page.getByTestId("field-name");
  await field.click();
  await field.press("End");
  await field.press("Delete"); // nothing after the cursor: the text stays as it is
  await expect(page.getByTestId("dialog")).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("dialog")).toHaveCount(0);
  // From the canvas, Delete asks first, with the same wording as the menu.
  await clickEmptyCanvas(page);
  await node(page, "api-application").click();
  await page.keyboard.press("Delete");
  await expect(page.getByTestId("dialog")).toContainText('Delete "API Application"');
  await expect(page.getByTestId("dialog")).toContainText("Its connections are deleted too.");
  await page.getByTestId("dialog-cancel").click();
  expect((await elements(server)).some((e) => e.id === "api-application")).toBe(true);
});

test("? toggles the help card", async ({ page }) => {
  await openDiagram(page, "landscape");
  await expect(page.getByTestId("help-card")).toHaveCount(0);
  await page.keyboard.press("?");
  await expect(page.getByTestId("help-card")).toBeVisible();
  await page.keyboard.press("?");
  await expect(page.getByTestId("help-card")).toHaveCount(0);
});

test.describe("read-only", () => {
  test.use({ readOnly: true });

  test("no Undo, Redo or Auto-layout; the Delete key does nothing", async ({ page, server }) => {
    await openDiagram(page, "containers-internet-banking-system");
    await expect(page.getByTestId("export")).toBeVisible();
    for (const id of ["undo", "redo", "auto-layout"]) await expect(page.getByTestId(id)).toHaveCount(0);
    await node(page, "api-application").click();
    await page.keyboard.press("Delete");
    await expect(page.getByTestId("dialog")).toHaveCount(0);
    expect((await elements(server)).some((e) => e.id === "api-application")).toBe(true);
  });
});
