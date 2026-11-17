/** The review of an import draft (DEC-051): computed levels, per-item decisions, reject with what depends on it, and partial apply. */

import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiskCode } from "../../src/core/codeFiles.js";
import { diffModels } from "../../src/core/diff.js";
import { ApplyConflict, Drafts, registerDraftHooks } from "../../src/core/drafts.js";
import { listFlows } from "../../src/core/flows.js";
import { buildIndex, updateElement } from "../../src/core/modelEdits.js";
import { Project } from "../../src/core/project.js";
import { addedErrors, errors } from "../../src/core/validate.js";
import { importToDraft } from "../../src/import/importer.js";
import { importFilePath, ledgerPath, pendingPath, readLedger, reviewPath } from "../../src/import/lastImport.js";
import { acceptAll, lowConfidence, MAX_FEEDBACK, readReview, reviewHooks, reviewLevel, setDecision, setFeedback, verifyAgain, type ReviewSubject } from "../../src/import/review.js";
import type { Evidence, Fact } from "../../src/import/scan.js";
import type { ImportFile } from "../../src/shared/types.js";
import { client, demoDir, ok, tmpDir } from "./helpers.js";
import { sampleImport, SAMPLE_NOTES, typeIntake } from "./importFixture.js";

const DATE = "2026-11-16";

function setup() {
  const dir = demoDir();
  typeIntake(dir, ...SAMPLE_NOTES, "Told us about it", "The store of everything", "The sample says Ledger Writer is real");
  const main = new Project(dir);
  const drafts = new Drafts(main);
  return { dir, main, drafts };
}
type Setup = ReturnType<typeof setup>;

const run = (s: Setup, file: ImportFile, title = "Import C2", evidence: Evidence | null = null) => importToDraft(s.drafts, file, { title, author: "Importer", date: DATE, evidence }).draftId;

/** Every file under a folder, relative path → text. */
function filesOf(dir: string, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) Object.assign(out, filesOf(p, `${prefix}${e.name}/`));
    else out[`${prefix}${e.name}`] = fs.readFileSync(p, "utf-8");
  }
  return out;
}

/** The main model's files (workspace, sidecar, decisions), byte for byte. */
const mainFiles = (s: Setup) => {
  const all = filesOf(s.main.dir);
  return Object.fromEntries(Object.entries(all).filter(([k]) => k === "workspace.json" || k === "designperspectives.json" || k.startsWith("decisions/")));
};
const draftFolder = (s: Setup, id: string) => path.join(s.drafts.dir, id);

/** Keys of the draft's changes against its base: element and relationship IDs, flow keys and decision titles. */
function draftChanges(s: Setup, id: string): string[] {
  const cs = diffModels(s.drafts.base(id), s.drafts.get(id), "base");
  return [...cs.elements.map((e) => `el:${e.id}`), ...cs.relationships.map((r) => `rel:${r.id}`), ...cs.flows.map((f) => `flow:${f.id}`), ...cs.decisions.map((d) => `dec:${d.name}`)].sort();
}

const has = (s: Setup, id: string) => buildIndex(s.main.workspace).elements.has(id) || buildIndex(s.main.workspace).relationships.has(id);
const accept = (s: Setup, id: string, keys: string[]) => keys.forEach((k) => setDecision(s.drafts, id, k, "accepted", "Ann"));
const mainValid = (s: Setup) => expect(errors(s.main.workspace, s.main.sidecar, s.main.decisions)).toEqual([]);
const draftValid = (s: Setup, id: string) => {
  const d = s.drafts.get(id);
  expect(errors(d.workspace, d.sidecar, d.decisions)).toEqual([]);
};

/** The sample file plus a component inside the new container and a change to an existing container. */
function bigImport(): ImportFile {
  const f = sampleImport();
  f.objects.push({ id: "ledger-writer", type: "component", name: "Ledger Writer", parent: "ledger-service", description: "Writes entries.", evidence: [{ kind: "user", note: "Told us about it" }] });
  f.objects.push({
    id: "database",
    type: "container",
    name: "Database",
    parent: "internet-banking-system",
    codePaths: ["sample_code/api/store.py"],
    evidence: [{ kind: "user", note: "The store of everything" }],
  });
  return f;
}

const ALL_KEYS = [
  "decision:keep-a-separate-ledger-service",
  "flow:flow-post-a-ledger-entry",
  "object:ledger-events",
  "object:ledger-service",
  "relationship:api-application--ledger-service",
  "relationship:ledger-events--database",
  "relationship:ledger-service--ledger-events",
];

afterEach(() => {
  registerDraftHooks(reviewHooks);
  vi.restoreAllMocks();
});

// ------------------------------------------------------------------ review level

describe("reviewLevel", () => {
  /** A code folder with a few files; DiskCode reads it as the server would. */
  function code() {
    const root = tmpDir();
    const write = (rel: string, text: string) => {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    };
    write("svc/Dockerfile", "FROM node:20\n");
    write("svc/main.ts", 'import { charge } from "../pay/charge";\n// the Ledger Service entry point\nexport const x = charge;\n');
    write("pay/charge.ts", "export const charge = 1;\n// stripe client\n");
    write(".env", "SECRET=1\n");
    return new DiskCode(root);
  }
  const fact = (f: Partial<Fact> & { id: string; kind: string; path: string }): Fact => ({ level: "c2", name: f.id, ...f });
  const evidence = (facts: Fact[]): Evidence => ({
    schemaVersion: 1,
    codeRoot: ".",
    facts,
    files: { total: 0, byLanguage: {}, notAnalysable: {}, binary: 0, skipped: [], sizes: [] },
    imports: [],
    notParsed: [],
    limits: [],
  });
  const ev = evidence([
    fact({ id: "dockerfile:svc/Dockerfile:svc", kind: "dockerfile", path: "svc/Dockerfile" }),
    fact({ id: "service-dependency:pay/package.json:stripe", kind: "service-dependency", path: "pay/charge.ts", line: 2, system: "Stripe", level: "c1" }),
    fact({ id: "dockerfile:gone/Dockerfile:gone", kind: "dockerfile", path: "gone/Dockerfile" }),
  ]);
  const subject = (s: Partial<ReviewSubject>): ReviewSubject => ({ kind: "object", name: "Ledger Service", evidence: [], codePaths: [], ...s });
  const TYPED = ["The payments team confirmed that we run it on two hosts.\nIt is owned by finance."];
  const level = (s: Partial<ReviewSubject>, e: Evidence | null = ev, typed: string[] = TYPED) => reviewLevel(subject(s), e, code(), typed);

  it("verified: a scan fact about the item, a user note found in typed text, a manifest at a mapped path, a known service by name", () => {
    expect(level({ codePaths: ["svc"], evidence: [{ kind: "scan", fact: "dockerfile:svc/Dockerfile:svc" }] }).checks[0]).toEqual({
      rule: "scan-fact",
      ok: true,
      path: "svc/Dockerfile",
      note: 'dockerfile "dockerfile:svc/Dockerfile:svc"',
    });
    expect(level({ codePaths: ["svc"], evidence: [{ kind: "scan", fact: "dockerfile:svc/Dockerfile:svc" }] }).level).toBe("verified");
    // The note is found whatever the letter case and line breaks.
    expect(level({ evidence: [{ kind: "user", note: "we run it on two HOSTS. it is  owned by" }] })).toEqual({
      level: "verified",
      checks: [{ rule: "user-note", ok: true, note: "we run it on two HOSTS. it is  owned by" }],
    });
    const m = level({ codePaths: ["svc"] });
    expect(m.level).toBe("verified");
    expect(m.checks).toContainEqual({ rule: "manifest-path", ok: true, path: "svc/Dockerfile", note: 'dockerfile "dockerfile:svc/Dockerfile:svc"' });
    expect(level({ name: "stripe", kind: "object" }).checks).toContainEqual(expect.objectContaining({ rule: "manifest-service", ok: true, path: "pay/charge.ts", line: 2 }));
    expect(level({ name: "Stripe" }).level).toBe("verified");
  });

  it("a user note counts only when it is found in text a person typed: not a model's own words, not a short one", () => {
    const user = (note: string) => level({ evidence: [{ kind: "user", note }] });
    for (const [note, why] of [
      ["the user said so", '"the user said so": not found in the intake, the feedback or the description'],
      ["We run it", '"We run it": too short to check (a note needs at least 12 characters)'],
      ["invented by the model", '"invented by the model": not found in the intake, the feedback or the description'],
      ["", "the note is empty"],
      ["   ", "the note is empty"],
    ]) {
      const r = user(note!);
      expect(r.level, note).toBe("unverified");
      expect(r.checks, note).toContainEqual({ rule: "user-note", ok: false, note: why });
    }
    // A long note is quoted cut short.
    const long = user(`${"word ".repeat(40)}end`).checks[0]!.note!;
    expect(long).toMatch(/^"(word ){23}wo\.\.\.": not found/);
    // Found, but under 12 characters once spaces are squashed: not enough to count.
    expect(level({ evidence: [{ kind: "user", note: "finance." }] }, ev, ["It is owned by finance."]).level).toBe("unverified");
    expect(level({ evidence: [{ kind: "user", note: "owned by finance" }] }, ev, ["It is owned by finance."]).level).toBe("verified");
    // Nothing typed at all: nothing to find it in.
    expect(level({ evidence: [{ kind: "user", note: "We run it on two hosts" }] }, ev, []).level).toBe("unverified");
    // A note that fails still leaves room for other evidence to verify the item.
    expect(level({ codePaths: ["svc"], evidence: [{ kind: "user", note: "the user said so" }] }).level).toBe("verified");
  });

  it("a scan fact verifies only when it is about the item: its name or system, or a path of the item's code", () => {
    const cite = (s: Partial<ReviewSubject>, fact: string) => level({ evidence: [{ kind: "scan", fact }], ...s }, ev);
    // An existing fact about something else: a failed check, and no verification.
    const other = cite({ name: "Totally Real Service", id: "exfil-service" }, "dockerfile:svc/Dockerfile:svc");
    expect(other.level).toBe("unverified");
    expect(other.checks[0]).toMatchObject({ rule: "scan-fact", ok: false });
    // The fact's system is the item's name (slug compare), or its name is the item's ID.
    expect(cite({ name: "stripe" }, "service-dependency:pay/package.json:stripe").level).toBe("verified");
    expect(cite({ name: "Other", id: "dockerfile:svc/dockerfile:svc" }, "dockerfile:svc/Dockerfile:svc").level).toBe("verified");
    // The fact's file is under one of the item's code paths (and a sibling folder is not).
    expect(cite({ codePaths: ["svc"] }, "dockerfile:svc/Dockerfile:svc").level).toBe("verified");
    expect(cite({ codePaths: ["sv"] }, "dockerfile:svc/Dockerfile:svc").level).toBe("unverified");
    // A relationship: its ends' names count.
    expect(cite({ kind: "relationship", name: "Charges", names: ["svc-api", "Stripe"] }, "service-dependency:pay/package.json:stripe").level).toBe("verified");
  });

  it("partly: the cited file and lines exist and hold the name or the quoted text", () => {
    const byName = level({ evidence: [{ kind: "file", path: "svc/main.ts", lines: [1, 3] }] });
    expect(byName.level).toBe("partly");
    expect(byName.checks).toContainEqual({ rule: "text-found", ok: true, path: "svc/main.ts", line: 2, note: '"Ledger Service"' });
    const byText = level({ name: "Other", evidence: [{ kind: "file", path: "pay/charge.ts", text: "Stripe  Client" }] });
    expect(byText.level).toBe("partly");
    expect(byText.checks).toContainEqual({ rule: "text-found", ok: true, path: "pay/charge.ts", line: 2, note: '"Stripe  Client"' });
    // The text is outside the cited lines: not partly.
    expect(level({ name: "Other", evidence: [{ kind: "file", path: "pay/charge.ts", lines: [1, 1], text: "stripe" }] }).level).toBe("unverified");
    // No scan results: a cited fact cannot be checked, which does not count against the file evidence.
    const noScan = level(
      {
        evidence: [
          { kind: "scan", fact: "anything" },
          { kind: "file", path: "svc/main.ts" },
        ],
      },
      null,
    );
    expect(noScan.level).toBe("partly");
    expect(noScan.checks[0]).toMatchObject({ rule: "scan-fact", ok: false });
  });

  it("unverified: no evidence, a missing path, missing lines, an unknown fact, a fact whose file is gone, a hidden path", () => {
    expect(level({})).toEqual({ level: "unverified", checks: [{ rule: "no-evidence", ok: false, note: "The import file cites no evidence for this." }] });
    const user = { kind: "user" as const, note: "we run it on two hosts" };
    for (const bad of [
      { kind: "file" as const, path: "svc/nope.ts" },
      { kind: "file" as const, path: "svc/main.ts", lines: [2, 9] as [number, number] },
      { kind: "file" as const, path: ".env" },
      { kind: "file" as const, path: "../outside.ts" },
      { kind: "scan" as const, fact: "dockerfile:nowhere:x" },
      { kind: "scan" as const, fact: "dockerfile:gone/Dockerfile:gone" },
    ]) {
      // A failed citation makes the item unverified even next to a user note.
      const r = level({ evidence: [user, bad] });
      expect(r.level, JSON.stringify(bad)).toBe("unverified");
      expect(r.checks.some((c) => !c.ok)).toBe(true);
    }
  });

  it("a relationship between two components with mapped code: an import confirms it, none contradicts it", () => {
    const edge = { source: "a", target: "b", sourcePaths: ["svc"], targetPaths: ["pay"] };
    const yes = level({ kind: "relationship", name: "Charges", edge });
    expect(yes.level).toBe("verified");
    expect(yes.checks).toContainEqual({ rule: "import-edge", ok: true, path: "svc/main.ts", note: "svc/main.ts imports pay/charge.ts" });
    const back = level({
      kind: "relationship",
      name: "Calls back",
      evidence: [{ kind: "user", note: "It is owned by finance" }],
      edge: { source: "b", target: "a", sourcePaths: ["pay"], targetPaths: ["svc"] },
    });
    expect(back.level).toBe("unverified");
    expect(back.checks).toContainEqual({ rule: "import-edge", ok: false, note: 'No import from the code of "b" to the code of "a" was found.' });
  });

  it("a flow is as verified as its least verified step", () => {
    const flow = (levels: ("verified" | "partly" | "unverified")[]) => level({ kind: "flow", steps: levels.map((l, i) => ({ relationship: `r${i}`, level: l })) }).level;
    expect(flow(["verified", "verified"])).toBe("verified");
    expect(flow(["verified", "partly"])).toBe("partly");
    expect(flow(["partly", "unverified"])).toBe("unverified");
    expect(flow([])).toBe("unverified");
  });
});

// ------------------------------------------------------------------ the review file

describe("review state", () => {
  it("is created with the draft (with the import file kept) and removed when the draft is discarded", () => {
    const s = setup();
    const id = run(s, sampleImport());
    const r = readReview(s.main.dir, id)!;
    expect(Object.keys(r.items).sort()).toEqual(ALL_KEYS);
    expect(r.revision).toBe(1);
    expect(fs.existsSync(importFilePath(s.main.dir, id))).toBe(true);
    expect(Object.fromEntries(Object.entries(r.items).map(([k, i]) => [k, [i.kind, i.level, i.decision]]))).toEqual({
      "decision:keep-a-separate-ledger-service": ["decision", "verified", "pending"],
      "flow:flow-post-a-ledger-entry": ["flow", "unverified", "pending"],
      "object:ledger-events": ["object", "verified", "pending"],
      // Its file exists, but neither its name nor the quoted text is in the cited lines.
      "object:ledger-service": ["object", "unverified", "pending"],
      // The scan fact cannot be checked without scan results, and nothing else is cited.
      "relationship:api-application--ledger-service": ["relationship", "unverified", "pending"],
      "relationship:ledger-events--database": ["relationship", "unverified", "pending"],
      "relationship:ledger-service--ledger-events": ["relationship", "unverified", "pending"],
    });
    expect(r.items["object:ledger-service"]).toMatchObject({ name: "Ledger Service", pointer: "/objects/0" });
    expect(r.items["relationship:ledger-events--database"]).toMatchObject({ name: "Delivers ledger events to", pointer: "/relationships/1" });
    expect(lowConfidence(r)).toEqual(ALL_KEYS.filter((k) => !["decision:keep-a-separate-ledger-service", "object:ledger-events"].includes(k)));
    // Same file, same review, byte for byte.
    const again = setup();
    run(again, sampleImport());
    expect(fs.readFileSync(reviewPath(again.main.dir, id), "utf-8")).toBe(fs.readFileSync(reviewPath(s.main.dir, id), "utf-8"));
    s.drafts.remove(id);
    expect(fs.existsSync(reviewPath(s.main.dir, id))).toBe(false);
    expect(fs.existsSync(importFilePath(s.main.dir, id))).toBe(false);
  });

  it("levels come from evidence.json when there is one; verify again sees new code", () => {
    const s = setup();
    const evidence: Evidence = {
      schemaVersion: 1,
      codeRoot: ".",
      facts: [{ id: "EVIDENCE-MARKER-SCAN", level: "c2", kind: "package-entry", name: "ledger-service", path: "sample_code/payments/controller.ts" }],
      files: { total: 0, byLanguage: {}, notAnalysable: {}, binary: 0, skipped: [], sizes: [] },
      imports: [],
      notParsed: [],
      limits: [],
    };
    const id = run(s, sampleImport(), "Import C2", evidence);
    expect(readReview(s.main.dir, id)!.items["relationship:api-application--ledger-service"]!.level).toBe("verified");
    // The quoted text appears in the cited lines: verify again raises the level to partly.
    const file = path.join(s.dir, "sample_code/payments/controller.ts");
    const lines = fs.readFileSync(file, "utf-8").split("\n");
    lines[1] = "// EVIDENCE-MARKER-QUOTE";
    fs.writeFileSync(file, lines.join("\n"));
    const r = verifyAgain(s.drafts, id, "object:ledger-service", { evidence: null });
    expect(r.items["object:ledger-service"]).toMatchObject({ level: "partly" });
    expect(r.items["object:ledger-service"]!.checks).toContainEqual({ rule: "text-found", ok: true, path: "sample_code/payments/controller.ts", line: 2, note: '"EVIDENCE-MARKER-QUOTE"' });
    // Stored, and the other items are untouched.
    expect(readReview(s.main.dir, id)!.items["relationship:api-application--ledger-service"]!.level).toBe("verified");
    expect(() => verifyAgain(s.drafts, id, "object:nope")).toThrow(/No review item/);
  });

  it("a claimed relationship between components whose code has no import is unverified; one the code shows is verified", () => {
    const s = setup();
    const f: ImportFile = {
      schemaVersion: 1,
      level: "c3",
      objects: [
        { id: "ledger-api", type: "component", name: "Ledger API", parent: "payments-service", codePaths: ["sample_code/payments/controller.ts"] },
        { id: "ledger-runner", type: "component", name: "Ledger Runner", parent: "payments-service", codePaths: ["sample_code/payments/orchestrator.ts"] },
      ],
      relationships: [
        { source: "ledger-api", target: "ledger-runner", description: "Runs ledger postings with" },
        { source: "ledger-runner", target: "ledger-api", description: "Reports back to", evidence: [{ kind: "user", note: "I think so" }] },
      ],
    };
    const id = run(s, f, "Components");
    const r = readReview(s.main.dir, id)!;
    expect(r.items["relationship:ledger-api--ledger-runner"]).toMatchObject({ level: "verified" });
    expect(r.items["relationship:ledger-runner--ledger-api"]).toMatchObject({ level: "unverified" });
    expect(r.items["relationship:ledger-runner--ledger-api"]!.checks).toContainEqual(expect.objectContaining({ rule: "import-edge", ok: false }));
  });

  it("feedback is stored as written, per item and for the draft, and has a maximum length", () => {
    const s = setup();
    const id = run(s, sampleImport());
    setFeedback(s.drafts, id, "object:ledger-service", "  This is the payment ledger;\nowned by finance.  ");
    setFeedback(s.drafts, id, null, "Ignore the legacy folder.");
    const r = readReview(s.main.dir, id)!;
    expect(r.items["object:ledger-service"]!.feedback).toBe("  This is the payment ledger;\nowned by finance.  ");
    expect(r.draftFeedback).toBe("Ignore the legacy folder.");
    expect(() => setFeedback(s.drafts, id, null, "x".repeat(MAX_FEEDBACK + 1))).toThrow(/at most/);
    setFeedback(s.drafts, id, "object:ledger-service", "   ");
    expect(readReview(s.main.dir, id)!.items["object:ledger-service"]!.feedback).toBeUndefined();
    expect(() => setFeedback(s.drafts, id, "object:nope", "x")).toThrow(/No review item/);
  });
});

// ------------------------------------------------------------------ decisions

describe("accept and reject", () => {
  it("accept all takes only verified and partly verified items; an unverified one needs its own accept, recorded with who", () => {
    const s = setup();
    const id = run(s, sampleImport());
    const { accepted, skipped } = acceptAll(s.drafts, id, "Ann");
    expect(accepted).toEqual(["decision:keep-a-separate-ledger-service", "object:ledger-events"]);
    expect(skipped).toEqual(ALL_KEYS.filter((k) => !accepted.includes(k)));
    const r = readReview(s.main.dir, id)!;
    expect(r.items["object:ledger-events"]).toMatchObject({ decision: "accepted", by: "Ann" });
    expect(r.items["object:ledger-service"]).toMatchObject({ decision: "pending" });
    expect(r.items["object:ledger-service"]!.by).toBeUndefined();
    setDecision(s.drafts, id, "object:ledger-service", "accepted", "Bob");
    expect(readReview(s.main.dir, id)!.items["object:ledger-service"]).toMatchObject({ decision: "accepted", by: "Bob", level: "unverified" });
    setDecision(s.drafts, id, "object:ledger-service", "pending", "Bob");
    expect(readReview(s.main.dir, id)!.items["object:ledger-service"]).toMatchObject({ decision: "pending" });
    expect(() => setDecision(s.drafts, id, "object:ledger-service", "maybe" as never, "Bob")).toThrow(/one of/);
  });

  it("reject takes the item out of the draft with its children, relationships and flow steps; the draft stays valid", () => {
    const s = setup();
    const id = run(s, bigImport());
    const res = setDecision(s.drafts, id, "object:ledger-service", "rejected", "Ann");
    expect(res.reverted).toEqual(["el:ledger-service", "el:ledger-writer", "rel:api-application--ledger-service", "rel:ledger-service--ledger-events", "view:components-ledger-service"]);
    expect(res.alsoRejected).toEqual(["object:ledger-writer", "relationship:api-application--ledger-service", "relationship:ledger-service--ledger-events"]);
    const d = s.drafts.get(id);
    const idx = buildIndex(d.workspace);
    expect(idx.elements.has("ledger-service")).toBe(false);
    expect(idx.elements.has("ledger-writer")).toBe(false);
    expect(idx.elements.has("ledger-events")).toBe(true);
    // The flow keeps only its step over a relationship that is still there; the decision no longer names what went.
    expect(
      listFlows(d.workspace)
        .find((f) => f.key === "flow-post-a-ledger-entry")!
        .steps.map((x) => x.relationshipId),
    ).toEqual(["ledger-events--database"]);
    expect(d.decisions.find((x) => x.title === "Keep a separate ledger service")!.affects).toEqual([]);
    draftValid(s, id);
    expect(d.undoStack.length).toBe(2); // the import, then the reject: one undo step
    const r = readReview(s.main.dir, id)!;
    expect(r.items["object:ledger-service"]).toMatchObject({ decision: "rejected", by: "Ann" });
    expect(r.items["object:ledger-writer"]).toMatchObject({ decision: "rejected", by: "Ann" });
    // A rejected item is gone from the draft: it cannot be accepted any more.
    expect(() => setDecision(s.drafts, id, "object:ledger-service", "accepted", "Ann")).toThrow(/no longer in the draft \(it was rejected\)/);
    // An existing object the import changed goes back to how it was.
    setDecision(s.drafts, id, "object:database", "rejected", "Ann");
    expect(draftChanges(s, id)).not.toContain("el:database");
  });

  it("reject of a relationship drops the flow steps over it and leaves its ends", () => {
    const s = setup();
    const id = run(s, sampleImport());
    const res = setDecision(s.drafts, id, "relationship:ledger-events--database", "rejected", "Ann");
    expect(res.reverted).toEqual(["rel:ledger-events--database"]);
    const d = s.drafts.get(id);
    expect(
      listFlows(d.workspace)
        .find((f) => f.key === "flow-post-a-ledger-entry")!
        .steps.map((x) => x.relationshipId),
    ).toEqual(["api-application--ledger-service", "ledger-service--ledger-events"]);
    draftValid(s, id);
  });
});

// ------------------------------------------------------------------ partial apply

describe("partial apply of an import draft", () => {
  it("applies the accepted items, keeps the rest in the draft, and a second apply finishes it as one full apply would", () => {
    const s = setup();
    const id = run(s, sampleImport());
    accept(s, id, ["object:ledger-events", "relationship:ledger-events--database"]);
    const preview = s.drafts.preview(id);
    expect(preview.conflicts).toEqual([]);
    expect(preview.held).toEqual({ items: 5, dependent: [], nothingAccepted: false });
    expect(preview.changes.elements.map((e) => e.id)).toEqual(["ledger-events"]);
    expect(preview.changes.relationships.map((r) => r.id)).toEqual(["ledger-events--database"]);

    expect(s.drafts.apply(id)).toEqual({ kept: true, held: 5 });
    // Main: the accepted items only, and valid.
    expect(has(s, "ledger-events")).toBe(true);
    expect(has(s, "ledger-events--database")).toBe(true);
    for (const x of ["ledger-service", "api-application--ledger-service", "ledger-service--ledger-events"]) expect(has(s, x), x).toBe(false);
    expect(listFlows(s.main.workspace).some((f) => f.key === "flow-post-a-ledger-entry")).toBe(false);
    expect(s.main.decisions.some((d) => d.title === "Keep a separate ledger service")).toBe(false);
    mainValid(s);
    // The draft: rebased on the new main, the held items are its changes.
    expect(s.drafts.list().map((d) => d.id)).toEqual([id]);
    expect(s.drafts.info(id).behind).toBe(0);
    expect(draftChanges(s, id)).toEqual([
      "dec:0008 Keep a separate ledger service",
      "el:ledger-service",
      "flow:flow-post-a-ledger-entry",
      "rel:api-application--ledger-service",
      "rel:ledger-service--ledger-events",
    ]);
    draftValid(s, id);
    // The review keeps the held items' state; the applied ones left it.
    const r = readReview(s.main.dir, id)!;
    expect(Object.keys(r.items).sort()).toEqual(ALL_KEYS.filter((k) => !["object:ledger-events", "relationship:ledger-events--database"].includes(k)));
    expect(Object.values(r.items).every((i) => i.decision === "pending")).toBe(true);
    // The ledger has what reached main; the held items stay pending.
    expect(Object.keys(readLedger(ledgerPath(s.main.dir)).elements)).toEqual(["ledger-events"]);
    expect(Object.keys(readLedger(ledgerPath(s.main.dir)).relationships)).toEqual(["ledger-events--database"]);
    const pend = readLedger(pendingPath(s.main.dir, id));
    expect(Object.keys(pend.elements)).toEqual(["ledger-service"]);
    expect(Object.keys(pend.relationships).sort()).toEqual(["api-application--ledger-service", "ledger-service--ledger-events"]);

    // Second apply after accepting the rest: the draft is applied whole and removed.
    accept(s, id, Object.keys(r.items));
    expect(s.drafts.preview(id).held).toBeUndefined();
    expect(s.drafts.apply(id)).toEqual({ kept: false, held: 0 });
    expect(s.drafts.list()).toEqual([]);
    expect(fs.existsSync(reviewPath(s.main.dir, id))).toBe(false);
    expect(fs.existsSync(pendingPath(s.main.dir, id))).toBe(false);
    expect(fs.existsSync(importFilePath(s.main.dir, id))).toBe(true); // kept as the record
    mainValid(s);

    // The same file imported and applied in one go gives the same main model, byte for byte.
    const one = setup();
    const oid = run(one, sampleImport());
    accept(one, oid, ALL_KEYS);
    expect(one.drafts.apply(oid)).toEqual({ kept: false, held: 0 });
    expect(mainFiles(s)).toEqual(mainFiles(one));
    expect(fs.readFileSync(ledgerPath(s.main.dir), "utf-8")).toBe(fs.readFileSync(ledgerPath(one.main.dir), "utf-8"));
  });

  it("a held item inside an accepted parent stays in the draft", () => {
    const s = setup();
    const id = run(s, bigImport());
    accept(s, id, ["object:ledger-service"]);
    expect(s.drafts.apply(id)).toMatchObject({ kept: true });
    expect(has(s, "ledger-service")).toBe(true);
    expect(has(s, "ledger-writer")).toBe(false);
    expect(draftChanges(s, id)).toContain("el:ledger-writer");
    expect(draftChanges(s, id)).not.toContain("el:ledger-service");
    mainValid(s);
    draftValid(s, id);
  });

  it("an accepted item that depends on a held one is held too, and the preview says why", () => {
    const s = setup();
    const id = run(s, bigImport());
    // The component's container, the flow's relationships and the decision's subject are not accepted.
    accept(s, id, ["object:ledger-writer", "flow:flow-post-a-ledger-entry", "decision:keep-a-separate-ledger-service", "object:ledger-events"]);
    const p = s.drafts.preview(id);
    expect(p.conflicts).toEqual([]);
    expect(p.held!.dependent).toEqual(
      expect.arrayContaining([
        { label: 'Component "Ledger Writer"', reason: 'Held because it depends on Container "Ledger Service", which is not accepted.' },
        { label: 'Flow "Post a ledger entry"', reason: expect.stringMatching(/^Held because it depends on Relationship "/) },
        { label: 'Decision 0008 "Keep a separate ledger service"', reason: expect.stringMatching(/^Held because it depends on /) },
      ]),
    );
    expect(s.drafts.apply(id)).toMatchObject({ kept: true });
    expect(has(s, "ledger-events")).toBe(true);
    expect(has(s, "ledger-writer")).toBe(false);
    expect(listFlows(s.main.workspace).some((f) => f.key === "flow-post-a-ledger-entry")).toBe(false);
    expect(s.main.decisions.some((d) => d.title === "Keep a separate ledger service")).toBe(false);
    mainValid(s);
    draftValid(s, id);
    // Still accepted, and still in the draft.
    expect(readReview(s.main.dir, id)!.items["object:ledger-writer"]).toMatchObject({ decision: "accepted" });
    expect(draftChanges(s, id)).toContain("el:ledger-writer");
  });

  it("apply through the API cannot land a held item", async () => {
    const s = setup();
    const id = run(s, sampleImport());
    accept(s, id, ["object:ledger-events"]);
    const c = client(s.dir);
    const p = await ok(c.get(`/api/drafts/${id}/apply-preview`));
    expect(p.held.items).toBe(6);
    await ok(c.post(`/api/drafts/${id}/apply`));
    const st = await ok(c.get("/api/state"));
    const ids = st.elements.map((e: { id: string }) => e.id);
    expect(ids).toContain("ledger-events");
    expect(ids).not.toContain("ledger-service");
    expect(st.drafts.map((d: { id: string }) => d.id)).toEqual([id]);
    // With nothing accepted any more, apply is refused.
    const r = await c.post(`/api/drafts/${id}/apply`);
    expect(r.status).toBe(422);
    expect(r.json().detail).toMatch(/^Nothing is accepted yet/);
  });

  it("refuses when nothing is accepted, and changes nothing", () => {
    const s = setup();
    const id = run(s, sampleImport());
    setDecision(s.drafts, id, "object:ledger-events", "rejected", "Ann");
    const before = mainFiles(s);
    const draftBefore = filesOf(draftFolder(s, id));
    expect(s.drafts.preview(id).held).toMatchObject({ items: 4, nothingAccepted: true });
    expect(() => s.drafts.apply(id)).toThrow(/^Nothing is accepted yet: accept items in the review first \(4 items are waiting\)/);
    expect(mainFiles(s)).toEqual(before);
    expect(filesOf(draftFolder(s, id))).toEqual(draftBefore);
  });

  it("without the review rules loaded, an import draft is not applied at all", () => {
    const s = setup();
    const id = run(s, sampleImport());
    accept(s, id, ALL_KEYS);
    registerDraftHooks(null);
    expect(() => s.drafts.apply(id)).toThrow(/import under review, but the review rules are not loaded/);
    expect(has(s, "ledger-events")).toBe(false);
  });

  it("refuses on a conflict with main, in an accepted or in a held item, and writes nothing", () => {
    const s = setup();
    const id = run(s, bigImport()); // changes the existing Database (its code)
    accept(s, id, ["object:ledger-events"]);
    // Main changes the Database's code too: a held item now conflicts.
    s.main.edit((ws, sc) => updateElement(ws, sc, "database", { codePaths: ["sample_code/api/accounts.py"] }));
    const before = mainFiles(s);
    const draftBefore = filesOf(draftFolder(s, id));
    const p = s.drafts.preview(id);
    expect(p.conflicts).toEqual([{ label: 'Container "Database"', reason: "Kept in the draft: Changed in both main and the held items, differently." }]);
    expect(() => s.drafts.apply(id)).toThrow(ApplyConflict);
    expect(mainFiles(s)).toEqual(before);
    expect(filesOf(draftFolder(s, id))).toEqual(draftBefore);
    // The same conflict in an accepted item.
    accept(s, id, ["object:database"]);
    let err: unknown;
    try {
      s.drafts.apply(id);
    } catch (e) {
      err = e;
    }
    expect((err as ApplyConflict).conflicts).toEqual([{ label: 'Container "Database"', reason: "Changed in both main and the draft, differently." }]);
    expect(mainFiles(s)).toEqual(before);
  });

  it("undo after a partial apply restores main; the held items stay in the draft", () => {
    const s = setup();
    const before = mainFiles(s);
    const id = run(s, sampleImport());
    accept(s, id, ["object:ledger-events"]);
    s.drafts.apply(id);
    expect(has(s, "ledger-events")).toBe(true);
    expect(s.main.undo()).toBe(true);
    expect(mainFiles(s)).toEqual(before);
    expect(draftChanges(s, id)).toContain("el:ledger-service");
  });

  it("a failed write while rebasing the draft puts main, the draft, the ledger and the review back", () => {
    for (const where of ["draft", "base"] as const) {
      const s = setup();
      const id = run(s, sampleImport());
      accept(s, id, ["object:ledger-events", "relationship:ledger-events--database"]);
      const before = mainFiles(s);
      const undo = s.main.undoStack.length;
      const draftBefore = filesOf(draftFolder(s, id));
      const importBefore = filesOf(path.join(s.main.dir, "import"));
      if (where === "draft")
        vi.spyOn(s.drafts.get(id), "write").mockImplementation(() => {
          throw new Error("disk full");
        });
      else
        vi.spyOn(s.drafts as unknown as { writeBase: (id: string) => void }, "writeBase").mockImplementation(() => {
          throw new Error("disk full");
        });
      expect(() => s.drafts.apply(id), where).toThrow("disk full");
      expect(mainFiles(s), where).toEqual(before);
      expect(s.main.undoStack.length).toBe(undo);
      expect(filesOf(draftFolder(s, id)), where).toEqual(draftBefore);
      expect(filesOf(path.join(s.main.dir, "import")), where).toEqual(importBefore);
      vi.restoreAllMocks();
      // And it applies afterwards.
      expect(s.drafts.apply(id)).toEqual({ kept: true, held: 5 });
      expect(has(s, "ledger-events")).toBe(true);
    }
  });

  it("a crash after main is written loses nothing: applying again finds the accepted items in main and still holds the rest", () => {
    for (const crash of ["before the draft", "before the base"] as const) {
      const s = setup();
      const id = run(s, sampleImport());
      accept(s, id, ["object:ledger-events", "relationship:ledger-events--database"]);
      const folder = draftFolder(s, id);
      const draftBefore = filesOf(folder);
      const importBefore = filesOf(path.join(s.main.dir, "import"));
      s.drafts.apply(id);
      const mainAfter = mainFiles(s);
      // Put back what a crash would have left unwritten.
      const back = crash === "before the draft" ? draftBefore : Object.fromEntries(Object.entries(draftBefore).filter(([k]) => k.startsWith("base/")));
      for (const k of Object.keys(filesOf(path.join(folder, "base")))) if (!(`base/${k}` in back) && crash === "before the base") fs.rmSync(path.join(folder, "base", k));
      for (const [k, v] of Object.entries(back)) fs.writeFileSync(path.join(folder, k), v);
      fs.rmSync(path.join(s.main.dir, "import"), { recursive: true });
      for (const [k, v] of Object.entries(importBefore)) {
        fs.mkdirSync(path.dirname(path.join(s.main.dir, "import", k)), { recursive: true });
        fs.writeFileSync(path.join(s.main.dir, "import", k), v);
      }
      const fresh = new Drafts(new Project(s.dir));
      expect(fresh.apply(id), crash).toEqual({ kept: true, held: 5 });
      expect(fs.readFileSync(fresh.main.wsPath, "utf-8"), crash).toBe(mainAfter["workspace.json"]);
      const changes = diffModels(fresh.base(id), fresh.get(id), "base");
      expect(
        changes.elements.map((e) => e.id),
        crash,
      ).toEqual(["ledger-service"]);
      expect(Object.keys(readReview(s.main.dir, id)!.items).sort(), crash).not.toContain("object:ledger-events");
    }
  });

  it("decisions held in the draft keep a number free of the ones main takes meanwhile", () => {
    const s = setup();
    const id = run(s, sampleImport());
    accept(s, id, ["object:ledger-events"]);
    s.drafts.apply(id);
    // Main gets a decision with the number the held one has.
    s.main.edit((_ws, _sc, decs) => {
      decs.push({ ...structuredClone(s.drafts.get(id).decisions.find((d) => d.title === "Keep a separate ledger service")!), title: "Another", file: "0008-another.md" });
    });
    accept(s, id, Object.keys(readReview(s.main.dir, id)!.items));
    expect(s.drafts.apply(id)).toEqual({ kept: false, held: 0 });
    expect(s.main.decisions.map((d) => d.file).slice(-2)).toEqual(["0008-another.md", "0009-keep-a-separate-ledger-service.md"]);
    expect(addedErrors([], errors(s.main.workspace, s.main.sidecar, s.main.decisions))).toEqual([]);
  });
});
