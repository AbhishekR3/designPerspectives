/** Keeping the UI in step with the server: bad versions, out-of-order answers, failed reloads, the URL and changes on disk. */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { api, confirmDialog, expect, fillDialog, node, openDiagram, test, waitUntil, type Server } from "./fixtures.js";

function git(server: Server, ...args: string[]): void {
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args], { cwd: server.root, stdio: "ignore" });
}

async function send(server: Server, method: string, p: string, body?: object): Promise<any> {
  const r = await fetch(`${server.url}api${p}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
}

const hash = (page: import("@playwright/test").Page) => page.evaluate(() => window.location.hash);

test("a mistyped git ref shows why and leaves the model as it was", async ({ page, server }) => {
  git(server, "init", "-q", "-b", "main");
  git(server, "add", "-A");
  git(server, "commit", "-q", "-m", "first");
  await page.reload();
  await openDiagram(page, "landscape");

  // Compare with a ref that does not exist.
  await page.getByTestId("git-ref").selectOption("__other");
  await page.getByTestId("git-compare").click();
  await fillDialog(page, "no-such-ref");
  await expect(page.getByTestId("error")).toContainText('Could not compare with git version "no-such-ref"');
  await expect(page.getByTestId("error")).toContainText('No git commit "no-such-ref"');
  await expect(page.getByTestId("version-strip")).toHaveCount(0);
  expect(await hash(page)).toBe("#/d/landscape");

  // Open it read-only: the same, and the model in use is still main.
  await page.getByTestId("git-open").click();
  await fillDialog(page, "no-such-ref");
  await expect(page.getByTestId("error")).toContainText('Could not open git version "no-such-ref"');
  await expect(page.getByTestId("version-strip")).toHaveCount(0);
  await expect(page.getByTestId("draft-main")).toHaveClass(/active/);
  expect(await hash(page)).toBe("#/d/landscape");

  // Later requests work: another diagram opens, an edit is saved to main.
  await openDiagram(page, "containers-internet-banking-system");
  await expect(node(page, "web-application")).toBeVisible();
  await node(page, "web-application").click();
  await page.getByTestId("field-name").fill("Web App");
  await page.getByTestId("field-name").press("Enter");
  await waitUntil(async () => (await api(server, "/state")).elements.some((e: any) => e.name === "Web App"));

  // And a reload starts normally.
  await page.reload();
  await expect(node(page, "web-application")).toContainText("Web App");
});

test("a version in the URL that cannot be opened falls back to the main model with a notice", async ({ page }) => {
  // Edited in the open page: back to where it was.
  await openDiagram(page, "landscape");
  await page.evaluate(() => (window.location.hash = "#/d/components-api-application?m=draft%3Anope&c=base"));
  await expect(page.getByTestId("error")).toContainText('Could not open draft "nope": No draft "nope"');
  await expect.poll(() => hash(page)).toBe("#/d/landscape");
  await expect(node(page, "atm")).toBeVisible();

  // On first load: the main model, with the diagram in the URL.
  await page.evaluate(() => window.history.replaceState(null, "", "#/d/landscape?m=draft%3Anope&c=base"));
  await page.reload();
  await expect(page.getByTestId("error")).toContainText('Could not open draft "nope"');
  await expect(page.getByTestId("error")).toContainText("Showing the main model.");
  await expect(node(page, "atm")).toBeVisible();
  expect(await hash(page)).toBe("#/d/landscape");
  await expect(page.getByTestId("draft-main")).toHaveClass(/active/);

  // A version name the server does not know (422).
  await page.evaluate(() => window.history.replaceState(null, "", "#/d/containers-internet-banking-system?m=bogus"));
  await page.reload();
  await expect(page.getByTestId("error")).toContainText('Could not open "bogus"');
  await expect(node(page, "web-application")).toBeVisible();
  expect(await hash(page)).toBe("#/d/containers-internet-banking-system");
  await expect(page.getByTestId("retry-load")).toHaveCount(0);
});

test("a main model that cannot load is shown full-screen, and Retry loads it once fixed", async ({ page, server }) => {
  const file = path.join(server.root, "architecture", "workspace.json");
  const good = fs.readFileSync(file, "utf-8");
  fs.writeFileSync(file, "{ not json");
  await page.reload();
  await expect(page.locator(".loading")).toContainText("Could not load:");
  await expect(page.locator(".loading")).not.toContainText("Error:");
  fs.writeFileSync(file, good);
  await page.getByTestId("retry-load").click();
  await expect(page.getByTestId("breadcrumb")).toBeVisible();
  await expect(page.locator(".loading")).toHaveCount(0);
});

test("an older answer arriving late does not move a box back", async ({ page, server }) => {
  await openDiagram(page, "landscape");
  await node(page, "atm").click();
  const x = async () => (await node(page, "atm").boundingBox())!.x;
  const serverX = async () => (await api(server, "/diagrams/landscape")).nodes.find((n: any) => n.id === "atm").position.x as number;
  const x0 = await serverX();

  // Hold back the first reload's diagram (fetched now, delivered later), so it lands after the second one.
  let held = false;
  let caught!: () => void;
  const caughtFirst = new Promise<void>((r) => (caught = r));
  await page.route(/\/api\/diagrams\/landscape$/, async (route) => {
    if (route.request().method() !== "GET" || held) return route.continue();
    held = true;
    const response = await route.fetch();
    caught();
    await new Promise((r) => setTimeout(r, 1500));
    await route.fulfill({ response });
  });

  await page.keyboard.press("ArrowRight");
  await caughtFirst;
  const x1 = await serverX();
  expect(x1).toBeGreaterThan(x0);
  await page.keyboard.press("ArrowRight");
  await waitUntil(async () => (await serverX()) > x1);
  const shown = await x();
  await page.waitForTimeout(2500); // the held answer has landed by now
  expect(Math.abs((await x()) - shown)).toBeLessThanOrEqual(1);
  await page.unroute(/\/api\/diagrams\/landscape$/);
});

test("an edit whose reload fails still counts as saved, and Retry shows it", async ({ page }) => {
  await openDiagram(page, "landscape");
  await node(page, "atm").click();
  await expect(page.getByTestId("object-panel")).toBeVisible();

  let failed = false;
  await page.route(/\/api\/state$/, (route) => {
    if (failed) return route.continue();
    failed = true;
    return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "Server busy" }) });
  });
  await page.getByTestId("delete-element").click();
  await confirmDialog(page);
  await expect(page.getByTestId("error")).toContainText("Saved, but the view could not be refreshed: Server busy");
  // The delete counted as done: the panel of the deleted box closed.
  await expect(page.getByTestId("object-panel")).toHaveCount(0);
  await page.getByTestId("error-action").click();
  await expect(page.getByTestId("error")).toHaveCount(0);
  await expect(node(page, "atm")).toHaveCount(0);
});

test("Back and Forward across a version switch open the right diagram in the right version", async ({ page, server }) => {
  const { id } = await send(server, "POST", "/drafts", { title: "Plan" });
  await page.getByTestId("breadcrumb").waitFor();
  await page.waitForFunction(() => /^#\/d\/./.test(window.location.hash));
  const start = await hash(page);
  expect(start).not.toBe("#/d/landscape"); // the lens starts elsewhere, so going back changes the diagram too
  const a = "landscape";
  const b = "components-api-application";
  await openDiagram(page, a);
  await page.getByTestId(`draft-${id}`).click();
  await expect(page.getByTestId("draft-banner")).toBeVisible();
  const draftQ = `?m=draft%3A${id}&c=base`;
  await expect.poll(() => hash(page)).toBe(`#/d/${a}${draftQ}`);
  await page.evaluate((h) => (window.location.hash = h), `#/d/${b}${draftQ}`);
  await expect(node(page, "sign-in-controller")).toBeVisible();
  const entries = await page.evaluate(() => window.history.length);

  await page.goBack();
  await expect.poll(() => hash(page)).toBe(`#/d/${a}${draftQ}`);
  await expect(node(page, "atm")).toBeVisible();
  await expect(page.getByTestId("draft-banner")).toBeVisible();

  await page.goBack();
  await expect.poll(() => hash(page)).toBe(start);
  await expect(page.getByTestId("draft-banner")).toHaveCount(0);
  await expect(page.getByTestId("draft-main")).toHaveClass(/active/);
  await page.waitForTimeout(500);
  expect(await hash(page)).toBe(start);

  await page.goForward();
  await expect.poll(() => hash(page)).toBe(`#/d/${a}${draftQ}`);
  await expect(page.getByTestId("draft-banner")).toBeVisible();
  await expect(node(page, "atm")).toBeVisible();
  await page.waitForTimeout(500);
  expect(await hash(page)).toBe(`#/d/${a}${draftQ}`);
  // No stray history entries were added on the way.
  expect(await page.evaluate(() => window.history.length)).toBe(entries);
  await page.goForward();
  await expect.poll(() => hash(page)).toBe(`#/d/${b}${draftQ}`);
  await expect(node(page, "sign-in-controller")).toBeVisible();
});

test("a change made elsewhere shows when the window gets focus, and nothing reloads if nothing changed", async ({ page, server }) => {
  await openDiagram(page, "landscape");
  await expect(node(page, "atm")).toContainText("ATM");
  const requests: string[] = [];
  page.on("request", (r) => r.url().includes("/api/") && requests.push(`${r.method()} ${new URL(r.url()).pathname}`));

  // Nothing changed: one state request, no diagram reload.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(600);
  expect(requests.filter((r) => r !== "GET /api/comments" && r !== "GET /api/checklist")).toEqual(["GET /api/state"]);

  // Changed through another client: not shown until the window gets focus.
  await send(server, "PATCH", "/elements/atm", { name: "Cash Machine" });
  await page.waitForTimeout(400);
  await expect(node(page, "atm")).not.toContainText("Cash Machine");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(node(page, "atm")).toContainText("Cash Machine");

  // Not while typing in a field: the next focus picks it up.
  await node(page, "atm").click();
  await page.getByTestId("field-name").click();
  await send(server, "PATCH", "/elements/atm", { name: "Teller" });
  requests.length = 0;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(400);
  expect(requests).toEqual([]);
  await expect(node(page, "atm")).toContainText("Cash Machine");
  await page.getByTestId("field-name").press("Escape"); // leaves the field unchanged
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(node(page, "atm")).toContainText("Teller");
  await expect(page.getByTestId("field-name")).toHaveValue("Teller");
});
