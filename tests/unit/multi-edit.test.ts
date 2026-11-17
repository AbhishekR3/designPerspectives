/** Editing several selected elements at once: the shared value or "Mixed", partial chips, and which elements need a patch. */
import { describe, expect, test } from "vitest";
import { commonValue, fieldPatches, listChips, listPatches, symbolEditable, tagPatches, technologyEditable } from "../../ui/src/panels/multiEdit.js";

describe("multi-selection editing rules", () => {
  test("a field shows the shared value, or Mixed when the values differ", () => {
    expect(commonValue(["a", "a"])).toEqual({ mixed: false, value: "a" });
    expect(commonValue(["a", "b"])).toEqual({ mixed: true });
    expect(commonValue([])).toEqual({ mixed: true });
  });

  test("chips on all or only some, with the count", () => {
    expect(listChips([["Java", "Spring"], ["Java"], ["Java", "Kafka"]])).toEqual([
      { item: "Java", count: 3, total: 3 },
      { item: "Spring", count: 1, total: 3 },
      { item: "Kafka", count: 1, total: 3 },
    ]);
  });

  test("adding gives the chip to the ones that lack it, removing takes it from the ones that have it", () => {
    const items = [
      { id: "a", list: ["Java", "Spring"] },
      { id: "b", list: ["Java"] },
    ];
    expect(listPatches(items, "technology", { add: "Spring" })).toEqual([{ id: "b", patch: { technology: ["Java", "Spring"] } }]);
    expect(listPatches(items, "technology", { add: "  " })).toEqual([]);
    expect(listPatches(items, "technology", { remove: "Spring" })).toEqual([{ id: "a", patch: { technology: ["Java"] } }]);
    expect(listPatches(items, "technology", { remove: "Java" })).toHaveLength(2);
  });

  test("plain fields and tag groups: only elements whose value differs get a patch", () => {
    expect(
      fieldPatches(
        [
          { id: "a", value: "X" },
          { id: "b", value: "Y" },
        ],
        "owner",
        "X",
      ),
    ).toEqual([{ id: "b", patch: { owner: "X" } }]);
    const els: { id: string; tags: Record<string, string> }[] = [
      { id: "a", tags: { Team: "Core" } },
      { id: "b", tags: {} },
    ];
    expect(tagPatches(els, "Team", "Core")).toEqual([{ id: "b", patch: { tags: { Team: "Core" } } }]);
    expect(tagPatches(els, "Team", null)).toEqual([{ id: "a", patch: { tags: { Team: null } } }]);
  });

  test("technology and symbol only when every selected object can have them", () => {
    expect(
      technologyEditable([
        { kind: "container", catalogId: "" },
        { kind: "component", catalogId: "" },
      ]),
    ).toBe(true);
    expect(
      technologyEditable([
        { kind: "container", catalogId: "" },
        { kind: "person", catalogId: "" },
      ]),
    ).toBe(false);
    expect(technologyEditable([{ kind: "container", catalogId: "shared-db" }])).toBe(false);
    expect(symbolEditable([{ kind: "softwareSystem" }, { kind: "container" }])).toBe(true);
    expect(symbolEditable([{ kind: "softwareSystem" }, { kind: "person" }])).toBe(false);
  });
});
