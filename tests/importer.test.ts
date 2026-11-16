/** The importer (DEC-051): an import file becomes one draft; re-imports keep people's edits (the ledger). */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { diffModels } from "../src/core/diff.js";
import { Drafts } from "../src/core/drafts.js";
import { listFlows } from "../src/core/flows.js";
import { buildIndex, elementSummary, relationshipSummary, updateElement } from "../src/core/ops.js";
import { Project } from "../src/core/project.js";
import { ImportRejected, importToDraft } from "../src/import/importer.js";
import { foldApplied, ledgerPath, pendingPath, readLedger, settleLedger } from "../src/import/ledger.js";
import { readReview, setDecision } from "../src/import/review.js";
import type { ImportFile } from "../src/shared/types.js";
import { demoDir } from "./helpers.js";
import { sampleImport } from "./import-fixture.js";

const DATE = "2026-11-16";

function setup() {
  const dir = demoDir();
  const main = new Project(dir);
  const drafts = new Drafts(main);
  return { dir, main, drafts };
}

const run = (s: ReturnType<typeof setup>, file: ImportFile, title = "Import C2") => importToDraft(s.drafts, file, { title, author: "Importer", date: DATE });

/** Accept every review item (one by one, as an explicit accept), then apply: an import draft applies only accepted items. */
function applyAccepted(s: ReturnType<typeof setup>, draftId: string) {
  for (const key of Object.keys(readReview(s.main.dir, draftId)!.items)) setDecision(s.drafts, draftId, key, "accepted", "Tester");
  expect(s.drafts.apply(draftId)).toEqual({ kept: false, held: 0 });
}

/** Every file under a folder, relative path → bytes. */
function filesOf(dir: string, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) Object.assign(out, filesOf(p, `${prefix}${e.name}/`));
    else out[`${prefix}${e.name}`] = fs.readFileSync(p, "utf-8");
  }
  return out;
}

describe("importToDraft", () => {
  it("makes one draft with the file's objects, via legs, flow and decision; main is untouched", () => {
    const s = setup();
    const before = fs.readFileSync(s.main.wsPath, "utf-8");
    const { draftId, report, warnings } = run(s, sampleImport());
    expect(fs.readFileSync(s.main.wsPath, "utf-8")).toBe(before);
    expect(warnings.map((w) => w.pointer)).toEqual(["/objects/0/technologies/0"]);
    const draft = s.drafts.get(draftId);
    expect(draft.undoStack.length).toBe(1); // one undo step
    const idx = buildIndex(draft.workspace);
    const ledger = elementSummary(idx, "ledger-service");
    expect(ledger).toMatchObject({
      kind: "container",
      parentId: "internet-banking-system",
      technologies: ["TypeScript", "Node.js"],
      owner: "Payments team",
      tags: { Risk: "Low" },
      codePaths: ["sample_code/payments"],
    });
    expect(elementSummary(idx, "ledger-events")).toMatchObject({ archType: "queue", technologies: ["Kafka"] });
    // via: two relationships through the broker, with the given ids and labels
    expect(relationshipSummary(idx.rel("ledger-service--ledger-events"))).toMatchObject({ description: "Publishes ledger events to", technologies: ["Kafka"] });
    expect(relationshipSummary(idx.rel("ledger-events--database"))).toMatchObject({ description: "Delivers ledger events to", technologies: ["Kafka"] });
    expect(idx.relationships.has("ledger-service--database")).toBe(false);
    const flow = listFlows(draft.workspace).find((f) => f.title === "Post a ledger entry")!;
    expect(flow.steps.map((x) => [x.relationshipId, x.description])).toEqual([
      ["api-application--ledger-service", ""],
      ["ledger-service--ledger-events", "Publishes the entry"],
      ["ledger-events--database", ""],
    ]);
    const dec = draft.decisions.find((d) => d.title === "Keep a separate ledger service")!;
    expect(dec).toMatchObject({
      status: "proposed",
      date: DATE,
      affects: ["ledger-service", "api-application--ledger-service"],
      alternatives: [{ name: "Keep it in the API", whyNot: "Couples releases." }],
    });
    expect(report.created.map((c) => `${c.what}:${c.id}`)).toEqual([
      "element:ledger-events",
      "element:ledger-service",
      "relationship:api-application--ledger-service",
      "relationship:ledger-service--ledger-events",
      "relationship:ledger-events--database",
      "flow:flow-post-a-ledger-entry",
      `decision:${dec.id}`,
    ]);
    expect(s.drafts.info(draftId)).toMatchObject({ title: "Import C2", author: "Importer", created: DATE });
    expect(fs.existsSync(pendingPath(s.main.dir, draftId))).toBe(true);
  });

  it("never writes evidence, confidence or the review-only lists to the model", () => {
    const s = setup();
    const { draftId } = run(s, sampleImport());
    const text = Object.values(filesOf(path.join(s.drafts.dir, draftId))).join("\n");
    for (const marker of ["EVIDENCE-MARKER", "confidence", "evidence", "Who owns the ledger", "append-only", "IGNORE-MARKER", "promptVersion"]) expect(text, marker).not.toContain(marker);
  });

  it("refuses a file with errors and keeps no draft", () => {
    const s = setup();
    const f = sampleImport();
    f.relationships[0]!.description = "uses";
    let err: unknown;
    try {
      run(s, f);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ImportRejected);
    expect((err as ImportRejected).errors).toEqual([{ pointer: "/relationships/0/description", message: 'Say what flows ("Sends payment requests"), not "uses".' }]);
    expect(s.drafts.list()).toEqual([]);
    expect(fs.existsSync(path.join(s.main.dir, "import"))).toBe(false);
  });

  it("is deterministic: the same file into two fresh copies gives the same files, byte for byte", () => {
    const a = setup();
    const b = setup();
    const ra = run(a, sampleImport());
    const rb = run(b, sampleImport());
    expect(ra.draftId).toBe(rb.draftId);
    expect(filesOf(path.join(a.drafts.dir, ra.draftId))).toEqual(filesOf(path.join(b.drafts.dir, rb.draftId)));
    expect(fs.readFileSync(pendingPath(a.main.dir, ra.draftId), "utf-8")).toBe(fs.readFileSync(pendingPath(b.main.dir, rb.draftId), "utf-8"));
  });

  it("round trip: applied, the same file again gives a draft with no changes", () => {
    const s = setup();
    const first = run(s, sampleImport());
    applyAccepted(s, first.draftId);
    const applied = fs.readFileSync(s.main.wsPath, "utf-8");
    const again = run(s, sampleImport(), "Import C2 again");
    const draft = s.drafts.get(again.draftId);
    expect(diffModels(s.drafts.base(again.draftId), draft, "base").summary).toMatchObject({ added: 0, changed: 0, removed: 0 });
    expect(fs.readFileSync(draft.wsPath, "utf-8")).toBe(applied);
    expect(again.report.created).toEqual([]);
    expect(again.report.updated).toEqual([]);
    expect(again.report.kept.map((k) => `${k.what}:${k.reason}`)).toEqual(["flow:exists", "decision:exists"]);
    expect(again.report.unchanged).toBe(5);
    // The applied draft's values are in the ledger now; its pending file is gone.
    expect(fs.existsSync(pendingPath(s.main.dir, first.draftId))).toBe(false);
    expect(readLedger(ledgerPath(s.main.dir)).elements["ledger-service"]).toMatchObject({ name: "Ledger Service", technologies: ["TypeScript", "Node.js"], "tag:Risk": "Low" });
  });

  it("re-import keeps a person's edit, updates what nobody changed, fills an empty field and keeps a filled one", () => {
    const s = setup();
    applyAccepted(s, run(s, sampleImport()).draftId);
    s.main.edit((ws, sc) => updateElement(ws, sc, "ledger-service", { description: "Edited by a person." }));
    const f = sampleImport();
    f.objects[0]!.description = "Keeps the ledger, second version.";
    f.objects[0]!.technologies = ["TypeScript", "Node.js", "PostgreSQL"];
    // An object the model had before any import: no ledger, so only empty fields are filled.
    f.objects.push({ id: "database", type: "container", name: "Database", parent: "internet-banking-system", owner: "DBA team", codePaths: ["sample_code/api/store.py"] });
    const { draftId, report } = run(s, f, "Import C2 v2");
    const idx = buildIndex(s.drafts.get(draftId).workspace);
    expect(elementSummary(idx, "ledger-service")).toMatchObject({ description: "Edited by a person.", technologies: ["TypeScript", "Node.js", "PostgreSQL"] });
    expect(elementSummary(idx, "database")).toMatchObject({ owner: "Database Operations team", codePaths: ["sample_code/api/store.py"] });
    expect(report.updated).toEqual([
      { id: "database", what: "element", name: "Database", fields: ["codePaths"] },
      { id: "ledger-service", what: "element", name: "Ledger Service", fields: ["technologies"] },
    ]);
    expect(report.kept.filter((k) => k.what === "element").map((k) => [k.id, k.field, k.reason])).toEqual([
      ["database", "owner", "not-empty"],
      ["ledger-service", "description", "your-edit"],
    ]);
    expect(report.kept.find((k) => k.reason === "your-edit")!.message).toMatch(/^Kept your edit/);
  });

  it("lists objects an earlier import wrote that a new file at the same level leaves out, and deletes nothing", () => {
    const s = setup();
    applyAccepted(s, run(s, sampleImport()).draftId);
    const f = sampleImport();
    f.objects = f.objects.filter((o) => o.id !== "ledger-events");
    f.relationships = [f.relationships[0]!];
    f.flows = [];
    f.decisions = [];
    const { draftId, report } = run(s, f, "Smaller");
    expect(report.notInImport.map((x) => `${x.what}:${x.id}`)).toEqual(["element:ledger-events", "relationship:ledger-events--database", "relationship:ledger-service--ledger-events"]);
    expect(buildIndex(s.drafts.get(draftId).workspace).elements.has("ledger-events")).toBe(true);
    // At another level, those containers are not listed.
    const c1: ImportFile = { schemaVersion: 1, level: "c1", objects: [{ id: "auditor", type: "person", name: "Auditor" }], relationships: [] };
    expect(run(s, c1, "People").report.notInImport).toEqual([]);
  });

  it("a discarded import draft leaves nothing in the ledger; an open one stays pending", () => {
    const s = setup();
    const first = run(s, sampleImport());
    s.drafts.remove(first.draftId);
    expect(fs.existsSync(pendingPath(s.main.dir, first.draftId))).toBe(false);
    const open = run(s, { schemaVersion: 1, level: "c1", objects: [{ id: "auditor", type: "person", name: "Auditor" }], relationships: [] }, "People");
    expect(fs.existsSync(pendingPath(s.main.dir, first.draftId))).toBe(false);
    expect(fs.existsSync(ledgerPath(s.main.dir))).toBe(false);
    settleLedger(s.main.dir, () => true);
    expect(fs.existsSync(pendingPath(s.main.dir, open.draftId))).toBe(true);
    // The import folder is not part of any model copy.
    expect(fs.existsSync(path.join(s.drafts.dir, open.draftId, "import"))).toBe(false);
  });

  it("a person's change inside the draft before applying is not taken for the importer's value", () => {
    const s = setup();
    const { draftId } = run(s, sampleImport());
    s.drafts.get(draftId).edit((ws, sc) => updateElement(ws, sc, "ledger-service", { owner: "Ledger team" }));
    applyAccepted(s, draftId);
    const f = sampleImport();
    f.objects[0]!.owner = "Platform team";
    const { report } = run(s, f, "Again");
    expect(report.kept.find((k) => k.field === "owner")).toMatchObject({ id: "ledger-service", reason: "not-empty" });
  });
});

describe("foldApplied", () => {
  it("with keepPending (a partial apply) moves what main holds and keeps the rest pending", () => {
    const s = setup();
    const { draftId } = run(s, sampleImport());
    // Main takes only the Ledger Service object (as a partial apply would), not the rest.
    const draftWs = s.drafts.get(draftId).workspace;
    s.main.edit((ws) => {
      const sys = buildIndex(ws).el("internet-banking-system");
      sys.containers!.push(structuredClone(buildIndex(draftWs).el("ledger-service")));
      sys.containers!.at(-1)!.relationships = [];
    });
    foldApplied(s.main.dir, s.main.workspace, draftId, { keepPending: true });
    expect(Object.keys(readLedger(ledgerPath(s.main.dir)).elements)).toEqual(["ledger-service"]);
    const left = readLedger(pendingPath(s.main.dir, draftId));
    expect(Object.keys(left.elements)).toEqual(["ledger-events"]);
    expect(left.relationships["ledger-events--database"]).toBeDefined();
  });
});
