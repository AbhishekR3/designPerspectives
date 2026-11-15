/** Stage P2: a new user starts from an empty project and builds a diagram. */

import { api, clickEmptyCanvas, expect, node, test, waitUntil, type Server } from "./fixtures.js";

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

const rels = async (server: Server) => (await api(server, "/state")).relationships as any[];
const post = (server: Server, path: string, body: object) =>
  fetch(server.url + "api" + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** Add a box from the palette and name it on the canvas. */
async function addNamed(page: import("@playwright/test").Page, testId: string, name: string) {
  await page.getByTestId(testId).click();
  await page.getByTestId("inline-name").fill(name);
  await page.getByTestId("inline-name").press("Enter");
}

test("ids are readable after the first rename; an empty system is one sidebar entry", async ({ page, server }) => {
  await addNamed(page, "add-softwareSystem", "Loan Book");
  // The first rename made the ID from the new name, and the selection followed it.
  await expect(node(page, "loan-book")).toBeVisible();
  await expect(node(page, "new-system")).toHaveCount(0);
  await expect(page.getByTestId("field-name")).toHaveValue("Loan Book");
  expect((await elements(server)).map((e) => e.id)).toEqual(["loan-book"]);
  // Only the first rename: later ones keep the ID.
  await page.getByTestId("field-name").fill("Loan Ledger");
  await page.getByTestId("field-name").press("Enter");
  await expect(node(page, "loan-book")).toContainText("Loan Ledger");

  // Escape keeps the generated ID and clears the mark: a later rename does not change it.
  await page.getByTestId("add-person").click();
  await page.getByTestId("inline-name").press("Escape");
  await expect(node(page, "new-person")).toBeVisible();
  await page.getByTestId("field-name").fill("Auditor");
  await page.getByTestId("field-name").press("Enter");
  await expect(node(page, "new-person")).toContainText("Auditor");

  // A system with nothing inside is one entry that opens its containers diagram, marked "(empty)".
  await expect(page.getByTestId("diagram-context-loan-book")).toHaveCount(0);
  const entry = page.getByTestId("diagram-containers-loan-book");
  await expect(entry).toContainText("(empty)");
  await entry.click();
  await expect(page.getByTestId("empty-hint")).toBeVisible();
  // Once it has a container it is two entries again, no longer "empty".
  await addNamed(page, "add-container", "Ledger Service");
  await expect(node(page, "ledger-service")).toBeVisible();
  await expect(page.getByTestId("diagram-containers-loan-book")).not.toContainText("(empty)");
  await expect(page.getByTestId("diagram-context-loan-book")).toBeVisible();
});

test("a person added on a container diagram is connected to the selected box, in one undo step", async ({ page, server }) => {
  const sys = (await (await post(server, "/elements", { kind: "softwareSystem", name: "Shop" })).json()).id;
  await page.reload();
  await page.getByTestId("diagram-containers-shop").click();
  // Nothing inside yet: a person or system cannot be connected to anything, so those items are off.
  await expect(page.getByTestId("add-person")).toBeDisabled();
  await expect(page.getByTestId("add-softwareSystem")).toBeDisabled();
  await expect(page.getByTestId("add-person")).toHaveAttribute("title", /Add a container first/);
  await addNamed(page, "add-container", "Web");
  await expect(node(page, "web")).toBeVisible();
  // One box inside: it is the one to connect to.
  await expect(page.getByTestId("add-person")).toBeEnabled();
  await clickEmptyCanvas(page);
  await addNamed(page, "add-container", "Api");
  await expect(node(page, "api")).toBeVisible();

  // Two boxes and none selected: nothing is created, and the notice says what to do.
  await clickEmptyCanvas(page);
  const before = (await elements(server)).length;
  await page.getByTestId("add-person").click();
  await expect(page.getByTestId("toast-info")).toContainText("Select the box it connects to first, then add it.");
  await page.waitForTimeout(300);
  expect((await elements(server)).length).toBe(before);

  // With a box selected the person is added connected to it, and shows on this diagram.
  await node(page, "web").click();
  await page.getByTestId("add-person").click();
  await page.getByTestId("inline-name").press("Escape");
  await expect(node(page, "new-person")).toBeVisible();
  const made = (await rels(server)).filter((r) => r.sourceId === "new-person");
  expect(made).toHaveLength(1);
  expect(made[0].destinationId).toBe("web");
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);

  // A software system is the other way round: the selected box uses it.
  await node(page, "api").click();
  await page.getByTestId("add-softwareSystem-external").click();
  await page.getByTestId("inline-name").press("Escape");
  const ext = (await elements(server)).find((e) => e.name === "External system")!;
  await expect(node(page, ext.id)).toBeVisible();
  expect((await rels(server)).some((r) => r.sourceId === "api" && r.destinationId === ext.id)).toBe(true);

  // One undo removes the system and its line; the next removes the person and its line.
  await page.getByTestId("undo").click();
  await waitUntil(async () => !(await elements(server)).some((e) => e.id === ext.id));
  expect((await rels(server)).some((r) => r.destinationId === ext.id)).toBe(false);
  await page.getByTestId("undo").click();
  await waitUntil(async () => !(await elements(server)).some((e) => e.id === "new-person"));
  expect((await rels(server)).some((r) => r.sourceId === "new-person")).toBe(false);
  await expect(node(page, "new-person")).toHaveCount(0);
  expect(sys).toBe("shop");
});

test("a person added on a context diagram is connected to the system", async ({ page, server }) => {
  await post(server, "/elements", { kind: "softwareSystem", name: "Shop" });
  await page.reload();
  await page.getByTestId("diagram-containers-shop").click();
  await page.getByTestId("crumb-context-shop").click();
  await expect(node(page, "shop")).toBeVisible();
  await addNamed(page, "add-person", "Shopper");
  await expect(node(page, "shopper")).toBeVisible();
  expect((await rels(server)).some((r) => r.sourceId === "shopper" && r.destinationId === "shop")).toBe(true);
});

test("a line dragged to empty canvas: pick a kind, get one connected box (one undo step)", async ({ page, server }) => {
  await post(server, "/elements", { kind: "person", name: "Customer" });
  await page.reload();
  await expect(node(page, "customer")).toBeVisible();
  const before = { e: (await elements(server)).length, r: (await rels(server)).length };
  const src = node(page, "customer");
  await src.hover();
  const h = (await src.locator(".connect-handle.h-r").boundingBox())!;
  const box = (await page.getByTestId("canvas").boundingBox())!;
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  // Well clear of the box (a connection snaps to a point within 90 px of a dot).
  await page.mouse.move(box.x + box.width - 40, box.y + box.height / 2 + 120, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByTestId("context-menu")).toBeVisible();
  await page.getByTestId("connect-kind-softwareSystem").click();
  await page.getByTestId("inline-name").fill("Payments");
  await page.getByTestId("inline-name").press("Enter");
  await expect(node(page, "payments")).toBeVisible();
  expect((await elements(server)).length).toBe(before.e + 1);
  expect((await rels(server)).filter((r) => r.sourceId === "customer" && r.destinationId === "payments")).toHaveLength(1);
  // Undo twice: the rename, then the box with its line.
  await page.getByTestId("undo").click();
  await page.getByTestId("undo").click();
  await waitUntil(async () => (await elements(server)).length === before.e);
  expect((await rels(server)).length).toBe(before.r);
});

test("the lens chosen by default stays for this project after the first container is added", async ({ page }) => {
  await expect(page.getByTestId("lens-select")).toHaveValue("architect");
  await addNamed(page, "add-softwareSystem", "Shop");
  await page.getByTestId("diagram-containers-shop").click();
  await addNamed(page, "add-container", "Web");
  await expect(node(page, "web")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("breadcrumb")).toBeVisible();
  await expect(page.getByTestId("lens-select")).toHaveValue("architect");
  // A choice is remembered per project, too.
  await page.getByTestId("lens-select").selectOption("overview");
  await page.reload();
  await expect(page.getByTestId("lens-select")).toHaveValue("overview");
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("dp.lens:")).length)).toBe(1);
});
