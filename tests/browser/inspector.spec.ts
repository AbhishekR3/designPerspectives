/** Browser tests of the live UI inspector: a stand-in app framed through dp's UI proxy. */

import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { DEMO_DIR } from "../../src/core/project.js";
import { startDemoApp } from "../../src/demo/demoWebApp.js";
import { callAs, expect, node, openDiagram, test } from "./fixtures.js";

const APP_PAGE = `<!doctype html><html><head><title>Bank web app</title></head><body>
<button id="pay" onclick="fetch('/api/payments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({toIban:'DE89370400440532013000',amount:'10.00',password:'hunter2'})})">Pay now</button>
<button id="rates" onclick="fetch('/api/rates/2026-11-15')">Show rates</button>
</body></html>`;

/** A stand-in for the bank's web app: a page with two buttons and the API they call. */
async function startApp(): Promise<{ url: string; close(): Promise<void> }> {
  const s = http.createServer((req, res) => {
    if (req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html", "X-Frame-Options": "DENY" }).end(APP_PAGE);
    } else if (req.url?.startsWith("/api/payments")) {
      res.writeHead(201, { "Content-Type": "application/json" }).end(JSON.stringify({ id: "pay_8Kq2", status: "accepted" }));
    } else {
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ EUR: 1 }));
    }
  });
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${(s.address() as AddressInfo).port}/`, close: () => new Promise((r) => s.close(() => r())) };
}

test("clicking in a live UI shows the calls, the relationships they use and what follows", async ({ page, server }) => {
  const app = await startApp();
  try {
    expect((await callAs(server, "", "PATCH", "/elements/single-page-application", { body: { uiUrl: app.url } })).status).toBe(200);
    await page.reload();
    await openDiagram(page, "containers-internet-banking-system");
    await node(page, "single-page-application").click();
    await page.getByTestId("inspect-ui").click();
    await expect(page.getByTestId("inspector")).toBeVisible();

    const frame = page.frameLocator('[data-testid="inspector-frame"]');
    await frame.locator("#pay").click();
    await expect(page.getByTestId("inspector-click")).toContainText("Pay now");
    await expect(page.getByTestId("inspector-click")).toBeVisible();
    const call = page.getByTestId("inspector-call").first();
    await expect(call).toContainText("POST /api/payments");
    await expect(call).toContainText("201");
    // Matched to the relationship that lists the endpoint, with what was sent (secrets masked)
    // and the documented example next to it.
    const match = call.getByTestId("inspector-match");
    await expect(match).toContainText("Single-Page Application → Payments Controller");
    await expect(match).toContainText('"amount": "10.00"');
    await expect(match).toContainText('"password": "•••"');
    await expect(match).not.toContainText("hunter2");
    await expect(match).toContainText("Documented example");
    // What the call reaches next in the model.
    await expect(match.getByTestId("inspector-chain")).toContainText("Payments Controller → Payment Orchestrator");
    await expect(page.getByTestId("inspector-touches")).toContainText("Session Cache");

    // A call the model does not know yet can be added as an endpoint, and then matches.
    await frame.locator("#rates").click();
    await expect(page.getByTestId("inspector-unmapped")).toBeVisible();
    await expect(page.getByTestId("inspector-add-endpoint")).toContainText("GET /api/rates/2026-11-15");
    await page.getByTestId("inspector-unmapped").locator("select").selectOption("single-page-application--accounts-summary-controller");
    await page.getByTestId("inspector-add-endpoint").click();
    await expect(page.getByTestId("inspector-match")).toContainText("Accounts Summary Controller");
    const rel = (await callAs(server, "", "GET", "/state")).json.relationships.find((r: { id: string }) => r.id === "single-page-application--accounts-summary-controller");
    expect(rel.endpoints).toContainEqual({ method: "GET", path: "/api/rates/2026-11-15" });

    await page.getByTestId("inspector-close").click();
    await expect(page.getByTestId("inspector")).toBeHidden();
  } finally {
    await app.close();
  }
});

test("the demo web app in the inspector: each call's trace is laid over the model, and drift is reported", async ({ page, server }) => {
  const app = await startDemoApp({ root: server.root, webDir: path.join(DEMO_DIR, "web-app"), port: 0 });
  try {
    expect((await callAs(server, "", "PATCH", "/elements/single-page-application", { body: { uiUrl: app.url } })).status).toBe(200);
    await page.reload();
    await openDiagram(page, "containers-internet-banking-system");
    await node(page, "single-page-application").click();
    await page.getByTestId("inspect-ui").click();
    const frame = page.frameLocator('[data-testid="inspector-frame"]');

    await frame.locator("#pay").click();
    const observed = page.getByTestId("observed-trace").first();
    await expect(observed).toContainText("Observed in traces");
    await expect(observed.getByTestId("observed-hop")).toContainText(["Single-Page Application → Payments Controller", "Payments Controller → Session Cache"]);
    await expect(observed).toContainText("Fraud Check Client → Fraud Detection System");
    await expect(observed.getByTestId("observed-drift")).toHaveCount(0);

    // The exchange-rates call reaches a provider the model does not have.
    await frame.locator("#rates").click();
    await expect(page.getByTestId("observed-drift")).toContainText("fx-rates-provider");

    // Recent traces lists what the app wrote.
    await page.getByTestId("recent-traces").locator("summary").click();
    await expect(page.getByTestId("recent-traces")).toContainText("POST /api/payments");
  } finally {
    await app.close();
  }
});
