/** History of model commits, and the linked work status refresh (WRK-01, WRK-02): status updates with the stored token, where the token may go, items pinned to diagrams, flows and the project, and role rules. */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CredentialStore } from "../../src/core/credentials.js";
import { github } from "../../src/core/workTools/github.js";
import { apiAddress, linkRest, type Conn, type Fetch } from "../../src/core/workTools/types.js";
import { copyDemoHub, createHubApp } from "../../src/server/hub.js";
import { Client, client, demoDir, ok, tmpDir } from "./helpers.js";

const hasGit = (() => {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();
const git = (dir: string, ...a: string[]) => execFileSync("git", ["-c", "user.name=Ana", "-c", "user.email=a@example.com", "-c", "commit.gpgsign=false", ...a], { cwd: dir, stdio: "ignore" });

describe.runIf(hasGit)("history", () => {
  it("lists the commits that changed the model, what each changed, and what is not committed", async () => {
    const dir = demoDir();
    const c = client(dir);
    git(dir, "init", "-q", "-b", "main");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "Start");
    await ok(c.patch("/api/elements/database", { description: "Now on Postgres" }));
    await ok(c.post("/api/decisions", { title: "Move to Postgres" }));
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "Move the database");
    await ok(c.post("/api/elements", { kind: "person", name: "Auditor" }));

    const h = await ok(c.get("/api/history"));
    expect(h.projects).toMatchObject([{ project: "main", git: true, uncommitted: { added: 1 } }]);
    expect(h.commits.map((x: any) => x.subject)).toEqual(["Move the database", "Start"]);
    const [latest, first] = h.commits;
    expect(latest.author).toBe("Ana");
    expect(latest.changes[0].summary).toMatchObject({ added: 1, changed: 1 });
    expect(latest.changes[0].items).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "element", name: "Database", change: "changed" }), expect.objectContaining({ type: "decision", change: "added" })]),
    );
    expect(latest.changes[0].parent).toBe(first.sha);
    expect(first.changes[0].parent).toBeNull();
    expect(first.changes[0].summary.added).toBeGreaterThan(20); // the whole demo, from nothing
    expect((await ok(c.get("/api/history", { limit: "1" }))).commits).toHaveLength(1);
  });

  it("a hub: one list across projects, each commit with the projects it changed", async () => {
    const dir = tmpDir();
    copyDemoHub(dir);
    git(dir, "init", "-q", "-b", "main");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "Hub");
    const app = createHubApp(dir, { secretKey: null }).app;
    const pay = new Client("", {}, app, { "X-DP-Project": "payments" });
    await ok(pay.patch("/api/elements/ledger-worker", { owner: "Ledger team" }));
    git(dir, "add", "payments");
    git(dir, "commit", "-q", "-m", "Ledger owner");
    const h = await ok(new Client("", {}, app).get("/api/history"));
    // The commit holds the owner change and the identity provider the hub brought in step with the catalog.
    expect(h.commits[0]).toMatchObject({ subject: "Ledger owner", changes: [{ project: "payments", summary: { changed: 2 } }] });
    expect(h.commits[0].changes[0].items.map((x: any) => x.name).sort()).toEqual(["Identity Provider", "Ledger Worker"]);
    expect(h.commits[1].changes.map((x: any) => x.project).sort()).toEqual(["catalog", "onboarding", "payments"]);
    const one = await ok(new Client("", {}, app).get("/api/history", { project: "onboarding" }));
    expect(one.commits.map((x: any) => x.subject)).toEqual(["Hub"]);
  });

  it("without git: no commits, and says so", async () => {
    const h = await ok(client().get("/api/history"));
    expect(h).toEqual({ projects: [{ project: "main", git: false, uncommitted: null }], commits: [] });
  });
});

describe("linked work status from GitHub", () => {
  const ISSUE = "https://github.com/acme/bank/issues/12";
  const PR = "https://github.com/acme/bank/pull/7";
  const GONE = "https://github.com/acme/bank/issues/999";
  const GH: Conn = { id: "github", tool: "github", base: "https://github.com", builtIn: true, auth: "bearer" };
  /** The API address a link would be read from, or null when the GitHub adapter does not read it. */
  const apiUrl = (link: string): string | null => {
    const at = linkRest(link, GH);
    const p = at && github.match(at.link, at.rest, GH);
    return p ? apiAddress(github.apiRoot(GH), github.requests(p, GH)[0]!) : null;
  };

  /** Links of the demo's own linked work that no connection reads. */
  const demoUnknown = async () => (await ok(client(demoDir(), { secretKey: null, fetch: fake([]) }).post("/api/work/refresh"))).unknown as number;

  function fake(calls: { url: string; auth?: string; redirect?: string }[]): Fetch {
    return async (url, init) => {
      calls.push({ url, auth: init.headers.Authorization, redirect: init.redirect });
      const body = url.endsWith("/issues/12") ? { state: "closed" } : url.endsWith("/pulls/7") ? { state: "open" } : null;
      return { ok: !!body, status: body ? 200 : 404, json: async () => body };
    };
  }

  it("updates statuses from GitHub with the stored token, reports failures, and changes nothing when nothing moved", async () => {
    const dir = demoDir();
    new CredentialStore(dir, null).add({ name: "gh", provider: "github", value: "ghp_testtoken000000000000" });
    const calls: { url: string; auth?: string }[] = [];
    const c = client(dir, { secretKey: null, fetch: fake(calls) });
    await ok(
      c.patch("/api/elements/database", {
        work: [
          { type: "issue", title: "Slow queries", url: ISSUE, status: "in-progress" },
          { type: "pr", title: "Add index", url: PR, status: "done" },
          { type: "issue", title: "Old one", url: GONE, status: "open" },
          { type: "issue", title: "Not GitHub", url: "https://tracker.example.com/1", status: "open" },
        ],
      }),
    );
    const r = await ok(c.post("/api/work/refresh"));
    expect(r.checked).toBe(3);
    expect(r.unknown).toBe((await demoUnknown()) + 1);
    expect(r.byTool).toEqual([{ tool: "github", base: "https://github.com", checked: 3, credential: "gh" }]);
    expect(r.updated).toEqual(
      expect.arrayContaining([
        { owner: "Database", title: "Slow queries", from: "in-progress", to: "done" },
        { owner: "Database", title: "Add index", from: "done", to: "open" },
      ]),
    );
    expect(r.failed).toEqual([{ url: GONE, reason: expect.stringMatching(/not found/) }]);
    expect(calls.map((x) => x.url).sort()).toEqual([
      "https://api.github.com/repos/acme/bank/issues/12",
      "https://api.github.com/repos/acme/bank/issues/999",
      "https://api.github.com/repos/acme/bank/pulls/7",
    ]);
    expect(calls.every((x) => x.auth === "Bearer ghp_testtoken000000000000")).toBe(true);
    const db = (await ok(c.get("/api/state"))).elements.find((e: any) => e.id === "database");
    expect(db.work.map((w: any) => w.status)).toEqual(["done", "open", "open", "open"]);
    expect(db.work.map((w: any) => w.remote)).toEqual(["Closed", "Open", undefined, undefined]);
    expect(db.work[0].checked).toMatch(/^\d{4}-\d\d-\d\dT/);
    // One undo step for the refresh; a second refresh with nothing new adds none.
    await ok(c.post("/api/work/refresh"));
    await ok(c.post("/api/undo"));
    expect((await ok(c.get("/api/state"))).elements.find((e: any) => e.id === "database").work[0].status).toBe("in-progress");
    // The token never leaves the server in an answer.
    expect(JSON.stringify(r)).not.toContain("ghp_testtoken");
  });

  it("sends the token only to the linked issue or pull request: no '.' or '..' names, no redirects", async () => {
    for (const bad of [
      "https://github.com/../user/issues/1",
      "https://github.com/acme/../issues/1",
      "https://github.com/acme/./issues/1",
      "https://github.com/./bank/pull/1",
      "https://github.com/ac.me/bank/issues/1",
      "https://github.com/acme/ba%2fnk/issues/1",
      "https://github.com/acme/bank/issues/1/../../../../user",
      "https://github.com/x/../acme/bank/issues/1",
      "https://github.com.evil.io/acme/bank/issues/1",
      "https://user:pw@github.com/acme/bank/issues/1",
      "http://github.com/acme/bank/issues/1",
    ]) {
      expect(apiUrl(bad), bad).toBeNull();
    }
    expect(apiUrl("https://github.com/acme/my.repo_1/pull/7?x=1#y")).toBe("https://api.github.com/repos/acme/my.repo_1/pulls/7");
    expect(apiUrl("https://github.com/acme/..hidden/issues/3")).toBe("https://api.github.com/repos/acme/..hidden/issues/3");
    const seen: { url: string; redirect?: string }[] = [];
    const c = client(demoDir(), { secretKey: null, fetch: fake(seen) });
    await ok(
      c.patch("/api/elements/database", {
        work: [
          { type: "issue", title: "Hostile", url: "https://github.com/acme/../issues/1", status: "open" },
          { type: "issue", title: "Fine", url: ISSUE, status: "open" },
        ],
      }),
    );
    const r = await ok(c.post("/api/work/refresh"));
    expect(seen).toEqual([{ url: "https://api.github.com/repos/acme/bank/issues/12", auth: undefined, redirect: "error" }]);
    expect(r).toMatchObject({ checked: 1, unknown: (await demoUnknown()) + 1 });
  });

  it("works without a credential (public repositories) and follows the role rules", async () => {
    const calls: { url: string; auth?: string }[] = [];
    const dir = demoDir();
    const c = client(dir, { secretKey: null, fetch: fake(calls), users: true });
    const arch = await c.as("architect");
    await ok(arch.patch("/api/elements/database", { work: [{ type: "issue", title: "x", url: ISSUE, status: "open" }] }));
    const r = await ok(arch.post("/api/work/refresh"));
    expect(r).toMatchObject({ checked: 1, byTool: [{ tool: "github", credential: null }], updated: [{ to: "done" }] });
    expect(calls[0]!.auth).toBeUndefined();
    const viewer = await c.as("viewer");
    expect((await viewer.post("/api/work/refresh")).status).toBe(403);
  });

  it("refreshes items pinned to a diagram, a flow and the project; nothing new writes nothing and adds no undo step", async () => {
    const dir = demoDir();
    const calls: { url: string }[] = [];
    const c = client(dir, { secretKey: null, fetch: fake(calls) });
    const pin = (target: unknown, url: string, status = "open") => ok(c.put("/api/work/target", { target, work: [{ type: "issue", title: `On ${JSON.stringify(target)}`, url, status }] }));
    await pin({ type: "project" }, ISSUE);
    await pin({ type: "diagram", id: "containers-internet-banking-system" }, PR, "done");
    await pin({ type: "diagram", id: "flow-sign-in" }, ISSUE, "blocked");
    const r = await ok(c.post("/api/work/refresh", { tools: ["github"] }));
    expect(r.checked).toBe(2); // the same link twice is read once
    expect(r.updated.map((u: any) => `${u.from}→${u.to}`).sort()).toEqual(["blocked→done", "done→open", "open→done"]);
    const list = await ok(c.get("/api/work"));
    // By target: the demo has linked work of its own on the project and on other diagrams and flows.
    const at = (target: string) => list.rows.find((x: any) => JSON.stringify(x.target) === target && x.item.title === `On ${target}`)?.item;
    const byKind = {
      project: at(JSON.stringify({ type: "project" })),
      diagram: at(JSON.stringify({ type: "diagram", id: "containers-internet-banking-system" })),
      flow: at(JSON.stringify({ type: "diagram", id: "flow-sign-in" })),
    };
    expect(byKind.project).toMatchObject({ status: "done", remote: "Closed" });
    expect(byKind.diagram).toMatchObject({ status: "open", remote: "Open" });
    expect(byKind.flow).toMatchObject({ status: "done", remote: "Closed" });

    const file = path.join(dir, "architecture", "workspace.json");
    const before = fs.readFileSync(file, "utf-8");
    const again = await ok(c.post("/api/work/refresh"));
    expect(again.updated).toEqual([]);
    expect(fs.readFileSync(file, "utf-8")).toBe(before);
    // The only undo step left is the first refresh's: undoing it brings back the pinned statuses.
    await ok(c.post("/api/undo"));
    const flowTarget = JSON.stringify({ type: "diagram", id: "flow-sign-in" });
    const back = (await ok(c.get("/api/work"))).rows.find((x: any) => JSON.stringify(x.target) === flowTarget && x.item.title === `On ${flowTarget}`)?.item;
    expect(back).toMatchObject({ status: "blocked" });
    expect(back.remote).toBeUndefined();
    // Only other tools asked for: GitHub links are left out, not counted as unknown.
    // (The pin on the project replaced the demo's project items, one of which has a link no connection knows.)
    expect(await ok(c.post("/api/work/refresh", { tools: ["jira"] }))).toMatchObject({ checked: 0, unknown: (await demoUnknown()) - 1 });
    expect((await c.post("/api/work/refresh", { tools: ["nope"] })).status).toBe(422);
  });
});
