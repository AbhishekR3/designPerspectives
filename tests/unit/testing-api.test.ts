/** System testing routes: who may use them, the read-only server, a browser on another machine, a hub, and the long-poll. */

import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { buildApp } from "../../src/server/app.js";
import { copyDemoHub, createHubApp } from "../../src/server/hub.js";
import { Client, client, demoDir, ok, ROLE_USERS, tmpDir, writeTestUsers } from "./helpers.js";
import { startStandIn } from "./standInService.js";

const PAY = "single-page-application--payments-controller";
const POINT = "single-page-application--payments-service";

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const f of cleanup.splice(0).reverse()) await f();
});

async function app(opts: { users?: boolean; readOnly?: boolean } = {}) {
  const target = await startStandIn();
  cleanup.push(() => target.close());
  const dir = demoDir();
  // The address is set before the server starts (and before sign-in is on), as an architect would have done.
  const setup = buildApp(dir);
  await ok(new Client(dir, {}, setup.app).patch("/api/elements/payments-service", { runUrl: target.url }));
  if (opts.users) writeTestUsers(dir, ROLE_USERS);
  const built = buildApp(dir, { readOnly: opts.readOnly });
  cleanup.push(() => built.ctx.testing.close());
  return { c: new Client(dir, {}, built.app), target, dir };
}

describe("routes", () => {
  test("open a point, see a call, set a breakpoint, release, resend, clear, close", async () => {
    const { c, target } = await app();
    expect((await ok(c.get("/api/state"))).can.test).toBe(true);
    const point = await ok(c.post("/api/testing/points", { relationshipId: PAY }));
    expect(point).toMatchObject({ id: POINT, state: "open" });
    await ok(c.put("/api/testing/breakpoints", { breakpoints: [{ id: "b1", on: { type: "relationship", id: PAY } }] }));
    const pending = fetch(point.url + "/api/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"amount":1}' });
    let s = await ok(c.get("/api/testing"));
    for (let i = 0; i < 100 && !s.held.length; i++) s = await ok(c.get("/api/testing/events", { since: String(s.version), wait: "1" }));
    expect(s.held).toEqual(["c1"]);
    const d = await ok(c.get("/api/testing/calls/c1"));
    expect(d.request.body).toContain('"amount": 1');
    expect((await c.post("/api/testing/calls/c1/release", { do: "continue", request: { body: '{"amount": "•••"}' } })).status).toBe(422);
    expect((await c.post("/api/testing/calls/c1/release", { do: "nope" })).status).toBe(422);
    await ok(c.post("/api/testing/calls/c1/release", { do: "continue", request: { body: '{"amount":2}' } }));
    expect((await pending).status).toBe(200);
    expect(JSON.parse(target.received[0]!.body)).toEqual({ amount: 2 });
    expect((await c.post("/api/testing/calls/c1/release", { do: "continue" })).status).toBe(409);
    expect((await c.post("/api/testing/calls/nope/release", { do: "continue" })).status).toBe(404);
    await ok(c.put("/api/testing/breakpoints", { breakpoints: [] }));
    const again = await ok(c.post("/api/testing/calls/c1/resend", {}));
    expect(again.id).toBe("c2");
    await ok(c.post("/api/testing/step", {}));
    expect((await ok(c.get("/api/testing"))).stepping).toBe(true);
    await ok(c.post("/api/testing/step", { on: false }));
    await ok(c.put("/api/testing/watches", { watches: ["body.amount"] }));
    await ok(c.put("/api/testing/options", { holdSeconds: 60 }));
    expect((await c.put("/api/testing/options", { holdSeconds: 1 })).status).toBe(422);
    await ok(c.post("/api/testing/release-all", {}));
    for (let i = 0; i < 100 && (await ok(c.get("/api/testing"))).calls.some((x: any) => x.state === "forwarded"); i++) await new Promise((r) => setTimeout(r, 10));
    await ok(c.delete("/api/testing/calls"));
    expect((await ok(c.get("/api/testing"))).calls).toEqual([]);
    await ok(c.delete(`/api/testing/points/${POINT}`));
    expect((await c.delete(`/api/testing/points/${POINT}`)).status).toBe(404);
    expect((await c.post("/api/testing/points", { relationshipId: "nope" })).status).toBe(422);
    await ok(c.post("/api/testing/points", { saved: true }));
  });

  test("architects and engineers may test on any version; viewers see no live data and change nothing", async () => {
    const { c } = await app({ users: true });
    expect((await c.get("/api/testing")).status).toBe(401);
    const viewer = await c.as("viewer");
    expect((await ok(viewer.get("/api/state"))).can.test).toBe(false);
    for (const url of ["/api/testing", "/api/testing/events", "/api/testing/calls/c1"]) {
      const r = await viewer.get(url);
      expect([url, r.status]).toEqual([url, 403]);
      expect(r.json().detail).toMatch(/viewer/);
    }
    expect((await viewer.post("/api/testing/points", { relationshipId: PAY })).status).toBe(403);
    expect((await viewer.put("/api/testing/breakpoints", { breakpoints: [] })).status).toBe(403);
    expect((await viewer.post("/api/testing/calls/c1/release", { do: "continue" })).status).toBe(403);

    const engineer = await c.as("engineer");
    expect((await ok(engineer.get("/api/state"))).can.test).toBe(true);
    // An engineer cannot change the main model, but testing changes no model.
    expect((await engineer.patch("/api/elements/payments-service", { runUrl: "http://127.0.0.1:1/" })).status).toBe(403);
    const point = await ok(engineer.post("/api/testing/points", { relationshipId: PAY }));
    expect(point.state).toBe("open");
    await ok(engineer.put("/api/testing/breakpoints", { breakpoints: [{ id: "b1", on: { type: "relationship", id: PAY } }] }));
    const pending = fetch(point.url + "/api/payments");
    let s = await ok(engineer.get("/api/testing"));
    for (let i = 0; i < 100 && !s.held.length; i++) s = await ok(engineer.get("/api/testing/events", { since: String(s.version), wait: "1" }));
    await ok(engineer.post(`/api/testing/calls/${s.held[0]}/release`, { do: "continue" }));
    await pending;
    expect((await ok((await c.as("architect")).get("/api/testing"))).calls[0]).toMatchObject({ by: "engineer", state: "done" });
  });

  test("a read-only server refuses all of it", async () => {
    const { c } = await app({ readOnly: true });
    expect((await ok(c.get("/api/state"))).can.test).toBe(false);
    expect((await c.get("/api/testing")).status).toBe(403);
    expect((await c.post("/api/testing/points", { relationshipId: PAY })).status).toBe(403);
  });

  test("only a browser on this machine: a request addressed to another host name is refused", async () => {
    const target = await startStandIn();
    cleanup.push(() => target.close());
    const dir = demoDir();
    // A server that answers to another name (a tunnel in front of it): the model can be read, testing cannot be used.
    const built = buildApp(dir, { allowedHosts: null });
    cleanup.push(() => built.ctx.testing.close());
    const far = new Client(dir, {}, built.app, { Host: "dp.example.com" });
    expect((await far.get("/api/state")).status).toBe(200);
    for (const r of [
      await far.get("/api/testing"),
      await far.get("/api/testing/events"),
      await far.post("/api/testing/points", { relationshipId: PAY }),
      await far.put("/api/testing/breakpoints", { breakpoints: [] }),
    ]) {
      expect(r.status).toBe(403);
      expect(r.json().detail).toMatch(/only in a browser on the machine/);
    }
  });

  test("the session file is not readable through the code routes, and a bad file starts an empty session", async () => {
    const dir = demoDir();
    fs.mkdirSync(path.join(dir, ".dp"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, ".dp", "testing.json"),
      '{"points": {"x": {"port": "no"}}, "breakpoints": [{"id": "b", "on": {"type": "element", "id": "gone"}}], "watches": [{"id": "w", "field": "nope"}], "options": {"holdSeconds": 99999}}',
    );
    const c = client(dir);
    const s = await ok(c.get("/api/testing"));
    expect(s).toMatchObject({ available: true, points: [], breakpoints: [], watches: [], options: { holdSeconds: 600 } });
    expect((await c.get("/api/code/file", { path: ".dp/testing.json" })).status).not.toBe(200);
  });

  test("in a hub each project has its own session; the shared catalog has none", async () => {
    const target = await startStandIn();
    cleanup.push(() => target.close());
    const dir = tmpDir();
    copyDemoHub(dir);
    const { app: hubApp, hub } = createHubApp(dir);
    cleanup.push(() => hub.close());
    const on = (project: string) => new Client("", {}, hubApp, { "X-DP-Project": project });
    const list = (await ok(new Client("", {}, hubApp).get("/api/hub"))).projects;
    const [first, second] = list.filter((p: any) => !p.catalog).map((p: any) => p.id);
    const catalog = list.find((p: any) => p.catalog)?.id;
    const st = await ok(on(first).get("/api/state"));
    const rel = st.relationships[0];
    await ok(on(first).patch(`/api/elements/${rel.destinationId}`, { runUrl: target.url }));
    const point = await ok(on(first).post("/api/testing/points", { relationshipId: rel.id }));
    expect(point.state).toBe("open");
    await fetch(point.url + "/anything");
    expect((await ok(on(first).get("/api/testing"))).calls).toHaveLength(1);
    // The other project sees none of it, and the port file is in the first project's own folder.
    expect(await ok(on(second).get("/api/testing"))).toMatchObject({ available: true, points: [], calls: [] });
    const folder = path.resolve(dir, list.find((p: any) => p.id === first).path);
    expect(fs.existsSync(path.join(folder, ".dp", "testing.json"))).toBe(true);
    if (catalog) {
      const s = await ok(on(catalog).get("/api/testing"));
      expect(s).toMatchObject({ available: false });
      expect(s.reason).toMatch(/shared catalog/);
      expect((await on(catalog).post("/api/testing/points", { relationshipId: rel.id })).status).toBe(409);
    }
    // Closing the hub closes the point.
    await hub.close();
    await expect(fetch(point.url + "/anything")).rejects.toThrow();
  });
});
