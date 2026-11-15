/** One dialog system: confirm and prompt dialogs, focus handling, and the global shortcuts staying off. */

import { api, confirmDialog, expect, node, openDiagram, test, waitUntil } from "./fixtures.js";

const KEY = "containers-internet-banking-system";

const dialog = (page: import("@playwright/test").Page) => page.getByTestId("dialog");
const inDialog = (page: import("@playwright/test").Page) => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));

test("Delete asks first: Cancel keeps the element, Confirm deletes it", async ({ page, server }) => {
  await openDiagram(page, KEY);
  const has = async () => (await api(server, "/state")).elements.some((e: { id: string }) => e.id === "mobile-app");
  await node(page, "mobile-app").click();
  await page.keyboard.press("Delete");
  await expect(dialog(page)).toBeVisible();
  await expect(page.getByTestId("dialog-title")).toContainText('Delete "Mobile App"');
  await expect(dialog(page)).toHaveAttribute("aria-modal", "true");
  await page.getByTestId("dialog-cancel").click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(node(page, "mobile-app")).toBeVisible();
  expect(await has()).toBe(true);

  await page.keyboard.press("Delete");
  await expect(dialog(page)).toBeVisible();
  await confirmDialog(page);
  await waitUntil(async () => !(await has()));
});

test("Enter confirms a confirm dialog", async ({ page, server }) => {
  await openDiagram(page, KEY);
  await node(page, "mobile-app").click();
  await page.keyboard.press("Delete");
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(dialog(page)).toHaveCount(0);
  await waitUntil(async () => !(await api(server, "/state")).elements.some((e: { id: string }) => e.id === "mobile-app"));
});

test("Escape in a dialog closes it and does not clear the selection", async ({ page }) => {
  await openDiagram(page, KEY);
  await node(page, "mobile-app").click();
  await page.keyboard.press("Delete");
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  await expect(node(page, "mobile-app")).toHaveClass(/selected/);
  await expect(page.getByTestId("object-panel")).toBeVisible();
  // With no dialog open, Escape clears the selection as before.
  await page.keyboard.press("Escape");
  await expect(node(page, "mobile-app")).not.toHaveClass(/selected/);
});

test("with a dialog open, Delete and arrow keys do not reach the canvas", async ({ page, server }) => {
  await openDiagram(page, KEY);
  const count = async () => (await api(server, "/state")).elements.length;
  const before = await count();
  await node(page, "mobile-app").click();
  const box = await node(page, "mobile-app").boundingBox();
  await page.keyboard.press("Delete");
  await expect(dialog(page)).toBeVisible();
  for (const k of ["ArrowRight", "ArrowRight", "ArrowDown", "Delete", "Backspace", "Control+z", "Control+c"]) await page.keyboard.press(k);
  await page.waitForTimeout(500);
  await expect(dialog(page)).toBeVisible();
  expect(await node(page, "mobile-app").boundingBox()).toEqual(box);
  expect(await count()).toBe(before);
  await page.getByTestId("dialog-cancel").click();
  await expect(dialog(page)).toHaveCount(0);
});

test("Tab stays inside the dialog", async ({ page }) => {
  await openDiagram(page, KEY);
  await node(page, "mobile-app").click();
  await page.keyboard.press("Delete");
  await expect(dialog(page)).toBeVisible();
  expect(await inDialog(page)).toBe(true);
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    expect(await inDialog(page)).toBe(true);
  }
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(await inDialog(page)).toBe(true);
  }
  await page.keyboard.press("Escape");
});

test("a prompt with only spaces cannot be confirmed", async ({ page, server }) => {
  await openDiagram(page, "landscape");
  await page.getByTestId("new-draft").click();
  await expect(dialog(page)).toBeVisible();
  const confirm = page.getByTestId("dialog-confirm");
  await expect(page.getByTestId("dialog-input")).toBeFocused();
  await expect(confirm).toBeDisabled();
  await page.getByTestId("dialog-input").fill("    ");
  await expect(confirm).toBeDisabled();
  await page.keyboard.press("Enter");
  await expect(dialog(page)).toBeVisible(); // Enter does nothing while it is disabled
  await page.getByTestId("dialog-input").fill("  Plan A  ");
  await expect(confirm).toBeEnabled();
  await page.keyboard.press("Enter");
  await expect(dialog(page)).toHaveCount(0);
  const drafts = await waitUntil(async () => {
    const d = (await api(server, "/state")).drafts;
    return d.length ? d : null;
  });
  expect(drafts[0].title).toBe("Plan A");
});

test("cancelling a prompt creates nothing", async ({ page, server }) => {
  await openDiagram(page, "landscape");
  await page.getByTestId("new-draft").click();
  await page.getByTestId("dialog-input").fill("Nope");
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  await page.waitForTimeout(300);
  expect((await api(server, "/state")).drafts).toEqual([]);
});

test("focus returns to the control that opened the dialog", async ({ page }) => {
  await openDiagram(page, KEY);
  await node(page, "mobile-app").click();
  const del = page.getByTestId("delete-element");
  await del.focus();
  await page.keyboard.press("Enter");
  await expect(dialog(page)).toBeVisible();
  await expect(page.getByTestId("dialog-confirm")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  await expect(del).toBeFocused();
});
