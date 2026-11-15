/** Starting from nothing: blank by default, the built-in lenses, and which lens a new browser opens in. */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";
import { BUILTIN_LENSES, emptySidecar, makeLens, sidecarData } from "../src/core/sidecar.js";
import { errors } from "../src/core/validate.js";
import { initProject } from "../src/core/store.js";
import { emptyWorkspace } from "../src/core/workspace.js";
import { Client, demoDir, ok, tmpDir } from "./helpers.js";

const tsx = path.resolve("node_modules", ".bin", "tsx");
const dp = (...args: string[]) => spawnSync(tsx, ["src/cli.ts", ...args], { encoding: "utf-8" });

describe("blank by default", () => {
  test("initProject creates an empty model unless asked for the demo", () => {
    const d = tmpDir();
    initProject(d);
    const ws = JSON.parse(fs.readFileSync(path.join(d, "architecture", "workspace.json"), "utf-8"));
    expect(ws.model).toEqual({});
    expect(fs.existsSync(path.join(d, "sample_code"))).toBe(false);
  });

  test("the demo brings its sample code", () => {
    const d = demoDir();
    expect(fs.existsSync(path.join(d, "sample_code"))).toBe(true);
  });

  test("dp init: empty by default, --demo for the demo, --empty still accepted", () => {
    const a = tmpDir();
    expect(dp("init", a).status).toBe(0);
    expect(fs.existsSync(path.join(a, "sample_code"))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(a, "architecture", "workspace.json"), "utf-8")).model).toEqual({});
    const b = tmpDir();
    expect(dp("init", b, "--empty").status).toBe(0);
    expect(fs.existsSync(path.join(b, "sample_code"))).toBe(false);
    const c = tmpDir();
    expect(dp("init", c, "--demo").status).toBe(0);
    expect(fs.existsSync(path.join(c, "sample_code"))).toBe(true);
    expect(dp("check", a).status).toBe(0);
  });
});

describe("built-in lenses", () => {
  test("engineer, architect and overview are listed first and flagged built-in", async () => {
    const lenses = (await ok(new Client(demoDir()).get("/api/state"))).lenses;
    expect(lenses.slice(0, 3).map((l: any) => [l.id, l.builtin])).toEqual([["engineer", true], ["architect", true], ["overview", true]]);
    const arch = lenses.find((l: any) => l.id === "architect");
    expect(arch.visibleLevels).toEqual(["landscape", "context", "container", "component", "code"]);
    expect(arch.showTechnology).toBe(true);
    const ov = lenses.find((l: any) => l.id === "overview");
    expect(ov.visibleLevels).toEqual(["landscape", "context"]);
    expect(ov.showTechnology).toBe(false);
    expect(ov.showDescriptions).toBe(true);
    for (const s of ["cost", "notes", "tradeoffs", "sensitive", "code"]) expect(ov.visibleSections).not.toContain(s);
    expect(ov.visibleSections).toContain("technology");
  });

  test("they are read-only, and their ids and names are taken", async () => {
    const c = new Client(demoDir());
    for (const id of ["architect", "overview"]) {
      expect((await c.put(`/api/lenses/${id}`, { name: "X" })).status).toBe(403);
      expect((await c.delete(`/api/lenses/${id}`)).status).toBe(403);
    }
    expect((await c.post("/api/lenses", { name: "Architect" })).status).toBe(422);
    expect((await c.post("/api/lenses", { name: "Overview" })).status).toBe(422);
  });

  test("they are not written to the sidecar file, and their ids cannot be stored", () => {
    expect(BUILTIN_LENSES.map((l) => l.id)).toEqual(["engineer", "architect", "overview"]);
    expect(sidecarData(emptySidecar())).toEqual({ version: 1, tagGroups: [], lenses: [] });
    for (const id of ["engineer", "architect", "overview"]) {
      const sc = emptySidecar();
      sc.lenses = [makeLens({ id, name: `Mine ${id}` })];
      expect(errors(emptyWorkspace("W"), sc).some((e) => e.includes("reserved"))).toBe(true);
    }
  });
});

describe("defaultLens", () => {
  test("architect while the model has no containers, engineer once it has one", async () => {
    const d = tmpDir();
    initProject(d);
    const c = new Client(d);
    expect((await ok(c.get("/api/state"))).defaultLens).toBe("architect");
    const sid = (await ok(c.post("/api/elements", { kind: "softwareSystem", name: "Shop" }))).id;
    expect((await ok(c.get("/api/state"))).defaultLens).toBe("architect");
    await ok(c.post("/api/elements", { kind: "container", name: "Web", parentId: sid }));
    expect((await ok(c.get("/api/state"))).defaultLens).toBe("engineer");
  });
});
