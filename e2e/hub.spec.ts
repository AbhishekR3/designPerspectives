/** A hub of projects in the browser (DEC-052 to DEC-055): home page, project, shared catalog, credentials. */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { test as base, expect } from "@playwright/test";
import { staticDir } from "../src/core/store.js";
import { copyDemoHub, createHubApp } from "../src/server/hub.js";

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
  await expect(attention).toContainText("Identity Provider");
  await expect(page.getByTestId("home-shared")).toContainText("Written by several");
  await page.getByTestId("view-list").click();
  await expect(page.getByTestId("project-list")).toContainText("Payments");
  await page.getByTestId("view-grid").click();

  // A drifted copy: the link opens the project on that element.
  await attention.getByText("Identity Provider").click();
  await expect(page).toHaveURL(/pr=payments/);
  await expect(page.getByTestId("catalog-drift-note")).toContainText("description");
  await page.getByTestId("catalog-sync").click();
  await expect(page.getByTestId("catalog-drift-note")).toHaveCount(0);

  await page.getByTestId("go-home").click();
  await expect(page.getByTestId("home-page")).toBeVisible();
  await expect(page.getByTestId("home-attention")).not.toContainText("Identity Provider");
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
