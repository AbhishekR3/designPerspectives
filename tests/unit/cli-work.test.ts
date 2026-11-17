/** `dp work list`, `add` and `import`: output, --check writes nothing, --draft writes into the draft, errors exit 1. */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { demoDir, demoWs, tmpDir } from "./helpers.js";
import { Drafts } from "../../src/core/drafts.js";
import { Project } from "../../src/core/project.js";
import { listWork } from "../../src/core/work.js";

const tsx = path.resolve("node_modules", ".bin", "tsx");
const dp = (...args: string[]) => spawnSync(tsx, ["src/cli.ts", ...args], { encoding: "utf-8" });
const workspaceText = (dir: string) => fs.readFileSync(path.join(dir, "architecture", "workspace.json"), "utf-8");
const fileOf = (name: string, text: string) => {
  const p = path.join(tmpDir(), name);
  fs.writeFileSync(p, text);
  return p;
};
const report = (...files: string[]) =>
  JSON.stringify({
    version: "2.1.0",
    runs: [
      {
        tool: { driver: { name: "t" } },
        results: files.map((f, i) => ({
          ruleId: "r",
          level: "error",
          message: { text: `Finding ${i + 1}` },
          partialFingerprints: { a: `fp${i + 1}` },
          locations: [{ physicalLocation: { artifactLocation: { uri: f } } }],
        })),
      },
    ],
  });

describe("dp work add and list", () => {
  it("adds an item, updates it by key, and lists it (not done by default)", () => {
    const dir = demoDir();
    const add = dp("work", "add", dir, "--to", "database", "--title", "Index the audit table", "--type", "backlog", "--severity", "low", "--key", "audit-1", "--source", "script");
    expect(add.status, add.stderr).toBe(0);
    expect(add.stdout).toMatch(/^added 1, updated 0, closed 0, unchanged 0\./);
    expect(add.stdout).toContain("Index the audit table  -> Database");
    const again = dp("work", "add", dir, "--to", "database", "--title", "Index the audit table", "--type", "backlog", "--severity", "low", "--key", "audit-1", "--source", "script");
    expect(again.stdout).toMatch(/^added 0, updated 0, closed 0, unchanged 1\./);

    const list = dp("work", "list", dir);
    expect(list.status, list.stderr).toBe(0);
    expect(list.stdout).toMatch(/^STATUS +SEVERITY +TYPE +TITLE +PINNED TO +LINK$/m);
    expect(list.stdout).toMatch(/^open +low +backlog +Index the audit table +container: Database$/m);

    dp("work", "add", dir, "--to", "database", "--title", "Index the audit table", "--key", "audit-1", "--source", "script", "--status", "done");
    expect(dp("work", "list", dir).stdout).not.toContain("Index the audit table");
    expect(dp("work", "list", dir, "--status", "done").stdout).toContain("Index the audit table");
    const all = JSON.parse(dp("work", "list", dir, "--status", "all", "--json").stdout);
    expect(all.find((r: any) => r.item.key === "script:audit-1")).toMatchObject({ targetKind: "container", label: "Database", item: { status: "done" } });
  });

  it("--check says what would change and writes nothing; a bad target or value exits 1 with the message", () => {
    const dir = demoDir();
    const before = workspaceText(dir);
    const r = dp("work", "add", dir, "--to", "project", "--title", "Plan the release", "--check");
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^Checked \(nothing written\): added 1/);
    expect(workspaceText(dir)).toBe(before);

    const bad = dp("work", "add", dir, "--to", "nonsense", "--title", "x");
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/not an element, a relationship or a diagram/);
    expect(dp("work", "add", dir, "--to", "project", "--title", "x", "--severity", "huge").status).toBe(1);
    expect(workspaceText(dir)).toBe(before);
    expect(dp("work", "list", tmpDir()).status).toBe(2); // no model here
  });
});

describe("dp work import", () => {
  it("imports a SARIF file: a finding goes to the element holding its file, the rest to the project", () => {
    const dir = demoDir();
    const file = fileOf("scan.sarif", report("sample_code/pipeline/mask_pii.py", "somewhere/else.py"));
    const r = dp("work", "import", file, dir, "--format", "sarif", "--source", "scan");
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^added 2, updated 0, closed 0, unchanged 0, unmapped 1\./);
    expect(r.stdout).toContain("Finding 1  -> PII Masker");
    expect(r.stdout).toContain("Finding 2  -> Project");
    const rows = listWork(demoWs(dir), []).rows;
    expect(rows.find((x) => x.item.key === "scan:fp1")!.target).toEqual({ type: "element", id: "pii-masker" });

    // The next import has one finding fewer: --close-missing closes it.
    const next = fileOf("scan2.sarif", report("sample_code/pipeline/mask_pii.py"));
    const c = dp("work", "import", next, dir, "--format", "sarif", "--source", "scan", "--close-missing");
    expect(c.stdout).toMatch(/^added 0, updated 0, closed 1, unchanged 1, unmapped 0\./);
    expect(listWork(demoWs(dir), []).rows.find((x) => x.item.key === "scan:fp2")!.item.status).toBe("done");
    // Without a source there is nothing to close by.
    const noSource = dp("work", "import", next, dir, "--format", "sarif", "--close-missing");
    expect(noSource.status).toBe(1);
    expect(noSource.stderr).toMatch(/needs a source/);
  });

  it("--check writes nothing", () => {
    const dir = demoDir();
    const before = workspaceText(dir);
    const r = dp("work", "import", fileOf("scan.sarif", report("sample_code/api/store.py")), dir, "--format", "sarif", "--check");
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^Checked \(nothing written\): added 1/);
    expect(workspaceText(dir)).toBe(before);
  });

  it("--draft writes into the draft and leaves the main model alone; an unknown draft exits 1", () => {
    const dir = demoDir();
    const id = new Drafts(new Project(dir, null)).create("Findings", "", null, "2026-01-01");
    const before = workspaceText(dir);
    const r = dp("work", "import", fileOf("scan.sarif", report("sample_code/pipeline/mask_pii.py")), dir, "--format", "sarif", "--source", "scan", "--draft", id);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(`Written to draft ${id}.`);
    expect(workspaceText(dir)).toBe(before);
    expect(JSON.parse(dp("work", "list", dir, "--draft", id, "--json").stdout).some((x: any) => x.item.key === "scan:fp1")).toBe(true);
    expect(JSON.parse(dp("work", "list", dir, "--json").stdout).some((x: any) => x.item.key === "scan:fp1")).toBe(false);
    const bad = dp("work", "import", fileOf("scan.sarif", report("a.py")), dir, "--format", "sarif", "--draft", "nope");
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/No draft "nope"/);
  });

  it("refuses bad JSON, a missing file, a missing format and an unknown format; --schema prints the dp format", () => {
    const dir = demoDir();
    const bad = dp("work", "import", fileOf("x.json", "{nope"), dir, "--format", "sarif");
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/not valid JSON/);
    expect(dp("work", "import", path.join(tmpDir(), "missing.json"), dir, "--format", "sarif").stderr).toMatch(/Cannot read/);
    expect(dp("work", "import", fileOf("x.json", "[]"), dir).status).toBe(1);
    expect(dp("work", "import", fileOf("x.json", "[]"), dir, "--format", "csv").status).toBe(1);
    const schema = dp("work", "import", "--schema");
    expect(schema.status, schema.stderr).toBe(0);
    expect(JSON.parse(schema.stdout).title).toMatch(/linked work import/);
    const dpFile = fileOf("work.json", JSON.stringify([{ to: "diagram:flow-sign-in", item: { title: "Flow item" } }]));
    expect(dp("work", "import", dpFile, dir, "--format", "dp").stdout).toContain("Flow item  -> ");
  });
});
