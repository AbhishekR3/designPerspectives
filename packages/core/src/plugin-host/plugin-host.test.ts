import { describe, expect, it } from "vitest";
import type { PluginModule } from "@designperspectives/contracts";
import { CONTRACTS_VERSION } from "@designperspectives/contracts";
import { PluginHost } from "./index.js";

const exporter = (format: string) => ({ format, description: format, needsLayout: false, export: () => [{ path: `${format}.txt`, content: "x\n" }] });
const plugin = (id: string, extra: Partial<PluginModule["manifest"]> = {}, exporters = [exporter(id)]): PluginModule => ({
  manifest: { id, version: "1.0.0", contracts: `^${CONTRACTS_VERSION}`, provides: ["Exporter"], ...extra },
  exporters,
});

describe("PluginHost", () => {
  it("registers a compatible plug-in and exposes its exporter", () => {
    const h = new PluginHost();
    expect(h.register(plugin("a"))).toBe(true);
    expect(h.exporter("a")?.format).toBe("a");
    expect(h.exportFormats()).toEqual(["a"]);
    expect(h.diagnostics()).toEqual([]);
  });
  it("rejects an incompatible contract version", () => {
    const h = new PluginHost();
    expect(h.register(plugin("b", { contracts: "^99.0.0" }))).toBe(false);
    expect(h.diagnostics()[0]?.code).toBe("plugin/rejected");
    expect(h.exporter("b")).toBeUndefined();
  });
  it("rejects a plug-in that declares a port it does not export", () => {
    const h = new PluginHost();
    expect(h.register(plugin("c", {}, []))).toBe(false);
  });
  it("rejects worker isolation for non-job plug-ins", () => {
    const h = new PluginHost();
    expect(h.register(plugin("d", { isolation: "worker" }))).toBe(false);
  });
  it("keeps the first provider on conflicts and warns", () => {
    const h = new PluginHost();
    h.register(plugin("e1", {}, [exporter("same")]));
    h.register(plugin("e2", {}, [exporter("same")]));
    expect(h.diagnostics().map((d) => d.code)).toEqual(["plugin/conflict"]);
    expect(h.list().map((p) => p.manifest.id)).toEqual(["e1", "e2"]);
  });
  it("reports a module that cannot be loaded", async () => {
    const h = new PluginHost();
    expect(await h.load("/nonexistent/plugin.js")).toBe(false);
    expect(h.diagnostics()[0]?.code).toBe("plugin/load-failed");
  });
});
