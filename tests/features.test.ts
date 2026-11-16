/** Stage A2: styles, layouts, tags, notes/tradeoffs/usage/sensitive, connectors, code, undo. */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import * as code from "../src/core/codeMap.js";
import * as diagrams from "../src/core/diagrams.js";
import { buildIndex } from "../src/core/ops.js";
import { emptySidecar, sidecarData } from "../src/core/sidecar.js";
import { Project } from "../src/core/project.js";
import { client, Client, demoDir, demoWs, element, ok, tmpDir } from "./helpers.js";

describe("features", () => {
  test("technology is tags", async () => {
    const c = client();
    let el = await element(c, "single-page-application");
    expect(el.technologies).toEqual(["JavaScript", "Angular"]);
    await ok(c.patch("/api/elements/single-page-application", { technology: ["TypeScript", "Angular", "Angular"] }));
    el = await element(c, "single-page-application");
    expect(el.technologies).toEqual(["TypeScript", "Angular"]);
    expect(el.technology).toBe("TypeScript, Angular");
    expect((await ok(c.get("/api/state"))).technologies).toContain("Redis");
  });

  test("notes, tradeoffs, usage, sensitive", async () => {
    const c = client();
    await ok(
      c.patch("/api/elements/web-application", {
        notes: "free text\nsecond line",
        tradeoffs: [
          { kind: "risk", text: "SPOF" },
          { kind: "cost", text: "" },
        ],
        usage: [{ users: "Customers", frequency: "hourly" }],
        sensitive: [
          { item: "PAN", level: "restricted" },
          { item: "Logs", level: "internal" },
        ],
      }),
    );
    const el = await element(c, "web-application");
    expect(el.notes).toBe("free text\nsecond line");
    expect(el.tradeoffs).toEqual([{ kind: "risk", text: "SPOF" }]); // empty rows dropped
    expect(el.usage).toEqual([{ users: "Customers", frequency: "hourly" }]);
    expect(el.sensitivityLevel).toBe("restricted");
    expect((await c.patch("/api/elements/web-application", { usage: [{ users: "x", frequency: "yearly" }] })).status).toBe(422);
    expect((await c.patch("/api/elements/web-application", { sensitive: [{ item: "x", level: "secret" }] })).status).toBe(422);
  });

  test("arch type and connector kind", async () => {
    const c = client();
    await ok(c.patch("/api/elements/database", { archType: "storage" }));
    expect((await c.patch("/api/elements/database", { archType: "banana" })).status).toBe(422);
    const rid = (await ok(c.post("/api/relationships", { sourceId: "web-application", destinationId: "database", kind: "db-connection", technology: ["JDBC"] }))).id;
    const rel = (await ok(c.get("/api/state"))).relationships.find((r: any) => r.id === rid);
    expect(rel.kind).toBe("db-connection");
    expect(rel.technologies).toEqual(["JDBC"]);
    expect((await c.patch(`/api/relationships/${rid}`, { kind: "carrier-pigeon" })).status).toBe(422);
  });

  test("stages and connector diagram", async () => {
    const c = client();
    const d = await ok(c.get("/api/diagrams/connector-event-stream--data-warehouse"));
    expect(d.nodes.map((n: any) => n.name)).toEqual(["Event Stream", "Consume events", "Mask PII", "Load to warehouse", "Data Warehouse"]);
    expect(d.edges).toHaveLength(4);
    expect(d.c4).toBe("C3");
    expect(d.nodes.find((n: any) => n.name === "Mask PII").drillKey).toBe("code-pii-masker");
    expect((await c.patch("/api/relationships/event-stream--data-warehouse", { stages: [{ name: "X", elementId: "nope" }] })).status).toBe(422);
    // deleting an implementing element keeps the stage but drops the link
    await ok(c.delete("/api/elements/pii-masker"));
    const stages = (await ok(c.get("/api/state"))).relationships.find((r: any) => r.id === "event-stream--data-warehouse").stages;
    expect(stages).toHaveLength(3);
    expect(stages.every((s: any) => s.elementId !== "pii-masker")).toBe(true);
  });

  test("example data on a connector and its stages", async () => {
    const c = client();
    const rid = "event-stream--data-warehouse";
    const relOf = async (cl: Client = c) => (await ok(cl.get("/api/state"))).relationships.find((r: any) => r.id === rid);
    let rel = await relOf();
    // The demo pipeline ships with samples: what enters, then what leaves each stage.
    expect(rel.format).toBe("Kafka message, JSON");
    expect(JSON.parse(rel.example).email).toBe("alice@example.com");
    expect(rel.stages.map((s: any) => Boolean(s.example))).toEqual([true, true, true]);
    expect(JSON.parse(rel.stages[1].example)).not.toHaveProperty("email");

    // Blank lines at the ends are dropped; an empty example removes the property.
    await ok(c.patch(`/api/relationships/${rid}`, { example: "\n\nid,name\n1,alice\n\n", format: "  CSV row " }));
    rel = await relOf();
    expect(rel.example).toBe("id,name\n1,alice");
    expect(rel.format).toBe("CSV row");
    await ok(c.patch(`/api/relationships/${rid}`, { example: "", format: "" }));
    rel = await relOf();
    expect([rel.example, rel.format]).toEqual(["", ""]);

    // Stage samples survive a stage edit that passes the stages back, and are capped in size.
    await ok(c.patch(`/api/relationships/${rid}`, { stages: rel.stages.map((s: any, i: number) => (i === 0 ? { ...s, name: "Read events" } : s)) }));
    rel = await relOf();
    expect(rel.stages[0].name).toBe("Read events");
    expect(rel.stages.every((s: any) => s.example)).toBe(true);
    const big = "x".repeat(8001);
    expect((await c.patch(`/api/relationships/${rid}`, { example: big })).status).toBe(422);
    expect((await c.patch(`/api/relationships/${rid}`, { stages: [{ name: "A", example: big }] })).status).toBe(422);
  });

  test("a changed example shows in a draft's change list", async () => {
    const c = client(demoDir());
    const { id } = await ok(c.post("/api/drafts", { title: "Samples" }));
    await ok(c.at(`draft:${id}`).patch("/api/relationships/api-application--event-stream", { example: "SELECT 1", format: "SQL" }));
    const changes = await ok(c.at(`draft:${id}`, "base").get("/api/changes"));
    const rel = changes.relationships.find((r: any) => r.id === "api-application--event-stream");
    expect(rel.fields.map((f: any) => f.field)).toEqual(["example", "format"]);
  });

  test("derived edge points to where it is drawn", async () => {
    const d = await ok(client().get("/api/diagrams/landscape"));
    const derived = d.edges.filter((e: any) => e.derived);
    expect(derived.length).toBeGreaterThan(0);
    expect(derived.some((e: any) => e.drillTargets.some((t: any) => /^(containers-|components-|context-)/.test(t.key)))).toBe(true);
    for (const e of d.edges.filter((e: any) => !e.derived)) expect(e.detailKey).toBe(`connector-${e.id}`);
  });

  test("diagram tree levels and indent", async () => {
    const tree = (await ok(client().get("/api/state"))).diagrams;
    const by = Object.fromEntries(tree.map((d: any) => [d.key, d]));
    expect([by["landscape"].c4, by["landscape"].depth]).toEqual(["C1", 0]);
    expect(by["context-internet-banking-system"].depth).toBe(1);
    expect([by["containers-internet-banking-system"].c4, by["containers-internet-banking-system"].depth]).toEqual(["C2", 2]);
    expect([by["components-api-application"].c4, by["components-api-application"].depth]).toEqual(["C3", 3]);
    expect([by["code-sign-in-controller"].c4, by["code-sign-in-controller"].depth]).toEqual(["C4", 4]);
  });

  test("styles validate and prune", async () => {
    const c = client();
    await ok(c.put("/api/styles/atm", { fill: "#ff0000", strokeStyle: "dotted", fontSize: 18 }));
    const n = (await ok(c.get("/api/diagrams/landscape"))).nodes.find((x: any) => x.id === "atm");
    expect(n.style).toEqual({ fill: "#ff0000", strokeStyle: "dotted", fontSize: 18 });
    expect((await c.put("/api/styles/atm", { fill: "red" })).status).toBe(422);
    expect((await c.put("/api/styles/nothing", { fill: "#ffffff" })).status).toBe(422);
    await ok(c.delete("/api/elements/atm"));
    expect((await ok(c.get("/api/state"))).styles).not.toHaveProperty("atm");
  });

  test("styles on synthetic IDs with slashes", async () => {
    const c = client();
    await ok(c.put("/api/styles/file:sample_code/api/store.py", { fill: "#123456" }));
    expect((await ok(c.get("/api/state"))).styles["file:sample_code/api/store.py"]).toEqual({ fill: "#123456" });
    await ok(c.put("/api/styles/file:sample_code/api/store.py", null));
    expect((await ok(c.get("/api/state"))).styles).not.toHaveProperty("file:sample_code/api/store.py");
  });

  test("an edit that worsens an existing model error is refused", () => {
    const dir = tmpDir();
    const arch = path.join(dir, "architecture");
    fs.mkdirSync(arch);
    const sys = (id: string) => ({ id, name: "X" });
    fs.writeFileSync(path.join(arch, "workspace.json"), JSON.stringify({ name: "T", model: { softwareSystems: [sys("a"), sys("b")] }, views: {} }));
    const p = new Project(dir);
    expect(p.loadErrors).toHaveLength(1);
    // Unrelated edits still work on a model that already has the problem.
    p.edit((ws) => {
      ws.model.softwareSystems[0]!.description = "ok";
    });
    expect(() => p.edit((ws) => ws.model.softwareSystems.push({ ...sys("c"), relationships: [], containers: [] } as never))).toThrow(/3 of them/);
    expect(p.workspace.model.softwareSystems).toHaveLength(2);
  });

  test("file styles are pruned when the code mapping goes away", async () => {
    const c = client();
    const f = "file:sample_code/api/store.py";
    await ok(c.put(`/api/styles/${f}`, { fill: "#123456" }));
    expect((await ok(c.get("/api/state"))).styles).toHaveProperty(f);
    const mapped = (await ok(c.get("/api/state"))).elements.filter((e: any) => (e.codePaths ?? []).length);
    for (const e of mapped) await ok(c.patch(`/api/elements/${e.id}`, { codePaths: [] }));
    expect((await ok(c.get("/api/state"))).styles).not.toHaveProperty(f);
  });

  test("layout sizes and edge geometry", async () => {
    const dir = demoDir();
    const c = new Client(dir);
    const rid = "atm--mainframe-banking-system";
    await ok(
      c.put("/api/diagrams/landscape/layout", {
        sizes: { atm: { w: 300, h: 90 } },
        edges: {
          [rid]: { sourceAnchor: { x: 0.5, y: 1 }, targetAnchor: { x: 0, y: 0.5 }, control: { x: 5, y: 6 }, labelT: 0.3, labelOffset: -12, routing: "orthogonal" },
        },
      }),
    );
    const d = await ok(c.get("/api/diagrams/landscape"));
    expect(d.nodes.find((n: any) => n.id === "atm").size).toEqual({ w: 300, h: 90 });
    const e = d.edges.find((x: any) => x.id === rid);
    expect(e.layout.routing).toBe("orthogonal");
    expect(e.layout.labelT).toBe(0.3);
    // survives reopening the files
    const d2 = await ok(new Client(dir).get("/api/diagrams/landscape"));
    expect(d2.nodes.find((n: any) => n.id === "atm").size).toEqual({ w: 300, h: 90 });
    expect((await c.put("/api/diagrams/nope/layout", {})).status).toBe(404);
    // a null removes an entry
    await ok(c.put("/api/diagrams/landscape/layout", { sizes: { atm: null }, edges: { [rid]: null } }));
    const d3 = await ok(c.get("/api/diagrams/landscape"));
    expect(d3.nodes.find((n: any) => n.id === "atm").size).toBeNull();
    expect(d3.edges.find((x: any) => x.id === rid).layout).toEqual({});
  });

  test("code diagram imports and file API", async () => {
    const dir = demoDir();
    const c = new Client(dir);
    const d = await ok(c.get("/api/diagrams/code-sign-in-controller"));
    expect(d.nodes.map((n: any) => n.name)).toEqual(["sign_in.py", "security.py", "store.py"]);
    const pairs = new Set(d.edges.map((e: any) => `${e.source.split("/").pop()}>${e.target.split("/").pop()}`));
    expect(pairs).toEqual(new Set(["sign_in.py>security.py", "security.py>store.py"]));
    const f = await ok(c.get("/api/code/file", { path: "sample_code/api/store.py" }));
    await ok(c.put("/api/code/file", { path: "sample_code/api/store.py", content: f.content + "\n# x\n", mtime: f.mtime }));
    expect(fs.readFileSync(path.join(dir, "sample_code/api/store.py"), "utf-8").endsWith("# x\n")).toBe(true);
    // a stale mtime is refused
    expect((await c.put("/api/code/file", { path: "sample_code/api/store.py", content: "", mtime: f.mtime })).status).toBe(422);
    const tree = await ok(c.get("/api/code/tree", { path: "sample_code" }));
    expect(tree.entries.map((e: any) => e.name)).toEqual(["api", "notifications", "payments", "pipeline", "statements"]);
  });

  test.each(["../secret.txt", "/etc/passwd", "sample_code/../../x"])("code paths cannot escape root: %s", async (bad) => {
    const c = client();
    expect((await c.get("/api/code/file", { path: bad })).status).toBe(422);
    expect((await c.patch("/api/elements/sign-in-controller", { codePaths: [bad] })).status).toBe(422);
  });

  test("symlinks cannot escape the code root", async () => {
    const dir = demoDir();
    const outside = tmpDir();
    fs.writeFileSync(path.join(outside, "secret.txt"), "secret");
    fs.symlinkSync(outside, path.join(dir, "link"));
    expect((await new Client(dir).get("/api/code/file", { path: "link/secret.txt" })).status).toBe(422);
  });

  test("scanner resolves JS and relative imports", () => {
    const d = tmpDir();
    fs.writeFileSync(path.join(d, "a.ts"), "import { b } from './b';\nconst c = require('./lib/c');\nimport x from 'react';");
    fs.writeFileSync(path.join(d, "b.ts"), "export const b = 1;");
    fs.mkdirSync(path.join(d, "lib"));
    fs.writeFileSync(path.join(d, "lib/c.js"), "module.exports = 1");
    fs.writeFileSync(path.join(d, "p.py"), "from . import q\nimport q2");
    fs.writeFileSync(path.join(d, "q.py"), "");
    fs.writeFileSync(path.join(d, "q2.py"), "");
    const files = ["a.ts", "b.ts", "lib/c.js", "p.py", "q.py", "q2.py"];
    expect(new Set(code.scanImports(d, files).map(([a, b]) => `${a}>${b}`))).toEqual(new Set(["a.ts>b.ts", "a.ts>lib/c.js", "p.py>q.py", "p.py>q2.py"]));
  });

  test("Python import scanner skips comments and strings, handles packages", () => {
    const src = [
      '"""Docstring mentioning\nimport fake\n"""',
      "# import commented",
      "import os, pkg.mod as m",
      "from ..up import (a,",
      "    b as c)",
      "s = 'import notreal'",
      "def f():",
      "    from pkg import sub; import lazy",
    ].join("\n");
    expect(code.pyModules(src)).toEqual([
      ["os", 0],
      ["pkg.mod", 0],
      ["up", 2],
      ["up.a", 2],
      ["up.b", 2],
      ["pkg", 0],
      ["pkg.sub", 0],
      ["lazy", 0],
    ]);
    const d = tmpDir();
    fs.mkdirSync(path.join(d, "pkg"));
    fs.writeFileSync(path.join(d, "pkg/__init__.py"), "");
    fs.writeFileSync(path.join(d, "pkg/sub.py"), "from . import helper");
    fs.writeFileSync(path.join(d, "pkg/helper.py"), "");
    fs.writeFileSync(path.join(d, "main.py"), "from pkg import sub");
    const files = ["main.py", "pkg/__init__.py", "pkg/sub.py", "pkg/helper.py"];
    expect(new Set(code.scanImports(d, files).map(([a, b]) => `${a}>${b}`))).toEqual(new Set(["main.py>pkg/__init__.py", "main.py>pkg/sub.py", "pkg/sub.py>pkg/helper.py"]));
  });

  test("folders expand to source files, skipping build folders", () => {
    const d = tmpDir();
    for (const f of ["src/a.py", "src/b/c.ts", "src/node_modules/x.js", "src/__pycache__/a.pyc", "src/img.png", "src/a-b.py"]) {
      fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true });
      fs.writeFileSync(path.join(d, f), "");
    }
    const [files, missing] = code.expandPaths(d, ["src", "nope"]);
    expect(files).toEqual(["src/a-b.py", "src/a.py", "src/b/c.ts"]);
    expect(missing).toEqual(["nope"]);
  });

  test("undo and redo", async () => {
    const c = client();
    const n = (await ok(c.get("/api/state"))).elements.length;
    await ok(c.post("/api/elements", { kind: "person", name: "Auditor" }));
    let s = await ok(c.get("/api/state"));
    expect([s.elements.length, s.canUndo, s.canRedo]).toEqual([n + 1, true, false]);
    expect((await ok(c.post("/api/undo"))).ok).toBe(true);
    s = await ok(c.get("/api/state"));
    expect([s.elements.length, s.canRedo]).toEqual([n, true]);
    expect((await ok(c.post("/api/redo"))).ok).toBe(true);
    expect((await ok(c.get("/api/state"))).elements.length).toBe(n + 1);
    expect((await ok(c.post("/api/redo"))).ok).toBe(false);
  });

  test("duplicate element", async () => {
    const c = client();
    const id = (await ok(c.post("/api/elements/api-application/duplicate"))).id;
    const el = await element(c, id);
    expect(el.name).toBe("API Application copy");
    expect(el.technologies).toEqual(["Java", "Spring MVC"]);
    expect(el.notes).toBeTruthy();
  });

  test("duplicate element onto a diagram at a point", async () => {
    const c = client();
    const key = "containers-internet-banking-system";
    const id = (await ok(c.post("/api/elements/api-application/duplicate", { diagramKey: key, position: { x: 900, y: 40 } }))).id;
    const d = await ok(c.get(`/api/diagrams/${key}`));
    expect(d.nodes.find((n: { id: string }) => n.id === id).position).toEqual({ x: 900, y: 40 });
    // One undo removes the copy and its position together.
    await ok(c.post("/api/undo"));
    expect((await ok(c.get("/api/state"))).elements.some((e: { id: string }) => e.id === id)).toBe(false);
  });

  test("lens sections round trip", async () => {
    const c = client();
    const lid = (await ok(c.post("/api/lenses", { name: "Lean", visibleSections: ["notes"] }))).id;
    const lens = (await ok(c.get("/api/state"))).lenses.find((l: any) => l.id === lid);
    expect(lens.visibleSections).toEqual(["notes"]);
  });

  test("example tag groups in demo", async () => {
    const groups = Object.fromEntries((await ok(client().get("/api/state"))).tagGroups.map((g: any) => [g.name, g.values.map((v: any) => v.name)]));
    expect(groups["Risk"]).toEqual(["Low", "Medium", "High"]);
    expect(groups["Lifecycle"]).toEqual(["Planned", "Live", "Deprecated"]);
  });

  test("sidecar dump omits empty", () => {
    expect(sidecarData(emptySidecar())).toEqual({ version: 1, tagGroups: [], lenses: [] });
    expect(diagrams.parseKey("connector-x--y")!.level).toBe("connector");
    expect(buildIndex(demoWs()).kind.get("atm")).toBe("softwareSystem");
  });

  test("details tables", async () => {
    const c = client();
    let db = await element(c, "database");
    expect(db.details.map((t: any) => t.title)).toEqual(["Connection", "Table USERS"]);
    await ok(c.patch("/api/elements/database", { details: [{ title: "T", columns: ["a", "b"], rows: [["1"], ["2", "3", "4"], ["", ""]] }] }));
    db = await element(c, "database");
    expect(db.details).toEqual([
      {
        title: "T",
        columns: ["a", "b"],
        rows: [
          ["1", ""],
          ["2", "3"],
        ],
      },
    ]);
    expect((await c.patch("/api/elements/database", { details: [{ title: "T", columns: ["a", ""], rows: [] }] })).status).toBe(422);
    await ok(c.patch("/api/elements/database", { details: [] }));
    expect((await element(c, "database")).details).toEqual([]);
  });

  test("flow step examples survive edits", async () => {
    const c = client();
    const f = (await ok(c.get("/api/state"))).flows.find((x: any) => x.title === "Sign in");
    expect(f.steps.some((st: any) => st.example)).toBe(true);
    expect(f.steps.some((st: any) => st.format)).toBe(true);
    const steps = f.steps.map((st: any) => ({ ...st }));
    steps[0].example = "changed";
    await ok(c.put(`/api/flows/${f.key}`, { steps }));
    const f2 = (await ok(c.get("/api/state"))).flows.find((x: any) => x.key === f.key);
    expect(f2.steps[0].example).toBe("changed");
    // Removing the first step renumbers and keeps the others' examples.
    await ok(c.put(`/api/flows/${f.key}`, { steps: steps.slice(1) }));
    const f3 = (await ok(c.get("/api/state"))).flows.find((x: any) => x.key === f.key);
    expect(f3.steps.map((st: any) => st.example)).toEqual(steps.slice(1).map((st: any) => st.example));
  });

  test("read-only server", async () => {
    const c = client(demoDir(), { readOnly: true });
    expect((await ok(c.get("/api/state"))).readOnly).toBe(true);
    expect((await c.post("/api/elements", { kind: "person", name: "X" })).status).toBe(403);
    expect((await c.post("/api/undo")).status).toBe(403);
    expect((await c.get("/api/state")).status).toBe(200);
  });

  test("automatic positions are not undo steps", async () => {
    const c = client();
    await ok(c.post("/api/elements", { kind: "person", name: "Auditor" }));
    const n = (await ok(c.get("/api/state"))).elements.length;
    expect((await c.req("PUT", "/api/diagrams/landscape/positions", { positions: { auditor: { x: 5, y: 5 } } }, { auto: "true" })).status).toBe(200);
    await ok(c.post("/api/undo")); // undoes the person, not the position
    expect((await ok(c.get("/api/state"))).elements.length).toBe(n - 1);
  });

  test("positions on an unknown diagram are 404", async () => {
    expect((await client().put("/api/diagrams/nope/positions", { positions: {} })).status).toBe(404);
  });
});

describe("diagramming from scratch", () => {
  const parentOf = async (c: Client, id: string) => (await element(c, id))?.parentId;

  test("move an element; undo and redo", async () => {
    const c = client();
    const r = await ok(c.post("/api/elements/database/move", { parentId: "analytics-platform" }));
    expect(r).toEqual({ ok: true, id: "database", parentId: "analytics-platform" });
    expect(await parentOf(c, "database")).toBe("analytics-platform");
    const st = await ok(c.get("/api/state"));
    expect(st.relationships.find((x: any) => x.id === "security-component--database")).toBeTruthy();
    const d = await ok(c.get("/api/diagrams/containers-analytics-platform"));
    expect(d.nodes.find((n: any) => n.id === "database").inScope).toBe(true);
    await ok(c.post("/api/undo"));
    expect(await parentOf(c, "database")).toBe("internet-banking-system");
    await ok(c.post("/api/redo"));
    expect(await parentOf(c, "database")).toBe("analytics-platform");
  });

  test("refused moves are 422 and change nothing", async () => {
    const c = client();
    const refused = async (id: string, body: unknown, msg: RegExp) => {
      const r = await c.post(`/api/elements/${id}/move`, body);
      expect(r.status, r.text).toBe(422);
      expect(r.json().detail).toMatch(msg);
    };
    await refused("atm", { parentId: "analytics-platform" }, /Only containers and components/);
    await refused("database", { parentId: "api-application" }, /must sit inside a software system/);
    await refused("database", { parentId: "internet-banking-system" }, /already inside/);
    await refused("database", {}, /"parentId" is required/);
    await refused("nope", { parentId: "analytics-platform" }, /No element with ID "nope"/);
    expect((await ok(c.get("/api/state"))).canUndo).toBe(false);
  });

  test("create and connect in one undo step", async () => {
    const c = client();
    const made = await ok(c.post("/api/elements", { kind: "person", name: "Teller", connectTo: "web-application", diagramKey: "containers-internet-banking-system", position: { x: 5, y: 5 } }));
    expect(made).toEqual({ id: "teller", relationshipId: "teller--web-application" });
    const d = await ok(c.get("/api/diagrams/containers-internet-banking-system"));
    expect(d.nodes.find((n: any) => n.id === "teller")).toMatchObject({ inScope: false, position: { x: 5, y: 5 } });
    expect(d.connectRequired).toEqual(["person", "softwareSystem"]);

    const sys = await ok(c.post("/api/elements", { kind: "softwareSystem", name: "Fraud Check", connectFrom: "api-application", connectDescription: "Checks payments with" }));
    const rel = (await ok(c.get("/api/state"))).relationships.find((x: any) => x.id === sys.relationshipId);
    expect(rel).toMatchObject({ sourceId: "api-application", destinationId: "fraud-check", description: "Checks payments with" });

    await ok(c.post("/api/undo"));
    let st = await ok(c.get("/api/state"));
    expect(st.elements.some((e: any) => e.id === "fraud-check")).toBe(false);
    expect(st.relationships.some((x: any) => x.id === sys.relationshipId)).toBe(false);
    expect(st.elements.some((e: any) => e.id === "teller")).toBe(true);
    await ok(c.post("/api/undo"));
    st = await ok(c.get("/api/state"));
    expect(st.elements.some((e: any) => e.id === "teller")).toBe(false);
    expect(st.canUndo).toBe(false);

    // A relationship that is not allowed refuses the whole edit: no element is left behind.
    const bad = await c.post("/api/elements", { kind: "container", parentId: "atm", name: "Inside", connectTo: "atm" });
    expect(bad.status).toBe(422);
    expect((await c.post("/api/elements", { kind: "person", connectTo: "nope" })).status).toBe(422);
    expect((await c.post("/api/elements", { kind: "person", connectTo: "atm", connectFrom: "atm" })).status).toBe(422);
    st = await ok(c.get("/api/state"));
    expect(st.elements.some((e: any) => e.id === "inside" || e.name === "New person")).toBe(false);
  });

  test("delete several elements in one undo step", async () => {
    const c = client();
    const before = await ok(c.get("/api/state"));
    // "api-application" has components; "components" go with it, so listing one of them too must not fail.
    const child = before.elements.find((e: any) => e.parentId === "api-application")!.id;
    const gone = await ok(c.post("/api/elements/delete", { ids: ["api-application", child, "atm", "atm"] }));
    expect(gone.deleted).toEqual(expect.arrayContaining(["api-application", child, "atm"]));
    let st = await ok(c.get("/api/state"));
    for (const id of ["api-application", child, "atm"]) expect(st.elements.some((e: any) => e.id === id)).toBe(false);

    await ok(c.post("/api/undo"));
    st = await ok(c.get("/api/state"));
    expect(st.elements.map((e: any) => e.id).sort()).toEqual(before.elements.map((e: any) => e.id).sort());
    expect(st.relationships.length).toBe(before.relationships.length);
    expect(st.canUndo).toBe(false);

    // An unknown id refuses everything before anything is deleted; so does an empty or malformed list.
    const bad = await c.post("/api/elements/delete", { ids: ["atm", "nope"] });
    expect(bad.status).toBe(422);
    expect(bad.json().detail).toMatch(/No element with ID "nope"/);
    expect((await c.post("/api/elements/delete", { ids: [] })).status).toBe(422);
    expect((await c.post("/api/elements/delete", {})).status).toBe(422);
    st = await ok(c.get("/api/state"));
    expect(st.elements.some((e: any) => e.id === "atm")).toBe(true);
    expect(st.canUndo).toBe(false);
  });

  test("a layout detail saved with auto=true is not a separate undo step", async () => {
    const c = client();
    const made = await ok(c.post("/api/elements", { kind: "container", parentId: "internet-banking-system", name: "Extra", connectFrom: "web-application" }));
    await ok(c.put("/api/diagrams/containers-internet-banking-system/layout?auto=true", { edges: { [made.relationshipId]: { sourceAnchor: { x: 1, y: 0.5 } } } }));
    await ok(c.post("/api/undo"));
    const st = await ok(c.get("/api/state"));
    expect(st.elements.some((e: any) => e.id === "extra")).toBe(false);
    expect(st.canUndo).toBe(false);
  });

  test("the first rename after creating can give the element a readable ID", async () => {
    const c = client();
    const { id } = await ok(c.post("/api/elements", { kind: "softwareSystem", name: "New system", connectFrom: "personal-banking-customer" }));
    expect(id).toBe("new-system");
    await ok(c.put("/api/diagrams/landscape/positions", { positions: { [id]: { x: 1, y: 2 } } }));
    const r = await ok(c.patch(`/api/elements/${id}`, { name: "Loans", reslug: true }));
    expect(r).toEqual({ ok: true, id: "loans" });
    const st = await ok(c.get("/api/state"));
    expect(st.elements.some((e: any) => e.id === "new-system")).toBe(false);
    expect(st.relationships.some((x: any) => x.id === "personal-banking-customer--loans")).toBe(true);
    const land = await ok(c.get("/api/diagrams/landscape"));
    expect(land.nodes.find((n: any) => n.id === "loans").position).toEqual({ x: 1, y: 2 });
    expect(st.diagrams.map((d: any) => d.key)).toContain("containers-loans");

    // Without the option, or for an element whose ID is not made from its name, the ID stays.
    expect(await ok(c.patch("/api/elements/loans", { name: "Loan Service" }))).toEqual({ ok: true, id: "loans" });
    expect(await ok(c.patch("/api/elements/loans", { name: "Credit", reslug: true }))).toEqual({ ok: true, id: "loans" });

    await ok(c.post("/api/undo"));
    await ok(c.post("/api/undo"));
    await ok(c.post("/api/undo")); // the re-slugging rename
    const back = await ok(c.get("/api/state"));
    expect(back.elements.find((e: any) => e.id === "new-system").name).toBe("New system");
    expect(back.relationships.some((x: any) => x.id === "personal-banking-customer--new-system")).toBe(true);
  });

  test("in a draft, only elements new to the draft are re-slugged", async () => {
    const c = client();
    await ok(c.post("/api/elements", { kind: "softwareSystem" })); // "new-system" in main
    const { id: draft } = await ok(c.post("/api/drafts", { title: "Plan" }));
    const d = c.at(`draft:${draft}`);
    expect(await ok(d.patch("/api/elements/new-system", { name: "Billing", reslug: true }))).toEqual({ ok: true, id: "new-system" });
    const { id } = await ok(d.post("/api/elements", { kind: "softwareSystem" }));
    expect(await ok(d.patch(`/api/elements/${id}`, { name: "Payments", reslug: true }))).toEqual({ ok: true, id: "payments" });
    const changes = await ok(c.at(`draft:${draft}`, "base").get("/api/changes"));
    expect(changes.elements.map((e: any) => [e.id, e.change]).sort()).toEqual([
      ["new-system", "changed"],
      ["payments", "added"],
    ]);
  });
});
