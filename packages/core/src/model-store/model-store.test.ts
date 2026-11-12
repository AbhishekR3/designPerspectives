import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Model, ModelPort, SourceFile } from "@designperspectives/contracts";
import { sortModel } from "@designperspectives/contracts";
import { contractSampleModel } from "@designperspectives/contracts/testing";
import { emptySidecarSet } from "../sidecars/index.js";
import { ModelStore, readArchitectureFiles } from "./index.js";

/** In-memory ModelPort storing the model as canonical JSON — lets the store be tested without LikeC4. */
const jsonPort: ModelPort = {
  id: "json",
  fileExtension: ".json",
  async load(files: readonly SourceFile[]) {
    const f = files.find((x) => x.path === "model/model.json");
    return { model: f ? (JSON.parse(f.content) as Model) : { elements: [], relationships: [], deploymentNodes: [], deploymentInstances: [], views: [] }, diagnostics: [] };
  },
  print(model: Model) {
    return [{ path: "model/model.json", content: JSON.stringify(sortModel(model), null, 2) + "\n" }];
  },
  async layoutView() {
    throw new Error("not used");
  },
};

function state() {
  const sidecars = emptySidecarSet();
  sidecars.elements["ibs.api"] = { id: "ibs.api", owners: ["team-online"] };
  sidecars.relationships = [{ id: "ibs.spa->ibs.api#calls", mode: "sync", protocol: "JSON/HTTPS" }];
  sidecars.layouts["containers"] = { view: "containers", nodes: { "ibs.api": { x: 10, y: 20 }, "ibs.api.security": { x: 1, y: 2 } } };
  return { model: contractSampleModel(), sidecars };
}

describe("ModelStore", () => {
  it("save → load → save writes nothing the second time (FF6)", async () => {
    const root = await mkdtemp(join(tmpdir(), "dp-store-"));
    const store = new ModelStore(jsonPort);
    const first = await store.save(root, [], state());
    expect(first.written).toContain("model/model.json");
    const loaded = await store.load(root);
    expect(loaded.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const plan = store.plan(loaded.files, loaded);
    expect(plan).toEqual({ write: [], remove: [] });
  });

  it("removes owned files that are no longer produced but keeps unknown files", () => {
    const store = new ModelStore(jsonPort);
    const s = state();
    const previous = [...store.print(s), { path: "sidecars/elements/gone.yaml", content: "id: gone\n" }, { path: "README.md", content: "x\n" }];
    expect(store.plan(previous, s).remove).toEqual(["sidecars/elements/gone.yaml"]);
  });

  it("renames an element and its descendants across model and sidecars", async () => {
    const store = new ModelStore(jsonPort);
    const { state: next, diagnostics } = store.renameElement(state(), "ibs.api", "ibs.backend");
    expect(diagnostics).toEqual([]);
    expect(next.model.elements.map((e) => e.id)).toContain("ibs.backend.security");
    expect(next.model.relationships.some((r) => r.target === "ibs.backend")).toBe(true);
    expect(next.model.views.find((v) => v.id === "api-components")?.scope).toBe("ibs.backend");
    expect(next.model.deploymentInstances[0]?.of).toBe("ibs.backend");
    expect(Object.keys(next.sidecars.elements)).toEqual(["ibs.backend"]);
    expect(next.sidecars.relationships[0]?.id).toBe("ibs.spa->ibs.backend#calls");
    expect(Object.keys(next.sidecars.layouts["containers"]!.nodes).sort()).toEqual(["ibs.backend", "ibs.backend.security"]);
  });

  it("refuses a rename onto an existing id or an invalid id", () => {
    const store = new ModelStore(jsonPort);
    expect(store.renameElement(state(), "ibs.api", "ibs.db").diagnostics[0]?.code).toBe("refactor/rename");
    expect(store.renameElement(state(), "ibs.api", "Bad Id").diagnostics[0]?.code).toBe("refactor/rename");
  });

  it("warns about sidecars that reference unknown elements", async () => {
    const store = new ModelStore(jsonPort);
    const s = state();
    s.sidecars.elements["nope"] = { id: "nope" };
    const loaded = await store.loadFiles(store.print(s));
    expect(loaded.diagnostics.map((d) => d.code)).toContain("sidecar/unknown-element");
  });

  it("writes files atomically with LF endings", async () => {
    const root = await mkdtemp(join(tmpdir(), "dp-store-"));
    const store = new ModelStore(jsonPort);
    await store.save(root, [], state());
    const files = await readArchitectureFiles(root);
    expect(files.every((f) => !f.content.includes("\r") && !f.path.endsWith(".dp-tmp"))).toBe(true);
    expect(await readFile(join(root, "architecture/model/model.json"), "utf8")).toMatch(/\n$/);
  });
});
