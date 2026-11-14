/** Stage C2: compare the model with a git branch, and open an older version read-only. */

import { execFileSync } from "node:child_process";
import { expect, node, openDiagram, test, type Server } from "./fixtures.js";

function git(server: Server, ...args: string[]): void {
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args], { cwd: server.root, stdio: "ignore" });
}

async function patchElement(server: Server, id: string, body: object): Promise<void> {
  await fetch(`${server.url}api/elements/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

test("compare with a git branch, then open it read-only", async ({ page, server }) => {
  git(server, "init", "-q", "-b", "main");
  git(server, "add", "-A");
  git(server, "commit", "-q", "-m", "first");
  await patchElement(server, "atm", { description: "Changed since the commit" });
  await page.reload();

  await openDiagram(page, "landscape");
  await page.getByTestId("git-ref").selectOption("main");
  await page.getByTestId("git-compare").click();
  await expect(page.getByTestId("compare-title")).toContainText("Git: main");
  await expect(node(page, "atm")).toHaveAttribute("data-change", "changed");
  await node(page, "atm").click();
  await expect(page.getByTestId("change-details")).toContainText("Changed since the commit");

  await page.getByTestId("stop-compare").click();
  await expect(page.getByTestId("version-strip")).toHaveCount(0);
  await expect(node(page, "atm")).not.toHaveAttribute("data-change", /.+/);

  await page.getByTestId("git-open").click();
  await expect(page.getByTestId("version-strip")).toContainText("read-only");
  await expect(page.getByTestId("readonly-banner")).toHaveCount(0);
  await node(page, "atm").click();
  await expect(page.getByTestId("object-panel")).toBeVisible();
  await expect(page.getByTestId("object-panel")).not.toContainText("Changed since the commit");
  await page.getByTestId("draft-exit").click();
  await expect(page.getByTestId("version-strip")).toHaveCount(0);
});
