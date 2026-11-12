/**
 * FF4 harness: blocks outbound network connections during tests.
 * Allowed: loopback (127.0.0.1, ::1, localhost) and Unix sockets / named pipes (IPC, workers).
 * A test that needs real egress must go through an allow-listed port (LlmPort, CloudPort, MCP, OTLP),
 * none of which exist in Wave 0, so any non-loopback connection is a failure.
 */
import net from "node:net";
import tls from "node:tls";

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost", "0.0.0.0"]);

export class NetworkEgressBlocked extends Error {
  constructor(target: string) {
    super(`FF4: outbound network connection blocked in tests: ${target}`);
    this.name = "NetworkEgressBlocked";
  }
}

function targetOf(args: unknown[]): { host?: string; path?: string; port?: unknown } {
  // net.connect() passes Node's internal normalized-args array as the single argument.
  const flat = Array.isArray(args[0]) ? (args[0] as unknown[]) : args;
  const [a, b] = flat;
  if (typeof a === "object" && a !== null) return a as { host?: string; path?: string; port?: unknown };
  if (typeof a === "string" && Number.isNaN(Number(a))) return { path: a };
  return { port: a, host: typeof b === "string" ? b : "localhost" };
}

export function assertAllowed(args: unknown[]): void {
  const t = targetOf(args);
  if (t.path) return; // IPC socket
  const host = t.host ?? "localhost";
  if (!LOOPBACK.has(host)) throw new NetworkEgressBlocked(`${host}:${String(t.port)}`);
}

const origConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function patchedConnect(this: net.Socket, ...args: unknown[]) {
  assertAllowed(args);
  return (origConnect as (...a: unknown[]) => net.Socket).apply(this, args);
} as typeof net.Socket.prototype.connect;

const origTls = tls.connect;
(tls as { connect: unknown }).connect = function patchedTls(...args: unknown[]) {
  assertAllowed(args);
  return (origTls as (...a: unknown[]) => tls.TLSSocket)(...args);
};

const origFetch = globalThis.fetch;
globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url);
  if (!LOOPBACK.has(url.hostname.replace(/^\[|\]$/g, ""))) throw new NetworkEgressBlocked(url.host);
  return origFetch(input, init);
};
