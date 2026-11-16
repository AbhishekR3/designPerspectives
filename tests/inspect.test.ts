/** Live UI inspector: endpoints, matching calls to the model, the walk onward, and the UI proxy. */

import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, test } from "vitest";
import { endpointMatches, inspectCalls, suggestEndpoint } from "../src/core/inspect.js";
import * as ops from "../src/core/ops.js";
import { INSPECT_SCRIPT_PATH } from "../src/server/inspectScript.js";
import { checkUiTarget, UiProxies } from "../src/server/uiProxy.js";
import { client, demoWs, ok } from "./helpers.js";

const ep = (method: string, path: string) => ({ method, path });
const u = (s: string) => new URL(s);

describe("endpoints", () => {
  test("are cleaned from lines or objects", () => {
    expect(ops.cleanEndpoints("GET /api/a\n  post   /api/b \n\n/health\nGET /api/a")).toEqual([ep("GET", "/api/a"), ep("POST", "/api/b"), ep("*", "/health")]);
    expect(ops.cleanEndpoints([{ method: "patch", path: "/x/:id" }, { path: "https://api.example.com/v1/*" }])).toEqual([ep("PATCH", "/x/:id"), ep("*", "https://api.example.com/v1/*")]);
    expect(() => ops.cleanEndpoints("FETCH /x")).toThrow(/not an HTTP method/);
    expect(() => ops.cleanEndpoints("GET api/x")).toThrow(/must start with/);
  });

  test("match by method and path segments", () => {
    expect(endpointMatches(ep("GET", "/api/accounts/:id"), "get", u("http://h/api/accounts/42?x=1"))).toBe(true);
    expect(endpointMatches(ep("GET", "/api/accounts/:id"), "POST", u("http://h/api/accounts/42"))).toBe(false);
    expect(endpointMatches(ep("GET", "/api/accounts/:id"), "GET", u("http://h/api/accounts/42/statements"))).toBe(false);
    expect(endpointMatches(ep("*", "/api/accounts/*"), "DELETE", u("http://h/api/accounts/42/statements"))).toBe(true);
    expect(endpointMatches(ep("*", "/api/accounts"), "GET", u("http://h/api/accounts/"))).toBe(true);
    expect(endpointMatches(ep("GET", "https://api.example.com/v1/*"), "GET", u("https://api.example.com/v1/rates"))).toBe(true);
    expect(endpointMatches(ep("GET", "https://api.example.com/v1/*"), "GET", u("https://other.example.com/v1/rates"))).toBe(false);
  });

  test("an unmatched call gets a pattern with IDs replaced", () => {
    expect(suggestEndpoint("get", u("http://h/api/accounts/1029/statements/3f2a9c1e-55aa-4c0b-9b1e-0123456789ab?page=2"))).toEqual(ep("GET", "/api/accounts/:id/statements/:id"));
    expect(suggestEndpoint("POST", u("http://h/api/payments"))).toEqual(ep("POST", "/api/payments"));
  });

  test("the live UI address must be http(s)", () => {
    expect(ops.cleanUiUrl(" http://localhost:4200 ")).toBe("http://localhost:4200/");
    expect(() => ops.cleanUiUrl("ftp://x")).toThrow(/http/);
    expect(() => ops.cleanUiUrl("http://me:pw@localhost/")).toThrow(/password/);
  });
});

describe("inspectCalls", () => {
  test("matches calls to the UI's relationships and walks on through the model", () => {
    const ws = demoWs();
    const r = inspectCalls(ws, "single-page-application", [
      { method: "POST", url: "http://localhost:4200/api/payments" },
      { method: "GET", url: "http://localhost:4200/api/unknown/7" },
    ]);
    expect(r.calls.map((c) => c.matches)).toEqual([["single-page-application--payments-controller"], []]);
    expect(r.calls[1]!.suggested).toEqual(ep("GET", "/api/unknown/:id"));
    expect(r.hops[0]).toEqual({ relationshipId: "single-page-application--payments-controller", depth: 0, via: null });
    // The payments controller's own relationships come next.
    const next = r.hops.filter((h) => h.depth === 1).map((h) => h.relationshipId);
    expect(next).toEqual(expect.arrayContaining(["payments-controller--session-cache", "payments-controller--payment-orchestrator"]));
    expect(r.hops.filter((h) => h.depth === 1).every((h) => h.via === "single-page-application--payments-controller")).toBe(true);
    expect(r.elements[0]).toBe("payments-controller");
    expect(r.elements).toContain("session-cache");
    expect(r.elements).not.toContain("single-page-application");
    expect(r.flows.map((f) => f.title)).toContain("Make a payment");
    expect(r.candidates).toContain("single-page-application--sign-in-controller");
    // Each relationship once, however many paths reach it.
    expect(new Set(r.hops.map((h) => h.relationshipId)).size).toBe(r.hops.length);
  });

  test("the walk enters each element once and never goes back", () => {
    const ws = demoWs();
    const r = inspectCalls(ws, "single-page-application", [{ method: "GET", url: "http://x/api/accounts/1029" }]);
    const idx = ops.buildIndex(ws);
    const targets = r.hops.map((h) => idx.rel(h.relationshipId).destinationId);
    expect(new Set(targets).size).toBe(targets.length);
    expect(targets).not.toContain("single-page-application");
    expect(Math.max(...r.hops.map((h) => h.depth))).toBeLessThanOrEqual(3);
  });

  test("the depth limit stops the walk and says so", () => {
    const r = inspectCalls(demoWs(), "single-page-application", [{ method: "POST", url: "http://x/api/payments" }], 0);
    expect(r.hops).toHaveLength(1);
    expect(r.truncated).toBe(true);
  });

  test("an unknown element is a model error", () => {
    expect(() => inspectCalls(demoWs(), "nope", [])).toThrow(ops.ModelError);
  });
});

describe("routes", () => {
  test("POST /api/inspect answers for any role, and the model fields round-trip", async () => {
    const c = client();
    await ok(c.patch("/api/elements/single-page-application", { uiUrl: "http://localhost:4200" }));
    await ok(c.patch("/api/relationships/single-page-application--reset-password-controller", { endpoints: "POST /api/password-resets\nGET /api/password-resets/:token" }));
    const st = await ok(c.get("/api/state"));
    expect(st.elements.find((e: any) => e.id === "single-page-application").uiUrl).toBe("http://localhost:4200/");
    expect(st.relationships.find((r: any) => r.id === "single-page-application--reset-password-controller").endpoints).toHaveLength(2);
    expect((await c.patch("/api/elements/single-page-application", { uiUrl: "javascript:alert(1)" })).status).toBe(422);
    const r = await ok(c.post("/api/inspect", { elementId: "single-page-application", calls: [{ method: "GET", url: "http://localhost:4200/api/password-resets/abcdefabcdefabcdef12" }] }));
    expect(r.calls[0].matches).toEqual(["single-page-application--reset-password-controller"]);
    expect((await c.post("/api/inspect", { elementId: "single-page-application", calls: "x" })).status).toBe(422);
  });

  test("POST /api/ui-proxy needs a live UI address on this machine", async () => {
    const c = client();
    await ok(c.patch("/api/elements/single-page-application", { uiUrl: "" }));
    expect((await c.post("/api/ui-proxy", { elementId: "single-page-application" })).status).toBe(422);
    await ok(c.patch("/api/elements/single-page-application", { uiUrl: "http://intranet.example.com/" }));
    const r = await c.post("/api/ui-proxy", { elementId: "single-page-application" });
    expect(r.status).toBe(422);
    expect(r.json().detail).toMatch(/--allow-ui-host intranet\.example\.com/);
  });
});

describe("UI proxy", () => {
  const servers: http.Server[] = [];
  const proxies: UiProxies[] = [];
  afterEach(async () => {
    for (const p of proxies.splice(0)) await p.close();
    for (const s of servers.splice(0)) await new Promise((r) => s.close(r));
  });

  /** A stand-in app: an HTML page that forbids framing, a JSON API that echoes what it got, a redirect. */
  async function app(): Promise<string> {
    const s = http.createServer((req, res) => {
      if (req.url === "/") {
        res.writeHead(200, { "Content-Type": "text/html", "X-Frame-Options": "DENY", "Content-Security-Policy": "frame-ancestors 'none'", "Set-Cookie": "app=1; Domain=localhost; Secure; SameSite=None" });
        res.end("<!doctype html><html><head><title>App</title></head><body>hi</body></html>");
      } else if (req.url === "/go") {
        res.writeHead(302, { Location: `http://127.0.0.1:${(s.address() as AddressInfo).port}/` }).end();
      } else {
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ host: req.headers.host, cookie: req.headers.cookie ?? null, origin: req.headers.origin ?? null }));
      }
    });
    servers.push(s);
    await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
    return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
  }

  function get(url: string, headers: Record<string, string> = {}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
    return new Promise((resolve, reject) => {
      http
        .get(url, { headers }, (res) => {
          let body = "";
          res.on("data", (b) => (body += b));
          res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body }));
        })
        .on("error", reject);
    });
  }

  test("frames the app: no framing headers, the script added, cookies usable on the proxy", async () => {
    const target = await app();
    const p = new UiProxies();
    proxies.push(p);
    const url = await p.urlFor(target + "/");
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(await p.urlFor(target + "/other?x=1")).toBe(url.replace(/\/$/, "/other?x=1")); // one listener per app origin
    const page = await get(url);
    expect(page.status).toBe(200);
    expect(page.headers["x-frame-options"]).toBeUndefined();
    expect(page.headers["content-security-policy"]).toBeUndefined();
    expect(page.body).toContain(`<head><script src="${INSPECT_SCRIPT_PATH}"></script><title>App</title>`);
    expect(page.headers["set-cookie"]![0]).toBe("app=1; SameSite=Lax");
    const script = await get(new URL(INSPECT_SCRIPT_PATH, url).href);
    expect(script.headers["content-type"]).toMatch(/javascript/);
    expect(script.body).toContain("dp-hello");
  });

  test("forwards to the app only, without dp's session cookie", async () => {
    const target = await app();
    const p = new UiProxies();
    proxies.push(p);
    const url = await p.urlFor(target + "/");
    const self = new URL(url).origin;
    const echo = JSON.parse((await get(self + "/api/x", { Cookie: "dp_session_8765=secret; app=1", Origin: self })).body);
    expect(echo).toEqual({ host: new URL(target).host, cookie: "app=1", origin: target });
    const moved = await get(self + "/go");
    expect(moved.status).toBe(302);
    expect(moved.headers.location).toBe(self + "/");
    // Another Host name pointing at the proxy (DNS rebinding) is refused.
    expect((await get(self + "/api/x", { Host: "evil.example:" + new URL(self).port })).status).toBe(403);
  });

  test("refuses targets off this machine unless allowed", () => {
    expect(() => checkUiTarget("http://intranet.example.com/")).toThrow(/--allow-ui-host/);
    expect(checkUiTarget("http://intranet.example.com/", ["intranet.example.com"]).host).toBe("intranet.example.com");
    expect(checkUiTarget("http://localhost:3000/").port).toBe("3000");
    expect(() => checkUiTarget("file:///etc/passwd")).toThrow(/http/);
  });

  test("an app that is not running gets a page that says so", async () => {
    const target = await app();
    await new Promise((r) => servers.pop()!.close(r));
    const p = new UiProxies();
    proxies.push(p);
    const page = await get(await p.urlFor(target + "/"));
    expect(page.status).toBe(502);
    expect(page.body).toContain("Is the app running?");
  });
});
