/** A hub of projects in the browser (HUB-03, HUB-04, HUB-06 and SEC-06): home page, project, shared catalog, credentials. */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { test as base, expect } from "@playwright/test";
import { initProject, staticDir } from "../../src/core/project.js";
import { copyDemoHub, createHubApp, initHub } from "../../src/server/hub.js";

const test = base.extend<{ hub: { url: string; root: string } }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures take their dependencies as an object pattern
  hub: async ({}, use, testInfo) => {
    testInfo.skip(staticDir() === null, "UI not built");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dp-e2e-hub-"));
    copyDemoHub(root);
    const { app } = createHubApp(root, { secretKey: null });
    const srv = await new Promise<ReturnType<typeof serve>>((resolve) => {
      const s = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, () => resolve(s));
    });
    await use({ url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/`, root });
    (srv as { closeAllConnections?: () => void }).closeAllConnections?.();
    await new Promise((r) => srv.close(r));
    fs.rmSync(root, { recursive: true, force: true });
  },
});

test("home page: projects, what needs a look, into a project and back", async ({ page, hub }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(hub.url);
  await expect(page).toHaveURL(/#\/home$/);
  await expect(page.getByTestId("project-onboarding")).toContainText("Customer onboarding");
  await expect(page.getByTestId("project-payments")).toContainText("Payments");
  const attention = page.getByTestId("home-attention");
  await expect(attention).toContainText("audit_log");
  // The demo's drifted copy was brought up to date by the hub, and the home page says where.
  await expect(attention).not.toContainText("Identity Provider");
  const updates = page.getByTestId("home-catalog-updates");
  await expect(updates).toContainText("Identity Provider");
  await expect(page.getByTestId("home-shared")).toContainText("Written by several");
  await page.getByTestId("view-list").click();
  await expect(page.getByTestId("project-list")).toContainText("Payments");
  await page.getByTestId("view-grid").click();

  // The link opens the project on that element: a linked copy, in step with the catalog.
  await updates.getByRole("link", { name: "Payments" }).click();
  await expect(page).toHaveURL(/pr=payments/);
  await expect(page.getByTestId("catalog-linked")).toContainText("Identity Provider");
  await expect(page.getByTestId("catalog-drift-note")).toHaveCount(0);

  await page.getByTestId("go-home").click();
  await expect(page.getByTestId("home-page")).toBeVisible();
  expect(errors).toEqual([]);
});

test("new project from a template, opened at once", async ({ page, hub }) => {
  await page.goto(`${hub.url}#/home`);
  await page.getByTestId("project-new").click();
  await page.getByTestId("project-new-name").fill("Cards");
  await page.getByTestId("project-new-create").click();
  await expect(page).toHaveURL(/pr=cards/);
  await expect(page.getByTestId("ws-name")).toHaveText("Cards");
  expect(JSON.parse(fs.readFileSync(path.join(hub.root, "hub.json"), "utf-8")).projects.map((p: { id: string }) => p.id)).toContain("cards");
});

test("shared catalog: who reads and writes each table; add a shared element to a project", async ({ page, hub }) => {
  await page.goto(`${hub.url}#/catalog`);
  await expect(page.getByTestId("asset-audit_log")).toContainText("written by 2 projects");
  await page.getByTestId("data-filter-writers").click();
  await expect(page.getByTestId("catalog-assets").locator("tbody tr")).toHaveCount(1);
  await page.getByTestId("add-to-e-mail-service").selectOption("onboarding");
  await expect(page).toHaveURL(/pr=onboarding.*|reveal=/);
  await expect(page.getByTestId("catalog-linked")).toContainText("E-mail Service");
});

test("data access on a line, and credentials that never show their value", async ({ page, hub }) => {
  const get = async (p: string) => (await fetch(`${hub.url}api${p}`, { headers: { "X-DP-Project": "onboarding" } })).json();
  const state = await get("/state");
  const rel = state.relationships.find((r: { sourceId: string; destinationId: string }) => r.sourceId === "kyc-service" && r.destinationId === "customer-db");
  // A diagram with a line that stands for this relationship alone (here a derived line, onboarding → Customer DB).
  let key = "";
  let edgeId = "";
  for (const d of state.diagrams) {
    const dia = await get(`/diagrams/${d.key}`);
    const e = dia.edges?.find((x: { relationshipIds: string[] }) => x.relationshipIds.length === 1 && x.relationshipIds[0] === rel.id);
    if (e) {
      key = d.key;
      edgeId = e.id;
      break;
    }
  }
  expect(key).not.toBe("");
  await page.goto(`${hub.url}#/d/${key}?pr=onboarding`);
  await page.getByTestId(`edge-${edgeId}`).click({ force: true });
  const sec = page.getByTestId("sec-data-access");
  await expect(sec).toContainText("Data of Customer DB");
  await expect(page.getByTestId("access-customers")).toHaveValue("write");
  await page.getByTestId("access-accounts").selectOption("read");
  await expect(page.getByTestId("access-accounts")).toHaveValue("read");
  expect((await get("/state")).relationships.find((r: { id: string }) => r.id === rel.id).dataAccess).toContainEqual({ asset: "accounts", mode: "read" });

  await page.goto(`${hub.url}#/settings/credentials`);
  await page.getByTestId("credential-new").click();
  await page.getByTestId("credential-name").fill("jira");
  await page.getByTestId("credential-provider").selectOption("jira");
  await page.getByTestId("credential-value").fill("jira-secret-value-0000wxyz");
  await page.getByTestId("credential-save").click();
  await expect(page.getByTestId("credential-jira")).toContainText("••••wxyz");
  await expect(page.locator("body")).not.toContainText("jira-secret-value");
  await expect(page.getByTestId("credentials-encryption")).toContainText("not encrypted");
});

test("a catalog change reaches every project; the home page lists it", async ({ page, hub }) => {
  const res = await fetch(`${hub.url}api/elements/customer-db`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-DP-Project": "catalog" },
    body: JSON.stringify({ description: "Customers, accounts and the audit log." }),
  });
  expect(res.status).toBe(200);
  await page.goto(`${hub.url}#/home`);
  const box = page.getByTestId("home-catalog-updates");
  await expect(box).toContainText("Customer DB");
  await expect(box).toContainText("Customer onboarding");
  await box.locator("li").filter({ hasText: "Customer DB" }).getByRole("link", { name: "Payments" }).click();
  await expect(page.getByTestId("field-description")).toHaveValue("Customers, accounts and the audit log.");
});

test("history: commits with what they changed, and what is not committed", async ({ page, hub }) => {
  const { execFileSync } = await import("node:child_process");
  const git = (...a: string[]) => execFileSync("git", ["-c", "user.name=Ana", "-c", "user.email=a@example.com", "-c", "commit.gpgsign=false", ...a], { cwd: hub.root, stdio: "ignore" });
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-q", "-m", "Hub demo");
  await fetch(`${hub.url}api/elements/ledger-worker`, { method: "PATCH", headers: { "Content-Type": "application/json", "X-DP-Project": "payments" }, body: JSON.stringify({ owner: "Ledger team" }) });
  await page.goto(`${hub.url}#/history`);
  await expect(page.getByTestId("history-list")).toContainText("Hub demo");
  await expect(page.getByTestId("uncommitted-payments")).toContainText("not committed yet");
  await page.getByTestId("history-list").getByText("Hub demo").click();
  await expect(page.getByTestId("history-list")).toContainText("Customer DB");
  await page.getByTestId("history-filter-onboarding").click();
  await expect(page.getByTestId("uncommitted-payments")).toHaveCount(0);
});

// ---------------------------------------------------------------- the small things on the hub pages

/** A hub server on a folder the test prepared itself; returns its URL and how to stop it. */
async function startHub(root: string): Promise<{ url: string; stop(): Promise<void> }> {
  const { app } = createHubApp(root, { secretKey: null });
  const srv = await new Promise<ReturnType<typeof serve>>((resolve) => {
    const s = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, () => resolve(s));
  });
  return {
    url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/`,
    stop: async () => {
      (srv as { closeAllConnections?: () => void }).closeAllConnections?.();
      await new Promise((r) => srv.close(r));
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

test("a new hub: the demo project, then a second project; the rail and the page count the same and the card opens it", async ({ page }, testInfo) => {
  testInfo.skip(staticDir() === null, "UI not built");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dp-e2e-newhub-"));
  initHub(root, { name: "my-hub" });
  const h = await startHub(root);
  try {
    await page.goto(h.url);
    await expect(page.getByTestId("hub-shell")).toContainText("1 project");
    await expect(page.getByTestId("project-demo")).toBeVisible();
    await page.getByTestId("project-new").click();
    await page.getByTestId("project-new-name").fill("EPCAT");
    await page.getByTestId("project-new-create").click();
    await expect(page).toHaveURL(/pr=epcat/);
    await page.getByTestId("go-home").click();
    await expect(page.getByTestId("home-page")).toContainText("2 projects and a shared catalog");
    await expect(page.locator(".hub-brand")).toContainText("2 projects");
    await expect(page.getByTestId("rail-project-epcat")).toBeVisible();
    // The card is a link into the project; a second visit works like the first.
    for (let i = 0; i < 2; i++) {
      await page.getByTestId("project-epcat").click();
      await expect(page).toHaveURL(/pr=epcat/);
      await expect(page.getByTestId("ws-name")).toHaveText("EPCAT");
      await page.getByTestId("go-home").click();
      await expect(page.getByTestId("home-page")).toBeVisible();
    }
  } finally {
    await h.stop();
  }
});

test("a project added elsewhere shows in the rail when the window gets the focus, and its card opens it", async ({ page, hub }) => {
  await page.goto(`${hub.url}#/home`);
  await expect(page.getByTestId("project-payments")).toBeVisible();
  const before = await page.locator(".hub-brand").innerText();
  // Another tab, a colleague or the CLI adds a project.
  const made = await fetch(`${hub.url}api/hub/projects`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "cards", name: "Cards", template: "empty" }) });
  expect(made.status).toBe(200);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByTestId("project-cards")).toBeVisible();
  await expect(page.getByTestId("rail-project-cards")).toBeVisible();
  expect(await page.locator(".hub-brand").innerText()).not.toBe(before);
  await page.getByTestId("project-cards").click();
  await expect(page).toHaveURL(/pr=cards/);
  await expect(page.getByTestId("ws-name")).toHaveText("Cards");
});

test("a link to a project this page has not heard of asks the server first; one that does not exist says so, and links still work after", async ({ page, hub }) => {
  await page.goto(`${hub.url}#/home`);
  await expect(page.getByTestId("project-payments")).toBeVisible();
  await fetch(`${hub.url}api/hub/projects`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "cards", name: "Cards", template: "empty" }) });
  // No focus event: the page still has the old list, and the link names the new project.
  await page.evaluate(() => (window.location.hash = "#/d/landscape?pr=cards"));
  await expect(page.getByTestId("ws-name")).toHaveText("Cards");

  await page.evaluate(() => (window.location.hash = "#/d/landscape?pr=no-such-project"));
  await expect(page).toHaveURL(/#\/home$/);
  await expect(page.getByTestId("error")).toContainText('no project "no-such-project"');
  // The same bad link again is answered again (it used to do nothing the second time), and a good one opens.
  await page.evaluate(() => (window.location.hash = "#/d/landscape?pr=no-such-project"));
  await expect(page).toHaveURL(/#\/home$/);
  await page.getByTestId("project-payments").click();
  await expect(page).toHaveURL(/pr=payments/);
});

test("a decision on the home page opens that decision, not the diagram under it", async ({ page, hub }) => {
  await page.goto(`${hub.url}#/home`);
  await page.getByTestId("home-decisions").getByRole("link").first().click();
  await expect(page).toHaveURL(/p=decisions\//);
  await expect(page.getByTestId("decisions-page")).toBeVisible();
  await expect(page.getByTestId("decision-record")).toBeVisible();
});

test("a card says its contents once, and a refresh that fails keeps the page", async ({ page, hub }) => {
  await page.goto(`${hub.url}#/home`);
  const card = page.getByTestId("project-payments");
  await expect(card).toBeVisible();
  const text = await card.innerText();
  const stats = /\d+ systems?/.exec(text)?.[0];
  expect(stats).toBeTruthy();
  expect(text.split(stats!).length - 1).toBe(1);
  // The server stops answering: the loaded page stays, with a message.
  await page.route("**/api/home", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "Down for the test." }) }));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByTestId("error")).toContainText("could not be refreshed");
  await expect(card).toBeVisible();
});

test("the bell on the hub pages keeps an error after it is dismissed", async ({ page, hub }) => {
  await page.goto(`${hub.url}#/home`);
  await expect(page.getByTestId("project-payments")).toBeVisible();
  await page.evaluate(() => (window.location.hash = "#/d/landscape?pr=no-such-project"));
  await expect(page.getByTestId("error")).toContainText("no-such-project");
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByTestId("notifications-count")).toHaveText("1");
  await page.getByTestId("notifications").click();
  await expect(page.getByTestId("notifications-panel")).toContainText("no-such-project");
  // The bell does not sit on the page's own button.
  const bell = (await page.getByTestId("notifications").boundingBox())!;
  const add = (await page.getByTestId("project-new").boundingBox())!;
  expect(add.x + add.width <= bell.x || add.y >= bell.y + bell.height).toBe(true);
});

test("New project on a folder that already holds a model asks first, and a create whose answer is lost still shows the project", async ({ page, hub }) => {
  // A folder with a model that the hub does not list yet.
  initProject(path.join(hub.root, "legacy"), { demo: false, name: "Old model" });
  await page.goto(`${hub.url}#/home`);
  await page.getByTestId("project-new").click();
  await page.getByTestId("project-new-name").fill("Legacy");
  await page.getByTestId("project-new-create").click();
  const ask = page.getByTestId("dialog");
  await expect(ask).toContainText("already holds a model");
  await expect(ask).toContainText("Old model");
  // No: nothing is added.
  await page.getByTestId("dialog-cancel").click();
  await expect(page.getByTestId("project-new-dialog")).toContainText("Not created");
  expect(JSON.parse(fs.readFileSync(path.join(hub.root, "hub.json"), "utf-8")).projects.map((p: { id: string }) => p.id)).not.toContain("legacy");
  // Yes: the model in the folder is the project.
  await page.getByTestId("project-new-create").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page).toHaveURL(/pr=legacy/);
  await expect(page.getByTestId("ws-name")).toHaveText("Old model"); // the model is kept as it is, its own name included

  // A create that works on the server while the browser gets an error: the rail and the page show the project all the same.
  await page.getByTestId("go-home").click();
  await page.route("**/api/hub/projects", async (r) => {
    await r.fetch();
    await r.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ detail: "The answer was lost." }) });
  });
  await page.getByTestId("project-new").click();
  await page.getByTestId("project-new-name").fill("Cards");
  await page.getByTestId("project-new-create").click();
  await expect(page.getByTestId("project-new-dialog")).toContainText("The answer was lost.");
  await expect(page.getByTestId("rail-project-cards")).toBeVisible();
  await page.getByTestId("project-new-dialog").getByRole("button", { name: "Cancel" }).click();
  await page.getByTestId("project-cards").click();
  await expect(page).toHaveURL(/pr=cards/);
});

test("Work across projects: the demo hub's items, filtered by project and status, each linked to its project (WRK-05)", async ({ page, hub }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${hub.url}#/home`);
  await page.getByTestId("rail-work").click();
  await expect(page).toHaveURL(/#\/work$/);
  const rows = page.getByTestId("hub-work-row");
  await expect(page.getByTestId("hub-work-summary")).toContainText("open");
  // Grouped by project; done items hidden.
  await expect(page.getByTestId("hub-work-group").filter({ hasText: "Payments" })).toBeVisible();
  await expect(page.getByTestId("hub-work-group").filter({ hasText: "Customer onboarding" })).toBeVisible();
  await expect(rows.filter({ hasText: "Ledger Worker quality gate" })).toBeVisible();
  await expect(rows.filter({ hasText: "return 409 on a repeated request" })).toHaveCount(0);
  await page.getByTestId("hub-work-status").selectOption("all");
  await expect(rows.filter({ hasText: "return 409 on a repeated request" })).toBeVisible();

  await page.getByTestId("hub-work-project-onboarding").click();
  await expect(rows.filter({ hasText: "Ledger Worker quality gate" })).toHaveCount(0);
  await expect(rows.filter({ hasText: "Retry identity checks" })).toBeVisible();
  await page.getByTestId("hub-work-project-all").click();
  await page.getByTestId("hub-work-severity").selectOption("critical");
  await expect(rows).toHaveCount(1);
  await page.getByTestId("hub-work-severity").selectOption("");
  await page.getByTestId("hub-work-search").fill("nothing like this");
  await expect(page.getByTestId("hub-work-empty")).toContainText("Nothing matches");
  await page.getByTestId("hub-work-search").fill("");

  // A row pinned to a box opens its project on that box.
  await rows.filter({ hasText: "Ledger Worker quality gate" }).getByTestId("hub-work-pin").click();
  await expect(page).toHaveURL(/pr=payments/);
  await expect(page.getByTestId("node-ledger-worker")).toHaveClass(/selected/);
  expect(errors).toEqual([]);
});
