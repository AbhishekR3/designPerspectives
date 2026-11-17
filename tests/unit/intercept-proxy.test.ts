/** Intercept points with real local listeners: forwarding, the run log, pausing, editing, answering, resending, and the limits that keep a paused call from hanging. */

import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { buildApp } from "../../src/server/app.js";
import type { TestSession } from "../../src/server/testSession.js";
import type { Breakpoint, TestingState } from "../../src/shared/types.js";
import { Client, demoDir, ok } from "./helpers.js";
import { startStandIn } from "./standInService.js";

const PAY = "single-page-application--payments-controller";
const POINT = "single-page-application--payments-service";

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const f of cleanup.splice(0).reverse()) await f();
});

async function setup(opts: { presenceMs?: number; dir?: string } = {}) {
  const target = await startStandIn();
  cleanup.push(() => target.close());
  const dir = opts.dir ?? demoDir();
  const built = buildApp(dir);
  const c = new Client(dir, {}, built.app);
  await ok(c.patch("/api/elements/payments-service", { runUrl: target.url }));
  const session = built.ctx.testing;
  if (opts.presenceMs !== undefined) (session as unknown as { presenceMs: number }).presenceMs = opts.presenceMs;
  cleanup.push(() => session.close());
  const point = await session.openPoint(PAY);
  return { dir, c, session, target, point, base: point.url! };
}

const post = (base: string, pathname: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(base + pathname, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

const bp = (over: Partial<Breakpoint> = {}): Breakpoint => ({ id: "b1", on: { type: "relationship", id: PAY }, phase: "request", conditions: [], enabled: true, ...over });

/** Wait until the session has a paused call, and return its ID. */
async function paused(session: TestSession): Promise<string> {
  for (let i = 0; i < 200; i++) {
    const s = session.state();
    if (s.held.length) return s.held[0]!;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("no call was paused");
}
async function until(session: TestSession, done: (s: TestingState) => boolean): Promise<TestingState> {
  for (let i = 0; i < 300; i++) {
    const s = session.state();
    if (done(s)) return s;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("the state never got there");
}

describe("an intercept point", () => {
  test("forwards a call to the target and logs it against the relationship its endpoint matches", async () => {
    const { session, target, point, base } = await setup();
    expect(point).toMatchObject({ id: POINT, state: "open", relationshipId: PAY, targetElementId: "payments-service" });
    expect(base).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    const r = await post(base, "/api/payments?token=T1", { amount: "125.00", password: "pw" }, { Authorization: "Bearer abc", Cookie: "dp_session_8765=x; other=1", "Accept-Encoding": "gzip" });
    expect(r.status).toBe(200);
    expect((await r.json()).body).toEqual({ amount: "125.00", password: "pw" });
    // The target sees its own name as Host, no dp cookie, and plain bodies are asked for.
    const got = target.received[0]!;
    expect(got.headers.host).toBe(new URL(target.url).host);
    expect(got.headers.cookie).toBe("other=1");
    expect(got.headers["accept-encoding"]).toBeUndefined();
    expect(got.headers.authorization).toBe("Bearer abc");

    const call = session.state().calls[0]!;
    expect(call).toMatchObject({
      relationshipId: PAY,
      method: "POST",
      path: "/api/payments?token=•••",
      state: "done",
      status: 200,
      endpoint: { method: "POST", path: "/api/payments" },
      suggested: null,
      edited: false,
    });
    // What the browser gets has no secret values.
    const d = session.detail(call.id);
    expect(JSON.stringify(d)).not.toMatch(/Bearer abc|"pw"|T1|s3cret/);
    expect(JSON.parse(d.request.body!)).toEqual({ amount: "125.00", password: "•••" });
    expect(d.response!.headers.find(([k]) => k.toLowerCase() === "set-cookie")![1]).toBe("•••");
  });

  test("a call with no endpoint in the model is logged with a suggestion; a redirect to the target points back at the point", async () => {
    const { session, base } = await setup();
    await fetch(base + "/api/exchange-rates/42");
    expect(session.state().calls[0]).toMatchObject({ relationshipId: PAY, endpoint: null, suggested: { method: "GET", path: "/api/exchange-rates/:id" } });
    const r = await fetch(base + "/redirect", { redirect: "manual" });
    expect(r.headers.get("location")).toBe(base + "/there");
  });

  test("answers only requests addressed to itself on this machine", async () => {
    const { base, target } = await setup();
    const port = Number(new URL(base).port);
    const status = await new Promise<string>((resolve, reject) => {
      const s = net.connect(port, "127.0.0.1", () => s.write("GET /x HTTP/1.1\r\nHost: evil.example.com\r\nConnection: close\r\n\r\n"));
      let text = "";
      s.on("data", (b) => (text += b.toString()));
      s.on("end", () => resolve(text.split("\r\n")[0]!));
      s.on("error", reject);
    });
    expect(status).toMatch(/ 403 /);
    // A request line that names another address is refused, not forwarded.
    const absolute = await new Promise<string>((resolve, reject) => {
      const s = net.connect(port, "127.0.0.1", () => s.write(`GET http://other.example.com/x HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`));
      let text = "";
      s.on("data", (b) => (text += b.toString()));
      s.on("end", () => resolve(text.split("\r\n")[0]!));
      s.on("error", reject);
    });
    expect(absolute).toMatch(/ 400 /);
    expect(target.received).toHaveLength(0);
  });

  test("what cannot be held is passed through and says why", async () => {
    const { session, base } = await setup();
    session.setBreakpoints([bp({ phase: "both" })]);
    const big = await fetch(base + "/large");
    expect((await big.arrayBuffer()).byteLength).toBe(1_500_000);
    const events = await (await fetch(base + "/events")).text();
    expect(events).toBe("data: one\n\ndata: two\n\n");
    const sent = await post(base, "/api/payments", { blob: "x".repeat(1_100_000) });
    expect(sent.status).toBe(200);
    const pre = await fetch(base + "/api/payments", { method: "OPTIONS", headers: { "Access-Control-Request-Method": "POST", Origin: "http://localhost:3000" } });
    expect(pre.status).toBe(200);
    const s = await until(session, (x) => x.calls.length === 4 && x.calls.every((c) => c.state === "done" || c.state === "passed"));
    // The first two requests have no body and the breakpoint is on both phases, so they would pause at the request: none is open here.
    expect(s.calls.map((c) => c.note)).toEqual([
      expect.stringMatching(/reply over 1 MB/),
      expect.stringMatching(/event stream/),
      expect.stringMatching(/request body over 1 MB/),
      expect.stringMatching(/preflight/),
    ]);
  });

  test("a target that is not running gives the caller a 502 that says so", async () => {
    const { session, base, target } = await setup();
    await target.close();
    const r = await fetch(base + "/api/payments");
    expect(r.status).toBe(502);
    expect(r.headers.get("x-dp-intercept")).toBe("unreachable");
    expect(await r.text()).toMatch(/could not reach/);
    expect(session.state().calls[0]).toMatchObject({ state: "failed", status: 502 });
  });

  test("its port is remembered outside git, and a restart offers it again as saved", async () => {
    const first = await setup();
    const port = first.point.port!;
    const file = path.join(first.dir, ".dp", "testing.json");
    expect(JSON.parse(fs.readFileSync(file, "utf-8")).points[POINT]).toEqual({ port, relationshipId: PAY });
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    first.session.setBreakpoints([bp()]);
    await first.session.close();

    const again = buildApp(first.dir).ctx.testing;
    cleanup.push(() => again.close());
    const s = again.state();
    expect(s.points).toEqual([expect.objectContaining({ id: POINT, state: "saved", port, url: null })]);
    expect(s.breakpoints).toHaveLength(1);
    expect(await again.startSaved()).toEqual([]);
    expect(again.state().points[0]).toMatchObject({ state: "open", port, url: `http://127.0.0.1:${port}` });
    await again.closePoint(POINT);
    expect(again.state().points).toEqual([]);
    expect(JSON.parse(fs.readFileSync(file, "utf-8")).points).toEqual({});
  });

  test("a point closes when the model takes its address away, and refuses an address that is not this machine", async () => {
    const { c, session, base } = await setup();
    await ok(c.patch("/api/elements/payments-service", { runUrl: "" }));
    expect(session.state().points[0]).toMatchObject({ state: "saved", url: null, error: expect.stringMatching(/Closed: .*no address/) });
    await expect(fetch(base + "/api/payments")).rejects.toThrow();
    await ok(c.patch("/api/elements/payments-service", { runUrl: "http://intranet.example.com/" }));
    await expect(session.openPoint(PAY)).rejects.toThrow(/--allow-target-host intranet\.example\.com/);
  });
});

describe("pausing a call", () => {
  test("a breakpoint holds the request; an edit reaches the target with hidden values kept", async () => {
    const { session, target, base } = await setup();
    session.setBreakpoints([bp()]);
    const pending = post(base, "/api/payments", { amount: "125.00", cardNumber: "4111" }, { Authorization: "Bearer abc" });
    const id = await paused(session);
    expect(target.received).toHaveLength(0);
    const d = session.detail(id);
    expect(d).toMatchObject({ state: "held-request", breakpointId: "b1" });
    expect(d.heldUntil).toBeGreaterThan(Date.now());
    const body = JSON.parse(d.request.body!);
    expect(body.cardNumber).toBe("•••");
    body.amount = "9000";
    session.release(id, { do: "continue", request: { body: JSON.stringify(body), headers: [...d.request.headers, ["X-Test", "1"]] } }, "ada");
    const r = await pending;
    expect((await r.json()).body).toEqual({ amount: "9000", cardNumber: "4111" });
    expect(target.received[0]!.headers).toMatchObject({ authorization: "Bearer abc", "x-test": "1", "content-length": String(JSON.stringify({ amount: "9000", cardNumber: "4111" }).length) });
    expect(session.state().calls[0]).toMatchObject({ state: "done", edited: true, by: "ada" });
    // A second release is refused.
    expect(() => session.release(id, { do: "continue" })).toThrow(/no longer paused/);
  });

  test("a wrong edit is refused and the call stays paused", async () => {
    const { session, base } = await setup();
    session.setBreakpoints([bp()]);
    const pending = post(base, "/api/payments", { amount: 1 });
    const id = await paused(session);
    expect(() => session.release(id, { do: "continue", request: { body: '{"amount": "•••"}' } })).toThrow(/no hidden value there/);
    expect(() => session.release(id, { do: "continue-response" })).toThrow(/paused at its request/);
    expect(session.state().held).toEqual([id]);
    session.release(id, { do: "continue" });
    expect((await pending).status).toBe(200);
  });

  test("drop closes the caller's connection; answering yourself sends nothing to the target", async () => {
    const { session, target, base } = await setup();
    session.setBreakpoints([bp()]);
    const dropped = post(base, "/api/payments", { amount: 1 });
    session.release(await paused(session), { do: "drop" });
    await expect(dropped).rejects.toThrow();
    const answered = post(base, "/api/payments", { amount: 2 });
    session.release(await paused(session), { do: "reply", status: 503, body: '{"error":"down"}', delayMs: 20 });
    const r = await answered;
    expect([r.status, await r.json()]).toEqual([503, { error: "down" }]);
    expect(target.received).toHaveLength(0);
    expect(session.state().calls.map((c) => c.state)).toEqual(["dropped", "replied"]);
    expect(() => session.release("c1", { do: "reply", status: 99 })).toThrow();
  });

  test("the reply can be paused and changed on its way back", async () => {
    const { session, base } = await setup();
    session.setBreakpoints([bp({ phase: "response", conditions: [{ field: "status", op: "=", value: "200" }] })]);
    const pending = post(base, "/api/payments", { amount: 1 });
    const id = await paused(session);
    const d = session.detail(id);
    expect(d.state).toBe("held-response");
    expect(() => session.release(id, { do: "continue" })).toThrow(/paused at its reply/);
    session.release(id, { do: "continue-response", response: { status: 500, body: '{"error":"made up"}' } });
    const r = await pending;
    expect([r.status, await r.json()]).toEqual([500, { error: "made up" }]);
    expect(session.state().calls[0]).toMatchObject({ state: "done", status: 500, edited: true });
  });

  test("Pause next stops the next call once; Step stops at the next thing that happens", async () => {
    const { session, base } = await setup();
    session.step();
    expect(session.state().stepping).toBe(true);
    const pending = post(base, "/api/payments", { amount: 1 });
    const id = await paused(session);
    expect(session.state().stepping).toBe(false);
    session.release(id, { do: "continue", step: true });
    await until(session, (s) => s.calls[0]!.state === "held-response");
    session.release(id, { do: "continue-response" });
    expect((await pending).status).toBe(200);
    // Nothing is pending now: the next call is not paused.
    expect((await post(base, "/api/payments", { amount: 2 })).status).toBe(200);
    // "Continue and pause on the reply".
    session.step();
    const second = post(base, "/api/payments", { amount: 3 });
    const id2 = await paused(session);
    session.release(id2, { do: "continue", pauseOnReply: true });
    await until(session, (s) => s.calls.find((c) => c.id === id2)!.state === "held-response");
    session.releaseAll();
    expect((await second).status).toBe(200);
  });

  test("a paused call is released by itself, when the caller gives up, and when no testing page is open", async () => {
    const { session, base } = await setup({ presenceMs: 150 });
    session.setBreakpoints([bp()]);
    // The caller gives up.
    const gone = new AbortController();
    const left = post(base, "/api/payments", { amount: 1 }).catch(() => "aborted");
    const leftByAbort = fetch(base + "/api/payments", { method: "POST", body: "{}", headers: { "Content-Type": "application/json" }, signal: gone.signal }).catch(() => "aborted");
    await until(session, (s) => s.held.length === 2);
    gone.abort();
    expect(await leftByAbort).toBe("aborted");
    await until(session, (s) => s.calls.some((c) => c.state === "failed" && /gave up/.test(c.note ?? "")));
    // No page asks for the state any more: the other call goes through unchanged.
    const r = (await left) as Response;
    expect(r.status).toBe(200);
    const s = session.state();
    expect(s.calls.find((c) => c.state === "done")!.note).toMatch(/no testing page is open/);
    // And with no page open, a new call is not paused at all.
    await new Promise((res) => setTimeout(res, 200));
    expect((await post(base, "/api/payments", { amount: 2 })).status).toBe(200);
    expect(session.state().calls.at(-1)!.note).toMatch(/not paused: no testing page is open/);
  });

  test("the hold time is an option, and a held call past it goes on unchanged", async () => {
    const { session, base } = await setup();
    expect(() => session.setOptions({ holdSeconds: 5 })).toThrow(/10 to 600/);
    session.setOptions({ holdSeconds: 30 });
    expect(session.state().options.holdSeconds).toBe(30);
    // The timer itself is shortened here, so the test does not wait.
    (session as unknown as { options: { holdSeconds: number } }).options = { holdSeconds: 0.05 };
    session.setBreakpoints([bp()]);
    const r = await post(base, "/api/payments", { amount: 1 });
    expect(r.status).toBe(200);
    expect(session.state().calls[0]!.note).toMatch(/released automatically/);
  });
});

describe("the run log", () => {
  test("a logged call can be sent again, changed; its reply goes to the log only", async () => {
    const { session, target, base } = await setup();
    await post(base, "/api/payments", { amount: 1, password: "pw" });
    const id = session.resend("c1", { body: JSON.stringify({ amount: 2, password: "•••" }) }, "ada");
    const s = await until(session, (x) => x.calls.find((c) => c.id === id)?.state === "done");
    expect(s.calls.find((c) => c.id === id)).toMatchObject({ resentFrom: "c1", edited: true, by: "ada", status: 200 });
    expect(JSON.parse(target.received[1]!.body)).toEqual({ amount: 2, password: "pw" });
    expect(JSON.parse(session.detail(id).response!.body!).body).toEqual({ amount: 2, password: "•••" });
    expect(() => session.resend("c99", undefined)).toThrow(/not in the run log/);
  });

  test("watched fields are read from every call; clearing keeps what is paused", async () => {
    const { session, base } = await setup();
    session.setWatches([{ id: "w1", field: "body.amount" }, "status"]);
    await post(base, "/api/payments", { amount: 7 });
    await post(base, "/missing", { amount: 8 });
    const s = session.state();
    expect(s.watches).toEqual([
      { id: "w1", field: "body.amount" },
      { id: "w2", field: "status" },
    ]);
    expect(s.watchValues.w1).toEqual([
      { callId: "c1", value: "7" },
      { callId: "c2", value: "8" },
    ]);
    expect(s.watchValues.w2).toEqual([
      { callId: "c1", value: "200" },
      { callId: "c2", value: "404" },
    ]);
    expect(() => session.setWatches(["amount"])).toThrow(/not a field/);
    session.setBreakpoints([bp()]);
    const pending = post(base, "/api/payments", { amount: 9 });
    const id = await paused(session);
    session.clearCalls();
    expect(session.state().calls.map((c) => c.id)).toEqual([id]);
    session.releaseAll();
    await pending;
  });

  test("a waiting page hears of a new call at once", async () => {
    const { session, base } = await setup();
    const v = session.state().version;
    const waiting = session.wait(v, 5000);
    const t0 = Date.now();
    await post(base, "/api/payments", { amount: 1 });
    const s = await waiting;
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(s.version).toBeGreaterThan(v);
    expect(s.calls).toHaveLength(1);
    // Nothing new: the wait ends by itself.
    const same = await session.wait(session.state().version, 30);
    expect(same.version).toBe(session.state().version);
  });
});
