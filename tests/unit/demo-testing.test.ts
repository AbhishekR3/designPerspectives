/** The demo system under System Testing mode: an open intercept point pauses a real call between two demo services, and the call can be answered or changed. */

import { afterEach, describe, expect, test } from "vitest";
import { startDemoSystem, type DemoSystem } from "../../src/demo/demoSystem.js";
import { buildApp } from "../../src/server/app.js";
import type { TestSession } from "../../src/server/testSession.js";
import type { TestingState } from "../../src/shared/types.js";
import path from "node:path";
import { Client, demoDir, ok } from "./helpers.js";

const FRAUD = "fraud-check-client--fraud-detection-system";

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const f of cleanup.splice(0).reverse()) await f();
});

async function until(session: TestSession, done: (s: TestingState) => boolean): Promise<TestingState> {
  for (let i = 0; i < 300; i++) {
    const s = session.state();
    if (done(s)) return s;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("the state never got there");
}

const pay = (d: DemoSystem, amount: number) =>
  fetch(`${d.urls.payments}/api/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fromAccount: "0001029", toIban: "DE89", amount, currency: "EUR", reference: "r" }),
  });

async function setup() {
  const dir = demoDir();
  const built = buildApp(dir);
  cleanup.push(() => built.ctx.testing.close());
  const session = built.ctx.testing;
  const system = await startDemoSystem({
    webDir: path.resolve(__dirname, "../../demo/web-app"),
    ports: { web: 0, api: 0, payments: 0, mainframe: 0, fraud: 0 },
    route: (c, t) => session.pointUrl(c, t),
  });
  cleanup.push(() => system.close());
  const c = new Client(dir, {}, built.app);
  const addresses = { "api-application": system.urls.api, "payments-service": system.urls.payments, "mainframe-banking-system": system.urls.mainframe, "fraud-detection-system": system.urls.fraud };
  for (const [id, runUrl] of Object.entries(addresses)) await ok(c.patch(`/api/elements/${id}`, { runUrl }));
  const point = await session.openPoint(FRAUD);
  session.setBreakpoints([{ id: "b1", on: { type: "relationship", id: FRAUD }, phase: "request", conditions: [], enabled: true }]);
  return { session, system, point };
}

describe("the demo system with an intercept point", () => {
  test("a paused fraud check can be answered by hand", async () => {
    const { session, system, point } = await setup();
    expect(point.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    const pending = pay(system, 125);
    const s = await until(session, (x) => x.held.length > 0);
    const id = s.held[0]!;
    const detail = session.detail(id);
    expect(detail.request.path).toBe("/score");
    session.release(id, { do: "reply", status: 200, body: '{"score":99}' });
    const r = await pending;
    expect(r.status).toBe(202);
    expect((await r.json()).status).toBe("held-for-review");
  });

  test("a paused fraud check can be changed and then continues to the real service", async () => {
    const { session, system } = await setup();
    const pending = pay(system, 125);
    const s = await until(session, (x) => x.held.length > 0);
    const id = s.held[0]!;
    const shown = session.detail(id);
    const body = JSON.stringify({ ...JSON.parse(String(shown.request.body)), amount: 9000 });
    session.release(id, { do: "continue", request: { body } });
    const r = await pending;
    expect(r.status).toBe(202);
    expect((await r.json()).score).toBe(85);
  });
});
