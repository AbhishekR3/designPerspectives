import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { prune, setPositions, syncViews } from "../src/core/diagrams.js";
import { diffModels, type Snapshot } from "../src/core/diff.js";
import { syncFlows } from "../src/core/flows.js";
import { merge3 } from "../src/core/merge.js";
import * as ops from "../src/core/ops.js";
import { parseSidecar, type Sidecar } from "../src/core/sidecar.js";
import { flatten, unflatten } from "../src/core/units.js";
import type { Workspace } from "../src/core/workspace.js";
import { demoDir, demoWs } from "./helpers.js";

function demo(): Snapshot {
  const dir = demoDir();
  const sc = parseSidecar(fs.readFileSync(path.join(dir, "architecture", "designperspectives.json"), "utf-8"));
  return { workspace: demoWs(dir), sidecar: sc };
}

/** A changed copy, synced as `Project.edit` would. */
function changed(s: Snapshot, fn: (ws: Workspace, sc: Sidecar) => void): Snapshot {
  const ws = structuredClone(s.workspace);
  const sc = structuredClone(s.sidecar);
  fn(ws, sc);
  syncViews(ws);
  syncFlows(ws);
  prune(ws, sc);
  return { workspace: ws, sidecar: sc };
}

const units = (s: Snapshot) => flatten(s.workspace, s.sidecar);

function merged(base: Snapshot, ours: Snapshot, theirs: Snapshot) {
  const r = merge3(units(base), units(ours), units(theirs));
  if (r.conflicts.length) return { conflicts: r.conflicts, model: null };
  const { ws, sc } = unflatten(r.units);
  syncViews(ws);
  syncFlows(ws);
  return { conflicts: [], model: { workspace: ws, sidecar: sc } };
}

describe("diffModels", () => {
  it("reports nothing for the same model", () => {
    const a = demo();
    const cs = diffModels(a, changed(a, () => {}), "base");
    expect(cs.summary).toEqual({ added: 0, changed: 0, removed: 0, layout: 0 });
  });

  it("finds added, changed and removed objects with their fields", () => {
    const a = demo();
    let newId = "";
    const b = changed(a, (ws, sc) => {
      newId = ops.createElement(ws, { kind: "container", parentId: "internet-banking-system", name: "Cache", technology: "Redis" });
      ops.updateElement(ws, sc, "database", { description: "Stores everything", technology: "PostgreSQL" });
      ops.deleteElement(ws, "mobile-app");
    });
    const cs = diffModels(a, b, "base");
    const byId = new Map(cs.elements.map((e) => [e.id, e]));
    expect(byId.get(newId)?.change).toBe("added");
    expect(byId.get("mobile-app")?.change).toBe("removed");
    expect(byId.get("mobile-app")?.homeKey).toBe("containers-internet-banking-system");
    const db = byId.get("database")!;
    expect(db.change).toBe("changed");
    expect(db.fields.map((f) => f.field).sort()).toEqual(["description", "technologies"]);
    // Relationships of the removed container are reported as removed too.
    expect(cs.relationships.some((r) => r.change === "removed")).toBe(true);
    // The system shows "changed inside" on the landscape.
    expect(cs.inner).toContain("internet-banking-system");
  });

  it("counts moved boxes as layout, not as model changes", () => {
    const a = demo();
    const b = changed(a, (ws) => setPositions(ws, "landscape", { atm: { x: 999, y: 999 } }));
    const cs = diffModels(a, b, "base");
    expect(cs.summary).toEqual({ added: 0, changed: 0, removed: 0, layout: 1 });
  });

  it("reports flow and setting changes", () => {
    const a = demo();
    const b = changed(a, (_ws, sc) => {
      sc.tagGroups.push({ name: "Team", values: [{ name: "A", color: "#fff" }] });
    });
    const cs = diffModels(a, b, "base");
    expect(cs.settings).toMatchObject([{ kind: "tagGroup", change: "added", name: 'Tag group "Team"' }]);
  });
});

describe("merge3", () => {
  it("takes the draft when main has not changed", () => {
    const base = demo();
    const draft = changed(base, (ws, sc) => ops.updateElement(ws, sc, "atm", { name: "Cash Machine" }));
    const r = merged(base, base, draft);
    expect(r.conflicts).toEqual([]);
    expect(ops.buildIndex(r.model!.workspace).el("atm").name).toBe("Cash Machine");
  });

  it("keeps changes from both sides to different objects", () => {
    const base = demo();
    let added = "";
    const main = changed(base, (ws, sc) => ops.updateElement(ws, sc, "atm", { description: "Main edit" }));
    const draft = changed(base, (ws, sc) => {
      ops.updateElement(ws, sc, "database", { description: "Draft edit" });
      added = ops.createElement(ws, { kind: "component", parentId: "api-application", name: "Rate Limiter" });
      ops.createRelationship(ws, { sourceId: "sign-in-controller", destinationId: added, description: "Checks limits with" });
    });
    const r = merged(base, main, draft);
    expect(r.conflicts).toEqual([]);
    const idx = ops.buildIndex(r.model!.workspace);
    expect(idx.el("atm").description).toBe("Main edit");
    expect(idx.el("database").description).toBe("Draft edit");
    expect(idx.parentOf(added)).toBe("api-application");
    // The new component sits with its siblings, not at the end of the model.
    expect(idx.childrenOf("api-application").at(-1)).toBe(added);
    expect([...idx.relationships.values()].some((x) => x.destinationId === added)).toBe(true);
  });

  it("refuses when both sides changed the same object differently", () => {
    const base = demo();
    const main = changed(base, (ws, sc) => ops.updateElement(ws, sc, "atm", { name: "ATM 2" }));
    const draft = changed(base, (ws, sc) => ops.updateElement(ws, sc, "atm", { name: "ATM 3" }));
    expect(merged(base, main, draft).conflicts).toEqual([
      { label: 'Software system "ATM 3"', reason: "Changed in both main and the draft, differently." },
    ]);
  });

  it("accepts the same change made on both sides", () => {
    const base = demo();
    const edit = (ws: Workspace, sc: Sidecar) => ops.updateElement(ws, sc, "atm", { name: "Same" });
    expect(merged(base, changed(base, edit), changed(base, edit)).conflicts).toEqual([]);
  });

  it("refuses a new child of an element the other side removed", () => {
    const base = demo();
    const main = changed(base, (ws) => void ops.deleteElement(ws, "mobile-app"));
    const draft = changed(base, (ws, sc) => ops.updateElement(ws, sc, "mobile-app", { description: "Changed in draft" }));
    expect(merged(base, main, draft).conflicts[0]!.reason).toBe("Removed in main, changed in the draft.");

    const main2 = changed(base, (ws) => void ops.deleteElement(ws, "web-application"));
    const draft2 = changed(base, (ws) => void ops.createElement(ws, { kind: "component", parentId: "web-application", name: "Router" }));
    const c = merged(base, main2, draft2).conflicts;
    expect(c.some((x) => x.reason === 'It is inside "Web Application", which main removed.')).toBe(true);
  });

  it("never conflicts on positions: the draft's layout wins", () => {
    const base = demo();
    const main = changed(base, (ws) => setPositions(ws, "landscape", { atm: { x: 1, y: 1 } }));
    const draft = changed(base, (ws) => setPositions(ws, "landscape", { atm: { x: 2, y: 2 } }));
    const r = merged(base, main, draft);
    expect(r.conflicts).toEqual([]);
    const v = r.model!.workspace.views.systemLandscapeViews[0]!;
    expect(v.elements.find((e) => e.id === "atm")).toMatchObject({ x: 4, y: 4 });
  });
});
