/** Stage A3: overlay dock (tags, characteristics, cost), Focus/Hide filters, ratings and cost in the
 *  object panel, the flow step card, and search. */

import { api, expect, openDiagram, test, waitUntil } from "./fixtures.js";

test("tag overlay, focus and hide", async ({ page }) => {
  await openDiagram(page, "components-api-application");
  await page.getByTestId("dock-tags").click();
  await page.getByTestId("overlay-Risk").click();
  await expect(page.getByTestId("badge-security-component")).toContainText("High");
  // Focus on High: other boxes are dimmed.
  await page.getByTestId("chip-High").click();
  await page.getByTestId("filter-focus").click();
  await expect(page.getByTestId("node-security-component")).not.toHaveClass("dimmed");
  expect(await page.getByTestId("node-sign-in-controller").getAttribute("class")).toContain("dimmed");
  // Hide High: those boxes leave the canvas.
  await page.getByTestId("chip-High").click();
  await page.getByTestId("filter-hide").click();
  await expect(page.getByTestId("node-security-component")).toHaveCount(0);
  await page.getByTestId("clear-filters").click();
  await expect(page.getByTestId("node-security-component")).toHaveCount(1);
});

test("characteristic overlay and rating", async ({ page, server }) => {
  await openDiagram(page, "containers-internet-banking-system");
  await page.getByTestId("node-web-application").click();
  await page.getByTestId("char-add-rating").selectOption("Testability");
  await page.getByTestId("rate-Testability-5").click();
  await waitUntil(async () => (await api(server, "/state")).elements.find((e: any) => e.id === "web-application").characteristics.some((r: any) => r.name === "Testability" && r.rating === 5));
  await page.getByTestId("dock-char").click();
  await page.locator("[data-testid='overlay-@char:Testability']").click();
  await expect(page.getByTestId("badge-web-application")).toContainText("★★★★★");
  await expect(page.getByTestId("badge-mobile-app")).toContainText("★★☆☆☆");
});

test("cost lines and overlay", async ({ page, server }) => {
  await openDiagram(page, "containers-internet-banking-system");
  await page.getByTestId("node-web-application").click();
  const sec = page.getByTestId("sec-cost");
  await sec.getByTestId("cost-rows-add").click();
  const rows = sec.locator(".rowed");
  const last = rows.nth((await rows.count()) - 1);
  await last.locator("input").nth(0).fill("CDN");
  await last.locator("input").nth(1).fill("20");
  await last.locator("input").nth(1).blur();
  await waitUntil(async () => (await api(server, "/state")).elements.find((e: any) => e.id === "web-application").costTotal === 200);
  await page.getByTestId("dock-cost").click();
  await page.locator("[data-testid='overlay-@cost']").click();
  await expect(page.getByTestId("badge-web-application")).toContainText("200");
  await expect(page.getByTestId("cost-total")).toContainText("/mo");
});

test("flow card: introduction, steps, conclusion", async ({ page }) => {
  await openDiagram(page, "flow-sign-in");
  const card = page.getByTestId("player");
  await expect(card).toContainText("Introduction");
  await page.getByTestId("step-next").click();
  await expect(card).toContainText("1.");
  await expect(card).toContainText("To");
  for (let i = 0; i < 30; i++) {
    // walk to the end; the flow has fewer steps than this
    if (await page.getByTestId("step-next").isDisabled()) break;
    await page.getByTestId("step-next").click();
  }
  await expect(card).toContainText("Conclusion");
  await expect(page.getByTestId("step-next")).toBeDisabled();
});

test("search reveals object", async ({ page }) => {
  await openDiagram(page, "landscape");
  await page.keyboard.press("Control+k");
  await page.getByTestId("search-input").fill("pii");
  await page.getByTestId("search-input").press("Enter");
  await page.waitForTimeout(1200);
  await expect(page.getByTestId("node-pii-masker")).toBeVisible();
  await expect(page.getByTestId("object-panel")).toBeVisible();
});
