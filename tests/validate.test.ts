/** Validation rules (mirroring Structurizr's loader) and sidecar rules. */

import { describe, expect, test } from "vitest";
import { emptySidecar, makeLens } from "../src/core/sidecar.js";
import { errors } from "../src/core/validate.js";
import { toWorkspace } from "../src/core/workspace.js";

const ws = (data: Record<string, unknown>) => toWorkspace({ name: "T", views: {}, ...data });

describe("validate", () => {
  test("duplicate top-level names", () => {
    const w = ws({ model: { people: [{ id: "a", name: "X" }], softwareSystems: [{ id: "b", name: "X" }] } });
    expect(errors(w, emptySidecar())).toEqual(['A person or software system named "X" already exists.']);
  });

  test("duplicate IDs", () => {
    const w = ws({ model: { people: [{ id: "a", name: "X" }, { id: "a", name: "Y" }] } });
    expect(errors(w, emptySidecar())[0]).toContain("share the ID");
  });

  test("duplicate relationship descriptions", () => {
    const w = ws({
      model: {
        people: [
          {
            id: "a",
            name: "A",
            relationships: [
              { id: "r1", sourceId: "a", destinationId: "b", description: "Uses" },
              { id: "r2", sourceId: "a", destinationId: "b", description: "Uses" },
            ],
          },
        ],
        softwareSystems: [{ id: "b", name: "B" }],
      },
    });
    expect(errors(w, emptySidecar())).toEqual(['A relationship with the description "Uses" already exists between "A" and "B".']);
  });

  test("view references", () => {
    const w = ws({
      model: {},
      views: { systemLandscapeViews: [{ key: "L", elements: [{ id: "zz" }] }], containerViews: [{ key: "L", softwareSystemId: "q" }] },
    });
    const e = errors(w, emptySidecar());
    expect(e).toContain("A view with the key L already exists.");
    expect(e.some((x) => x.includes("references an element (id=zz)"))).toBe(true);
    expect(e.some((x) => x.includes("associated with an element (id=q)"))).toBe(true);
  });

  test("sidecar rules", () => {
    const w = ws({ model: { people: [{ id: "a", name: "A", properties: { "dp.tag.Risk": "Huge", "dp.tag.Cost": "Low" } }] } });
    const sc = emptySidecar();
    sc.tagGroups = [{ name: "Risk", values: [{ name: "High", color: "#f00" }] }];
    sc.lenses = [makeLens({ id: "x", name: "X", defaultOverlay: "Nope" })];
    const e = errors(w, sc);
    expect(e).toContain('"A" has "Huge" for tag group "Risk", which is not one of its values.');
    expect(e).toContain('"A" has a value for tag group "Cost", which is not defined.');
    expect(e).toContain('Lens "X" uses tag group "Nope", which is not defined.');
  });
});
