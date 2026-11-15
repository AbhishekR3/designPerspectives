/** Planned code changes: edit code inside a draft, see it on the code diagram, read the coding plan, apply. */

import fs from "node:fs";
import path from "node:path";
import { expect, node, openDiagram, test, type Server } from "./fixtures.js";

async function createDraft(server: Server, title: string): Promise<string> {
  const r = await fetch(server.url + "api/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
  return (await r.json()).id;
}

test("edit code in a draft, read the coding plan, apply with code", async ({ page, server }) => {
  const id = await createDraft(server, "Accounts v2");
  const file = path.join(server.root, "sample_code", "api", "accounts.py");
  const before = fs.readFileSync(file, "utf-8");

  await openDiagram(page, "code-accounts-summary-controller");
  await page.getByTestId(`draft-${id}`).click();
  await expect(page.getByTestId("draft-banner")).toBeVisible();

  await node(page, "file:sample_code/api/accounts.py").dblclick();
  await expect(page.getByTestId("code-draft-note")).toContainText("Saving here plans the change in the draft");
  await page.getByTestId("code-editor").fill("# planned rewrite\n");
  await page.getByTestId("code-save").click();
  await expect(page.getByTestId("code-draft-note")).toContainText("plans a change to this file");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).last().click();
  expect(fs.readFileSync(file, "utf-8")).toBe(before); // the code folder is untouched

  await expect(node(page, "file:sample_code/api/accounts.py")).toHaveAttribute("data-change", "changed");
  await expect(page.getByTestId("change-summary").locator('[data-count="code"]')).toContainText("1 code");

  await page.getByTestId("draft-plan").click();
  await expect(page.getByTestId("plan-file:sample_code/api/accounts.py")).toHaveAttribute("data-status", "open");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).last().click();

  await page.getByTestId("draft-apply").click();
  await expect(page.getByTestId("apply-with-code")).toBeChecked();
  await page.getByTestId("apply-confirm").click();
  await expect(page.getByTestId("draft-banner")).toHaveCount(0);
  await expect.poll(() => fs.readFileSync(file, "utf-8")).toBe("# planned rewrite\n");
});
