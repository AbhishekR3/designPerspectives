/** Comments, ideas and questions in the browser (REC-01). */

import { callAs, expect, node, openDiagram, ROLE_USERS, signIn, test, waitUntil } from "./fixtures.js";

const KEY = "containers-internet-banking-system";
const API = "api-application";

test.describe("comments", () => {
  test("write a question from the right-click menu, answer it, resolve it", async ({ page }) => {
    await openDiagram(page, KEY);
    await node(page, API).click({ button: "right" });
    await page.getByTestId("ctx-comment").click();
    await page.getByTestId("new-comment-kind-question").click();
    await page.getByTestId("new-comment-text").fill("Why is this not behind the gateway?");
    await page.getByTestId("new-comment-name").fill("Sam");
    await page.getByTestId("new-comment-submit").click();
    const thread = page.locator("[data-testid^=thread-]").first();
    await expect(thread).toContainText("Why is this not behind the gateway?");
    await expect(thread).toContainText("Sam");
    // The box now carries a pin, the toolbar the open count.
    await expect(page.getByTestId(`comments-${API}`)).toHaveText(/1/);
    await expect(page.getByTestId("comments-open")).toContainText("1");

    await page.locator("[data-testid^=reply-t], [data-testid^=reply-c]").filter({ hasText: "Reply" }).first().click();
    await page.locator("[data-testid^=reply-box-]").locator("textarea").fill("It is, via the load balancer.");
    await page.locator("[data-testid^=reply-box-][data-testid$=submit]").click();
    await expect(thread).toContainText("It is, via the load balancer.");

    await page.locator("[data-testid^=resolve-]").first().click();
    await expect(page.getByTestId(`comments-${API}`)).toHaveCount(0);
    await expect(page.getByText("Show 1 resolved")).toBeVisible();

    // Nothing was written to the model, so there is nothing to undo.
    expect((await (await fetch(`${new URL(page.url()).origin}/api/state`)).json()).canUndo).toBe(false);
  });

  test("the diagram's list shows threads about what it shows and jumps to them", async ({ page, server }) => {
    const edge = (await (await fetch(`${server.url}api/diagrams/${KEY}`)).json()).edges.find((e: any) => !e.derived && e.relationshipIds.length === 1);
    const rel = { id: edge.relationshipIds[0] };
    await fetch(`${server.url}api/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "idea", target: { type: "relationship", id: rel.id }, text: "Batch these calls" }),
    });
    await fetch(`${server.url}api/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "comment", target: { type: "diagram", id: KEY }, text: "Needs a legend" }),
    });
    await openDiagram(page, KEY);
    await page.getByTestId("comments-open").click();
    const list = page.getByTestId("diagram-comments");
    await expect(list).toContainText("Needs a legend");
    await expect(list).toContainText("Batch these calls");
    await page.getByTestId("comments-filter-question").click();
    await expect(list).not.toContainText("Batch these calls");
    await page.getByTestId("comments-filter-open").click();
    await list.getByRole("button", { name: /→/ }).first().click();
    await expect(page.getByTestId("edge-panel")).toContainText("Batch these calls");
  });
});

test.describe("comments with sign-in", () => {
  test.use({ users: { list: ROLE_USERS } });

  test("a viewer can comment on a model they cannot change", async ({ page, server }) => {
    await signIn(page, "viewer");
    await openDiagram(page, KEY);
    await page.getByTestId(`node-${API}`).click();
    await page.getByTestId("add-comment").click();
    await page.getByTestId("new-comment-text").fill("Is this on the roadmap?");
    await expect(page.getByTestId("new-comment-name")).toHaveCount(0); // the signed-in name is used
    await page.getByTestId("new-comment-submit").click();
    await expect(page.locator("[data-testid^=thread-]").first()).toContainText("viewer");
    const saved = await waitUntil(async () => (await callAs(server, "architect", "GET", "/comments")).json.threads[0]);
    expect(saved.author).toBe("viewer");
    // Another person's comment cannot be deleted by a viewer.
    await callAs(server, "engineer", "POST", "/comments", { body: { kind: "comment", target: { type: "element", id: API }, text: "from the engineer" } });
    await page.reload();
    await page.getByTestId(`node-${API}`).click();
    const theirs = page.locator("[data-testid^=thread-]", { hasText: "from the engineer" });
    await expect(theirs).toBeVisible();
    await expect(theirs.locator("[data-testid^=delete-]")).toHaveCount(0);
  });
});
