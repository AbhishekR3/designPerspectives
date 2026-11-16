/** Stage S5: `dp scan` and `dp import`. */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ImportFile } from "../src/shared/types.js";
import { demoDir, tmpDir } from "./helpers.js";
import { sampleImport } from "./import-fixture.js";

const tsx = path.resolve("node_modules", ".bin", "tsx");
const dp = (...args: string[]) => spawnSync(tsx, ["src/cli.ts", ...args], { encoding: "utf-8" });
const importDir = (dir: string) => path.join(dir, "architecture", "import");

/** Write an import file into a fresh temp folder; returns its path. */
function fileOf(f: ImportFile | string): string {
  const p = path.join(tmpDir(), "import.json");
  fs.writeFileSync(p, typeof f === "string" ? f : JSON.stringify(f));
  return p;
}
const c2 = (): ImportFile => ({ ...sampleImport(), level: "c2" });
const draftIds = (dir: string) => {
  const d = path.join(dir, "architecture", "drafts");
  return fs.existsSync(d) ? fs.readdirSync(d).sort() : [];
};

describe("dp scan", () => {
  it("writes the evidence and the analysis, and with --plan prints the readiness table", () => {
    const dir = demoDir();
    const r = dp("scan", dir, "--plan");
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^Scanned \d+ files/);
    expect(r.stdout).toMatch(/^Level +Candidates +Decided +Left +State$/m);
    for (const l of ["C1", "C2", "C3", "C4"]) expect(r.stdout).toMatch(new RegExp(`^${l} +\\d+ +\\d+ +\\d+ +`, "m"));
    expect(r.stdout).toContain("Recommendation:");
    expect(r.stdout).toContain("What the scan cannot see:");
    expect(r.stdout).toMatch(/^Total /m);
    expect(fs.existsSync(path.join(importDir(dir), "evidence.json"))).toBe(true);
    expect(fs.existsSync(path.join(importDir(dir), "analysis.json"))).toBe(true);
    // Without --plan the table is left out.
    expect(dp("scan", dir).stdout).not.toContain("Recommendation:");
  });

  it("with --prompt writes the handoff files for the first level that is not final", () => {
    const dir = demoDir();
    const r = dp("scan", dir, "--prompt");
    expect(r.status, r.stderr).toBe(0);
    const folder = path.join(importDir(dir), "handoff");
    for (const f of ["prompt.md", "handoff.json", "schema.json", "evidence-digest.md", "intake.json"]) expect(fs.existsSync(path.join(folder, f)), f).toBe(true);
    expect(r.stdout).toContain("Read architecture/import/handoff/prompt.md and follow it");
    expect(JSON.parse(fs.readFileSync(path.join(importDir(dir), "handoff-request.json"), "utf-8"))).toMatchObject({ task: "import-level", level: "c1" });

    // C1 final: the next one is C2; an explicit level wins.
    fs.writeFileSync(path.join(importDir(dir), "levels.json"), JSON.stringify({ c1: true, c2: false, c3: false, c4: false }));
    expect(dp("scan", dir, "--prompt").status).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(importDir(dir), "handoff-request.json"), "utf-8")).level).toBe("c2");
    expect(dp("scan", dir, "--prompt", "--level", "c1").status).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(importDir(dir), "handoff-request.json"), "utf-8")).level).toBe("c1");
  });

  it("C3 needs a container, and everything final leaves nothing to ask", () => {
    const dir = demoDir();
    const bare = dp("scan", dir, "--prompt", "--level", "c3");
    expect(bare.status).toBe(1);
    expect(bare.stderr).toMatch(/container/);
    expect(dp("scan", dir, "--prompt", "--level", "c3", "--container", "api-application").status).toBe(0);
    expect(dp("scan", dir, "--level", "c2").status).toBe(1); // --level only with --prompt
    fs.writeFileSync(path.join(importDir(dir), "levels.json"), JSON.stringify({ c1: true, c2: true, c3: true, c4: false }));
    const done = dp("scan", dir, "--prompt");
    expect(done.status).toBe(1);
    expect(done.stderr).toMatch(/all final/);
  });

  it("--json prints the summary, the analysis and the handoff without the prompt text; a bad intake and no model are refused", () => {
    const dir = demoDir();
    const r = dp("scan", dir, "--json", "--prompt", "--level", "c2");
    expect(r.status, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.evidence.files.total).toBeGreaterThan(20);
    expect(out.analysis.levels).toHaveLength(4);
    expect(out.handoff.task).toBe("import-level");
    expect(out.handoff.prompt).toBeUndefined();
    expect(JSON.parse(dp("scan", dir, "--json").stdout).handoff).toBeNull();

    fs.writeFileSync(path.join(importDir(dir), "intake.json"), '{"depth": "c9"}');
    const bad = dp("scan", dir);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/intake/);
    expect(dp("scan", tmpDir()).status).toBe(2);
  });

  it("dp check --strict still passes on the demo after a scan", () => {
    const dir = tmpDir();
    expect(dp("init", "--demo", dir).status).toBe(0);
    expect(dp("check", "--strict", dir).status).toBe(0);
    expect(dp("scan", dir).status).toBe(0);
    const r = dp("check", "--strict", dir);
    expect(r.status, r.stdout).toBe(0);
  });
});

describe("dp import", () => {
  it("--schema prints the JSON Schema of the import file", () => {
    const r = dp("import", "--schema");
    expect(r.status, r.stderr).toBe(0);
    const schema = JSON.parse(r.stdout);
    expect(schema.type).toBe("object");
    expect(Object.keys(schema.properties)).toEqual(expect.arrayContaining(["schemaVersion", "objects", "relationships"]));
  });

  it("--check validates only: exit 1 on errors, warnings printed, nothing created", () => {
    const dir = demoDir();
    const good = dp("import", fileOf(c2()), dir, "--check");
    expect(good.status, good.stderr + good.stdout).toBe(0);
    expect(good.stdout).toMatch(/^OK/m);
    const bad = c2();
    bad.objects[0]!.parent = "no-such-system";
    const r = dp("import", fileOf(bad), dir, "--check");
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/^- \/objects\/0/m);
    expect(dp("import", fileOf("{ nope"), dir, "--check").status).toBe(1);
    expect(dp("import", path.join(tmpDir(), "missing.json"), dir, "--check").status).toBe(1);
    expect(dp("import", undefined as unknown as string).status).toBe(1);
    expect(draftIds(dir)).toEqual([]);
  });

  it("makes a draft, prints its id, the report and how many items need an explicit accept", () => {
    const dir = demoDir();
    const r = dp("import", fileOf(c2()), dir, "--title", "From the CLI");
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(r.stdout).toContain('Created draft "From the CLI" (from-the-cli).');
    expect(r.stdout).toMatch(/created \d+, updated \d+, kept your edit 0, kept the model's value 0, not in this import 0, unchanged 0/);
    expect(r.stdout).toMatch(/\d+ items? needs? an explicit accept/);
    expect(draftIds(dir)).toEqual(["from-the-cli"]);
    expect(fs.existsSync(path.join(importDir(dir), "reviews", "from-the-cli.json"))).toBe(true);
    // Default titles do not clash.
    expect(dp("import", fileOf(c2()), dir).stdout).toContain('Created draft "Import C2" (import-c2).');
    expect(dp("import", fileOf(c2()), dir).stdout).toContain('Created draft "Import C2 (2)"');
    // An explicit title that is taken is refused by the draft rule.
    const taken = dp("import", fileOf(c2()), dir, "--title", "Import C2");
    expect(taken.status).toBe(1);
    expect(taken.stderr).toMatch(/already exists/);
  });

  it("a file with errors makes no draft and exits 1", () => {
    const dir = demoDir();
    const bad = c2();
    bad.relationships[0]!.description = "uses";
    const r = dp("import", fileOf(bad), dir);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("The import file was refused");
    expect(draftIds(dir)).toEqual([]);
  });

  it("help texts name the new options", () => {
    expect(dp("scan", "--help").stdout).toMatch(/--plan[\s\S]*--prompt[\s\S]*--level[\s\S]*--json/);
    expect(dp("import", "--help").stdout).toMatch(/--check[\s\S]*--title[\s\S]*--schema/);
    expect(dp("--help").stdout).toMatch(/^ {2}scan /m);
    expect(dp("--help").stdout).toMatch(/^ {2}import /m);
  });
});
