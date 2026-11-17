/** Model edits and the rules they enforce. */

import { describe, expect, test } from "vitest";
import * as ops from "../../src/core/modelEdits.js";
import { buildIndex, ModelError } from "../../src/core/modelEdits.js";
import { emptySidecar } from "../../src/core/designPerspectivesFile.js";
import { emptyWorkspace } from "../../src/core/workspace.js";

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

  test("duplicate drops code paths and work items but keeps cost", () => {
    const w = ws();
    const a = el(w, "softwareSystem", "Shop");
    const sc = emptySidecar();
    const cost = [{ item: "Hosting", monthly: 50, note: "" }];
    ops.updateElement(w, sc, a, {
      codePaths: ["src/shop"],
      work: [{ type: "issue", title: "Fix it", url: "", status: "open", severity: "", note: "" }],
      cost,
    } as never);
    const copyId = ops.duplicateElement(w, sc, a);
    const copy = buildIndex(w).el(copyId);
    const props = ops.getProps(copy);
    expect(props).not.toHaveProperty(ops.CODE_KEY);
    expect(props).not.toHaveProperty(ops.WORK_KEY);
    expect(ops.getJson(copy, ops.COST_KEY)).toHaveLength(1);
  });

  test("file styles are pruned when no mapped path covers them", () => {
    const w = ws();
    const a = el(w, "softwareSystem", "Shop");
    const sc = emptySidecar();
    ops.updateElement(w, sc, a, { codePaths: ["src/shop"] } as never);
    const idx = buildIndex(w);
    expect(ops.idStillValid(idx, "file:src/shop/a.py")).toBe(true);
    expect(ops.idStillValid(idx, "file:src/shop/a.py->src/shop/b.py")).toBe(true);
    expect(ops.idStillValid(idx, "file:src/shopping/a.py")).toBe(false);
    expect(ops.idStillValid(idx, "file:src/other/a.py")).toBe(false);
    ops.updateElement(w, sc, a, { codePaths: [] } as never);
    expect(ops.idStillValid(buildIndex(w), "file:src/shop/a.py")).toBe(false);
  });
});

describe("moving an element", () => {
  const model = () => {
    const w = ws();
    const a = el(w, "softwareSystem", "A");
    const b = el(w, "softwareSystem", "B");
    const api = el(w, "container", "API", a);
    const db = el(w, "container", "DB", a);
    const ctrl = el(w, "component", "Controller", api);
    const worker = el(w, "container", "Worker", b);
    return { w, a, b, api, db, ctrl, worker };
  };

  test("a container moves to another system with its children and relationships", () => {
    const { w, a, b, api, db, ctrl } = model();
    const r1 = ops.createRelationship(w, { sourceId: ctrl, destinationId: db });
    const r2 = ops.createRelationship(w, { sourceId: api, destinationId: db, description: "Reads" });
    ops.moveElement(w, api, b);
    const idx = buildIndex(w);
    expect(idx.parentOf(api)).toBe(b);
    expect(idx.childrenOf(a)).toEqual([db]);
    expect(idx.childrenOf(b).at(-1)).toBe(api);
    expect(idx.parentOf(ctrl)).toBe(api);
    expect(idx.rel(r1)).toMatchObject({ sourceId: ctrl, destinationId: db });
    expect(idx.relOwner.get(r2)).toBe(api);
  });

  test("a component moves to another container", () => {
    const { w, ctrl, worker } = model();
    ops.moveElement(w, ctrl, worker);
    expect(buildIndex(w).parentOf(ctrl)).toBe(worker);
  });

  test("refusals", () => {
    const { w, a, b, api, db, ctrl, worker } = model();
    const msg = (f: () => void) => {
      try {
        f();
      } catch (e) {
        expect(e).toBeInstanceOf(ModelError);
        return (e as Error).message;
      }
      throw new Error("not refused");
    };
    expect(msg(() => ops.moveElement(w, a, b))).toBe("Only containers and components can be moved to another parent.");
    expect(msg(() => ops.moveElement(w, api, worker))).toBe("A container must sit inside a software system.");
    expect(msg(() => ops.moveElement(w, ctrl, b))).toBe("A component must sit inside a container.");
    expect(msg(() => ops.moveElement(w, api, "nope"))).toBe('No element with ID "nope".');
    expect(msg(() => ops.moveElement(w, api, a))).toBe('"API" is already inside "A".');
    el(w, "container", "DB", b);
    expect(msg(() => ops.moveElement(w, db, b))).toBe('"B" already has a container named "DB".');
    // A relationship of the element, or of something inside it, with the new parent.
    ops.createRelationship(w, { sourceId: ctrl, destinationId: b, description: "Calls" });
    expect(msg(() => ops.moveElement(w, api, b))).toBe(
      '"API" cannot move into "B": the relationship "Calls" from "Controller" to "B" would then join an element and its own parent. Remove that relationship first.',
    );
    ops.createRelationship(w, { sourceId: worker, destinationId: ctrl });
    expect(msg(() => ops.moveElement(w, ctrl, worker))).toMatch(/would then join an element and its own parent/);
    // Nothing was changed by the refused moves.
    expect(buildIndex(w).parentOf(api)).toBe(a);
  });
});

describe("re-slugging a new element on its first rename", () => {
  test("only with the option, and only while the ID is still made from the name", () => {
    const w = ws();
    const sc = emptySidecar();
    const s = el(w, "softwareSystem");
    expect(s).toBe("new-system");
    expect(ops.updateElement(w, sc, s, { name: "Loans" })).toBe("new-system");
    expect(ops.updateElement(w, sc, s, { name: "Loans 2" }, { reslug: true })).toBe("new-system"); // ID no longer from the name
    const t = el(w, "softwareSystem");
    expect(ops.updateElement(w, sc, t, { name: "Payments" }, { reslug: true })).toBe("payments");
    expect(ops.updateElement(w, sc, "payments", { description: "x" }, { reslug: true })).toBe("payments"); // no rename
    expect(buildIndex(w).el("payments").name).toBe("Payments");
  });

  test("numbered IDs and taken slugs", () => {
    const w = ws();
    const sc = emptySidecar();
    const a = el(w, "softwareSystem");
    const b = el(w, "softwareSystem");
    expect([a, b]).toEqual(["new-system", "new-system-2"]);
    el(w, "person", "Shop");
    expect(ops.isAutoId("new-system-2", "New system 2")).toBe(true);
    expect(ops.updateElement(w, sc, b, { name: "Shop Backend" }, { reslug: true })).toBe("shop-backend");
    const c = el(w, "softwareSystem");
    // "shop" is taken by the person, so the new ID is numbered.
    const sys = buildIndex(w).el(c);
    expect(sys.name).toBe("New system 2");
    expect(ops.updateElement(w, sc, c, { name: "Shop!" }, { reslug: true })).toBe("shop-2");
  });

  test("rewrites every reference: relationships, stages, views, flows, styles, layouts", () => {
    const w = ws();
    const sc = emptySidecar();
    const p = el(w, "person", "Customer");
    const s = el(w, "softwareSystem");
    const c = el(w, "container", "API", s);
    const r1 = ops.createRelationship(w, { sourceId: p, destinationId: s });
    const r2 = ops.createRelationship(w, { sourceId: p, destinationId: s, description: "Pays with" });
    const r3 = ops.createRelationship(w, { sourceId: p, destinationId: c });
    expect([r1, r2]).toEqual(["customer--new-system", "customer--new-system-2"]);
    ops.updateRelationship(w, r3, { stages: [{ name: "Gateway", elementId: s }] });
    w.views.containerViews.push({ key: `containers-${s}`, softwareSystemId: s, elements: [{ id: c, x: 1, y: 2 }], relationships: [] });
    w.views.systemLandscapeViews.push({ key: "landscape", elements: [{ id: p }, { id: s, x: 5, y: 6 }], relationships: [{ id: r1 }] });
    w.views.dynamicViews.push({ key: "flow-pay", title: "Pay", properties: { "dp.flow": "true" }, elementId: s, elements: [{ id: p }, { id: s }], relationships: [{ id: r2, order: "1" }] });
    sc.styles[s] = { fill: "#123456" };
    sc.styles[r1] = { stroke: "#123456" };
    sc.styles[`derived:${p}->${s}`] = { stroke: "#654321" };
    sc.layouts[`connector-${r1}`] = { sizes: { [`stage:${r1}:x`]: { w: 1, h: 1 } }, edges: {}, positions: {} };
    sc.layouts.landscape = { sizes: { [s]: { w: 300, h: 200 } }, edges: { [r1]: { route: "orthogonal" } as never }, positions: {} };

    const id = ops.updateElement(w, sc, s, { name: "Loans" }, { reslug: true });
    expect(id).toBe("loans");
    const idx = buildIndex(w);
    expect(idx.elements.has("new-system")).toBe(false);
    expect(idx.parentOf(c)).toBe("loans");
    expect([...idx.relationships.keys()].sort()).toEqual(["customer--api", "customer--loans", "customer--loans-2"]);
    expect(idx.rel("customer--loans-2").description).toBe("Pays with");
    expect(ops.getJson<{ elementId?: string }>(idx.rel(r3), ops.STAGES_KEY)[0]!.elementId).toBe("loans");
    const cv = w.views.containerViews[0]!;
    expect([cv.key, cv.softwareSystemId, cv.elements[0]]).toEqual(["containers-loans", "loans", { id: c, x: 1, y: 2 }]);
    expect(w.views.systemLandscapeViews[0]!.elements[1]).toEqual({ id: "loans", x: 5, y: 6 });
    expect(w.views.systemLandscapeViews[0]!.relationships).toEqual([{ id: "customer--loans" }]);
    const flow = w.views.dynamicViews[0]!;
    expect([flow.elementId, flow.relationships[0]!.id]).toEqual(["loans", "customer--loans-2"]);
    expect(Object.keys(sc.styles).sort()).toEqual(["customer--loans", "derived:customer->loans", "loans"]);
    expect(Object.keys(sc.layouts).sort()).toEqual(["connector-customer--loans", "landscape"]);
    expect(Object.keys(sc.layouts["connector-customer--loans"]!.sizes)).toEqual(["stage:customer--loans:x"]);
    expect(sc.layouts.landscape!.sizes).toEqual({ loans: { w: 300, h: 200 } });
    expect(Object.keys(sc.layouts.landscape!.edges)).toEqual(["customer--loans"]);
    expect(JSON.stringify(w) + JSON.stringify(sc)).not.toMatch(/new-system/);
  });

  test("keeps the old ID when something it does not know refers to it", () => {
    const w = ws();
    const sc = emptySidecar();
    const s = el(w, "softwareSystem");
    const c = el(w, "container", undefined, s);
    w.model.deploymentNodes = [{ id: "d1", name: "Node", containerInstances: [{ id: "i1", containerId: c }] }];
    expect(ops.updateElement(w, sc, c, { name: "API" }, { reslug: true })).toBe(c);
    expect(buildIndex(w).el(c).name).toBe("API");
    expect(ops.updateElement(w, sc, s, { name: "Shop" }, { reslug: true })).toBe("shop");
  });
});

describe("explicit IDs (the importer, DEC-051)", () => {
  test("createElement and createRelationship use a given ID", () => {
    const w = ws();
    const s = ops.createElement(w, { kind: "softwareSystem", name: "Shop", id: "web-shop" });
    const c = ops.createElement(w, { kind: "container", name: "API", parentId: s, id: "shop-api" });
    const d = ops.createElement(w, { kind: "container", name: "DB", parentId: s });
    expect([s, c, d]).toEqual(["web-shop", "shop-api", "db"]);
    expect(ops.createRelationship(w, { sourceId: c, destinationId: d, description: "Reads", id: "api-reads" })).toBe("api-reads");
    expect(ops.createRelationship(w, { sourceId: c, destinationId: d, description: "Writes", id: "shop-api--db" })).toBe("shop-api--db");
    // Without an ID: unchanged behaviour (numbered when the default is taken).
    expect(ops.createRelationship(w, { sourceId: c, destinationId: d, description: "Locks" })).toBe("shop-api--db-2");
  });

  test("an ID that is not its own slug, or is taken by an element or a relationship, is refused by name", () => {
    const w = ws();
    const s = ops.createElement(w, { kind: "softwareSystem", name: "Shop", id: "shop" });
    const t = ops.createElement(w, { kind: "softwareSystem", name: "Bank" });
    ops.createRelationship(w, { sourceId: s, destinationId: t, description: "Pays", id: "pays" });
    for (const bad of ["Shop", "shop_api", "-shop", "shop--api", "shop-", "a".repeat(82), ""]) {
      if (!bad) continue;
      expect(() => ops.createElement(w, { kind: "person", name: `P ${bad}`, id: bad }), bad).toThrow(new RegExp(`"${bad}" is not a usable ID`));
    }
    expect(() => ops.createElement(w, { kind: "person", name: "Other shop", id: "shop" })).toThrow(/"shop" is already used/);
    expect(() => ops.createElement(w, { kind: "person", name: "Payer", id: "pays" })).toThrow(/"pays" is already used/);
    expect(() => ops.createRelationship(w, { sourceId: t, destinationId: s, description: "Refunds", id: "shop" })).toThrow(/"shop" is already used/);
    expect(() => ops.createRelationship(w, { sourceId: t, destinationId: s, description: "Refunds", id: "bank---shop" })).toThrow(/is not a usable ID/);
    expect(ops.isCleanId("bank--shop", true)).toBe(true);
    expect(ops.isCleanId("bank--shop")).toBe(false);
    expect(buildIndex(w).elements.size).toBe(2);
  });
});
