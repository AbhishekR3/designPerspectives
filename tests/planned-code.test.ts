import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelError } from "../src/core/ops.js";
import { Project } from "../src/core/store.js";
import { client, demoDir, ok, type Client } from "./helpers.js";

const tsx = path.resolve("node_modules", ".bin", "tsx");
const hasGit = spawnSync("git", ["--version"]).status === 0;
function git(dir: string, ...args: string[]): void {
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args], { cwd: dir, stdio: "ignore" });
}
const file = (dir: string, rel: string) => path.join(dir, ...rel.split("/"));
const read = (dir: string, rel: string) => (fs.existsSync(file(dir, rel)) ? fs.readFileSync(file(dir, rel), "utf-8") : null);

describe("code edits in a draft", () => {
  it("stay in the draft until it is applied", async () => {
    const dir = demoDir();
    const c = client(dir);
    const { id } = await ok(c.post("/api/drafts", { title: "Accounts v2" }));
    const d = c.at(`draft:${id}`);
    const before = read(dir, "sample_code/api/accounts.py")!;

    const opened = await ok(d.get("/api/code/file", { path: "sample_code/api/accounts.py" }));
    expect(opened.planned).toBeNull();
    await ok(d.put("/api/code/file", { path: "sample_code/api/accounts.py", content: "# v2\n", mtime: opened.mtime }));
    await ok(d.post("/api/code/file", { path: "sample_code/api/audit.py", content: "def log(x):\n    pass\n" }));
    await ok(d.delete("/api/code/file?path=sample_code/api/email_sender.py"));

    // The code folder is untouched; the draft shows its planned versions.
    expect(read(dir, "sample_code/api/accounts.py")).toBe(before);
    expect(read(dir, "sample_code/api/audit.py")).toBeNull();
    expect(await ok(d.get("/api/code/file", { path: "sample_code/api/accounts.py" }))).toMatchObject({ content: "# v2\n", planned: "changed" });
    expect((await ok(c.get("/api/code/file", { path: "sample_code/api/accounts.py" }))).content).toBe(before);
    const tree = (await ok(d.get("/api/code/tree", { path: "sample_code/api" }))).entries.map((e: any) => e.name);
    expect(tree).toContain("audit.py");
    expect(tree).not.toContain("email_sender.py");
    expect((await ok(c.get("/api/state"))).drafts[0].plannedFiles).toBe(3);

    // New files and deletions are drafts-only.
    expect((await c.post("/api/code/file", { path: "sample_code/x.py", content: "" })).status).toBe(422);
    expect((await d.post("/api/code/file", { path: "../escape.py", content: "" })).status).toBe(422);

    // Changes: code files per mapped object, unmapped planned files on their own.
    const cs = await ok(c.at(`draft:${id}`, "base").get("/api/changes"));
    const byOwner = Object.fromEntries(cs.code.map((x: any) => [x.ownerId, x.files]));
    expect(byOwner["accounts-summary-controller"]).toEqual([{ path: "sample_code/api/accounts.py", change: "changed" }]);
    expect(byOwner["e-mail-component"]).toEqual([{ path: "sample_code/api/email_sender.py", change: "removed" }]);
    expect(byOwner[""]).toEqual([{ path: "sample_code/api/audit.py", change: "added" }]);
    expect(cs.summary.code).toBe(3);
    expect(cs.inner).toContain("accounts-summary-controller");
    const land = await ok(c.at(`draft:${id}`, "base").get("/api/diagrams/landscape"));
    expect(land.nodes.find((n: any) => n.id === "internet-banking-system").change).toBe("inner");
    const codeDiagram = await ok(c.at(`draft:${id}`, "base").get("/api/diagrams/code-accounts-summary-controller"));
    expect(codeDiagram.nodes.find((n: any) => n.id === "file:sample_code/api/accounts.py").change).toBe("changed");
    const mailDiagram = await ok(c.at(`draft:${id}`, "base").get("/api/diagrams/code-e-mail-component"));
    expect(mailDiagram.nodes.find((n: any) => n.id === "file:sample_code/api/email_sender.py")).toMatchObject({ ghost: true, change: "removed" });

    // Revert one, apply the rest: the code folder gets them.
    await ok(d.post("/api/code/revert", { path: "sample_code/api/email_sender.py" }));
    const preview = await ok(c.get(`/api/drafts/${id}/apply-preview`));
    expect(preview.code.map((x: any) => x.path).sort()).toEqual(["sample_code/api/accounts.py", "sample_code/api/audit.py"]);
    await ok(c.post(`/api/drafts/${id}/apply`, { code: true }));
    expect(read(dir, "sample_code/api/accounts.py")).toBe("# v2\n");
    expect(read(dir, "sample_code/api/audit.py")).toContain("def log");
    expect(read(dir, "sample_code/api/email_sender.py")).not.toBeNull();
  });

  it("refuses to overwrite code changed since it was planned, unless applying the model only", async () => {
    const dir = demoDir();
    const c = client(dir);
    const { id } = await ok(c.post("/api/drafts", { title: "Clash" }));
    await ok(c.at(`draft:${id}`).put("/api/code/file", { path: "sample_code/api/accounts.py", content: "# planned\n" }));
    fs.writeFileSync(file(dir, "sample_code/api/accounts.py"), "# someone else\n");
    const r = await c.post(`/api/drafts/${id}/apply`);
    expect(r.status).toBe(409);
    expect(r.json().conflicts[0]).toEqual({ label: "File sample_code/api/accounts.py", reason: "Changed in the code folder since the draft planned a change to it." });
    await ok(c.post(`/api/drafts/${id}/apply`, { code: false }));
    expect(read(dir, "sample_code/api/accounts.py")).toBe("# someone else\n");
  });

  it("a read-only git version cannot save code", async () => {
    if (!hasGit) return;
    const dir = demoDir();
    git(dir, "init", "-q", "-b", "main");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "first");
    const c = client(dir).at("ref:HEAD");
    const f = await ok(c.get("/api/code/file", { path: "sample_code/api/accounts.py" }));
    expect(f.readOnly).toBe(true);
    expect((await c.put("/api/code/file", { path: "sample_code/api/accounts.py", content: "x" })).status).toBe(403);
  });
});

describe("coding plan", () => {
  /** A draft that adds a mapped component and a connection to it, removes one, and changes others. */
  async function plannedDraft(dir: string) {
    const c = client(dir);
    const { id } = await ok(c.post("/api/drafts", { title: "Audit log" }));
    const d = c.at(`draft:${id}`);
    const { id: audit } = await ok(d.post("/api/elements", { kind: "component", parentId: "api-application", name: "Audit Log" }));
    await ok(d.patch(`/api/elements/${audit}`, { codePaths: ["sample_code/api/audit.py"], description: "Records sign-ins." }));
    await ok(d.post("/api/relationships", { sourceId: "sign-in-controller", destinationId: audit, description: "Writes audit entries to" }));
    await ok(d.delete("/api/elements/e-mail-component"));
    await ok(d.patch("/api/elements/database", { technology: ["PostgreSQL"] }));
    await ok(d.patch("/api/elements/atm", { description: "Cash only" }));
    await ok(c.patch(`/api/drafts/${id}`, { branch: "feature/audit" }));
    return { c, id, audit };
  }

  it("lists the work and checks progress against the code folder", async () => {
    const dir = demoDir();
    const { c, id, audit } = await plannedDraft(dir);
    const plan = await ok(c.get(`/api/drafts/${id}/plan`));
    const item = (pid: string) => plan.items.find((i: any) => i.id === pid);
    expect(plan.branch).toBe("feature/audit");
    expect(plan.checkedAgainst).toBeNull();
    expect(item(`el:${audit}:add`)).toMatchObject({ kind: "build", title: 'Build the component "Audit Log"', auto: true, status: "unchecked" });
    expect(item("el:e-mail-component:remove")).toMatchObject({ kind: "remove", auto: true });
    expect(item("el:database:change")).toMatchObject({ title: 'Move "Database" from Oracle Database Schema to PostgreSQL', status: "manual" });
    expect(item("el:atm:doc")).toMatchObject({ kind: "model", status: "info" });
    expect(plan.items.find((i: any) => i.kind === "connect").title).toBe("Connect Sign In Controller → Audit Log: Writes audit entries to");

    let checked = await ok(c.get(`/api/drafts/${id}/plan`, { against: "disk" }));
    expect(checked.summary).toMatchObject({ done: 0, open: 3, manual: 1 });

    // Write the code: the new file, the import, and remove the old component's file.
    fs.writeFileSync(file(dir, "sample_code/api/audit.py"), "def log(event):\n    pass\n");
    fs.appendFileSync(file(dir, "sample_code/api/sign_in.py"), "\nfrom .audit import log\n");
    fs.rmSync(file(dir, "sample_code/api/email_sender.py"));
    checked = await ok(c.get(`/api/drafts/${id}/plan`, { against: "disk" }));
    expect(checked.summary).toMatchObject({ done: 3, open: 0, manual: 1 });
    expect(checked.items.find((i: any) => i.kind === "connect").evidence).toBe("sample_code/api/sign_in.py imports sample_code/api/audit.py");
    expect(checked.markdown).toContain('- [x] **Build the component "Audit Log"**');
    expect(checked.markdown).toContain("## Model-only changes (no code work)");

    // The command line: exit 1 while steps are open.
    const cli = spawnSync(tsx, ["src/cli.ts", "plan", id, dir, "--check"], { encoding: "utf-8" });
    expect(cli.status, cli.stderr).toBe(0);
    expect(cli.stdout).toContain("3 done · 0 open · 1 to check by hand");
    fs.writeFileSync(file(dir, "sample_code/api/email_sender.py"), "x = 1\n");
    expect(spawnSync(tsx, ["src/cli.ts", "plan", id, dir, "--check"], { encoding: "utf-8" }).status).toBe(1);
    expect(spawnSync(tsx, ["src/cli.ts", "plan", "nope", dir], { encoding: "utf-8" }).status).toBe(2);
    // Not in a git repository: nothing can be checked, so it must not pass.
    if (hasGit) {
      const noRepo = spawnSync(tsx, ["src/cli.ts", "plan", id, dir, "--against", "main"], { encoding: "utf-8" });
      expect(noRepo.status, noRepo.stdout).toBe(2);
      expect(noRepo.stderr).toContain("Cannot check");
    }
  });

  it.skipIf(!hasGit)("checks progress on the draft's branch", async () => {
    const dir = demoDir();
    git(dir, "init", "-q", "-b", "main");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "first");
    const { c, id } = await plannedDraft(dir);
    git(dir, "checkout", "-q", "-b", "feature/audit");
    fs.writeFileSync(file(dir, "sample_code/api/audit.py"), "def log(event):\n    pass\n");
    fs.appendFileSync(file(dir, "sample_code/api/sign_in.py"), "\nfrom .audit import log\n");
    git(dir, "add", "sample_code");
    git(dir, "commit", "-q", "-m", "audit");
    git(dir, "checkout", "-q", "main");
    const onBranch = await ok(c.get(`/api/drafts/${id}/plan`, { against: "ref:feature/audit" }));
    expect(onBranch.checkedAgainst).toMatch(/^git feature\/audit \([0-9a-f]{7}\)$/);
    expect(onBranch.summary).toMatchObject({ done: 2, open: 1 }); // the old e-mail file is still on the branch
    const onDisk = await ok(c.get(`/api/drafts/${id}/plan`, { against: "disk" }));
    expect(onDisk.summary.done).toBe(0);
  });
});

describe("applying a draft with code", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** A draft that changes the model and plans a changed, a removed and a new file (in new folders). */
  async function setup(): Promise<{ dir: string; c: Client; id: string; snapshot: () => Record<string, string | null> }> {
    const dir = demoDir();
    const c = client(dir);
    const { id } = await ok(c.post("/api/drafts", { title: "All or nothing" }));
    const d = c.at(`draft:${id}`);
    await ok(d.patch("/api/workspace", { name: "Renamed in the draft" }));
    await ok(d.put("/api/code/file", { path: "sample_code/api/accounts.py", content: "# v2\n" }));
    await ok(d.delete("/api/code/file?path=sample_code/api/email_sender.py"));
    await ok(d.post("/api/code/file", { path: "sample_code/newdir/sub/new.py", content: "x = 1\n" }));
    const files = ["sample_code/api/accounts.py", "sample_code/api/email_sender.py", "sample_code/newdir/sub/new.py", "architecture/workspace.json", "architecture/designperspectives.json"];
    const snapshot = () => ({
      ...Object.fromEntries(files.map((f) => [f, read(dir, f)])),
      newdir: String(fs.existsSync(file(dir, "sample_code/newdir"))),
    });
    return { dir, c, id, snapshot };
  }

  async function unchanged(c: Client, id: string, planned: number, before: Record<string, string | null>, after: Record<string, string | null>) {
    expect(after).toEqual(before);
    expect(after.newdir).toBe("false");
    const st = await ok(c.get("/api/state"));
    expect(st.workspace.name).not.toBe("Renamed in the draft");
    expect(st.drafts.map((x: any) => [x.id, x.plannedFiles])).toEqual([[id, planned]]);
    expect(st.canUndo).toBe(false);
  }

  it("puts every file back when a code write fails", async () => {
    const { dir, c, id, snapshot } = await setup();
    // Planned last (paths are applied in order): its folder is an existing regular file.
    fs.writeFileSync(file(dir, "zz_blocker.txt"), "a file, not a folder\n");
    await ok(c.at(`draft:${id}`).post("/api/code/file", { path: "zz_blocker.txt/x.py", content: "" }));
    const before = snapshot();
    const r = await c.post(`/api/drafts/${id}/apply`, { code: true });
    expect(r.status).toBe(422);
    expect(r.json().detail).toMatch(/^Could not write zz_blocker\.txt\/x\.py in the code folder.*Nothing was applied\.$/);
    await unchanged(c, id, 4, before, snapshot());
    expect(read(dir, "zz_blocker.txt")).toBe("a file, not a folder\n");
    // Once the obstacle is gone, the same draft applies.
    fs.rmSync(file(dir, "zz_blocker.txt"));
    await ok(c.post(`/api/drafts/${id}/apply`, { code: true }));
    expect(read(dir, "sample_code/api/accounts.py")).toBe("# v2\n");
    expect(read(dir, "zz_blocker.txt/x.py")).toBe("");
  });

  it("puts every file back when the model step fails", async () => {
    const { dir, c, id, snapshot } = await setup();
    const before = snapshot();
    vi.spyOn(Project.prototype, "edit").mockImplementationOnce(() => {
      throw new ModelError("The model could not be saved.");
    });
    const r = await c.post(`/api/drafts/${id}/apply`, { code: true });
    expect(r.status).toBe(422);
    expect(r.json().detail).toBe("The model could not be saved.");
    await unchanged(c, id, 3, before, snapshot());
    // Without the failure it applies: model, code and draft removal together.
    await ok(c.post(`/api/drafts/${id}/apply`, { code: true }));
    expect((await ok(c.get("/api/state"))).workspace.name).toBe("Renamed in the draft");
    expect(read(dir, "sample_code/api/accounts.py")).toBe("# v2\n");
    expect(read(dir, "sample_code/api/email_sender.py")).toBeNull();
    expect(read(dir, "sample_code/newdir/sub/new.py")).toBe("x = 1\n");
    expect((await ok(c.get("/api/state"))).drafts).toEqual([]);
  });
});
