/** Integration credentials (SEC-06): write-only values, encryption with DP_SECRET_KEY, architect-only management, hub storage and `dp credentials`. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CredentialStore } from "../../src/core/credentials.js";
import { copyDemoHub, createHubApp } from "../../src/server/hub.js";
import { Client, client, demoDir, ok, tmpDir, writeTestUsers } from "./helpers.js";

const SECRET = "ghp_PLANTEDsecretVALUE1234567890abcd";
const file = (dir: string) => path.join(dir, ".dp", "credentials.json");

describe("credentials", () => {
  it("values are write-only: no answer ever contains one; the file is private and ignored by git", async () => {
    const dir = demoDir();
    fs.writeFileSync(path.join(dir, ".gitignore"), "node_modules/\n");
    const c = client(dir, { secretKey: null });
    await ok(c.post("/api/credentials", { name: "github-token", provider: "github", scopes: ["repo", "read:org"], note: "PR links", value: SECRET }));
    const list = await ok(c.get("/api/credentials"));
    expect(list).toMatchObject({ encryptsNew: false, file: ".dp/credentials.json" });
    expect(list.credentials).toMatchObject([{ name: "github-token", provider: "github", scopes: ["repo", "read:org"], hint: "••••abcd", encrypted: false, locked: false }]);
    for (const url of ["/api/credentials", "/api/state", "/api/hub", "/api/home"]) expect((await c.get(url)).text).not.toContain(SECRET);
    expect(fs.statSync(file(dir)).mode & 0o777).toBe(0o600);
    expect(fs.readFileSync(path.join(dir, ".gitignore"), "utf-8")).toContain(".dp/");
    // The code routes never open .dp/ (SEC-02).
    expect((await c.get("/api/code/file", { path: ".dp/credentials.json" })).status).not.toBe(200);

    await ok(c.put("/api/credentials/github-token", { value: "ghp_NEWvalue000000000000wxyz" }));
    expect((await ok(c.get("/api/credentials"))).credentials[0].hint).toBe("••••wxyz");
    await ok(c.patch("/api/credentials/github-token", { scopes: "repo", note: "" }));
    expect((await ok(c.get("/api/credentials"))).credentials[0].scopes).toEqual(["repo"]);
    for (const bad of [
      { name: "bad name", value: "x" },
      { name: "x", value: " " },
      { name: "github-token", value: "y" },
      { name: "y", provider: "nope", value: "v" },
    ]) {
      expect((await c.post("/api/credentials", bad)).status, JSON.stringify(bad)).toBe(422);
    }
    await ok(c.delete("/api/credentials/github-token"));
    expect((await ok(c.get("/api/credentials"))).credentials).toEqual([]);
  });

  it("are encrypted at rest with DP_SECRET_KEY, bound to their name; another key shows them locked", () => {
    const dir = tmpDir();
    const s = new CredentialStore(dir, "correct horse battery");
    s.add({ name: "otel", provider: "observability", value: SECRET });
    const raw = fs.readFileSync(file(dir), "utf-8");
    expect(raw).not.toContain(SECRET);
    expect(JSON.parse(raw).credentials[0].value.alg).toBe("aes-256-gcm");
    expect(s.get("otel")).toBe(SECRET);
    expect(s.list().credentials[0]).toMatchObject({ encrypted: true, locked: false });
    expect(JSON.parse(fs.readFileSync(file(dir), "utf-8")).credentials[0].lastUsed).toBeTruthy();

    const other = new CredentialStore(dir, "another key");
    expect(other.list().credentials[0]!.locked).toBe(true);
    expect(other.get("otel")).toBeNull();
    expect(new CredentialStore(dir, null).get("otel")).toBeNull();
    // Moving the sealed value to another entry fails: the name is part of what was sealed.
    const doc = JSON.parse(fs.readFileSync(file(dir), "utf-8"));
    doc.credentials.push({ ...doc.credentials[0], name: "copy" });
    fs.writeFileSync(file(dir), JSON.stringify(doc));
    expect(s.get("copy")).toBeNull();
    // A provider change re-seals the value.
    s.update("otel", { provider: "other" });
    expect(s.get("otel")).toBe(SECRET);
  });

  it("only architects manage them; a read-only server refuses", async () => {
    const dir = demoDir();
    const c = client(dir, { users: true, secretKey: null });
    const eng = await c.as("engineer");
    expect((await eng.get("/api/credentials")).status).toBe(403);
    expect((await eng.post("/api/credentials", { name: "a", value: "b" })).status).toBe(403);
    const arch = await c.as("architect");
    await ok(arch.post("/api/credentials", { name: "a", value: "bbbbbbbbbbbbbbbb" }));
    expect((await client(demoDir(), { readOnly: true, secretKey: null }).post("/api/credentials", { name: "b", value: "c" })).status).toBe(403);
  });

  it("a hub keeps them in the hub folder, managed from the hub", async () => {
    const dir = tmpDir();
    copyDemoHub(dir);
    writeTestUsers(dir);
    const c = new Client("", {}, createHubApp(dir, { secretKey: "k" }).app);
    const arch = await c.as("architect");
    await ok(arch.post("/api/credentials", { name: "jira", provider: "jira", value: SECRET }));
    expect(fs.existsSync(file(dir))).toBe(true);
    expect((await ok(arch.get("/api/credentials"))).credentials[0]).toMatchObject({ encrypted: true, locked: false });
    const viewer = await c.as("viewer");
    expect((await viewer.get("/api/credentials")).status).toBe(403);
  });

  it("dp credentials add / list / remove, the value from standard input", () => {
    const dir = tmpDir();
    const tsx = path.resolve("node_modules", ".bin", "tsx");
    const dp = (input: string | undefined, ...args: string[]) => spawnSync(tsx, ["src/cli.ts", "credentials", ...args], { encoding: "utf-8", input, env: { ...process.env, DP_SECRET_KEY: "" } });
    expect(dp(`${SECRET}\n`, "add", "gh", dir, "--provider", "github", "--scopes", "repo").status).toBe(0);
    const l = dp(undefined, "list", dir);
    expect(l.stdout).toContain("gh");
    expect(l.stdout).toContain("••••abcd");
    expect(l.stdout).not.toContain(SECRET);
    expect(l.stdout).toContain("not encrypted");
    expect(dp("x", "add", "gh", dir).status).toBe(1);
    expect(dp(undefined, "remove", "gh", dir).status).toBe(0);
  });
});
