/** Small interactions in a project that must just work: panel fields, shortcuts, selection after undo, history, menus, messages over a page. */

import type { Page } from "@playwright/test";
import { api, expect, node, openDiagram, test, waitUntil, type Server } from "./fixtures.js";

const KEY = "landscape";
const elements = async (server: Server) =>
  (await api(server, "/state")).elements as { id: string; name: string; description: string; characteristics: { name: string; rating?: number; note?: string }[] }[];
const el = async (server: Server, id: string) => (await elements(server)).find((e) => e.id === id)!;

/** Count the edits the page sends to elements (PATCH), from now on. */
function countPatches(page: Page): { n: number } {
  const seen = { n: 0 };
  page.on("request", (r) => {
    if (r.method() === "PATCH" && /\/api\/elements\//.test(r.url())) seen.n++;
  });
  return seen;
}

/** Open a section of the details panel if it is closed. */
async function openSection(page: Page, testId: string) {
  const head = page.getByTestId(testId).locator(".p-section-head");
  if ((await head.getAttribute("aria-expanded")) !== "true") await head.click();
}

/** The element at the middle of `testId` is that element (or inside it): nothing covers it. */
async function onTop(page: Page, testId: string): Promise<boolean> {
  return page.evaluate((id) => {
    const t = document.querySelector(`[data-testid="${id}"]`);
    if (!t) return false;
    const r = t.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!at && t.contains(at);
  }, testId);
}

test.describe("panel text fields", () => {
  test("Escape drops what was typed and saves nothing", async ({ page, server }) => {
    await openDiagram(page, KEY);
    await node(page, "atm").click();
    const before = (await el(server, "atm")).description;
    const patches = countPatches(page);
    const field = page.getByTestId("field-description");
    await field.fill("typed and dropped");
    await field.press("Escape");
    await expect(field).toHaveValue(before);
    await page.waitForTimeout(400);
    expect(patches.n).toBe(0);
    expect((await el(server, "atm")).description).toBe(before);
  });

  test("Enter saves once", async ({ page, server }) => {
    await openDiagram(page, KEY);
    await node(page, "atm").click();
    const patches = countPatches(page);
    const field = page.getByTestId("field-name");
    await field.fill("Cash machine");
    await field.press("Enter");
    await waitUntil(async () => (await el(server, "atm")).name === "Cash machine");
    await page.waitForTimeout(400);
    expect(patches.n).toBe(1);
  });

  test("a name the model refuses goes back to the name the box has", async ({ page, server }) => {
    await openDiagram(page, KEY);
    await node(page, "atm").click();
    const field = page.getByTestId("field-name");
    await field.fill("");
    await field.press("Enter");
    await expect(page.getByTestId("error")).toBeVisible();
    await expect(field).toHaveValue("ATM");
    expect((await el(server, "atm")).name).toBe("ATM");
  });

  test("F2 on a line focuses its description every time it is pressed", async ({ page }) => {
    await openDiagram(page, "containers-internet-banking-system");
    await page.getByTestId("edge-web-application--single-page-application").click({ force: true });
    await expect(page.getByTestId("edge-panel")).toBeVisible();
    const field = page.getByTestId("field-rel-description");
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press("F2");
      await expect(field).toBeFocused();
      await field.press("Escape");
      await expect(field).not.toBeFocused();
    }
  });
});

test.describe("selection and keys", () => {
  test("undoing a copy leaves nothing selected, not an empty panel", async ({ page, server }) => {
    await openDiagram(page, KEY);
    const count = (await elements(server)).length;
    await node(page, "atm").click();
    await page.keyboard.press("ControlOrMeta+d");
    await waitUntil(async () => (await elements(server)).length === count + 1);
    // The copy is selected (its name is in the panel) before it is undone.
    await expect(page.getByTestId("field-name")).not.toHaveValue("ATM");
    await page.keyboard.press("ControlOrMeta+z");
    await waitUntil(async () => (await elements(server)).length === count);
    await expect(page.getByTestId("object-panel")).toHaveCount(0);
    await expect(page.locator(".react-flow__node.selected")).toHaveCount(0);
    // The panel shows the diagram again, as it does when nothing is selected.
    await expect(page.locator(".panel-title")).toHaveText("System landscape");
  });

  test("the panel's Duplicate shows the copy selected", async ({ page, server }) => {
    await openDiagram(page, KEY);
    await node(page, "atm").click();
    const before = new Set((await elements(server)).map((e) => e.id));
    await page.getByTestId("duplicate-element").click();
    const copy = await waitUntil(async () => (await elements(server)).find((e) => !before.has(e.id)));
    await expect(page.getByTestId("field-name")).toHaveValue(copy.name);
  });

  test("Ctrl/Cmd+C copies marked text when a box is selected", async ({ page }) => {
    await openDiagram(page, KEY);
    await node(page, "atm").click();
    const prevented = await page.evaluate(() => {
      const title = document.querySelector('[data-testid="object-panel"]')!;
      const range = document.createRange();
      range.selectNodeContents(title);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      const e = new KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true, cancelable: true });
      document.body.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(prevented).toBe(false);
  });
});

test.describe("a viewer", () => {
  test.use({ readOnly: true });
  test("Escape clears the selection on a read-only server", async ({ page }) => {
    await openDiagram(page, KEY);
    await node(page, "atm").click();
    await expect(page.locator(".react-flow__node.selected")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator(".react-flow__node.selected")).toHaveCount(0);
  });
});

test.describe("history and pages", () => {
  test("a diagram that does not exist opens the landscape, and Back still goes back", async ({ page }) => {
    await openDiagram(page, "containers-internet-banking-system");
    await page.evaluate(() => (window.location.hash = "#/d/containers-no-such-system"));
    await expect(page).toHaveURL(/#\/d\/landscape$/);
    await expect(page.getByTestId("toast-info")).toContainText("not in the model");
    await page.goBack();
    await expect(page).toHaveURL(/#\/d\/containers-internet-banking-system$/);
  });

  test("a broken escape in the address does not stop the app", async ({ page, server }) => {
    await page.goto(`${server.url}#/d/100%`);
    await expect(page.getByTestId("breadcrumb")).toBeVisible();
  });

  test("the tab title names the diagram", async ({ page }) => {
    await openDiagram(page, "containers-internet-banking-system");
    await expect(page).toHaveTitle(/Internet Banking System.*designPerspectives/);
  });

  test("the diagram already open, picked in the sidebar, closes the Decisions page", async ({ page }) => {
    const open = "containers-internet-banking-system";
    await openDiagram(page, open);
    await page.getByTestId("open-decisions").click();
    await expect(page.getByTestId("decisions-page")).toBeVisible();
    await page.getByTestId(`diagram-${open}`).click();
    await expect(page.getByTestId("decisions-page")).toHaveCount(0);
  });

  test("a message is on top of the Decisions page", async ({ page }) => {
    await openDiagram(page, KEY);
    await page.getByTestId("open-decisions").click();
    await page.route("**/api/decisions", (r) =>
      r.request().method() === "POST" ? r.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ detail: "Refused for the test." }) }) : r.continue(),
    );
    await page.getByTestId("decision-new").click();
    await page.getByTestId("decision-new-title").fill("A decision the server refuses");
    await page.getByTestId("decision-new-create").click();
    await expect(page.getByTestId("error")).toContainText("Refused for the test.");
    expect(await onTop(page, "error")).toBe(true);
  });
});

test.describe("decisions", () => {
  test("removing a tag in the editor does not save and close it", async ({ page }) => {
    await openDiagram(page, KEY);
    await page.getByTestId("open-decisions").click();
    await page.getByTestId("decision-0003").click();
    await page.getByTestId("decision-edit").click();
    const editor = page.getByTestId("decision-editor");
    await expect(editor).toBeVisible();
    let writes = 0;
    page.on("request", (r) => {
      if (r.method() !== "GET" && /\/api\/decisions/.test(r.url())) writes++;
    });
    const tags = editor.getByPlaceholder(/Add a tag…|Add…/).last();
    await tags.fill("temporary-tag");
    await tags.press("Enter");
    const remove = editor.getByRole("button", { name: "Remove temporary-tag" });
    await expect(remove).toBeVisible();
    await remove.click();
    await expect(remove).toHaveCount(0);
    expect(writes).toBe(0);
    await page.waitForTimeout(400);
    await expect(editor).toBeVisible();
  });

  test("changes that are not saved are asked about before another decision opens", async ({ page }) => {
    await openDiagram(page, KEY);
    await page.getByTestId("open-decisions").click();
    await page.getByTestId("decision-0003").click();
    await page.getByTestId("decision-edit").click();
    await page.getByTestId("decision-context").fill("Half a sentence that must not be lost without a word");
    await page.getByTestId("decision-0002").click();
    await expect(page.getByTestId("dialog")).toContainText("Discard your changes?");
    await page.getByTestId("dialog-cancel").click();
    await expect(page.getByTestId("decision-context")).toHaveValue("Half a sentence that must not be lost without a word");
  });
});

test.describe("list editors and menus", () => {
  test("a new, still empty row is removed by its remove button", async ({ page }) => {
    await openDiagram(page, KEY);
    await node(page, "atm").click();
    await openSection(page, "sec-tradeoffs");
    const rows = page.getByTestId("tradeoffs").locator(".rowed");
    const n = await rows.count();
    await page.getByTestId("tradeoffs-add").click();
    await expect(rows).toHaveCount(n + 1);
    await rows.last().getByRole("button", { name: "Remove" }).click();
    await expect(rows).toHaveCount(n);
  });

  test("a note typed for a rating is kept when a star is clicked next", async ({ page, server }) => {
    await openDiagram(page, KEY);
    await node(page, "atm").click();
    await openSection(page, "sec-characteristics");
    const box = page.getByTestId("characteristics");
    const first = (await api(server, "/state")).characteristics[0].name as string;
    if ((await box.locator(".char-row").count()) === 0) {
      await page.getByTestId("char-add-rating").selectOption(first);
      await expect(box.locator(".char-row")).toHaveCount(1);
    }
    const name = ((await box.locator(".char-row .char-name").first().textContent()) ?? "").trim();
    await box.locator(".char-row input").first().fill("because of the night batch");
    await page.getByTestId(`rate-${name}-5`).click();
    const saved = await waitUntil(async () => (await el(server, "atm")).characteristics.find((c) => c.name === name && c.rating === 5));
    await page.waitForTimeout(400);
    expect((await el(server, "atm")).characteristics.find((c) => c.name === name)?.note ?? saved.note).toBe("because of the night batch");
  });

  test("Escape closes the download menu and keeps the selection", async ({ page }) => {
    await openDiagram(page, KEY);
    await node(page, "atm").click();
    await page.getByTestId("export").click();
    await expect(page.getByTestId("export-png")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("export-png")).toHaveCount(0);
    await expect(page.locator(".react-flow__node.selected")).toHaveCount(1);
  });
});

test.describe("more small things", () => {
  test("a value chip of the overlay dock: a second click closes its menu, and so does Escape", async ({ page }) => {
    await openDiagram(page, "components-api-application");
    await page.getByTestId("dock-tags").click();
    await page.getByTestId("overlay-Risk").click();
    const chip = page.getByTestId("chip-High");
    await chip.click();
    await expect(page.getByTestId("filter-focus")).toBeVisible();
    await chip.click();
    await expect(page.getByTestId("filter-focus")).toHaveCount(0);
    await chip.click();
    await expect(page.getByTestId("filter-focus")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("filter-focus")).toHaveCount(0);
  });

  test("Enter in the description adds the connection", async ({ page, server }) => {
    await openDiagram(page, KEY);
    await node(page, "atm").click();
    const before = (await api(server, "/state")).relationships.length as number;
    await page.getByTestId("add-outgoing").click();
    await page.getByTestId("add-outgoing-filter").fill("E-mail");
    await page.getByTestId("add-outgoing-description").fill("Sends receipts");
    await page.getByTestId("add-outgoing-description").press("Enter");
    await waitUntil(async () => ((await api(server, "/state")).relationships.length as number) === before + 1);
    await expect(page.getByTestId("add-outgoing-form")).toHaveCount(0);
  });

  test("deleting a lens that is not in use keeps the lens in use", async ({ page, server }) => {
    await openDiagram(page, KEY);
    // Two lenses of our own; the second one made is the one in use.
    for (const name of ["First of mine", "Second of mine"]) {
      await page.getByTestId("new-lens").click();
      await page.getByTestId("lens-name").fill(name);
      await page.getByTestId("lens-save").click();
      await expect(page.getByTestId("lens-save")).toHaveCount(0);
    }
    await expect(page.locator(".tree-label.strong")).toContainText("Second of mine");
    await page.getByRole("button", { name: "Edit the lens First of mine" }).click();
    await page.getByRole("button", { name: "Delete lens" }).click();
    await page.getByTestId("dialog-confirm").click();
    await waitUntil(async () => !(await api(server, "/state")).lenses.some((l: { name: string }) => l.name === "First of mine"));
    await page.waitForTimeout(600); // a switch of lens would come after the reload
    await expect(page.locator(".tree-label.strong")).toContainText("Second of mine");
  });

  test("a step added to a flow clears the pick, so a second click does not add it again", async ({ page }) => {
    await openDiagram(page, "flow-sign-in");
    const add = page.getByTestId("add-step");
    await expect(add).toBeDisabled();
    await page.getByTestId("step-select").selectOption({ index: 0 });
    await expect(add).toBeEnabled();
    await add.click();
    await expect(add).toBeDisabled();
  });

  test("a box copied on one diagram and pasted on another is shown where the copy is", async ({ page, server }) => {
    await openDiagram(page, "containers-internet-banking-system");
    await node(page, "web-application").click();
    await page.keyboard.press("ControlOrMeta+c");
    await openDiagram(page, KEY);
    const before = new Set((await elements(server)).map((e) => e.id));
    await page.keyboard.press("ControlOrMeta+v");
    const copy = await waitUntil(async () => (await elements(server)).find((e) => !before.has(e.id)));
    await expect(page).toHaveURL(/#\/d\/containers-internet-banking-system$/);
    await expect(page.getByTestId("field-name")).toHaveValue(copy.name);
  });

  test("while testing, decisions cannot be edited", async ({ page }) => {
    await openDiagram(page, KEY);
    await page.getByTestId("open-decisions").click();
    await expect(page.getByTestId("decision-new")).toBeVisible();
    await page.getByTestId("decisions-close").click();
    await page.getByTestId("testing-toggle").click();
    await expect(page.getByTestId("testing-toggle")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("open-decisions").click();
    await expect(page.getByTestId("decisions-page")).toBeVisible();
    await expect(page.getByTestId("decision-new")).toHaveCount(0);
  });
});

test.describe("the notification bell", () => {
  test("an error that was dismissed can still be read, and the count shows what is new", async ({ page }) => {
    await openDiagram(page, KEY);
    await expect(page.getByTestId("notifications-count")).toHaveCount(0);
    await node(page, "atm").click();
    const field = page.getByTestId("field-name");
    await field.fill("");
    await field.press("Enter");
    await expect(page.getByTestId("error")).toBeVisible();
    await page.getByRole("button", { name: "Dismiss" }).click();
    await expect(page.getByTestId("error")).toHaveCount(0);
    await expect(page.getByTestId("notifications-count")).toHaveText("1");
    await page.getByTestId("notifications").click();
    const panel = page.getByTestId("notifications-panel");
    await expect(panel.getByTestId("notification-log")).toHaveCount(1);
    await expect(panel).toContainText(/name/i);
    // Opened: nothing is new any more, and the line stays until it is cleared.
    await expect(page.getByTestId("notifications-count")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await page.getByTestId("notifications").click();
    await expect(panel.getByTestId("notification-log")).toHaveCount(1);
    await page.getByTestId("notifications-clear").click();
    await expect(panel.getByTestId("notification-log")).toHaveCount(0);
  });

  test("what waits now is listed and opens: the decisions that need a look", async ({ page }) => {
    await openDiagram(page, KEY);
    await page.getByTestId("notifications").click();
    const item = page.getByTestId("notification-decisions");
    await expect(item).toContainText("1 decision needs a look");
    await item.click();
    await expect(page.getByTestId("decisions-page")).toBeVisible();
    await expect(page.getByTestId("notifications-panel")).toHaveCount(0);
  });
});
