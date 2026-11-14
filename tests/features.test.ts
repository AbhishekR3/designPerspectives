/** Stage A2: styles, layouts, tags, notes/tradeoffs/usage/sensitive, connectors, code, undo. */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import * as code from "../src/core/code.js";
import * as diagrams from "../src/core/diagrams.js";
import { buildIndex } from "../src/core/ops.js";
import { emptySidecar, sidecarData } from "../src/core/sidecar.js";
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
        tradeoffs: [{ kind: "risk", text: "SPOF" }, { kind: "cost", text: "" }],
        usage: [{ users: "Customers", frequency: "hourly" }],
        sensitive: [{ item: "PAN", level: "restricted" }, { item: "Logs", level: "internal" }],
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
    expect(tree.entries.map((e: any) => e.name)).toEqual(["api", "pipeline"]);
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
    expect(new Set(code.scanImports(d, files).map(([a, b]) => `${a}>${b}`))).toEqual(
      new Set(["main.py>pkg/__init__.py", "main.py>pkg/sub.py", "pkg/sub.py>pkg/helper.py"]),
    );
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
    expect(db.details).toEqual([{ title: "T", columns: ["a", "b"], rows: [["1", ""], ["2", "3"]] }]);
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
