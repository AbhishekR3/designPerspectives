import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { client, demoDir, ok, tmpDir } from "./helpers.js";

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

  it("moves an element in a draft: shown as a change, applied to main", async () => {
    const dir = demoDir();
    const c = client(dir);
    const { id } = await ok(c.post("/api/drafts", { title: "Move DB" }));
    await ok(c.at(`draft:${id}`).post("/api/elements/database/move", { parentId: "analytics-platform" }));
    const dc = c.at(`draft:${id}`, "base");
    const changes = await ok(dc.get("/api/changes"));
    expect(changes.elements).toMatchObject([
      {
        id: "database",
        change: "changed",
        homeKey: "containers-analytics-platform",
        fields: [{ field: "parent", label: "Parent", before: "Internet Banking System", after: "Analytics Platform" }],
      },
    ]);
    expect(changes.inner).toEqual(expect.arrayContaining(["internet-banking-system", "analytics-platform"]));
    // Changed in its new parent's diagram; a ghost where it was.
    const to = await ok(dc.get("/api/diagrams/containers-analytics-platform"));
    expect(to.nodes.find((n: any) => n.id === "database")).toMatchObject({ change: "changed", inScope: true });
    expect(to.nodes.find((n: any) => n.id === "database").ghost).toBeUndefined();
    const from = await ok(dc.get("/api/diagrams/containers-internet-banking-system"));
    expect(from.nodes.find((n: any) => n.id === "database")).toMatchObject({ ghost: true, change: "removed" });

    const preview = await ok(c.get(`/api/drafts/${id}/apply-preview`));
    expect(preview.conflicts).toEqual([]);
    await ok(c.post(`/api/drafts/${id}/apply`));
    const st = await ok(c.get("/api/state"));
    expect(st.elements.find((e: any) => e.id === "database").parentId).toBe("analytics-platform");
    expect(st.relationships.some((r: any) => r.id === "security-component--database")).toBe(true);
    await ok(c.post("/api/undo"));
    expect((await ok(c.get("/api/state"))).elements.find((e: any) => e.id === "database").parentId).toBe("internet-banking-system");
  });

  it("refuses to apply a move that clashes with main", async () => {
    const reasons = async (mainEdit: (c: ReturnType<typeof client>) => Promise<unknown>) => {
      const c = client();
      const { id } = await ok(c.post("/api/drafts", { title: "Move" }));
      await ok(c.at(`draft:${id}`).post("/api/elements/database/move", { parentId: "analytics-platform" }));
      await mainEdit(c);
      const r = await c.post(`/api/drafts/${id}/apply`);
      expect(r.status, r.text).toBe(409);
      return r.json().conflicts.map((x: any) => x.reason);
    };
    // Main moved it elsewhere, or changed it.
    expect(await reasons((c) => ok(c.post("/api/elements/database/move", { parentId: "atm" })))).toEqual(["Changed in both main and the draft, differently."]);
    expect(await reasons((c) => ok(c.patch("/api/elements/database", { description: "x" })))).toEqual(["Changed in both main and the draft, differently."]);
    // Main removed it, or removed the new parent.
    expect(await reasons((c) => ok(c.delete("/api/elements/database")))).toEqual(["Removed in main, changed in the draft."]);
    expect(await reasons((c) => ok(c.delete("/api/elements/analytics-platform")))).toContain('It is inside "Analytics Platform", which main removed.');
    // Main added a relationship that the move turns into one between parent and child.
    const rule = await reasons((c) => ok(c.post("/api/relationships", { sourceId: "database", destinationId: "analytics-platform" })));
    expect(rule.join(" ")).toMatch(/one of which contains the other/);
  });
  it("records who started a draft: the client's name, else the git user name; old drafts still load", async () => {
    const cfg = path.join(tmpDir(), "gitconfig");
    fs.writeFileSync(cfg, "[user]\n\tname = Pat Git\n");
    const saved = { g: process.env.GIT_CONFIG_GLOBAL, n: process.env.GIT_CONFIG_NOSYSTEM };
    process.env.GIT_CONFIG_GLOBAL = cfg;
    process.env.GIT_CONFIG_NOSYSTEM = "1";
    try {
      const dir = demoDir();
      const c = client(dir);
      const a = await ok(c.post("/api/drafts", { title: "From git" }));
      const b = await ok(c.post("/api/drafts", { title: "From client", author: " Sam " }));
      expect((await c.post("/api/drafts", { title: "Too long", author: "x".repeat(81) })).status).toBe(422);
      expect((await c.post("/api/drafts", { title: "Not text", author: 5 })).status).toBe(422);
      const list = (await ok(c.get("/api/state"))).drafts;
      expect(list.find((d: any) => d.id === a.id).author).toBe("Pat Git");
      expect(list.find((d: any) => d.id === b.id).author).toBe("Sam");
      // Renaming keeps it; a draft.json without it loads without one.
      await ok(c.patch(`/api/drafts/${a.id}`, { title: "Renamed" }));
      expect(JSON.parse(fs.readFileSync(path.join(draftDir(dir, a.id), "draft.json"), "utf-8")).author).toBe("Pat Git");
      fs.writeFileSync(path.join(draftDir(dir, a.id), "draft.json"), JSON.stringify({ title: "Old", created: "2024-01-01" }));
      expect((await ok(c.get("/api/state"))).drafts.find((d: any) => d.id === a.id)).not.toHaveProperty("author");
      expect((await ok(c.get(`/api/drafts/${b.id}/plan`))).markdown).toContain(`Draft \`${b.id}\` · by Sam`);
    } finally {
      for (const [k, v] of [["GIT_CONFIG_GLOBAL", saved.g], ["GIT_CONFIG_NOSYSTEM", saved.n]] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  it("counts the objects main changed since the draft started", async () => {
    const c = client();
    const { id } = await ok(c.post("/api/drafts", { title: "Behind" }));
    const behind = async () => (await ok(c.get("/api/state"))).drafts[0].behind;
    expect(await behind()).toBe(0);
    await ok(c.patch("/api/elements/database", { description: "Changed in main" }));
    await ok(c.post("/api/elements", { kind: "container", parentId: "internet-banking-system", name: "Cache" }));
    const n = await behind();
    expect(n).toBeGreaterThanOrEqual(2);
    expect(await behind()).toBe(n);
    // Edits in the draft itself do not count.
    await ok(c.at(`draft:${id}`).patch("/api/elements/mobile-app", { description: "Draft only" }));
    expect(await behind()).toBe(n);
  });
});

