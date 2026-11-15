/** Stage C1: drafts — edit a copy of the model, see what it changes, apply it. */

import { api, confirmDialog, clickEmptyCanvas, expect, node, openDiagram, test, waitUntil, type Server } from "./fixtures.js";

async function createDraft(server: Server, title: string): Promise<string> {
  const r = await fetch(server.url + "api/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
  return (await r.json()).id;
}

test("a draft shows added and removed objects, and applying it changes the main model", async ({ page, server }) => {
  const id = await createDraft(server, "Plan");
  await openDiagram(page, "containers-internet-banking-system");
  await page.getByTestId(`draft-${id}`).click();
  await expect(page.getByTestId("draft-banner")).toContainText("Draft: Plan");
  await expect(page).toHaveURL(new RegExp(`m=draft%3A${id}`));

  // Add a container in the draft: it is marked as added.
  await page.getByTestId("add-container-queue").click();
  await page.getByTestId("inline-name").press("Escape");
  await expect(page.locator('[data-change="added"]')).toHaveCount(1);

  // Delete one: it stays on the diagram as a removed ghost.
  await node(page, "mobile-app").click();
  await page.keyboard.press("Delete");
  await confirmDialog(page);
  await expect(node(page, "mobile-app")).toHaveAttribute("data-change", "removed");
  await expect(node(page, "mobile-app")).toHaveClass(/ghost/);
  await expect(page.getByTestId("change-summary").locator('[data-count="added"]')).toHaveAttribute("title", "1 added");
  // The container and its 4 relationships.
  await expect(page.getByTestId("change-summary").locator('[data-count="removed"]')).toHaveAttribute("title", "5 removed");

  // The ghost opens read-only; the change list lists both.
  await node(page, "mobile-app").click();
  await expect(page.getByTestId("ghost-panel")).toBeVisible();
  await clickEmptyCanvas(page);
  await expect(page.getByTestId("change-list")).toContainText("Mobile App");

  // The main model is untouched so far.
  let main = (await api(server, "/state")).elements as any[];
  expect(main.some((e) => e.id === "mobile-app")).toBe(true);
  expect(main.some((e) => e.name.startsWith("Queue"))).toBe(false);

  await page.getByTestId("draft-apply").click({ timeout: 4000 });
  await page.getByTestId("apply-confirm").click();
  await expect(page.getByTestId("draft-banner")).toHaveCount(0);
  await expect(page.getByTestId("draft-main")).toHaveClass(/active/);
  main = await waitUntil(async () => {
    const els = (await api(server, "/state")).elements as any[];
    return els.some((e) => e.name.startsWith("Queue")) ? els : null;
  });
  expect(main.some((e) => e.id === "mobile-app")).toBe(false);
  await expect(node(page, "mobile-app")).toHaveCount(0);
  expect((await api(server, "/state")).drafts).toEqual([]);
});

test("discard a draft", async ({ page, server }) => {
  const id = await createDraft(server, "Throwaway");
  await openDiagram(page, "landscape");
  await page.getByTestId(`draft-${id}`).click();
  await page.getByTestId("draft-discard").click();
  await confirmDialog(page);
  await expect(page.getByTestId("draft-banner")).toHaveCount(0);
  await waitUntil(async () => (await api(server, "/state")).drafts.length === 0);
});
