/** Decision records (DEC-050): the file format and its round trip, the decision API, and decisions inside drafts. */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDecision, renumberAdded, serializeDecision } from "../../src/core/decisions.js";
import { checkProject } from "../../src/core/cliReports.js";
import { Project } from "../../src/core/project.js";
import { flatten, unflatten } from "../../src/core/modelUnits.js";
import { client, demoDir, ok } from "./helpers.js";

const decDir = (dir: string) => path.join(dir, "architecture", "decisions");
const files = (dir: string) => (fs.existsSync(decDir(dir)) ? fs.readdirSync(decDir(dir)).sort() : []);
const read = (dir: string, f: string) => fs.readFileSync(path.join(decDir(dir), f), "utf-8");

const FULL = `---
status: accepted
kind: conditional
date: 2026-11-15
deciders: [Platform team, "Smith, J."]
affects: [internet-banking-system, database]
tags: [data]
review-by: 2027-05-01
owner-team: payments
---

# Keep a relational database for accounts

Short summary written before the first section.

## Context

Accounts need transactions across tables.

Two paragraphs.

## Decision

Keep the relational database.

## Alternatives

### Event log with Kafka

Considered in the March workshop.

- Why not now: nobody can run it on call
  and the team is small
- Would choose if:
  - we had a platform team
  - writes exceeded 10k per second

### Document store

- Why not now: joins across accounts

## Consequences

- Schema changes need migrations.

## Revisit triggers

- [ ] We have a platform team (→ Event log with Kafka)
- [x] Write volume is measured

## Links

See the runbook.
`;

describe("decision files", () => {
  it("read and write back byte for byte, keeping unknown sections and keys", () => {
    const d = parseDecision("0007-keep-relational.md", FULL);
    expect(d.error).toBeUndefined();
    expect(d).toMatchObject({
      id: "0007",
      title: "Keep a relational database for accounts",
      status: "accepted",
      kind: "conditional",
      deciders: ["Platform team", "Smith, J."],
      affects: ["internet-banking-system", "database"],
      reviewBy: "2027-05-01",
      extraMeta: [["owner-team", "payments"]],
    });
    expect(d.alternatives).toEqual([
      {
        name: "Event log with Kafka",
        whyNot: "nobody can run it on call\nand the team is small",
        wouldChooseIf: ["we had a platform team", "writes exceeded 10k per second"],
        notes: "Considered in the March workshop.",
      },
      { name: "Document store", whyNot: "joins across accounts", wouldChooseIf: [], notes: "" },
    ]);
    expect(d.triggers).toEqual([
      { text: "We have a platform team", met: false, alternative: "Event log with Kafka" },
      { text: "Write volume is measured", met: true, alternative: "" },
    ]);
    expect(d.extra.map((s) => s.heading)).toEqual(["", "Links"]);
    expect(serializeDecision(d)).toBe(FULL);
  });

  it("reads block lists and quoted values; a file that does not follow the format is reported, not lost", () => {
    const d = parseDecision("0002-x.md", '---\nstatus: proposed\nkind: choice\ndate: 2026-01-02\ntags:\n  - a\n  - "b, c"\n---\n\n# X\n');
    expect(d.tags).toEqual(["a", "b, c"]);
    expect(serializeDecision(d)).toContain('tags: [a, "b, c"]');
    const bad = parseDecision("0003-y.md", "# No front matter\n");
    expect(bad.error).toMatch(/---/);
    expect(serializeDecision(bad)).toBe("# No front matter\n");
    expect(parseDecision("0004-z.md", "---\nstatus: maybe\nkind: choice\n---\n\n# Z\n").error).toMatch(/not a status/);
    expect(parseDecision("notes.md", "x").error).toMatch(/file name/);
  });

  it("are units: flatten and unflatten keep them", () => {
    const p = new Project(demoDir());
    const d = parseDecision("0001-a.md", FULL);
    const u = flatten(p.workspace, p.sidecar, [d]);
    expect(u.get("dec:0001-a.md")).toBeTruthy();
    expect(unflatten(u).decisions).toEqual([d]);
  });

  it("renumber a draft's new decision when main used its number meanwhile", () => {
    const mk = (file: string, extra = "") => parseDecision(file, `---\nstatus: accepted\nkind: choice\ndate: 2026-01-01\n${extra}---\n\n# ${file}\n`);
    const base = [mk("0001-a.md")];
    const ours = [...base, mk("0002-main.md")];
    const theirs = [mk("0001-a.md"), mk("0002-draft.md"), mk("0003-draft-two.md", "supersedes: [0002]\n")];
    const out = renumberAdded(base, ours, theirs);
    expect(out.map((d) => d.file)).toEqual(["0001-a.md", "0004-draft.md", "0003-draft-two.md"]);
    expect(out[2]!.supersedes).toEqual(["0004"]);
    expect(theirs[1]!.file).toBe("0002-draft.md"); // input unchanged
  });
});

describe("decision API", () => {
  it("creates, edits and deletes decisions as files; the state lists them", async () => {
    const dir = demoDir();
    const c = client(dir);
    const before = files(dir);
    const { id } = await ok(c.post("/api/decisions", { title: "Use Postgres for accounts", kind: "conditional", affects: ["database"] }));
    const created = files(dir).filter((f) => !before.includes(f));
    expect(created).toEqual([`${id}-use-postgres-for-accounts.md`]);
    await ok(
      c.put(`/api/decisions/${id}`, {
        context: "We need joins.",
        alternatives: [{ name: "Kafka", whyNot: "no platform team", wouldChooseIf: ["we had a platform team"] }],
        triggers: [{ text: "We have a platform team", alternative: "Kafka" }],
        title: "Keep Postgres for accounts",
      }),
    );
    // The file keeps its name when the title changes.
    const text = read(dir, created[0]!);
    expect(text).toContain("# Keep Postgres for accounts");
    expect(text).toContain("- Would choose if:\n  - we had a platform team");
    expect(text).toContain("- [ ] We have a platform team (→ Kafka)");

    const st = await ok(c.get("/api/state"));
    expect(st.decisions.find((d: any) => d.id === id)).toMatchObject({ kind: "conditional", status: "proposed", affects: ["database"], triggers: { open: 1, met: 0 } });
    expect((await ok(c.get(`/api/decisions/${id}`))).alternatives[0].name).toBe("Kafka");
    const md = await c.get(`/api/decisions/${id}/markdown`);
    expect(md.text).toBe(text);

    // Undo puts the previous file back.
    await ok(c.post("/api/undo"));
    expect(read(dir, created[0]!)).toContain("# Use Postgres for accounts");
    await ok(c.post("/api/redo"));

    await ok(c.delete(`/api/decisions/${id}`));
    expect(files(dir)).toEqual(before);
  });

  it("refuses bad input", async () => {
    const c = client();
    expect((await c.post("/api/decisions", { title: " " })).status).toBe(422);
    expect((await c.post("/api/decisions", { title: "X", kind: "whim" })).status).toBe(422);
    expect((await c.post("/api/decisions", { title: "X", reviewBy: "soon" })).status).toBe(422);
    expect((await c.post("/api/decisions", { title: "X", supersedes: ["9999"] })).status).toBe(422);
    expect((await c.put("/api/decisions/9999", { title: "Y" })).status).toBe(422);
    expect((await c.get("/api/decisions/9999")).status).toBe(404);
  });

  it("accepting a reversal marks the old decision superseded, both ways", async () => {
    const dir = demoDir();
    const c = client(dir);
    const { id: old } = await ok(c.post("/api/decisions", { title: "Nightly batch", status: "accepted" }));
    const { id: neu } = await ok(c.post("/api/decisions", { title: "Stream instead", kind: "reversal", supersedes: [old] }));
    expect((await ok(c.get(`/api/decisions/${old}`))).status).toBe("accepted"); // only a proposal so far
    await ok(c.patch(`/api/decisions/${neu}/status`, { status: "accepted" }));
    expect(await ok(c.get(`/api/decisions/${old}`))).toMatchObject({ status: "superseded", supersededBy: [neu] });
    await ok(c.delete(`/api/decisions/${neu}`));
    expect((await ok(c.get(`/api/decisions/${old}`))).supersededBy).toEqual([]);
  });

  it("a file that cannot be read is reported, kept and never rewritten", async () => {
    const dir = demoDir();
    fs.mkdirSync(decDir(dir), { recursive: true });
    fs.writeFileSync(path.join(decDir(dir), "0100-broken.md"), "just text\n");
    const c = client(dir);
    const st = await ok(c.get("/api/state"));
    expect(st.loadErrors.join(" ")).toMatch(/0100-broken\.md" cannot be read/);
    expect(st.decisions.find((d: any) => d.id === "0100").error).toBeTruthy();
    expect((await ok(c.get("/api/decisions/0100"))).raw).toBeUndefined();
    await ok(c.post("/api/decisions", { title: "Next one" })); // other edits still work
    expect(read(dir, "0100-broken.md")).toBe("just text\n");
    expect((await c.put("/api/decisions/0100", { title: "Fix" })).status).toBe(422);
  });

  it("picks up decision files changed on disk", async () => {
    const dir = demoDir();
    const c = client(dir);
    const n = (await ok(c.get("/api/state"))).decisions.length;
    fs.mkdirSync(decDir(dir), { recursive: true });
    fs.writeFileSync(path.join(decDir(dir), "0500-by-hand.md"), "---\nstatus: proposed\nkind: choice\ndate: 2026-01-01\n---\n\n# By hand\n");
    expect((await ok(c.get("/api/state"))).decisions.length).toBe(n + 1);
  });

  it("only engineers' drafts may hold their decisions; viewers cannot write", async () => {
    const c = client(demoDir(), { users: true });
    const eng = await c.as("engineer");
    expect((await eng.post("/api/decisions", { title: "On main" })).status).toBe(403);
    const { id } = await ok(eng.post("/api/drafts", { title: "Plan" }));
    await ok(eng.at(`draft:${id}`).post("/api/decisions", { title: "In a draft" }));
    const viewer = await c.as("viewer");
    expect((await viewer.at(`draft:${id}`).post("/api/decisions", { title: "No" })).status).toBe(403);
  });
});

describe("decisions in drafts", () => {
  it("are copied into a draft, compared, and applied with renumbering", async () => {
    const dir = demoDir();
    const c = client(dir);
    await ok(c.post("/api/decisions", { title: "Before the draft" }));
    const { id: draft } = await ok(c.post("/api/drafts", { title: "Plan" }));
    expect(fs.readdirSync(path.join(dir, "architecture", "drafts", draft, "decisions")).length).toBe(files(dir).length);
    expect(fs.readdirSync(path.join(dir, "architecture", "drafts", draft, "base", "decisions")).length).toBe(files(dir).length);

    const d = c.at(`draft:${draft}`);
    const { id: inDraft } = await ok(d.post("/api/decisions", { title: "From the draft" }));
    const { id: onMain } = await ok(c.post("/api/decisions", { title: "On main meanwhile" }));
    expect(inDraft).toBe(onMain); // same number on both sides

    const changes = await ok(c.at(`draft:${draft}`, "base").get("/api/changes"));
    expect(changes.decisions).toMatchObject([{ id: inDraft, change: "added", type: "decision" }]);

    const preview = await ok(c.get(`/api/drafts/${draft}/apply-preview`));
    expect(preview.conflicts).toEqual([]);
    await ok(c.post(`/api/drafts/${draft}/apply`, {}));
    const titles = (await ok(c.get("/api/state"))).decisions.map((x: any) => [x.id, x.title]);
    const next = String(Number(onMain) + 1).padStart(4, "0");
    expect(titles).toEqual(
      expect.arrayContaining([
        [onMain, "On main meanwhile"],
        [next, "From the draft"],
      ]),
    );
    expect(files(dir)).toContain(`${next}-from-the-draft.md`);
  });

  it("dp check warns about decisions on objects that are gone", async () => {
    const dir = demoDir();
    const c = client(dir);
    await ok(c.post("/api/decisions", { title: "About a ghost", affects: ["no-such-element"] }));
    expect(checkProject(new Project(dir)).warnings.join(" ")).toMatch(/About a ghost.*no-such-element/);
  });
});

const hasGit = (() => {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe.runIf(hasGit)("decisions at a git ref", () => {
  it("are read from the commit and compared with the working model", async () => {
    const dir = demoDir();
    const git = (...a: string[]) => execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...a], { cwd: dir, stdio: "ignore" });
    const c = client(dir);
    await ok(c.post("/api/decisions", { title: "Committed one" }));
    git("init", "-q", "-b", "main");
    git("add", "-A");
    git("commit", "-q", "-m", "first");
    const { id } = await ok(c.post("/api/decisions", { title: "Not committed" }));
    const atRef = await ok(c.at("ref:main").get("/api/state"));
    expect(atRef.decisions.map((d: any) => d.title)).toContain("Committed one");
    expect(atRef.decisions.map((d: any) => d.title)).not.toContain("Not committed");
    const changes = await ok(c.at("main", "ref:main").get("/api/changes"));
    expect(changes.decisions).toMatchObject([{ id, change: "added" }]);
  });
});
