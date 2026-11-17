/** The checklist in the browser (DEC-083): the card, starter lists, items edited in place, items linked to a box, dp's own checks with Show, and a viewer. */

import { callAs, confirmDialog, expect, node, openDiagram, ROLE_USERS, signIn, test, waitUntil, type Server } from "./fixtures.js";

const KEY = "containers-internet-banking-system";
const API = "api-application";

const post = (server: Server, p: string, body: unknown) =>
  fetch(`${server.url}api${p}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const item = (page: import("@playwright/test").Page, text: string) => page.getByTestId("checklist-list").locator("li", { hasText: text });

test.describe("checklist", () => {
  test("press L, add the starting list, add an item, tick it, edit it, note it, delete it", async ({ page }) => {
    await openDiagram(page, KEY);
    await expect(page.getByTestId("checklist-card")).toHaveCount(0);
    await page.keyboard.press("l");
    await expect(page.getByTestId("checklist-card")).toBeVisible();
    await expect(page.getByTestId("checklist-empty")).toBeVisible();

    // The starting list: an item dp checks itself shows a mark, not a checkbox (it is done, so it is under "All").
    await page.getByTestId("checklist-starter-start").click();
    await page.getByTestId("checklist-filter-all").click();
    const people = page.locator('[data-rule="people"]');
    await expect(people).toHaveAttribute("data-status", "done");
    await expect(people.locator('[data-testid^="checklist-mark-"]')).toBeVisible();
    await expect(people.locator('[data-testid^="checklist-check-"]')).toHaveCount(0);
    await expect(page.getByTestId("checklist-add-starter-start")).toHaveCount(0);
    await expect(page.getByTestId("checklist-progress-text")).toContainText("done");

    await page.getByTestId("checklist-filter-open").click();
    await expect(people).toHaveCount(0);

    // Quick add keeps the focus in the input for the next one.
    const input = page.getByTestId("checklist-add-input");
    await input.fill("Ask the bank about the gateway");
    await input.press("Enter");
    await expect(item(page, "Ask the bank about the gateway")).toBeVisible();
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("");

    // Tick it: it is done, so it leaves "Open" and is under "All".
    const row = item(page, "Ask the bank about the gateway");
    await row.locator('[data-testid^="checklist-check-"]').click();
    await expect(row).toHaveCount(0);
    await page.getByTestId("checklist-filter-all").click();
    await expect(item(page, "Ask the bank about the gateway")).toHaveAttribute("data-status", "done");
    await item(page, "Ask the bank about the gateway").locator('[data-testid^="checklist-check-"]').click();
    await expect(item(page, "Ask the bank about the gateway")).toHaveAttribute("data-status", "open");

    // Edit in place: Escape puts the text back, Enter saves.
    await item(page, "Ask the bank").locator('[data-testid^="checklist-text-"]').click();
    const edit = page.locator('[data-testid^="checklist-edit-"]');
    await edit.fill("Something else");
    await edit.press("Escape");
    await expect(page.locator('[data-testid^="checklist-edit-"]')).toHaveCount(0);
    await expect(item(page, "Ask the bank about the gateway")).toBeVisible();
    await item(page, "Ask the bank").locator('[data-testid^="checklist-text-"]').click();
    await edit.fill("Ask the bank about the API gateway");
    await edit.press("Enter");
    await expect(item(page, "Ask the bank about the API gateway")).toBeVisible();

    // A note from the item menu: Ctrl+Enter saves, and the note shows under the item.
    const mine = item(page, "Ask the bank about the API gateway");
    await mine.locator('[data-testid^="checklist-menu-"][aria-haspopup]').click();
    await page.getByTestId("checklist-menu-answer").click();
    const note = page.locator('[data-testid^="checklist-answer-edit-"]');
    await note.fill("They answer on Friday.");
    await note.press("Control+Enter");
    await expect(mine.locator('[data-testid^="checklist-answer-"]')).toContainText("They answer on Friday.");

    // Delete asks first.
    await mine.locator('[data-testid^="checklist-menu-"][aria-haspopup]').click();
    await page.getByTestId("checklist-menu-delete").click();
    await confirmDialog(page);
    await expect(mine).toHaveCount(0);

    // The top-bar button counts the open items, and L closes the card.
    await expect(page.getByTestId("checklist-open").locator(".comments-count")).toBeVisible();
    await page.keyboard.press("l");
    await expect(page.getByTestId("checklist-card")).toHaveCount(0);
  });

  test("Add to checklist… in the right-click menu links the item to the box, and the Selection filter finds it", async ({ page }) => {
    await openDiagram(page, KEY);
    await node(page, API).click({ button: "right" });
    await page.getByTestId("ctx-checklist").click();
    await expect(page.getByTestId("checklist-card")).toBeVisible();
    await expect(page.getByTestId("checklist-add-input")).toBeFocused();
    await expect(page.getByTestId("checklist-add-about-check")).toBeChecked();
    await expect(page.getByTestId("checklist-add-about")).toContainText("API Application");
    await page.getByTestId("checklist-add-input").fill("Rate limit this API");
    await page.getByTestId("checklist-add-input").press("Enter");
    const row = item(page, "Rate limit this API");
    await expect(row).toBeVisible();
    await expect(row.locator('[data-testid^="checklist-target-"]')).toContainText("API Application");

    // Another box is selected (the card covers boxes, so L hides it for the click): the filter shows nothing about it, and the first box shows the item again.
    await page.getByTestId("checklist-open").click();
    await node(page, "single-page-application").click();
    await page.getByTestId("checklist-open").click();
    await page.getByTestId("checklist-filter-selection").click();
    await expect(page.getByTestId("checklist-none")).toBeVisible();
    await page.getByTestId("checklist-open").click();
    await node(page, API).click();
    await page.getByTestId("checklist-open").click();
    await expect(item(page, "Rate limit this API")).toBeVisible();

    // Nothing selected: the filter cannot be used.
    await page.getByTestId("checklist-filter-open").click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("checklist-filter-selection")).toBeDisabled();

    // The target chip shows the box.
    await item(page, "Rate limit this API").locator('[data-testid^="checklist-target-"]').click();
    await expect(page.getByTestId("object-panel")).toBeVisible();
  });

  test("a rule that fails says why and Show steps to the objects that fail it", async ({ page, server }) => {
    const edge = (await (await fetch(`${server.url}api/diagrams/${KEY}`)).json()).edges.find((e: any) => !e.derived && e.relationshipIds.length === 1);
    expect(
      await (
        await fetch(`${server.url}api/relationships/${edge.relationshipIds[0]}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: "Uses" }),
        })
      ).status,
    ).toBe(200);
    expect((await post(server, "/checklist/starters/start", {})).status).toBe(200);
    await openDiagram(page, KEY);
    await page.getByTestId("checklist-open").click();
    const labels = page.locator('[data-rule="labels"]');
    await expect(labels).toHaveAttribute("data-status", "open");
    await expect(labels.locator('[data-testid^="checklist-detail-"]')).toContainText("Uses");
    const show = labels.locator('[data-testid^="checklist-show-"]');
    await expect(show).toBeVisible();
    await show.click();
    await expect(page.getByTestId("edge-panel").or(page.getByTestId("object-panel"))).toBeVisible();

    // Dp ticks it itself once the lines are labelled; a person can only skip a failing one.
    const total = (await waitUntil(async () => (await (await fetch(`${server.url}api/checklist`)).json()).items.find((i: any) => i.rule === "labels"))).check.count;
    if (total > 1) await expect(show).toContainText(/Show \d of \d+/);
    await page.getByTestId("checklist-filter-all").click();
    await labels.locator('[data-testid^="checklist-menu-"][aria-haspopup]').click();
    await page.getByTestId("checklist-menu-skip").click();
    await expect(labels).toHaveAttribute("data-status", "skipped");
    await expect(labels).toContainText("Skipped");
  });

  test("the import page adds the import list and opens the checklist", async ({ page }) => {
    await openDiagram(page, KEY);
    await page.getByTestId("open-import").click();
    await page.getByTestId("import-add-checklist").click();
    await expect(page.getByTestId("import-checklist-progress")).toContainText("done");
    await expect(page.getByTestId("import-add-checklist")).toHaveCount(0);
    await page.getByTestId("import-open-checklist").click();
    await expect(page.getByTestId("import-page")).toHaveCount(0);
    await expect(page.getByTestId("checklist-card")).toBeVisible();
    await page.getByTestId("checklist-filter-all").click();
    await expect(page.locator('[data-rule="scan"]')).toBeVisible();
  });

  test.describe("a viewer", () => {
    test.use({ users: { list: ROLE_USERS } });

    test("sees the list and cannot change it", async ({ page, server }) => {
      expect((await callAs(server, "architect", "POST", "/checklist/starters/start", { body: {} })).status).toBe(200);
      await callAs(server, "architect", "POST", "/checklist", {
        body: { text: "Confirm the hosting", kind: "assumption" },
      });
      await signIn(page, "viewer");
      await page.getByTestId("checklist-open").click();
      await expect(page.getByTestId("checklist-card")).toBeVisible();
      await page.getByTestId("checklist-filter-all").click();
      await expect(item(page, "Confirm the hosting")).toBeVisible();
      await expect(page.getByTestId("checklist-readonly")).toBeVisible();
      await expect(page.getByTestId("checklist-add-input")).toHaveCount(0);
      await expect(page.locator('[data-testid^="checklist-menu-"][aria-haspopup]')).toHaveCount(0);
      await expect(item(page, "Confirm the hosting").locator('[data-testid^="checklist-check-"]')).toBeDisabled();
      // The right-click menu offers nothing to add either.
      await page.getByTestId("checklist-open").click();
      await expect(page.getByTestId("checklist-card")).toHaveCount(0);
      const box = (await page.getByTestId("canvas").boundingBox())!;
      await page.getByTestId("canvas").click({ button: "right", position: { x: box.width - 15, y: box.height / 2 } });
      await expect(page.getByRole("menuitem").first()).toBeVisible();
      await expect(page.getByTestId("ctx-checklist")).toHaveCount(0);
    });
  });
});
