import { execFileSync } from "node:child_process";
import dgram from "node:dgram";
import net from "node:net";
import { Worker } from "node:worker_threads";
import { describe, expect, it } from "vitest";

// Vitest loads its own copy of the harness module, so errors are matched by name, not by class identity.
const BLOCKED = "NetworkEgressBlocked";

describe("FF4 network egress harness", () => {
  it("blocks fetch to a public host", async () => {
    await expect(fetch("https://example.com/")).rejects.toMatchObject({ name: BLOCKED });
  });

  it("blocks raw TCP to a public host", () => {
    expect(() => net.connect({ host: "93.184.215.14", port: 443 })).toThrow(/^FF4: outbound network/);
  });

  it("blocks UDP to a public host", () => {
    const s = dgram.createSocket("udp4");
    try {
      expect(() => s.send(Buffer.from("x"), 53, "8.8.8.8")).toThrow(/^FF4: outbound network/);
    } finally {
      s.close();
    }
  });

  it("blocks fetch inside a worker thread (workers inherit --import)", async () => {
    const code = `const { parentPort } = require("node:worker_threads");
      fetch("https://example.com/").then(() => parentPort.postMessage("sent"), (e) => parentPort.postMessage(e.name));`;
    const result = await new Promise<string>((resolve, reject) => {
      const w = new Worker(code, { eval: true });
      w.once("message", (m: string) => {
        resolve(m);
        void w.terminate();
      });
      w.once("error", reject);
    });
    expect(result).toBe(BLOCKED);
  });

  it("blocks fetch inside a child process (NODE_OPTIONS)", () => {
    const out = execFileSync(process.execPath, ["-e", 'fetch("https://example.com/").then(() => console.log("sent"), (e) => console.log(e.name))'], {
      encoding: "utf8",
    });
    expect(out.trim()).toBe(BLOCKED);
  });

  it("allows loopback connections", async () => {
    const server = net.createServer((s) => s.end("ok"));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as net.AddressInfo).port;
    const data = await new Promise<string>((resolve, reject) => {
      const c = net.connect({ host: "127.0.0.1", port });
      c.on("data", (d) => resolve(d.toString()));
      c.on("error", reject);
    });
    server.close();
    expect(data).toBe("ok");
  });
});
