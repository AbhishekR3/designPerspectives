/** API endpoints on relationships: cleaning, matching a call by method and path, suggesting a pattern, and the model fields. */

import { describe, expect, test } from "vitest";
import { endpointMatches, suggestEndpoint } from "../../src/core/endpoints.js";
import { emptySidecar } from "../../src/core/designPerspectivesFile.js";
import * as ops from "../../src/core/modelEdits.js";
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

  test("the address something runs at is http(s), a host and a port only", () => {
    expect(ops.cleanRunUrl(" http://localhost:4200 ")).toBe("http://localhost:4200/");
    expect(() => ops.cleanRunUrl("ftp://x")).toThrow(/http/);
    expect(() => ops.cleanRunUrl("http://me:pw@localhost/")).toThrow(/password/);
    expect(() => ops.cleanRunUrl("http://localhost:4200/api?x=1")).toThrow(/host and a port only/);
  });
});

describe("routes", () => {
  test("the older live UI address is read as the address, and a write moves it to the new key", () => {
    const ws = demoWs();
    const el = ops.buildIndex(ws).el("single-page-application");
    el.properties = { ...(el.properties ?? {}), "dp.ui.url": "http://localhost:4200/" };
    expect(ops.runUrlOf(el)).toBe("http://localhost:4200/");
    ops.updateElement(ws, emptySidecar(), el.id, { runUrl: "http://localhost:4300" });
    expect(el.properties!["dp.run.url"]).toBe("http://localhost:4300/");
    expect(el.properties!["dp.ui.url"]).toBeUndefined();
  });

  test("the model fields round-trip", async () => {
    const c = client();
    await ok(c.patch("/api/elements/single-page-application", { runUrl: "http://localhost:4200" }));
    await ok(c.patch("/api/relationships/single-page-application--reset-password-controller", { endpoints: "POST /api/password-resets\nGET /api/password-resets/:token" }));
    const st = await ok(c.get("/api/state"));
    expect(st.elements.find((e: any) => e.id === "single-page-application").runUrl).toBe("http://localhost:4200/");
    expect(st.relationships.find((r: any) => r.id === "single-page-application--reset-password-controller").endpoints).toHaveLength(2);
    expect((await c.patch("/api/elements/single-page-application", { runUrl: "javascript:alert(1)" })).status).toBe(422);
  });
});
