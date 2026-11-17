/** Tool connections for linked work (DEC-085): `.dp/integrations.json` (private, checked addresses), architect-only routes, the hub's shared store, the refresh through a connection, and `dp integrations`. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CredentialStore } from "../../src/core/credentials.js";
import { IntegrationsStore } from "../../src/core/integrations.js";
import type { Fetch } from "../../src/core/workTools/types.js";
import { copyDemoHub, createHubApp } from "../../src/server/hub.js";
import { Client, client, demoDir, ok, tmpDir, writeTestUsers } from "./helpers.js";

const file = (dir: string) => path.join(dir, ".dp", "integrations.json");
const GL_OWN = { id: "gitlab-own", tool: "gitlab", baseUrl: "https://code.example.com/gitlab/", credential: "gl-own" };

describe("integrations", () => {
  it("the file is private and ignored by git; addresses and fields are checked", async () => {
    const dir = demoDir();
    fs.writeFileSync(path.join(dir, ".gitignore"), "node_modules/\n");
    const c = client(dir, { secretKey: null });
    expect(await ok(c.get("/api/integrations"))).toMatchObject({ connections: [], file: ".dp/integrations.json", builtIn: [{ id: "github" }, { id: "gitlab" }, { id: "sonarcloud" }] });
    const s = await ok(c.put("/api/integrations", { connections: [GL_OWN] }));
    expect(s.connections).toEqual([{ id: "gitlab-own", tool: "gitlab", baseUrl: "https://code.example.com/gitlab", credential: "gl-own" }]);
    expect(fs.statSync(file(dir)).mode & 0o777).toBe(0o600);
    expect(fs.statSync(path.dirname(file(dir))).mode & 0o777).toBe(0o700);
    expect(fs.readFileSync(path.join(dir, ".gitignore"), "utf-8")).toContain(".dp/");
    // Everyone sees where links are read from, never which credential is sent.
    const state = await ok(c.get("/api/state"));
    expect(state.workConnections).toContainEqual({ id: "gitlab-own", tool: "gitlab", base: "https://code.example.com/gitlab", builtIn: false });
    expect(JSON.stringify(state.workConnections)).not.toContain("gl-own");

    for (const [bad, msg] of [
      [{ ...GL_OWN, baseUrl: "http://code.example.com" }, /https/],
      [{ ...GL_OWN, baseUrl: "https://169.254.169.254" }, /link-local/],
      [{ ...GL_OWN, baseUrl: "https://code.example.com/?x=1" }, /query/],
      [{ ...GL_OWN, baseUrl: "https://ana:pw@code.example.com" }, /user name/],
      [{ ...GL_OWN, tool: "svn" }, /tool/],
      [{ ...GL_OWN, id: "github" }, /built-in/],
      [{ ...GL_OWN, id: "Bad ID" }, /ID/],
      [{ ...GL_OWN, auth: "digest" }, /bearer/],
      [{ ...GL_OWN, token: "x" }, /unknown field/],
    ] as const) {
      const r = await c.put("/api/integrations", { connections: [bad] });
      expect(r.status, JSON.stringify(bad)).toBe(422);
      expect(r.json().detail).toMatch(msg);
    }
    expect((await c.put("/api/integrations", { connections: [GL_OWN, { ...GL_OWN, id: "other" }] })).json().detail).toMatch(/two connections/);
    expect((await c.put("/api/integrations", { connections: Array.from({ length: 51 }, (_, i) => ({ ...GL_OWN, id: `g${i}`, baseUrl: `https://g${i}.example.com` })) })).status).toBe(422);
    // Nothing was written by a refused change.
    expect((await ok(c.get("/api/integrations"))).connections).toHaveLength(1);
    expect((await ok(c.delete("/api/integrations/gitlab-own"))).connections).toEqual([]);
    expect((await c.delete("/api/integrations/gitlab-own")).status).toBe(422);
  });

  it("a file entry with a built-in's address replaces it", () => {
    const dir = tmpDir();
    const s = new IntegrationsStore(dir);
    s.set({ id: "github-com", tool: "github", baseUrl: "https://github.com", credential: "gh-org" });
    expect(s.infos().filter((c) => c.base === "https://github.com")).toEqual([{ id: "github-com", tool: "github", base: "https://github.com", builtIn: false }]);
    expect(s.connections().find((c) => c.base === "https://github.com")).toMatchObject({ credential: "gh-org", builtIn: false });
    // Another process changes the file: it is read again.
    fs.writeFileSync(file(dir), JSON.stringify({ version: 1, connections: [] }));
    expect(s.infos().map((c) => c.id)).toEqual(["github", "gitlab", "sonarcloud"]);
    fs.writeFileSync(file(dir), "{broken");
    expect(s.infos().map((c) => c.id)).toEqual(["github", "gitlab", "sonarcloud"]); // the model is still served
    expect(() => s.list()).toThrow(/not valid JSON/);
  });

  it("only architects manage them; a read-only server refuses", async () => {
    const c = client(demoDir(), { users: true, secretKey: null });
    for (const role of ["engineer", "viewer"]) {
      const u = await c.as(role);
      expect((await u.get("/api/integrations")).status, role).toBe(403);
      expect((await u.put("/api/integrations", { connections: [] })).status, role).toBe(403);
      expect((await u.delete("/api/integrations/x")).status, role).toBe(403);
    }
    await ok((await c.as("architect")).put("/api/integrations", { connections: [GL_OWN] }));
    expect((await client(demoDir(), { readOnly: true, secretKey: null }).put("/api/integrations", { connections: [] })).status).toBe(403);
  });

  it("the refresh reads a connected GitLab under a path with its own credential only", async () => {
    const dir = demoDir();
    new CredentialStore(dir, null).add({ name: "gl-own", provider: "gitlab", value: "glpat-OWNTOKEN0000" });
    new CredentialStore(dir, null).add({ name: "gl-com", provider: "gitlab", value: "glpat-COMTOKEN0000" });
    const calls: { url: string; auth?: string; redirect?: string }[] = [];
    const fetch: Fetch = async (url, init) => {
      calls.push({ url, auth: init.headers.Authorization, redirect: init.redirect });
      return { ok: true, status: 200, json: async () => ({ state: "merged" }) };
    };
    const c = client(dir, { secretKey: null, fetch });
    await ok(c.put("/api/integrations", { connections: [GL_OWN] }));
    await ok(
      c.patch("/api/elements/database", {
        work: [
          { type: "pr", title: "Own", url: "https://code.example.com/gitlab/acme/bank/-/merge_requests/3", status: "open" },
          { type: "pr", title: "Public", url: "https://gitlab.com/acme/bank/-/merge_requests/4", status: "open" },
        ],
      }),
    );
    const r = await ok(c.post("/api/work/refresh"));
    // gl-own is a GitLab credential too, but it is named by the team's own connection: never sent to gitlab.com.
    expect(r.byTool).toEqual(
      expect.arrayContaining([
        { tool: "gitlab", base: "https://gitlab.com", checked: 1, credential: "gl-com" },
        { tool: "gitlab", base: "https://code.example.com/gitlab", checked: 1, credential: "gl-own" },
      ]),
    );
    expect(calls.sort((a, b) => a.url.localeCompare(b.url))).toEqual([
      { url: "https://code.example.com/gitlab/api/v4/projects/acme%2Fbank/merge_requests/3", auth: "Bearer glpat-OWNTOKEN0000", redirect: "error" },
      { url: "https://gitlab.com/api/v4/projects/acme%2Fbank/merge_requests/4", auth: "Bearer glpat-COMTOKEN0000", redirect: "error" },
    ]);
    expect(r.updated.map((u: any) => u.to)).toEqual(["done", "done"]);
    expect(JSON.stringify(r)).not.toContain("glpat-");
  });

  it("a hub keeps one store in the hub folder, used by every project", async () => {
    const dir = tmpDir();
    copyDemoHub(dir);
    writeTestUsers(dir);
    const app = createHubApp(dir, { secretKey: null }).app;
    const c = new Client("", {}, app);
    const arch = await c.as("architect");
    await ok(arch.put("/api/integrations", { connections: [GL_OWN] }));
    expect(fs.existsSync(file(dir))).toBe(true);
    for (const project of ["payments", "onboarding"]) {
      const p = new Client("", {}, app, { ...arch.headers, "X-DP-Project": project });
      expect(
        (await ok(p.get("/api/state"))).workConnections.map((x: any) => x.id),
        project,
      ).toContain("gitlab-own");
      expect(fs.existsSync(file(path.join(dir, project)))).toBe(false);
    }
    expect((await (await c.as("viewer")).get("/api/integrations")).status).toBe(403);
  });

  it("dp integrations set / list / remove", () => {
    const dir = tmpDir();
    const tsx = path.resolve("node_modules", ".bin", "tsx");
    const dp = (...args: string[]) => spawnSync(tsx, ["src/cli.ts", "integrations", ...args], { encoding: "utf-8", env: { ...process.env, DP_SECRET_KEY: "" } });
    const set = dp("set", "jira-acme", dir, "--tool", "jira", "--url", "https://acme.atlassian.net/", "--credential", "jira", "--auth", "basic");
    expect(set.status, set.stderr).toBe(0);
    expect(JSON.parse(fs.readFileSync(file(dir), "utf-8"))).toEqual({
      version: 1,
      connections: [{ id: "jira-acme", tool: "jira", baseUrl: "https://acme.atlassian.net", credential: "jira", auth: "basic" }],
    });
    expect(fs.statSync(file(dir)).mode & 0o777).toBe(0o600);
    const l = dp("list", dir);
    expect(l.stdout).toContain("jira-acme");
    expect(l.stdout).toContain("credential: jira");
    expect(l.stdout).toContain("sonarcloud");
    const bad = dp("set", "x", dir, "--tool", "gitlab", "--url", "http://gitlab.example.com");
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/must use https/);
    expect(dp("remove", "jira-acme", dir).status).toBe(0);
    expect(dp("remove", "jira-acme", dir).status).toBe(1);
  });
});
