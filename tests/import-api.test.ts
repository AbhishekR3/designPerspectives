/** Stage S5: the import routes (scan, intake, check, file, handoff, review, ignore, levels), their roles and partial apply. */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkProject } from "../src/core/report.js";
import { initProject, Project } from "../src/core/project.js";
import { buildIndex } from "../src/core/ops.js";
import { createApp } from "../src/server/app.js";
import type { ImportFile } from "../src/shared/types.js";
import { Client, client, demoDir, ok, ROLE_USERS, tmpDir } from "./helpers.js";
import { copyDemoHub, createHubApp } from "../src/server/hub.js";
import { sampleImport, typeIntake } from "./import-fixture.js";

const importDir = (dir: string) => path.join(dir, "architecture", "import");
const text = (f: ImportFile) => JSON.stringify(f);

/** A small C2 file: one verified object (a user note), one unverified, one verified relationship. */
function small(): ImportFile {
  return {
    schemaVersion: 1,
    level: "c2",
    source: { kind: "hand" },
    objects: [
      {
        id: "ledger-service",
        type: "container",
        name: "Ledger Service",
        parent: "internet-banking-system",
        description: "Keeps the ledger.",
        technologies: ["TypeScript"],
        evidence: [{ kind: "user", note: "The team said so." }],
      },
      { id: "ledger-events", type: "container", name: "Ledger Events", parent: "internet-banking-system", archType: "queue", technologies: ["Kafka"] },
    ],
    relationships: [
      { source: "api-application", target: "ledger-service", description: "Posts ledger entries to", technologies: ["HTTPS"], evidence: [{ kind: "user", note: "Seen in the design." }] },
    ],
  };
}

/** What the person "typed" for the small file's notes and for the example. */
const NOTES = ["The team said so.", "Seen in the design.", "The payments team confirmed card payments go through Stripe."];
/** A demo project whose intake holds `NOTES`. */
const typedDemo = (): string => {
  const dir = demoDir();
  typeIntake(dir, ...NOTES);
  return dir;
};

const USERS = [...ROLE_USERS, { name: "engineer2", role: "engineer" as const }];
const signedIn = (dir = demoDir()) => client(dir, { users: USERS });

/** Make an import draft of `small()` as the given client; returns its id. */
async function importDraft(c: Client, file = small(), title?: string): Promise<string> {
  return (await ok(c.post("/api/import/file", { text: text(file), ...(title ? { title } : {}) }))).draftId;
}

describe("overview, scan and intake", () => {
  it("answers with nulls before the first scan, then with the evidence summary and the analysis", async () => {
    const dir = demoDir();
    const c = client(dir);
    const before = await ok(c.get("/api/import"));
    expect(before.evidence).toBeNull();
    expect(before.analysis).toBeNull();
    expect(before.handoff).toBeNull();
    expect(before.importDrafts).toEqual([]);
    expect(before.intake.depth).toBe("c4");
    expect(before.intakeErrors).toEqual([]);
    expect(before.state).toEqual({ ignore: [], levels: { c1: false, c2: false, c3: false, c4: false } });
    expect(fs.existsSync(importDir(dir))).toBe(false); // a GET writes nothing

    const scanned = await ok(c.post("/api/import/scan"));
    expect(scanned.evidence.files.total).toBeGreaterThan(20);
    expect(scanned.evidence.facts.c4).toBeGreaterThan(20);
    expect(scanned.analysis.levels.map((l: any) => l.level)).toEqual(["c1", "c2", "c3", "c4"]);
    expect(fs.existsSync(path.join(importDir(dir), "evidence.json"))).toBe(true);
    expect(fs.existsSync(path.join(importDir(dir), "analysis.json"))).toBe(true);
    expect(await ok(c.get("/api/import"))).toEqual(scanned);
  });

  it("refuses a scan while the intake has problems, and says which fields", async () => {
    const dir = demoDir();
    const c = client(dir);
    const bad = await c.put("/api/import/intake", { depth: "c9", settings: { maxFiles: "many" } });
    expect(bad.status).toBe(422);
    const body = bad.json();
    expect(body.errors.map((e: any) => e.path).sort()).toEqual(["depth", "settings.maxFiles"]);
    expect(fs.existsSync(path.join(importDir(dir), "intake.json"))).toBe(false);
    expect((await c.put("/api/import/intake", "nonsense")).status).toBe(422);

    const saved = await ok(c.put("/api/import/intake", { system: { name: "Big Bank", purpose: "Banking." }, depth: "c3" }));
    expect(saved.intake.system.name).toBe("Big Bank");
    expect(saved.intake.depth).toBe("c3");
    expect(JSON.parse(fs.readFileSync(path.join(importDir(dir), "intake.json"), "utf-8")).depth).toBe("c3");

    fs.writeFileSync(path.join(importDir(dir), "intake.json"), "{ not json");
    expect((await ok(c.get("/api/import"))).intakeErrors).toHaveLength(1);
    const r = await c.post("/api/import/scan");
    expect(r.status).toBe(422);
    expect(r.json().detail).toMatch(/intake/);
  });
});

describe("check and file", () => {
  it("checks a file without creating anything, with the container warning against the scan", async () => {
    const dir = demoDir();
    fs.mkdirSync(path.join(dir, "sample_code", "worker"), { recursive: true });
    fs.writeFileSync(path.join(dir, "sample_code", "worker", "Dockerfile"), "FROM node:20\nCMD node main.js\n");
    const c = client(dir);
    await ok(c.post("/api/import/scan"));

    const good = await ok(c.post("/api/import/check", { text: text(small()) }));
    expect(good.errors).toEqual([]);
    expect(good.warnings.map((w: any) => w.message).join("\n")).toMatch(/container "sample_code\/worker"/);

    const ignored = { ...small(), ignore: ["c2:sample-code-worker"] };
    expect((await ok(c.post("/api/import/check", { text: text(ignored) }))).warnings.map((w: any) => w.message).join("\n")).not.toMatch(/sample_code\/worker/);
    await ok(c.post("/api/import/ignore", { path: "c2:sample-code-worker" }));
    expect((await ok(c.post("/api/import/check", { text: text(small()) }))).warnings.map((w: any) => w.message).join("\n")).not.toMatch(/sample_code\/worker/);
    const named = small();
    named.objects.push({ id: "worker", type: "container", name: "Worker", parent: "internet-banking-system", evidence: [{ kind: "user", note: "x" }] });
    await ok(c.post("/api/import/ignore", { path: "c2:sample-code-worker", remove: true }));
    expect((await ok(c.post("/api/import/check", { text: text(named) }))).warnings.map((w: any) => w.message).join("\n")).not.toMatch(/sample_code\/worker/);

    const bad = await ok(c.post("/api/import/check", { text: "{ nope" }));
    expect(bad.errors.length).toBeGreaterThan(0);
    const wrongParent = small();
    wrongParent.objects[0]!.parent = "no-such-system";
    expect((await ok(c.post("/api/import/check", { text: text(wrongParent) }))).errors.length).toBeGreaterThan(0);
    expect((await ok(c.get("/api/drafts".replace("drafts", "state")))).drafts).toEqual([]);
  });

  it("makes a draft credited to the signed-in user, with the report and the review", async () => {
    const dir = typedDemo();
    const eng = await signedIn(dir).as("engineer");
    const made = await ok(eng.post("/api/import/file", { text: text(small()), description: "From the design doc" }));
    expect(made.draftId).toBe("import-c2");
    expect(made.report.created.map((i: any) => i.id).sort()).toEqual(["api-application--ledger-service", "ledger-events", "ledger-service"]);
    const state = await ok(eng.get("/api/state"));
    expect(state.drafts[0]).toMatchObject({ id: "import-c2", title: "Import C2", author: "engineer", description: "From the design doc" });
    const review = await ok(eng.at("draft:import-c2").get("/api/import/review"));
    expect(Object.keys(review.review.items).sort()).toEqual(["object:ledger-events", "object:ledger-service", "relationship:api-application--ledger-service"]);
    expect(review.lowConfidenceKeys).toEqual(["object:ledger-events"]);
    expect(review.lowConfidence).toBe(1);

    // A second import gets a free default title; an explicit title that is taken is refused.
    expect((await ok(eng.post("/api/import/file", { text: text(small()) }))).draftId).toBe("import-c2-2");
    const clash = await eng.post("/api/import/file", { text: text(small()), title: "Import C2" });
    expect(clash.status).toBe(422);
    expect(clash.json().detail).toMatch(/already exists/);
  });

  it("refuses a file with errors, lists them, and leaves no draft", async () => {
    const c = client();
    const f = small();
    f.objects[0]!.parent = "no-such-system";
    const r = await c.post("/api/import/file", { text: text(f) });
    expect(r.status).toBe(422);
    expect(r.json().errors[0].pointer).toMatch(/^\/objects\/0/);
    expect(r.json().warnings).toEqual([]);
    const junk = await c.post("/api/import/file", { text: "[]" });
    expect(junk.status).toBe(422);
    expect(junk.json().errors.length).toBeGreaterThan(0);
    expect((await ok(c.get("/api/state"))).drafts).toEqual([]);
    expect((await c.post("/api/import/file", {})).status).toBe(422);
  });
});

describe("the demo example", () => {
  it("is offered for the demo, makes a draft, and is not offered where its objects do not fit", async () => {
    const c = client(typedDemo());
    const ex = await ok(c.get("/api/import/example"));
    expect(ex.available).toBe(true);
    expect(JSON.parse(ex.text)).toMatchObject({ schemaVersion: 1, level: "all" });
    expect((await ok(c.post("/api/import/check", { text: ex.text }))).errors).toEqual([]);
    const made = await ok(c.post("/api/import/file", { text: ex.text }));
    const review = await ok(c.at(`draft:${made.draftId}`).get("/api/import/review"));
    expect(Object.values(review.review.items).map((i: any) => i.level)).toEqual(expect.arrayContaining(["verified", "unverified"]));
    // An empty project does not have the example's parents.
    const empty = tmpDir();
    initProject(empty);
    expect(await ok(client(empty).get("/api/import/example"))).toEqual({ available: false, text: "" });
  });
});

describe("handoff", () => {
  it("writes the prompt files, then takes a hand-written result from the folder or pasted", async () => {
    const dir = demoDir();
    const c = client(dir);
    const early = await c.post("/api/import/handoff", { task: "import-level", level: "c2" });
    expect(early.status).toBe(422);
    expect(early.json().detail).toMatch(/Scan the code first/);

    await ok(c.post("/api/import/scan"));
    expect((await c.post("/api/import/handoff", { task: "nope" })).status).toBe(422);
    expect((await c.post("/api/import/handoff", { task: "import-level" })).status).toBe(422);
    const noContainer = await c.post("/api/import/handoff", { task: "import-level", level: "c3" });
    expect(noContainer.status).toBe(422);
    expect(noContainer.json().detail).toMatch(/container/);
    expect((await c.post("/api/import/handoff", { task: "import-level", level: "c3", container: "nope" })).status).toBe(422);

    const offer = await ok(c.post("/api/import/handoff", { task: "import-level", level: "c2" }));
    expect(offer).toMatchObject({ task: "import-level", output: "import-file", folder: "architecture/import/handoff" });
    expect(offer.instruction).toContain("architecture/import/handoff/prompt.md");
    expect(offer.files).toEqual(expect.arrayContaining(["prompt.md", "schema.json", "evidence-digest.md", "intake.json", "handoff.json"]));
    expect(fs.readFileSync(path.join(importDir(dir), "handoff", "prompt.md"), "utf-8")).toBe(offer.prompt);
    expect((await ok(c.get("/api/import"))).handoff.hash).toBe(offer.hash);

    // No result yet.
    const none = await c.post("/api/import/handoff/result", {});
    expect(none.status).toBe(422);
    expect(none.json().detail).toMatch(/no result yet/);

    // A result with problems comes back as errors and the text to paste to the agent; nothing is created.
    const wrong = { ...sampleImport(), level: "c1" };
    fs.writeFileSync(path.join(importDir(dir), "handoff", "result.json"), JSON.stringify(wrong));
    const refused = await c.post("/api/import/handoff/result", {});
    expect(refused.status).toBe(422);
    expect(refused.json().errors.some((e: any) => e.pointer === "/level")).toBe(true);
    expect(refused.json().pasteBack).toContain("/level");
    expect((await ok(c.get("/api/state"))).drafts).toEqual([]);

    // A good result written by hand becomes a draft.
    fs.writeFileSync(path.join(importDir(dir), "handoff", "result.json"), JSON.stringify({ ...sampleImport(), level: "c2" }));
    const made = await ok(c.post("/api/import/handoff/result", {}));
    expect(made.draftId).toBe("import-c2");
    expect(made.report.created.length).toBeGreaterThan(2);
    // The same answer pasted, with a title.
    const pasted = await ok(c.post("/api/import/handoff/result", { text: JSON.stringify({ ...sampleImport(), level: "c2" }), title: "From my agent" }));
    expect((await ok(c.get("/api/state"))).drafts.map((d: any) => d.title).sort()).toEqual(["From my agent", "Import C2"]);
    expect(pasted.draftId).toBe("from-my-agent");
    expect((await ok(c.get("/api/import"))).importDrafts.map((d: any) => d.draftId).sort()).toEqual(["from-my-agent", "import-c2"]);

    // Writing the prompt again takes the old result away: a result belongs to its prompt.
    await ok(c.post("/api/import/handoff", { task: "import-level", level: "c1" }));
    expect((await c.post("/api/import/handoff/result", {})).json().detail).toMatch(/no result yet/);
  });

  it("describes a system to a model: the task needs the text, the result is checked as an answer from a description", async () => {
    const c = client();
    expect((await c.post("/api/import/handoff", { task: "describe-to-model" })).status).toBe(422);
    const offer = await ok(c.post("/api/import/handoff", { task: "describe-to-model", text: "A ledger service keeps the books." }));
    expect(offer.prompt).toContain("A ledger service keeps the books.");
    // File evidence is not allowed for an answer from a description.
    const r = await c.post("/api/import/handoff/result", { text: text(small()) });
    expect(r.status).toBe(422);
    expect(r.json().errors.some((e: any) => /user/.test(e.message))).toBe(true);
    const mine = small();
    mine.objects[1]!.evidence = [{ kind: "user", note: "From the description." }];
    expect((await ok(c.post("/api/import/handoff/result", { text: text(mine) }))).draftId).toBe("import-c2");
  });

  it("suggests labels for relationships that say only Uses", async () => {
    const c = client();
    const rel = (await ok(c.get("/api/state"))).relationships[0];
    await ok(c.patch(`/api/relationships/${rel.id}`, { description: "Uses" }));
    const offer = await ok(c.post("/api/import/handoff", { task: "suggest-labels" }));
    expect(offer.prompt).toContain(rel.id);
  });
});

describe("review", () => {
  it("accept-all takes the verified items and skips the unverified; one item is accepted, rejected and verified by key", async () => {
    const c = signedIn(typedDemo());
    const arch = await c.as("architect");
    const id = await importDraft(arch);
    const d = arch.at(`draft:${id}`);

    const all = await ok(d.post("/api/import/review/accept-all"));
    expect(all.accepted).toEqual(["object:ledger-service", "relationship:api-application--ledger-service"]);
    expect(all.skipped).toEqual(["object:ledger-events"]);
    expect(all.review.items["object:ledger-service"]).toMatchObject({ decision: "accepted", by: "architect" });
    expect(all.review.items["object:ledger-events"].decision).toBe("pending");

    // Keys hold ":" and "--"; both the plain and the encoded form route.
    const one = await ok(d.post("/api/import/review/items/object:ledger-events", { action: "accept" }));
    expect(one.review.items["object:ledger-events"]).toMatchObject({ decision: "accepted", by: "architect" });
    const back = await ok(d.post("/api/import/review/items/object%3Aledger-events", { action: "pending" }));
    expect(back.review.items["object:ledger-events"].decision).toBe("pending");
    const verified = await ok(d.post("/api/import/review/items/relationship:api-application--ledger-service", { action: "verify" }));
    expect(verified.review.items["relationship:api-application--ledger-service"].level).toBe("verified");
    const fb = await ok(d.post("/api/import/review/items/object:ledger-events", { action: "feedback", text: "This is the broker." }));
    expect(fb.review.items["object:ledger-events"].feedback).toBe("This is the broker.");
    expect((await ok(d.post("/api/import/review/feedback", { text: "Check the queue names." }))).review.draftFeedback).toBe("Check the queue names.");

    // Reject takes the item out of the draft.
    const rej = await ok(d.post("/api/import/review/items/object:ledger-events", { action: "reject" }));
    expect(rej.review.items["object:ledger-events"].decision).toBe("rejected");
    expect(rej.reverted.length).toBeGreaterThan(0);
    const els = (await ok(d.get("/api/state"))).elements.map((e: any) => e.id);
    expect(els).toContain("ledger-service");
    expect(els).not.toContain("ledger-events");
    expect((await d.post("/api/import/review/items/object:ledger-events", { action: "accept" })).status).toBe(422);

    // Bad requests.
    expect((await d.post("/api/import/review/items/object:ledger-service", { action: "bless" })).status).toBe(422);
    expect((await d.post("/api/import/review/items/object:nothing", { action: "accept" })).status).toBe(404);
    expect((await d.post("/api/import/review/items/nonsense", { action: "accept" })).status).toBe(422);
    expect((await arch.post("/api/import/review/accept-all")).status).toBe(422); // no draft selected
    expect((await arch.at("draft:no-such").get("/api/import/review")).status).toBe(404);
    expect((await ok(d.get("/api/import"))).importDrafts[0]).toMatchObject({ draftId: id, byDecision: { accepted: 2, rejected: 1, pending: 0 } });
  });

  it("a draft that is not an import draft has no review", async () => {
    const c = client();
    const id = (await ok(c.post("/api/drafts", { title: "Plain" }))).id;
    expect((await c.at(`draft:${id}`).get("/api/import/review")).status).toBe(404);
    expect((await c.at(`draft:${id}`).post("/api/import/review/verify")).status).toBe(422);
  });

  it("apply brings in the accepted items and keeps the rest in the draft; nothing accepted refuses", async () => {
    const dir = demoDir();
    const c = client(dir);
    const id = await importDraft(c);
    const d = c.at(`draft:${id}`);

    const refused = await c.post(`/api/drafts/${id}/apply`);
    expect(refused.status).toBe(422);
    expect((await ok(c.get(`/api/drafts/${id}/apply-preview`))).held).toMatchObject({ items: 3, nothingAccepted: true });

    await ok(d.post("/api/import/review/items/object:ledger-service", { action: "accept" }));
    const preview = await ok(c.get(`/api/drafts/${id}/apply-preview`));
    expect(preview.held.items).toBe(2);
    const applied = await ok(c.post(`/api/drafts/${id}/apply`));
    expect(applied).toEqual({ ok: true, kept: true, held: 2 });

    const main = new Project(dir);
    const idx = buildIndex(main.workspace);
    expect(idx.elements.has("ledger-service")).toBe(true);
    expect(idx.elements.has("ledger-events")).toBe(false);
    expect(idx.relationships.has("api-application--ledger-service")).toBe(false);
    const review = (await ok(d.get("/api/import/review"))).review;
    expect(Object.keys(review.items).sort()).toEqual(["object:ledger-events", "relationship:api-application--ledger-service"]);
    expect((await ok(c.get("/api/state"))).drafts.map((x: any) => x.id)).toEqual([id]);

    // An ordinary draft is applied whole, as before.
    const plain = (await ok(c.post("/api/drafts", { title: "Plain" }))).id;
    expect(await ok(c.post(`/api/drafts/${plain}/apply`))).toEqual({ ok: true, kept: false, held: 0 });
  });
});

describe("ignore list and levels", () => {
  it("changes the ignore list and shows it in the analysis", async () => {
    const dir = demoDir();
    const c = client(dir);
    await ok(c.post("/api/import/scan"));
    const a = await ok(c.post("/api/import/ignore", { path: "sample_code/pipeline" }));
    expect(a.state.ignore).toEqual(["sample_code/pipeline"]);
    expect(a.analysis.levels[3].ignored).toBeGreaterThan(0);
    expect((await ok(c.post("/api/import/ignore", { path: "sample_code/pipeline", remove: true }))).state.ignore).toEqual([]);
    for (const bad of [{}, { path: "" }, { path: "../outside" }, { path: "/etc" }, { path: "x", remove: "yes" }])
      expect((await c.post("/api/import/ignore", bad)).status, JSON.stringify(bad)).toBe(422);
  });

  it("refuses to finalize with the unmet conditions, finalizes when there are none, and reopens", async () => {
    const dir = demoDir();
    const c = client(dir);
    const early = await c.post("/api/import/levels/c4", { final: true });
    expect(early.status).toBe(422);
    expect(early.json().detail).toMatch(/Scan the code first/);
    expect((await c.post("/api/import/levels/c9", { final: true })).status).toBe(422);
    expect((await c.post("/api/import/levels/c1", {})).status).toBe(422);

    const scanned = await ok(c.post("/api/import/scan"));
    const refused = await c.post("/api/import/levels/c1", { final: true });
    expect(refused.status).toBe(422);
    expect(refused.json().unmet.length).toBeGreaterThan(0);
    expect(refused.json().detail).toMatch(/C1 cannot be finalized/);

    // C4 can be finalized once every unmapped file is ignored.
    for (const p of scanned.analysis.levels[3].unmapped) await ok(c.post("/api/import/ignore", { path: p }));
    const done = await ok(c.post("/api/import/levels/c4", { final: true }));
    expect(done.state.levels.c4).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(importDir(dir), "levels.json"), "utf-8")).c4).toBe(true);
    expect((await ok(c.post("/api/import/levels/c4", { final: false }))).state.levels.c4).toBe(false);
  });

  it("counts items waiting for an explicit accept, and refuses to finalize while they wait", async () => {
    const dir = typedDemo();
    const c = client(dir);
    await ok(c.post("/api/import/scan"));
    await importDraft(c);
    const o = await ok(c.get("/api/import"));
    expect(o.analysis.levels[1].lowConfidence).toBe(1);
    const r = await c.post("/api/import/levels/c2", { final: true });
    expect(r.status).toBe(422);
    expect(r.json().unmet.join(" ")).toMatch(/low-confidence/);
    expect(r.json().lowConfidence).toBe(1);
  });
});

describe("unmapped code (dp check)", () => {
  it("warns about source files under a mapped container that no component maps, only after a scan and within the depth", async () => {
    const dir = demoDir();
    const c = client(dir);
    await ok(c.patch("/api/elements/payments-service", { codePaths: ["sample_code/payments"] }));
    fs.writeFileSync(path.join(dir, "sample_code", "payments", "loose.ts"), "export const loose = 1;\n");
    const warnings = () => checkProject(new Project(dir)).warnings.filter((w) => /unmapped/.test(w));
    expect(warnings()).toEqual([]); // no import has been started

    await ok(c.post("/api/import/scan"));
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toMatch(/Payments Service.*1 source file.*loose\.ts/);

    await ok(c.post("/api/import/ignore", { path: "sample_code/payments/loose.ts" }));
    expect(warnings()).toEqual([]);
    await ok(c.post("/api/import/ignore", { path: "sample_code/payments/loose.ts", remove: true }));
    expect(warnings()).toHaveLength(1);
    await ok(c.put("/api/import/intake", { depth: "c2" }));
    expect(warnings()).toEqual([]);
  });
});

describe("roles", () => {
  const ROUTES: [method: "POST" | "PUT", url: string, body: unknown, kind: "import" | "review" | "final"][] = [
    ["POST", "/api/import/scan", {}, "import"],
    ["PUT", "/api/import/intake", {}, "import"],
    ["POST", "/api/import/check", { text: "{}" }, "import"],
    ["POST", "/api/import/file", { text: "{}" }, "import"],
    ["POST", "/api/import/handoff", { task: "suggest-labels" }, "import"],
    ["POST", "/api/import/handoff/result", { text: "x" }, "import"],
    ["POST", "/api/import/review/items/object:x", { action: "verify" }, "review"],
    ["POST", "/api/import/review/verify", {}, "review"],
    ["POST", "/api/import/review/accept-all", {}, "review"],
    ["POST", "/api/import/review/feedback", { text: "" }, "review"],
    ["POST", "/api/import/ignore", { path: "x" }, "final"],
    ["POST", "/api/import/levels/c1", { final: false }, "final"],
  ];
  const send = (c: Client, [m, url, body]: (typeof ROUTES)[number]) => c.req(m, url, body);

  it("viewers and a read-only server refuse every change", async () => {
    const dir = demoDir();
    const viewer = await signedIn(dir).as("viewer");
    for (const r of ROUTES) expect((await send(viewer, r)).status, r[1]).toBe(403);
    const app = new Client("", {}, createApp(demoDir(), { readOnly: true }));
    for (const r of ROUTES) expect((await send(app, r)).status, r[1]).toBe(403);
    // They can still look.
    expect((await viewer.get("/api/import")).status).toBe(200);
    expect((await app.get("/api/import")).status).toBe(200);
  });

  it("engineers import and review their own drafts, but not finalize, and not on main or another's draft", async () => {
    const dir = demoDir();
    const base = signedIn(dir);
    const eng = await base.as("engineer");
    const eng2 = await base.as("engineer2");
    const arch = await base.as("architect");
    for (const r of ROUTES.filter((x) => x[3] === "import")) expect((await send(eng, r)).status, r[1]).not.toBe(403);
    for (const r of ROUTES.filter((x) => x[3] === "final")) expect((await send(eng, r)).status, r[1]).toBe(403);
    for (const r of ROUTES.filter((x) => x[3] === "review")) expect((await send(eng, r)).status, `${r[1]} on main`).toBe(403);

    const mine = await importDraft(eng, small(), "Mine");
    const theirs = await importDraft(arch, small(), "Architect's");
    const own = eng.at(`draft:${mine}`);
    expect((await own.post("/api/import/review/accept-all")).status).toBe(200);
    expect((await own.post("/api/import/review/items/object:ledger-events", { action: "accept" })).status).toBe(200);
    expect((await ok(own.get("/api/import/review"))).review.items["object:ledger-events"].by).toBe("engineer");
    for (const other of [eng2.at(`draft:${mine}`), eng.at(`draft:${theirs}`)]) {
      for (const r of ROUTES.filter((x) => x[3] === "review")) {
        const res = await send(other, r);
        expect(res.status, r[1]).toBe(403);
        expect(res.json().detail).toMatch(/belongs to|no recorded author/);
      }
    }
    // Reading another's review is fine; applying is the architect's.
    expect((await eng2.at(`draft:${mine}`).get("/api/import/review")).status).toBe(200);
    expect((await eng.post(`/api/drafts/${mine}/apply`)).status).toBe(403);
    // The architect does it all.
    for (const r of ROUTES.filter((x) => x[3] !== "review")) expect((await send(arch, r)).status, r[1]).not.toBe(403);
    expect((await arch.at(`draft:${mine}`).post("/api/import/review/verify")).status).toBe(200);
  });
});

describe("hub", () => {
  it("acts on the project named by X-DP-Project", async () => {
    const dir = tmpDir();
    copyDemoHub(dir);
    const { app } = createHubApp(dir, {});
    const hub = new Client("", {}, app);
    const projects = (await ok(hub.get("/api/hub"))).projects as { id: string }[];
    expect(projects.length).toBeGreaterThan(1);
    const [a, b] = projects.map((p) => new Client("", {}, app, { "X-DP-Project": p.id }));
    expect((await ok(a!.get("/api/import"))).evidence).toBeNull();
    const scanned = await ok(a!.post("/api/import/scan"));
    expect(scanned.evidence).not.toBeNull();
    expect((await ok(b!.get("/api/import"))).evidence).toBeNull(); // the other project is untouched
    expect((await ok(a!.get("/api/import"))).evidence).not.toBeNull();
  });
});
