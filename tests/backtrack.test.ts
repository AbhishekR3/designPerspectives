/** Backtracking: steps up to a stage or flow step, the code behind them, and their git history (demo history). */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { insideRepo, readDemoHistory, writeDemoHistory } from "../src/demo/demoHistory.js";
import { findFunctions } from "../src/core/codeMap.js";
import { DEMO_DIR } from "../src/core/project.js";
import { client, demoDir, ok, tmpDir } from "./helpers.js";

const JOB = "mainframe-banking-system--statement-store";
const NOW = Date.parse("2026-11-15T12:00:00Z");

/** A demo project with the demo's made-up git history, dated from NOW. */
function demoWithHistory(): string {
  const dir = demoDir();
  expect(writeDemoHistory(dir, readDemoHistory(DEMO_DIR)!, NOW)).toBe(4);
  return dir;
}

describe("findFunctions", () => {
  test("TypeScript functions, arrow functions, classes and methods", () => {
    const src = [
      "export function a(x: number) {",
      "  return x;",
      "}",
      "const b = async (y: string): Promise<void> => {};",
      "export class C {",
      "  private d(z: number): number {",
      "    if (z) {",
      "      return 1;",
      "    }",
      "  }",
      "}",
    ].join("\n");
    expect(findFunctions("x.ts", src).map((f) => [f.name, f.kind, f.line, f.end])).toEqual([
      ["a", "function", 1, 3],
      ["b", "function", 4, 4],
      ["C", "class", 5, 5],
      ["d", "method", 6, 11],
    ]);
  });

  test("Python functions, classes and methods; other files have none", () => {
    expect(findFunctions("m.py", "def f():\n    pass\n\nclass K:\n    async def g(self):\n        pass\n").map((f) => [f.name, f.kind])).toEqual([
      ["f", "function"],
      ["K", "class"],
      ["g", "method"],
    ]);
    expect(findFunctions("notes.md", "function x() {}")).toEqual([]);
  });
});

describe("demo history", () => {
  test("is written as dated commits and leaves the shipped files", () => {
    const dir = demoWithHistory();
    const log = execFileSync("git", ["log", "--format=%ad|%an|%s", "--date=short"], { cwd: dir, encoding: "utf-8" }).trim().split("\n");
    expect(log).toEqual([
      "2026-11-13|Tom Becker|Convert currency: round each converted amount to cents",
      "2026-11-09|Ana Lima|Add the fees and interest stage to the statement job",
      "2026-10-25|Tom Becker|Validate: reject records dated outside the statement period",
      "2026-10-06|Priya Shah|Statement job: first version of the month-end pipeline",
    ]);
    expect(execFileSync("git", ["status", "--porcelain"], { cwd: dir, encoding: "utf-8" })).toBe("");
    const shipped = fs.readFileSync(path.join(DEMO_DIR, "sample_code", "statements", "convert_currency.ts"), "utf-8");
    expect(fs.readFileSync(path.join(dir, "sample_code", "statements", "convert_currency.ts"), "utf-8")).toBe(shipped);
    expect(fs.readFileSync(path.join(dir, ".gitignore"), "utf-8")).toContain("traces/");
  });

  test("is not written inside an existing repository", () => {
    const outer = tmpDir();
    execFileSync("git", ["init", "-q"], { cwd: outer });
    const inner = path.join(outer, "project");
    fs.mkdirSync(inner);
    expect(insideRepo(inner)).toBe(true);
    expect(writeDemoHistory(inner, readDemoHistory(DEMO_DIR)!, NOW)).toBe(0);
    expect(fs.existsSync(path.join(inner, ".gitignore"))).toBe(false);
  });
});

describe("GET /api/backtrack", () => {
  test("from stage 8 of the statement job: steps, recent changes, changed functions, model history", async () => {
    const dir = demoWithHistory();
    const c = client(dir);
    // The real clock decides what is recent; the history is dated from NOW, so ask for a window that reaches it.
    const days = Math.ceil((Date.now() - NOW) / 86_400_000) + 14;
    const r = await ok(c.get(`/api/backtrack?connector=${JOB}&stage=8&days=${days}`));
    expect(r.target).toBe(8);
    expect(r.codeHistory && r.modelHistory).toBe(true);
    expect(r.steps.map((s: any) => s.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(r.steps[8].name).toBe("Render PDF statements");
    expect(r.steps[0].example).toContain("COFFEE ROASTERS");
    // Only the steps changed in the last 14 days (plus slack for the real clock) are recent.
    expect(r.steps.filter((s: any) => s.recent).map((s: any) => s.name)).toEqual(["Convert currency", "Apply fees and interest"]);
    const convert = r.steps[5].files.find((f: any) => f.path.endsWith("convert_currency.ts"));
    expect(convert.commits[0].subject).toBe("Convert currency: round each converted amount to cents");
    expect(convert.functions.filter((f: any) => f.changed).map((f: any) => f.name)).toEqual(["convert", "roundCents"]);
    expect(r.steps[5].elementId).toBe("currency-converter");
    // The fees stage was added to the model six days before NOW, with its component.
    expect(r.steps[7].modelChanges.map((m: any) => [m.change, m.what, m.date.slice(0, 10)])).toEqual([
      ["added", 'Stage "Apply fees and interest" added', "2026-11-09"],
      ["added", '"Fee Calculator" added to the model', "2026-11-09"],
    ]);
    // An edit not yet committed marks the step too.
    fs.appendFileSync(path.join(dir, "sample_code", "statements", "render_pdf.ts"), "\nexport const X = 1;\n");
    const again = await ok(c.get(`/api/backtrack?connector=${JOB}&stage=8&days=${days}`));
    const render = again.steps[8].files.find((f: any) => f.path.endsWith("render_pdf.ts"));
    expect(render.uncommitted).toBe(true);
    expect(again.steps[8].recent).toBe(true);
  });

  test("works without git: data, files and functions, no history", async () => {
    const c = client();
    const r = await ok(c.get(`/api/backtrack?connector=${JOB}&stage=5`));
    expect(r.codeHistory).toBe(false);
    expect(r.steps).toHaveLength(6);
    expect(r.steps.every((s: any) => !s.recent && s.modelChanges.length === 0)).toBe(true);
    expect(r.steps[5].files[0].functions.map((f: any) => f.name)).toEqual(["convert", "convertAll", "roundCents"]);
  });

  test("from a flow step, and refuses steps that do not exist", async () => {
    const c = client();
    const r = await ok(c.get("/api/backtrack?flow=flow-make-a-payment&step=3"));
    expect(r.steps.map((s: any) => s.index)).toEqual([1, 2, 3]);
    expect(r.title).toMatch(/^Make a payment: step 3 of/);
    expect(r.steps[0].files.length).toBeGreaterThan(0);
    expect((await c.get(`/api/backtrack?connector=${JOB}&stage=11`)).status).toBe(422);
    expect((await c.get("/api/backtrack?flow=flow-make-a-payment&step=0")).status).toBe(422);
    expect((await c.get("/api/backtrack")).status).toBe(422);
    expect((await c.get(`/api/backtrack?connector=${JOB}&stage=x`)).status).toBe(422);
  });
});
