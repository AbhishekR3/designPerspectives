// FF4 harness: blocks outbound network traffic during tests (spec file 01 §6).
// Loaded with `node --import` into every test process (vitest `execArgv`), inherited by worker threads
// (workers inherit execArgv) and by child processes (NODE_OPTIONS, set in vitest.config.ts).
// Allowed: loopback TCP/UDP and IPC sockets. Wave 0 has no allow-listed egress port (LlmPort, CloudPort, MCP, OTLP).
import dgram from "node:dgram";
import { createRequire, syncBuiltinESMExports } from "node:module";
import net from "node:net";
import tls from "node:tls";
import { fileURLToPath, pathToFileURL } from "node:url";

const SELF = fileURLToPath(import.meta.url);

const MARK = Symbol.for("designperspectives.ff4.installed");
const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost", "0.0.0.0", "::"]);

export class NetworkEgressBlocked extends Error {
  constructor(target) {
    super(`FF4: outbound network connection blocked in tests: ${target}`);
    this.name = "NetworkEgressBlocked";
  }
}

function targetOf(args) {
  // net.connect() passes Node's internal normalized-args array as the single argument.
  const flat = Array.isArray(args[0]) ? args[0] : args;
  const [a, b] = flat;
  if (typeof a === "object" && a !== null) return a;
  if (typeof a === "string" && Number.isNaN(Number(a))) return { path: a };
  return { port: a, host: typeof b === "string" ? b : "localhost" };
}

export function assertAllowed(args) {
  const t = targetOf(args);
  if (t.path) return; // IPC socket / named pipe
  const host = t.host ?? "localhost";
  if (!LOOPBACK.has(host)) throw new NetworkEgressBlocked(`${host}:${String(t.port)}`);
}

function assertUdpAllowed(args) {
  // send(msg, [offset, length,] port, address, cb): the address is the first string after the message.
  const address = args.slice(1).find((x) => typeof x === "string") ?? "localhost";
  if (!LOOPBACK.has(address)) throw new NetworkEgressBlocked(`udp ${address}`);
}

/**
 * Worker threads inherit `--import` in execArgv but do not run it, so every Worker is wrapped:
 * the harness is loaded first, then the original script.
 */
function patchWorkers() {
  const wt = createRequire(import.meta.url)("node:worker_threads");
  const Orig = wt.Worker;
  const preload = `require(${JSON.stringify(SELF)});`;
  class GuardedWorker extends Orig {
    constructor(filename, options = {}) {
      if (options.eval) {
        super(`${preload}\n${filename}`, options);
        return;
      }
      const href = filename instanceof URL ? filename.href : pathToFileURL(String(filename)).href;
      super(`${preload}\nimport(${JSON.stringify(href)});`, { ...options, eval: true });
    }
  }
  wt.Worker = GuardedWorker;
  syncBuiltinESMExports();
}

function install() {
  if (globalThis[MARK]) return;
  globalThis[MARK] = true;

  const origConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function patchedConnect(...args) {
    assertAllowed(args);
    return origConnect.apply(this, args);
  };

  const origTls = tls.connect;
  tls.connect = function patchedTls(...args) {
    assertAllowed(args);
    return origTls(...args);
  };

  const origSend = dgram.Socket.prototype.send;
  dgram.Socket.prototype.send = function patchedSend(...args) {
    assertUdpAllowed(args);
    return origSend.apply(this, args);
  };

  const origFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url);
    if (!LOOPBACK.has(url.hostname.replace(/^\[|\]$/g, ""))) throw new NetworkEgressBlocked(url.host);
    return origFetch(input, init);
  };
}

install();
patchWorkersOnce();

function patchWorkersOnce() {
  const key = Symbol.for("designperspectives.ff4.workers");
  if (globalThis[key]) return;
  globalThis[key] = true;
  patchWorkers();
}
