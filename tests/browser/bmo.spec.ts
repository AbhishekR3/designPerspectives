/** BMO in the browser (DEC-051), with a fake backend plugged into the server by the fixture: no model, no network. */

import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { callAs, expect, node, openDiagram, ROLE_USERS, signIn, test, waitUntil, type Server } from "./fixtures.js";

const KEY = "containers-internet-banking-system";
const json = (v: unknown) => JSON.stringify(v);
const user = (note: string) => [{ kind: "user" as const, note }];

const EXPLAIN = "This diagram shows the Internet Banking System and what it is made of.";
const CHALLENGE = "1. Why does the web application not call the mainframe through the API?\n2. Who owns the Session Cache?";
const SUMMARY = "Adds a Ledger container to the Internet Banking System.";
const ANSWERS = {
  explain: EXPLAIN,
  challenge: CHALLENGE,
  "draft-summary": SUMMARY,
  "decision-from-draft": json({
    title: "Add a separate ledger",
    context: "The API writes balances directly.",
    decision: "Move ledger writes to their own container.",
    alternatives: [{ name: "Keep it in the API", whyNot: "Couples releases." }],
    affects: ["api-application"],
  }),
  "describe-to-model": json({
    schemaVersion: 1,
    level: "all",
    objects: [{ id: "ledger-service", type: "container", name: "Ledger Service", parent: "internet-banking-system", evidence: user("the Ledger Service") }],
    relationships: [{ source: "ledger-service", target: "database", description: "Writes ledger entries to", evidence: user("it writes to the database") }],
  }),
  "import-level": json({
    schemaVersion: 1,
    level: "c2",
    objects: [{ id: "ledger-service", type: "container", name: "Ledger Service", parent: "internet-banking-system", evidence: user("seen in the compose file") }],
    relationships: [],
  }),
};

async function call(server: Server, method: string, p: string, opts: { body?: unknown; draft?: string } = {}): Promise<any> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.draft) headers["X-DP-Model"] = `draft:${opts.draft}`;
  const r = await fetch(server.url + "api" + p, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  return r.json();
}

/** A draft that adds a container, ready to summarise or to ask a decision of. */
async function draftWithChange(server: Server): Promise<string> {
  const { id } = await call(server, "POST", "/drafts", { body: { title: "Add a ledger" } });
  await call(server, "POST", "/elements", { draft: id, body: { kind: "container", parentId: "internet-banking-system", name: "Ledger" } });
  return id;
}

async function openRightPanel(page: Page) {
  if (await page.getByTestId("panel-open").isVisible()) await page.getByTestId("panel-open").click();
  await expect(page.getByTestId("panel")).toBeVisible();
}

test.describe("BMO is off", () => {
  test("the entry points show and open an explainer with the reason", async ({ page }) => {
    await openDiagram(page, KEY);
    await page.getByTestId("bmo-menu").click();
    await page.getByTestId("bmo-explain").click();
    await expect(page.getByTestId("bmo-sheet")).toBeVisible();
    await expect(page.getByTestId("bmo-explainer")).toBeVisible();
    await expect(page.getByTestId("bmo-explainer-reason")).toHaveText("BMO is turned off in the settings.");
    await expect(page.getByTestId("bmo-settings-link")).toBeVisible();
    await expect(page.getByTestId("bmo-send")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("bmo-sheet")).toHaveCount(0);

    // From an object's panel too, and from the BMO menu of a draft.
    await node(page, "mobile-app").click();
    await openRightPanel(page);
    await page.getByTestId("explain-element").click();
    await expect(page.getByTestId("bmo-explainer-reason")).toHaveText("BMO is turned off in the settings.");
    await page.getByTestId("bmo-close").click();
    await page.getByTestId("new-draft").click();
    await page.getByTestId("draft-title").fill("A draft");
    await page.getByTestId("draft-create").click();
    await page.getByTestId("bmo-menu").click();
    await page.getByTestId("draft-propose-decision").click();
    await expect(page.getByTestId("bmo-explainer")).toBeVisible();
  });

  test("a task with a handoff points to it", async ({ page }) => {
    await page.getByTestId("breadcrumb").waitFor();
    await page.getByTestId("open-import").click();
    await page.getByTestId("describe-text").fill("A web shop with a payments service.");
    await page.getByTestId("describe-bmo").click();
    await expect(page.getByTestId("bmo-explainer-reason")).toHaveText("BMO is turned off in the settings.");
    await expect(page.getByTestId("bmo-handoff-note")).toContainText("your own coding agent");
  });
});

test.describe("the settings", () => {
  test.use({ users: { list: ROLE_USERS } });

  test("an architect saves them, with the server's answers shown at the field; an engineer is refused", async ({ page, server }) => {
    await signIn(page, "architect");
    await page.evaluate(() => (window.location.hash = "#/settings/credentials"));
    await expect(page.getByTestId("bmo-settings")).toBeVisible();
    await expect(page.getByTestId("bmo-backend-handoff")).toBeChecked();
    await expect(page.getByTestId("bmo-save")).toBeDisabled();

    await page.getByTestId("bmo-enabled").check();
    await page.getByTestId("bmo-backend-direct").check();
    await page.getByTestId("bmo-provider").selectOption("anthropic");
    await expect(page.getByTestId("bmo-direct-statement")).toContainText("dp sends the prompt and the listed file excerpts to api.anthropic.com with your key.");
    await page.getByTestId("bmo-endpoint").fill("http://evil.example.com");
    await page.getByTestId("bmo-save").click();
    await expect(page.getByTestId("bmo-error-endpoint")).toBeVisible();
    await page.getByTestId("bmo-endpoint").fill("");
    await page.getByTestId("bmo-model").fill("claude-test-model");
    await page.getByTestId("bmo-budget").fill("50000");
    await page.getByTestId("bmo-role-viewer").uncheck();
    await page.getByTestId("bmo-price-in").fill("3");
    await page.getByTestId("bmo-price-out").fill("15");
    await page.getByTestId("bmo-save").click();
    await expect(page.getByTestId("toast-success")).toContainText("Saved the BMO settings");
    await expect(page.getByTestId("bmo-error-endpoint")).toHaveCount(0);

    const status = (await callAs(server, "architect", "GET", "/bmo")).json;
    expect(status).toMatchObject({
      enabled: true,
      backend: "direct",
      provider: "anthropic",
      model: "claude-test-model",
      host: "api.anthropic.com",
      passBudgetTokens: 50000,
      allowedRoles: ["architect", "engineer"],
      pricePerMTok: { input: 3, output: 15 },
    });
    expect(status.canRun).toMatchObject({ ok: false }); // no key is stored yet
    expect(fs.existsSync(path.join(server.root, ".dp", "bmo.json"))).toBe(true);
    // A key was never typed here: nothing secret is in the file.
    expect(fs.readFileSync(path.join(server.root, ".dp", "bmo.json"), "utf-8")).not.toMatch(/sk-/);

    // The viewer is not allowed: its explainer says which role.
    expect((await callAs(server, "viewer", "GET", "/bmo")).json.canRun.reason).toContain("viewer");

    // An engineer cannot change them.
    expect((await callAs(server, "engineer", "PUT", "/bmo/settings", { body: { enabled: false } })).status).toBe(403);
  });

  test("an engineer sees no settings", async ({ page }) => {
    await signIn(page, "engineer");
    await page.evaluate(() => (window.location.hash = "#/settings/credentials"));
    await expect(page.getByTestId("credentials-page")).toHaveCount(0);
    await expect(page.getByText("Only an architect can see and manage credentials.")).toBeVisible();
    await expect(page.getByTestId("bmo-settings")).toHaveCount(0);
  });
});

test.describe("with the fake backend", () => {
  test.use({ bmoFake: { answers: ANSWERS } });

  test("explain: the preview, the prompt, send, the text, copy", async ({ page, server, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openDiagram(page, KEY);
    await page.getByTestId("bmo-menu").click();
    await page.getByTestId("bmo-explain").click();
    await expect(page.getByTestId("bmo-preview")).toBeVisible();
    await expect(page.getByTestId("bmo-destination")).toContainText("fake");
    await expect(page.getByTestId("bmo-no-files")).toBeVisible();
    await expect(page.getByTestId("bmo-size")).toContainText("tokens");
    await expect(page.getByTestId("bmo-prompt-user")).toBeHidden();
    await page.getByTestId("bmo-prompt").locator("summary").click();
    await expect(page.getByTestId("bmo-prompt-user")).toContainText("Internet Banking System");
    expect(server.bmo!.calls).toHaveLength(0); // nothing is sent before the person says so
    await page.getByTestId("bmo-send").click();
    await expect(page.getByTestId("bmo-text")).toHaveText(EXPLAIN);
    expect(server.bmo!.calls).toHaveLength(1);
    expect(server.bmo!.calls[0]!.user).toContain("Internet Banking System");
    await page.getByTestId("bmo-copy").click();
    await expect(page.getByTestId("bmo-copy")).toHaveText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(EXPLAIN);
    await page.getByTestId("bmo-close").click();
    await expect(page.getByTestId("bmo-sheet")).toHaveCount(0);
  });

  test("a run can be cancelled before it is sent", async ({ page, server }) => {
    await openDiagram(page, KEY);
    await page.getByTestId("bmo-menu").click();
    await page.getByTestId("bmo-explain").click();
    await page.getByTestId("bmo-cancel").click();
    await expect(page.getByTestId("bmo-sheet")).toHaveCount(0);
    expect(server.bmo!.calls).toHaveLength(0);
  });

  test("explain an object and use the text as its description", async ({ page, server }) => {
    await openDiagram(page, KEY);
    await node(page, "mobile-app").click();
    await openRightPanel(page);
    await page.getByTestId("explain-element").click();
    await expect(page.getByTestId("bmo-preview")).toBeVisible();
    await page.getByTestId("bmo-send").click();
    await expect(page.getByTestId("bmo-text")).toHaveText(EXPLAIN);
    await page.getByTestId("bmo-use-description").click();
    await expect(page.getByTestId("bmo-sheet")).toHaveCount(0);
    await waitUntil(async () => (await call(server, "GET", "/state")).elements.find((e: any) => e.id === "mobile-app").description === EXPLAIN);
    await expect(page.getByTestId("field-description")).toHaveValue(EXPLAIN);
  });

  test("challenge, then add it as a question in the comments", async ({ page, server }) => {
    await openDiagram(page, KEY);
    await page.getByTestId("bmo-menu").click();
    await page.getByTestId("bmo-challenge").click();
    await page.getByTestId("bmo-send").click();
    await expect(page.getByTestId("bmo-text")).toHaveText(CHALLENGE);
    await page.getByTestId("bmo-add-question").click();
    await expect(page.getByTestId("toast-success")).toContainText("Added as a question");
    const t = await waitUntil(async () => (await call(server, "GET", "/comments")).threads[0]);
    expect(t).toMatchObject({ kind: "question", target: { type: "diagram", id: KEY } });
    expect(t.text).toContain("Why does the web application");
    await expect(page.getByTestId("comments-open")).toContainText("1");
  });

  test("propose a decision: it lands as proposed in the draft", async ({ page, server }) => {
    const id = await draftWithChange(server);
    await page.goto(`${server.url}#/d/landscape?m=draft:${id}&c=base`);
    await page.getByTestId("bmo-menu").click();
    await page.getByTestId("draft-propose-decision").click();
    await expect(page.getByTestId("bmo-preview")).toBeVisible();
    await expect(page.getByTestId("bmo-prompt")).toBeVisible();
    await page.getByTestId("bmo-send").click();
    await expect(page.getByTestId("bmo-decision-made")).toContainText("Add a separate ledger");
    const inDraft = await waitUntil(async () => (await call(server, "GET", "/decisions", { draft: id })).find((d: any) => d.title === "Add a separate ledger"));
    expect(inDraft.status).toBe("proposed");
    expect((await call(server, "GET", "/decisions")).some((d: any) => d.title === "Add a separate ledger")).toBe(false); // not in main
    await page.getByTestId("bmo-open-decisions").click();
    await expect(page.getByTestId("decisions-page")).toBeVisible();
    await expect(page.getByTestId("decisions-page")).toContainText("Add a separate ledger");
  });

  test("a summary for a pull request, from the apply dialog", async ({ page, server }) => {
    const id = await draftWithChange(server);
    await page.goto(`${server.url}#/d/landscape?m=draft:${id}&c=base`);
    await page.getByTestId("draft-apply").click();
    await page.getByTestId("apply-summary").click();
    await expect(page.getByTestId("bmo-preview")).toBeVisible();
    await expect(page.getByTestId("bmo-sheet")).toBeVisible();
    await page.getByTestId("bmo-send").click();
    await expect(page.getByTestId("bmo-text")).toHaveText(SUMMARY);
    expect(server.bmo!.calls[0]!.user).toContain("Ledger");
    await page.getByTestId("bmo-close").click();
    await expect(page.getByTestId("bmo-sheet")).toHaveCount(0);
    await expect(page.getByTestId("apply-confirm")).toBeVisible(); // the apply dialog is still there
  });

  test("describe a system in words: a draft to review", async ({ page, server }) => {
    await page.getByTestId("breadcrumb").waitFor();
    await page.getByTestId("open-import").click();
    await page.getByTestId("describe-text").fill("Customers pay through the Ledger Service, which writes to the database.");
    await page.getByTestId("describe-bmo").click();
    await expect(page.getByTestId("bmo-preview")).toBeVisible();
    await expect(page.getByTestId("bmo-prompt")).toBeVisible();
    await page.getByTestId("bmo-send").click();
    await expect(page.getByTestId("bmo-draft-made")).toBeVisible();
    expect((await call(server, "GET", "/state")).elements.some((e: any) => e.id === "ledger-service")).toBe(false); // a draft, not main
    await page.getByTestId("bmo-open-draft").click();
    await expect(page.getByTestId("draft-banner")).toContainText("BMO: from a description");
    await expect(page.getByTestId("import-review")).toBeVisible();
  });

  test("ask BMO for a level: the files that would be sent are listed first", async ({ page, server }) => {
    await page.getByTestId("breadcrumb").waitFor();
    await page.getByTestId("open-import").click();
    await page.getByTestId("import-scan").click();
    await expect(page.getByTestId("scan-result")).toBeVisible();
    await page.getByTestId("bring-level").selectOption("c2");
    await page.getByTestId("tab-bmo").click();
    await page.getByTestId("bmo-import-level").click();
    await expect(page.getByTestId("bmo-files")).toBeVisible();
    await expect(page.getByTestId("bmo-file-sample_code/docker-compose.yml")).toContainText("docker-compose.yml");
    await expect(page.getByTestId("bmo-file-sample_code/api/Dockerfile")).toBeVisible();
    await page.getByTestId("bmo-send").click();
    await expect(page.getByTestId("bmo-draft-made")).toBeVisible();
    expect(server.bmo!.calls[0]!.user).toContain("docker-compose");
    await page.getByTestId("bmo-open-draft").click();
    await expect(page.getByTestId("draft-banner")).toContainText("BMO: import C2");
  });

  test("a failed answer shows the problems and the text to copy back", async ({ page, server }) => {
    // The fake answers a bad file for this one run.
    (server.bmo as unknown as { run: unknown }).run = () =>
      Promise.resolve({ text: json({ schemaVersion: 1, level: "c2", objects: [{ id: "Bad Id", type: "container", name: "X" }], relationships: [] }) });
    await page.getByTestId("breadcrumb").waitFor();
    await page.getByTestId("open-import").click();
    await page.getByTestId("describe-text").fill("Anything.");
    await page.getByTestId("describe-bmo").click();
    await page.getByTestId("bmo-send").click();
    await expect(page.getByTestId("bmo-failed")).toBeVisible();
    await expect(page.getByTestId("bmo-errors")).toContainText("/objects/0");
    await expect(page.getByTestId("bmo-copy-errors")).toBeVisible();
  });
});

test.describe("roles with the fake backend", () => {
  test.use({ users: { list: ROLE_USERS }, bmoFake: { answers: ANSWERS } });

  test("a viewer can run explain, and is told why describe-to-model is not available", async ({ page, server }) => {
    await signIn(page, "viewer");
    await openDiagram(page, KEY);
    await page.getByTestId("bmo-menu").click();
    await page.getByTestId("bmo-explain").click();
    await page.getByTestId("bmo-send").click();
    await expect(page.getByTestId("bmo-text")).toHaveText(EXPLAIN);
    await expect(page.getByTestId("bmo-use-description")).toHaveCount(0); // a viewer cannot change anything
    await page.getByTestId("bmo-close").click();

    // The Import page is read-only for a viewer, but BMO's button explains instead of failing.
    await page.evaluate((k) => (window.location.hash = `#/d/${k}?p=import`), KEY);
    await page.getByTestId("describe-text").fill("A web shop.");
    await page.getByTestId("describe-bmo").click();
    await expect(page.getByTestId("bmo-explainer-reason")).toContainText("This task makes a draft");
    await expect(page.getByTestId("bmo-handoff-note")).toBeVisible();
    expect(server.bmo!.calls).toHaveLength(1); // only the explain
  });
});
