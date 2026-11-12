import { describe, expect, it } from "vitest";
import { loadSidecars, printSidecars, renameElementInSidecars } from "./index.js";
import { renameElementId, renameReference } from "./rename.js";
import { canonicalFiles } from "./test-fixtures.js";

describe("renameElementId / renameReference", () => {
  it("renames the id and its descendants only", () => {
    expect(renameElementId("orders.api", "orders.api", "shop.api")).toBe("shop.api");
    expect(renameElementId("orders.api.auth", "orders.api", "shop.api")).toBe("shop.api.auth");
    expect(renameElementId("orders.apix", "orders.api", "shop.api")).toBe("orders.apix");
    expect(renameElementId("orders", "orders.api", "shop.api")).toBe("orders");
  });
  it("renames both relationship endpoints and keeps kind and key", () => {
    const r = (id: string) => renameElementId(id, "a", "z");
    expect(renameReference("a.x->a#calls:k", r)).toBe("z.x->z#calls:k");
    expect(renameReference("b-c->ab#sendsTo", r)).toBe("b-c->ab#sendsTo");
    expect(renameReference("a.y", r)).toBe("z.y");
  });
});

describe("renameElementInSidecars", () => {
  const before = loadSidecars(canonicalFiles()).sidecars;
  const snapshot = JSON.stringify(before);
  const after = renameElementInSidecars(before, "orders.api", "shop.backend");

  it("is pure", () => {
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("renames element sidecar keys and ids (including descendants)", () => {
    expect(Object.keys(after.elements).sort()).toEqual(["orders.apix", "shop.backend", "shop.backend.auth"]);
    expect(after.elements["shop.backend"]?.id).toBe("shop.backend");
    expect(after.elements["shop.backend.auth"]?.id).toBe("shop.backend.auth");
    expect(after.elements["orders.apix"]?.id).toBe("orders.apix");
  });

  it("renames both relationship endpoints", () => {
    expect(after.relationships.map((r) => r.id)).toEqual([
      "shop.backend->orders.db#writesTo",
      "shop.backend.auth->orders.apix#calls:token",
      "orders.ui->shop.backend#calls",
    ]);
  });

  it("renames code mapping, layout nodes, note anchors, ADR elements, risk and characteristic scope", () => {
    expect(after.codemapping?.rules.map((r) => r.element)).toEqual(["shop.backend", "shop.backend.auth"]);
    expect(Object.keys(after.layouts["orders-containers"]?.nodes ?? {}).sort()).toEqual([
      "orders.apix",
      "shop.backend",
      "shop.backend.auth",
    ]);
    expect(after.notes["note-1"]?.frontMatter.anchor).toBe("shop.backend");
    expect(after.notes["note-2"]?.frontMatter.anchor).toBe("orders.ui->shop.backend#calls");
    expect(after.adrs["ADR-0001"]?.frontMatter.elements).toEqual(["orders.db", "shop.backend.auth"]);
    expect(after.risk["rs-1"]?.scores.map((s) => s.element)).toEqual(["shop.backend", "shop.backend.auth"]);
    expect(after.risk["rs-1"]?.mitigations.map((m) => m.element)).toEqual(["shop.backend"]);
    expect(after.characteristics?.driving[0]?.scope).toEqual(["shop.backend"]);
  });

  it("produces a set that prints to valid sidecars and renames back losslessly", () => {
    const printed = printSidecars(after);
    expect(printed.map((f) => f.path)).toContain("sidecars/elements/shop.backend.yaml");
    const reloaded = loadSidecars(printed);
    expect(reloaded.diagnostics).toEqual([]);
    const back = renameElementInSidecars(reloaded.sidecars, "shop.backend", "orders.api");
    expect(printSidecars(back)).toEqual(printSidecars(before));
  });

  it("leaves a set without references unchanged", () => {
    expect(printSidecars(renameElementInSidecars(before, "nope", "other"))).toEqual(printSidecars(before));
  });
});
