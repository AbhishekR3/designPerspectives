/** Planning a change in a draft, driven through the UI: new draft dialog, drafts list, apply, discard, plan, code. */

import { execFileSync } from "node:child_process";
import { api, clickEmptyCanvas, confirmDialog, expect, fillDialog, node, openDiagram, test, waitUntil, type Server } from "./fixtures.js";

const today = new Date().toISOString().slice(0, 10);

async function call(server: Server, method: string, path: string, opts: { body?: unknown; draft?: string } = {}): Promise<any> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.draft) headers["X-DP-Model"] = `draft:${opts.draft}`;
  const r = await fetch(server.url + "api" + path, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  return r.json();
}

async function createDraft(server: Server, title: string): Promise<string> {
  return (await call(server, "POST", "/drafts", { body: { title } })).id;
}

function git(server: Server, ...args: string[]): void {
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args], { cwd: server.root, stdio: "ignore" });
}

test("plan a change in a draft, apply it, undo it, discard another", async ({ page, server }) => {
  await openDiagram(page, "containers-internet-banking-system");

  // New draft: a dialog with a title and a description.
  await page.getByTestId("new-draft").click();
  await expect(page.getByTestId("new-draft-dialog")).toBeVisible();
  await expect(page.getByTestId("draft-create")).toBeDisabled();
  await page.getByTestId("draft-title").fill("Add audit log");
  await page.getByTestId("draft-description").fill("Record every sign-in.\nKeep it for a year.");
  await page.getByTestId("draft-create").click();
  await expect(page.getByTestId("new-draft-dialog")).toHaveCount(0);
  await expect(page.getByTestId("draft-banner")).toContainText("Draft: Add audit log");
  const id = "add-audit-log";
  expect((await api(server, "/state")).drafts[0]).toMatchObject({ id, title: "Add audit log", description: "Record every sign-in.\nKeep it for a year.", behind: 0 });

  // A second draft with the same title is refused inside the dialog, which stays open.
  await page.getByTestId("new-draft").click();
  await page.getByTestId("draft-title").fill("Add audit log");
  await page.getByTestId("draft-create").click();
  await expect(page.getByTestId("draft-error")).toContainText("already exists");
  await expect(page.getByTestId("new-draft-dialog")).toBeVisible();
  await page.getByTestId("new-draft-dialog").getByRole("button", { name: "Cancel" }).click();
  expect((await api(server, "/state")).drafts).toHaveLength(1);

  // The list shows the date and a row menu; rename and edit the description from it.
  await expect(page.getByTestId("draft-list")).toContainText(today);
  await page.getByTestId(`draft-menu-${id}`).click();
  await expect(page.getByTestId("draft-rename")).toBeVisible();
  await expect(page.getByTestId("draft-edit-description")).toBeVisible();
  await page.getByTestId("draft-rename").click();
  await page.getByTestId("draft-title").fill("Audit log v1");
  await page.getByTestId("draft-save").click();
  await expect(page.getByTestId(`draft-${id}`)).toHaveText("Audit log v1");
  await page.getByTestId(`draft-menu-${id}`).click();
  await page.getByTestId("draft-edit-description").click();
  await expect(page.getByTestId("draft-description")).toHaveValue("Record every sign-in.\nKeep it for a year.");
  await page.getByTestId("draft-description").fill("Record sign-ins only.");
  await page.getByTestId("draft-save").click();
  await waitUntil(async () => (await api(server, "/state")).drafts[0].description === "Record sign-ins only.");

  // Edit in the draft: add a container, move another one.
  await page.getByTestId("add-container-queue").click();
  await page.getByTestId("inline-name").press("Escape");
  await expect(page.locator('[data-change="added"]')).toHaveCount(1);
  await node(page, "mobile-app").click();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("change-summary").locator('[data-count="added"]')).toHaveAttribute("title", "1 added");
  await expect(page.getByTestId("change-summary")).toContainText("layout");

  // Main changes meanwhile: the badge appears after a focus event.
  await call(server, "PATCH", "/elements/atm", { body: { description: "Changed in main" } });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByTestId("draft-banner").getByTestId("draft-behind")).toHaveText("main +1");
  await expect(page.getByTestId("draft-banner").getByTestId("draft-behind")).toHaveAttribute("title", /changed 1 object since this draft started/);
  await expect(page.getByTestId("draft-list").getByTestId("draft-behind")).toHaveText("main +1");

  // Apply: the change list shows; applying goes back to main with a toast.
  await page.getByTestId("draft-apply").click();
  await expect(page.getByTestId("change-list")).toBeVisible();
  await expect(page.getByTestId("apply-conflicts")).toHaveCount(0);
  await page.getByTestId("apply-confirm").click();
  await expect(page.getByTestId("toast-success")).toContainText('Applied "Audit log v1"');
  await expect(page.getByTestId("draft-main")).toHaveClass(/active/);
  await expect(page.getByTestId("draft-banner")).toHaveCount(0);
  const els = await waitUntil(async () => {
    const e = (await api(server, "/state")).elements as any[];
    return e.some((x) => x.name.startsWith("Queue")) ? e : null;
  });
  expect(els.find((x) => x.id === "atm").description).toBe("Changed in main"); // main's own change is kept
  await expect(page.locator('[data-testid^="node-"]', { hasText: "Queue" })).toHaveCount(1);

  // Undo on main takes the planned change out again (the draft stays deleted).
  await page.getByTestId("undo").click();
  await waitUntil(async () => !((await api(server, "/state")).elements as any[]).some((x) => x.name.startsWith("Queue")));
  expect((await api(server, "/state")).drafts).toEqual([]);

  // Discard another draft from its row menu.
  const other = await createDraft(server, "Throwaway");
  await page.reload();
  await page.getByTestId(`draft-menu-${other}`).click();
  await page.getByTestId("draft-discard").click();
  await expect(page.getByTestId("dialog")).toContainText('Discard "Throwaway"?');
  await confirmDialog(page);
  await expect(page.getByTestId("toast-success")).toContainText('Discarded "Throwaway"');
  await waitUntil(async () => (await api(server, "/state")).drafts.length === 0);
  await expect(page.getByTestId(`draft-${other}`)).toHaveCount(0);
});

test("long titles are cut short and the row menu stays reachable", async ({ page, server }) => {
  const id = await createDraft(server, "A very long title for a planned change that keeps going and going and going on and on");
  await page.reload();
  const title = page.getByTestId(`draft-${id}`);
  await expect(title).toBeVisible();
  const box = (await title.boundingBox())!;
  const side = (await page.locator(".sidebar").boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(side.x + side.width);
  await expect(page.getByTestId(`draft-menu-${id}`)).toBeVisible();
  const menu = (await page.getByTestId(`draft-menu-${id}`).boundingBox())!;
  expect(menu.x + menu.width).toBeLessThanOrEqual(side.x + side.width + 1);
});

test("a conflicting draft lists the conflict and applies nothing", async ({ page, server }) => {
  const id = await createDraft(server, "Clash");
  await call(server, "PATCH", "/elements/atm", { draft: id, body: { description: "From the draft" } });
  await call(server, "PATCH", "/elements/atm", { body: { description: "From main" } });
  await page.reload();
  await page.getByTestId(`draft-${id}`).click();
  await page.getByTestId("draft-apply").click();
  await expect(page.getByTestId("apply-conflicts")).toContainText("Changed in both main and the draft");
  await expect(page.getByTestId("apply-confirm")).toBeDisabled();
  await page.keyboard.press("Escape");
  expect((await api(server, "/state")).elements.find((e: any) => e.id === "atm").description).toBe("From main");
  expect((await api(server, "/state")).drafts).toHaveLength(1);
});

test("a draft with only a planned code edit does not say it changes nothing", async ({ page, server }) => {
  const id = await createDraft(server, "Code only");
  const f = await call(server, "GET", "/code/file?path=sample_code/api/accounts.py", { draft: id });
  await call(server, "PUT", "/code/file", { draft: id, body: { path: "sample_code/api/accounts.py", content: "# only code\n", mtime: f.mtime } });
  await page.reload();
  await page.getByTestId(`draft-${id}`).click();
  await page.getByTestId("draft-apply").click();
  await expect(page.getByTestId("apply-with-code")).toBeChecked();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("code-changes")).toBeVisible();
  await expect(dialog.getByText("The draft changes nothing.")).toHaveCount(0);
  // Without the code edits the model has nothing to apply, and the old answers are gone while it checks.
  await page.getByTestId("apply-with-code").uncheck();
  await expect(dialog.getByText("The draft changes nothing.")).toBeVisible();
  await expect(dialog.getByText(/Undo restores the model, not the draft/)).toBeVisible();
  await page.getByTestId("apply-with-code").check();
  await expect(dialog.getByText(/Undo restores the model only, not those files or the draft/)).toBeVisible();
});

test("the file editor: Ctrl+S and Tab do nothing on a file planned for deletion", async ({ page, server }) => {
  const id = await createDraft(server, "Remove a file");
  await openDiagram(page, "code-accounts-summary-controller");
  await page.getByTestId(`draft-${id}`).click();
  await expect(page.getByTestId("draft-banner")).toBeVisible();
  await node(page, "file:sample_code/api/accounts.py").dblclick();
  await expect(page.getByTestId("code-editor")).toBeVisible();
  await page.getByTestId("code-plan-delete").click();
  await confirmDialog(page);
  await expect(page.getByTestId("code-draft-note")).toContainText("plans to delete this file");
  const editor = page.getByTestId("code-editor");
  await expect(editor).toHaveJSProperty("readOnly", true);
  const before = await editor.inputValue();

  await editor.click();
  await page.keyboard.press("Control+s");
  await page.keyboard.press("Meta+s");
  await page.waitForTimeout(300);
  expect((await call(server, "GET", "/code/file?path=sample_code/api/accounts.py", { draft: id })).planned).toBe("deleted");

  await editor.focus();
  await page.keyboard.press("Tab");
  expect(await editor.inputValue()).toBe(before);
  await expect(page.getByTestId("code-save")).toBeDisabled();
  await expect(page.getByTestId("error")).toHaveCount(0);
});

test("a removed file opens as a read-only ghost, not as an editable file", async ({ page, server }) => {
  const id = await createDraft(server, "Ghost file");
  await call(server, "DELETE", "/code/file?path=sample_code/api/email_sender.py", { draft: id });
  await openDiagram(page, "code-e-mail-component");
  await page.getByTestId(`draft-${id}`).click();
  const ghost = node(page, "file:sample_code/api/email_sender.py");
  await expect(ghost).toHaveAttribute("data-change", "removed");
  await ghost.click();
  await expect(page.getByTestId("ghost-panel")).toBeVisible();
  await expect(page.getByTestId("file-panel")).toHaveCount(0);
});

test("a new component gets its first planned file from the element panel", async ({ page, server }) => {
  const id = await createDraft(server, "Audit component");
  const made = await call(server, "POST", "/elements", { draft: id, body: { kind: "component", parentId: "api-application", name: "Audit Log" } });
  await openDiagram(page, "components-api-application");
  await page.getByTestId(`draft-${id}`).click();
  await node(page, made.id).click();
  await page.getByTestId("sec-code").getByRole("button", { name: /Code/ }).click();
  await page.getByTestId("new-planned-file").click();
  await fillDialog(page, "sample_code/api/audit_log.py");
  await expect(page.getByTestId("code-editor")).toBeVisible();
  const draft = await call(server, "GET", "/state", { draft: id });
  expect(draft.elements.find((e: any) => e.id === made.id).codePaths).toEqual(["sample_code/api/audit_log.py"]);
  expect((await api(server, "/state")).drafts[0].plannedFiles).toBe(1);
  // Not offered on the main model.
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).last().click();
  await page.getByTestId("draft-exit").click();
  await node(page, "sign-in-controller").click();
  await expect(page.getByTestId("new-planned-file")).toHaveCount(0);
});

test("the coding plan: Checking…, then the steps; a failed check shows its error; the branch saves once", async ({ page, server }) => {
  git(server, "init", "-q", "-b", "main");
  git(server, "add", "-A");
  git(server, "commit", "-q", "-m", "first");
  const id = await createDraft(server, "Plan me");
  await call(server, "POST", "/elements", { draft: id, body: { kind: "container", parentId: "internet-banking-system", name: "Audit Store" } });
  await page.reload();
  await page.getByTestId(`draft-${id}`).click();

  let patches = 0;
  page.on("request", (r) => r.method() === "PATCH" && r.url().includes("/api/drafts/") && patches++);
  await page.getByTestId("draft-plan").click();
  await expect(page.getByTestId("plan-list")).toContainText("Audit Store");
  await expect(page.getByTestId("plan-loading")).toHaveCount(0);

  // A branch that does not exist: the check fails and says so; the steps stay visible.
  await page.getByTestId("plan-branch").fill("no-such-branch");
  await page.getByTestId("plan-branch").press("Enter");
  await expect(page.getByTestId("plan-error")).toContainText("check failed");
  await expect(page.getByTestId("plan-list")).toContainText("Audit Store");
  await expect(page.getByTestId("plan-against")).toHaveValue("ref:no-such-branch");
  await page.getByTestId("plan-against").focus(); // blurs the branch field
  await page.waitForTimeout(400);
  expect(patches).toBe(1);

  // The code folder works; the Markdown can be copied.
  await page.getByTestId("plan-against").selectOption("disk");
  await expect(page.getByTestId("plan-error")).toHaveCount(0);
  await expect(page.getByTestId("plan-summary")).toBeVisible();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByTestId("plan-copy").click();
  await expect(page.getByTestId("plan-copy")).toHaveText("Copied");
});

test("the right-click menu opens from the keyboard and survives scrolling inside it", async ({ page }) => {
  await openDiagram(page, "containers-internet-banking-system");
  await node(page, "mobile-app").click();
  await page.keyboard.press("Shift+F10");
  const menu = page.getByTestId("context-menu");
  await expect(menu).toBeVisible();
  const at = (await menu.boundingBox())!;
  const target = (await node(page, "mobile-app").boundingBox())!;
  expect(Math.abs(at.x - (target.x + target.width / 2))).toBeLessThan(target.width);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  // Empty canvas: a menu for the canvas.
  await clickEmptyCanvas(page);
  await page.keyboard.press("ContextMenu");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");

  // Scrolling inside a tall menu keeps it open; scrolling the canvas closes it.
  await page.setViewportSize({ width: 1500, height: 330 });
  await node(page, "mobile-app").click();
  await page.keyboard.press("Shift+F10");
  await expect(menu).toBeVisible();
  const m = (await menu.boundingBox())!;
  await page.mouse.move(m.x + m.width / 2, m.y + m.height / 2);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(200);
  await expect(menu).toBeVisible();
  await page.mouse.move(m.x + m.width + 200, m.y + 20);
  await page.mouse.wheel(0, 120);
  await expect(menu).toHaveCount(0);
});
