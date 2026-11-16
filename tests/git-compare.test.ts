import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkRef } from "../src/core/git.js";
import { initProject } from "../src/core/project.js";
import { client, demoDir, ok, tmpDir } from "./helpers.js";

const hasGit = (() => {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

function git(dir: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args], {
    cwd: dir,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** A demo project in a git repository with one commit on branch "main". */
function repo(): string {
  const dir = demoDir();
  git(dir, "init", "-q", "-b", "main");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "first");
  return dir;
}

describe("checkRef", () => {
  it("accepts ref names and hashes, rejects options and paths", () => {
    for (const r of ["main", "HEAD", "HEAD~1", "HEAD^", "feature/x", "v1.0", "origin/main", "a1b2c3d"]) expect(checkRef(r)).toBe(r);
    for (const r of ["", "-x", "--output=/tmp/x", "a:b", "a b", "a..b", "x@{1}", "a\\b", "a\nb"]) expect(() => checkRef(r)).toThrow();
  });
});

describe.skipIf(!hasGit)("git compare", () => {
  it("lists branches and shows the model at a ref, read-only", async () => {
    const dir = repo();
    const c = client(dir);
    await ok(c.patch("/api/elements/atm", { name: "Cash Machine" }));
    git(dir, "commit", "-q", "-am", "rename");
    git(dir, "tag", "v1");

    const st = await ok(c.get("/api/state"));
    expect(st.git.branch).toBe("main");
    expect(st.git.refs).toEqual(expect.arrayContaining(["HEAD", "main", "v1"]));

    const old = c.at("ref:HEAD~1");
    const ost = await ok(old.get("/api/state"));
    expect(ost.readOnly).toBe(true);
    expect(ost.model.title).toMatch(/^Git: HEAD~1 \([0-9a-f]{7}\)$/);
    expect(ost.elements.find((e: any) => e.id === "atm").name).toBe("ATM");
    expect((await old.patch("/api/elements/atm", { name: "X" })).status).toBe(403);
    expect((await old.post("/api/undo")).status).toBe(403);
  });

  it("compares the working model with a ref", async () => {
    const dir = repo();
    const c = client(dir);
    const { id } = await ok(c.post("/api/elements", { kind: "container", parentId: "internet-banking-system", name: "Cache" }));
    await ok(c.delete("/api/elements/mobile-app"));
    const cmp = c.at("main", "ref:main");
    const st = await ok(cmp.get("/api/state"));
    expect(st.compare.title).toMatch(/^Git: main/);
    // changed: the "Payment confirmation" flow, which loses its step into the mobile app.
    expect(st.compare.summary).toMatchObject({ added: 1, changed: 1 });
    const d = await ok(cmp.get("/api/diagrams/containers-internet-banking-system"));
    expect(d.nodes.find((n: any) => n.id === id).change).toBe("added");
    expect(d.nodes.find((n: any) => n.id === "mobile-app")).toMatchObject({ change: "removed", ghost: true });
    // Two refs: the older commit compared with a newer one.
    git(dir, "commit", "-q", "-am", "change");
    const changes = await ok(c.at("ref:HEAD", "ref:HEAD~1").get("/api/changes"));
    expect(changes.elements.map((e: any) => e.id).sort()).toEqual([id, "mobile-app"].sort());
  });

  it("a commit without the model shows everything as added", async () => {
    const dir = tmpDir();
    git(dir, "init", "-q", "-b", "main");
    fs.writeFileSync(path.join(dir, "README"), "x");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "empty");
    initProject(dir, { demo: true });
    const c = client(dir).at("main", "ref:HEAD");
    const st = await ok(c.get("/api/state"));
    expect(st.compare.title).toMatch(/no model$/);
    expect(st.compare.summary.removed).toBe(0);
    const changes = await ok(c.get("/api/changes"));
    expect(changes.elements).toHaveLength(st.elements.length);
    expect(changes.relationships).toHaveLength(st.relationships.length);
    expect([...changes.elements, ...changes.relationships].every((x: any) => x.change === "added")).toBe(true);
  });

  it("refuses bad refs and works without git", async () => {
    const c = client(repo());
    expect((await c.at("ref:--help").get("/api/state")).status).toBe(422);
    expect((await c.at("ref:a:b").get("/api/state")).status).toBe(422);
    expect((await c.at("ref:no-such-branch").get("/api/state")).status).toBe(404);
    const plain = client(); // demo folder outside any repository
    const st = await ok(plain.get("/api/state"));
    if (st.git === null) expect((await plain.at("ref:HEAD").get("/api/state")).status).toBe(422);
  });
});
