/** Smoke test of the owner's Stage A checklist, steps 1-4, in a real browser. */

import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { clickEmptyCanvas, expect, node, test } from "./fixtures.js";

/** A new box opens with its name ready to type, on the canvas. */
async function renameSelected(page: Page, name: string) {
  const field = page.getByTestId("inline-name");
  await expect(field).toBeFocused();
  await field.fill(name);
  await field.press("Enter");
}

test("checklist steps 1 to 4", async ({ page, server }) => {
  // 1. The demo opens on the Engineer lens's first diagram (containers of the banking system).
  await expect(page.getByTestId("breadcrumb")).toContainText("Internet Banking System");
  await expect(node(page, "api-application")).toBeVisible();

  // 2. New system with three containers, connected.
  await page.getByTestId("crumb-landscape").click();
  await expect(node(page, "atm")).toBeVisible();
  await page.getByTestId("add-softwareSystem").click();
  await renameSelected(page, "Loans");
  // The first rename gives the box a readable ID.
  await expect(node(page, "loans")).toContainText("Loans");
  await node(page, "loans").dblclick();
  await expect(page.getByTestId("breadcrumb")).toContainText("Loans");
  for (const name of ["Loan UI", "Loan API", "Loan DB"]) {
    await page.getByTestId("add-container").click();
    await renameSelected(page, name);
    await clickEmptyCanvas(page);
  }
  await expect(page.locator(".react-flow__node-c4")).toHaveCount(3);
  await page.getByTestId("auto-layout").click();
  await page.waitForTimeout(500);

  const connect = async (a: string, b: string) => {
    const src = node(page, a);
    await src.hover();
    await src.locator(".connect-handle.h-r").dragTo(node(page, b));
  };
  await connect("loan-ui", "loan-api");
  await expect(page.getByTestId("edge-panel")).toBeVisible();
  await page.getByTestId("field-rel-description").fill("Calls");
  await page.getByTestId("field-rel-description").press("Enter");
  await connect("loan-api", "loan-db");
  await expect(page.locator(".edge-label")).toHaveCount(2);
  await expect(page.getByTestId("edge-loan-ui--loan-api")).toContainText("Calls");

  // 3. Drill from landscape to containers to components, and back with the breadcrumb.
  await page.getByTestId("crumb-landscape").click();
  await node(page, "internet-banking-system").dblclick();
  await expect(node(page, "api-application")).toBeVisible();
  await node(page, "api-application").dblclick();
  await expect(node(page, "sign-in-controller")).toBeVisible();
  const crumb = page.getByTestId("breadcrumb");
  await expect(crumb).toContainText("Landscape");
  await expect(crumb).toContainText("Internet Banking System");
  await expect(crumb).toContainText("API Application");
  await page.getByTestId("crumb-containers-internet-banking-system").click();
  await expect(node(page, "web-application")).toBeVisible();
  await page.getByTestId("crumb-landscape").click();
  await expect(node(page, "atm")).toBeVisible();

  // 4. Rename an object; the new name shows in every diagram that contains it.
  await node(page, "e-mail-system").click();
  const field = page.getByTestId("field-name");
  await field.fill("Mail Gateway");
  await field.press("Enter");
  await expect(node(page, "e-mail-system")).toContainText("Mail Gateway");
  for (const key of ["containers-internet-banking-system", "components-api-application", "context-internet-banking-system"]) {
    await page.goto(`${server.url}#/d/${key}`);
    await expect(node(page, "e-mail-system")).toContainText("Mail Gateway");
  }

  // The edits are in the file.
  const data = JSON.parse(fs.readFileSync(path.join(server.root, "architecture", "workspace.json"), "utf-8"));
  const names = data.model.softwareSystems.map((s: any) => s.name);
  expect(names).toContain("Mail Gateway");
  expect(names).toContain("Loans");
});
