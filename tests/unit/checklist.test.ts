/** The checklist (DEC-083): items, starter lists, checks dp makes itself, roles, and BMO's questions from an import with their answers. */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { answerNotes, ChecklistStore, checklistPath, MAX_ITEMS, parseChecklist, STARTERS, TEXT_MAX, typedAnswers } from "../../src/core/checklist.js";
import { Drafts } from "../../src/core/drafts.js";
import { Project } from "../../src/core/project.js";
import { importFeedback } from "../../src/assistant/importTasks.js";
import type { ImportFile } from "../../src/shared/types.js";
import { client, demoDir, ok, tmpDir } from "./helpers.js";

const file = (dir: string) => checklistPath(dir);

/** A small C2 import file with a question, an assumption and a note that quotes what a person typed. */
function asking(note = "Ledger writes go through their own service"): ImportFile {
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
        evidence: [{ kind: "user", note }],
      },
    ],
    relationships: [],
    questions: ["Is the ledger its own deployable?", "  Who owns the mainframe?  "],
    assumptions: ["The ledger runs next to the API."],
  };
}

describe("checklist items", () => {
  it("starts empty with no file, then adds, changes, ticks, answers, links and deletes", async () => {
    const dir = demoDir();
    const c = client(dir);
    const empty = await ok(c.get("/api/checklist"));
    expect(empty.items).toEqual([]);
    expect(empty.summary).toEqual({ open: 0, done: 0, skipped: 0, total: 0, fromBmo: 0 });
    expect(empty.starters.map((s: any) => s.id)).toEqual(["start", "import"]);
    expect(fs.existsSync(file(dir))).toBe(false);

    const item = await ok(c.post("/api/checklist", { text: "  Ask   ops about the batch job ", kind: "question", target: { type: "element", id: "api-application" } }));
    expect(item).toMatchObject({ text: "Ask ops about the batch job", kind: "question", section: "My items", status: "open", source: "person", target: { type: "element", id: "api-application" } });
    expect(item.missing).toBeUndefined();

    const answered = await ok(c.patch(`/api/checklist/${item.id}`, { answer: "  It runs nightly at 2am.\n", section: "Ops" }));
    expect(answered).toMatchObject({ answer: "It runs nightly at 2am.", section: "Ops" });
    expect(answered.answeredBy).toBeTruthy();

    const done = await ok(c.patch(`/api/checklist/${item.id}`, { status: "done" }));
    expect(done.status).toBe("done");
    expect(done.doneAt).toBeTruthy();
    const reopened = await ok(c.patch(`/api/checklist/${item.id}`, { status: "open", target: null, answer: "" }));
    expect(reopened).not.toHaveProperty("doneAt");
    expect(reopened).not.toHaveProperty("target");
    expect(reopened).not.toHaveProperty("answer");

    const list = await ok(c.get("/api/checklist"));
    expect(list.summary).toMatchObject({ open: 1, total: 1 });

    await ok(c.delete(`/api/checklist/${item.id}`));
    expect((await c.delete(`/api/checklist/${item.id}`)).status).toBe(404);
    expect((await ok(c.get("/api/checklist"))).items).toEqual([]);
  });

  it("refuses what is not valid and says what is wrong", async () => {
    const c = client();
    expect((await c.post("/api/checklist", { text: "   " })).status).toBe(422);
    expect((await c.post("/api/checklist", { text: "x".repeat(TEXT_MAX + 1) })).status).toBe(422);
    expect((await c.post("/api/checklist", { text: "ok", kind: "chore" })).status).toBe(422);
    expect((await c.post("/api/checklist", { text: "ok", target: { type: "flow", id: "x" } })).status).toBe(422);
    const item = await ok(c.post("/api/checklist", { text: "ok" }));
    expect((await c.patch(`/api/checklist/${item.id}`, {})).status).toBe(422);
    expect((await c.patch(`/api/checklist/${item.id}`, { status: "maybe" })).status).toBe(422);
    expect((await c.patch("/api/checklist/k-nothere", { status: "done" })).status).toBe(404);
    expect((await c.post("/api/checklist/starters/nope", {})).status).toBe(422);
    expect((await c.post("/api/checklist/clear", { status: "open" })).status).toBe(422);
  });

  it("marks an item whose object is not in the version shown", async () => {
    const dir = demoDir();
    const c = client(dir);
    const item = await ok(c.post("/api/checklist", { text: "Rename it", target: { type: "element", id: "gone-thing" } }));
    expect(item.missing).toBe(true);
    const diagram = await ok(c.post("/api/checklist", { text: "Tidy it", target: { type: "diagram", id: "landscape" } }));
    expect(diagram.missing).toBeUndefined();
  });

  it("writes a stable file that a hand edit cannot break", async () => {
    const dir = demoDir();
    const c = client(dir);
    await ok(c.post("/api/checklist", { text: "First" }));
    await ok(c.post("/api/checklist", { text: "Second", kind: "assumption" }));
    const text = fs.readFileSync(file(dir), "utf-8");
    const data = JSON.parse(text);
    expect(data.items.map((i: any) => i.text)).toEqual(["First", "Second"]);
    expect(Object.keys(data.items[0])).toEqual(["id", "kind", "section", "text", "status", "source", "author", "at"]);
    // A hand edit with bad entries keeps the good ones.
    fs.writeFileSync(file(dir), JSON.stringify({ items: [data.items[0], { id: "x" }, { ...data.items[1], status: "weird", kind: "odd" }, data.items[0]] }));
    const items = (await ok(c.get("/api/checklist"))).items;
    expect(items.map((i: any) => [i.text, i.status, i.kind])).toEqual([
      ["First", "open", "task"],
      ["Second", "open", "task"],
    ]);
    expect(parseChecklist("not json")).toEqual([]);
  });

  it("caps the number of items", () => {
    const dir = tmpDir();
    const store = new ChecklistStore(path.join(dir, "architecture", "checklist.json"));
    fs.mkdirSync(path.join(dir, "architecture"));
    fs.writeFileSync(store.file, JSON.stringify({ items: Array.from({ length: MAX_ITEMS }, (_, n) => ({ id: `k-${n}`, text: `Item ${n}`, at: "2026-11-16T00:00:00.000Z" })) }));
    expect(() => store.add({ text: "one more", author: "Sam" })).toThrow(/at most/);
    expect(store.addFromImport("d", ["A question nobody asked"], [])).toBe(0);
  });
});

describe("starter lists and the checks dp makes", () => {
  it("adds a starter list once, and a second list without the items both share", async () => {
    const c = client();
    const start = await ok(c.post("/api/checklist/starters/start", {}));
    const n = STARTERS[0]!.items.length;
    expect(start.items).toHaveLength(n);
    expect(start.starters[0]).toMatchObject({ id: "start", added: n, total: n });
    expect((await ok(c.post("/api/checklist/starters/start", {}))).items).toHaveLength(n);
    const both = await ok(c.post("/api/checklist/starters/import", {}));
    const shared = STARTERS[1]!.items.filter((x) => STARTERS[0]!.items.some((y) => y.key === x.key)).length;
    expect(shared).toBeGreaterThan(0);
    expect(both.items).toHaveLength(n + STARTERS[1]!.items.length - shared);
    expect(both.items.every((i: any) => i.source === "starter")).toBe(true);
  });

  it("ticks a rule item while the model passes, lists what fails, and only lets a person skip it", async () => {
    const dir = demoDir();
    const c = client(dir);
    const items = (await ok(c.post("/api/checklist/starters/start", {}))).items;
    const labels = items.find((i: any) => i.rule === "labels");
    const people = items.find((i: any) => i.rule === "people");
    expect(people).toMatchObject({ status: "done", doneBy: "dp", check: { passing: true } });

    // Make one line say "Uses": the labels check fails and names it.
    const rel = (await ok(c.get("/api/state"))).relationships[0];
    await ok(c.patch(`/api/relationships/${rel.id}`, { description: "Uses" }));
    const after = (await ok(c.get("/api/checklist"))).items.find((i: any) => i.id === labels.id);
    expect(after.status).toBe("open");
    expect(after.check.passing).toBe(false);
    expect(after.check.ids).toContain(rel.id);
    expect(after.check.detail).toMatch(/"Uses"/);

    const refused = await c.patch(`/api/checklist/${labels.id}`, { status: "done" });
    expect(refused.status).toBe(422);
    expect(refused.text).toMatch(/Skip it/);
    expect((await ok(c.patch(`/api/checklist/${labels.id}`, { status: "skipped" }))).status).toBe("skipped");
  });

  it("checks the version shown: a draft's change shows only in the draft", async () => {
    const dir = demoDir();
    const c = client(dir);
    await ok(c.post("/api/checklist/starters/start", {}));
    const id = (await ok(c.post("/api/drafts", { title: "No people" }))).id;
    const d = c.at(`draft:${id}`);
    const st = await ok(d.get("/api/state"));
    const person = st.elements.find((e: any) => e.kind === "person");
    await ok(d.post("/api/elements/delete", { ids: st.elements.filter((e: any) => e.kind === "person").map((e: any) => e.id) }));
    const rule = (r: any) => r.items.find((i: any) => i.rule === "people");
    expect(rule(await ok(d.get("/api/checklist"))).status).toBe("open");
    expect(rule(await ok(c.get("/api/checklist"))).status).toBe("done");
    expect(person).toBeTruthy();
  });

  it("the import rules read the import files", async () => {
    const dir = demoDir();
    const c = client(dir);
    const items = (await ok(c.post("/api/checklist/starters/import", {}))).items;
    const by = (r: string) => items.find((i: any) => i.rule === r);
    expect(by("scan")).toMatchObject({ status: "open", check: { detail: "The code has not been scanned yet." } });
    expect(by("intake").check.detail).toMatch(/Not answered yet: system.name/);
    expect(by("level-c1").status).toBe("open");
    expect(by("review")).toMatchObject({ status: "done" });
    await ok(c.post("/api/import/scan", {}));
    const scanned = (await ok(c.get("/api/checklist"))).items.find((i: any) => i.rule === "scan");
    expect(scanned.status).toBe("done");
  });

  it("clears done items, including the ones dp ticked", async () => {
    const c = client();
    await ok(c.post("/api/checklist/starters/start", {}));
    const mine = await ok(c.post("/api/checklist", { text: "Done by hand" }));
    await ok(c.patch(`/api/checklist/${mine.id}`, { status: "done" }));
    const before = await ok(c.get("/api/checklist"));
    const after = await ok(c.post("/api/checklist/clear", { status: "done" }));
    expect(after.items).toHaveLength(before.items.length - before.summary.done);
    expect(after.items.some((i: any) => i.status === "done")).toBe(false);
  });
});

describe("roles", () => {
  it("architects and engineers change the checklist; a viewer and a read-only server only read it", async () => {
    const dir = demoDir();
    const anon = client(dir, { users: true });
    for (const role of ["architect", "engineer"]) {
      const c = await anon.as(role);
      const item = await ok(c.post("/api/checklist", { text: `From ${role}` }));
      expect(item.author).toBe(role);
      expect((await ok(c.get("/api/state"))).can.checklist).toBe(true);
    }
    const viewer = await anon.as("viewer");
    expect((await ok(viewer.get("/api/checklist"))).items).toHaveLength(2);
    expect((await ok(viewer.get("/api/state"))).can.checklist).toBe(false);
    expect((await viewer.post("/api/checklist", { text: "No" })).status).toBe(403);
    expect((await viewer.post("/api/checklist/starters/start", {})).status).toBe(403);

    const other = demoDir();
    fs.copyFileSync(file(dir), file(other));
    const ro = client(other, { readOnly: true });
    expect((await ok(ro.get("/api/checklist"))).items).toHaveLength(2);
    expect((await ok(ro.get("/api/state"))).can.checklist).toBe(false);
    expect((await ro.post("/api/checklist", { text: "No" })).status).toBe(403);
  });
});

describe("BMO's questions and the answers", () => {
  it("an import puts the file's questions and assumptions on the checklist once", async () => {
    const dir = demoDir();
    const c = client(dir);
    const r = await ok(c.post("/api/import/file", { text: JSON.stringify(asking()) }));
    expect(r.checklistAdded).toBe(3);
    const list = await ok(c.get("/api/checklist"));
    expect(list.summary.fromBmo).toBe(3);
    expect(list.items.map((i: any) => [i.kind, i.text, i.source, i.draft])).toEqual([
      ["question", "Is the ledger its own deployable?", "bmo", r.draftId],
      ["question", "Who owns the mainframe?", "bmo", r.draftId],
      ["assumption", "The ledger runs next to the API.", "bmo", r.draftId],
    ]);
    // The same questions again (another wording of the spacing and the full stop) are not added twice.
    const again = asking();
    again.questions = ["is the ledger its own deployable"];
    const r2 = await ok(c.post("/api/import/file", { text: JSON.stringify(again), title: "Again" }));
    expect(r2.checklistAdded).toBe(0);
    // Nothing of it is in the model.
    expect(fs.readFileSync(path.join(dir, "architecture", "workspace.json"), "utf-8")).not.toMatch(/Who owns|next to the API/);
  });

  it("an answer typed on the checklist verifies a note that quotes it, and goes to BMO's next turn", async () => {
    const dir = demoDir();
    const c = client(dir);
    const first = await ok(c.post("/api/import/file", { text: JSON.stringify(asking()) }));
    const review = async (id: string) => (await ok(c.at(`draft:${id}`).get("/api/import/review"))).review.items["object:ledger-service"];
    expect((await review(first.draftId)).level).toBe("unverified");

    const q = (await ok(c.get("/api/checklist"))).items.find((i: any) => i.text === "Is the ledger its own deployable?");
    await ok(c.patch(`/api/checklist/${q.id}`, { answer: "Yes: ledger writes go through their own service, deployed alone." }));
    const a = (await ok(c.get("/api/checklist"))).items.find((i: any) => i.kind === "assumption");
    await ok(c.patch(`/api/checklist/${a.id}`, { status: "done" }));

    // Checked again, the note is found in the answer.
    expect((await ok(c.at(`draft:${first.draftId}`).post("/api/import/review/verify", {}))).review.items["object:ledger-service"].level).not.toBe("unverified");
    // The question's own text is BMO's: quoting it verifies nothing.
    expect(typedAnswers(dir)).toEqual(["Yes: ledger writes go through their own service, deployed alone."]);

    const notes = importFeedback(new Drafts(new Project(dir)));
    expect(notes).toContainEqual({ id: null, text: 'Answer to the question "Is the ledger its own deployable?": Yes: ledger writes go through their own service, deployed alone.' });
    expect(notes).toContainEqual({ id: null, text: 'The person confirmed the assumption "The ledger runs next to the API.".' });
    expect(answerNotes(dir)).toHaveLength(2);
  });

  it("the text of an item a person wrote counts as typed; a BMO item's text does not, even edited", async () => {
    const dir = demoDir();
    const c = client(dir);
    await ok(c.post("/api/import/file", { text: JSON.stringify(asking()) }));
    const q = (await ok(c.get("/api/checklist"))).items[0];
    await ok(c.patch(`/api/checklist/${q.id}`, { text: "Is the ledger deployed alone?" }));
    await ok(c.post("/api/checklist", { text: "The ledger is owned by the payments team" }));
    expect(typedAnswers(dir)).toEqual(["The ledger is owned by the payments team"]);
  });
});
