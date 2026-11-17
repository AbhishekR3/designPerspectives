/** Linked work in the browser (DEC-085, DEC-087): the Work page (toolbar button), its How it works view and severity mapping, filters, reveal from a row, adding an item, work on a diagram and on a flow, "Link work…" in the right-click menu, and the refresh button. */

import { api, expect, node, openDiagram, test, waitUntil, type Server } from "./fixtures.js";

const KEY = "containers-internet-banking-system";
const API = "api-application";

const post = (server: Server, p: string, body: unknown) =>
  fetch(`${server.url}api${p}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

/** Items with known titles on a box and on the project, one of them done and one linked to GitHub. */
async function seed(server: Server): Promise<void> {
  const r = await post(server, "/work/items", {
    items: [
      { to: { type: "element", id: API }, item: { title: "Seeded security finding", type: "security", severity: "critical", status: "open" } },
      { to: { type: "element", id: API }, item: { title: "Seeded pull request", type: "pr", status: "in-progress", url: "https://github.com/example/repo/pull/7" } },
      { to: { type: "project" }, item: { title: "Seeded finished backlog item", type: "backlog", status: "done" } },
    ],
  });
  expect(r.status).toBe(200);
}
const rowOf = (page: import("@playwright/test").Page, title: string) => page.getByTestId("work-row").filter({ hasText: title });

test.describe("linked work", () => {
  test("the Work button opens the page (no key does); filters narrow the list; a row shows its box", async ({ page, server }) => {
    await seed(server);
    await page.reload();
    await openDiagram(page, KEY);
    await expect(page.getByTestId("work-page")).toHaveCount(0);

    await page.getByTestId("open-work").click();
    await expect(page.getByTestId("work-page")).toBeVisible();
    await expect(page.getByTestId("open-work")).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(/p=work/);
    await expect(page.getByTestId("work-summary")).toContainText("open");

    // Closing it; W is not a shortcut (the button is the way in), so the page stays closed.
    await page.getByTestId("work-close").click();
    await expect(page.getByTestId("work-page")).toHaveCount(0);
    await page.keyboard.press("w");
    await expect(page.getByTestId("work-page")).toHaveCount(0);
    await page.getByTestId("open-work").click();
    await expect(page.getByTestId("work-page")).toBeVisible();

    // Done items are hidden until "All" (or Done) is chosen.
    await expect(rowOf(page, "Seeded security finding")).toBeVisible();
    await expect(rowOf(page, "Seeded finished backlog item")).toHaveCount(0);
    await page.getByTestId("work-filter-status").selectOption("all");
    await expect(rowOf(page, "Seeded finished backlog item")).toBeVisible();
    await page.getByTestId("work-filter-status").selectOption("done");
    await expect(rowOf(page, "Seeded finished backlog item")).toBeVisible();
    await expect(rowOf(page, "Seeded pull request")).toHaveCount(0);

    // Type, and the tool of a link.
    await page.getByTestId("work-filter-status").selectOption("open");
    await page.getByTestId("work-filter-type").selectOption("security");
    await expect(rowOf(page, "Seeded security finding")).toBeVisible();
    await expect(rowOf(page, "Seeded pull request")).toHaveCount(0);
    await page.getByTestId("work-filter-type").selectOption("");
    await page.getByTestId("work-filter-tool").selectOption("github");
    await expect(rowOf(page, "Seeded pull request")).toBeVisible();
    await expect(rowOf(page, "Seeded security finding")).toHaveCount(0);
    await expect(rowOf(page, "Seeded pull request").locator(".work-tool")).toHaveText("GitHub");
    await page.getByTestId("work-filter-tool").selectOption("");

    // The link of a row opens in a new tab, safely.
    const link = rowOf(page, "Seeded pull request").locator("a");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");

    // Group by what the items are pinned to.
    await page.getByTestId("work-group").check();
    await expect(page.getByTestId("work-group-row").filter({ hasText: "API Application" })).toBeVisible();
    await page.getByTestId("work-group").uncheck();

    // A status chosen in a row is saved.
    await rowOf(page, "Seeded security finding").getByTestId("work-status").selectOption("done");
    await waitUntil(async () => {
      const w = await api(server, "/work");
      return w.rows.find((x: { item: { title: string; status: string } }) => x.item.title === "Seeded security finding")?.item.status === "done" || undefined;
    });
    await expect(rowOf(page, "Seeded security finding")).toHaveCount(0);

    // Show the box a row is pinned to: the page closes and the box is selected.
    await rowOf(page, "Seeded pull request").getByTestId("work-pin").click();
    await expect(page.getByTestId("work-page")).toHaveCount(0);
    await expect(node(page, API)).toHaveClass(/selected/);
  });

  test("Add item pins an item to the project, and the refresh buttons are there for linked tools", async ({ page, server }) => {
    await seed(server);
    await page.reload();
    await openDiagram(page, KEY);
    await page.getByTestId("open-work").click();
    await page.getByTestId("work-page-add").click();
    await expect(page.getByTestId("work-add-target")).toHaveValue("project");
    await page.getByTestId("work-add-title").fill("Plan the TLS upgrade");
    await page.getByTestId("work-add-type").selectOption("update");
    await page.getByTestId("work-add-severity").selectOption("high");
    await page.getByTestId("work-add-note").fill("Before the audit.");
    await page.getByTestId("work-add-save").click();
    await expect(page.getByTestId("work-add-form")).toHaveCount(0);
    const row = rowOf(page, "Plan the TLS upgrade");
    await expect(row).toBeVisible();
    await expect(row).toContainText("high");
    await expect(row).toContainText("Before the audit.");
    await expect(row.getByTestId("work-pin")).toContainText("Project");

    // A link a known tool serves: the page and the panel offer the status refresh (not clicked: it needs the network).
    await expect(page.getByTestId("work-page-refresh")).toBeVisible();
    await page.getByTestId("work-close").click();
    await node(page, API).click();
    await expect(page.getByTestId("work-refresh")).toBeVisible();
    await expect(page.getByTestId("sec-work").getByTestId("work-remote").first()).toContainText("GitHub");
  });

  test("a diagram and a flow hold linked work in their panels, with a count in the lists", async ({ page, server }) => {
    await openDiagram(page, KEY);
    const sec = page.getByTestId("sec-diagram-work");
    await expect(sec).toBeVisible();
    await sec.locator("button.p-section-head").click();
    await sec.getByTestId("work-add").click();
    const row = sec.locator(".work-row").last();
    await row.getByTestId("work-title").fill("Containers diagram needs a review");
    await row.getByTestId("work-title").blur();
    await waitUntil(async () => {
      const w = await api(server, "/work");
      return w.rows.find((x: { item: { title: string }; target: { type: string; id: string } }) => x.item.title === "Containers diagram needs a review" && x.target.id === KEY) || undefined;
    });
    await expect(page.getByTestId(`work-count-${KEY}`)).toHaveText("1");

    await openDiagram(page, "flow-sign-in");
    const fsec = page.getByTestId("flow-panel").getByTestId("sec-diagram-work");
    await expect(fsec).toBeVisible();
    await fsec.locator("button.p-section-head").click();
    await fsec.getByTestId("work-add").click();
    const frow = fsec.locator(".work-row").last();
    await frow.getByTestId("work-title").fill("Sign-in flow needs a threat model");
    await frow.getByTestId("work-title").blur();
    const found = await waitUntil(async () => {
      const w = await api(server, "/work");
      return w.rows.find((x: { item: { title: string }; target: { id: string }; targetKind: string }) => x.item.title === "Sign-in flow needs a threat model") || undefined;
    });
    expect([found.target.id, found.targetKind]).toEqual(["flow-sign-in", "flow"]);

    // Both are on the Work page, and a flow row opens its flow.
    await page.getByTestId("open-work").click();
    await page.getByTestId("work-filter-kind").selectOption("flow");
    await expect(rowOf(page, "Sign-in flow needs a threat model")).toBeVisible();
    await expect(rowOf(page, "Containers diagram needs a review")).toHaveCount(0);
    await page.getByTestId("work-filter-kind").selectOption("diagram");
    await expect(rowOf(page, "Containers diagram needs a review")).toBeVisible();
    await rowOf(page, "Containers diagram needs a review").getByTestId("work-pin").click();
    await expect(page.getByTestId("work-page")).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`#/d/${KEY}`));
  });

  test("Link work… in a box's right-click menu opens the form for that box", async ({ page }) => {
    await openDiagram(page, KEY);
    await node(page, API).click({ button: "right" });
    await page.getByTestId("ctx-work").click();
    await expect(page.getByTestId("work-page")).toBeVisible();
    await expect(page.getByTestId("work-add-form")).toBeVisible();
    await expect(page.getByTestId("work-add-target")).toHaveValue(`element:${API}`);
    await page.getByTestId("work-add-title").fill("Rate limit the API");
    await page.getByTestId("work-add-save").click();
    const row = rowOf(page, "Rate limit the API");
    await expect(row).toBeVisible();
    await expect(row.getByTestId("work-pin")).toContainText("API Application");

    // Empty space on the diagram: the item is about the diagram.
    await page.getByTestId("work-close").click();
    const box = (await page.getByTestId("canvas").boundingBox())!;
    await page.getByTestId("canvas").click({ button: "right", position: { x: box.width - 15, y: box.height / 2 } });
    await page.getByTestId("ctx-work").click();
    await expect(page.getByTestId("work-add-target")).toHaveValue(`diagram:${KEY}`);
  });

  test("the Credentials page lists the built-in tools and saves a connection; a refused address shows the server's message", async ({ page }) => {
    await page.goto(`${page.url().split("#")[0]}#/settings/credentials`);
    const box = page.getByTestId("tool-connections");
    await expect(box).toBeVisible();
    await expect(box.getByTestId("connection-github")).toBeVisible();
    await box.getByTestId("connection-add").click();
    await box.getByTestId("connection-url-0").fill("ftp://example.com");
    await box.getByTestId("connections-save").click();
    await expect(box.getByTestId("connections-error")).toBeVisible();
    await box.getByTestId("connection-id-0").fill("gitlab-internal");
    await box.getByTestId("connection-url-0").fill("https://gitlab.example.com");
    await box.getByTestId("connections-save").click();
    await expect(box.getByTestId("connections-error")).toHaveCount(0);
    await expect(box.getByTestId("connection-url-0")).toHaveValue("https://gitlab.example.com");
    await expect(box.getByTestId("connections-save")).toBeDisabled();
    await box.getByTestId("connection-remove-0").click();
    await box.getByTestId("connections-save").click();
    await expect(box.getByTestId("connection-row-0")).toHaveCount(0);
  });

  test("How it works explains the tools and edits the severity mapping, which is saved in the model (DEC-087)", async ({ page, server }) => {
    await openDiagram(page, KEY);
    await page.getByTestId("open-work").click();
    await page.getByTestId("work-tab-guide").click();
    const guide = page.getByTestId("work-guide");
    await expect(guide).toBeVisible();
    await expect(page.getByTestId("work-search")).toHaveCount(0);
    await expect(guide.getByTestId("work-guide-connection").filter({ hasText: "gitlab.com" })).toContainText("-/merge_requests");
    await expect(page.getByTestId("work-severity")).toContainText("dp's defaults");

    // Add a site's own Jira priority; a duplicate name is refused before saving.
    const jira = page.getByTestId("sev-table-jira");
    await expect(page.getByTestId("sev-save")).toBeDisabled();
    await page.getByTestId("sev-add-jira").click();
    await jira.getByTestId("sev-name").last().fill("High");
    await expect(page.getByTestId("sev-error")).toContainText("twice");
    await expect(page.getByTestId("sev-save")).toBeDisabled();
    await jira.getByTestId("sev-name").last().fill("P1 - Outage");
    await jira.getByTestId("sev-choice").last().selectOption("critical");
    // Scores that do not go down are refused too.
    await page.getByTestId("sev-score-high").fill("9.5");
    await expect(page.getByTestId("sev-error")).toContainText("go down");
    await page.getByTestId("sev-score-high").fill("7");
    await page.getByTestId("sev-save").click();
    await waitUntil(async () => ((await api(server, "/state")).workSeverity.jira["p1 - outage"] === "critical" ? true : undefined));
    await expect(page.getByTestId("work-severity")).toContainText("changed for this model");

    // Back to the defaults.
    await page.getByTestId("sev-reset").click();
    await waitUntil(async () => ((await api(server, "/state")).workSeverity.jira["p1 - outage"] === undefined ? true : undefined));
    await expect(jira.getByTestId("sev-name")).toHaveCount(5);
    await page.getByTestId("work-tab-items").click();
    await expect(page.getByTestId("work-search")).toBeVisible();
  });

  test.describe("read-only", () => {
    test.use({ readOnly: true });
    test("the page lists items but offers no editing", async ({ page }) => {
      await openDiagram(page, KEY);
      await page.getByTestId("open-work").click();
      await expect(page.getByTestId("work-page")).toBeVisible();
      await expect(page.getByTestId("work-page-add")).toHaveCount(0);
      await expect(page.getByTestId("work-page-refresh")).toHaveCount(0);
      await expect(page.getByTestId("work-status")).toHaveCount(0);
      await page.getByTestId("work-tab-guide").click();
      await expect(page.getByTestId("sev-save")).toHaveCount(0);
      await expect(page.getByTestId("sev-table-jira").getByTestId("sev-name").first()).toBeDisabled();
      await page.getByTestId("work-close").click();
      await node(page, API).click({ button: "right" });
      await expect(page.getByTestId("ctx-details")).toBeVisible();
      await expect(page.getByTestId("ctx-work")).toHaveCount(0);
    });
  });
});
