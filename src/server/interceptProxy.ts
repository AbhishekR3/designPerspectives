/**
 * Intercept points: the network side (RUN-06).
 *
 * A point is an HTTP/1.1 listener on 127.0.0.1 that a calling service is pointed at instead of its real target.
 * This file listens, reads a message into memory when it is small enough to be paused, sends a message to the
 * target and passes through what cannot be paused. What happens to a call in between (breakpoints, edits, the
 * run log) is testSession.ts.
 *
 * Security: a point answers only requests addressed to itself on this machine (another name that resolves here
 * is refused), it forwards only to the address the session gives it (from the model, checked by
 * `checkTarget`), and it never forwards dp's own session cookie.
 */

import http from "node:http";
import https from "node:https";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { isLoopback } from "../core/hosts.js";
import type { RawMessage } from "../core/testing.js";

/** The largest request or reply body that is read into memory, so it can be paused and changed. */
export const MAX_HELD_BYTES = 1_000_000;
/** How long a point waits for the target to start answering. */
export const UPSTREAM_TIMEOUT_MS = 30_000;

const HOP_BY_HOP = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade"]);
const SESSION_COOKIE = "dp_session";

export interface Listener {
  server: http.Server;
  port: number;
  /** "http://127.0.0.1:<port>": the base URL for the caller's settings. */
  origin: string;
}

export interface Handlers {
  request(req: http.IncomingMessage, res: http.ServerResponse): void;
  upgrade(req: http.IncomingMessage, socket: Duplex, head: Buffer): void;
}

/** Start a listener on 127.0.0.1, on `port` when given (rejects with EADDRINUSE when it is taken) or on a free one. */
export function listen(port: number | null, handlers: Handlers): Promise<Listener> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => handlers.request(req, res));
    server.on("upgrade", (req, socket: Duplex, head: Buffer) => handlers.upgrade(req, socket, head));
    server.once("error", reject);
    server.listen(port ?? 0, "127.0.0.1", () => {
      const p = (server.address() as AddressInfo).port;
      server.unref(); // a point never keeps dp (or a test run) alive on its own
      resolve({ server, port: p, origin: `http://127.0.0.1:${p}` });
    });
  });
}

export function closeListener(l: Listener): Promise<void> {
  return new Promise((resolve) => {
    l.server.close(() => resolve());
    l.server.closeAllConnections();
  });
}

/** Only requests addressed to the point itself (DNS rebinding: another name pointing here). */
export function hostOk(req: http.IncomingMessage, port: number): boolean {
  const host = req.headers.host;
  if (!host) return false;
  try {
    const u = new URL(`http://${host}`);
    return isLoopback(u.hostname) && Number(u.port || 80) === port;
  } catch {
    return false;
  }
}

/** The headers of a message as [name, value] pairs, in order, as they arrived. */
export function headerPairs(msg: http.IncomingMessage): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i + 1 < msg.rawHeaders.length; i += 2) out.push([msg.rawHeaders[i]!, msg.rawHeaders[i + 1]!]);
  return out;
}

function toNode(headers: [string, string][]): http.OutgoingHttpHeaders {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of headers) {
    const had = out[k];
    out[k] = had === undefined ? v : [...(Array.isArray(had) ? had : [had]), v];
  }
  return out;
}

/** Headers for the target: no hop-by-hop headers, the target as Host, plain bodies, dp's own cookie removed. `length` null: keep the caller's Content-Length (a body that is piped). */
export function forwardHeaders(headers: [string, string][], target: URL, self: string, length: number | null): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of headers) {
    const key = k.toLowerCase();
    if (HOP_BY_HOP.has(key) || key === "host" || key === "accept-encoding") continue;
    if (key === "content-length" && length !== null) continue;
    if (key === "origin" && v === self) out.push([k, target.origin]);
    else if (key === "referer" && v.startsWith(self)) out.push([k, target.origin + v.slice(self.length)]);
    else if (key === "cookie") {
      const kept = v.split(/;\s*/).filter((c) => c && !c.startsWith(SESSION_COOKIE));
      if (kept.length) out.push([k, kept.join("; ")]);
    } else out.push([k, v]);
  }
  out.push(["Host", target.host]);
  if (length !== null && length > 0) out.push(["Content-Length", String(length)]);
  return out;
}

/** Headers for the caller: no hop-by-hop headers, a redirect to the target pointed back at the point. */
export function backHeaders(headers: [string, string][], target: URL, self: string, length: number | null): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of headers) {
    const key = k.toLowerCase();
    if (HOP_BY_HOP.has(key)) continue;
    if (key === "content-length" && length !== null) continue;
    if (key === "location" && v.startsWith(target.origin)) out.push([k, self + v.slice(target.origin.length)]);
    else out.push([k, v]);
  }
  if (length !== null) out.push(["Content-Length", String(length)]);
  return out;
}

/** Read a body into memory. `complete` false: it is longer than `limit`; `chunks` holds what was read and the stream is paused. */
export function readBody(stream: http.IncomingMessage, limit = MAX_HELD_BYTES): Promise<{ chunks: Buffer[]; complete: boolean }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const done = (complete: boolean) => {
      stream.off("data", onData);
      stream.off("end", onEnd);
      stream.off("error", reject);
      resolve({ chunks, complete });
    };
    const onData = (b: Buffer) => {
      chunks.push(b);
      size += b.length;
      if (size > limit) {
        stream.pause();
        done(false);
      }
    };
    const onEnd = () => done(true);
    stream.on("data", onData);
    stream.on("end", onEnd);
    stream.on("error", reject);
  });
}

function upstream(target: URL, opts: http.RequestOptions): http.ClientRequest {
  const mod = target.protocol === "https:" ? https : http;
  return mod.request({ protocol: target.protocol, hostname: target.hostname.replace(/^\[|\]$/g, ""), port: target.port || undefined, ...opts });
}

export class UpstreamError extends Error {
  constructor(
    readonly timedOut: boolean,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Send a request to the target and resolve with its reply once the headers are in. The body is `msg.body`, then
 * the rest of `rest` when given (a body too long to hold). Rejects with an UpstreamError.
 */
export function send(target: URL, msg: RawMessage, self: string, rest: http.IncomingMessage | null = null, timeoutMs = UPSTREAM_TIMEOUT_MS): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const headers = forwardHeaders(msg.headers, target, self, rest ? null : msg.body.length);
    let up: http.ClientRequest;
    try {
      up = upstream(target, { method: msg.method ?? "GET", path: msg.path ?? "/", headers: toNode(headers) });
    } catch (e) {
      return reject(new UpstreamError(false, (e as Error).message));
    }
    up.setTimeout(timeoutMs, () => up.destroy(new UpstreamError(true, `no answer within ${Math.round(timeoutMs / 1000)} seconds`)));
    up.on("response", resolve);
    up.on("error", (e) => reject(e instanceof UpstreamError ? e : new UpstreamError(false, e.message)));
    if (msg.body.length) up.write(msg.body);
    if (rest) {
      rest.pipe(up);
      rest.resume();
    } else up.end();
  });
}

/** Answer the caller with a whole message. */
export function reply(res: http.ServerResponse, msg: RawMessage, target: URL, self: string): void {
  if (res.destroyed || res.headersSent) return;
  res.writeHead(msg.status ?? 502, toNode(backHeaders(msg.headers, target, self, msg.body.length)));
  res.end(msg.body);
}

/** Answer the caller with a reply that is not held: its headers now, its body as it arrives. `first`: what was already read. */
export function pipeBack(res: http.ServerResponse, back: http.IncomingMessage, first: Buffer[], target: URL, self: string): void {
  if (res.destroyed) return void back.destroy();
  res.writeHead(back.statusCode ?? 502, back.statusMessage, toNode(backHeaders(headerPairs(back), target, self, null)));
  for (const b of first) res.write(b);
  back.pipe(res);
  back.resume();
  back.on("error", () => res.destroy());
}

/** A short plain-text answer from the point itself (the target could not be reached, a refused Host). */
export function plain(res: http.ServerResponse, status: number, text: string, note: string): void {
  if (res.destroyed || res.headersSent) return void res.destroy();
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "X-DP-Intercept": note }).end(text);
}

/** WebSocket and other upgrades: passed through unchanged. */
export function passUpgrade(req: http.IncomingMessage, socket: Duplex, head: Buffer, target: URL, self: string): void {
  const headers = toNode(forwardHeaders(headerPairs(req), target, self, null));
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
