/** Browser test of the flow step view: input and output, files at the ends and details for the current step, and a summary line per step in the list. */

import { expect, openDiagram, test } from "./fixtures.js";

test("flow step view shows input, output, files and details", async ({ page }) => {
  await openDiagram(page, "flow-sign-in");
  await page.getByTestId("step-next").click();
  const data = page.getByTestId("step-data");
  await expect(data).toBeVisible();
  await expect(data.getByTestId("step-output")).toContainText("Output");
  await expect(data.getByTestId("step-input")).toContainText("Input");
  await expect(data.getByTestId("step-files")).toContainText("Leaves");
  await expect(data.getByTestId("step-files")).toContainText("Arrives at");
  await expect(data.getByTestId("step-details")).toBeVisible();
  await expect(data.getByTestId("step-example")).toContainText("alice");
  await expect(page.getByTestId("player-io")).toBeVisible();
  await expect(page.getByTestId("step-summary-0")).not.toBeEmpty();
});
