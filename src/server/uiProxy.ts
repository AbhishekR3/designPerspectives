/**
 * Live UI proxy: serves a running web app on its own local port so dp can frame it and see clicks.
 *
 * A browser does not let a page read clicks inside a frame from another origin, and many apps refuse
 * to be framed at all. So for each app origin dp starts one listener on 127.0.0.1 (a free port) that
 * forwards every request to that origin and only that origin, removes the headers that forbid
 * framing (X-Frame-Options, Content-Security-Policy), and adds INSPECT_SCRIPT to HTML pages. A port
 * per app (not a path under dp's own port) keeps the app's absolute paths ("/static/app.js")
 * working, and keeps the app in another origin than dp, so the app's scripts cannot call dp's API.
 *
 * The target is never taken from a request: it is the live UI address stored on an element
 * (`dp.ui.url`), and it must be on this machine unless its host was allowed with --allow-ui-host.
 * dp's own session cookie is removed from forwarded requests (cookies are shared across ports).
 */

import http from "node:http";
import https from "node:https";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { ModelError } from "../core/ops.js";
import { SESSION_COOKIE } from "./auth.js";
import { INSPECT_SCRIPT, INSPECT_SCRIPT_PATH } from "./inspectScript.js";

/** Largest HTML page the proxy reads in full to add the script; larger pages pass through unchanged. */
export const MAX_HTML_BYTES = 10 * 1024 * 1024;

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
export const isLoopback = (hostname: string) => LOOPBACK.has(hostname) || /^127\.\d+\.\d+\.\d+$/.test(hostname) || hostname.endsWith(".localhost");

/** Request headers that describe one connection, not the request. */
const HOP_BY_HOP = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade", "host"]);
/** Response headers dropped: connection headers, and the ones that would stop dp framing the app. */
const DROP_BACK = new Set(["connection", "keep-alive", "transfer-encoding", "x-frame-options", "content-security-policy", "content-security-policy-report-only"]);

/** Check a live UI address: http(s), on this machine or on an allowed host. */
export function checkUiTarget(address: string, allowHosts: string[] = []): URL {
  let u: URL;
  try {
    u = new URL(address);
  } catch {
    throw new ModelError(`"${address}" is not a URL.`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new ModelError("The live UI address must start with http:// or https://.");
  const allowed = isLoopback(u.hostname) || allowHosts.map((h) => h.toLowerCase()).includes(u.hostname.toLowerCase());
  if (!allowed) throw new ModelError(`dp opens live UIs on this machine only. To open ${u.host}, start dp serve with --allow-ui-host ${u.hostname}.`);
  return u;
}

interface Listener {
  origin: string;
  server: http.Server;
}

export class UiProxies {
  private listeners = new Map<string, Promise<Listener>>();

  constructor(private readonly opts: { allowHosts?: string[]; bindHost?: string } = {}) {}

  /** The proxy URL that shows `address` (starting a listener for its origin on first use). */
  async urlFor(address: string): Promise<string> {
    const target = checkUiTarget(address, this.opts.allowHosts);
    let l = this.listeners.get(target.origin);
    if (!l) {
      l = startListener(target, this.opts.bindHost ?? "127.0.0.1");
      this.listeners.set(target.origin, l);
      l.catch(() => this.listeners.delete(target.origin));
    }
    const { origin } = await l;
    return origin + target.pathname + target.search + target.hash;
  }

  async close(): Promise<void> {
    const all = await Promise.allSettled([...this.listeners.values()]);
    this.listeners.clear();
    await Promise.all(all.map((r) => (r.status === "fulfilled" ? new Promise<void>((res) => r.value.server.close(() => res())) : undefined)));
  }
}

function startListener(target: URL, bindHost: string): Promise<Listener> {
  return new Promise((resolve, reject) => {
    let self = "";
    const server = http.createServer((req, res) => handle(req, res, target, self));
    server.on("upgrade", (req, socket: Duplex, head: Buffer) => upgrade(req, socket, head, target, self));
    server.on("error", reject);
    server.listen(0, bindHost, () => {
      const port = (server.address() as AddressInfo).port;
      self = `http://${bindHost.includes(":") ? `[${bindHost}]` : bindHost}:${port}`;
      server.unref(); // the proxy never keeps dp (or a test run) alive on its own
      resolve({ origin: self, server });
    });
  });
}

/** Only requests addressed to the proxy itself (DNS rebinding: another name pointing here). */
function hostOk(req: http.IncomingMessage, self: string): boolean {
  const host = req.headers.host;
  if (!host) return false;
  try {
    const u = new URL(`http://${host}`);
    return isLoopback(u.hostname) && u.port === new URL(self).port;
  } catch {
    return false;
  }
}

function forwardHeaders(req: http.IncomingMessage, target: URL, self: string): http.OutgoingHttpHeaders {
  const out: http.OutgoingHttpHeaders = {};
  for (const [k, v] of Object.entries(req.headers)) if (v !== undefined && !HOP_BY_HOP.has(k)) out[k] = v;
  out.host = target.host;
  delete out["accept-encoding"]; // plain bodies, so the script can be added to HTML
  if (out.origin === self) out.origin = target.origin;
  if (typeof out.referer === "string" && out.referer.startsWith(self)) out.referer = target.origin + out.referer.slice(self.length);
  if (typeof out.cookie === "string") {
    const kept = out.cookie.split(/;\s*/).filter((c) => c && !c.startsWith(SESSION_COOKIE));
    if (kept.length) out.cookie = kept.join("; ");
    else delete out.cookie;
  }
  return out;
}

function backHeaders(res: http.IncomingMessage, target: URL, self: string): http.OutgoingHttpHeaders {
  const out: http.OutgoingHttpHeaders = {};
  for (const [k, v] of Object.entries(res.headers)) if (v !== undefined && !DROP_BACK.has(k)) out[k] = v;
  if (typeof out.location === "string" && out.location.startsWith(target.origin)) out.location = self + out.location.slice(target.origin.length);
  const cookies = res.headers["set-cookie"];
  // The proxy speaks plain HTTP on 127.0.0.1: a cookie bound to the app's domain or to HTTPS would be dropped.
  if (cookies) out["set-cookie"] = cookies.map((c) => c.replace(/;\s*domain=[^;]*/gi, "").replace(/;\s*secure(?=;|$)/gi, "").replace(/samesite=none/gi, "SameSite=Lax"));
  return out;
}

function upstream(target: URL, opts: http.RequestOptions): http.ClientRequest {
  const mod = target.protocol === "https:" ? https : http;
  return mod.request({ protocol: target.protocol, hostname: target.hostname.replace(/^\[|\]$/g, ""), port: target.port || undefined, ...opts });
}

function addScript(html: string): string {
  const tag = `<script src="${INSPECT_SCRIPT_PATH}"></script>`;
  const m = /<head(\s[^>]*)?>/i.exec(html) ?? /<html(\s[^>]*)?>/i.exec(html);
  return m ? html.slice(0, m.index + m[0].length) + tag + html.slice(m.index + m[0].length) : tag + html;
}

function handle(req: http.IncomingMessage, res: http.ServerResponse, target: URL, self: string): void {
  if (!hostOk(req, self)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" }).end("This proxy only answers requests addressed to it on this machine.");
    return;
  }
  if (req.url === INSPECT_SCRIPT_PATH) {
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" }).end(INSPECT_SCRIPT);
    return;
  }
  const up = upstream(target, { method: req.method, path: req.url, headers: forwardHeaders(req, target, self) });
  up.on("response", (back) => {
    const headers = backHeaders(back, target, self);
    const type = String(back.headers["content-type"] ?? "");
    const encoded = back.headers["content-encoding"] && back.headers["content-encoding"] !== "identity";
    const length = Number(back.headers["content-length"] ?? 0);
    if (!/text\/html/i.test(type) || encoded || req.method === "HEAD" || length > MAX_HTML_BYTES) {
      res.writeHead(back.statusCode ?? 502, back.statusMessage, headers);
      back.pipe(res);
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    back.on("data", (b: Buffer) => {
      size += b.length;
      chunks.push(b);
    });
    back.on("end", () => {
      let body = Buffer.concat(chunks);
      // latin1 maps each byte to one character and back, so a page in any encoding keeps its bytes.
      if (size <= MAX_HTML_BYTES) body = Buffer.from(addScript(body.toString("latin1")), "latin1");
      delete headers["content-length"];
      headers["content-length"] = String(body.length);
      headers["cache-control"] = "no-store"; // a cached copy without the script would not report clicks
      res.writeHead(back.statusCode ?? 502, back.statusMessage, headers).end(body);
    });
    back.on("error", () => res.destroy());
  });
  up.on("error", (e) => {
    if (res.headersSent) return res.destroy();
    res
      .writeHead(502, { "Content-Type": "text/html; charset=utf-8" })
      .end(
        `<!doctype html><meta charset="utf-8"><body style="font:14px system-ui;padding:24px;color:#e6e8eb;background:#121417"><h3>dp could not reach ${escapeHtml(target.origin)}</h3><p>Is the app running? (${escapeHtml(e.message)})</p></body>`,
      );
  });
  req.pipe(up);
}

/** WebSocket and other upgrades (e.g. a dev server's hot reload): passed through unchanged. */
function upgrade(req: http.IncomingMessage, socket: Duplex, head: Buffer, target: URL, self: string): void {
  if (!hostOk(req, self)) return void socket.destroy();
  const headers = forwardHeaders(req, target, self);
  headers.connection = "Upgrade";
  headers.upgrade = req.headers.upgrade ?? "websocket";
  const up = upstream(target, { method: req.method, path: req.url, headers });
  up.on("upgrade", (back, upSocket, upHead) => {
    const lines = [`HTTP/1.1 ${back.statusCode ?? 101} ${back.statusMessage ?? "Switching Protocols"}`];
    for (let i = 0; i < back.rawHeaders.length; i += 2) lines.push(`${back.rawHeaders[i]}: ${back.rawHeaders[i + 1]}`);
    socket.write(lines.join("\r\n") + "\r\n\r\n");
    if (upHead.length) socket.write(upHead);
    if (head.length) upSocket.write(head);
    upSocket.pipe(socket).pipe(upSocket);
    upSocket.on("error", () => socket.destroy());
    socket.on("error", () => upSocket.destroy());
  });
  up.on("response", (back) => socket.end(`HTTP/1.1 ${back.statusCode} ${back.statusMessage}\r\n\r\n`));
  up.on("error", () => socket.destroy());
  up.end();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
