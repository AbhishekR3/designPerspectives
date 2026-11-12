/**
 * Contract suite every ModelPort implementation must pass (spec file 08 §1 "Contract").
 * Usage in a plug-in test file: `runModelPortContract(() => new MyAdapter())`.
 */
import { describe, expect, it } from "vitest";
import { relationshipIdOf, sortModel } from "../model.js";
import type { Model } from "../model.js";
import type { ModelPort } from "../ports.js";
import { hasErrors } from "../diagnostics.js";
import { contractSampleModel } from "./sample-model.js";

function semantic(m: Model) {
  const s = sortModel(m);
  return {
    elements: s.elements.map((e) => ({ ...e, tags: e.tags ? [...e.tags].sort() : undefined })),
    relationships: s.relationships.map((r) => ({ id: relationshipIdOf(r), label: r.label, technology: r.technology })),
    deploymentNodes: s.deploymentNodes,
    deploymentInstances: s.deploymentInstances,
    views: s.views.map((v) => ({ id: v.id, type: v.type, title: v.title, scope: v.scope })),
  };
}

export function runModelPortContract(make: () => ModelPort, sample: () => Model = contractSampleModel): void {
  describe(`ModelPort contract: ${make().id}`, () => {
    it("print → load returns the same model without errors", async () => {
      const port = make();
      const files = port.print(sample());
      const { model, diagnostics } = await port.load(files);
      expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      expect(semantic(model)).toEqual(semantic(sample()));
    });

    it("print is deterministic and canonical (LF, trailing newline)", () => {
      const port = make();
      const a = port.print(sample());
      const b = port.print(sortModel(sample()));
      expect(a).toEqual(b);
      for (const f of a) {
        expect(f.content.endsWith("\n")).toBe(true);
        expect(f.content.includes("\r")).toBe(false);
        expect(f.path.endsWith(port.fileExtension)).toBe(true);
      }
    });

    it("load → print → load → print is a fixed point (FF6 at port level)", async () => {
      const port = make();
      const first = port.print(sample());
      const reloaded = await port.load(first);
      expect(port.print(reloaded.model)).toEqual(first);
    });

    it("reports syntax errors as diagnostics with a file position instead of throwing", async () => {
      const port = make();
      const files = port.print(sample());
      const broken = files.map((f, i) => (i === 0 ? { ...f, content: f.content + "\nmodel {{{ \n" } : f));
      const { diagnostics } = await port.load(broken);
      expect(hasErrors(diagnostics)).toBe(true);
      const err = diagnostics.find((d) => d.severity === "error");
      expect(err?.file).toBeDefined();
      expect(err?.line).toBeGreaterThan(0);
    });

    it("lays out every view deterministically with positive sizes", async () => {
      const port = make();
      const model = sample();
      for (const v of model.views) {
        const a = await port.layoutView(model, v.id);
        const b = await port.layoutView(model, v.id);
        expect(a).toEqual(b);
        expect(a.title).toBe(v.title);
        expect(a.nodes.length).toBeGreaterThan(0);
        for (const n of a.nodes) {
          expect(n.width).toBeGreaterThan(0);
          expect(n.height).toBeGreaterThan(0);
        }
      }
    });
  });
}
