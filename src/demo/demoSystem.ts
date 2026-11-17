/**
 * The demo system: five tiny services that run for real when `dp serve --demo` starts (and only then).
 * Every hop is a real HTTP call made with `fetch`; nothing is faked inside one process.
 *
 *   web        4200  the Single-Page Application's page (demo/web-app/) and `GET /config.json`
 *   api        4201  API Application: sign-in and accounts; asks the mainframe for balances
 *   payments   4202  Payments Service: takes a payment and asks the fraud service for a score
 *   mainframe  4203  Mainframe Banking System: balances
 *   fraud      4204  Fraud Detection System: scores a payment
 *
 * The page and the services ask `route(caller, target)` where to send each call. dp passes the base URL of
 * an open intercept point (System Testing mode), so opening a point takes effect at once with no setting
 * to change. When `route` is absent or answers null the call goes straight to the target. In a real system
 * a person points the caller's base URL at the point instead. Ports are 127.0.0.1 only, and every server
 * is unref'd so it never keeps dp alive. The data is made up.
 */

import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

export type DemoService = "web" | "api" | "payments" | "mainframe" | "fraud";

export const DEMO_PORTS: Record<DemoService, number> = { web: 4200, api: 4201, payments: 4202, mainframe: 4203, fraud: 4204 };

export interface DemoSystemOptions {
  /** The folder with index.html, app.js and app.css (demo/web-app). */
  webDir: string;
  /** Ports to use; 0 is a free port. Default: DEMO_PORTS. */
  ports?: Partial<Record<DemoService, number>>;
  /** A base URL to call instead of the target's own address (an open intercept point), or null for a direct call. */
  route?: (callerId: string, targetElementId: string) => string | null;
}

export interface DemoSystem {
  urls: Record<DemoService, string>;
  close(): Promise<void>;
}

const MAX_BODY = 64 * 1024;
const CALL_TIMEOUT_MS = 5000;
const ORDER: DemoService[] = ["web", "api", "payments", "mainframe", "fraud"];

interface Reply {
  status: number;
  body: unknown;
}
type Handler = (req: { method: string; path: string; body: Record<string, unknown> }) => Promise<Reply> | Reply;

const STATIC: Record<string, { file: string; type: string }> = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/index.html": { file: "index.html", type: "text/html; charset=utf-8" },
  "/app.js": { file: "app.js", type: "text/javascript; charset=utf-8" },
  "/app.css": { file: "app.css", type: "text/css; charset=utf-8" },
};

const ACCOUNTS = [
  { id: "0001029", name: "Current account" },
  { id: "0001030", name: "Savings account" },
];
const BALANCES: Record<string, number> = { "0001029": 1202.48, "0001030": 8410 };

const trimSlash = (u: string) => u.replace(/\/+$/, "");

/** Read a JSON body of at most 64 KB (a larger one is read and thrown away). Resolves null when it is too large: the caller answers 413. */
function readBody(req: http.IncomingMessage): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (b: Buffer) => {
      size += b.length;
      if (size <= MAX_BODY) chunks.push(b);
    });
    req.on("end", () => {
      if (size > MAX_BODY) return resolve(null);
      try {
        const v: unknown = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf-8")) : {};
        resolve(v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

/** One real HTTP call to another demo service. Throws with a short reason when it fails or is not 200. */
async function callJson(url: string, init: { method: string; body?: unknown }): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method,
      headers: init.body === undefined ? {} : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
  } catch (e) {
    throw new Error(`${init.method} ${url} failed: ${(e as Error).message}`, { cause: e });
  }
  if (res.status !== 200) throw new Error(`${init.method} ${url} answered ${res.status}`);
  return res.json();
}

function listen(server: http.Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      server.unref();
      resolve((server.address() as AddressInfo).port);
    });
  });
}

function makeServer(handler: Handler, opts: { cors: boolean }): http.Server {
  return http.createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...(opts.cors ? { "Access-Control-Allow-Origin": "*" } : {}) });
      res.end(JSON.stringify(body));
    };
    const method = req.method ?? "GET";
    if (opts.cors && method === "OPTIONS") {
      res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
      res.end();
      return;
    }
    void (async () => {
      const body = await readBody(req);
      if (body === null) return send(413, { error: "The request is too large" });
      const pathname = (req.url ?? "/").split("?")[0]!;
      try {
        const r = await handler({ method, path: pathname, body });
        send(r.status, r.body);
      } catch (e) {
        send(500, { error: (e as Error).message });
      }
    })();
  });
}

const notFound: Reply = { status: 404, body: { error: "Not found" } };

export async function startDemoSystem(opts: DemoSystemOptions): Promise<DemoSystem> {
  const ports = { ...DEMO_PORTS, ...opts.ports };
  const urls = {} as Record<DemoService, string>;
  const where = (caller: string, target: string, direct: DemoService) => trimSlash(opts.route?.(caller, target) ?? urls[direct]);

  const mainframe: Handler = ({ method, path: p }) => {
    const m = /^\/accounts\/([^/]+)\/balance$/.exec(p);
    if (method === "GET" && m) {
      const balance = BALANCES[m[1]!];
      return balance === undefined ? notFound : { status: 200, body: { accountId: m[1], balance, currency: "EUR" } };
    }
    return notFound;
  };

  const fraud: Handler = ({ method, path: p, body }) => {
    if (method === "POST" && p === "/score") return { status: 200, body: { score: Number(body.amount) > 5000 ? 85 : 12 } };
    return notFound;
  };

  const balanceOf = async (id: string) => {
    const base = where("api-application", "mainframe-banking-system", "mainframe");
    return (await callJson(`${base}/accounts/${encodeURIComponent(id)}/balance`, { method: "GET" })) as { balance: number; currency: string };
  };
  const mainframeDown = (e: unknown): Reply => ({ status: 502, body: { error: "The mainframe did not answer", detail: (e as Error).message } });

  const api: Handler = async ({ method, path: p, body }) => {
    if (method === "POST" && p === "/api/session") {
      if (body.password === "wrong") return { status: 401, body: { error: "Wrong customer ID or password." } };
      return { status: 200, body: { user: String(body.user ?? ""), sessionToken: "demo-session" } };
    }
    if (method === "DELETE" && p === "/api/session") return { status: 200, body: { ok: true } };
    if (method === "GET" && p === "/api/accounts") {
      try {
        const accounts = [];
        for (const a of ACCOUNTS) {
          const b = await balanceOf(a.id);
          accounts.push({ ...a, balance: b.balance, currency: b.currency });
        }
        return { status: 200, body: { accounts } };
      } catch (e) {
        return mainframeDown(e);
      }
    }
    const m = /^\/api\/accounts\/([^/]+)$/.exec(p);
    if (method === "GET" && m) {
      const a = ACCOUNTS.find((x) => x.id === m[1]);
      if (!a) return notFound;
      try {
        const b = await balanceOf(a.id);
        return { status: 200, body: { ...a, balance: b.balance, currency: b.currency } };
      } catch (e) {
        return mainframeDown(e);
      }
    }
    return notFound;
  };

  const made = new Map<string, string>();
  let counter = 0;
  const payments: Handler = async ({ method, path: p, body }) => {
    if (method === "POST" && p === "/api/payments") {
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) return { status: 422, body: { error: "The amount must be a number above zero." } };
      let score: number;
      try {
        const base = where("payments-service", "fraud-detection-system", "fraud");
        const r = (await callJson(`${base}/score`, { method: "POST", body: { amount, currency: body.currency, toIban: body.toIban } })) as { score: number };
        score = Number(r.score);
      } catch (e) {
        return { status: 503, body: { error: "The fraud check did not answer", detail: (e as Error).message } };
      }
      const id = `pay-${++counter}`;
      const status = score >= 70 ? "held-for-review" : "accepted";
      made.set(id, status);
      return { status: score >= 70 ? 202 : 201, body: { id, status, score } };
    }
    const m = /^\/api\/payments\/([^/]+)$/.exec(p);
    if (method === "GET" && m) {
      const status = made.get(m[1]!);
      return status === undefined ? notFound : { status: 200, body: { id: m[1], status } };
    }
    return notFound;
  };

  /** The page and its address book. Static files are read on each request, so an edit shows at once. */
  const web = http.createServer((req, res) => {
    const pathname = (req.url ?? "/").split("?")[0]!;
    if (req.method !== "GET") {
      res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Not found" }));
      return;
    }
    if (pathname === "/config.json") {
      const config = { api: where("single-page-application", "api-application", "api"), payments: where("single-page-application", "payments-service", "payments") };
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(config));
      return;
    }
    const f = STATIC[pathname];
    if (f) {
      try {
        res.writeHead(200, { "Content-Type": f.type, "Cache-Control": "no-store" }).end(fs.readFileSync(path.join(opts.webDir, f.file)));
        return;
      } catch {
        // Falls through to the 404 below.
      }
    }
    res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Not found" }));
  });

  const servers: Record<DemoService, http.Server> = {
    web,
    api: makeServer(api, { cors: true }),
    payments: makeServer(payments, { cors: true }),
    mainframe: makeServer(mainframe, { cors: false }),
    fraud: makeServer(fraud, { cors: false }),
  };

  const started: http.Server[] = [];
  const closeAll = () =>
    Promise.all(
      started.map(
        (s) =>
          new Promise<void>((done) => {
            s.close(() => done());
            s.closeAllConnections();
          }),
      ),
    ).then(() => undefined);

  try {
    for (const name of ORDER) {
      const port = await listen(servers[name], ports[name]);
      started.push(servers[name]);
      urls[name] = `http://127.0.0.1:${port}`;
    }
  } catch (e) {
    await closeAll();
    throw e;
  }
  return { urls, close: closeAll };
}
