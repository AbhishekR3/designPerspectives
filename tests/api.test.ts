/** The owner's Stage A checklist (steps 2-9), exercised through the HTTP API. */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { writeCodeFile } from "../src/core/codeMap.js";
import { staticDir, version } from "../src/core/project.js";
import { client, Client, demoDir, ok, tmpDir } from "./helpers.js";

describe("API", () => {
  test("state", async () => {
    const s = await ok(client().get("/api/state"));
    expect(s.workspace.name).toBe("Big Bank plc");
    expect(s.lenses.map((l: any) => l.id)).toEqual(["engineer", "architect", "overview", "security-review", "product-owner", "operations", "finance"]);
    expect(s.defaultLens).toBe("engineer");
    expect(s.loadErrors).toEqual([]);
  });

  test("step 2: new system with three containers", async () => {
    const c = client();
    const sid = (await ok(c.post("/api/elements", { kind: "softwareSystem", name: "Loans", diagramKey: "landscape", position: { x: 10, y: 20 } }))).id;
    const ids: string[] = [];
    for (const n of ["UI", "API", "DB"]) ids.push((await ok(c.post("/api/elements", { kind: "container", name: n, parentId: sid }))).id);
    await ok(c.post("/api/relationships", { sourceId: ids[0], destinationId: ids[1], description: "Calls", technology: "HTTPS" }));
    await ok(c.post("/api/relationships", { sourceId: ids[1], destinationId: ids[2], description: "Reads" }));
    const d = await ok(c.get(`/api/diagrams/containers-${sid}`));
    expect(d.nodes.map((n: any) => n.name).sort()).toEqual(["API", "DB", "UI"]);
    expect(d.edges).toHaveLength(2);
    const land = await ok(c.get("/api/diagrams/landscape"));
    expect(land.nodes.find((n: any) => n.id === sid).position).toEqual({ x: 10, y: 20 });
  });

  test("step 3: drill and breadcrumb", async () => {
    const c = client();
    const land = await ok(c.get("/api/diagrams/landscape"));
    const ibs = land.nodes.find((n: any) => n.name === "Internet Banking System");
    const cont = await ok(c.get(`/api/diagrams/${ibs.drillKey}`));
    const api = cont.nodes.find((n: any) => n.name === "API Application");
    const comp = await ok(c.get(`/api/diagrams/${api.drillKey}`));
    expect(comp.breadcrumb.map((x: any) => x.label)).toEqual(["Landscape", "Internet Banking System", "Internet Banking System", "API Application"]);
  });

  test("step 4: rename everywhere", async () => {
    const c = client();
    await ok(c.patch("/api/elements/e-mail-system", { name: "Mail Gateway" }));
    for (const key of ["landscape", "context-internet-banking-system", "containers-internet-banking-system", "components-api-application"]) {
      const names = (await ok(c.get(`/api/diagrams/${key}`))).nodes.map((n: any) => n.name);
      expect(names).toContain("Mail Gateway");
      expect(names).not.toContain("E-mail System");
    }
  });

  test("step 5: connections in state", async () => {
    const s = await ok(client().get("/api/state"));
    expect(s.relationships.filter((r: any) => r.destinationId === "security-component")).toHaveLength(2);
    expect(s.relationships.filter((r: any) => r.sourceId === "security-component")).toHaveLength(2);
  });

  test("step 6: tag group and overlay data", async () => {
    const c = client();
    await ok(
      c.post("/api/tag-groups", {
        name: "Priority",
        values: [
          { name: "High", color: "#d62728" },
          { name: "Medium", color: "#ff7f0e" },
          { name: "Low", color: "#2ca02c" },
        ],
      }),
    );
    for (const [e, v] of [
      ["api-application", "High"],
      ["database", "Medium"],
      ["mobile-app", "Low"],
    ]) {
      await ok(c.patch(`/api/elements/${e}`, { tags: { Priority: v } }));
    }
    const d = await ok(c.get("/api/diagrams/containers-internet-banking-system"));
    const tags = Object.fromEntries(d.nodes.map((n: any) => [n.id, n.tags.Priority ?? null]));
    expect(tags["api-application"]).toBe("High");
    expect(tags["web-application"]).toBeNull();
    // Rename a value: elements follow. Remove a value: elements lose it.
    await ok(
      c.put("/api/tag-groups/Priority", {
        name: "Priority level",
        values: [
          { name: "Severe", color: "#d62728", previousName: "High" },
          { name: "Low", color: "#2ca02c", previousName: "Low" },
        ],
      }),
    );
    const els = Object.fromEntries((await ok(c.get("/api/state"))).elements.map((e: any) => [e.id, e.tags]));
    expect(els["api-application"]["Priority level"]).toBe("Severe");
    expect(els["database"]).not.toHaveProperty("Priority level");
    expect((await c.patch("/api/elements/database", { tags: { "Priority level": "Medium" } })).status).toBe(422);
  });

  test("step 7: five-step flow", async () => {
    const c = client();
    const key = (await ok(c.post("/api/flows", { title: "Pay a bill" }))).key;
    const rels = [
      "personal-banking-customer--single-page-application",
      "single-page-application--accounts-summary-controller",
      "accounts-summary-controller--mainframe-banking-system-facade",
      "mainframe-banking-system-facade--mainframe-banking-system",
      "single-page-application--accounts-summary-controller",
    ];
    const steps: any[] = rels.map((r) => ({ relationshipId: r }));
    steps[steps.length - 1].response = true;
    await ok(c.put(`/api/flows/${key}`, { steps }));
    const d = await ok(c.get(`/api/diagrams/${key}`));
    expect(d.level).toBe("flow");
    expect(d.flow.steps).toHaveLength(5);
  });

  test("step 8: lenses", async () => {
    const c = client();
    const lid = (await ok(c.post("/api/lenses", { name: "Business", visibleLevels: ["landscape", "context"], showTechnology: false }))).id;
    const lenses = (await ok(c.get("/api/state"))).lenses.map((l: any) => l.id);
    expect(lenses[0]).toBe("engineer");
    expect(lenses[lenses.length - 1]).toBe(lid);
    expect((await c.put("/api/lenses/engineer", { name: "E" })).status).toBe(403);
    expect((await c.post("/api/lenses", { name: "Business" })).status).toBe(422);
  });

  test("step 9: persisted and readable", async () => {
    const dir = demoDir();
    await ok(new Client(dir).post("/api/elements", { kind: "person", name: "Auditor" }));
    const c2 = new Client(dir); // "close and reopen"
    expect((await ok(c2.get("/api/state"))).elements.map((e: any) => e.name)).toContain("Auditor");
    const data = JSON.parse(fs.readFileSync(path.join(dir, "architecture", "workspace.json"), "utf-8"));
    expect(data.model.people.some((p: any) => p.id === "auditor")).toBe(true);
  });

  test("invalid edit is refused and not written", async () => {
    const dir = demoDir();
    const file = path.join(dir, "architecture", "workspace.json");
    const before = fs.readFileSync(file, "utf-8");
    const r = await new Client(dir).post("/api/elements", { kind: "person", name: "ATM" }); // clashes with system "ATM"
    expect(r.status).toBe(422);
    expect(r.json().detail).toContain("already used");
    expect(fs.readFileSync(file, "utf-8")).toBe(before);
  });

  test("external file change is picked up", async () => {
    const dir = demoDir();
    const c = new Client(dir);
    await ok(c.get("/api/state"));
    const file = path.join(dir, "architecture", "workspace.json");
    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    data.name = "Changed on disk";
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    expect((await ok(c.get("/api/state"))).workspace.name).toBe("Changed on disk");
  });

  test("state version changes after an edit and after an external file change, not otherwise", async () => {
    const dir = demoDir();
    const c = new Client(dir);
    const v0 = (await ok(c.get("/api/state"))).version;
    expect(typeof v0).toBe("string");
    expect((await ok(c.get("/api/state"))).version).toBe(v0);
    // A position-only edit, which nothing else in the state summary shows.
    await ok(c.put("/api/diagrams/landscape/positions", { positions: { atm: { x: 5, y: 5 } } }));
    const v1 = (await ok(c.get("/api/state"))).version;
    expect(v1).not.toBe(v0);
    const file = path.join(dir, "architecture", "workspace.json");
    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    data.description = "Changed on disk";
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    const v2 = (await ok(c.get("/api/state"))).version;
    expect(v2).not.toBe(v1);
    expect((await ok(c.get("/api/state"))).version).toBe(v2);
  });

  test("delete element and relationship", async () => {
    const c = client();
    await ok(c.delete("/api/relationships/security-component--database"));
    await ok(c.delete("/api/elements/api-application"));
    const s = await ok(c.get("/api/state"));
    const ids = new Set(s.elements.map((e: any) => e.id));
    expect(ids.has("api-application")).toBe(false);
    expect(ids.has("sign-in-controller")).toBe(false);
    expect((await c.get("/api/diagrams/components-api-application")).status).toBe(404);
    expect(s.flows.find((f: any) => f.title === "Sign in").steps).toEqual([]);
  });

  test("CLI validate", () => {
    const dir = demoDir();
    const tsx = path.resolve("node_modules", ".bin", "tsx");
    const r = spawnSync(tsx, ["src/cli.ts", "validate", dir], { encoding: "utf-8" });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe("OK");
    const missing = spawnSync(tsx, ["src/cli.ts", "validate", tmpDir()], { encoding: "utf-8" });
    expect(missing.status).toBe(2);
  });

  test("CLI version and init", () => {
    const tsx = path.resolve("node_modules", ".bin", "tsx");
    const v = spawnSync(tsx, ["src/cli.ts", "--version"], { encoding: "utf-8" });
    expect(v.stdout.trim()).toBe(`designPerspectives ${version()}`);
    const dir = tmpDir();
    const init = spawnSync(tsx, ["src/cli.ts", "init", dir, "--empty", "--name", "Mine"], { encoding: "utf-8" });
    expect(init.status, init.stderr).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(dir, "architecture", "workspace.json"), "utf-8")).name).toBe("Mine");
    const again = spawnSync(tsx, ["src/cli.ts", "init", dir], { encoding: "utf-8" });
    expect(again.status).toBe(1);
    expect(again.stderr).toContain("Not overwriting");
  });

  test("page is not cached", async () => {
    if (staticDir() === null) return;
    const r = await client().get("/");
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-cache");
    const deep = await client().get("/some/route");
    expect(deep.headers.get("content-type")).toContain("text/html");
  });

  test("health and version", async () => {
    expect(await ok(client().get("/api/health"))).toEqual({ ok: true, version: version(), loadErrors: 0 });
  });

  test("unknown API routes are 404 JSON", async () => {
    const r = await client().get("/api/nope");
    expect(r.status).toBe(404);
    expect(r.json().detail).toBeTruthy();
  });

  test("code file save keeps permissions and line endings", () => {
    const dir = tmpDir();
    const f = path.join(dir, "run.sh");
    fs.writeFileSync(f, "echo hi\r\n", "utf-8");
    fs.chmodSync(f, 0o755);
    const m = fs.statSync(f).mtimeMs / 1000;
    writeCodeFile(dir, "run.sh", "echo bye\r\n", m);
    expect(fs.readFileSync(f).toString("binary")).toBe("echo bye\r\n"); // line endings kept as typed
    expect(fs.statSync(f).mode & 0o777).toBe(0o755);
    expect(fs.readdirSync(dir).filter((p) => p.endsWith(".tmp"))).toEqual([]);
  });

  test("two saves in the same instant still get different versions", () => {
    const dir = tmpDir();
    const f = path.join(dir, "a.py");
    fs.writeFileSync(f, "x = 1\n");
    const t = new Date(1_700_000_000_000);
    fs.utimesSync(f, t, t);
    const first = writeCodeFile(dir, "a.py", "x = 2\n", t.getTime() / 1000);
    const again = new Date(first.mtime * 1000);
    fs.utimesSync(f, again, again);
    const second = writeCodeFile(dir, "a.py", "x = 3\n", first.mtime);
    expect(second.mtime).not.toBe(first.mtime);
    expect(() => writeCodeFile(dir, "a.py", "x = 4\n", first.mtime)).toThrow(/changed on disk/);
  });

  test("bad request bodies are 422", async () => {
    const c = client();
    expect((await c.req("POST", "/api/elements", undefined)).status).toBe(422);
    expect((await c.post("/api/elements", { name: "no kind" })).status).toBe(422);
    expect((await c.post("/api/relationships", { sourceId: "atm" })).status).toBe(422);
    expect((await c.put("/api/diagrams/landscape/positions", { positions: { atm: { x: "a", y: 1 } } })).status).toBe(422);
  });
});
