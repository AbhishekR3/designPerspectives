import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { client, demoDir, ok } from "./helpers.js";

const draftDir = (dir: string, id: string) => path.join(dir, "architecture", "drafts", id);
const mainFile = (dir: string) => fs.readFileSync(path.join(dir, "architecture", "workspace.json"), "utf-8");

describe("drafts", () => {
  it("creates a draft as a copy with a base, listed in the state", async () => {
    const dir = demoDir();
    const c = client(dir);
    const { id } = await ok(c.post("/api/drafts", { title: "Add cache", description: "Speed up reads" }));
    expect(id).toBe("add-cache");
    for (const f of ["draft.json", "workspace.json", "designperspectives.json", "base/workspace.json", "base/designperspectives.json"]) {
      expect(fs.existsSync(path.join(draftDir(dir, id), f)), f).toBe(true);
    }
    expect(fs.readFileSync(path.join(draftDir(dir, id), "workspace.json"), "utf-8")).toBe(mainFile(dir));
    const st = await ok(c.get("/api/state"));
    expect(st.drafts).toMatchObject([{ id, title: "Add cache", description: "Speed up reads" }]);
    expect(st.model).toEqual({ ref: "main", title: "Main model" });
    expect(st.compare).toBeNull();
    expect((await c.post("/api/drafts", { title: "Add cache" })).status).toBe(422);
    expect((await c.post("/api/drafts", { title: "  " })).status).toBe(422);
  });

  it("edits the draft only, and shows the changes against its base", async () => {
    const dir = demoDir();
    const c = client(dir);
    const before = mainFile(dir);
    const { id } = await ok(c.post("/api/drafts", { title: "Plan" }));
    const d = c.at(`draft:${id}`);
    const { id: cache } = await ok(d.post("/api/elements", { kind: "container", parentId: "internet-banking-system", name: "Cache" }));
    await ok(d.patch("/api/elements/database", { description: "Changed in the draft" }));
    await ok(d.delete("/api/elements/mobile-app"));
    expect(mainFile(dir)).toBe(before);
    expect((await ok(d.get("/api/state"))).canUndo).toBe(true);
    expect((await ok(c.get("/api/state"))).canUndo).toBe(false);

    const dc = c.at(`draft:${id}`, "base");
    const st = await ok(dc.get("/api/state"));
    expect(st.model.title).toBe("Draft: Plan");
    expect(st.compare.against).toBe("base");
    expect(st.compare.summary).toMatchObject({ added: 1, changed: 1 });

    const changes = await ok(dc.get("/api/changes"));
    expect(changes.elements.map((e: any) => [e.id, e.change])).toEqual(
      expect.arrayContaining([
        [cache, "added"],
        ["database", "changed"],
        ["mobile-app", "removed"],
      ]),
    );

    const diag = await ok(dc.get("/api/diagrams/containers-internet-banking-system"));
    const node = (nid: string) => diag.nodes.find((n: any) => n.id === nid);
    expect(node(cache).change).toBe("added");
    expect(node("database").change).toBe("changed");
    expect(node("mobile-app")).toMatchObject({ change: "removed", ghost: true });
    expect(node("web-application").change).toBeUndefined();
    expect(diag.compare).toEqual({ against: "base", removed: false });
    expect(diag.edges.some((e: any) => e.ghost && e.change === "removed")).toBe(true);

    const land = await ok(dc.get("/api/diagrams/landscape"));
    expect(land.nodes.find((n: any) => n.id === "internet-banking-system").change).toBe("inner");

    // Without the compare header there are no change marks.
    const plain = await ok(d.get("/api/diagrams/containers-internet-banking-system"));
    expect(plain.nodes.some((n: any) => n.change || n.ghost)).toBe(false);
    expect((await d.get("/api/changes")).status).toBe(422);
  });

  it("shows a diagram that only exists in the compared version as removed", async () => {
    const c = client();
    const { id } = await ok(c.post("/api/drafts", { title: "Drop API" }));
    await ok(c.at(`draft:${id}`).delete("/api/elements/api-application"));
    const diag = await ok(c.at(`draft:${id}`, "base").get("/api/diagrams/components-api-application"));
    expect(diag.compare).toEqual({ against: "base", removed: true });
    expect(diag.nodes.every((n: any) => n.ghost && n.change === "removed")).toBe(true);
    expect((await c.at(`draft:${id}`).get("/api/diagrams/components-api-application")).status).toBe(404);
  });

  it("applies a draft as one undo step and removes it", async () => {
    const dir = demoDir();
    const c = client(dir);
    const { id } = await ok(c.post("/api/drafts", { title: "Rename" }));
    await ok(c.at(`draft:${id}`).patch("/api/elements/atm", { name: "Cash Machine" }));
    // Main changed meanwhile, on another object: both changes are kept.
    await ok(c.patch("/api/elements/e-mail-system", { description: "Main edit" }));

    const preview = await ok(c.get(`/api/drafts/${id}/apply-preview`));
    expect(preview.conflicts).toEqual([]);
    expect(preview.changes.elements.map((e: any) => e.id)).toEqual(["atm"]);

    await ok(c.post(`/api/drafts/${id}/apply`));
    const st = await ok(c.get("/api/state"));
    const el = (eid: string) => st.elements.find((e: any) => e.id === eid);
    expect(el("atm").name).toBe("Cash Machine");
    expect(el("e-mail-system").description).toBe("Main edit");
    expect(st.drafts).toEqual([]);
    expect(fs.existsSync(draftDir(dir, id))).toBe(false);

    await ok(c.post("/api/undo"));
    expect((await ok(c.get("/api/state"))).elements.find((e: any) => e.id === "atm").name).toBe("ATM");
  });

  it("refuses to apply with conflicts and lists them", async () => {
    const c = client();
    const { id } = await ok(c.post("/api/drafts", { title: "Clash" }));
    await ok(c.at(`draft:${id}`).patch("/api/elements/atm", { name: "Draft name" }));
    await ok(c.patch("/api/elements/atm", { name: "Main name" }));
    const preview = await ok(c.get(`/api/drafts/${id}/apply-preview`));
    expect(preview.conflicts).toHaveLength(1);
    const r = await c.post(`/api/drafts/${id}/apply`);
    expect(r.status).toBe(409);
    expect(r.json().conflicts[0].reason).toBe("Changed in both main and the draft, differently.");
    expect((await ok(c.get("/api/state"))).drafts).toHaveLength(1);
  });

  it("reports a model rule broken only by the merge", async () => {
    const c = client();
    const { id } = await ok(c.post("/api/drafts", { title: "Names" }));
    await ok(c.at(`draft:${id}`).post("/api/elements", { kind: "softwareSystem", name: "Billing" }));
    // Same name, different ID: each side is valid on its own.
    const { id: other } = await ok(c.post("/api/elements", { kind: "softwareSystem", name: "Billing Service" }));
    await ok(c.patch(`/api/elements/${other}`, { name: "Billing" }));
    const r = await c.post(`/api/drafts/${id}/apply`);
    expect(r.status).toBe(409);
    expect(r.json().conflicts.map((x: any) => x.reason).join(" ")).toMatch(/Billing/);
  });

  it("renames and discards drafts", async () => {
    const dir = demoDir();
    const c = client(dir);
    const { id } = await ok(c.post("/api/drafts", { title: "Old" }));
    await ok(c.patch(`/api/drafts/${id}`, { title: "New", description: "D" }));
    expect((await ok(c.get("/api/state"))).drafts).toMatchObject([{ id, title: "New", description: "D" }]);
    await ok(c.delete(`/api/drafts/${id}`));
    expect(fs.existsSync(draftDir(dir, id))).toBe(false);
    expect((await c.at(`draft:${id}`).get("/api/state")).status).toBe(404);
  });

  it("rejects unknown versions and bad draft IDs", async () => {
    const c = client();
    expect((await c.at("nonsense").get("/api/state")).status).toBe(422);
    expect((await c.at("draft:../..").get("/api/state")).status).toBe(404);
    expect((await c.at("main", "base").get("/api/state")).status).toBe(422);
    expect((await c.delete("/api/drafts/..")).status).toBe(404);
  });

  it("a base copy cannot be edited, and a read-only server refuses draft changes", async () => {
    const dir = demoDir();
    const c = client(dir);
    const { id } = await ok(c.post("/api/drafts", { title: "RO" }));
    const viewer = client(dir, { readOnly: true });
    expect((await viewer.post("/api/drafts", { title: "X" })).status).toBe(403);
    expect((await viewer.at(`draft:${id}`).patch("/api/elements/atm", { name: "X" })).status).toBe(403);
    expect((await viewer.post(`/api/drafts/${id}/apply`)).status).toBe(403);
    expect((await ok(viewer.at(`draft:${id}`).get("/api/state"))).readOnly).toBe(true);
  });
});
