/** OpenTelemetry trace files: parsing, matching spans to the model, and the routes. */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { observe, parseTraceFile, TraceStore } from "../../src/core/traces.js";
import { client, demoDir, demoWs, ok, tmpDir } from "./helpers.js";

const T = "4bf92f3577b34da6a3ce929d0e0e4736";
const kv = (key: string, v: string) => ({ key, value: { stringValue: v } });
const span = (spanId: string, parent: string | null, name: string, extra: Record<string, unknown> = {}) => ({
  traceId: T,
  spanId,
  ...(parent ? { parentSpanId: parent } : {}),
  name,
  kind: 1,
  startTimeUnixNano: "1700000000000000000",
  endTimeUnixNano: "1700000000005000000",
  ...extra,
});
const doc = (service: string, spans: unknown[]) => ({ resourceSpans: [{ resource: { attributes: [kv("service.name", service)] }, scopeSpans: [{ spans }] }] });

describe("parseTraceFile", () => {
  test("JSON lines (a cut line skipped), a whole file, and base64 ids", () => {
    const lines = [JSON.stringify(doc("api-application", [span("00f067aa0ba902b7", null, "GET /x")])), '{"resourceSpans": [{"res', ""].join("\n");
    expect(parseTraceFile(lines).map((s) => [s.traceId, s.spanId, s.service, s.name])).toEqual([[T, "00f067aa0ba902b7", "api-application", "GET /x"]]);
    const whole = JSON.stringify([doc("a", [span("00f067aa0ba902b7", null, "one")]), doc("b", [span("00f067aa0ba902b8", "00f067aa0ba902b7", "two")])]);
    expect(parseTraceFile(whole).map((s) => s.service)).toEqual(["a", "b"]);
    const b64 = parseTraceFile(
      JSON.stringify(doc("a", [{ ...span("x", null, "b64"), traceId: Buffer.from(T, "hex").toString("base64"), spanId: Buffer.from("00f067aa0ba902b7", "hex").toString("base64") }])),
    );
    expect([b64[0]!.traceId, b64[0]!.spanId]).toEqual([T, "00f067aa0ba902b7"]);
  });
});

describe("observe", () => {
  test("matches spans by code file, parent and peer.service; masks secrets; reports what the model lacks", () => {
    const spans = parseTraceFile(
      JSON.stringify(
        doc("api-application", [
          span("0000000000000001", null, "POST /api/session", { kind: 2, attributes: [kv("code.filepath", "sample_code/api/sign_in.py"), kv("http.request.header.authorization", "Bearer abc")] }),
          // security.py is mapped to three components; it is the Security Component's main file.
          span("0000000000000002", "0000000000000001", "verify", { attributes: [kv("code.filepath", "sample_code/api/security.py")] }),
          // No file of its own: runs in the Security Component, and calls the database.
          span("0000000000000003", "0000000000000002", "SELECT", { kind: 3, attributes: [kv("peer.service", "database")] }),
          span("0000000000000004", "0000000000000002", "audit", { kind: 3, attributes: [kv("peer.service", "audit-log")], status: { code: 2, message: "timeout" } }),
        ]),
      ),
    );
    const o = observe(demoWs(), null, spans, "single-page-application");
    expect(o.hops.map((h) => [h.from, h.to, Boolean(h.relationshipId)])).toEqual([
      ["single-page-application", "sign-in-controller", true],
      ["sign-in-controller", "security-component", true],
      ["security-component", "database", true],
    ]);
    expect(o.elements).toEqual(["sign-in-controller", "security-component", "database"]);
    expect(o.unmapped).toEqual(["audit-log"]);
    expect(o.error).toBe(true);
    expect(o.spans[0]!.attributes["http.request.header.authorization"]).toBe("•••");
    expect(o.spans[3]!.error).toBe("timeout");
    expect(o.spans[2]!.elementId).toBe("security-component");
  });

  test("a hop the model does not have, and a service matched by dp.otel.service", async () => {
    const dir = demoDir();
    const c = client(dir);
    await ok(c.patch("/api/elements/fraud-detection-system", { otelService: "fraud-svc" }));
    const tdir = path.join(dir, "traces");
    fs.mkdirSync(tdir, { recursive: true });
    // The statement store calling the fraud service: no relationship in the model.
    fs.writeFileSync(
      path.join(tdir, "t.jsonl"),
      JSON.stringify(
        doc("statement-store", [span("0000000000000001", null, "scan"), span("0000000000000002", "0000000000000001", "call", { kind: 3, attributes: [kv("peer.service", "fraud-svc")] })]),
      ) + "\n",
    );
    const o = await ok(c.get(`/api/traces/${T}`));
    expect(o.hops).toEqual([{ from: "statement-store", to: "fraud-detection-system", spanId: "0000000000000002", relationshipId: null }]);
  });
});

describe("TraceStore and routes", () => {
  test("lists the newest traces, re-reads changed files, answers 404 and 422", async () => {
    const dir = demoDir();
    const tdir = path.join(dir, "traces");
    fs.rmSync(tdir, { recursive: true }); // the demo's sample trace
    const c = client(dir);
    expect((await ok(c.get("/api/traces"))).exists).toBe(false);
    fs.mkdirSync(tdir);
    const file = path.join(tdir, "a.jsonl");
    fs.writeFileSync(file, JSON.stringify(doc("api-application", [span("0000000000000001", null, "GET /api/accounts")])) + "\n");
    let list = await ok(c.get("/api/traces"));
    expect(list.traces.map((t: any) => [t.traceId, t.name, t.spanCount])).toEqual([[T, "GET /api/accounts", 1]]);
    fs.appendFileSync(file, JSON.stringify(doc("api-application", [span("0000000000000002", "0000000000000001", "more")])) + "\n");
    list = await ok(c.get("/api/traces"));
    expect(list.traces[0].spanCount).toBe(2);
    expect((await c.get("/api/traces/0123456789abcdef0123456789abcdef")).status).toBe(404);
    expect((await c.get("/api/traces/not-hex")).status).toBe(422);
    expect(new TraceStore(path.join(dir, "nowhere")).list().traces).toEqual([]);
  });

  test("--traces points at another folder", async () => {
    const dir = demoDir();
    const other = tmpDir();
    fs.writeFileSync(path.join(other, "x.json"), JSON.stringify(doc("api-application", [span("0000000000000001", null, "elsewhere")])));
    const list = await ok(client(dir, { tracesDir: other }).get("/api/traces"));
    expect(list.traces[0].name).toBe("elsewhere");
  });
});

describe("the demo", () => {
  test("ships one made-up trace: every hop but the exchange-rate lookup is in the model", async () => {
    const c = client(demoDir());
    const list = await ok(c.get("/api/traces"));
    expect(list.traces.map((t: any) => t.name)).toEqual(["POST /api/payments"]);
    const t = await ok(c.get(`/api/traces/${list.traces[0].traceId}`));
    expect(t.elements).toEqual(expect.arrayContaining(["payments-controller", "payment-orchestrator", "fraud-detection-system", "payment-events"]));
    expect(t.unmapped).toEqual(["fx-rates-provider"]);
    expect(t.hops.filter((h: any) => h.relationshipId).length).toBeGreaterThanOrEqual(3);
    expect(t.error).toBe(false);
  });
});
