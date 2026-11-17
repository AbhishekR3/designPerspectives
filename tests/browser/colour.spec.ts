/** Colours a diagram has by itself: lines coloured by connection kind (or technology), a pipeline's own hue inside it, a legend, and the switch that turns them off. */

import { expect, node, openDiagram, test } from "./fixtures.js";

const strokeOf = (page: import("@playwright/test").Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => getComputedStyle(el).stroke);

test("lines are coloured by kind, the legend lists them, and the switch turns the colour off", async ({ page }) => {
  await openDiagram(page, "containers-internet-banking-system");
  // The demo's web calls have the technology JSON/HTTPS and no kind: they are drawn as a synchronous API.
  const web = page.locator("path.react-flow__edge-path.c4-edge");
  await web.first().waitFor({ state: "attached" });
  const colours = await web.evaluateAll((els) => [...new Set(els.map((e) => getComputedStyle(e).stroke))]);
  expect(colours.length).toBeGreaterThan(2);

  await page.getByTestId("colour-toggle").click();
  await expect(page.getByTestId("legend-line-sync-api")).toBeVisible();
  await expect(page.getByTestId("legend-line-pipeline")).toBeVisible();

  await page.getByTestId("colour-switch").uncheck();
  await expect(page.getByTestId("legend-line-sync-api")).toHaveCount(0);
  const plain = await web.evaluateAll((els) => [...new Set(els.map((e) => getComputedStyle(e).stroke))]);
  expect(plain.length).toBeLessThanOrEqual(2); // grey and derived grey (and the one selected/flow colour, none here)

  // The choice is remembered by the browser.
  await page.reload();
  await openDiagram(page, "containers-internet-banking-system");
  await page.getByTestId("colour-toggle").click();
  await expect(page.getByTestId("colour-switch")).not.toBeChecked();
});

test("inside a pipeline its stages and lines share one hue", async ({ page }) => {
  await openDiagram(page, "connector-mainframe-banking-system--statement-store");
  await page.locator("path.react-flow__edge-path.c4-edge").first().waitFor({ state: "attached" });
  const line = await strokeOf(page, "path.react-flow__edge-path.c4-edge");
  expect(line).not.toBe("rgb(107, 114, 124)"); // not the plain grey
  await expect(node(page, "mainframe-banking-system")).toBeVisible();
  await page.getByTestId("colour-toggle").click();
  await expect(page.getByTestId("legend-line-pipeline")).toBeVisible();
});
