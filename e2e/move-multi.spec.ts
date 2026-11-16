/** Stage P2: move a container or component to another parent, and select several boxes (Shift) to move or delete them together. */

import { api, clickEmptyCanvas, confirmDialog, expect, node, openDiagram, test, waitUntil, type Server } from "./fixtures.js";

const elements = async (server: Server) => (await api(server, "/state")).elements as any[];
const parentOf = async (server: Server, id: string) => (await elements(server)).find((e) => e.id === id)?.parentId;

const post = (server: Server, path: string, body: object) => fetch(server.url + "api" + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("move a component to another container from the menu", async ({ page, server }) => {
  // Seven other containers is a short list; with more than eight targets there is a filter box.
  for (const name of ["Billing API", "Search Index"]) await post(server, "/elements", { kind: "container", parentId: "analytics-platform", name });
  await page.reload();
  await openDiagram(page, "components-api-application");
  await node(page, "e-mail-component").click({ button: "right" });
  await page.getByTestId("ctx-move").click();
  const dialog = page.getByTestId("move-dialog");
  await expect(dialog).toBeVisible();
  // The current parent is not a target; with many targets there is a filter.
  await expect(page.getByTestId("move-target-api-application")).toHaveCount(0);
  await expect(page.getByTestId("move-target-sign-in-controller")).toHaveCount(0); // a component, not a container
  await expect(page.getByTestId("move-confirm")).toBeDisabled();
  await expect(page.getByTestId("move-filter")).toBeVisible();
  await page.getByTestId("move-filter").fill("event stream");
  await expect(page.getByTestId("move-target-web-application")).toHaveCount(0);
  await page.getByTestId("move-target-event-stream").click();
  await page.getByTestId("move-confirm").click();
  await expect(dialog).toHaveCount(0);

  expect(await parentOf(server, "e-mail-component")).toBe("event-stream");
  // The moved box is shown in its new place, selected.
  await expect(page.getByTestId("breadcrumb")).toContainText("Event Stream");
  await expect(node(page, "e-mail-component")).toBeVisible();
  await expect(page.getByTestId("object-panel")).toBeVisible();
  await expect(page.getByTestId("field-name")).toHaveValue("E-mail Component");
});

test("a refused move shows the server's message and keeps the dialog open", async ({ page, server }) => {
  await openDiagram(page, "components-api-application");
  await node(page, "sign-in-controller").click();
  await page.getByTestId("move-element").click();
  await page.getByTestId("move-target-single-page-application").click();
  await page.getByTestId("move-confirm").click();
  await expect(page.getByTestId("move-error")).toContainText("cannot move into");
  await expect(page.getByTestId("move-dialog")).toBeVisible();
  expect(await parentOf(server, "sign-in-controller")).toBe("api-application");
  // Pick one that works, in the same dialog.
  await page.getByTestId("move-target-database").click();
  await page.getByTestId("move-confirm").click();
  await expect(page.getByTestId("move-dialog")).toHaveCount(0);
  expect(await parentOf(server, "sign-in-controller")).toBe("database");
});

test("a container moves to a software system (and landscape boxes offer no Move)", async ({ page, server }) => {
  await openDiagram(page, "containers-internet-banking-system");
  await node(page, "mobile-app").click({ button: "right" });
  await page.getByTestId("ctx-move").click();
  // Software systems only (enough of them in the demo for a filter box); the current system is left out.
  await expect(page.getByTestId("move-target-internet-banking-system")).toHaveCount(0);
  await expect(page.getByTestId("move-filter")).toBeVisible();
  await page.getByTestId("move-target-atm").click();
  await page.getByTestId("move-confirm").click();
  await expect(page.getByTestId("move-dialog")).toHaveCount(0);
  expect(await parentOf(server, "mobile-app")).toBe("atm");
  await expect(page.getByTestId("breadcrumb")).toContainText("ATM");

  await page.getByTestId("nav-home").click();
  await node(page, "atm").click({ button: "right" });
  await expect(page.getByTestId("ctx-rename")).toBeVisible();
  await expect(page.getByTestId("ctx-move")).toHaveCount(0);
});

test("a move in a draft is listed with its parent before and after", async ({ page, server }) => {
  const r = await fetch(server.url + "api/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Reorganise" }) });
  const id = (await r.json()).id;
  await openDiagram(page, "components-api-application");
  await page.getByTestId(`draft-${id}`).click();
  await expect(page.getByTestId("draft-banner")).toContainText("Draft: Reorganise");
  await node(page, "e-mail-component").click({ button: "right" });
  await page.getByTestId("ctx-move").click();
  await expect(page.getByTestId("move-filter")).toBeVisible(); // every other container in the demo: a filter box
  await page.getByTestId("move-target-web-application").click();
  await page.getByTestId("move-confirm").click();
  await expect(page.getByTestId("move-dialog")).toHaveCount(0);
  const details = page.getByTestId("change-details");
  await expect(details).toBeVisible();
  await expect(details).toContainText("Parent");
  await expect(details.locator(".before")).toHaveText("API Application");
  await expect(details.locator(".after")).toHaveText("Web Application");
});

test("Shift+click selects several boxes; they move together and are deleted with one question and one undo", async ({ page, server }) => {
  await openDiagram(page, "containers-internet-banking-system");
  const ids: [string, string] = ["web-application", "mobile-app"];
  await node(page, ids[0]).click();
  await node(page, ids[1]).click({ modifiers: ["Shift"] });
  await expect(page.getByTestId("multi-count")).toHaveText("2 objects selected");
  // No quick bar while several are selected; plain click goes back to one.
  await expect(page.getByTestId("qb-delete")).toHaveCount(0);

  // Arrow keys nudge both together, saved in one request.
  const pos = async () => {
    const d = await api(server, "/diagrams/containers-internet-banking-system");
    return Object.fromEntries(ids.map((i) => [i, d.nodes.find((n: any) => n.id === i).position]));
  };
  const before = await pos();
  await page.keyboard.press("ArrowRight");
  const after = await waitUntil(async () => {
    const p = await pos();
    return p[ids[0]].x !== before[ids[0]].x ? p : null;
  });
  // Both moved right by the same step (the file counts in other units than the screen; allow for rounding), none vertically.
  const [dx0, dx1] = ids.map((i) => after[i].x - before[i].x) as [number, number];
  expect(dx0).toBeGreaterThan(0);
  expect(Math.abs(dx0 - dx1)).toBeLessThanOrEqual(2);
  for (const i of ids) expect(after[i].y).toBe(before[i].y);
  const undoAfterNudge = (await api(server, "/state")).canUndo;
  expect(undoAfterNudge).toBe(true);

  // Delete asks once.
  const total = (await elements(server)).length;
  await page.keyboard.press("Delete");
  const dialog = page.getByTestId("dialog");
  await expect(dialog.getByTestId("dialog-title")).toHaveText("Delete 2 objects?");
  await expect(dialog).toContainText("Their connections are deleted too.");
  await confirmDialog(page);
  await waitUntil(async () => (await elements(server)).length === total - 2);
  for (const i of ids) await expect(node(page, i)).toHaveCount(0);

  // One undo brings both back.
  await page.getByTestId("undo").click();
  await waitUntil(async () => (await elements(server)).length === total);
  for (const i of ids) await expect(node(page, i)).toBeVisible();
});

test("Shift+drag draws a selection box; the menu offers Delete and Auto-layout; Escape clears", async ({ page, server }) => {
  await openDiagram(page, "containers-internet-banking-system");
  const d = await api(server, "/diagrams/containers-internet-banking-system");
  const canvas = (await page.getByTestId("canvas").boundingBox())!;
  await page.keyboard.down("Shift");
  // From just below the lowest box at the right edge (empty canvas) to the top left corner.
  const lowest = Math.max(...(await Promise.all(d.nodes.map(async (n: { id: string }) => (await node(page, n.id).boundingBox())!))).map((b) => b.y + b.height));
  await page.mouse.move(canvas.x + canvas.width - 4, lowest + 8);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 3, canvas.y + 3, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect(page.getByTestId("multi-count")).toHaveText(`${d.nodes.length} objects selected`);

  // Right-click one of them: only Delete and Auto-layout.
  await node(page, "web-application").click({ button: "right" });
  await expect(page.getByTestId("ctx-delete")).toBeVisible();
  await expect(page.getByTestId("ctx-auto-layout")).toBeVisible();
  await expect(page.getByTestId("ctx-rename")).toHaveCount(0);
  await expect(page.getByTestId("ctx-duplicate")).toHaveCount(0);
  await expect(page.getByTestId("multi-count")).toBeVisible(); // still all selected
  await page.keyboard.press("Escape");
  await clickEmptyCanvas(page);
  await expect(page.getByTestId("multi-panel")).toHaveCount(0);
});

test("Shift+click takes a box out again; one box left is a plain selection", async ({ page }) => {
  await openDiagram(page, "containers-internet-banking-system");
  await node(page, "web-application").click();
  await node(page, "mobile-app").click({ modifiers: ["Shift"] });
  await node(page, "database").click({ modifiers: ["Shift"] });
  await expect(page.getByTestId("multi-count")).toHaveText("3 objects selected");
  await node(page, "database").click({ modifiers: ["Shift"] });
  await node(page, "mobile-app").click({ modifiers: ["Shift"] });
  await expect(page.getByTestId("multi-panel")).toHaveCount(0);
  await expect(page.getByTestId("object-panel")).toBeVisible();
  await expect(page.getByTestId("field-name")).toHaveValue("Web Application");
});

test.describe("read-only", () => {
  test.use({ readOnly: true });
  test("several boxes can be selected but not deleted", async ({ page }) => {
    await openDiagram(page, "containers-internet-banking-system");
    await node(page, "web-application").click();
    await node(page, "mobile-app").click({ modifiers: ["Shift"] });
    await expect(page.getByTestId("multi-count")).toHaveText("2 objects selected");
    await expect(page.getByTestId("multi-delete")).toHaveCount(0);
    await page.keyboard.press("Delete");
    await expect(page.getByTestId("dialog")).toHaveCount(0);
    await node(page, "web-application").click({ button: "right" });
    await expect(page.getByTestId("ctx-delete")).toHaveCount(0);
    await expect(page.getByTestId("ctx-move")).toHaveCount(0);
  });
});
