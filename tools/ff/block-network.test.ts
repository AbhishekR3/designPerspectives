import net from "node:net";
import { describe, expect, it } from "vitest";
import { NetworkEgressBlocked } from "./block-network.js";

describe("FF4 network egress harness", () => {
  it("blocks fetch to a public host", async () => {
    await expect(fetch("https://example.com/")).rejects.toBeInstanceOf(NetworkEgressBlocked);
  });
  it("blocks raw TCP to a public host", () => {
    expect(() => net.connect({ host: "93.184.215.14", port: 443 })).toThrow(NetworkEgressBlocked);
  });
  it("allows loopback connections", async () => {
    const server = net.createServer((s) => s.end("ok"));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as net.AddressInfo).port;
    const data = await new Promise<string>((resolve, reject) => {
      const c = net.connect({ host: "127.0.0.1", port }, () => undefined);
      c.on("data", (d) => resolve(d.toString()));
      c.on("error", reject);
    });
    server.close();
    expect(data).toBe("ok");
  });
});
