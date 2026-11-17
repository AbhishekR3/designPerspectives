/** Security review follow-ups for the import and BMO code: what a model cannot make "verified", fail-closed apply, intake and apply rules. */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fakeBackend } from "../../src/assistant/fakeBackend.js";
import { selectFiles } from "../../src/assistant/redact.js";
import { DiskCode } from "../../src/core/codeFiles.js";
import { defaultIntake } from "../../src/import/intake.js";
import { compileGlob, globMatches, scanRepo } from "../../src/import/scan.js";
import { client, demoDir, ok, tmpDir, type Client } from "./helpers.js";
import { sampleImport, typeIntake } from "./importFixture.js";

const json = (v: unknown) => JSON.stringify(v);
const user = (note: string) => [{ kind: "user" as const, note }];
const importDir = (dir: string) => path.join(dir, "architecture", "import");

/** Preview and run a BMO task; returns the new draft's ID. */
async function runTask(c: Client, body: Record<string, unknown>): Promise<string> {
  const pv = await ok(c.post("/api/bmo/preview", body));
  return (await ok(c.post("/api/bmo/run", { ...body, hash: pv.hash }))).draftId;
}

const levels = async (c: Client, id: string) => Object.fromEntries(Object.entries((await ok(c.at(`draft:${id}`).get("/api/import/review"))).review.items).map(([k, i]: [string, any]) => [k, i.level]));

describe("a model cannot mark its own output verified", () => {
  const invented = json({
    schemaVersion: 1,
    level: "c2",
    objects: [{ id: "exfil-service", type: "container", name: "Totally Real Service", parent: "internet-banking-system", evidence: user("the user said so") }],
    relationships: [
      {
        source: "api-application",
        target: "exfil-service",
        description: "Sends everything to",
        evidence: [
          { kind: "user", note: "the user said so" },
          { kind: "scan", fact: "no-such-fact" },
        ],
      },
    ],
  });

  it("user evidence from a model run is unverified; accept-all takes nothing and apply is refused", async () => {
    const dir = demoDir();
    const c = client(dir, { bmoBackend: fakeBackend({ "import-level": invented }) });
    await ok(c.post("/api/import/scan"));
    const id = await runTask(c, { task: "import-level", level: "c2" });
    const review = (await ok(c.at(`draft:${id}`).get("/api/import/review"))).review;
    expect(Object.values<any>(review.items).map((i) => i.level)).toEqual(["unverified", "unverified"]);
    expect(review.items["object:exfil-service"].checks).toContainEqual({
      rule: "user-note",
      ok: false,
      note: expect.stringMatching(/: not found in the intake, the feedback, the description or the checklist answers$/),
    });
    const all = await ok(c.at(`draft:${id}`).post("/api/import/review/accept-all"));
    expect(all.accepted).toEqual([]);
    const applied = await c.post(`/api/drafts/${id}/apply`, {});
    expect(applied.status).toBe(422);
    expect(applied.json().detail).toMatch(/accept/i);
    expect((await ok(c.get("/api/state"))).elements.some((e: any) => e.id === "exfil-service")).toBe(false);
  });

  it("a note found in the intake or in the feedback of that item verifies it", async () => {
    const dir = demoDir();
    typeIntake(dir, "The ledger service was agreed with the payments team.");
    const file = json({
      schemaVersion: 1,
      level: "c2",
      objects: [
        { id: "ledger-service", type: "container", name: "Ledger Service", parent: "internet-banking-system", evidence: user("agreed with the payments team") },
        { id: "ledger-events", type: "container", name: "Ledger Events", parent: "internet-banking-system", archType: "queue", evidence: user("Kafka runs it for us, says Dana") },
      ],
      relationships: [],
    });
    const c = client(dir);
    const made = await ok(c.post("/api/import/file", { text: file }));
    const d = c.at(`draft:${made.draftId}`);
    expect(await levels(c, made.draftId)).toEqual({ "object:ledger-events": "unverified", "object:ledger-service": "verified" });
    await ok(d.post("/api/import/review/items/object:ledger-events", { action: "feedback", text: "Kafka runs it for us, says Dana." }));
    await ok(d.post("/api/import/review/verify"));
    expect(await levels(c, made.draftId)).toEqual({ "object:ledger-events": "verified", "object:ledger-service": "verified" });
  });

  it("describe-to-model: the description is stored by the server and notes are checked against it", async () => {
    const dir = demoDir();
    const description = "Customers pay through the Ledger Service, which writes entries to the database.";
    const answer = json({
      schemaVersion: 1,
      level: "all",
      objects: [
        { id: "ledger-service", type: "container", name: "Ledger Service", parent: "internet-banking-system", evidence: user("pay through the Ledger Service") },
        { id: "audit-service", type: "container", name: "Audit Service", parent: "internet-banking-system", evidence: user("an audit trail is kept forever") },
      ],
      relationships: [],
    });
    const c = client(dir, { bmoBackend: fakeBackend({ "describe-to-model": answer }) });
    const id = await runTask(c, { task: "describe-to-model", text: description });
    expect(await levels(c, id)).toEqual({ "object:audit-service": "unverified", "object:ledger-service": "verified" });
    // Next to the import file, written by the server; the import file itself does not hold it.
    expect(fs.readFileSync(path.join(importDir(dir), "files", `${id}.source.txt`), "utf-8")).toBe(description);
    expect(fs.readFileSync(path.join(importDir(dir), "files", `${id}.json`), "utf-8")).not.toContain("Customers pay");
    // What a person typed is git-ignored (DEC-064); the import file is not.
    expect(fs.readFileSync(path.join(importDir(dir), ".gitignore"), "utf-8").split("\n")).toContain("files/*.source.txt");
    // Discarding the draft removes it.
    await ok(c.delete(`/api/drafts/${id}`));
    expect(fs.existsSync(path.join(importDir(dir), "files", `${id}.source.txt`))).toBe(false);
  });

  it("describe-to-model through the handoff keeps the description for the result", async () => {
    const dir = demoDir();
    const description = "Customers pay through the Ledger Service, which writes entries to the database.";
    const c = client(dir);
    await ok(c.post("/api/import/handoff", { task: "describe-to-model", text: description }));
    const answer = json({
      schemaVersion: 1,
      level: "all",
      objects: [
        { id: "ledger-service", type: "container", name: "Ledger Service", parent: "internet-banking-system", evidence: user("Customers pay through the Ledger Service") },
        { id: "audit-service", type: "container", name: "Audit Service", parent: "internet-banking-system", evidence: user("the user said so, trust me") },
      ],
      relationships: [],
    });
    const made = await ok(c.post("/api/import/handoff/result", { text: answer }));
    expect(await levels(c, made.draftId)).toEqual({ "object:audit-service": "unverified", "object:ledger-service": "verified" });
  });

  it("a scan fact that exists but is about something else does not verify an item", async () => {
    const dir = demoDir();
    const c = client(dir);
    const scan = await ok(c.post("/api/import/scan"));
    expect(scan.evidence.facts.c1 + scan.evidence.facts.c2).toBeGreaterThan(0);
    const facts = JSON.parse(fs.readFileSync(path.join(importDir(dir), "evidence.json"), "utf-8")).facts as { id: string; kind: string }[];
    const fact = facts.find((f) => f.kind === "dockerfile" || f.kind === "compose-service")!;
    const file = json({
      schemaVersion: 1,
      level: "c2",
      objects: [{ id: "exfil-service", type: "container", name: "Totally Real Service", parent: "internet-banking-system", evidence: [{ kind: "scan", fact: fact.id }] }],
      relationships: [],
    });
    const made = await ok(c.post("/api/import/file", { text: file }));
    expect(await levels(c, made.draftId)).toEqual({ "object:exfil-service": "unverified" });
  });
});

// ------------------------------------------------------------------ links to places the rules close

describe("a symlink does not open what the rules close", () => {
  /** A code folder with `secrets/prod.env`, a link to it from `config/app.cfg`, and a folder link `docs` to `secrets`. */
  function linked(): string {
    const dir = tmpDir();
    const write = (rel: string, text: string) => {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), text);
    };
    write("secrets/prod.env", "DB_HOST=db.internal\n");
    write("secrets/id_rsa", "not a key\n");
    write("secrets/notes.txt", "plain notes\n");
    write("src/main.ts", "export const x = 1;\n");
    fs.mkdirSync(path.join(dir, "config"), { recursive: true });
    fs.symlinkSync("../secrets/prod.env", path.join(dir, "config", "app.cfg"));
    fs.symlinkSync("../secrets/id_rsa", path.join(dir, "config", "plain.txt"));
    fs.symlinkSync("secrets", path.join(dir, "docs"));
    return dir;
  }
  const noScope = { include: [], exclude: [], otherRepos: [] };

  it("selectFiles checks the resolved path too: must-not-open, the deny-list and the scope", () => {
    const code = new DiskCode(linked());
    const sel = selectFiles(code, { mustNotOpen: ["secrets/**"], scope: noScope });
    expect(sel.read("secrets/prod.env")).toMatchObject({ refused: expect.any(String) });
    expect(sel.read("config/app.cfg")).toMatchObject({ refused: expect.stringMatching(/must-not-open/) });
    expect(sel.read("docs/prod.env")).toMatchObject({ refused: expect.any(String) });
    // The deny-list on the real name: a link called plain.txt that points to id_rsa.
    const open = selectFiles(code, { mustNotOpen: [], scope: noScope });
    expect(open.read("config/plain.txt")).toMatchObject({ refused: expect.stringMatching(/id_rsa/) });
    // A scope that includes only src/: a link into secrets/ is outside it.
    const scoped = selectFiles(code, { mustNotOpen: [], scope: { include: ["src/**", "config/**"], exclude: [], otherRepos: [] } });
    expect(scoped.read("config/app.cfg")).toMatchObject({ refused: expect.any(String) });
    // An ordinary file is still read.
    expect(open.read("src/main.ts")).toMatchObject({ path: "src/main.ts" });
  });

  it("the scan does not read a file whose real path is excluded or must not be opened", () => {
    const dir = linked();
    const intake = defaultIntake();
    intake.mustNotOpen = ["secrets/**"];
    intake.scope.exclude = ["docs-real"];
    const ev = scanRepo(new DiskCode(dir), intake);
    const files = ev.files.sizes.map(([p]) => p).concat(ev.facts.map((f) => f.path));
    expect(files.filter((p) => p.startsWith("config/") || p.startsWith("docs/") || p.startsWith("secrets/"))).toEqual([]);
    expect(ev.files.total).toBe(1);
  });
});

// ------------------------------------------------------------------ the glob matcher

/** The meaning of a glob, written as a plain regular expression (what the matcher did before): the reference the automaton is compared with. */
function reference(pattern: string): RegExp {
  const p = pattern.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "") || "*";
  let s = "";
  for (let i = 0; i < p.length;) {
    if (p.startsWith("**/", i)) {
      s += "(?:.*/)?";
      i += 3;
    } else if (p.startsWith("/**", i) && i + 3 === p.length) {
      s += "(?:/.*)?";
      i += 3;
    } else if (p.startsWith("**", i)) {
      s += ".*";
      i += 2;
    } else {
      const ch = p[i++]!;
      s += ch === "*" ? "[^/]*" : ch === "?" ? "[^/]" : ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${s}$`);
}

describe("the glob matcher", () => {
  it("agrees with the plain meaning of a glob, for patterns with many wildcards too", () => {
    const parts = ["*", "**", "**/", "/**", "?", "a", "b", "/", ".", "ab"];
    let seed = 7;
    const rnd = (n: number) => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n;
    for (let n = 0; n < 3000; n++) {
      const pattern = Array.from({ length: 1 + rnd(7) }, () => parts[rnd(parts.length)]).join("");
      const ref = reference(pattern);
      const g = compileGlob(pattern);
      for (let k = 0; k < 12; k++) {
        const text = Array.from({ length: rnd(9) }, () => "ab/."[rnd(4)]).join("");
        // A glob matches the path or a folder above it.
        const parts2 = text.split("/");
        let expected = false;
        for (let m = 1; m <= parts2.length; m++) {
          const sub = parts2.slice(0, m).join("/");
          if (/\//.test(pattern.trim().replace(/\/+$/, "").replace(/^\.\//, "")) ? ref.test(sub) : ref.test(parts2[m - 1]!)) expected = true;
        }
        expect(globMatches(g, text), `${pattern} ~ ${text}`).toBe(expected);
      }
    }
  });

  it("takes linear time on a pattern that makes a backtracking engine exponential", () => {
    const g = compileGlob("*a*a*a*a*a*a*a*a*a*a*a*a*a*b");
    const t = Date.now();
    expect(globMatches(g, "a".repeat(4000))).toBe(false);
    expect(globMatches(compileGlob("**/**x/**/**y/**/**z"), "a/".repeat(300))).toBe(false);
    expect(Date.now() - t).toBeLessThan(500);
  });
});

describe("the scan on hostile files", () => {
  it("reads 400 KB of awkward text in each kind of file in well under a second per file", () => {
    const N = 400_000;
    const shapes: Record<string, string> = {
      spaces: "[" + " ".repeat(N),
      brackets: "[[".repeat(N / 2),
      lines: "a = b\n".repeat(N / 6),
      dashes: "- ".repeat(N / 2),
      words: "x ".repeat(N / 2),
      quotes: '"'.repeat(N),
      colons: "a: ".repeat(N / 3),
      indent: ("  ".repeat(20) + "name: x\n").repeat(N / 50),
      env: "FOO=".repeat(N / 4),
      anchors: "&a ".repeat(N / 3),
    };
    const names = ["pyproject.toml", "docker-compose.yml", "Dockerfile", ".env.example", "deployment.yaml", "serverless.yml", "go.mod", "requirements.txt", "package.json", "app.py", "index.ts"];
    for (const [shape, text] of Object.entries(shapes)) {
      const dir = tmpDir();
      const intake = defaultIntake();
      intake.settings.maxFileBytes = 2_000_000;
      for (const name of names) fs.writeFileSync(path.join(dir, name), name === "deployment.yaml" ? `kind: Deployment\n${text}` : text);
      const t = Date.now();
      scanRepo(new DiskCode(dir), intake);
      const ms = Date.now() - t;
      expect(ms, `${shape}: ${ms} ms for ${names.length} files`).toBeLessThan(names.length * 500);
    }
  });
});

// ------------------------------------------------------------------ secrets in files that git tracks

describe("an import file holds no secrets, and the handoff folder is not committed", () => {
  const SECRET_FORMS: [string, string][] = [
    ["a connection string with a slash in the password", "postgres://app:ab/cd+ef@db.internal:5432/app"],
    ["a private key name", "PRIVATE_KEY=hunter2hunter2"],
    ["a quoted passphrase", "passphrase = 'Correct-horse-9'"],
    ["an XML setting", '<add key="ApiKey" value="abcd1234efgh"/>'],
    ["a webhook", "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX"],
  ];
  const withField = (set: (f: any, v: string) => void, v: string) => {
    const f = sampleImport() as any;
    set(f, v);
    return f;
  };
  const FIELDS: [string, (f: any, v: string) => void, string][] = [
    ["a description", (f, v) => (f.objects[0].description = `Connects with ${v}`), "/objects/0/description"],
    ["an evidence note", (f, v) => (f.objects[1].evidence = [{ kind: "user", note: v }]), "/objects/1/evidence/0/note"],
    ["quoted evidence text", (f, v) => (f.objects[0].evidence[0].text = v), "/objects/0/evidence/0/text"],
    ["a technology", (f, v) => (f.objects[0].technologies = [v]), "/objects/0/technologies/0"],
    ["a relationship description", (f, v) => (f.relationships[0].description = `Posts to ${v}`), "/relationships/0/description"],
    ["a decision's text", (f, v) => (f.decisions[0].decision = v), "/decisions/0/decision"],
    ["a question", (f, v) => (f.questions = [v]), "/questions/0"],
  ];
  for (const [what, set, pointer] of FIELDS) {
    it(`refuses a secret in ${what}, naming the field`, async () => {
      const c = client(demoDir());
      for (const [form, value] of SECRET_FORMS) {
        const r = await c.post("/api/import/check", { text: JSON.stringify(withField(set, value)) });
        const errs = r.json().errors as { pointer: string; message: string }[];
        expect(
          errs.map((e) => e.pointer),
          `${what}: ${form}`,
        ).toContain(pointer);
        expect(JSON.stringify(errs), form).not.toContain("hunter2hunter2");
      }
    });
  }
  it("keeps accepting names, placeholders and environment references", async () => {
    const f = sampleImport() as any;
    f.objects[0].description = "Reads the password from ${DB_PASSWORD} and PRIMARY_KEY = 'id'; process.env.API_KEY is set outside.";
    const r = await client(demoDir()).post("/api/import/check", { text: JSON.stringify(f) });
    expect(r.json().errors).toEqual([]);
  });

  it("the handoff folder is listed in architecture/import/.gitignore on the first write, and git ignores it; the import files are not ignored", async () => {
    const dir = demoDir();
    const git = (...args: string[]) => spawnSync("git", args, { cwd: dir, encoding: "utf-8" });
    git("init", "-q");
    const c = client(dir);
    await ok(c.post("/api/import/scan"));
    const offer = await ok(c.post("/api/import/handoff", { task: "import-level", level: "c1" }));
    expect(offer.prompt).toMatch(/not committed/);
    const ignore = fs.readFileSync(path.join(importDir(dir), ".gitignore"), "utf-8");
    expect(ignore.split("\n")).toEqual(expect.arrayContaining(["handoff/"]));
    expect(git("check-ignore", "architecture/import/handoff/prompt.md").status).toBe(0);
    const made = await ok(c.post("/api/import/file", { text: JSON.stringify(sampleImport()) }));
    expect(git("check-ignore", `architecture/import/files/${made.draftId}.json`).status).toBe(1);
    expect(git("check-ignore", `architecture/import/reviews/${made.draftId}.json`).status).toBe(1);
    expect(git("check-ignore", `architecture/import/files/${made.draftId}.source.txt`).status).toBe(0);
    // A line a person added is kept, and the file is not written twice.
    fs.appendFileSync(path.join(importDir(dir), ".gitignore"), "notes/\n");
    await ok(c.post("/api/import/handoff", { task: "import-level", level: "c1" }));
    expect(
      fs
        .readFileSync(path.join(importDir(dir), ".gitignore"), "utf-8")
        .split("\n")
        .filter((l) => l === "handoff/"),
    ).toHaveLength(1);
    expect(fs.readFileSync(path.join(importDir(dir), ".gitignore"), "utf-8")).toContain("notes/");
    // dp's own folder with a hidden file in it does not upset the model, the check or the drafts.
    expect((await c.get("/api/state")).status).toBe(200);
    expect((await ok(c.get("/api/state"))).drafts.length).toBe(1);
    expect((await ok(c.post("/api/import/scan"))).evidence).not.toBeNull();
  });
});

// ------------------------------------------------------------------ an import draft with nothing accepted

describe("apply with no accepted item", () => {
  /** The files of the main model, byte for byte. */
  const modelFiles = (dir: string) => Object.fromEntries(["workspace.json", "designperspectives.json"].map((f) => [f, fs.readFileSync(path.join(dir, "architecture", f), "utf-8")]));

  it("is refused even when the draft also has position, style, layout, tag group and lens changes, and nothing reaches main", async () => {
    const dir = demoDir();
    const c = client(dir);
    const made = await ok(c.post("/api/import/file", { text: JSON.stringify(sampleImport()) }));
    const d = c.at(`draft:${made.draftId}`);
    const key = "containers-internet-banking-system";
    await ok(d.put(`/api/diagrams/${key}/positions`, { positions: { "api-application": { x: 123, y: 321 } } }));
    await ok(d.put(`/api/diagrams/${key}/layout`, { lineShape: "straight", sizes: { "api-application": { w: 300, h: 200 } } }));
    await ok(d.put("/api/styles/api-application", { color: "#ff0000" }));
    await ok(d.post("/api/tag-groups", { name: "Zone", values: [{ name: "Red", color: "#f00" }] }));
    await ok(d.post("/api/lenses", { name: "Only mine", visibleSections: [] }));
    const before = modelFiles(dir);

    const pv = await ok(c.get(`/api/drafts/${made.draftId}/apply-preview`));
    expect(pv.held.nothingAccepted).toBe(true);
    const applied = await c.post(`/api/drafts/${made.draftId}/apply`, {});
    expect(applied.status).toBe(422);
    expect(applied.json().detail).toMatch(/Nothing is accepted/);
    expect(modelFiles(dir)).toEqual(before);
    const main = await ok(c.get("/api/state"));
    expect(main.elements.some((e: any) => e.id === "ledger-service")).toBe(false);
    expect(main.drafts.map((x: any) => x.id)).toContain(made.draftId);
  });

  it("with one item accepted the apply goes through and the others stay in the draft; layout then comes along with it", async () => {
    const dir = demoDir();
    typeIntake(dir, "EVIDENCE-MARKER-USER");
    const c = client(dir);
    const made = await ok(c.post("/api/import/file", { text: JSON.stringify(sampleImport()) }));
    const d = c.at(`draft:${made.draftId}`);
    await ok(d.post("/api/import/review/items/object:ledger-events", { action: "accept" }));
    const pv = await ok(c.get(`/api/drafts/${made.draftId}/apply-preview`));
    expect(pv.held.nothingAccepted).toBe(false);
    const applied = await c.post(`/api/drafts/${made.draftId}/apply`, {});
    expect(applied.status).toBe(200);
    expect((await ok(c.get("/api/state"))).elements.some((e: any) => e.id === "ledger-events")).toBe(true);
  });
});

// ------------------------------------------------------------------ fail closed without a review

describe("an import draft whose review file is gone", () => {
  const made = async (c: Client) => (await ok(c.post("/api/import/file", { text: JSON.stringify(sampleImport()) }))).draftId as string;
  const reviewFile = (dir: string, id: string) => path.join(importDir(dir), "reviews", `${id}.json`);

  for (const how of ["missing", "unreadable"] as const) {
    it(`is not applied whole when the review file is ${how}; "check again" rebuilds it with every item pending`, async () => {
      const dir = demoDir();
      typeIntake(dir, "EVIDENCE-MARKER-USER");
      const c = client(dir);
      const id = await made(c);
      const d = c.at(`draft:${id}`);
      await ok(d.post("/api/import/review/items/object:ledger-events", { action: "accept" }));
      if (how === "missing") fs.rmSync(reviewFile(dir, id));
      else fs.writeFileSync(reviewFile(dir, id), "{ not json");
      const before = fs.readFileSync(path.join(dir, "architecture", "workspace.json"), "utf-8");

      for (const r of [await c.post(`/api/drafts/${id}/apply`, {}), await c.get(`/api/drafts/${id}/apply-preview`)]) {
        expect(r.status).toBe(422);
        expect(r.json().detail).toMatch(/review/);
        expect(r.json().detail).toMatch(/check again|verify/i);
      }
      expect(fs.readFileSync(path.join(dir, "architecture", "workspace.json"), "utf-8")).toBe(before);

      const rebuilt = (await ok(d.post("/api/import/review/verify"))).review;
      expect(Object.keys(rebuilt.items).sort()).toEqual([
        "decision:keep-a-separate-ledger-service",
        "flow:flow-post-a-ledger-entry",
        "object:ledger-events",
        "object:ledger-service",
        "relationship:api-application--ledger-service",
        "relationship:ledger-events--database",
        "relationship:ledger-service--ledger-events",
      ]);
      expect(Object.values<any>(rebuilt.items).every((i) => i.decision === "pending")).toBe(true);
      expect(rebuilt.items["object:ledger-service"]).toMatchObject({ name: "Ledger Service", pointer: "/objects/0" });
      expect(rebuilt.items["object:ledger-events"].level).toBe("verified");
      // Nothing is accepted, so nothing is applied; after an accept, the apply is partial again.
      expect((await c.post(`/api/drafts/${id}/apply`, {})).status).toBe(422);
      await ok(d.post("/api/import/review/items/object:ledger-events", { action: "accept" }));
      expect((await c.post(`/api/drafts/${id}/apply`, {})).status).toBe(200);
      const state = await ok(c.get("/api/state"));
      expect(state.elements.some((e: any) => e.id === "ledger-events")).toBe(true);
      expect(state.elements.some((e: any) => e.id === "ledger-service")).toBe(false);
    });
  }

  it("an ordinary draft (not an import) is not affected", async () => {
    const c = client(demoDir());
    const id = (await ok(c.post("/api/drafts", { title: "Plain" }))).id;
    await ok(c.at(`draft:${id}`).post("/api/elements", { name: "Plain Thing", kind: "person" }));
    expect((await c.post(`/api/drafts/${id}/apply`, {})).status).toBe(200);
  });
});

// ------------------------------------------------------------------ code edits cannot reach dp's own folders

describe("code edits do not rewrite review state", () => {
  const REVIEW_PATHS = ["architecture/import/reviews/import-c2.json", "architecture/workspace.json", "architecture/drafts/x/workspace.json", ".dp/users.json"];

  it("a code file cannot be saved or planned under architecture/ or .dp/", async () => {
    const dir = demoDir();
    const c = client(dir, { codeRoot: dir });
    const id = await ok(c.post("/api/import/file", { text: JSON.stringify(sampleImport()) })).then((m: any) => m.draftId as string);
    const d = c.at(`draft:${id}`);
    const before = fs.readFileSync(path.join(dir, "architecture", "workspace.json"), "utf-8");
    for (const p of REVIEW_PATHS) {
      const direct = await c.put("/api/code/file", { path: p, content: "{}", mtime: null });
      expect(direct.status, p).toBe(422);
      const planned = await d.post("/api/code/file", { path: p.replace(/\.json$/, "-new.json"), content: "{}" });
      expect(planned.status, p).toBe(422);
      expect(planned.json().detail).toMatch(/architecture|\.dp|hidden/i);
    }
    const edit = await d.put("/api/code/file", { path: "architecture/workspace.json", content: "{}", mtime: null });
    expect(edit.status).toBe(422);
    expect(fs.readFileSync(path.join(dir, "architecture", "workspace.json"), "utf-8")).toBe(before);
  });

  it("a planned edit that already sits in the draft's code plan blocks the apply", async () => {
    const dir = demoDir();
    typeIntake(dir, "EVIDENCE-MARKER-USER");
    const c = client(dir, { codeRoot: dir });
    const id = await ok(c.post("/api/import/file", { text: JSON.stringify(sampleImport()) })).then((m: any) => m.draftId as string);
    await ok(c.at(`draft:${id}`).post("/api/import/review/items/object:ledger-events", { action: "accept" }));
    const draftDir = path.join(dir, "architecture", "drafts", id);
    fs.mkdirSync(path.join(draftDir, "code", "architecture", "import", "reviews"), { recursive: true });
    fs.writeFileSync(path.join(draftDir, "code", "architecture", "import", "reviews", `${id}.json`), "{}");
    fs.writeFileSync(path.join(draftDir, "code.json"), JSON.stringify({ files: { [`architecture/import/reviews/${id}.json`]: { change: "changed", base: null } } }));
    const before = fs.readFileSync(path.join(importDir(dir), "reviews", `${id}.json`), "utf-8");
    const r = await c.post(`/api/drafts/${id}/apply`, {});
    expect(r.status).toBe(409);
    expect(JSON.stringify(r.json())).toMatch(/architecture/);
    expect(fs.readFileSync(path.join(importDir(dir), "reviews", `${id}.json`), "utf-8")).toBe(before);
  });
});

// ------------------------------------------------------------------ who may loosen the intake

describe("the intake's limits", () => {
  const intakeOf = (patch: Record<string, unknown> = {}) => ({
    schemaVersion: 1,
    mustNotOpen: ["secrets/**", "keys/**"],
    scope: { include: [], exclude: ["vendor"], otherRepos: [] },
    settings: { maxFiles: 1000, maxFileBytes: 100000 },
    ...patch,
  });

  it("an engineer can edit the intake and add to what is closed, but only an architect can remove or narrow it or raise the caps", async () => {
    const dir = demoDir();
    const c = client(dir, { users: true });
    const arch = await c.as("architect");
    const eng = await c.as("engineer");
    await ok(arch.put("/api/import/intake", intakeOf()));
    const put = (who: Client, i: unknown) => who.put("/api/import/intake", i);

    // Allowed for an engineer: more closed paths, lower caps, other fields.
    expect((await put(eng, intakeOf({ mustNotOpen: ["secrets/**", "keys/**", "more/**"], depth: "c2", system: { name: "Shop", purpose: "Sells things" } }))).status).toBe(200);
    expect(
      (
        await put(
          eng,
          intakeOf({ mustNotOpen: ["secrets/**", "keys/**", "more/**"], scope: { include: ["src"], exclude: ["vendor", "dist"], otherRepos: [] }, settings: { maxFiles: 500, maxFileBytes: 50000 } }),
        )
      ).status,
    ).toBe(200);

    const refusals: [string, Record<string, unknown>][] = [
      ["a removed must-not-open entry", { mustNotOpen: ["secrets/**"] }],
      ["a narrowed must-not-open entry", { mustNotOpen: ["secrets/prod/**", "keys/**", "more/**"] }],
      ["the whole must-not-open list emptied", { mustNotOpen: [] }],
      ["a removed exclude", { mustNotOpen: ["secrets/**", "keys/**", "more/**"], scope: { include: ["src"], exclude: ["dist"], otherRepos: [] } }],
      [
        "more files",
        { mustNotOpen: ["secrets/**", "keys/**", "more/**"], scope: { include: ["src"], exclude: ["vendor", "dist"], otherRepos: [] }, settings: { maxFiles: 5000, maxFileBytes: 50000 } },
      ],
      [
        "bigger files",
        { mustNotOpen: ["secrets/**", "keys/**", "more/**"], scope: { include: ["src"], exclude: ["vendor", "dist"], otherRepos: [] }, settings: { maxFiles: 500, maxFileBytes: 900000 } },
      ],
    ];
    for (const [what, patch] of refusals) {
      const r = await put(eng, intakeOf(patch));
      expect(r.status, what).toBe(403);
      expect(r.json().detail, what).toMatch(/architect/);
    }
    const stored = JSON.parse(fs.readFileSync(path.join(importDir(dir), "intake.json"), "utf-8"));
    expect(stored.mustNotOpen).toEqual(["secrets/**", "keys/**", "more/**"]);
    expect(stored.settings.maxFiles).toBe(500);

    // An architect may.
    expect((await put(arch, intakeOf({ mustNotOpen: ["secrets/**"], scope: { include: [], exclude: [], otherRepos: [] }, settings: { maxFiles: 9000, maxFileBytes: 900000 } }))).status).toBe(200);
    // A viewer cannot write the intake at all.
    expect((await put(await c.as("viewer"), intakeOf())).status).toBe(403);
  });

  it("scope.include: an engineer may make it read less, only an architect may make it read more", async () => {
    const dir = demoDir();
    const c = client(dir, { users: true });
    const arch = await c.as("architect");
    const eng = await c.as("engineer");
    const withInclude = (include: string[]) => intakeOf({ scope: { include, exclude: ["vendor"], otherRepos: [] } });
    await ok(arch.put("/api/import/intake", withInclude(["src", "lib", "tools"])));
    const put = (i: string[]) => eng.put("/api/import/intake", withInclude(i));

    // Reads less: some entries removed while one stays.
    expect((await put(["src", "lib"])).status).toBe(200);
    expect((await put(["src"])).status).toBe(200);
    // Reads more: emptied (the whole code root), an entry added, an entry changed.
    for (const [what, include] of [
      ["emptied", []],
      ["added", ["src", "lib"]],
      ["changed", ["sr*"]],
    ] as const) {
      const r = await put([...include]);
      expect(r.status, what).toBe(403);
      expect(r.json().detail, what).toMatch(/scope\.include/);
    }
    expect(JSON.parse(fs.readFileSync(path.join(importDir(dir), "intake.json"), "utf-8")).scope.include).toEqual(["src"]);
    // From an empty list (everything), any first entry reads less.
    await ok(arch.put("/api/import/intake", withInclude([])));
    expect((await put(["src", "lib"])).status).toBe(200);
    // An architect may widen it.
    expect((await arch.put("/api/import/intake", withInclude([]))).status).toBe(200);
  });

  it("without sign-in the intake is as open as every other setting", async () => {
    const c = client(demoDir());
    await ok(c.put("/api/import/intake", intakeOf()));
    expect((await c.put("/api/import/intake", intakeOf({ mustNotOpen: [] }))).status).toBe(200);
  });
});
