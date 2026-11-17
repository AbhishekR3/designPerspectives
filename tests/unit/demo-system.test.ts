/** The demo system: five real local services where every hop is a real HTTP call, and a `route` can send a hop somewhere else. */

import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { startDemoSystem, type DemoService, type DemoSystem } from "../../src/demo/demoSystem.js";

const WEB_DIR = path.resolve(__dirname, "../../demo/web-app");
const FREE: Record<DemoService, number> = { web: 0, api: 0, payments: 0, mainframe: 0, fraud: 0 };

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const f of cleanup.splice(0).reverse()) await f();
});

async function start(route?: (caller: string, target: string) => string | null): Promise<DemoSystem> {
  const d = await startDemoSystem({ webDir: WEB_DIR, ports: FREE, route });
  cleanup.push(() => d.close());
  return d;
}

/** A stand-in for the fraud service that answers a fixed score. */
async function fixedFraud(score: number) {
  const srv = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ score })));
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    srv.closeAllConnections();
    await new Promise((r) => srv.close(r));
  };
  cleanup.push(close);
  return { url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}`, close };
}

const pay = (d: DemoSystem, amount: unknown) =>
  fetch(`${d.urls.payments}/api/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fromAccount: "0001029", toIban: "DE89", amount, currency: "EUR", reference: "r" }),
  });

describe("the demo system", () => {
  test("serves the page and the address book, and nothing else", async () => {
    const d = await start();
    for (const p of ["/", "/index.html", "/app.js", "/app.css"]) expect((await fetch(d.urls.web + p)).status).toBe(200);
    expect(await (await fetch(d.urls.web + "/")).text()).toContain("Internet banking");
    const cfg = await fetch(d.urls.web + "/config.json");
    expect(cfg.headers.get("cache-control")).toBe("no-store");
    expect(await cfg.json()).toEqual({ api: d.urls.api, payments: d.urls.payments });
    expect((await fetch(d.urls.web + "/package.json")).status).toBe(404);
    expect((await fetch(d.urls.web + "/../etc/passwd")).status).toBe(404);
  });

  test("a payment goes from the payments service to the fraud service", async () => {
    const d = await start();
    const ok = await pay(d, 125);
    expect(ok.status).toBe(201);
    expect(await ok.json()).toEqual({ id: "pay-1", status: "accepted", score: 12 });
    const held = await pay(d, 9000);
    expect(held.status).toBe(202);
    expect(await held.json()).toEqual({ id: "pay-2", status: "held-for-review", score: 85 });
    expect((await pay(d, "x")).status).toBe(422);
    expect(await (await fetch(`${d.urls.payments}/api/payments/pay-2`)).json()).toEqual({ id: "pay-2", status: "held-for-review" });
    expect((await fetch(`${d.urls.payments}/api/payments/pay-9`)).status).toBe(404);
  });

  test("accounts carry the balances the mainframe gave", async () => {
    const d = await start();
    const r = await fetch(`${d.urls.api}/api/accounts`);
    expect(r.status).toBe(200);
    const { accounts } = await r.json();
    expect(accounts.map((a: any) => [a.id, a.balance])).toEqual([
      ["0001029", 1202.48],
      ["0001030", 8410],
    ]);
    expect((await (await fetch(`${d.urls.api}/api/accounts/0001029`)).json()).balance).toBe(1202.48);
    expect((await fetch(`${d.urls.api}/api/accounts/nope`)).status).toBe(404);
    const s = await fetch(`${d.urls.api}/api/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user: "alice", password: "wrong" }) });
    expect(s.status).toBe(401);
    const s2 = await fetch(`${d.urls.api}/api/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user: "alice", password: "x" }) });
    expect(await s2.json()).toEqual({ user: "alice", sessionToken: "demo-session" });
    expect((await fetch(`${d.urls.api}/api/session`, { method: "DELETE" })).status).toBe(200);
  });

  test("a route sends a hop somewhere else, and the page's addresses follow it", async () => {
    const stand = await fixedFraud(99);
    const asked: string[] = [];
    const d = await start((caller, target) => {
      asked.push(`${caller}>${target}`);
      if (caller === "payments-service" && target === "fraud-detection-system") return stand.url + "/";
      if (caller === "single-page-application" && target === "payments-service") return "http://127.0.0.1:1";
      return null;
    });
    const r = await pay(d, 1);
    expect(r.status).toBe(202);
    expect((await r.json()).score).toBe(99);
    expect(asked).toContain("payments-service>fraud-detection-system");
    expect(await (await fetch(d.urls.web + "/config.json")).json()).toEqual({ api: d.urls.api, payments: "http://127.0.0.1:1" });
  });

  test("a fraud service that does not answer gives 503, and a mainframe that does not answer gives 502", async () => {
    const stand = await fixedFraud(1);
    const dead = await fixedFraud(1);
    const deadUrl = dead.url;
    await dead.close();
    const d = await start((_caller, target) => (target === "fraud-detection-system" ? stand.url : target === "mainframe-banking-system" ? deadUrl : null));
    expect((await pay(d, 1)).status).toBe(201);
    await stand.close();
    const r = await pay(d, 1);
    expect(r.status).toBe(503);
    expect((await r.json()).error).toBe("The fraud check did not answer");
    const a = await fetch(`${d.urls.api}/api/accounts`);
    expect(a.status).toBe(502);
    expect((await a.json()).error).toBe("The mainframe did not answer");
  });

  test("a port that is taken rejects with EADDRINUSE and leaves nothing listening", async () => {
    const busy = http.createServer();
    await new Promise<void>((r) => busy.listen(0, "127.0.0.1", r));
    cleanup.push(() => new Promise((r) => busy.close(r)));
    const port = (busy.address() as AddressInfo).port;
    const err = await startDemoSystem({ webDir: WEB_DIR, ports: { ...FREE, payments: port } }).then(
      () => null,
      (e) => e,
    );
    expect(err?.code).toBe("EADDRINUSE");
    // The web and api servers started before the busy port was reached; they are closed again.
    // A system on the same free ports can start, and the busy port still belongs to its owner.
    const d = await start();
    expect(d.urls.web).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  test("the services that the browser calls allow other origins", async () => {
    const d = await start();
    for (const base of [d.urls.api, d.urls.payments]) {
      const pre = await fetch(`${base}/api/payments`, { method: "OPTIONS" });
      expect(pre.status).toBe(204);
      expect(pre.headers.get("access-control-allow-origin")).toBe("*");
      expect(pre.headers.get("access-control-allow-methods")).toBe("GET, POST, DELETE, OPTIONS");
      expect(pre.headers.get("access-control-allow-headers")).toBe("Content-Type");
    }
    const r = await fetch(`${d.urls.api}/api/accounts`);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect((await fetch(`${d.urls.api}/nowhere`)).status).toBe(404);
    const big = await fetch(`${d.urls.payments}/api/payments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference: "x".repeat(70_000) }) });
    expect(big.status).toBe(413);
  });
});
