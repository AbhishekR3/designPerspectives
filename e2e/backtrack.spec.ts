/** Browser tests of backtracking: from stage 8 of the demo's statement job back to the recent change that caused it. */

import { readDemoHistory, writeDemoHistory } from "../src/demo/demoHistory.js";
import { DEMO_DIR } from "../src/core/project.js";
import { expect, openDiagram, test } from "./fixtures.js";

test("backtrack from a pipeline stage: the steps, a field's values, recent code and model changes", async ({ page, server }) => {
  writeDemoHistory(server.root, readDemoHistory(DEMO_DIR)!);
  await page.reload();
  await openDiagram(page, "connector-mainframe-banking-system--statement-store");
  await page.getByTestId("pd-backtrack-7").click();
  const bt = page.getByTestId("backtrack");
  await expect(bt).toBeVisible();
  await expect(bt).toContainText("stage 8 of 10");

  // The steps changed in the last 14 days stand out.
  await expect(page.getByTestId("backtrack-suspects")).toContainText("5. Convert currency");
  await expect(page.getByTestId("backtrack-suspects")).toContainText("7. Apply fees and interest");
  await expect(page.getByTestId("backtrack-step-5")).toHaveClass(/recent/);
  await expect(page.getByTestId("backtrack-step-6")).not.toHaveClass(/recent/);

  // Follow the closing balance back: it appears at stage 6 and changes at stage 7.
  await page.getByTestId("backtrack-detail").getByRole("button", { name: "closingBalance", exact: true }).click();
  const field = page.getByTestId("backtrack-field");
  await expect(field.locator("tr.appears")).toContainText("Calculate balances");
  await expect(field.locator("tr.changed")).toContainText("Apply fees and interest");

  // Stage 5: the commit two days ago and the functions it changed.
  await page.getByTestId("backtrack-step-5").click();
  const detail = page.getByTestId("backtrack-detail");
  await expect(detail).toContainText("Step 5: Convert currency");
  await expect(detail).toContainText("Convert currency: round each converted amount to cents");
  await expect(detail.locator(".chip.changed")).toHaveText(["convert •", "roundCents •"]);
  // Stage 7 was added to the model six days ago.
  await page.getByTestId("backtrack-step-7").click();
  await expect(detail).toContainText('Stage "Apply fees and interest" added');

  // A file opens in the editor on top; Escape closes the editor first, then the backtrack.
  await page.getByTestId("backtrack-step-5").click();
  await detail.getByRole("button", { name: "sample_code/statements/convert_currency.ts" }).click();
  const editor = page.getByTestId("code-editor");
  await expect(editor).toBeVisible();
  expect(await editor.inputValue()).toContain("roundCents");
  await page.keyboard.press("Escape");
  await expect(editor).toBeHidden();
  await expect(bt).toBeVisible();
  await page.getByTestId("backtrack-close").click();
  await expect(bt).toBeHidden();
});
