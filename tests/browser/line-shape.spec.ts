/** A diagram's default line shape: set in the details panel, used by lines with no shape of their own. */
import fs from "node:fs";
import path from "node:path";
import { api, clickEmptyCanvas, expect, openDiagram, test, waitUntil } from "./fixtures.js";

const KEY = "containers-internet-banking-system";
const OWN = "web-application--single-page-application";

const pathOf = (page: import("@playwright/test").Page, id: string) => page.locator(`[data-testid="rf__edge-${id}"] path.react-flow__edge-path`).first().getAttribute("d");

test("the diagram's line shape applies to automatic lines and not to a line with its own shape", async ({ page, server }) => {
  await openDiagram(page, KEY);
  const before = await api(server, `/diagrams/${KEY}`);
  expect(before.lineShape).toBeNull();

  // Give one line its own shape first.
  await page.getByTestId(`edge-${OWN}`).click();
  await page.getByTestId("line-shape").selectOption("smooth");
  await waitUntil(async () => (await api(server, `/diagrams/${KEY}`)).edges.find((e: any) => e.id === OWN)?.layout.routing === "smooth");
  // Its "Automatic" choice names the diagram default.
  await expect(page.getByTestId("line-shape").locator("option[value=auto]")).toHaveText("Automatic (diagram default: rounded right angles)");

  await clickEmptyCanvas(page);
  const select = page.getByTestId("diagram-line-shape");
  await expect(select).toHaveValue("rounded");
  await select.selectOption("straight");
  const saved = await waitUntil(async () => {
    const d = await api(server, `/diagrams/${KEY}`);
    return d.lineShape === "straight" ? d : null;
  });
  const sidecar = JSON.parse(fs.readFileSync(path.join(server.root, "architecture", "designperspectives.json"), "utf-8"));
  expect(sidecar.layouts[KEY].lineShape).toBe("straight");

  await page.waitForTimeout(400);
  const automatic = saved.edges.filter((e: any) => e.layout.routing === undefined && !e.id.startsWith("file:"));
  expect(automatic.length).toBeGreaterThan(3);
  for (const e of automatic) {
    // A straight line is one M and one L, with no curves.
    expect(await pathOf(page, e.id), `line ${e.id}`).toMatch(/^M\s*[-\d.e]+[\s,]+[-\d.e]+\s*L\s*[-\d.e]+[\s,]+[-\d.e]+\s*$/);
  }
  // The line with its own shape keeps it (a cubic curve).
  expect(await pathOf(page, OWN)).toContain("C");

  // The line's own "Automatic" now names the new default, and choosing the default again rounds the corners.
  await page.getByTestId(`edge-${OWN}`).click();
  await expect(page.getByTestId("line-shape").locator("option[value=auto]")).toHaveText("Automatic (diagram default: straight)");
  await clickEmptyCanvas(page);
  await page.getByTestId("diagram-line-shape").selectOption("rounded");
  await waitUntil(async () => (await api(server, `/diagrams/${KEY}`)).lineShape === null);
  // Choosing the default removes the setting instead of storing "rounded".
  const afterDefault = JSON.parse(fs.readFileSync(path.join(server.root, "architecture", "designperspectives.json"), "utf-8"));
  expect(afterDefault.layouts?.[KEY]?.lineShape).toBeUndefined();
  await expect(page.getByTestId("diagram-line-shape")).toHaveValue("rounded");
  await page.waitForTimeout(400);
  const paths = await Promise.all(automatic.map((e: any) => pathOf(page, e.id)));
  expect(
    paths.some((d) => d?.includes("Q")),
    "some line has rounded corners again",
  ).toBe(true);
});

test.describe("read-only", () => {
  test.use({ readOnly: true });
  test("the details panel does not offer a line shape", async ({ page }) => {
    await openDiagram(page, KEY);
    await expect(page.getByTestId("panel")).toBeVisible();
    await expect(page.getByTestId("diagram-line-shape")).toHaveCount(0);
  });
});
