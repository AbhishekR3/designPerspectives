/** The `dp check` and `dp diff` commands: problems in the model, its drafts and code paths, and change summaries between git refs. */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { client, demoDir, ok, tmpDir } from "./helpers.js";

const tsx = path.resolve("node_modules", ".bin", "tsx");
const dp = (...args: string[]) => spawnSync(tsx, ["src/cli.ts", ...args], { encoding: "utf-8" });

const hasGit = spawnSync("git", ["--version"]).status === 0;
function git(dir: string, ...args: string[]): void {
  execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args], { cwd: dir, stdio: "ignore" });
}

describe("dp check", () => {
  it("passes on the demo, warns about missing code paths, fails with --strict", async () => {
    const dir = demoDir();
    const okRun = dp("check", dir);
    expect(okRun.status, okRun.stderr).toBe(0);
    expect(okRun.stdout.trim()).toBe("OK");

    await ok(client(dir).patch("/api/elements/atm", { codePaths: ["nowhere/atm.py"] }));
    const warn = dp("check", dir);
    expect(warn.status).toBe(0);
    expect(warn.stdout).toContain('! "ATM" points to "nowhere/atm.py"');
    expect(warn.stdout.trim().split("\n").at(-1)).toBe("OK (1 warning)");
    expect(dp("check", dir, "--strict").status).toBe(1);
    expect(dp("validate", dir).status).toBe(0); // old name still works
  });

  it("checks drafts too, and exits 2 without a model", async () => {
    const dir = demoDir();
    const { id } = await ok(client(dir).post("/api/drafts", { title: "Broken" }));
    const f = path.join(dir, "architecture", "drafts", id, "workspace.json");
    const ws = JSON.parse(fs.readFileSync(f, "utf-8"));
    ws.model.softwareSystems[1].name = ws.model.softwareSystems[0].name;
    fs.writeFileSync(f, JSON.stringify(ws));
    const r = dp("check", dir);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/^- Draft "Broken": A person or software system named/m);
    expect(dp("check", tmpDir()).status).toBe(2);
  });
});

describe.skipIf(!hasGit)("dp diff", () => {
  async function repoWithChange(): Promise<string> {
    const dir = demoDir();
    git(dir, "init", "-q", "-b", "main");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "first");
    const c = client(dir);
    await ok(c.patch("/api/elements/atm", { description: "Cash | only" }));
    await ok(c.delete("/api/elements/back-office-staff"));
    await ok(c.post("/api/elements", { kind: "softwareSystem", name: "Fraud Checks" }));
    return dir;
  }

  it("writes a Markdown summary of the changes since a ref", async () => {
    const dir = await repoWithChange();
    const r = dp("diff", dir, "--base", "main");
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^## Architecture changes\n\nCompared `main` \([0-9a-f]{7}\) with the files on disk\./);
    expect(r.stdout).toContain("**1 added · 1 changed · 2 removed**");
    expect(r.stdout).toContain("| Added | Software system | Fraud Checks |  |  |");
    expect(r.stdout).toContain("| Removed | Person | Back Office Staff |  |  |");
    expect(r.stdout).toContain("| ATM | Description | Allows customers to withdraw cash. | Cash \\| only |");
    expect(dp("diff", dir, "--base", "main", "--exit-code").status).toBe(1);
  });

  it("lists code files changed behind mapped objects", async () => {
    const dir = demoDir();
    git(dir, "init", "-q", "-b", "main");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "first");
    fs.appendFileSync(path.join(dir, "sample_code", "api", "store.py"), "\nfrom .mainframe_facade import balances\n");
    const r = dp("diff", dir, "--base", "main");
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("**0 added · 0 changed · 0 removed** · 1 code file");
    expect(r.stdout).toContain("| Accounts Summary Controller | `sample_code/api/store.py` | Changed |");
    expect(r.stdout).toContain("| Accounts Summary Controller | `sample_code/api/store.py` → `sample_code/api/mainframe_facade.py` | Added |");
    expect(dp("diff", dir, "--base", "main", "--exit-code").status).toBe(1);
    expect(dp("diff", dir, "--base", "main", "--no-code").stdout).toContain("No architecture changes.");
  });

  it("compares two refs, writes JSON to a file, and refuses bad refs", async () => {
    const dir = await repoWithChange();
    git(dir, "commit", "-q", "-am", "second");
    const out = path.join(tmpDir(), "diff.json");
    const r = dp("diff", dir, "--base", "HEAD~1", "--head", "HEAD", "--format", "json", "--out", out);
    expect(r.status, r.stderr).toBe(0);
    const cs = JSON.parse(fs.readFileSync(out, "utf-8"));
    expect(cs.summary).toMatchObject({ added: 1, changed: 1, removed: 2 });
    const none = dp("diff", dir, "--base", "HEAD", "--exit-code");
    expect(none.status).toBe(0);
    expect(none.stdout).toContain("No architecture changes.");
    expect(dp("diff", dir, "--base", "--upload-pack=x").status).not.toBe(0);
    expect(dp("diff", dir, "--base", "no-such-ref").status).toBe(2);
  });
});
