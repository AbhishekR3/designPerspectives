import { describe, expect, it } from "vitest";
import type { Exporter, ExportInput } from "../ports.js";
import { contractSampleModel } from "./sample-model.js";

/** Contract suite for Exporter plug-ins. `input` should supply laid-out views when the exporter needs them. */
export function runExporterContract(make: () => Exporter, input: () => Promise<ExportInput> | ExportInput): void {
  describe(`Exporter contract: ${make().format}`, () => {
    it("produces at least one non-empty file", async () => {
      const files = make().export(await input());
      expect(files.length).toBeGreaterThan(0);
      for (const f of files) expect(f.content.length).toBeGreaterThan(0);
    });
    it("is deterministic", async () => {
      const i = await input();
      expect(make().export(i)).toEqual(make().export(i));
    });
    it("uses LF line endings and relative POSIX paths", async () => {
      for (const f of make().export(await input())) {
        expect(f.content.includes("\r")).toBe(false);
        expect(f.path.startsWith("/")).toBe(false);
        expect(f.path.includes("\\")).toBe(false);
      }
    });
    it("mentions every element title of the sample model at least once (no silent drops)", async () => {
      const i = await input();
      const all = make().export(i).map((f) => f.content).join("\n");
      const titles = make().needsLayout
        ? i.views.flatMap((v) => v.nodes.map((n) => n.title))
        : contractSampleModel().elements.map((e) => e.title);
      for (const t of new Set(titles)) expect(all).toContain(t);
    });
  });
}
