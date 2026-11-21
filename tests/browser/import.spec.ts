/** Import code (COD-02): scan, intake, an import file or the handoff, the review of the draft, a partial apply; roles. */

import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { callAs, expect, ROLE_USERS, signIn, test, waitUntil, type Server } from "./fixtures.js";

const json = (v: unknown) => JSON.stringify(v, null, 2);
const user = (note: string) => [{ kind: "user" as const, note }];

/** A C2 file over the demo model: two verified items, one partly verified, three unverified. */
function importFile(level: "c2" | "all" = "c2") {
  return {
    schemaVersion: 1,
    level,
    source: { kind: "hand" },
    objects: [
      {
        id: "ledger-service",
        type: "container",
        name: "Ledger Service",
        parent: "internet-banking-system",
        description: "Keeps the ledger.",
        technologies: ["TypeScript"],
        // A note counts only when its words are in what a person typed: here, the answers saved on the import page (step 3).
        evidence: user("Lets customers bank online."),
      },
      {
        id: "ledger-reader",
        type: "container",
        name: "Ledger Reader",
        parent: "internet-banking-system",
        description: "Reads the ledger.",
        technologies: ["TypeScript"],
        evidence: [{ kind: "file", path: "sample_code/payments/controller.ts", lines: [1, 3], text: "Payments Controller" }],
      },
      { id: "ledger-events", type: "container", name: "Ledger Events", parent: "internet-banking-system", archType: "queue", technologies: ["Kafka"] },
      { id: "audit-log", type: "container", name: "Audit Log", parent: "internet-banking-system", technologies: ["Postgres"] },
    ],
    relationships: [
      { source: "api-application", target: "ledger-service", description: "Posts ledger entries to", technologies: ["HTTPS"], evidence: user("The list of posted entries.") },
      { source: "ledger-service", target: "ledger-events", description: "Publishes ledger events to", technologies: ["Kafka"] },
    ],
  };
}

const openImport = async (page: Page) => {
  await page.getByTestId("breadcrumb").waitFor();
  await page.getByTestId("open-import").click();
  await expect(page.getByTestId("import-page")).toBeVisible();
};

const mainIds = async (server: Server) => {
  const s = (await callAs(server, "architect", "GET", "/state")).json;
  return { elements: s.elements.map((e: any) => e.id) as string[], relationships: s.relationships.map((r: any) => r.id) as string[], drafts: s.drafts.map((d: any) => d.id) as string[] };
};

/** The app without sign-in: the one local user is an architect, so every part of the page can be used. */
test.describe("the import page", () => {
  test("scan, intake, paste, review, apply the accepted items, finish the rest", async ({ page, server }) => {
    await openImport(page);
    await expect(page.getByTestId("import-section-scan")).toContainText("The code has not been scanned yet.");

    // 1. The scan: counts per level, the limits and the "not parsed" list collapsed, what it cannot see.
    await page.getByTestId("import-scan").click();
    await expect(page.getByTestId("scan-result")).toBeVisible();
    await expect(page.getByTestId("scan-count-c1")).toContainText("C1 System context");
    await expect(page.getByTestId("scan-count-c2")).toContainText("C2 Containers");
    await expect(page.getByTestId("scan-count-c4")).toContainText("source files");
    await expect(page.getByTestId("scan-not-parsed")).toBeVisible();
    await expect(page.getByTestId("scan-not-parsed")).not.toHaveAttribute("open", "");
    await page.getByTestId("scan-cannot-see").locator("summary").click();
    await expect(page.getByTestId("scan-cannot-see")).toContainText("hidden files and folders");
    await expect(page.getByTestId("import-scan")).toHaveText("Scan again");

    // 2. The readiness table, the totals and the recommendation with the rules that fired.
    await expect(page.getByTestId("readiness-table")).toBeVisible();
    await expect(page.getByTestId("level-row-c2")).toContainText("C2 Containers");
    await expect(page.getByTestId("readiness-totals")).toContainText("decided");
    await expect(page.getByTestId("recommendation")).toContainText("one level at a time");
    await expect(page.getByTestId("recommendation-rules")).toContainText("container candidates");
    await page.getByTestId("finalize-c1").click();
    await expect(page.getByTestId("finalize-refused")).toBeVisible();
    await expect(page.getByTestId("finalize-unmet")).not.toBeEmpty();

    // 3. About this system: a server error is shown at its field; a good answer is saved.
    await page.getByTestId("intake-must-not-open").fill("../secret");
    await page.getByTestId("intake-save").click();
    await expect(page.getByTestId("intake-error-must-not-open")).toContainText('must not contain ".."');
    await page.getByTestId("intake-must-not-open").fill(".env");
    await page.getByTestId("intake-name").fill("Internet Banking");
    await page.getByTestId("intake-purpose").fill("Lets customers bank online.");
    await page.getByTestId("intake-term-add").click();
    await page.getByTestId("intake-term-0").fill("Ledger");
    await page.getByTestId("intake-means-0").fill("The list of posted entries.");
    await page.getByTestId("intake-save").click();
    await expect(page.getByTestId("toast-success")).toContainText("Saved the answers");
    const overview = await waitUntil(async () => {
      const o = (await callAs(server, "architect", "GET", "/import")).json;
      return o.intake.system.name === "Internet Banking" ? o : null;
    });
    expect(overview.intake).toMatchObject({ system: { purpose: "Lets customers bank online." }, mustNotOpen: [".env"], glossary: [{ term: "Ledger", means: "The list of posted entries." }] });

    // 4. Paste an import file: a check, then the draft with its report.
    await page.getByTestId("tab-paste").click();
    await page.getByTestId("paste-text").fill(json(importFile()));
    await page.getByTestId("paste-check").click();
    await expect(page.getByTestId("paste-ok")).toContainText("The file is valid");
    await page.getByTestId("paste-create").click();
    await expect(page.getByTestId("import-result")).toContainText("The draft is ready");
    await expect(page.getByTestId("report-created")).toContainText("created");
    await expect(page.getByTestId("report-kept")).toContainText("0 kept your edit");
    await expect(page.getByTestId("import-drafts")).toContainText("Import C2");
    expect((await mainIds(server)).elements).not.toContain("ledger-service"); // nothing reached main

    // The draft opens with its review in the changes panel.
    await page.getByTestId("import-open-draft").click();
    await expect(page.getByTestId("import-page")).toHaveCount(0);
    await expect(page.getByTestId("draft-banner")).toContainText("Import C2");
    await expect(page.getByTestId("import-review")).toBeVisible();
    await expect(page.getByTestId("review-count-verified")).toHaveText("2 verified");
    await expect(page.getByTestId("review-count-partly")).toHaveText("1 partly verified");
    await expect(page.getByTestId("review-count-unverified")).toHaveText("3 unverified");
    await expect(page.getByTestId("review-count-pending")).toHaveText("6 pending");
    await expect(page.getByTestId("review-low-count")).toHaveText("(3)");

    // Accept all verified: the unverified ones are skipped and said so.
    await page.getByTestId("review-accept-all").click();
    await expect(page.getByTestId("review-skipped")).toHaveText("3 unverified items were not accepted. They need one decision each, below.");
    await expect(page.getByTestId("review-count-accepted")).toHaveText("3 accepted");
    await expect(page.getByTestId("review-count-pending")).toHaveText("3 pending");

    // The low-confidence list, one item at a time: its checks first, then reject one and accept another.
    const item = page.getByTestId("review-item");
    await expect(item).toContainText("Audit Log");
    await expect(page.getByTestId("review-check-no-evidence")).toContainText("No evidence was given");
    await page.getByTestId("review-item-feedback").fill("Is this the same as the audit service?");
    await page.getByTestId("review-item-feedback-save").click();
    await expect(page.getByTestId("review-item-feedback-save")).toBeDisabled();
    await page.getByTestId("review-reject").click();
    await expect(page.getByTestId("review-low-count")).toHaveText("(2)");
    await expect(item).toContainText("Ledger Events");
    await page.getByTestId("review-accept").click();
    await expect(page.getByTestId("review-low-count")).toHaveText("(1)");
    await expect(page.getByTestId("review-count-accepted")).toHaveText("4 accepted");
    await expect(page.getByTestId("review-count-rejected")).toContainText("1 rejected");
    await expect(item).toContainText("Publishes ledger events to");
    // A pick selects the object on the diagram.
    await page.getByTestId("review-draft-feedback").fill("Keep the names short.");
    await page.getByTestId("review-draft-feedback-save").click();
    await expect(page.getByTestId("review-draft-feedback-save")).toBeDisabled();

    // Apply: the accepted items are applied, one stays in the draft.
    await page.getByTestId("draft-apply").click();
    await expect(page.getByTestId("apply-held-summary")).toContainText("4 accepted items will be applied. 1 stays in the draft.");
    await page.getByTestId("apply-confirm").click();
    await expect(page.getByTestId("toast-success").filter({ hasText: "1 item stays in the draft" })).toBeVisible();
    await expect(page.getByTestId("draft-banner")).toBeVisible(); // the draft is still open
    let main = await waitUntil(async () => {
      const m = await mainIds(server);
      return m.elements.includes("ledger-service") ? m : null;
    });
    expect(main.elements).toEqual(expect.arrayContaining(["ledger-service", "ledger-reader", "ledger-events"]));
    expect(main.elements).not.toContain("audit-log"); // rejected
    expect(main.relationships).toContain("api-application--ledger-service");
    expect(main.relationships).not.toContain("ledger-service--ledger-events"); // held
    expect(main.drafts).toHaveLength(1);

    // Accept the rest and apply again: the draft is gone.
    await expect(page.getByTestId("review-low-count")).toHaveText("(1)");
    await page.getByTestId("review-accept").click();
    await expect(page.getByTestId("review-low-count")).toHaveText("(0)");
    await page.getByTestId("draft-apply").click();
    await expect(page.getByTestId("apply-confirm")).toBeEnabled();
    await expect(page.getByTestId("apply-held")).toHaveCount(0);
    await page.getByTestId("apply-confirm").click();
    await expect(page.getByTestId("draft-banner")).toHaveCount(0);
    main = await waitUntil(async () => {
      const m = await mainIds(server);
      return m.relationships.includes("ledger-service--ledger-events") ? m : null;
    });
    expect(main.drafts).toEqual([]);
  });

  test("Apply is refused while nothing is accepted, and says why", async ({ page, server }) => {
    const made = await callAs(server, "architect", "POST", "/import/file", { body: { text: json(importFile()) } });
    expect(made.status).toBe(200);
    await page.goto(`${server.url}#/d/landscape?m=draft:${made.json.draftId}&c=base`);
    await expect(page.getByTestId("import-review")).toBeVisible();
    // An item of the list is shown on the diagram: its object is selected and its details open.
    await page.getByTestId("review-item-pick").click();
    await expect(page.getByTestId("field-name")).toHaveValue("Audit Log");
    // The review stays visible next to the details of the picked object (above them), with its actions.
    await expect(page.getByTestId("import-review")).toBeVisible();
    await expect(page.getByTestId("review-accept")).toBeVisible();
    await page.getByTestId("draft-apply").click();
    await expect(page.getByTestId("apply-nothing-accepted")).toContainText("Nothing is accepted yet");
    await expect(page.getByTestId("apply-confirm")).toBeDisabled();
    await expect(page.getByTestId("apply-held-summary")).toContainText("stay in the draft");
  });

  test("the handoff tab writes the files and accepts a pasted result; an empty paste reads result.json", async ({ page, server, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openImport(page);
    await page.getByTestId("import-scan").click();
    await expect(page.getByTestId("scan-result")).toBeVisible();
    await page.getByTestId("bring-level").selectOption("c2");
    await expect(page.getByTestId("tab-handoff")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("tab-bmo")).toHaveCount(0); // BMO is off: no third tab
    await page.getByTestId("bring-handoff-write").click();
    await expect(page.getByTestId("bring-handoff-instruction")).toContainText("architecture/import/handoff/prompt.md");
    await expect(page.getByTestId("bring-handoff-folder")).toHaveText("architecture/import/handoff");
    for (const f of ["prompt.md", "schema.json", "handoff.json"]) expect(fs.existsSync(path.join(server.root, "architecture", "import", "handoff", f)), f).toBe(true);
    await page.getByTestId("bring-handoff-copy-line").click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("prompt.md");
    await page.getByTestId("bring-handoff-copy-prompt").click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("DATA");

    // A result that is not valid: the problems by field, and the text to send back.
    await page.getByTestId("bring-handoff-result-text").fill('{"schemaVersion": 1, "level": "c2", "objects": [{"id": "Bad Id", "type": "container", "name": "X"}], "relationships": []}');
    await page.getByTestId("bring-handoff-read").click();
    await expect(page.getByTestId("bring-handoff-problems-errors")).toContainText("/objects/0");
    await page.getByTestId("bring-handoff-problems-copy").click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("/objects/0");

    // A valid pasted result makes the draft.
    await page.getByTestId("bring-handoff-result-text").fill(json(importFile()));
    await page.getByTestId("bring-handoff-read").click();
    await expect(page.getByTestId("import-result")).toContainText("The draft is ready");

    // Written by the agent as result.json: an empty box reads the file.
    await page.getByTestId("bring-handoff-write").click();
    await expect(page.getByTestId("bring-handoff-offer")).toBeVisible();
    await page.getByTestId("bring-handoff-result-text").fill("");
    await page.getByTestId("bring-handoff-read").click();
    await expect(page.getByTestId("bring-handoff-problems-detail")).toContainText("no result yet");
    const folder = path.join(server.root, "architecture", "import", "handoff");
    fs.writeFileSync(path.join(folder, "result.json"), json({ ...importFile(), objects: [importFile().objects[0]], relationships: [] }));
    await page.getByTestId("bring-handoff-read").click();
    await expect(page.getByTestId("import-result")).toContainText("The draft is ready");
    await waitUntil(async () => (await mainIds(server)).drafts.length === 2);
  });

  test("a bad import file shows its errors by field and the text to copy back", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openImport(page);
    await page.getByTestId("tab-paste").click();
    const bad = { ...importFile(), objects: [{ id: "Not A Slug", type: "container", name: "X", surprise: true }] };
    await page.getByTestId("paste-text").fill(json(bad));
    await page.getByTestId("paste-check").click();
    await expect(page.getByTestId("paste-errors")).toContainText("/objects/0");
    await page.getByTestId("paste-check-copy").click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("/objects/0");
    await page.getByTestId("paste-create").click();
    await expect(page.getByTestId("paste-problems-detail")).toContainText("refused");
    await expect(page.getByTestId("paste-problems-errors")).toContainText("/objects/0");
    await page.getByTestId("paste-problems-copy").click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Fix these problems");
    await expect(page.getByTestId("import-result")).toHaveCount(0);
    await page.getByTestId("paste-text").fill("this is not json");
    await page.getByTestId("paste-create").click();
    await expect(page.getByTestId("paste-problems-errors")).toBeVisible();
  });

  test("the demo example is offered, checks, and makes a draft; a dropped file fills the box", async ({ page, server }) => {
    await openImport(page);
    await page.getByTestId("tab-paste").click();
    await page.getByTestId("paste-example").click();
    await expect(page.getByTestId("paste-text")).toHaveValue(/"Stripe"/);
    await page.getByTestId("paste-check").click();
    await expect(page.getByTestId("paste-ok")).toBeVisible();
    await page.getByTestId("paste-create").click();
    await expect(page.getByTestId("import-result")).toContainText("The draft is ready");
    await page.getByTestId("import-open-draft").click();
    await expect(page.getByTestId("review-count-unverified")).toContainText("unverified");
    expect((await callAs(server, "architect", "GET", "/state")).json.drafts).toHaveLength(1);

    // A file chosen from disk replaces the text.
    await page.getByTestId("open-import").click();
    await page.getByTestId("tab-paste").click();
    const file = path.join(server.root, "mine.json");
    fs.writeFileSync(file, json(importFile()));
    await page.getByTestId("paste-file").setInputFiles(file);
    await expect(page.getByTestId("paste-text")).toHaveValue(/Ledger Service/);
  });

  test("an architect ignores a file or candidate; the ignore list can be edited", async ({ page }) => {
    await openImport(page);
    await page.getByTestId("import-scan").click();
    await expect(page.getByTestId("candidates")).toBeVisible();
    await page.getByTestId("candidates-left").locator("summary").click();
    await page.getByTestId("candidates-left").locator("button", { hasText: "Ignore" }).first().click();
    await expect(page.getByTestId("ignore-list")).toContainText("Ignore list (1)");
    await page.getByTestId("ignore-input").fill("vendor/**");
    await page.getByTestId("ignore-add").click();
    await expect(page.getByTestId("ignore-list")).toContainText("Ignore list (2)");
    await page.getByTestId("ignore-remove-vendor/**").click();
    await expect(page.getByTestId("ignore-list")).toContainText("Ignore list (1)");
  });
});

test.describe("roles", () => {
  test.use({ users: { list: [...ROLE_USERS, { name: "engineer2", role: "engineer" }] } });

  test("a viewer does not see the Import button, and the server refuses a scan", async ({ page, server }) => {
    await signIn(page, "viewer");
    await expect(page.getByTestId("open-import")).toHaveCount(0);
    expect((await callAs(server, "viewer", "POST", "/import/scan")).status).toBe(403);
    // The page itself, opened by its address, only reads.
    await page.evaluate(() => (window.location.hash = "#/d/landscape?p=import"));
    await expect(page.getByTestId("import-readonly")).toBeVisible();
    await expect(page.getByTestId("import-scan")).toBeDisabled();
    await expect(page.getByTestId("finalize-c1")).toHaveCount(0);
  });

  test("an engineer imports into a draft and cannot finalize; another engineer sees that draft read-only", async ({ page, server }) => {
    await signIn(page, "engineer");
    await openImport(page);
    await page.getByTestId("import-scan").click();
    await expect(page.getByTestId("scan-result")).toBeVisible();
    await expect(page.getByTestId("finalize-c1")).toHaveCount(0);
    await expect(page.getByTestId("ignore-input")).toHaveCount(0);
    await page.getByTestId("tab-paste").click();
    await page.getByTestId("paste-text").fill(json(importFile()));
    await page.getByTestId("paste-create").click();
    await expect(page.getByTestId("import-result")).toBeVisible();
    await page.getByTestId("import-open-draft").click();
    await expect(page.getByTestId("review-accept-all")).toBeVisible();
    await expect(page.getByTestId("draft-apply")).toHaveCount(0); // an architect applies drafts
    expect((await callAs(server, "engineer", "POST", "/import/levels/c1", { body: { final: true } })).status).toBe(403);
    const id = (await callAs(server, "engineer", "GET", "/state")).json.drafts[0].id;

    // The second engineer reads the review but cannot decide.
    await page.getByTestId("user-chip").click();
    await page.getByTestId("sign-out").click();
    await signIn(page, "engineer2");
    await page.goto(`${server.url}#/d/landscape?m=draft:${id}&c=base`);
    await page.reload();
    await expect(page.getByTestId("import-review")).toBeVisible();
    await expect(page.getByTestId("review-readonly")).toContainText("not yours");
    await expect(page.getByTestId("review-accept-all")).toHaveCount(0);
    await expect(page.getByTestId("review-accept")).toHaveCount(0);
    await page.getByTestId("bmo-menu").click();
    await expect(page.getByTestId("bmo-explain")).toBeVisible();
    await expect(page.getByTestId("draft-propose-decision")).toHaveCount(0); // not their draft
    expect((await callAs(server, "engineer2", "POST", "/import/review/accept-all", { body: {}, draft: id })).status).toBe(403);
  });
});
