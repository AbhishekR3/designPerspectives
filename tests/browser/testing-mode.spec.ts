/** Browser tests of the system testing mode: entering and leaving, an intercept point, a breakpoint that pauses a real call, editing it, answering it, and the keys. */

import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { Page } from "@playwright/test";
import { DEMO_DIR } from "../../src/core/project.js";
import { startDemoSystem } from "../../src/demo/demoSystem.js";
import { api, clickEmptyCanvas, expect, openDiagram, test, waitUntil, type Server } from "./fixtures.js";

const KEY = "components-payments-service";
const REL = "single-page-application--payments-controller";
const EDGE = `edge-${REL}`;

/** A stand-in service: answers every call with the method, path and JSON body it received, and remembers them. */
async function standIn() {
  const seen: { method: string; url: string; body: any }[] = [];
  const srv = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf-8");
      const body = text ? JSON.parse(text) : null;
      seen.push({ method: req.method ?? "", url: req.url ?? "", body });
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, method: req.method, path: req.url, body }));
    });
  });
  await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/`;
  return {
    url,
    seen,
    async close() {
      srv.closeAllConnections();
      await new Promise((r) => srv.close(r));
    },
  };
}

async function setRunUrl(server: Server, id: string, runUrl: string) {
  const r = await fetch(server.url + `api/elements/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runUrl }) });
  expect(r.status).toBe(200);
}

/** The model has an address for the payments service; open its components, turn the mode on and select the line from the SPA to the controller. */
async function openLine(page: Page, server: Server, runUrl: string) {
  await setRunUrl(server, "payments-service", runUrl);
  await page.reload();
  await openDiagram(page, KEY);
  await page.getByTestId("testing-toggle").click();
  await expect(page.getByTestId("testing-strip")).toBeVisible();
  await page.getByTestId(EDGE).click();
}

/** Open the intercept point of the selected line and return its base URL. */
async function openPoint(page: Page): Promise<string> {
  await page.getByTestId("point-open").click();
  const url = page.getByTestId("point-url");
  await expect(url).toBeVisible();
  return (await url.innerText()).trim();
}

const post = (base: string, amount: number) => fetch(`${base}/api/payments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount, payee: "alice" }) });

test("the Test button turns the mode on, Back leaves it, and the model cannot be edited meanwhile", async ({ page, server }) => {
  await openDiagram(page, KEY);
  const before = await api(server, `/diagrams/${KEY}`);
  const pos = (d: any) => d.nodes.find((n: any) => n.id === "payments-controller").position;
  await expect(page.getByTestId("testing-strip")).toHaveCount(0);
  await page.getByTestId("testing-toggle").click();
  await expect(page.getByTestId("testing-strip")).toBeVisible();
  await expect(page.getByTestId("testing-toggle")).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => window.location.hash)).toContain("t=1");
  // Nothing edits the model: no palette, no undo, and a box dragged on the canvas stays where it was.
  await expect(page.getByTestId("palette")).toHaveCount(0);
  await expect(page.getByTestId("undo")).toHaveCount(0);
  const box = (await page.getByTestId("node-payments-controller").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 60, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  expect(pos(await api(server, `/diagrams/${KEY}`))).toEqual(pos(before));
  // It survives opening another diagram, and Back leaves it.
  await page.goBack();
  await expect(page.getByTestId("testing-strip")).toHaveCount(0);
  expect(await page.evaluate(() => window.location.hash)).not.toContain("t=1");
  // Exit leaves it too.
  await page.getByTestId("testing-toggle").click();
  await expect(page.getByTestId("testing-strip")).toBeVisible();
  await page.getByTestId("testing-exit").click();
  await expect(page.getByTestId("testing-strip")).toHaveCount(0);
});

test("an intercept point lists the calls that pass, matched to the relationship", async ({ page, server }) => {
  const svc = await standIn();
  try {
    await openLine(page, server, svc.url);
    await expect(page.getByTestId("testing-target")).toContainText(svc.url.replace(/\/$/, ""));
    const base = await openPoint(page);
    expect(base).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    await expect(page.getByTestId(`point-edge-${REL}`)).toBeVisible();
    const res = await post(base, 10);
    expect(res.status).toBe(200);
    expect((await res.json()).body.amount).toBe(10);
    expect(svc.seen).toHaveLength(1);
    await clickEmptyCanvas(page);
    const row = page.locator('[data-testid^="call-row-"]').first();
    await expect(row).toContainText("POST");
    await expect(row).toContainText("/api/payments");
    await row.click();
    await expect(page.getByTestId("call-reveal")).toContainText("Makes API calls to");
    await expect(page.getByTestId("call-state")).toContainText("done");
    // The intercept points dialog lists it, with the same base URL.
    await page.getByTestId("call-close").click();
    await page.getByTestId("testing-points").click();
    await expect(page.getByTestId("testing-setup")).toContainText(base);
    await expect(page.locator('[data-testid^="point-row-"]')).toHaveCount(1);
  } finally {
    await svc.close();
  }
});

test.describe("a breakpoint on the line", () => {
  let svc: Awaited<ReturnType<typeof standIn>>;
  let base = "";
  test.beforeEach(async ({ page, server }) => {
    svc = await standIn();
    await openLine(page, server, svc.url);
    base = await openPoint(page);
    await page.getByTestId("bp-toggle").click();
    await expect(page.getByTestId(`bp-edge-${REL}`)).toHaveAttribute("data-state", "on");
  });
  test.afterEach(async () => {
    await svc.close();
  });

  test("pauses a real call, which can be changed before it goes on", async ({ page }) => {
    const pending = post(base, 10);
    await expect(page.getByTestId(`paused-edge-${REL}`)).toBeVisible();
    expect(svc.seen).toHaveLength(0);
    await expect(page.getByTestId("testing-paused-count")).toContainText("1 paused");
    const body = page.getByTestId("call-req-body");
    await expect(body).toBeVisible();
    await expect(body).toHaveValue(/"amount"/);
    await body.fill(JSON.stringify({ amount: 99, payee: "alice" }));
    await page.getByTestId("call-continue").click();
    const res = await pending;
    expect(res.status).toBe(200);
    expect(svc.seen).toHaveLength(1);
    expect(svc.seen[0]?.body.amount).toBe(99);
    await expect(page.getByTestId(`paused-edge-${REL}`)).toHaveCount(0);
  });

  test("F8 continues a paused call", async ({ page }) => {
    const pending = post(base, 5);
    await expect(page.getByTestId(`paused-edge-${REL}`)).toBeVisible();
    // The focus is still on the breakpoint checkbox: the key works there.
    await page.keyboard.press("F8");
    const res = await pending;
    expect(res.status).toBe(200);
    expect(svc.seen[0]?.body.amount).toBe(5);
  });

  test("a call answered by hand reaches the caller and never the service", async ({ page }) => {
    const pending = post(base, 7);
    await expect(page.getByTestId(`paused-edge-${REL}`)).toBeVisible();
    await page.getByTestId("call-mine-status").fill("503");
    await page.getByTestId("call-mine-body").fill('{"error":"down"}');
    await page.getByTestId("call-mine-send").click();
    const res = await pending;
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "down" });
    await waitUntil(async () => (await page.getByTestId("call-state").innerText()).includes("answered by you"));
    expect(svc.seen).toHaveLength(0);
  });
});

test.describe("a read-only server", () => {
  test.use({ readOnly: true });
  test("opens the mode for traces only and says why", async ({ page }) => {
    await openDiagram(page, KEY);
    await page.getByTestId("testing-toggle").click();
    await expect(page.getByTestId("testing-strip")).toBeVisible();
    await expect(page.getByTestId("testing-note")).toBeVisible();
    await expect(page.getByTestId("testing-trace")).toBeVisible();
    await expect(page.getByTestId("testing-continue")).toHaveCount(0);
    await expect(page.getByTestId("testing-points")).toHaveCount(0);
    await page.getByTestId(EDGE).click();
    await expect(page.getByTestId("point-open")).toHaveCount(0);
  });
});

test("a point in front of the demo payments service logs a real payment", async ({ page, server }) => {
  const demo = await startDemoSystem({ webDir: path.join(DEMO_DIR, "web-app"), ports: { web: 0, api: 0, payments: 0, mainframe: 0, fraud: 0 } });
  try {
    await openLine(page, server, demo.urls.payments);
    const base = await openPoint(page);
    const res = await fetch(`${base}/api/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromAccount: "0001029", toIban: "DE89", amount: 125, currency: "EUR", reference: "r" }),
    });
    expect(res.status).toBe(201);
    expect((await res.json()).status).toBe("accepted");
    await clickEmptyCanvas(page);
    const row = page.locator('[data-testid^="call-row-"]').first();
    await expect(row).toContainText("/api/payments");
    await expect(row).toContainText("201");
  } finally {
    await demo.close();
  }
});
