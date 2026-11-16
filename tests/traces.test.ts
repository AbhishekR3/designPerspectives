/** OpenTelemetry trace files: parsing, matching spans to the model, the routes, and the demo web app that writes them. */

import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { observe, parseTraceFile, TraceStore } from "../src/core/traces.js";
import { startDemoApp, type DemoApp } from "../src/demo/demoApp.js";
import { DEMO_DIR } from "../src/core/project.js";
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
    const b64 = parseTraceFile(JSON.stringify(doc("a", [{ ...span("x", null, "b64"), traceId: Buffer.from(T, "hex").toString("base64"), spanId: Buffer.from("00f067aa0ba902b7", "hex").toString("base64") }])));
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
    fs.mkdirSync(tdir);
    // The statement store calling the fraud service: no relationship in the model.
    fs.writeFileSync(path.join(tdir, "t.jsonl"), JSON.stringify(doc("statement-store", [span("0000000000000001", null, "scan"), span("0000000000000002", "0000000000000001", "call", { kind: 3, attributes: [kv("peer.service", "fraud-svc")] })])) + "\n");
    const o = await ok(c.get(`/api/traces/${T}`));
    expect(o.hops).toEqual([{ from: "statement-store", to: "fraud-detection-system", spanId: "0000000000000002", relationshipId: null }]);
  });
});

describe("TraceStore and routes", () => {
  test("lists the newest traces, re-reads changed files, answers 404 and 422", async () => {
    const dir = demoDir();
    const c = client(dir);
    expect((await ok(c.get("/api/traces"))).exists).toBe(false);
    const tdir = path.join(dir, "traces");
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

describe("demo web app", () => {
  let app: DemoApp | null = null;
  afterEach(async () => {
    await app?.close();
    app = null;
  });

  test("serves the page and the API, and writes a trace per call under the browser's trace ID", async () => {
    const dir = demoDir();
    app = await startDemoApp({ root: dir, webDir: path.join(DEMO_DIR, "web-app"), port: 0 });
    const page = await fetch(app.url);
    expect(await page.text()).toContain("Internet banking");
    const tp = (n: number) => ({ traceparent: `00-${String(n).repeat(32).slice(0, 32)}-00f067aa0ba902b7-01`, "Content-Type": "application/json" });
    const pay = await fetch(app.url + "api/payments", { method: "POST", headers: tp(1), body: JSON.stringify({ amount: "125.00" }) });
    expect([pay.status, (await pay.json()).status]).toEqual([201, "accepted"]);
    const held = await fetch(app.url + "api/payments", { method: "POST", headers: tp(2), body: JSON.stringify({ amount: "9000" }) });
    expect((await held.json()).status).toBe("held-for-review");
    const bad = await fetch(app.url + "api/payments", { method: "POST", headers: tp(3), body: JSON.stringify({ amount: "x" }) });
    expect(bad.status).toBe(422);
    await fetch(app.url + "api/exchange-rates/2026-11-15", { headers: tp(4) });
    expect((await fetch(app.url + "api/nothing")).status).toBe(404);

    const c = client(dir);
    const payment = await ok(c.get(`/api/traces/${"1".repeat(32)}?ui=single-page-application`));
    expect(payment.name).toBe("POST /api/payments");
    expect(payment.hops.every((h: any) => h.relationshipId)).toBe(true);
    expect(payment.elements).toEqual(expect.arrayContaining(["payments-controller", "payment-orchestrator", "fraud-detection-system", "mainframe-banking-system", "payment-events"]));
    // A held payment stops after the fraud score: no mainframe submission.
    expect((await ok(c.get(`/api/traces/${"2".repeat(32)}`))).elements).not.toContain("mainframe-banking-system");
    const failed = await ok(c.get(`/api/traces/${"3".repeat(32)}`));
    expect(failed.error).toBe(true);
    expect(failed.spans.find((s: any) => s.error).name).toBe("validate payment");
    expect((await ok(c.get(`/api/traces/${"4".repeat(32)}`))).unmapped).toEqual(["fx-rates-provider"]);
  });
});
