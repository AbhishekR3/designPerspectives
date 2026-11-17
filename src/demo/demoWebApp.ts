/**
 * The demo web app: a small "Internet banking" app for the demo model, run by `dp serve --demo` on
 * 127.0.0.1:4200 (the Single-Page Application's live UI address in the demo model). It serves the
 * page in demo/web-app/ and a made-up JSON API, and writes an OpenTelemetry trace for every API call
 * to `<project>/traces/demo-app.jsonl` (OTLP JSON lines, as the Collector's file exporter writes).
 *
 * The spans name the demo's sample code files (`code.filepath`) and the services they call
 * (`peer.service`), so dp maps them onto the model (traces.ts). A browser call with a `traceparent`
 * header (the live UI inspector adds one) keeps its trace ID. Two things are there on purpose:
 * statements show a closing balance a cent off the account balance (the backtracking story), and
 * the exchange-rates call reaches a provider the model does not have.
 */

import { randomBytes } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

export const DEMO_APP_PORT = 4200;
const MAX_BODY = 64 * 1024;
const MAX_TRACE_FILE = 5 * 1024 * 1024;

interface SpanSpec {
  name: string;
  kind?: "server" | "internal" | "client" | "producer";
  file?: string;
  peer?: string;
  ms: number;
  attrs?: Record<string, string | number | boolean>;
  error?: string;
  children?: SpanSpec[];
}

interface Answer {
  status: number;
  body: unknown;
  trace: SpanSpec;
}

const API = "sample_code/api";
const PAY = "sample_code/payments";
const KIND_NUM = { internal: 1, server: 2, client: 3, producer: 4 } as const;

const kv = (key: string, v: string | number | boolean) => ({
  key,
  value: typeof v === "number" ? (Number.isInteger(v) ? { intValue: String(v) } : { doubleValue: v }) : typeof v === "boolean" ? { boolValue: v } : { stringValue: v },
});

const accounts = [
  { id: "0001029", name: "Current account", balance: 1202.48, currency: "EUR" },
  { id: "0001030", name: "Savings account", balance: 8410.0, currency: "EUR" },
];

function route(method: string, url: string, body: Record<string, unknown>): Answer {
  const p = url.split("?")[0]!;
  const server = (name: string, file: string, status: number, children: SpanSpec[], ms = 4): SpanSpec => ({
    name,
    kind: "server",
    file,
    ms,
    attrs: { "http.request.method": method, "url.path": p, "http.response.status_code": status },
    children,
  });
  let m: RegExpMatchArray | null;

  if (method === "POST" && p === "/api/session") {
    const ok = Boolean(body.username) && Boolean(body.password);
    const status = ok ? 200 : 401;
    return {
      status,
      body: ok ? { customer: String(body.username), session: "s_9f2c41d07a3b", expiresIn: 900 } : { error: "Wrong customer ID or password." },
      trace: server(`POST /api/session`, `${API}/sign_in.py`, status, [
        {
          name: "verify password",
          file: `${API}/security.py`,
          ms: 38,
          error: ok ? undefined : "password does not match",
          children: [
            { name: "SELECT customer", kind: "client", peer: "database", ms: 6, attrs: { "db.system": "postgresql", "db.operation": "SELECT" } },
            { name: "SET session", kind: "client", peer: "session-cache", ms: 2, attrs: { "db.system": "redis" } },
          ],
        },
      ]),
    };
  }
  if (method === "DELETE" && p === "/api/session") return { status: 200, body: { signedOut: true }, trace: server("DELETE /api/session", `${API}/sign_in.py`, 200, []) };
  if (method === "POST" && p === "/api/password-resets") {
    return {
      status: 202,
      body: { sent: true },
      trace: server("POST /api/password-resets", `${API}/reset_password.py`, 202, [
        { name: "create reset token", file: `${API}/security.py`, ms: 5, children: [{ name: "INSERT reset", kind: "client", peer: "database", ms: 4, attrs: { "db.system": "postgresql" } }] },
        { name: "send reset e-mail", file: `${API}/email_sender.py`, ms: 3, children: [{ name: "SMTP send", kind: "client", peer: "e-mail-system", ms: 61 }] },
      ]),
    };
  }
  if (method === "GET" && p === "/api/accounts") {
    return {
      status: 200,
      body: { accounts },
      trace: server("GET /api/accounts", `${API}/accounts.py`, 200, [
        { name: "get balances", file: `${API}/mainframe_facade.py`, ms: 2, children: [{ name: "BalanceEnquiry", kind: "client", peer: "mainframe-banking-system", ms: 84, attrs: { "rpc.system": "xml-over-https" } }] },
      ]),
    };
  }
  if (method === "GET" && (m = /^\/api\/accounts\/([^/]+)\/statements$/.exec(p))) {
    const known = accounts.some((a) => a.id === m![1]);
    return {
      status: known ? 200 : 404,
      body: known
        ? {
            account: m[1],
            statements: [
              { period: "2026-10", closingBalance: "€1,202.47", file: `stmt-${m[1]}-2026-10.pdf` },
              { period: "2026-09", closingBalance: "€1,250.12", file: `stmt-${m[1]}-2026-09.pdf` },
            ],
          }
        : { error: "No such account." },
      trace: server(`GET /api/accounts/:id/statements`, `${API}/accounts.py`, known ? 200 : 404, known ? [{ name: "ListObjects statements", kind: "client", peer: "statement-store", ms: 23, attrs: { "aws.s3.bucket": "bigbank-statements" } }] : []),
    };
  }
  if (method === "GET" && (m = /^\/api\/accounts\/([^/]+)$/.exec(p))) {
    const a = accounts.find((x) => x.id === m![1]);
    return {
      status: a ? 200 : 404,
      body: a ? { ...a, available: a.balance, lastTransactions: [{ date: "2026-11-14", description: "COFFEE ROASTERS NYC", amount: -4.6 }] } : { error: "No such account." },
      trace: server("GET /api/accounts/:id", `${API}/accounts.py`, a ? 200 : 404, [
        { name: "get account", file: `${API}/mainframe_facade.py`, ms: 2, children: [{ name: "AccountEnquiry", kind: "client", peer: "mainframe-banking-system", ms: 91 }] },
      ]),
    };
  }
  if (method === "POST" && p === "/api/payments") {
    const amount = Number(String(body.amount ?? "").replace(",", "."));
    const bad = !Number.isFinite(amount) || amount <= 0;
    const held = !bad && amount > 5000;
    const status = bad ? 422 : held ? 202 : 201;
    const id = `pay_${randomBytes(3).toString("hex")}`;
    const orchestrate: SpanSpec = {
      name: "orchestrate payment",
      file: `${PAY}/orchestrator.ts`,
      ms: 3,
      children: [
        { name: "validate payment", file: `${PAY}/validator.ts`, ms: 2, error: bad ? "amount must be a positive number" : undefined },
        ...(bad
          ? []
          : [
              { name: "fraud score", file: `${PAY}/fraud-client.ts`, ms: 1, children: [{ name: "POST /score", kind: "client" as const, peer: "fraud-detection-system", ms: held ? 288 : 41, attrs: { "fraud.score": held ? 0.91 : 0.07 } }] },
              ...(held
                ? []
                : [
                    { name: "submit to mainframe", file: `${PAY}/mainframe.ts`, ms: 1, children: [{ name: "PaymentSubmit", kind: "client" as const, peer: "mainframe-banking-system", ms: 132 }] },
                    { name: "publish payment.submitted", file: `${PAY}/publisher.ts`, ms: 1, children: [{ name: "payment-events send", kind: "producer" as const, peer: "payment-events", ms: 4, attrs: { "messaging.system": "kafka" } }] },
                  ]),
            ]),
      ],
    };
    return {
      status,
      body: bad ? { error: "The amount must be a positive number." } : held ? { id, status: "held-for-review" } : { id, status: "accepted" },
      trace: server("POST /api/payments", `${PAY}/controller.ts`, status, [{ name: "GET session", kind: "client", peer: "session-cache", ms: 1, attrs: { "db.system": "redis" } }, orchestrate]),
    };
  }
  if (method === "GET" && (m = /^\/api\/exchange-rates\/([\d-]+)$/.exec(p))) {
    return {
      status: 200,
      body: { date: m[1], base: "EUR", rates: { USD: 1.088, GBP: 0.8417, CHF: 0.9412 } },
      // Not in the model: neither the endpoint nor the provider (shows as "not in the model" in the inspector).
      trace: server("GET /api/exchange-rates/:date", `${API}/rates.py`, 200, [{ name: "GET /v2/rates", kind: "client", peer: "fx-rates-provider", ms: 57 }]),
    };
  }
  return { status: 404, body: { error: "Not found." }, trace: server(`${method} ${p}`, `${API}/accounts.py`, 404, []) };
}

/** The OTLP spans for one answer, under `traceId`, starting at `startNs`. */
function spans(spec: SpanSpec, traceId: string, parentId: string | null, startNs: bigint): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (s: SpanSpec, parent: string | null, start: bigint): bigint => {
    const id = randomBytes(8).toString("hex");
    const span: Record<string, unknown> = { traceId, spanId: id, name: s.name, kind: KIND_NUM[s.kind ?? "internal"], startTimeUnixNano: String(start) };
    if (parent) span.parentSpanId = parent;
    out.push(span);
    let t = start + 300_000n; // children start 0.3 ms in
    for (const c of s.children ?? []) t = walk(c, id, t) + 200_000n;
    const end = [start + BigInt(Math.round(s.ms * 1e6)), t].reduce((a, b) => (a > b ? a : b));
    span.endTimeUnixNano = String(end);
    const attrs = { ...(s.file ? { "code.filepath": s.file } : {}), ...(s.peer ? { "peer.service": s.peer } : {}), ...(s.attrs ?? {}) };
    span.attributes = Object.entries(attrs).map(([k, v]) => kv(k, v));
    span.status = s.error ? { code: 2, message: s.error } : { code: 0 };
    return end;
  };
  walk(spec, parentId, startNs);
  return out;
}

function writeTrace(file: string, spanList: Record<string, unknown>[]): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    if (fs.statSync(file).size > MAX_TRACE_FILE) fs.writeFileSync(file, ""); // keep the demo's trace file small
  } catch {
    /* no file yet */
  }
  const doc = { resourceSpans: [{ resource: { attributes: [kv("service.name", "api-application"), kv("service.version", "demo")] }, scopeSpans: [{ scope: { name: "designperspectives-demo-app" }, spans: spanList }] }] };
  fs.appendFileSync(file, JSON.stringify(doc) + "\n");
}

const STATIC: Record<string, [string, string]> = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/app.css": ["app.css", "text/css; charset=utf-8"],
};

export interface DemoApp {
  url: string;
  tracesFile: string;
  close(): Promise<void>;
}

/** Start the demo web app. `root`: the project folder (traces go to `<root>/traces/`). */
export function startDemoApp(opts: { root: string; webDir: string; port?: number; tracesDir?: string }): Promise<DemoApp> {
  const tracesFile = path.join(opts.tracesDir ?? path.join(opts.root, "traces"), "demo-app.jsonl");
  const server = http.createServer((req, res) => {
    const url = req.url ?? "/";
    const method = req.method ?? "GET";
    const asset = STATIC[url.split("?")[0]!];
    if (method === "GET" && asset) {
      res.writeHead(200, { "Content-Type": asset[1], "Cache-Control": "no-cache" }).end(fs.readFileSync(path.join(opts.webDir, asset[0])));
      return;
    }
    if (!url.startsWith("/api/")) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
      return;
    }
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (b: Buffer) => {
      size += b.length;
      if (size > MAX_BODY) req.destroy();
      else chunks.push(b);
    });
    req.on("end", () => {
      let body: Record<string, unknown> = {};
      try {
        const parsed: unknown = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf-8")) : {};
        if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
      } catch {
        /* treated as an empty body */
      }
      const answer = route(method, url, body);
      const tp = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/.exec(String(req.headers.traceparent ?? ""));
      const traceId = tp?.[1] ?? randomBytes(16).toString("hex");
      try {
        writeTrace(tracesFile, spans(answer.trace, traceId, tp?.[2] ?? null, BigInt(Date.now()) * 1_000_000n));
      } catch (e) {
        console.error(`Demo app: could not write the trace: ${(e as Error).message}`);
      }
      res.writeHead(answer.status, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(answer.body));
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? DEMO_APP_PORT, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ url: `http://127.0.0.1:${port}/`, tracesFile, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}
