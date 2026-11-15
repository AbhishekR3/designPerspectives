/** Optional sign-in and roles (Stage P4): users file, sessions, lockout, the role matrix, state, CLI. */

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hashPassword, parseUsers, readUsers, removeUser, setPassword, usersPath, UsersError, verifyPassword, writeUsers } from "../src/core/users.js";
import { createApp } from "../src/server/app.js";
import { decide, LOCK_MS, READ_ONLY_SERVER, READ_ONLY_VERSION, ROUTE_RULES, SESSION_IDLE_MS, SIGN_IN, WRONG_LOGIN, type Who } from "../src/server/auth.js";
import { client, demoDir, ok, ROLE_USERS, TEST_HASH, testPassword, tmpDir, writeTestUsers, type Client } from "./helpers.js";

const tsx = path.resolve("node_modules", ".bin", "tsx");
const dp = (input: string | undefined, ...args: string[]) => spawnSync(tsx, ["src/cli.ts", ...args], { encoding: "utf-8", input });
const hasGit = spawnSync("git", ["--version"]).status === 0;

const ROLES = ["architect", "engineer", "viewer"] as const;

// ---------------------------------------------------------------- hashing and the users file

describe("password hashes", () => {
  it("round trip, fresh salt, parameters in the string, tampering detected", async () => {
    const h = hashPassword("correct horse", TEST_HASH);
    expect(h).toMatch(/^scrypt\$1024\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    expect(await verifyPassword("correct horse", h)).toBe(true);
    expect(await verifyPassword("correct horsE", h)).toBe(false);
    expect(hashPassword("correct horse", TEST_HASH)).not.toBe(h); // a new salt each time
    const parts = h.split("$");
    const flip = (s: string) => (s[0] === "A" ? "B" : "A") + s.slice(1);
    expect(await verifyPassword("correct horse", [...parts.slice(0, 5), flip(parts[5]!)].join("$"))).toBe(false);
    expect(await verifyPassword("correct horse", [...parts.slice(0, 4), flip(parts[4]!), parts[5]].join("$"))).toBe(false);
    expect(await verifyPassword("correct horse", h.replace("$1024$", "$2048$"))).toBe(false);
    for (const bad of ["", "plain", "scrypt$1000$8$1$abc$def", "bcrypt$1024$8$1$AAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAA"]) expect(await verifyPassword("x", bad)).toBe(false);
    expect(hashPassword("pw-with-defaults")).toMatch(/^scrypt\$32768\$8\$1\$/);
  });
});

describe("users file", () => {
  const good = (extra: object[] = []) => JSON.stringify({ users: [{ name: "Ann", role: "architect", password: hashPassword("password1", TEST_HASH) }, ...extra] });

  it("is checked strictly, with messages that say what is wrong", () => {
    expect(parseUsers(good())).toMatchObject([{ name: "Ann", role: "architect" }]);
    const h = hashPassword("password1", TEST_HASH);
    const bad: [string, RegExp][] = [
      ["{", /not JSON/],
      ["[]", /"users" list/],
      ['{"users": {}}', /"users" list/],
      ['{"users": [1]}', /user 1 is not an object/],
      [JSON.stringify({ users: [{ name: "a b", role: "viewer", password: h }] }), /valid "name"/],
      [JSON.stringify({ users: [{ name: "x".repeat(41), role: "viewer", password: h }] }), /valid "name"/],
      [JSON.stringify({ users: [{ name: "bob", role: "admin", password: h }] }), /"bob" has no valid "role"/],
      [JSON.stringify({ users: [{ name: "bob", role: "viewer", password: "secret" }] }), /"bob" has no valid "password"/],
      [good([{ name: "ANN", role: "viewer", password: h }]), /"ANN" is used twice/],
    ];
    for (const [text, msg] of bad) expect(() => parseUsers(text), text).toThrow(msg);
  });

  it("is written atomically, readable by its owner only", () => {
    const f = path.join(tmpDir(), ".dp", "users.json");
    writeUsers(f, parseUsers(good()));
    if (process.platform !== "win32") {
      expect(fs.statSync(f).mode & 0o777).toBe(0o600);
      expect(fs.statSync(path.dirname(f)).mode & 0o077).toBe(0);
    }
    expect(readUsers(f)).toHaveLength(1);
    expect(readUsers(path.join(tmpDir(), "none.json"))).toBeNull();
  });

  it("a malformed file stops the server; a given file must exist; it must not be readable as code", () => {
    const dir = demoDir();
    fs.mkdirSync(path.join(dir, ".dp"));
    fs.writeFileSync(usersPath(dir), '{"users": [{"name": "x"}]}');
    expect(() => createApp(dir)).toThrow(UsersError);
    fs.writeFileSync(usersPath(dir), "not json");
    expect(() => createApp(dir)).toThrow(/is not valid: it is not JSON/);
    fs.rmSync(usersPath(dir));
    expect(() => createApp(dir, { usersFile: path.join(dir, "nope.json") })).toThrow(/There is no users file/);
    const visible = writeTestUsers(dir, ROLE_USERS, path.join(dir, "users.json"));
    expect(() => createApp(dir, { usersFile: visible })).toThrow(/inside the code folder/);
    const outside = writeTestUsers(dir, ROLE_USERS, path.join(tmpDir(), "users.json"));
    expect(() => createApp(dir, { usersFile: outside })).not.toThrow();
  });
});

// ---------------------------------------------------------------- sign-in

function cookieOf(r: { headers: Headers }): string {
  return r.headers.get("set-cookie") ?? "";
}

describe("sign-in", () => {
  it("is off without a users file: everything as before", async () => {
    const c = client();
    expect(await ok(c.get("/api/me"))).toEqual({ loginRequired: false, user: null });
    const st = await ok(c.get("/api/state"));
    expect(st).toMatchObject({ me: null, loginRequired: false, readOnly: false, can: { editThis: true, createDraft: true, applyDraft: true, discardDraft: false, writeCode: true } });
    expect(st.defaultLens).toBe("engineer");
    expect((await c.post("/api/login", { name: "a", password: "b" })).status).toBe(400);
    const { id } = await ok(c.post("/api/drafts", { title: "D", author: "Someone" }));
    const ds = await ok(c.at(`draft:${id}`).get("/api/state"));
    expect(ds.can).toEqual({ editThis: true, createDraft: true, applyDraft: true, discardDraft: true, writeCode: false });
    expect(ds.drafts).toMatchObject([{ id, author: "Someone", canDiscard: true }]);
  });

  it("requires a session for the API but not for the page, health, me, login or logout", async () => {
    const c = client(demoDir(), { users: true });
    expect(await ok(c.get("/api/me"))).toEqual({ loginRequired: true, user: null });
    expect(await ok(c.get("/api/health"))).toMatchObject({ ok: true });
    expect((await c.get("/")).status).toBe(200);
    for (const [m, u] of [
      ["GET", "/api/state"],
      ["GET", "/api/diagrams/landscape"],
      ["GET", "/api/nothing-here"],
      ["POST", "/api/elements"],
      ["POST", "/api/undo"],
      ["DELETE", "/api/drafts/x"],
    ] as const) {
      const r = await c.req(m, u, m === "GET" ? undefined : {});
      expect(r.status, `${m} ${u}`).toBe(401);
      expect(r.json()).toEqual({ detail: SIGN_IN });
    }
    // A bad version header does not tell an anonymous caller which drafts exist.
    expect((await c.at("draft:nope").get("/api/state")).status).toBe(401);
    expect((await ok(c.post("/api/logout"))).ok).toBe(true);
  });

  it("signs in and out, with a strict cookie", async () => {
    const c = client(demoDir(), { users: true });
    const wrong = await c.post("/api/login", { name: "engineer", password: "nope-nope" });
    expect(wrong.status).toBe(401);
    expect(wrong.json()).toEqual({ detail: WRONG_LOGIN });
    const unknown = await c.post("/api/login", { name: "nobody", password: "whatever1" });
    expect(unknown.status).toBe(401);
    expect(unknown.json()).toEqual({ detail: WRONG_LOGIN });
    expect((await c.post("/api/login", { name: "engineer" })).status).toBe(422);

    const r = await c.post("/api/login", { name: "ENGINEER", password: testPassword("engineer") });
    expect(r.status).toBe(200);
    expect(r.json()).toEqual({ user: { name: "engineer", role: "engineer" } });
    const set = cookieOf(r);
    expect(set).toMatch(/^dp_session=[A-Za-z0-9_-]{43};/);
    expect(set).toContain("HttpOnly");
    expect(set).toContain("SameSite=Strict");
    expect(set).toContain("Path=/");
    expect(set).not.toContain("Secure");
    const viaProxy = await c.app.request("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https" },
      body: JSON.stringify({ name: "engineer", password: testPassword("engineer") }),
    });
    expect(viaProxy.headers.get("set-cookie")).toContain("Secure");

    const e = await c.as("engineer");
    expect(await ok(e.get("/api/me"))).toEqual({ loginRequired: true, user: { name: "engineer", role: "engineer" } });
    expect((await e.get("/api/state")).status).toBe(200);
    const out = await e.post("/api/logout");
    expect(out.status).toBe(200);
    expect(cookieOf(out)).toMatch(/dp_session=;.*Max-Age=0/);
    expect((await e.get("/api/state")).status).toBe(401);
    expect(await ok(e.get("/api/me"))).toEqual({ loginRequired: true, user: null });
  });

  it("ends sessions when the user's password changes, the user is removed, or after 12 hours idle", async () => {
    let now = 1_000_000;
    const dir = demoDir();
    const c = client(dir, { users: [...ROLE_USERS, { name: "Second", role: "architect" }], now: () => now });
    const e = await c.as("engineer");
    const v = await c.as("viewer");
    const a = await c.as("architect");
    expect((await e.get("/api/state")).status).toBe(200);

    setPassword(usersPath(dir), "engineer", "a-new-password", TEST_HASH);
    expect((await e.get("/api/state")).status).toBe(401);
    expect((await c.post("/api/login", { name: "engineer", password: testPassword("engineer") })).status).toBe(401);
    expect((await c.post("/api/login", { name: "engineer", password: "a-new-password" })).status).toBe(200);
    expect((await v.get("/api/state")).status).toBe(200); // others stay signed in

    removeUser(usersPath(dir), "viewer");
    expect((await v.get("/api/state")).status).toBe(401);
    expect((await c.post("/api/login", { name: "viewer", password: testPassword("viewer") })).status).toBe(401);

    now += SESSION_IDLE_MS - 1000;
    expect((await a.get("/api/state")).status).toBe(200); // a request keeps the session alive
    now += SESSION_IDLE_MS + 1;
    expect((await a.get("/api/state")).status).toBe(401);
  });

  it("a users file that breaks while running lets nobody in; removing it does not turn sign-in off", async () => {
    const dir = demoDir();
    const c = client(dir, { users: true });
    const a = await c.as("architect");
    fs.writeFileSync(usersPath(dir), "{ broken");
    const errs: unknown[] = [];
    const orig = console.error;
    console.error = (...x: unknown[]) => void errs.push(x);
    try {
      expect((await a.get("/api/state")).status).toBe(401);
      expect((await c.post("/api/login", { name: "architect", password: testPassword("architect") })).status).toBe(503);
      fs.rmSync(usersPath(dir));
      expect(await ok(c.get("/api/me"))).toEqual({ loginRequired: true, user: null });
      expect((await c.get("/api/state")).status).toBe(401);
    } finally {
      console.error = orig;
    }
    expect(errs.length).toBeGreaterThan(0);
    writeTestUsers(dir);
    expect((await c.post("/api/login", { name: "architect", password: testPassword("architect") })).status).toBe(200);
  });

  it("locks a name for 30 seconds after 5 failures in 5 minutes", async () => {
    let now = 5_000_000;
    const c = client(demoDir(), { users: true, now: () => now });
    for (let i = 0; i < 5; i++) expect((await c.post("/api/login", { name: "Engineer", password: `wrong-${i}-xx` })).status).toBe(401);
    const locked = await c.post("/api/login", { name: "engineer", password: testPassword("engineer") });
    expect(locked.status).toBe(429);
    expect(locked.json().detail).toMatch(/^Too many failed sign-ins for this name\. Try again in 30 seconds\.$/);
    // Other names are not affected.
    expect((await c.post("/api/login", { name: "viewer", password: testPassword("viewer") })).status).toBe(200);
    now += LOCK_MS + 1;
    expect((await c.post("/api/login", { name: "engineer", password: testPassword("engineer") })).status).toBe(200);

    // Unknown names lock the same way (so a lock does not reveal which names exist).
    for (let i = 0; i < 5; i++) expect((await c.post("/api/login", { name: "ghost", password: `wrong-${i}-xx` })).status).toBe(401);
    expect((await c.post("/api/login", { name: "ghost", password: "whatever1" })).status).toBe(429);

    // Failures older than 5 minutes no longer count.
    for (let i = 0; i < 4; i++) expect((await c.post("/api/login", { name: "architect", password: `wrong-${i}-xx` })).status).toBe(401);
    now += 5 * 60 * 1000 + 1;
    expect((await c.post("/api/login", { name: "architect", password: "wrong-again" })).status).toBe(401);
    expect((await c.post("/api/login", { name: "architect", password: testPassword("architect") })).status).toBe(200);
  });
});

// ---------------------------------------------------------------- the role matrix

interface Setup {
  dir: string;
  anon: Client;
  as: Record<(typeof ROLES)[number], Client>;
  /** A fresh draft started by `author`. */
  draft: (by?: (typeof ROLES)[number]) => Promise<string>;
}

async function setup(opts: { readOnly?: boolean } = {}): Promise<Setup> {
  const dir = demoDir();
  const anon = client(dir, { users: true, readOnly: opts.readOnly });
  const as = { architect: await anon.as("architect"), engineer: await anon.as("engineer"), viewer: await anon.as("viewer") };
  let n = 0;
  const draft = async (by: (typeof ROLES)[number] = "architect") => (await ok(as[by].post("/api/drafts", { title: `Draft ${++n}` }))).id as string;
  return { dir, anon, as, draft };
}

type Expect = Record<(typeof ROLES)[number], number>;
const ARCH: Expect = { architect: 200, engineer: 403, viewer: 403 };
const ARCH_ENG: Expect = { architect: 200, engineer: 200, viewer: 403 };

describe("roles", () => {
  it("everyone reads everything, on main and in a draft", async () => {
    const s = await setup();
    const id = await s.draft();
    for (const r of ROLES) {
      for (const c of [s.as[r], s.as[r].at(`draft:${id}`), s.as[r].at(`draft:${id}`, "base")]) {
        expect((await c.get("/api/state")).status).toBe(200);
        expect((await c.get("/api/diagrams/landscape")).status).toBe(200);
      }
      expect((await s.as[r].get(`/api/drafts/${id}/plan`)).status).toBe(200);
      expect((await s.as[r].get(`/api/drafts/${id}/apply-preview`)).status).toBe(200);
      expect((await s.as[r].get("/api/code/file", { path: "sample_code/api/accounts.py" })).status).toBe(200);
    }
  });

  it("changes to main: architect only (model, sidecar, positions, automatic positions, undo, workspace)", async () => {
    const s = await setup();
    const rows: [string, (c: Client) => ReturnType<Client["get"]>][] = [
      ["element", (c) => c.patch("/api/elements/atm", { description: `by ${c.headers.Cookie}` })],
      ["new element", (c) => c.post("/api/elements", { kind: "person", name: `P ${Math.random()}` })],
      ["relationship", (c) => c.post("/api/relationships", { sourceId: "atm", destinationId: "mainframe-banking-system", description: `r ${Math.random()}` })],
      ["flow", (c) => c.post("/api/flows", { title: `F ${Math.random()}` })],
      ["tag group", (c) => c.post("/api/tag-groups", { name: `G ${Math.random()}`, values: [] })],
      ["lens", (c) => c.post("/api/lenses", { name: `L ${Math.random()}` })],
      ["characteristics", (c) => c.put("/api/characteristics", [{ name: "Speed" }])],
      ["cost", (c) => c.put("/api/cost-settings", { currency: "EUR", bands: [{ name: "All", max: null, color: "#888888" }] })],
      ["style", (c) => c.put("/api/styles/atm", { color: "#123456" })],
      ["positions", (c) => c.put("/api/diagrams/landscape/positions", { positions: { atm: { x: 10, y: 20 } } })],
      ["auto positions", (c) => c.req("PUT", "/api/diagrams/landscape/positions", { positions: { atm: { x: 11, y: 21 } } }, { auto: "true" })],
      ["layout", (c) => c.req("PUT", "/api/diagrams/landscape/layout", { sizes: { atm: { w: 200, h: 120 } } }, { auto: "true" })],
      ["workspace", (c) => c.patch("/api/workspace", { description: "x" })],
      ["undo", (c) => c.post("/api/undo")],
    ];
    for (const [what, call] of rows) {
      for (const r of ROLES) {
        const res = await call(s.as[r]);
        expect(res.status, `${what} as ${r}: ${res.text}`).toBe(ARCH[r]);
      }
    }
    const eng = await s.as.engineer.patch("/api/elements/atm", { name: "X" });
    expect(eng.json().detail).toBe("Engineers cannot change the main model. Start a draft to propose the change; an architect applies it.");
    const view = await s.as.viewer.patch("/api/elements/atm", { name: "X" });
    expect(view.json().detail).toMatch(/^You are signed in as a viewer: you can look at everything, but not change it\./);
  });

  it("drafts: create (architect, engineer), edit inside (architect, engineer), apply (architect)", async () => {
    const s = await setup();
    for (const r of ROLES) expect((await s.as[r].post("/api/drafts", { title: `New ${r}` })).status, r).toBe(ARCH_ENG[r]);
    expect((await s.as.viewer.post("/api/drafts", { title: "V" })).json().detail).toMatch(/viewer/);

    const id = await s.draft("architect");
    const rows: [string, (c: Client) => ReturnType<Client["get"]>][] = [
      ["element", (c) => c.patch("/api/elements/atm", { description: `d ${Math.random()}` })],
      ["new element", (c) => c.post("/api/elements", { kind: "person", name: `P ${Math.random()}` })],
      ["tag group", (c) => c.post("/api/tag-groups", { name: `G ${Math.random()}`, values: [] })],
      ["positions", (c) => c.put("/api/diagrams/landscape/positions", { positions: { atm: { x: 1, y: 2 } } })],
      ["auto positions", (c) => c.req("PUT", "/api/diagrams/landscape/positions", { positions: { atm: { x: 3, y: 4 } } }, { auto: "true" })],
      ["undo", (c) => c.post("/api/undo")],
      ["redo", (c) => c.post("/api/redo")],
      ["planned code edit", (c) => c.post("/api/code/file", { path: `sample_code/new_${Math.random().toString(36).slice(2)}.py`, content: "x = 1\n" })],
      ["planned code change", (c) => c.put("/api/code/file", { path: "sample_code/api/accounts.py", content: `# ${Math.random()}\n` })],
    ];
    for (const [what, call] of rows) {
      for (const r of ROLES) {
        const res = await call(s.as[r].at(`draft:${id}`));
        expect(res.status, `${what} in a draft as ${r}: ${res.text}`).toBe(ARCH_ENG[r]);
      }
    }
    // Draft details are changed by id, whatever version is shown.
    for (const r of ROLES) expect((await s.as[r].patch(`/api/drafts/${id}`, { branch: `feature/${r}` })).status, r).toBe(ARCH_ENG[r]);

    for (const r of ["engineer", "viewer"] as const) {
      const res = await s.as[r].post(`/api/drafts/${id}/apply`, { code: false });
      expect(res.status, r).toBe(403);
      if (r === "engineer") expect(res.json().detail).toBe("Only an architect can apply a draft. You can keep working on it; ask an architect to apply it.");
      expect((await s.as[r].post(`/api/drafts/${id}/apply`)).status).toBe(403);
    }
    await ok(s.as.architect.post(`/api/drafts/${id}/apply`, { code: false }));
    const withCode = await s.draft("engineer");
    await ok(s.as.engineer.at(`draft:${withCode}`).put("/api/code/file", { path: "sample_code/api/accounts.py", content: "# planned\n" }));
    expect((await s.as.engineer.post(`/api/drafts/${withCode}/apply`)).status).toBe(403);
    await ok(s.as.architect.post(`/api/drafts/${withCode}/apply`));
    expect(fs.readFileSync(path.join(s.dir, "sample_code/api/accounts.py"), "utf-8")).toBe("# planned\n");
  });

  it("discard: architect any draft, engineer only their own, viewer none", async () => {
    const s = await setup();
    const archDraft = await s.draft("architect");
    const engDraft = await s.draft("engineer");
    const viewerTry = await s.as.viewer.delete(`/api/drafts/${engDraft}`);
    expect(viewerTry.status).toBe(403);
    const engTry = await s.as.engineer.delete(`/api/drafts/${archDraft}`);
    expect(engTry.status).toBe(403);
    expect(engTry.json().detail).toBe("Engineers can discard only drafts they started. This draft was started by architect. Ask an architect to discard it.");
    expect((await s.as.engineer.delete("/api/drafts/no-such-draft")).status).toBe(404);
    await ok(s.as.engineer.delete(`/api/drafts/${engDraft}`));
    await ok(s.as.architect.delete(`/api/drafts/${archDraft}`));
    const another = await s.draft("engineer");
    await ok(s.as.architect.delete(`/api/drafts/${another}`));
  });

  it("real code files: architect only (on main)", async () => {
    const s = await setup();
    for (const r of ROLES) {
      const opened = await ok(s.as[r].get("/api/code/file", { path: "sample_code/api/accounts.py" }));
      expect(opened.readOnly, r).toBe(r !== "architect");
      const res = await s.as[r].put("/api/code/file", { path: "sample_code/api/accounts.py", content: `# ${r}\n`, mtime: opened.mtime });
      expect(res.status, `${r}: ${res.text}`).toBe(ARCH[r]);
    }
    expect((await s.as.engineer.put("/api/code/file", { path: "sample_code/api/accounts.py", content: "# x\n" })).json().detail).toMatch(/^Engineers cannot change code files directly\. Open a draft/);
    // New files and removals outside a draft: refused by role first, then by the draft-only rule.
    expect((await s.as.engineer.post("/api/code/file", { path: "sample_code/n.py", content: "" })).status).toBe(403);
    expect((await s.as.architect.post("/api/code/file", { path: "sample_code/n.py", content: "" })).status).toBe(422);
    expect((await s.as.viewer.delete("/api/code/file?path=sample_code/api/accounts.py")).status).toBe(403);
    expect(fs.readFileSync(path.join(s.dir, "sample_code/api/accounts.py"), "utf-8")).toBe("# architect\n");
  });

  it(".dp/users.json cannot be read, listed or written through the code routes, even by an architect", async () => {
    const s = await setup();
    const a = s.as.architect;
    const p = ".dp/users.json";
    const before = fs.readFileSync(usersPath(s.dir), "utf-8");
    for (const res of [
      await a.get("/api/code/file", { path: p }),
      await a.get("/api/code/file", { path: "sample_code/../.dp/users.json" }),
      await a.put("/api/code/file", { path: p, content: '{"users": []}' }),
      await a.get("/api/code/tree", { path: ".dp" }),
    ]) {
      expect(res.status, res.text).toBe(422);
      expect(res.json().detail).toMatch(/Hidden files and folders/);
    }
    const id = await s.draft();
    const d = a.at(`draft:${id}`);
    expect((await d.post("/api/code/file", { path: p, content: "{}" })).status).toBe(422);
    expect((await d.put("/api/code/file", { path: p, content: "{}" })).status).toBe(422);
    expect((await d.get("/api/code/file", { path: p })).status).toBe(422);
    const tree = await ok(a.get("/api/code/tree"));
    expect(JSON.stringify(tree)).not.toContain(".dp");
    expect(fs.readFileSync(usersPath(s.dir), "utf-8")).toBe(before);
  });

  it("the server sets a draft's author to the signed-in user", async () => {
    const s = await setup();
    const { id } = await ok(s.as.engineer.post("/api/drafts", { title: "Mine", author: "Somebody Else" }));
    const st = await ok(s.as.architect.get("/api/state"));
    expect(st.drafts.find((d: any) => d.id === id).author).toBe("engineer");
  });

  it("state: me, can, readOnly, defaultLens and canDiscard per role and version", async () => {
    const s = await setup();
    const archDraft = await s.draft("architect");
    const engDraft = await s.draft("engineer");
    const lens = { architect: "architect", engineer: "engineer", viewer: "overview" };
    const main = {
      architect: { editThis: true, createDraft: true, applyDraft: true, discardDraft: false, writeCode: true },
      engineer: { editThis: false, createDraft: true, applyDraft: false, discardDraft: false, writeCode: false },
      viewer: { editThis: false, createDraft: false, applyDraft: false, discardDraft: false, writeCode: false },
    };
    for (const r of ROLES) {
      const st = await ok(s.as[r].get("/api/state"));
      expect(st.me).toEqual({ name: r, role: r });
      expect(st.loginRequired).toBe(true);
      expect(st.can, r).toEqual(main[r]);
      expect(st.readOnly).toBe(r !== "architect");
      expect(st.defaultLens).toBe(lens[r]);
      const can = Object.fromEntries(st.drafts.map((d: any) => [d.id, d.canDiscard]));
      expect(can, r).toEqual({ [archDraft]: r === "architect", [engDraft]: r !== "viewer" });

      for (const [id, discard] of [
        [archDraft, r === "architect"],
        [engDraft, r !== "viewer"],
      ] as const) {
        const ds = await ok(s.as[r].at(`draft:${id}`).get("/api/state"));
        expect(ds.can, `${r} in ${id}`).toEqual({ editThis: r !== "viewer", createDraft: r !== "viewer", applyDraft: r === "architect", discardDraft: discard, writeCode: false });
        expect(ds.readOnly).toBe(r === "viewer");
      }
    }
  });

  it("--read-only with sign-in: everyone can sign in and read; nobody can change anything", async () => {
    const s = await setup({ readOnly: true });
    for (const r of ROLES) {
      const st = await ok(s.as[r].get("/api/state"));
      expect(st.me).toEqual({ name: r, role: r });
      expect(st.readOnly).toBe(true);
      expect(st.can).toEqual({ editThis: false, createDraft: false, applyDraft: false, discardDraft: false, writeCode: false });
      const res = await s.as[r].patch("/api/elements/atm", { name: "X" });
      expect(res.status).toBe(403);
      expect(res.json().detail).toBe(READ_ONLY_SERVER);
      expect((await s.as[r].post("/api/drafts", { title: "No" })).status).toBe(403);
    }
    expect((await s.as.architect.post("/api/logout")).status).toBe(200);
  });

  it("--read-only without sign-in: everyone is a viewer, as before", async () => {
    const c = client(demoDir(), { readOnly: true });
    const st = await ok(c.get("/api/state"));
    expect(st).toMatchObject({ me: null, loginRequired: false, readOnly: true });
    expect(st.can).toEqual({ editThis: false, createDraft: false, applyDraft: false, discardDraft: false, writeCode: false });
    expect((await c.post("/api/drafts", { title: "No" })).json().detail).toBe(READ_ONLY_SERVER);
  });

  it("decide(): git versions are read-only for every role; unlisted routes are architect-only", () => {
    const who = (role: Who["role"]): Who => ({ user: { name: role, role }, role, loginRequired: true, readOnlyServer: false });
    for (const r of ROLES) {
      expect(decide("edit", who(r), "ref:HEAD")).toBe(READ_ONLY_VERSION);
      expect(decide("code", who(r), "ref:main")).toBe(READ_ONLY_VERSION);
      expect(decide("open", who(r), "ref:HEAD")).toBeNull();
    }
    expect(decide(undefined, who("architect"), "main")).toBeNull();
    expect(decide(undefined, who("engineer"), "draft:x")).toBe("Only an architect can do this.");
    expect(decide(undefined, who("viewer"), "draft:x")).toMatch(/viewer/);
  });

  it("every non-GET API route is classified (deny by default), and no rule is stale", () => {
    const app = createApp(demoDir());
    const start = app.routes.findIndex((r) => r.handler.name === "dpAuthorize");
    expect(start).toBeGreaterThan(0);
    const handlers = app.routes.slice(start + 1).filter((r) => r.path.startsWith("/api") && r.method !== "GET");
    const keys = handlers.map((r) => `${r.method} ${r.path}`);
    for (const k of keys) expect(ROUTE_RULES, `add "${k}" to ROUTE_RULES in src/server/auth.ts`).toHaveProperty([k]);
    for (const k of Object.keys(ROUTE_RULES)) expect(keys, `ROUTE_RULES has "${k}", which is no route`).toContain(k);
  });
});

// ---------------------------------------------------------------- CLI

function passwords(stdout: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of stdout.matchAll(/^ {2}(\S+)\s+(architect|engineer|viewer)\s+([a-z0-9]{4}(?:-[a-z0-9]{4}){3})$/gm)) out[m[1]!] = m[3]!;
  return out;
}

async function canSignIn(dir: string, name: string, password: string): Promise<number> {
  return (await client(dir).post("/api/login", { name, password })).status;
}

describe("dp users", () => {
  it("init creates three users with printed passwords, once", async () => {
    const dir = demoDir();
    const r = dp(undefined, "users", "init", dir);
    expect(r.status, r.stderr).toBe(0);
    const pw = passwords(r.stdout);
    expect(Object.keys(pw)).toEqual(["architect", "engineer", "viewer"]);
    expect(r.stdout).toContain("shown only this once");
    expect(r.stdout).toMatch(/Reminder: never commit .*users\.json/);
    expect(readUsers(usersPath(dir))!.map((u) => [u.name, u.role])).toEqual([
      ["architect", "architect"],
      ["engineer", "engineer"],
      ["viewer", "viewer"],
    ]);
    expect(fs.readFileSync(usersPath(dir), "utf-8")).not.toContain(pw.architect!);
    if (process.platform !== "win32") expect(fs.statSync(usersPath(dir)).mode & 0o777).toBe(0o600);
    expect(await canSignIn(dir, "viewer", pw.viewer!)).toBe(200);
    expect(fs.existsSync(path.join(dir, ".gitignore"))).toBe(false); // not a git work tree

    const again = dp(undefined, "users", "init", dir);
    expect(again.status).toBe(1);
    expect(again.stderr).toContain("already exists");
  });

  it.skipIf(!hasGit)("keeps .dp/ out of git", () => {
    const fresh = demoDir();
    execFileSync("git", ["init", "-q"], { cwd: fresh });
    expect(dp(undefined, "users", "init", fresh).stdout).toContain("Created .gitignore with .dp/.");
    expect(fs.readFileSync(path.join(fresh, ".gitignore"), "utf-8")).toBe(".dp/\n");

    const appended = demoDir();
    fs.writeFileSync(path.join(appended, ".gitignore"), "node_modules");
    expect(dp(undefined, "users", "init", appended).stdout).toContain("Added .dp/ to .gitignore.");
    expect(fs.readFileSync(path.join(appended, ".gitignore"), "utf-8")).toBe("node_modules\n.dp/\n");

    const present = demoDir();
    fs.writeFileSync(path.join(present, ".gitignore"), "/.dp\n");
    const r = dp(undefined, "users", "init", present);
    expect(r.stdout).not.toContain(".gitignore");
    expect(fs.readFileSync(path.join(present, ".gitignore"), "utf-8")).toBe("/.dp\n");
  });

  it("add, passwd, remove and list", async () => {
    const dir = demoDir();
    // The first user of a new file must be an architect.
    expect(dp(undefined, "users", "add", "eve", "--role", "viewer", dir).status).toBe(1);
    const first = dp("first-password\n", "users", "add", "Lead", "--role", "architect", "--password-stdin", dir);
    expect(first.status, first.stderr).toBe(0);
    expect(first.stdout).not.toContain("first-password");
    expect(await canSignIn(dir, "lead", "first-password")).toBe(200);

    const add = dp(undefined, "users", "add", "dev.one", "--role", "engineer", dir);
    expect(add.status, add.stderr).toBe(0);
    const devPw = passwords(add.stdout)["dev.one"]!;
    expect(await canSignIn(dir, "dev.one", devPw)).toBe(200);

    expect(dp(undefined, "users", "add", "DEV.ONE", "--role", "viewer", dir).stderr).toContain('A user named "dev.one" already exists.');
    expect(dp(undefined, "users", "add", "bad name", "--role", "viewer", dir).stderr).toContain("not a valid user name");
    expect(dp(undefined, "users", "add", "x", "--role", "admin", dir).status).not.toBe(0);
    expect(dp("short\n", "users", "add", "x", "--role", "viewer", "--password-stdin", dir).stderr).toContain("at least 8 characters");

    const pass = dp(undefined, "users", "passwd", "Dev.One", dir);
    expect(pass.status, pass.stderr).toBe(0);
    const newPw = passwords(pass.stdout)["dev.one"]!;
    expect(newPw).not.toBe(devPw);
    expect(await canSignIn(dir, "dev.one", devPw)).toBe(401);
    expect(await canSignIn(dir, "dev.one", newPw)).toBe(200);
    expect(dp("set-by-stdin\n", "users", "passwd", "dev.one", "--password-stdin", dir).status).toBe(0);
    expect(await canSignIn(dir, "dev.one", "set-by-stdin")).toBe(200);
    expect(dp(undefined, "users", "passwd", "nobody", dir).stderr).toContain('No user named "nobody".');

    const list = dp(undefined, "users", "list", dir);
    expect(list.stdout).toMatch(/name\s+role\n\s+Lead\s+architect\n\s+dev\.one\s+engineer/);
    expect(list.stdout).not.toContain("scrypt");

    const last = dp(undefined, "users", "remove", "lead", dir);
    expect(last.status).toBe(1);
    expect(last.stderr).toContain("last architect");
    expect(dp(undefined, "users", "remove", "dev.one", dir).status).toBe(0);
    expect(readUsers(usersPath(dir))!.map((u) => u.name)).toEqual(["Lead"]);
    expect(dp(undefined, "users", "list", tmpDir()).stderr).toContain("dp users init");
  });

  it("--users points at another file", async () => {
    const dir = demoDir();
    const file = path.join(tmpDir(), "team-users.json");
    const r = dp(undefined, "users", "init", dir, "--users", file);
    expect(r.status, r.stderr).toBe(0);
    expect(fs.existsSync(usersPath(dir))).toBe(false);
    const pw = passwords(r.stdout);
    const c = client(dir, { usersFile: file });
    expect((await c.post("/api/login", { name: "architect", password: pw.architect })).status).toBe(200);
  });
});
