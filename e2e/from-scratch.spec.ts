/** Stage P2: a new user starts from an empty project and builds a diagram. */

import { api, expect, node, test, waitUntil, type Server } from "./fixtures.js";

test.use({ project: "empty" });

const elements = async (server: Server) => (await api(server, "/state")).elements as any[];
const byName = (server: Server, name: string) => waitUntil(async () => (await elements(server)).find((e) => e.name === name));

test("build a diagram from an empty project", async ({ page, server }) => {
  // The empty landscape shows the start card, and the lens is Architect (a model without containers).
  await expect(page.getByTestId("empty-state")).toBeVisible();
  await expect(page.getByTestId("lens-select")).toHaveValue("architect");
  await expect(page.getByText("This level is not in the")).toHaveCount(0);
  await expect(page.getByTestId("diagram-landscape")).toBeVisible();

  // Add a person and a system from the card; each starts inline rename.
  await page.getByTestId("empty-add-person").click();
  await page.getByTestId("inline-name").fill("Customer");
  await page.getByTestId("inline-name").press("Enter");
  const person = await byName(server, "Customer");
  expect(person.kind).toBe("person");
  await expect(page.getByTestId("empty-state")).toHaveCount(0);

  await page.getByTestId("add-softwareSystem").click();
  await page.getByTestId("inline-name").fill("Webshop");
  await page.getByTestId("inline-name").press("Enter");
  const system = await byName(server, "Webshop");
  expect(system.kind).toBe("softwareSystem");
  // Still Architect: adding boxes does not flip the lens.
  await expect(page.getByTestId("lens-select")).toHaveValue("architect");

  // Connect them by dragging from one box's handle onto the other box.
  const src = node(page, person.id);
  const dst = node(page, system.id);
  await src.hover();
  await src.locator(".connect-handle.h-r").dragTo(dst, { force: true });
  await expect(page.getByTestId("edge-panel")).toBeVisible();
  const rels = await waitUntil(async () => {
    const r = ((await api(server, "/state")).relationships as any[]).filter((x) => x.sourceId === person.id && x.destinationId === system.id);
    return r.length ? r : null;
  });
  expect(rels).toHaveLength(1);

  // Open the system: its diagram is empty and says what to do next.
  await dst.dblclick();
  await expect(page.getByTestId("empty-hint")).toContainText("Add a container from the palette");
  await page.getByTestId("add-container").click();
  await page.getByTestId("inline-name").fill("Web app");
  await page.getByTestId("inline-name").press("Enter");
  const container = await byName(server, "Web app");
  expect(container.parentId).toBe(system.id);
  await expect(page.getByTestId("empty-hint")).toHaveCount(0);

  // Back to the landscape, then reload: everything is still there.
  await page.getByTestId("crumb-landscape").click();
  await expect(node(page, person.id)).toBeVisible();
  await page.reload();
  await expect(node(page, person.id)).toBeVisible();
  await expect(node(page, system.id)).toBeVisible();
  await expect(page.getByTestId("empty-state")).toHaveCount(0);
  // The model now has a container, so a browser with no saved lens choice starts in Engineer from here on.
  expect((await api(server, "/state")).defaultLens).toBe("engineer");
});
