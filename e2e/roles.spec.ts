/** Stage P4: sign-in and roles in the browser: the sign-in page, the user chip, what each role sees and can do. */

import type { Page } from "@playwright/test";
import { callAs, clickEmptyCanvas, confirmDialog, expect, node, openDiagram, ROLE_USERS, signIn, test, testPassword, waitUntil, type Server } from "./fixtures.js";

const KEY = "containers-internet-banking-system";
const hashKey = (page: Page) => page.evaluate(() => window.location.hash);

/** Every request the page sends to the API, as "METHOD /path". */
function recordRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/")) seen.push(`${r.method()} ${u.pathname}`);
  });
  return seen;
}
const changes = (seen: string[]) => seen.filter((s) => !s.startsWith("GET ") && s !== "POST /api/login" && s !== "POST /api/logout");

async function draftIds(server: Server, as = "architect"): Promise<Record<string, string>> {
  const s = (await callAs(server, as, "GET", "/state")).json;
  return Object.fromEntries(s.drafts.map((d: any) => [d.title, d.id]));
}

async function newDraftAs(server: Server, as: string, title: string): Promise<string> {
  const r = await callAs(server, as, "POST", "/drafts", { body: { title } });
  expect(r.status).toBe(200);
  return r.json.id;
}

test.describe("sign-in is off", () => {
  test("no sign-in page and no user chip", async ({ page }) => {
    await expect(page.getByTestId("breadcrumb")).toBeVisible();
    await expect(page.getByTestId("sign-in")).toHaveCount(0);
    await expect(page.getByTestId("user-chip")).toHaveCount(0);
    await expect(page.getByTestId("view-only")).toHaveCount(0);
    await expect(page.getByTestId("role-banner")).toHaveCount(0);
  });
});

test.describe("with sign-in", () => {
  test.use({ users: { list: ROLE_USERS } });

  test("the sign-in page, a wrong password, a lockout, the session across a reload, sign out", async ({ page }) => {
    await expect(page.getByTestId("sign-in")).toBeVisible();
    await expect(page.getByTestId("breadcrumb")).toHaveCount(0);
    await expect(page.getByTestId("sign-in-name")).toBeFocused();
    await expect(page.getByTestId("sign-in-name")).toHaveAttribute("autocomplete", "username");
    await expect(page.getByTestId("sign-in-password")).toHaveAttribute("autocomplete", "current-password");
    await expect(page.getByTestId("sign-in-submit")).toBeDisabled();

    await page.getByTestId("sign-in-name").fill("engineer");
    await page.getByTestId("sign-in-password").fill("not-the-password");
    await page.getByTestId("sign-in-password").press("Enter"); // Enter submits
    await expect(page.getByTestId("sign-in-error")).toHaveText("Wrong name or password.");
    await expect(page.getByTestId("sign-in")).toBeVisible();

    await page.getByTestId("sign-in-password").fill(testPassword("engineer"));
    await page.getByTestId("sign-in-password").press("Enter");
    await expect(page.getByTestId("breadcrumb")).toBeVisible();
    await expect(page.getByTestId("sign-in")).toHaveCount(0);
    await expect(page.getByTestId("user-chip")).toContainText("engineer");
    await expect(page.getByTestId("user-role")).toHaveText("Engineer");

    // The session is a cookie: a reload goes straight into the app.
    await page.reload();
    await expect(page.getByTestId("breadcrumb")).toBeVisible();
    await expect(page.getByTestId("sign-in")).toHaveCount(0);
    await expect(page.getByTestId("user-chip")).toContainText("engineer");

    await page.getByTestId("user-chip").click();
    await expect(page.getByTestId("user-menu-who")).toHaveText("Signed in as engineer (Engineer)");
    await expect(page.getByTestId("user-menu")).toContainText("proposes changes in drafts");
    await page.getByTestId("sign-out").click();
    await expect(page.getByTestId("sign-in")).toBeVisible();
    await expect(page.getByTestId("sign-in-note")).toHaveCount(0); // signing out is not an ended session
    await page.reload();
    await expect(page.getByTestId("sign-in")).toBeVisible();

    // Too many wrong passwords for a name: the server's message is shown as it is.
    for (let i = 0; i < 6; i++) {
      await page.getByTestId("sign-in-name").fill("viewer");
      await page.getByTestId("sign-in-password").fill(`wrong-${i}`);
      await page.getByTestId("sign-in-submit").click();
      await expect(page.getByTestId("sign-in-error")).toBeVisible();
    }
    await expect(page.getByTestId("sign-in-error")).toContainText("Too many failed sign-ins");
  });

  test("the sign-in page shows a busy button while it asks the server", async ({ page }) => {
    await page.route("**/api/login", async (route) => {
      await new Promise((r) => setTimeout(r, 600));
      await route.continue();
    });
    await page.getByTestId("sign-in-name").fill("viewer");
    await page.getByTestId("sign-in-password").fill(testPassword("viewer"));
    await page.getByTestId("sign-in-submit").click();
    await expect(page.getByTestId("sign-in-submit")).toBeDisabled();
    await expect(page.getByTestId("sign-in-submit")).toHaveText("Signing in…");
    await expect(page.getByTestId("breadcrumb")).toBeVisible();
  });

  test("a viewer: Overview lens, nothing to edit, no change request is ever sent", async ({ page, server }) => {
    const draft = await newDraftAs(server, "engineer", "Viewer sees this");
    const seen = recordRequests(page);
    await signIn(page, "viewer");
    await expect(page.getByTestId("user-role")).toHaveText("Viewer");
    await expect(page.getByTestId("view-only")).toBeVisible();
    await expect(page.getByTestId("lens-select")).toHaveValue("overview");
    await expect(page.getByTestId("role-banner")).toHaveCount(0);
    await expect(page.getByTestId("readonly-banner")).toHaveCount(0); // that one is for a server that is read-only for everyone

    // The tour: Engineer lens (it shows containers), every editing control gone.
    await page.getByTestId("lens-select").selectOption("engineer");
    await openDiagram(page, KEY);
    for (const id of ["palette", "undo", "redo", "auto-layout", "new-draft", "new-lens", "new-tag-group", "sidebar-characteristics", "sidebar-cost"]) {
      await expect(page.getByTestId(id), id).toHaveCount(0);
    }
    await expect(page.getByTestId("ws-name")).toHaveJSProperty("tagName", "DIV"); // not a button: it cannot be renamed
    await expect(page.getByTestId("lens-edit")).toHaveCount(0);

    // A box: no quick bar, a read-only panel, no drag.
    const api = node(page, "api-application");
    await api.click();
    await expect(page.getByTestId("object-panel")).toBeVisible();
    await expect(page.getByTestId("qb-symbol")).toHaveCount(0);
    await expect(page.getByTestId("qb-delete")).toHaveCount(0);
    for (const id of ["field-name", "field-description", "field-owner"]) await expect(page.getByTestId(id), id).toBeDisabled();
    for (const id of ["delete-element", "duplicate-element", "move-element", "new-planned-file"]) await expect(page.getByTestId(id), id).toHaveCount(0);
    await expect(page.getByTestId("sec-style")).toHaveCount(0);
    // Dragging a box does not move it (the canvas may pan under the pointer, so compare with another box).
    const gap = async () => {
      const [a, b] = [await api.boundingBox(), await node(page, "mobile-app").boundingBox()];
      return [Math.round(a!.x - b!.x), Math.round(a!.y - b!.y)];
    };
    const before = await gap();
    const at = (await api.boundingBox())!;
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await page.mouse.down();
    await page.mouse.move(at.x + at.width / 2 + 120, at.y + at.height / 2 + 80, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    expect(await gap()).toEqual(before);
    await page.keyboard.press("Delete");
    await page.keyboard.press("F2");
    await page.keyboard.press("Control+z");
    await expect(page.getByTestId("dialog")).toHaveCount(0);
    await expect(page.getByTestId("inline-name")).toHaveCount(0);

    // Right-click menus offer no change.
    await api.click({ button: "right" });
    await expect(page.getByTestId("context-menu")).toBeVisible();
    for (const id of ["ctx-rename", "ctx-delete", "ctx-duplicate", "ctx-move", "ctx-paste", "ctx-reset-style"]) await expect(page.getByTestId(id), id).toHaveCount(0);
    await page.keyboard.press("Escape");

    // The dock: look at the overlays, no way to edit what they are made of.
    await page.getByTestId("dock-tags").click();
    await expect(page.getByTestId("dock-new-tag-group")).toHaveCount(0);
    await page.getByTestId("dock-char").click();
    await expect(page.getByTestId("edit-characteristics")).toHaveCount(0);
    await page.getByTestId("dock-cost").click();
    await expect(page.getByTestId("edit-cost")).toHaveCount(0);

    // Flows can be played, not made or edited.
    await page.getByTestId("flows-menu").click();
    await expect(page.getByTestId("flow-list")).toBeVisible();
    await expect(page.getByTestId("new-flow")).toHaveCount(0);
    const flow = (await callAs(server, "viewer", "GET", "/state")).json.flows[0];
    await page.getByTestId(`flow-${flow.key}`).click();
    await expect(page.getByTestId("flow-panel")).toBeVisible();
    await expect(page.getByTestId("add-step")).toHaveCount(0);
    await expect(page.getByTestId("flow-panel").getByLabel("Remove step")).toHaveCount(0);

    // The file editor: read-only, and it says why.
    await openDiagram(page, "code-accounts-summary-controller");
    await node(page, "file:sample_code/api/accounts.py").click();
    await page.getByTestId("open-file").click();
    await expect(page.getByTestId("code-editor")).toBeVisible();
    await expect(page.getByTestId("code-editor")).toHaveJSProperty("readOnly", true);
    await expect(page.getByTestId("code-readonly-note")).toContainText("Your role cannot change code files here");
    await expect(page.getByTestId("code-save")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("code-editor")).toHaveCount(0);

    // A draft: it can be looked at and its plan read; nothing in it can be changed, applied or discarded.
    await openDiagram(page, KEY);
    await expect(page.getByTestId(`draft-${draft}`)).toBeVisible();
    await expect(page.getByTestId(`draft-menu-${draft}`)).toHaveCount(0);
    await page.getByTestId(`draft-${draft}`).click();
    await expect(page.getByTestId("draft-banner")).toContainText("Viewer sees this");
    for (const id of ["draft-apply", "draft-discard", "draft-apply-note", "palette", "undo"]) await expect(page.getByTestId(id), id).toHaveCount(0);
    await page.getByTestId("draft-plan").click();
    await expect(page.getByTestId("plan-branch")).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("error")).toHaveCount(0);

    // A viewer can look at everything, but they changed nothing: only reads (and the sign-in) went out.
    expect(changes(seen)).toEqual([]);
    expect(seen.filter((s) => s.startsWith("GET ")).length).toBeGreaterThan(5);
  });

  test("an engineer: Engineer lens, drafts only", async ({ page, server }) => {
    const byArchitect = await newDraftAs(server, "architect", "Architect plan");
    await signIn(page, "engineer");
    await expect(page.getByTestId("user-role")).toHaveText("Engineer");
    await expect(page.getByTestId("lens-select")).toHaveValue("engineer");
    await openDiagram(page, KEY);

    // On main: a banner with the way forward, and no editing controls.
    await expect(page.getByTestId("role-banner")).toContainText("You are viewing the main model. Engineers propose changes in a draft.");
    await expect(page.getByTestId("view-only")).toHaveCount(0);
    for (const id of ["palette", "undo", "auto-layout", "new-lens", "new-tag-group"]) await expect(page.getByTestId(id), id).toHaveCount(0);
    await node(page, "api-application").click();
    await expect(page.getByTestId("field-name")).toBeDisabled();
    await expect(page.getByTestId("qb-delete")).toHaveCount(0);
    // Their draft menu: Rename and Edit description for any draft, Discard only for their own.
    await page.getByTestId(`draft-menu-${byArchitect}`).click();
    await expect(page.getByTestId("draft-rename")).toBeVisible();
    await expect(page.getByTestId("draft-edit-description")).toBeVisible();
    await expect(page.getByTestId("draft-discard")).toHaveCount(0);
    await page.keyboard.press("Escape");
    // The main model refuses their changes, with a readable reason.
    const refused = await callAs(server, "engineer", "POST", "/elements", { body: { kind: "container", name: "Nope", parentId: "internet-banking-system" } });
    expect(refused.status).toBe(403);

    // Start a draft from the banner: the app moves into it, on the same diagram.
    const hashBefore = await hashKey(page);
    await page.getByTestId("role-start-draft").click();
    await expect(page.getByTestId("new-draft-dialog")).toBeVisible();
    await page.getByTestId("draft-title").fill("Engineer change");
    await page.getByTestId("draft-create").click();
    await expect(page.getByTestId("draft-banner")).toContainText("Draft: Engineer change");
    await expect(page.getByTestId("role-banner")).toHaveCount(0);
    const mine = (await draftIds(server, "engineer"))["Engineer change"]!;
    expect(mine).toBeTruthy();
    expect(await hashKey(page)).toBe(`${hashBefore.split("?")[0]}?m=draft%3A${mine}&c=base`);
    expect((await callAs(server, "engineer", "GET", "/state")).json.drafts.find((d: any) => d.id === mine).author).toBe("engineer");

    // In the draft they edit: add a container, move a box.
    await expect(page.getByTestId("palette")).toBeVisible();
    await page.getByTestId("add-container-queue").click();
    await page.getByTestId("inline-name").fill("Audit queue");
    await page.getByTestId("inline-name").press("Enter");
    await waitUntil(async () => (await callAs(server, "engineer", "GET", "/state", { draft: mine })).json.elements.some((e: any) => e.name === "Audit queue"));
    expect((await callAs(server, "engineer", "GET", "/state")).json.elements.some((e: any) => e.name === "Audit queue")).toBe(false);
    await clickEmptyCanvas(page); // the quick bar of the new box would cover the box to drag
    await page.waitForTimeout(600);
    const posOf = async () => (await callAs(server, "engineer", "GET", `/diagrams/${KEY}`, { draft: mine })).json.nodes.find((n: any) => n.id === "mobile-app").position;
    const start = await posOf();
    const box = (await node(page, "mobile-app").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 60, { steps: 10 });
    await page.mouse.up();
    await waitUntil(async () => JSON.stringify(await posOf()) !== JSON.stringify(start));
    await expect(page.getByTestId("error")).toHaveCount(0);

    // The draft strip: no Apply (a note instead), the coding plan stays, Discard of their own draft.
    await expect(page.getByTestId("draft-apply")).toHaveCount(0);
    await expect(page.getByTestId("draft-apply-note")).toHaveText("An architect applies drafts.");
    await expect(page.getByTestId("draft-plan")).toBeVisible();
    await expect(page.getByTestId("draft-discard")).toBeVisible();
    expect((await callAs(server, "engineer", "POST", `/drafts/${mine}/apply`, {})).status).toBe(403);

    // Not their draft: it can be opened and edited, not applied or discarded.
    await page.getByTestId(`draft-${byArchitect}`).click();
    await expect(page.getByTestId("draft-banner")).toContainText("Architect plan");
    await expect(page.getByTestId("draft-apply-note")).toBeVisible();
    await expect(page.getByTestId("draft-discard")).toHaveCount(0);
    expect((await callAs(server, "engineer", "DELETE", `/drafts/${byArchitect}`)).status).toBe(403);

    // They can discard their own.
    await page.getByTestId(`draft-${mine}`).click();
    await page.getByTestId("draft-discard").click();
    await confirmDialog(page);
    await expect(page.getByTestId("draft-banner")).toHaveCount(0);
    await expect(page.getByTestId("role-banner")).toBeVisible();
    await waitUntil(async () => !(await draftIds(server, "engineer"))["Engineer change"]);
    await expect(page.getByTestId("error")).toHaveCount(0);
  });

  test("an architect: Architect lens, edits main, applies an engineer's draft", async ({ page, server }) => {
    const draft = await newDraftAs(server, "engineer", "Engineer proposal");
    expect(
      (await callAs(server, "engineer", "POST", "/elements", { draft, body: { kind: "container", name: "Proposed cache", archType: "cache", parentId: "internet-banking-system" } })).status,
    ).toBe(200);
    await signIn(page, "architect");
    await expect(page.getByTestId("user-role")).toHaveText("Architect");
    await expect(page.getByTestId("lens-select")).toHaveValue("architect");
    await expect(page.getByTestId("role-banner")).toHaveCount(0);
    await openDiagram(page, KEY);

    // Main: the palette, and a change saved to the main model.
    await expect(page.getByTestId("palette")).toBeVisible();
    await page.getByTestId("add-container-queue").click();
    await page.getByTestId("inline-name").fill("Main queue");
    await page.getByTestId("inline-name").press("Enter");
    await waitUntil(async () => (await callAs(server, "architect", "GET", "/state")).json.elements.some((e: any) => e.name === "Main queue"));

    // The engineer's draft: open it, apply it.
    await page.getByTestId(`draft-${draft}`).click();
    await expect(page.getByTestId("draft-banner")).toContainText("Engineer proposal");
    await expect(page.getByTestId("draft-discard")).toBeVisible();
    await page.getByTestId("draft-apply").click();
    await page.getByTestId("apply-confirm").click();
    await expect(page.getByTestId("draft-banner")).toHaveCount(0);
    await waitUntil(async () => (await callAs(server, "architect", "GET", "/state")).json.elements.some((e: any) => e.name === "Proposed cache"));
    expect((await callAs(server, "architect", "GET", "/state")).json.drafts).toEqual([]);
    await expect(page.getByTestId("error")).toHaveCount(0);
  });

  test("a session that ends while the app is open returns to the sign-in page, then to the same diagram", async ({ page, context }) => {
    await signIn(page, "architect");
    await openDiagram(page, KEY);
    const hash = await hashKey(page);
    expect(hash).toBe(`#/d/${KEY}`);

    await context.clearCookies(); // as if the session expired or the server restarted
    await page.getByTestId("add-container-queue").click(); // any call finds out
    await expect(page.getByTestId("sign-in")).toBeVisible();
    await expect(page.getByTestId("sign-in-note")).toHaveText("Your session ended. Sign in again.");
    await expect(page.getByTestId("error")).toHaveCount(0);
    expect(await hashKey(page)).toBe(hash);

    await signIn(page, "architect");
    await expect(page.getByTestId("sign-in")).toHaveCount(0);
    await expect(page.getByTestId("error")).toHaveCount(0);
    expect(await hashKey(page)).toBe(hash);
    await expect(node(page, "api-application")).toBeVisible();
    // The failed add was not made.
    await expect(page.getByTestId("breadcrumb")).toContainText("Internet Banking System");
  });

  test("a change the server refuses with 403 shows its message once, and the state is loaded again", async ({ page }) => {
    await signIn(page, "architect");
    await openDiagram(page, KEY);
    // As if the role had changed while the page was open: the server answers 403 to a change.
    const why = "Only an architect can do this. (test)";
    await page.route("**/api/elements", async (route) => {
      if (route.request().method() === "POST") await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ detail: why }) });
      else await route.continue();
    });
    const states: string[] = [];
    page.on("request", (r) => new URL(r.url()).pathname === "/api/state" && states.push(r.method()));
    await page.getByTestId("add-container-queue").click();
    await expect(page.getByTestId("error")).toHaveCount(1);
    await expect(page.getByTestId("error")).toHaveText(why);
    await waitUntil(async () => states.length >= 1);
    await page.waitForTimeout(500);
    await expect(page.getByTestId("error")).toHaveCount(1);
    await expect(page.getByTestId("sign-in")).toHaveCount(0);
  });

  test("each user keeps their own lens", async ({ browser, server }) => {
    const open = async (name: string) => {
      const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
      const page = await context.newPage();
      await page.goto(server.url);
      await signIn(page, name);
      return { context, page };
    };
    const a = await open("architect");
    const b = await open("engineer");
    await expect(a.page.getByTestId("lens-select")).toHaveValue("architect");
    await expect(b.page.getByTestId("lens-select")).toHaveValue("engineer");
    await a.page.getByTestId("lens-select").selectOption("overview");
    await expect(a.page.getByTestId("lens-select")).toHaveValue("overview");
    await a.page.reload();
    await expect(a.page.getByTestId("lens-select")).toHaveValue("overview");
    await b.page.reload();
    await expect(b.page.getByTestId("lens-select")).toHaveValue("engineer");

    // Same browser: another person starts in their role's lens, and the first one's choice is still there.
    await a.page.getByTestId("user-chip").click();
    await a.page.getByTestId("sign-out").click();
    await signIn(a.page, "viewer");
    await expect(a.page.getByTestId("lens-select")).toHaveValue("overview");
    await a.page.getByTestId("lens-select").selectOption("architect");
    await a.page.getByTestId("user-chip").click();
    await a.page.getByTestId("sign-out").click();
    await signIn(a.page, "engineer");
    await expect(a.page.getByTestId("lens-select")).toHaveValue("engineer");
    await a.page.getByTestId("user-chip").click();
    await a.page.getByTestId("sign-out").click();
    await signIn(a.page, "architect");
    await expect(a.page.getByTestId("lens-select")).toHaveValue("overview");
    await a.context.close();
    await b.context.close();
  });
});

test.describe("a long name", () => {
  test.use({ users: { list: [...ROLE_USERS, { name: "a-very-long-user-name-1234567890-abcdef", role: "architect" }] }, viewport: { width: 1280, height: 800 } });

  test("the top bar does not overflow at 1280 px", async ({ page }) => {
    await signIn(page, "a-very-long-user-name-1234567890-abcdef");
    await openDiagram(page, KEY);
    await node(page, "api-application").click();
    const chip = (await page.getByTestId("user-chip").boundingBox())!;
    const bar = (await page.locator(".hud.top-right .bar").first().boundingBox())!;
    const tools = (await page.locator(".hud.top-right .bar.tools").boundingBox())!;
    const nav = (await page.locator(".hud.top-left .bar.nav").boundingBox())!;
    const main = (await page.locator(".canvas-wrap").boundingBox())!;
    expect(chip.width).toBeLessThanOrEqual(175);
    for (const b of [chip, bar, tools]) {
      expect(b.x).toBeGreaterThanOrEqual(main.x);
      expect(b.x + b.width).toBeLessThanOrEqual(main.x + main.width);
    }
    expect(nav.x + nav.width).toBeLessThanOrEqual(bar.x); // the top bars do not overlap
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(page.locator(".user-chip .user-name")).toHaveCSS("text-overflow", "ellipsis");
  });
});
