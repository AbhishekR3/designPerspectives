import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkHub, checkHubFolder, copyDemoHub, createHubApp, HubError, initHub } from "../src/server/hub.js";
import { setRole, UsersError } from "../src/core/users.js";
import { Client, client, demoDir, ok, tmpDir, writeTestUsers } from "./helpers.js";

function demoHub(): string {
  const dir = tmpDir();
  copyDemoHub(dir);
  return dir;
}

/** A client on the hub, for one project (or none). */
function hubClient(dir: string, project: string | null, opts = {}): Client {
  const { app } = createHubApp(dir, opts);
  return new Client("", {}, app, project ? { "X-DP-Project": project } : {});
}
const on = (c: Client, project: string) => new Client("", {}, c.app, { ...c.headers, "X-DP-Project": project });

describe("home page, single project", () => {
  it("says it is one project and summarises it", async () => {
    const c = client();
    const hub = await ok(c.get("/api/hub"));
    expect(hub).toMatchObject({ mode: "single", name: "Big Bank plc", catalog: null, canAdmin: true });
    expect(hub.projects).toHaveLength(1);
    const home = await ok(c.get("/api/home"));
    expect(home.mode).toBe("single");
    expect(home.projects[0]).toMatchObject({ name: "Big Bank plc", error: null, counts: { decisions: 7 } });
    expect(home.projects[0].counts.containers).toBeGreaterThan(5);
    expect(home.projects[0].thumb.boxes.length).toBeGreaterThan(3);
    // The demo's conditional decision has open triggers; the deferred one a date coming up.
    expect(home.watch.some((w: any) => w.kind === "trigger" && w.decision === "0003")).toBe(true);
    expect(home.attention.some((a: any) => a.kind === "decision" && a.target.id === "0004")).toBe(true);
    expect(home.decisions[0].date >= home.decisions[1].date).toBe(true);
    expect(home.shared).toBeNull();
    expect(await ok(c.get("/api/catalog"))).toEqual([]);
  });

  it("lists a project's own data and who reads and writes it", async () => {
    const c = client();
    expect((await c.patch("/api/elements/database", { data: [{ name: "accounts" }, { name: "Accounts" }] })).status).toBe(422);
    await ok(c.patch("/api/elements/database", { data: [{ name: "accounts", kind: "table", sensitive: true }] }));
    const rel = (await ok(c.get("/api/state"))).relationships.find((r: any) => r.destinationId === "database");
    await ok(
      c.patch(`/api/relationships/${rel.id}`, {
        dataAccess: [
          { asset: "accounts", mode: "write" },
          { asset: "nope", mode: "read" },
        ],
      }),
    );
    const u = await ok(c.get("/api/catalog/usage"));
    expect(u.mode).toBe("single");
    const a = u.assets.find((x: any) => x.name === "accounts");
    expect(a).toMatchObject({ kind: "table", sensitive: true, shared: false, projects: 1, writers: 1, flags: [] });
    expect(a.access).toMatchObject([{ elementId: rel.sourceId, mode: "write", relationshipId: rel.id }]);
    expect(u.unknown).toMatchObject([{ asset: "nope" }]);
  });
});

describe("hub", () => {
  it("passes each request to the project the header names; one model per project", async () => {
    const dir = demoHub();
    const c = hubClient(dir, null);
    expect((await c.get("/api/state")).status).toBe(422);
    expect((await on(c, "nope").get("/api/state")).status).toBe(404);
    const onb = await ok(on(c, "onboarding").get("/api/state"));
    const pay = await ok(on(c, "payments").get("/api/state"));
    expect(onb.workspace.name).toBe("Customer onboarding");
    expect(pay.workspace.name).toBe("Payments");
    await ok(on(c, "onboarding").patch("/api/elements/kyc-service", { owner: "Onboarding team" }));
    expect((await ok(on(c, "payments").get("/api/state"))).elements.some((e: any) => e.owner === "Onboarding team")).toBe(false);
    const hub = await ok(c.get("/api/hub"));
    expect(hub).toMatchObject({ mode: "hub", name: "Acme Retail Bank", catalog: "catalog" });
    expect(hub.projects.map((p: any) => p.id)).toEqual(["onboarding", "payments", "catalog"]);
  });

  it("the home page shows every project, shared tables, a table with two writers, and the copy it brought up to date", async () => {
    const c = hubClient(demoHub(), null);
    const home = await ok(c.get("/api/home"));
    expect(home.projects.map((p: any) => [p.id, p.linked > 0])).toEqual([
      ["onboarding", true],
      ["payments", true],
      ["catalog", false],
    ]);
    expect(home.shared).toMatchObject({ multiWriter: 1 });
    expect(home.shared.sharedAssets).toBeGreaterThanOrEqual(2); // customers, audit_log, customer-changed
    const kinds = home.attention.map((a: any) => a.kind);
    expect(kinds).toContain("multi-writer");
    // The demo's payments copy of the identity provider had drifted: the hub brought it up to date.
    expect(kinds).not.toContain("catalog-drift");
    expect(home.catalogUpdates).toMatchObject([{ catalogId: "identity-provider", fields: ["description"], projects: [{ project: "payments", elementId: "identity-provider" }] }]);
    expect(home.attention.find((a: any) => a.kind === "multi-writer").text).toMatch(/audit_log.*onboarding, payments/);
    expect(home.decisions.map((d: any) => d.project).sort()).toEqual(["catalog", "onboarding", "payments"]);
  });

  it("usage: who reads and writes each table, shared and private", async () => {
    const u = await ok(hubClient(demoHub(), null).get("/api/catalog/usage"));
    const asset = (n: string) => u.assets.find((a: any) => a.name === n);
    expect(asset("customers")).toMatchObject({ shared: true, projects: 2, writers: 1, flags: ["used-by-several"] });
    expect(asset("audit_log").flags).toEqual(["used-by-several", "several-writers"]);
    expect(asset("kyc_checks")).toMatchObject({ shared: false, owner: "onboarding", holder: { catalogId: "customer-db", project: "onboarding" } });
    expect(u.elements.find((e: any) => e.catalogId === "customer-db").usedBy.map((x: any) => x.project)).toEqual(["onboarding", "payments"]);
    expect(u.drift).toEqual([]); // brought up to date automatically
    expect(u.missing).toEqual([]);
    expect(u.unknown).toEqual([]);
  });

  it("linked copies: shared fields are refused, sync takes the catalog's, add and link from the catalog", async () => {
    const c = hubClient(demoHub(), null);
    const pay = on(c, "payments");
    const r = await pay.patch("/api/elements/customer-db", { name: "Our DB" });
    expect(r.status).toBe(422);
    expect(r.json().detail).toMatch(/shared catalog/);
    await ok(pay.patch("/api/elements/customer-db", { owner: "DBA team" })); // other fields are the project's
    await ok(pay.post("/api/elements/identity-provider/catalog/sync")); // nothing left to do: already in step
    expect((await ok(c.get("/api/catalog/usage"))).drift).toEqual([]);

    const { id } = await ok(pay.post("/api/elements/from-catalog", { catalogId: "e-mail-service" }));
    const st = await ok(pay.get("/api/state"));
    expect(st.elements.find((e: any) => e.id === id)).toMatchObject({ name: "E-mail Service", catalogId: "e-mail-service", external: false });
    expect((await pay.post("/api/elements/from-catalog", { catalogId: "e-mail-service" })).status).toBe(422);

    await ok(pay.delete(`/api/elements/${id}/catalog`));
    await ok(pay.patch(`/api/elements/${id}`, { name: "Mailer" }));
    await ok(pay.post(`/api/elements/${id}/catalog`, { catalogId: "e-mail-service" }));
    expect((await ok(pay.get("/api/state"))).elements.find((e: any) => e.id === id).name).toBe("E-mail Service");
    expect((await pay.post(`/api/elements/${id}/catalog`, { catalogId: "customer-db" })).status).toBe(422); // a container, not a system

    // A catalog change reaches every copy as soon as it is saved (DEC-056), and the home page lists it.
    await ok(pay.patch("/api/elements/customer-db", { owner: "Data team" }));
    await ok(on(c, "catalog").patch("/api/elements/customer-db", { description: "Customers, accounts and the audit log." }));
    for (const p of ["onboarding", "payments"]) {
      expect((await ok(on(c, p).get("/api/state"))).elements.find((e: any) => e.id === "customer-db").description).toBe("Customers, accounts and the audit log.");
    }
    expect((await ok(c.get("/api/home"))).catalogUpdates[0]).toMatchObject({ catalogId: "customer-db", fields: ["description"], projects: [{ project: "onboarding" }, { project: "payments" }] });
    // The update is not an undo step of the project's own; the project's own edits still are.
    await ok(pay.post("/api/undo"));
    const db = (await ok(pay.get("/api/state"))).elements.find((e: any) => e.id === "customer-db");
    expect(db).toMatchObject({ owner: "DBA team", description: "Customers, accounts and the audit log." });

    // A copy that cannot take the catalog's new name (another element has it) stays as it is, listed as drift.
    await ok(pay.post("/api/elements", { kind: "softwareSystem", name: "Mail" }));
    await ok(on(c, "catalog").patch("/api/elements/e-mail-service", { name: "Mail" }));
    const u = await ok(c.get("/api/catalog/usage"));
    expect(u.drift).toMatchObject([{ project: "payments", elementId: id, fields: ["name"] }]);
    // A project outside a hub has no catalog to link to.
    expect((await client().post("/api/elements/from-catalog", { catalogId: "x" })).status).toBe(422);
  });

  it("one sign-in for every project; only an architect adds a project", async () => {
    const dir = demoHub();
    writeTestUsers(dir);
    const c = hubClient(dir, null);
    expect((await on(c, "onboarding").get("/api/state")).status).toBe(401);
    const eng = await c.as("engineer");
    await ok(on(eng, "onboarding").get("/api/state"));
    await ok(on(eng, "payments").get("/api/state"));
    expect((await on(eng, "payments").patch("/api/elements/ledger-worker", { owner: "x" })).status).toBe(403); // engineers: drafts only
    expect((await eng.post("/api/hub/projects", { id: "cards", name: "Cards" })).status).toBe(403);
    expect((await ok(eng.get("/api/hub"))).canAdmin).toBe(false);

    const arch = await c.as("architect");
    await ok(arch.post("/api/hub/projects", { id: "cards", name: "Cards" }));
    expect(fs.existsSync(path.join(dir, "cards", "architecture", "workspace.json"))).toBe(true);
    expect((await ok(arch.get("/api/hub"))).projects.map((p: any) => p.id)).toContain("cards");
    expect((await ok(on(arch, "cards").get("/api/state"))).workspace.name).toBe("Cards");
    for (const bad of [{ id: "cards" }, { id: "catalog" }, { id: "Bad Id" }, { id: "x", path: "." }, { id: "y", path: "onboarding/sub" }]) {
      expect((await arch.post("/api/hub/projects", bad)).status, JSON.stringify(bad)).toBe(422);
    }
  });

  it("roles per project: a user's role in one project can differ from their role elsewhere", async () => {
    const dir = demoHub();
    writeTestUsers(dir);
    const file = path.join(dir, ".dp", "users.json");
    setRole(file, "engineer", "architect", "payments");
    setRole(file, "viewer", "engineer", "onboarding");
    const c = hubClient(dir, null);
    const eng = await c.as("engineer");
    await ok(on(eng, "payments").patch("/api/elements/ledger-worker", { owner: "Payments team" })); // architect here
    expect((await on(eng, "onboarding").patch("/api/elements/kyc-service", { owner: "x" })).status).toBe(403); // engineer there
    expect((await ok(on(eng, "payments").get("/api/state"))).me.role).toBe("architect");
    const hub = await ok(eng.get("/api/hub"));
    expect(Object.fromEntries(hub.projects.map((p: any) => [p.id, p.role]))).toEqual({ onboarding: "engineer", payments: "architect", catalog: "engineer" });
    expect(hub.canAdmin).toBe(false); // adding projects and credentials follow the role everywhere
    const viewer = await c.as("viewer");
    const { id } = await ok(on(viewer, "onboarding").post("/api/drafts", { title: "Plan" }));
    expect(id).toBeTruthy();
    expect((await on(viewer, "payments").post("/api/drafts", { title: "Plan" })).status).toBe(403);
    // A change of project role applies on the next request, without signing out.
    setRole(file, "engineer", "default", "payments");
    expect((await on(eng, "payments").patch("/api/elements/ledger-worker", { owner: "y" })).status).toBe(403);
    expect(() => setRole(file, "engineer", "boss", "payments")).toThrow(UsersError);
    expect(() => setRole(file, "architect", "viewer")).toThrow(/last architect/);
  });

  it("a read-only hub copies nothing", async () => {
    const dir = demoHub();
    const before = fs.readFileSync(path.join(dir, "payments", "architecture", "workspace.json"), "utf-8");
    const c = hubClient(dir, null, { readOnly: true });
    await ok(c.get("/api/home"));
    expect(fs.readFileSync(path.join(dir, "payments", "architecture", "workspace.json"), "utf-8")).toBe(before);
  });

  it("hub.json is checked: folders that hold the hub or another project are refused", () => {
    const dir = tmpDir();
    const ok1 = checkHub(dir, {
      projects: [
        { id: "a", path: "a" },
        { id: "b", path: "b" },
      ],
      catalog: "catalog",
    });
    expect(ok1.projects.map((p) => p.id)).toEqual(["a", "b"]);
    for (const bad of [
      { projects: [{ id: "a", path: "." }] },
      { projects: [{ id: "a", path: ".." }] },
      {
        projects: [
          { id: "a", path: "a" },
          { id: "b", path: "a/b" },
        ],
      },
      {
        projects: [
          { id: "a", path: "a" },
          { id: "a", path: "b" },
        ],
      },
      { projects: [{ id: "catalog", path: "a" }] },
      { projects: [{ id: "a", path: "catalog/x" }], catalog: "catalog" },
      { projects: "x" },
    ]) {
      expect(() => checkHub(dir, bad), JSON.stringify(bad)).toThrow(HubError);
    }
  });

  it("dp init --hub makes an empty hub; dp check --hub checks every project", async () => {
    const dir = path.join(tmpDir(), "hub");
    initHub(dir, { name: "Mine" });
    expect(JSON.parse(fs.readFileSync(path.join(dir, "hub.json"), "utf-8"))).toEqual({ version: 1, name: "Mine", catalog: "catalog", projects: [] });
    expect(() => initHub(dir)).toThrow(HubError);
    const home = await ok(hubClient(dir, null).get("/api/home"));
    expect(home.projects.map((p: any) => p.id)).toEqual(["catalog"]);

    const demo = demoHub();
    expect(checkHubFolder(demo).errors).toEqual([]);
    fs.writeFileSync(path.join(demo, "payments", "architecture", "workspace.json"), "{");
    expect(checkHubFolder(demo).errors.join(" ")).toMatch(/\[payments\] The model cannot be loaded/);
    // A project that cannot load shows on its card instead of breaking the hub.
    const broken = await ok(hubClient(demo, null).get("/api/home"));
    expect(broken.projects.find((p: any) => p.id === "payments").error).toBeTruthy();
  });

  it("a project in a single-project server is untouched by hub features", async () => {
    const dir = demoDir();
    const c = client(dir);
    expect((await c.get("/api/state")).status).toBe(200);
    expect((await c.post("/api/hub/projects", { id: "x" })).status).toBe(404);
  });
});
