/** The linked work routes (DEC-085): list, replace a target's list, push items, import a report; drafts, roles and limits. */

import { describe, expect, it } from "vitest";
import { client, demoDir, ok, type Client } from "./helpers.js";

const REL = "internet-banking-system--mainframe-banking-system";
const version = async (c: Client) => (await ok(c.get("/api/state"))).version as string;
const rowsOf = async (c: Client) => (await ok(c.get("/api/work"))).rows as any[];
const sarif = (...results: unknown[]) => JSON.stringify({ version: "2.1.0", runs: [{ tool: { driver: { name: "t" } }, results }] });
const finding = (uri: string, text = "Finding", fp = `fp-${uri}-${text}`) => ({
  ruleId: "r",
  message: { text },
  partialFingerprints: { a: fp },
  locations: [{ physicalLocation: { artifactLocation: { uri } } }],
});

describe("GET and PUT", () => {
  it("lists items on an element, a relationship, a diagram, a flow and the project", async () => {
    const c = client();
    const targets = [{ type: "element", id: "api-application" }, { type: "relationship", id: REL }, { type: "diagram", id: "landscape" }, { type: "diagram", id: "flow-sign-in" }, { type: "project" }];
    for (const target of targets) await ok(c.put("/api/work/target", { target, work: [{ type: "backlog", title: `On ${target.type}`, severity: "low" }] }));
    const rows = await rowsOf(c);
    const mine = rows.filter((r) => r.item.title.startsWith("On "));
    expect(mine.map((r) => [r.target, r.targetKind])).toEqual([
      [{ type: "project" }, "project"],
      [targets[0], "container"],
      [targets[1], "relationship"],
      [targets[2], "diagram"],
      [targets[3], "flow"],
    ]);
    expect(mine[0]!.label).toBe("Project");
    expect(mine.every((r) => r.item.status === "open" && r.tool === null)).toBe(true);
    expect((await ok(c.get("/api/work"))).connections.length).toBeGreaterThan(0);
  });

  it("replaces a target's list, and an empty list clears it", async () => {
    const c = client();
    const target = { type: "element", id: "database" };
    await ok(c.put("/api/work/target", { target, work: [{ title: "A" }, { title: "B", status: "done" }] }));
    expect((await rowsOf(c)).filter((r) => r.target.id === "database").map((r) => r.item.title)).toEqual(["A", "B"]);
    await ok(c.put("/api/work/target", { target, work: [] }));
    expect((await rowsOf(c)).filter((r) => r.target.id === "database")).toEqual([]);
  });

  it("a connector or code diagram cannot hold work, with a hint; a bad target or item is refused", async () => {
    const c = client();
    for (const id of [`connector-${REL}`, "code-api-application"]) {
      const r = await c.put("/api/work/target", { target: { type: "diagram", id }, work: [{ title: "x" }] });
      expect(r.status, id).toBe(422);
      expect(r.json().detail).toMatch(/link it to the (relationship|element)/);
    }
    expect((await c.put("/api/work/target", { target: { type: "element", id: "nope" }, work: [{ title: "x" }] })).status).toBe(422);
    expect((await c.put("/api/work/target", { target: { type: "thing" }, work: [] })).status).toBe(422);
    expect((await c.put("/api/work/target", { target: { type: "project" }, work: [{ title: "x", status: "weird" }] })).status).toBe(422);
  });
});

describe("POST /api/work/items", () => {
  const push = (title: string, extra: object = {}, to: object = { type: "project" }) => ({ to, item: { title, key: title, ...extra } });

  it("adds, then updates by key and keeps a person's note; the same push again writes nothing", async () => {
    const c = client();
    let r = await ok(c.post("/api/work/items", { source: "ci", items: [push("one", { severity: "low", note: "first" })] }));
    expect(r).toMatchObject({ added: 1, updated: 0, closed: 0, unchanged: 0 });
    expect(r.rows).toEqual([{ to: { type: "project" }, label: "Project", title: "one", change: "added" }]);
    const v = await version(c);
    r = await ok(c.post("/api/work/items", { source: "ci", items: [push("one", { severity: "low", note: "first" })] }));
    expect(r).toMatchObject({ added: 0, updated: 0, unchanged: 1 });
    expect(await version(c)).toBe(v);

    // The person edits the note; a push with a new severity updates but keeps it.
    const row = (await rowsOf(c)).find((x) => x.item.key === "ci:one")!;
    await ok(c.put("/api/work/target", { target: { type: "project" }, work: [{ ...row.item, note: "mine" }] }));
    r = await ok(c.post("/api/work/items", { source: "ci", items: [push("one", { severity: "high", note: "from the tool" })] }));
    expect(r.updated).toBe(1);
    const after = (await rowsOf(c)).find((x) => x.item.key === "ci:one")!;
    expect(after.item).toMatchObject({ severity: "high", note: "mine" });
  });

  it("closeMissing sets the source's items that are no longer reported to done, and only that source's", async () => {
    const c = client();
    await ok(c.post("/api/work/items", { source: "ci", items: [push("a"), push("b", {}, { type: "element", id: "database" })] }));
    await ok(c.post("/api/work/items", { source: "other", items: [push("z")] }));
    const r = await ok(c.post("/api/work/items", { source: "ci", closeMissing: true, items: [push("a")] }));
    expect(r).toMatchObject({ closed: 1, unchanged: 1 });
    expect(r.rows.find((x: any) => x.change === "closed")).toMatchObject({ title: "b", label: "Database" });
    const rows = await rowsOf(c);
    expect(rows.find((x) => x.item.key === "ci:b")!.item.status).toBe("done");
    expect(rows.find((x) => x.item.key === "other:z")!.item.status).toBe("open");
    // Reported again, it opens again.
    expect((await ok(c.post("/api/work/items", { source: "ci", items: [push("b", {}, { type: "element", id: "database" })] }))).updated).toBe(1);
    expect((await rowsOf(c)).find((x) => x.item.key === "ci:b")!.item.status).toBe("open");
  });

  it("refuses closeMissing without a source, a bad source, a bad body and too many items", async () => {
    const c = client();
    const v = await version(c);
    const r = await c.post("/api/work/items", { closeMissing: true, items: [push("a")] });
    expect(r.status).toBe(422);
    expect(r.json().detail).toMatch(/needs a source/);
    expect((await c.post("/api/work/items", { source: "bad name!", items: [push("a")] })).status).toBe(422);
    expect((await c.post("/api/work/items", { items: "x" })).status).toBe(422);
    expect((await c.post("/api/work/items", { items: [{ to: { type: "project" } }] })).status).toBe(422);
    expect((await c.post("/api/work/items", { items: [push("a")], dryRun: "yes" })).status).toBe(422);
    const many = await c.post("/api/work/items", { items: Array.from({ length: 5001 }, (_, i) => push(`i${i}`)) });
    expect(many.status).toBe(422);
    expect(many.json().detail).toMatch(/5000/);
    expect(await version(c)).toBe(v);
  });

  it("an object holds at most 500 items", async () => {
    const c = client();
    const r = await c.post("/api/work/items", { items: Array.from({ length: 501 }, (_, i) => push(`i${i}`)) });
    expect(r.status).toBe(422);
    expect(r.json().detail).toMatch(/at most 500/);
    expect(await rowsOf(c)).not.toContainEqual(expect.objectContaining({ item: expect.objectContaining({ title: "i0" }) }));
  });

  it("dryRun says what would change and writes nothing", async () => {
    const c = client();
    const v = await version(c);
    const r = await ok(c.post("/api/work/items", { items: [push("a")], dryRun: true }));
    expect(r).toMatchObject({ added: 1, dryRun: true });
    expect(await version(c)).toBe(v);
    expect((await rowsOf(c)).some((x) => x.item.title === "a")).toBe(false);
  });
});

describe("POST /api/work/import", () => {
  it("pins a finding to the element whose code paths hold its file, and an unknown file to the project", async () => {
    const c = client();
    const r = await ok(c.post("/api/work/import", { format: "sarif", source: "scan", report: sarif(finding("sample_code/pipeline/mask_pii.py", "Leaks"), finding("nowhere/else.py", "Lost")) }));
    expect(r).toMatchObject({ added: 2, unmapped: 1 });
    const rows = await rowsOf(c);
    expect(rows.find((x) => x.item.title === "Leaks")!.target).toEqual({ type: "element", id: "pii-masker" });
    expect(rows.find((x) => x.item.title === "Lost")!.target).toEqual({ type: "project" });
    // A second import of the same report changes nothing; with --close-missing a finding that is gone is closed.
    const v = await version(c);
    expect(
      await ok(c.post("/api/work/import", { format: "sarif", source: "scan", report: sarif(finding("sample_code/pipeline/mask_pii.py", "Leaks"), finding("nowhere/else.py", "Lost")) })),
    ).toMatchObject({ added: 0, updated: 0, unchanged: 2 });
    expect(await version(c)).toBe(v);
    const closed = await ok(c.post("/api/work/import", { format: "sarif", source: "scan", closeMissing: true, report: sarif(finding("sample_code/pipeline/mask_pii.py", "Leaks")) }));
    expect(closed).toMatchObject({ closed: 1, unmapped: 0 });
  });

  it("dryRun writes nothing; the other formats and bad input are handled", async () => {
    const c = client();
    const v = await version(c);
    const dry = await ok(
      c.post("/api/work/import", {
        format: "gitlab-codequality",
        dryRun: true,
        report: JSON.stringify([{ description: "d", fingerprint: "f", severity: "major", location: { path: "sample_code/api/email_sender.py" } }]),
      }),
    );
    expect(dry).toMatchObject({ added: 1, dryRun: true, unmapped: 0 });
    expect(await version(c)).toBe(v);
    const dp = await ok(c.post("/api/work/import", { format: "dp", report: JSON.stringify({ items: [{ to: "diagram:flow-sign-in", item: { title: "Flow thing" } }] }) }));
    expect(dp).toMatchObject({ added: 1, unmapped: 0 });
    expect((await rowsOf(c)).find((x) => x.item.title === "Flow thing")!.targetKind).toBe("flow");

    const bad = await c.post("/api/work/import", { format: "sarif", report: "{nope" });
    expect(bad.status).toBe(422);
    expect(bad.json().detail).toMatch(/not valid JSON/);
    expect((await c.post("/api/work/import", { format: "csv", report: "[]" })).status).toBe(422);
    const notText = await c.post("/api/work/import", { format: "sarif", report: { runs: [] } });
    expect(notText.status).toBe(422);
    expect(notText.json().detail).toMatch(/5 MB/);
  });

  it("a request over the body limit is refused", async () => {
    const r = await client().post("/api/work/import", { format: "sarif", report: " ".repeat(5 * 1024 * 1024 + 1) });
    expect(r.status).toBe(413);
  });
});

describe("drafts", () => {
  it("a push with X-DP-Model: draft:<id> writes into the draft and leaves the main model alone", async () => {
    const c = client();
    const { id } = await ok(c.post("/api/drafts", { title: "Findings" }));
    const d = c.at(`draft:${id}`);
    await ok(d.post("/api/work/import", { format: "sarif", source: "scan", report: sarif(finding("sample_code/pipeline/load_warehouse.py", "In draft")) }));
    expect((await rowsOf(d)).find((x) => x.item.title === "In draft")!.target).toEqual({ type: "element", id: "warehouse-loader" });
    expect((await rowsOf(c)).some((x) => x.item.title === "In draft")).toBe(false);
    await ok(d.put("/api/work/target", { target: { type: "project" }, work: [{ title: "Project note in draft" }] }));
    expect((await rowsOf(c)).some((x) => x.item.title === "Project note in draft")).toBe(false);
  });

  it("a git version is read-only", async () => {
    const c = client(demoDir());
    const r = await c.at("ref:HEAD").post("/api/work/items", { items: [{ to: { type: "project" }, item: { title: "x" } }] });
    expect([403, 422]).toContain(r.status);
  });
});

describe("roles", () => {
  it("a viewer can read the list and not change it; an engineer works in a draft; an architect can change the main model", async () => {
    const c = client(demoDir(), { users: true });
    const viewer = await c.as("viewer");
    const body = { items: [{ to: { type: "project" }, item: { title: "x" } }] };
    expect((await viewer.get("/api/work")).status).toBe(200);
    expect((await viewer.post("/api/work/items", body)).status).toBe(403);
    expect((await viewer.post("/api/work/import", { format: "dp", report: "[]" })).status).toBe(403);
    expect((await viewer.put("/api/work/target", { target: { type: "project" }, work: [] })).status).toBe(403);
    expect((await c.get("/api/work")).status).toBe(401);
    const engineer = await c.as("engineer");
    expect((await engineer.post("/api/work/items", body)).status).toBe(403);
    const { id } = await ok(engineer.post("/api/drafts", { title: "Mine" }));
    expect((await engineer.at(`draft:${id}`).post("/api/work/items", body)).status).toBe(200);
    expect((await (await c.as("architect")).post("/api/work/items", body)).status).toBe(200);
  });
});
