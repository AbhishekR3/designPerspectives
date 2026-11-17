/** System testing rules: which relationships an intercept point covers, matching calls, allowed targets, hiding and restoring secret values, breakpoints. */

import { describe, expect, test } from "vitest";
import { emptySidecar } from "../../src/core/designPerspectivesFile.js";
import * as ops from "../../src/core/modelEdits.js";
import { breakpointHits, checkTarget, cleanBreakpoint, evalCondition, fieldValue, interceptGroup, maskMessage, matchCall, mergeMasked, type RawMessage } from "../../src/core/testing.js";
import type { Breakpoint } from "../../src/shared/types.js";
import { demoWs } from "./helpers.js";

const PAY = "single-page-application--payments-controller";
const SIGN_IN = "single-page-application--sign-in-controller";

function wsWithAddress(id = "payments-service", url = "http://127.0.0.1:8000") {
  const ws = demoWs();
  ops.updateElement(ws, emptySidecar(), id, { runUrl: url });
  return ws;
}

const json = (body: unknown, extra: Partial<RawMessage> = {}): RawMessage => ({
  method: "POST",
  path: "/api/payments",
  headers: [["Content-Type", "application/json"]],
  body: Buffer.from(JSON.stringify(body)),
  ...extra,
});

describe("intercept points", () => {
  test("a relationship into a component uses its container's address, and the point covers every relationship from the same caller", () => {
    const g = interceptGroup(wsWithAddress("api-application"), SIGN_IN);
    expect(g).toMatchObject({ id: "single-page-application--api-application", callerId: "single-page-application", targetElementId: "api-application", target: "http://127.0.0.1:8000/" });
    expect(g.members).toEqual(expect.arrayContaining([SIGN_IN, "single-page-application--accounts-summary-controller", "single-page-application--reset-password-controller"]));
    // Another service of the same caller, and another caller of the same service, have their own points.
    expect(g.members).not.toContain(PAY);
    expect(g.members.some((m) => m.startsWith("mobile-app--"))).toBe(false);
  });

  test("no address anywhere up the tree is an error that says where to set one", () => {
    // The demo model gives the payments service an address (for the demo system), so clear it first.
    const ws = wsWithAddress();
    ops.updateElement(ws, emptySidecar(), "payments-service", { runUrl: null });
    expect(() => interceptGroup(ws, PAY)).toThrow(/has no address it runs at/);
    expect(() => interceptGroup(demoWs(), "nope")).toThrow(ops.ModelError);
  });

  test("a call goes to the member whose endpoint matches; an unknown call stays with the point's relationship and gets a suggestion", () => {
    const ws = wsWithAddress("api-application");
    const g = interceptGroup(ws, SIGN_IN);
    expect(matchCall(ws, g, "POST", "/api/session?x=1")).toMatchObject({ relationshipId: SIGN_IN, endpoint: { method: "POST", path: "/api/session" }, suggested: null });
    expect(matchCall(ws, g, "GET", "/api/accounts/42").relationshipId).toBe("single-page-application--accounts-summary-controller");
    expect(matchCall(ws, g, "GET", "/api/exchange-rates/42")).toEqual({ relationshipId: SIGN_IN, endpoint: null, suggested: { method: "GET", path: "/api/exchange-rates/:id" } });
  });

  test("a point forwards to this machine only, unless a host was allowed; never to a link-local address", () => {
    expect(checkTarget("http://localhost:8000/", []).port).toBe("8000");
    expect(() => checkTarget("http://intranet.example.com/", [])).toThrow(/--allow-target-host intranet\.example\.com/);
    expect(checkTarget("https://intranet.example.com/", ["intranet.example.com"]).hostname).toBe("intranet.example.com");
    expect(() => checkTarget("http://169.254.169.254/", ["169.254.169.254"])).toThrow(/link-local/);
    expect(() => checkTarget("file:///etc/passwd", [])).toThrow(/http/);
    expect(() => checkTarget("http://me:pw@localhost/", [])).toThrow(/password/);
  });

  test("a stage is live only when it is linked to an element with an address", () => {
    const ws = wsWithAddress("fraud-detection-system", "http://127.0.0.1:8200");
    const rel = [...ops.buildIndex(ws).relationships.values()].find((r) => ops.getJson(r, ops.STAGES_KEY).length)!;
    const stages = ops.getJson<{ id: string; elementId?: string }>(rel, ops.STAGES_KEY);
    expect(() => interceptGroup(ws, rel.id, stages[0]!.id)).toThrow(/not live|has no stage/);
    ops.updateRelationship(ws, rel.id, { stages: stages.map((s, i) => (i === 0 ? { ...s, elementId: "fraud-detection-system" } : s)) });
    const g = interceptGroup(ws, rel.id, stages[0]!.id);
    expect(g).toMatchObject({ id: `stage:${rel.id}:${stages[0]!.id}`, stageId: stages[0]!.id, members: [rel.id], target: "http://127.0.0.1:8200/" });
    expect(matchCall(ws, g, "POST", "/anything")).toEqual({ relationshipId: rel.id, endpoint: null, suggested: null });
  });
});

describe("hidden values", () => {
  const raw = json(
    { amount: "125.00", card: { cardNumber: "4111111111111111", holder: "A" }, items: [{ token: "t1" }, { token: "t2" }] },
    {
      path: "/api/payments?page=2&api_key=K",
      headers: [
        ["Content-Type", "application/json"],
        ["Authorization", "Bearer abc"],
        ["X-Request-Id", "r1"],
      ],
    },
  );

  test("secret-looking fields are hidden at every depth, in headers and in the query, and listed", () => {
    const m = maskMessage(raw);
    expect(JSON.parse(m.body!)).toEqual({ amount: "125.00", card: { cardNumber: "•••", holder: "A" }, items: [{ token: "•••" }, { token: "•••" }] });
    expect(m.headers).toEqual([
      ["Content-Type", "application/json"],
      ["Authorization", "•••"],
      ["X-Request-Id", "r1"],
    ]);
    expect(m.path).toBe("/api/payments?page=2&api_key=•••");
    expect(m.masked).toEqual(expect.arrayContaining(["header.authorization", "query.api_key", "body.card.cardNumber", "body.items.0.token"]));
    expect(m.bodyKind).toBe("json");
    expect(JSON.stringify(m)).not.toMatch(/4111|Bearer abc|"t1"|=K/);
  });

  test("an untouched message is forwarded byte for byte", () => {
    const shown = maskMessage(raw);
    const { message, edited } = mergeMasked(raw, { method: "POST", path: shown.path, headers: shown.headers, body: shown.body! });
    expect(edited).toBe(false);
    expect(message.body.equals(raw.body)).toBe(true);
    expect(message.path).toBe(raw.path);
  });

  test("an edit keeps the hidden values that were left in place", () => {
    const shown = JSON.parse(maskMessage(raw).body!);
    shown.amount = "9000";
    const { message, edited } = mergeMasked(raw, {
      body: JSON.stringify(shown),
      path: "/api/payments?page=3&api_key=•••",
      headers: [
        ["Authorization", "•••"],
        ["X-New", "1"],
      ],
    });
    expect(edited).toBe(true);
    expect(JSON.parse(message.body.toString())).toEqual({ amount: "9000", card: { cardNumber: "4111111111111111", holder: "A" }, items: [{ token: "t1" }, { token: "t2" }] });
    expect(message.path).toBe("/api/payments?page=3&api_key=K");
    expect(message.headers).toEqual([
      ["Authorization", "Bearer abc"],
      ["X-New", "1"],
    ]);
  });

  test("a hidden value cannot be moved to another field, and a typed value replaces it", () => {
    expect(() => mergeMasked(raw, { body: JSON.stringify({ amount: "•••" }) })).toThrow(/no hidden value there/);
    expect(() => mergeMasked(raw, { body: JSON.stringify({ note: { password: "•••" } }) })).toThrow(/no hidden value there/);
    expect(() => mergeMasked(raw, { headers: [["X-Request-Id", "•••"]] })).toThrow(/no hidden value there/);
    expect(() => mergeMasked(raw, { path: "/x?other=•••" })).toThrow(/no hidden value there/);
    // A list with hidden values that changed length cannot be matched up again.
    expect(() => mergeMasked(raw, { body: JSON.stringify({ items: [{ token: "•••" }] }) })).toThrow(/number of items changed/);
    const typed = mergeMasked(raw, { body: JSON.stringify({ card: { cardNumber: "5500000000000004" } }) });
    expect(JSON.parse(typed.message.body.toString())).toEqual({ card: { cardNumber: "5500000000000004" } });
    // Invalid JSON may be sent on purpose, but not with hidden values in it.
    expect(mergeMasked(raw, { body: "{not json" }).message.body.toString()).toBe("{not json");
    expect(() => mergeMasked(raw, { body: '{"card": "•••"' })).toThrow(/not valid JSON/);
  });

  test("form bodies are hidden and restored by name; a binary body cannot be edited; bad methods, paths and headers are refused", () => {
    const form: RawMessage = { method: "POST", path: "/login", headers: [["Content-Type", "application/x-www-form-urlencoded"]], body: Buffer.from("user=ada&password=pw1") };
    expect(maskMessage(form).body).toBe("user=ada&password=•••");
    expect(mergeMasked(form, { body: "user=bob&password=•••" }).message.body.toString()).toBe("user=bob&password=pw1");
    const bin: RawMessage = { status: 200, headers: [["Content-Type", "image/png"]], body: Buffer.from([0, 1, 2]) };
    expect(maskMessage(bin)).toMatchObject({ body: null, bodyKind: "binary", bytes: 3 });
    expect(() => mergeMasked(bin, { body: "x" })).toThrow(/not text/);
    expect(mergeMasked(bin, { status: 503 }).message.status).toBe(503);
    expect(() => mergeMasked(raw, { method: "GE T" })).toThrow(/not an HTTP method/);
    expect(() => mergeMasked(raw, { path: "api/x" })).toThrow(/starts with/);
    expect(() => mergeMasked(raw, { headers: [["X-A", "a\r\nX-B: b"]] })).toThrow(/line break/);
    expect(() => mergeMasked(raw, { headers: [["Bad Name", "a"]] })).toThrow(/not a header name/);
  });
});

describe("breakpoints", () => {
  const bp = (over: Partial<Breakpoint>): Breakpoint => ({ id: "b1", on: { type: "relationship", id: PAY }, phase: "request", conditions: [], enabled: true, ...over });
  const request = maskMessage(
    json(
      { amount: 9000, to: { iban: "DE89" }, tags: ["a"] },
      {
        path: "/api/payments?page=2",
        headers: [
          ["Content-Type", "application/json"],
          ["X-Tenant", "blue"],
        ],
      },
    ),
  );
  const response = maskMessage({ status: 202, headers: [["Content-Type", "application/json"]], body: Buffer.from('{"status":"held-for-review"}') });

  test("fields and comparisons read the shown message", () => {
    expect(fieldValue(request, "body.amount")).toBe("9000");
    expect(fieldValue(request, "body.to.iban")).toBe("•••");
    expect(fieldValue(request, "body.tags")).toBe('["a"]');
    expect(fieldValue(request, "header.x-tenant")).toBe("blue");
    expect(fieldValue(request, "query.page")).toBe("2");
    expect(fieldValue(request, "path")).toBe("/api/payments");
    expect(fieldValue(response, "status")).toBe("202");
    expect(fieldValue(request, "body.nope")).toBeUndefined();
    expect(evalCondition({ field: "body.amount", op: ">", value: "1000" }, request)).toBe(true);
    expect(evalCondition({ field: "body.amount", op: "<", value: "1000" }, request)).toBe(false);
    expect(evalCondition({ field: "body.nope", op: "exists", value: "" }, request)).toBe(false);
    expect(evalCondition({ field: "body.nope", op: "!=", value: "x" }, request)).toBe(true);
    expect(evalCondition({ field: "header.x-tenant", op: "contains", value: "lu" }, request)).toBe(true);
  });

  test("a breakpoint on a line, on an object, with a phase, a path and conditions", () => {
    const ws = wsWithAddress();
    const call = { relationshipId: PAY };
    expect(breakpointHits(ws, bp({}), call, "request", request, null)).toBe(true);
    expect(breakpointHits(ws, bp({}), call, "response", request, response)).toBe(false);
    expect(breakpointHits(ws, bp({ phase: "both" }), call, "response", request, response)).toBe(true);
    expect(breakpointHits(ws, bp({ enabled: false }), call, "request", request, null)).toBe(false);
    expect(breakpointHits(ws, bp({}), { relationshipId: SIGN_IN }, "request", request, null)).toBe(false);
    // An object stops calls into it or into anything inside it.
    expect(breakpointHits(ws, bp({ on: { type: "element", id: "payments-service" } }), call, "request", request, null)).toBe(true);
    expect(breakpointHits(ws, bp({ on: { type: "element", id: "payments-controller" } }), call, "request", request, null)).toBe(true);
    expect(breakpointHits(ws, bp({ on: { type: "element", id: "sign-in-controller" } }), call, "request", request, null)).toBe(false);
    expect(breakpointHits(ws, bp({ method: "GET" }), call, "request", request, null)).toBe(false);
    expect(breakpointHits(ws, bp({ path: "/api/payments" }), call, "request", request, null)).toBe(true);
    expect(breakpointHits(ws, bp({ path: "/api/other/*" }), call, "request", request, null)).toBe(false);
    expect(breakpointHits(ws, bp({ conditions: [{ field: "body.amount", op: ">", value: "5000" }] }), call, "request", request, null)).toBe(true);
    expect(breakpointHits(ws, bp({ conditions: [{ field: "body.amount", op: ">", value: "50000" }] }), call, "request", request, null)).toBe(false);
    expect(
      breakpointHits(
        ws,
        bp({
          phase: "response",
          conditions: [
            { field: "status", op: "=", value: "202" },
            { field: "query.page", op: "=", value: "2" },
          ],
        }),
        call,
        "response",
        request,
        response,
      ),
    ).toBe(true);
  });

  test("a flow step stops its relationship in the step's own direction", () => {
    const ws = wsWithAddress();
    const flow = ws.views.dynamicViews!.find((v) => v.relationships!.some((r) => r.id === PAY))!;
    const step = flow.relationships!.find((r) => r.id === PAY)!;
    const b = cleanBreakpoint(ws, { id: "s1", on: { type: "step", flow: flow.key, order: step.order } });
    const phase = step.response ? "response" : "request";
    expect(breakpointHits(ws, b, { relationshipId: PAY }, phase, request, response)).toBe(true);
    expect(breakpointHits(ws, b, { relationshipId: PAY }, phase === "request" ? "response" : "request", request, response)).toBe(false);
  });

  test("a breakpoint a client sends is checked against the model", () => {
    const ws = wsWithAddress();
    expect(cleanBreakpoint(ws, { id: "a", on: { type: "relationship", id: PAY }, phase: "both", method: "post", extra: 1 })).toEqual({
      id: "a",
      on: { type: "relationship", id: PAY },
      phase: "both",
      method: "POST",
      conditions: [],
      enabled: true,
    });
    expect(() => cleanBreakpoint(ws, { id: "a", on: { type: "relationship", id: "nope" } })).toThrow(ops.ModelError);
    expect(() => cleanBreakpoint(ws, { id: "a", on: { type: "step", flow: "flow-nope", order: "1" } })).toThrow(/no such step/);
    expect(() => cleanBreakpoint(ws, { id: "a", on: { type: "element", id: "api-application" }, conditions: [{ field: "amount", op: "=", value: "1" }] })).toThrow(/not a field/);
    expect(() => cleanBreakpoint(ws, { id: "a", on: { type: "element", id: "api-application" }, conditions: [{ field: "body.a", op: "~", value: "1" }] })).toThrow(/not a comparison/);
    expect(() => cleanBreakpoint(ws, { id: "bad id", on: { type: "element", id: "api-application" } })).toThrow(/needs an ID/);
  });
});
