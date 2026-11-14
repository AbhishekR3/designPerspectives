/** Model edits and the rules they enforce. */

import { describe, expect, test } from "vitest";
import * as ops from "../src/core/ops.js";
import { buildIndex, ModelError } from "../src/core/ops.js";
import { emptySidecar } from "../src/core/sidecar.js";
import { emptyWorkspace } from "../src/core/workspace.js";

const ws = () => emptyWorkspace("T");
const el = (w: ReturnType<typeof ws>, kind: string, name?: string, parentId?: string) => ops.createElement(w, { kind, name, parentId });

describe("ops", () => {
  test("IDs are slugs and unique", () => {
    const w = ws();
    const a = el(w, "softwareSystem", "Shop");
    const c1 = el(w, "container", "API", a);
    const b = el(w, "softwareSystem", "Warehouse");
    const c2 = el(w, "container", "API", b); // same name, different system: allowed
    expect([a, c1, c2]).toEqual(["shop", "api", "api-2"]);
  });

  test("default names are numbered", () => {
    const w = ws();
    const a = el(w, "person");
    const b = el(w, "person");
    const idx = buildIndex(w);
    expect([idx.el(a).name, idx.el(b).name]).toEqual(["New person", "New person 2"]);
  });

  test("names unique among people and systems", () => {
    const w = ws();
    el(w, "person", "Bank");
    expect(() => el(w, "softwareSystem", "Bank")).toThrow(ModelError);
  });

  test("containers need a system", () => {
    const w = ws();
    const p = el(w, "person", "P");
    expect(() => el(w, "container", "C", p)).toThrow(ModelError);
    expect(() => el(w, "component", "K")).toThrow(ModelError);
  });

  test("rename checks siblings; ID is stable across renames", () => {
    const w = ws();
    const s = el(w, "softwareSystem", "S");
    const a = el(w, "container", "A", s);
    el(w, "container", "B", s);
    expect(() => ops.updateElement(w, emptySidecar(), a, { name: "B" })).toThrow(ModelError);
    ops.updateElement(w, emptySidecar(), a, { name: "A2", technology: "Python" });
    const e = buildIndex(w).el(a);
    expect([e.id, e.name, e.technology]).toEqual(["a", "A2", "Python"]);
  });

  test("owner, links and tags are properties", () => {
    const w = ws();
    const sc = emptySidecar();
    sc.tagGroups = [{ name: "Risk", values: [{ name: "High", color: "#f00" }] }];
    const s = el(w, "softwareSystem", "S");
    ops.updateElement(w, sc, s, { owner: "Team A", links: [{ label: "Repo", url: "https://x" }], tags: { Risk: "High" } });
    const e = buildIndex(w).el(s);
    expect(e.properties!["dp.owner"]).toBe("Team A");
    expect(e.properties!["dp.tag.Risk"]).toBe("High");
    expect(ops.elementLinks(e)).toEqual([{ label: "Repo", url: "https://x" }]);
    expect(() => ops.updateElement(w, sc, s, { tags: { Risk: "Extreme" } })).toThrow(ModelError);
    expect(() => ops.updateElement(w, sc, s, { tags: { Cost: "Low" } })).toThrow(ModelError);
    ops.updateElement(w, sc, s, { tags: { Risk: null }, owner: "" });
    const after = buildIndex(w).el(s).properties;
    expect(after).not.toBeNull(); // links remain
    expect(after).not.toHaveProperty("dp.tag.Risk");
  });

  test("relationship rules", () => {
    const w = ws();
    const s = el(w, "softwareSystem", "S");
    const c = el(w, "container", "C", s);
    const p = el(w, "person", "P");
    expect(() => ops.createRelationship(w, { sourceId: s, destinationId: s })).toThrow(ModelError);
    expect(() => ops.createRelationship(w, { sourceId: s, destinationId: c })).toThrow(ModelError); // parent -> child
    const r1 = ops.createRelationship(w, { sourceId: p, destinationId: c });
    const r2 = ops.createRelationship(w, { sourceId: p, destinationId: c });
    const idx = buildIndex(w);
    expect([r1, r2]).toEqual(["p--c", "p--c-2"]);
    expect([idx.rel(r1).description, idx.rel(r2).description]).toEqual(["Uses", "Uses 2"]);
    expect(() => ops.createRelationship(w, { sourceId: p, destinationId: c, description: "Uses" })).toThrow(ModelError);
    expect(() => ops.updateRelationship(w, r2, { description: "Uses" })).toThrow(ModelError);
  });

  test("delete cascades", () => {
    const w = ws();
    const s = el(w, "softwareSystem", "S");
    const c = el(w, "container", "C", s);
    const k = el(w, "component", "K", c);
    const p = el(w, "person", "P");
    ops.createRelationship(w, { sourceId: p, destinationId: k });
    ops.createRelationship(w, { sourceId: k, destinationId: p, description: "Notifies" });
    const gone = ops.deleteElement(w, s);
    const idx = buildIndex(w);
    expect(gone).toEqual(new Set([s, c, k]));
    expect([...idx.elements.keys()]).toEqual([p]);
    expect(idx.relationships.size).toBe(0);
  });

  test("slugify and unique", () => {
    expect(ops.slugify("  Héllo, World!  ")).toBe("h-llo-world");
    expect(ops.slugify("!!!")).toBe("element");
    expect(ops.unique("a", new Set(["a", "a-2"]))).toBe("a-3");
  });

  test("code paths are normalised and must stay inside the code folder", () => {
    expect(ops.cleanPaths(["a/./b/", "a\\c", "a/b"])).toEqual(["a/b", "a/c"]);
    for (const bad of ["../x", "/etc", "C:/x", "a/../../x"]) expect(() => ops.cleanPaths([bad])).toThrow(ModelError);
  });
});
