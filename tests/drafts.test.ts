import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Drafts } from "../src/core/drafts.js";
import { createFlow, listFlows, updateFlow } from "../src/core/flows.js";
import { buildIndex, createElement, createRelationship, deleteElement, updateElement } from "../src/core/ops.js";
import { atomicWrite, Project } from "../src/core/project.js";
import { errors } from "../src/core/validate.js";
import { importFilePath, reviewPath } from "../src/import/ledger.js";
import { checkProject } from "../src/core/report.js";
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
    // changed: the database, and the "Payment confirmation" flow, which loses its step into the mobile app.
    expect(st.compare.summary).toMatchObject({ added: 1, changed: 2 });

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
    expect(
      r
        .json()
        .conflicts.map((x: any) => x.reason)
        .join(" "),
    ).toMatch(/Billing/);
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
      for (const [k, v] of [
        ["GIT_CONFIG_GLOBAL", saved.g],
        ["GIT_CONFIG_NOSYSTEM", saved.n],
      ] as const) {
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

  it("the shipped demo has a sample draft that loads, shows its changes, can be applied and checks clean", async () => {
    const dir = demoDir({ withSampleDraft: true });
    const c = client(dir);
    const st = await ok(c.get("/api/state"));
    expect(st.drafts).toMatchObject([{ id: "tell-customers-when-a-payment-is-held", author: "Demo", created: "2026-11-09", behind: 0 }]);
    const d = c.at(`draft:${st.drafts[0].id}`, "base");
    const changes = await ok(d.get("/api/changes"));
    expect(changes.elements.map((e: any) => [e.name, e.change]).sort()).toEqual([
      ["Held Payment Notifier", "added"],
      ["Payments Service", "changed"],
    ]);
    expect(changes.relationships).toMatchObject([{ change: "added" }]);
    expect(changes.decisions).toMatchObject([{ change: "added" }]);
    // Against main as it is now: the same, since main has not moved (and it says so in the title).
    const now = await ok(c.at(`draft:${st.drafts[0].id}`, "main").get("/api/state"));
    expect(now.compare).toMatchObject({ against: "main", title: "Main model as it is now", summary: changes.summary });
    expect((await ok(c.get(`/api/drafts/${st.drafts[0].id}/apply-preview`))).conflicts).toEqual([]);
    const res = checkProject(new Project(dir));
    expect(res).toEqual({ errors: [], warnings: [] });
  });

  it("a draft compared with main as it is now shows what main changed after the draft started, as well as the draft's own changes", async () => {
    const c = client();
    const { id } = await ok(c.post("/api/drafts", { title: "Compare" }));
    await ok(c.at(`draft:${id}`).patch("/api/elements/mobile-app", { description: "Draft only" }));
    await ok(c.patch("/api/elements/database", { description: "Main only" }));
    const names = async (cmp: string) => (await ok(c.at(`draft:${id}`, cmp).get("/api/changes"))).elements.map((e: any) => e.id).sort();
    expect(await names("base")).toEqual(["mobile-app"]);
    expect(await names("main")).toEqual(["database", "mobile-app"]);
  });

  it("apply of a plain draft returns that it was applied whole; import state left under its ID is dropped when it is made", () => {
    const dir = demoDir();
    const main = new Project(dir);
    const drafts = new Drafts(main);
    // A review file left by a draft folder deleted by hand must not make the next draft with that ID an import.
    atomicWrite(reviewPath(main.dir, "plain"), "{}");
    atomicWrite(importFilePath(main.dir, "plain"), "{}");
    const id = drafts.create("Plain");
    expect(id).toBe("plain");
    expect(fs.existsSync(reviewPath(main.dir, id))).toBe(false);
    expect(fs.existsSync(importFilePath(main.dir, id))).toBe(false);
    drafts.get(id).edit((ws, sc) => updateElement(ws, sc, "atm", { name: "Cash Machine" }));
    expect(drafts.preview(id).held).toBeUndefined();
    expect(drafts.apply(id)).toEqual({ kept: false, held: 0 });
    expect(buildIndex(main.workspace).el("atm").name).toBe("Cash Machine");
  });

  it("revertUnits takes a new element out of a draft with its children, relationships, flow steps and decision mentions", () => {
    const dir = demoDir();
    const main = new Project(dir);
    const drafts = new Drafts(main);
    const id = drafts.create("Cache");
    const draft = drafts.get(id);
    let kept = "";
    draft.edit((ws, _sc, decs) => {
      createElement(ws, { kind: "container", id: "cache", name: "Cache", parentId: "internet-banking-system" });
      createElement(ws, { kind: "component", id: "cache-client", name: "Cache Client", parentId: "cache" });
      createRelationship(ws, { sourceId: "api-application", destinationId: "cache", description: "Reads from" });
      createRelationship(ws, { sourceId: "cache-client", destinationId: "database", description: "Fills from" });
      kept = createRelationship(ws, { sourceId: "web-application", destinationId: "api-application", description: "Calls for pages" });
      const key = createFlow(ws, "Cached read");
      updateFlow(ws, key, { steps: [{ relationshipId: kept }, { relationshipId: "api-application--cache" }] });
      decs[0]!.affects = [...decs[0]!.affects, "cache"];
    });
    const keys = drafts.revertUnits(id, ["el:cache"]);
    expect(keys).toEqual(["el:cache", "el:cache-client", "rel:api-application--cache", "rel:cache-client--database", "view:components-cache"]);
    const idx = buildIndex(draft.workspace);
    expect(idx.elements.has("cache")).toBe(false);
    expect(idx.relationships.has(kept)).toBe(true);
    expect(
      listFlows(draft.workspace)
        .find((f) => f.title === "Cached read")!
        .steps.map((s) => s.relationshipId),
    ).toEqual([kept]);
    expect(draft.decisions[0]!.affects).not.toContain("cache");
    expect(errors(draft.workspace, draft.sidecar, draft.decisions)).toEqual([]);
    expect(draft.undoStack.length).toBe(2);
    // Nothing left to revert: no change, no undo step.
    expect(drafts.revertUnits(id, ["el:cache"])).toEqual([]);
    expect(draft.undoStack.length).toBe(2);
  });

  it("revertUnits brings back a removed element with the parent it needs", () => {
    const dir = demoDir();
    const main = new Project(dir);
    const drafts = new Drafts(main);
    const id = drafts.create("Drop statements");
    const draft = drafts.get(id);
    draft.edit((ws) => {
      deleteElement(ws, "statement-job");
    });
    expect(buildIndex(draft.workspace).elements.has("pdf-renderer")).toBe(false);
    const keys = drafts.revertUnits(id, ["el:pdf-renderer"]);
    expect(keys).toEqual(["el:pdf-renderer", "el:statement-job"]);
    const idx = buildIndex(draft.workspace);
    expect(idx.parentOf("pdf-renderer")).toBe("statement-job");
    expect(idx.elements.has("batch-fetcher")).toBe(false); // only what was asked for, and what it needs
    expect(errors(draft.workspace, draft.sidecar, draft.decisions)).toEqual([]);
  });
});
