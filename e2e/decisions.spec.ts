/** Decision records in the browser (DEC-050): the page, a conditional decision, and the element panel. */

import fs from "node:fs";
import path from "node:path";
import { api, expect, node, openDiagram, test } from "./fixtures.js";

const KEY = "containers-internet-banking-system";

test.describe("decisions", () => {
  test("record a conditional decision, watch its conditions, and find it from the element", async ({ page, server }) => {
    await openDiagram(page, KEY);
    await page.getByTestId("open-decisions").click();
    await expect(page.getByTestId("decisions-page")).toBeVisible();
    // The demo's decisions are listed, newest number first.
    await expect(page.getByTestId("decision-0003")).toContainText("nightly batch");

    await page.getByTestId("decision-new").click();
    await page.getByTestId("decision-new-title").fill("Keep the session cache single-region");
    await page.getByTestId("decision-new-kind-conditional").check();
    await page.getByTestId("decision-new-create").click();
    await expect(page.getByTestId("decision-editor")).toBeVisible();

    await page.getByTestId("decision-context").fill("Customers sign in from one country.");
    await page.getByTestId("decision-decision").fill("One Redis cache in one region.");
    await page.getByTestId("decision-affects-add").selectOption("session-cache");
    await page.getByTestId("decision-alt-add").click();
    await page.getByTestId("decision-alt-0-name").fill("Multi-region cache");
    await page.getByTestId("decision-alt-0-why").fill("Cross-region replication costs more than it saves.");
    await page.getByTestId("decision-alt-0-if").fill("we opened in a second country\nlatency complaints passed 1%");
    await page.getByTestId("decision-copy-conditions").click();
    await expect(page.getByTestId("decision-trigger-1-text")).toHaveValue("latency complaints passed 1%");
    // A pasted key is flagged before it reaches git.
    await page.getByTestId("decision-context").fill("Customers sign in from one country. api_key=sk_live_abcdefghijklmnop");
    await expect(page.getByTestId("decision-secret-warning")).toBeVisible();
    await page.getByTestId("decision-context").fill("Customers sign in from one country.");
    await expect(page.getByTestId("decision-secret-warning")).toHaveCount(0);
    await page.getByTestId("decision-save").click();

    const record = page.getByTestId("decision-record");
    await expect(record).toContainText("What we would choose instead, and when");
    await expect(record).toContainText("we opened in a second country");
    const state = await api(server, "/state");
    const made = state.decisions.find((d: any) => d.title === "Keep the session cache single-region");
    expect(made).toMatchObject({ kind: "conditional", status: "proposed", affects: ["session-cache"], triggers: { open: 2, met: 0 } });
    const file = fs.readdirSync(path.join(server.root, "architecture", "decisions")).find((f) => f.startsWith(made.id));
    expect(fs.readFileSync(path.join(server.root, "architecture", "decisions", file!), "utf-8")).toContain("- [ ] we opened in a second country (→ Multi-region cache)");

    // Accept it, then mark a trigger as met: the decision now asks for a look.
    await page.getByTestId("decision-accept").click();
    await expect(record).toContainText("Accepted");
    // The box follows the saved record (it is ticked once the save is back).
    await page.getByTestId("decision-trigger-0").click();
    await expect(page.getByTestId("decision-trigger-0")).toBeChecked();
    await expect(record).toContainText("1 trigger met");
    await expect(page.getByTestId("open-decisions")).toContainText("1");

    // "About" jumps to the element; its panel lists the decision and opens it again.
    await page.getByTestId("decision-about-session-cache").click();
    await expect(page.getByTestId("decisions-page")).toHaveCount(0);
    await expect(node(page, "session-cache")).toBeVisible();
    await page.getByTestId(`panel-decision-${made.id}`).click();
    await expect(page.getByTestId("decision-record")).toContainText("Keep the session cache single-region");

    // Back closes the page and returns to the diagram.
    await page.getByTestId("decisions-close").click();
    await expect(page.getByTestId("decisions-page")).toHaveCount(0);
  });

  test("a decision edited in a draft shows in the draft's changes, not on main", async ({ page, server }) => {
    await openDiagram(page, KEY);
    const r = await fetch(`${server.url}api/drafts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Plan" }) });
    const { id } = await r.json();
    await fetch(`${server.url}api/decisions/0004`, { method: "PUT", headers: { "Content-Type": "application/json", "X-DP-Model": `draft:${id}` }, body: JSON.stringify({ status: "accepted" }) });
    await page.goto(`${server.url}#/d/${KEY}?m=draft%3A${id}&c=base&p=decisions/0004`);
    await expect(page.getByTestId("decision-record")).toContainText("Accepted");
    await expect(page.getByTestId("decisions-page")).toContainText("Draft: Plan");
    await page.getByTestId("decisions-close").click();
    await expect(page.getByTestId("change-0004")).toContainText("status");
    await page.getByTestId("change-0004").click();
    await expect(page.getByTestId("decision-record")).toContainText("Choose a fraud scoring provider");
    expect((await api(server, "/decisions/0004")).status).toBe("proposed");
  });
});
