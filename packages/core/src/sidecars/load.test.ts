import { describe, expect, it } from "vitest";
import type { Diagnostic, SourceFile } from "@designperspectives/contracts";
import { loadSidecars } from "./index.js";
import { CANONICAL_FILES, canonicalFiles } from "./test-fixtures.js";

const load = (files: Record<string, string>) =>
  loadSidecars(Object.entries(files).map(([path, content]) => ({ path, content })));

const brief = (d: Diagnostic) => ({ code: d.code, file: d.file, line: d.line, column: d.column });

describe("loadSidecars — valid sample", () => {
  const { sidecars, diagnostics } = loadSidecars(canonicalFiles());

  it("loads every file type without diagnostics", () => {
    expect(diagnostics).toEqual([]);
    expect(sidecars.settings?.name).toBe("Orders Platform");
    expect(sidecars.permissions?.profiles["architect"]?.capabilities).toEqual(["view", "edit"]);
    expect(sidecars.characteristics?.top3).toEqual(["availability", "scalability"]);
    expect(sidecars.codemapping?.rules).toHaveLength(2);
    expect(sidecars.relationships.map((r) => r.id)).toEqual([
      "orders.api->orders.db#writesTo",
      "orders.api.auth->orders.apix#calls:token",
      "orders.ui->orders.api#calls",
    ]);
    expect(Object.keys(sidecars.elements).sort()).toEqual(["orders.api", "orders.api.auth", "orders.apix"]);
    expect(sidecars.elements["orders.api"]?.risk?.["availability"]?.score).toBe(3);
    expect(sidecars.layouts["orders-containers"]?.nodes["orders.api"]).toEqual({ x: 100, y: 200 });
    expect(sidecars.notes["note-1"]?.frontMatter.type).toBe("question");
    expect(sidecars.notes["note-1"]?.body).toBe("Should the API be split?\n\n  - indented line kept as-is\n");
    expect(sidecars.notes["note-2"]?.body).toBe("");
    expect(sidecars.risk["rs-1"]?.scores).toHaveLength(2);
    expect(sidecars.adrs["ADR-0001"]?.path).toBe("decisions/2026/ADR-0001-use-postgres.md");
    expect(sidecars.adrs["ADR-0001"]?.frontMatter.title).toBe("Use PostgreSQL: orders");
    expect(sidecars.adrs["ADR-0001"]?.body).toBe("# Context\n\nOrders need ACID transactions.\n");
    expect(sidecars.approvals["approvals/ADR-0001.sig.yaml"]?.approver).toBe("carol");
  });

  it("fills Zod defaults on parse", () => {
    expect(sidecars.settings).toMatchObject({ modelBackend: "likec4", decisions: "decisions" });
    expect(sidecars.codemapping?.rules[1]).toMatchObject({ exclude: [], pinned: false });
    expect(sidecars.characteristics?.implicitConsidered).toEqual([]);
    expect(sidecars.characteristics?.driving[1]).toMatchObject({ measures: [], scope: [] });
    expect(sidecars.adrs["ADR-0001"]?.frontMatter).toMatchObject({ supersedes: [], approvals: [], fitnessFunctions: [] });
    expect(sidecars.risk["rs-1"]?.mitigations).toHaveLength(1);
    expect(sidecars.permissions?.decisionRights).toEqual([]);
  });

  it("ignores non-sidecar paths, including sidecars/secure/**", () => {
    const r = loadSidecars([
      ...canonicalFiles(),
      { path: "model/orders.c4", content: "model { this is not yaml: [" },
      { path: "sidecars/secure/secret.yaml", content: "id: [unclosed" },
      { path: "stages/s1.yaml", content: ": :" },
    ]);
    expect(r.diagnostics).toEqual([]);
    expect(r.sidecars).toEqual(sidecars);
  });

  it("is independent of input file order", () => {
    const files = canonicalFiles();
    const broken: SourceFile[] = [
      { path: "sidecars/elements/zz.yaml", content: "id: wrong\n" },
      { path: "sidecars/elements/aa.yaml", content: "id: aa\nstatus: nope\n" },
      { path: "decisions/ADR-0001-dup.md", content: "---\nid: ADR-0001\ntitle: Dup\nstatus: draft\n---\n" },
    ];
    const forward = loadSidecars([...files, ...broken]);
    const backward = loadSidecars([...broken, ...files].reverse());
    expect(backward).toEqual(forward);
    expect(JSON.stringify(backward)).toBe(JSON.stringify(forward));
    expect(forward.diagnostics.length).toBe(3);
  });
});

describe("loadSidecars — diagnostics", () => {
  it("reports a YAML syntax error at its position", () => {
    const r = load({ "sidecars/elements/a.yaml": "id: a\nstatus: accepted: no\ntags: []\n" });
    expect(r.diagnostics).toHaveLength(1);
    expect(r.diagnostics[0]).toMatchObject({ severity: "error", code: "sidecar/syntax", file: "sidecars/elements/a.yaml", line: 2, column: 9 });
    expect(r.sidecars.elements).toEqual({});
  });

  it("reports duplicate mapping keys as syntax errors", () => {
    const r = load({ "sidecars/elements/a.yaml": "id: a\nstatus: accepted\nstatus: proposed\n" });
    expect(r.diagnostics.map(brief)).toEqual([{ code: "sidecar/syntax", file: "sidecars/elements/a.yaml", line: 3, column: 1 }]);
  });

  it("points a schema error at the offending node (wrong enum on line 4 → line 4)", () => {
    const r = load({ "sidecars/relationships.yaml": "- id: a->b#calls\n  mode: sync\n- id: b->c#calls\n  mode: sometimes\n" });
    expect(r.diagnostics).toHaveLength(1);
    expect(r.diagnostics[0]).toMatchObject({ code: "sidecar/schema", file: "sidecars/relationships.yaml", line: 4, column: 9 });
    expect(r.diagnostics[0]?.message).toMatch(/^1\.mode: /);
    expect(r.sidecars.relationships).toEqual([]);
  });

  it("points nested schema errors at the nested node", () => {
    const r = load({
      "sidecars/elements/a.yaml": "id: a\nrisk:\n  availability:\n    impact: 2\n    likelihood: 2\n    score: 3\n",
    });
    expect(r.diagnostics.map(brief)).toEqual([{ code: "sidecar/schema", file: "sidecars/elements/a.yaml", line: 6, column: 12 }]);
    expect(r.diagnostics[0]?.message).toBe("risk.availability.score: score must equal impact × likelihood");
  });

  it("points an unknown key at the key itself", () => {
    const r = load({ "sidecars/elements/a.yaml": "id: a\nowners: []\nownerz: []\n" });
    expect(r.diagnostics.map(brief)).toEqual([{ code: "sidecar/schema", file: "sidecars/elements/a.yaml", line: 3, column: 1 }]);
    expect(r.diagnostics[0]?.message).toContain("ownerz");
  });

  it("falls back to the nearest existing ancestor for a missing key", () => {
    const r = load({ "sidecars/codemapping.yaml": "rules:\n  - element: a\n    language: ts\n" });
    expect(r.diagnostics.map(brief)).toEqual([{ code: "sidecar/schema", file: "sidecars/codemapping.yaml", line: 2, column: 5 }]);
    expect(r.diagnostics[0]?.message).toMatch(/^rules\.0\.include: /);
  });

  it("reports an empty file as a schema error at 1:1", () => {
    const r = load({ "permissions.yaml": "" });
    expect(r.diagnostics.map(brief)).toEqual([{ code: "sidecar/schema", file: "permissions.yaml", line: 1, column: 1 }]);
    expect(r.diagnostics[0]?.message).toMatch(/^\(root\): /);
  });

  it("reports front-matter positions relative to the whole Markdown file", () => {
    const r = load({
      "sidecars/notes/n1.md": "---\nid: n1\nanchor: a\nauthor: me\ncreated: 2026-11-11T10:00:00Z\nstatus: closed\ntype: todo\n---\nbody\n",
    });
    expect(r.diagnostics.map(brief)).toEqual([{ code: "sidecar/schema", file: "sidecars/notes/n1.md", line: 6, column: 9 }]);
  });

  it("reports front-matter syntax errors relative to the whole Markdown file", () => {
    const r = load({ "decisions/ADR-0001-x.md": "---\nid: ADR-0001\ntitle: a: b\n---\nbody\n" });
    expect(r.diagnostics[0]).toMatchObject({ code: "sidecar/syntax", file: "decisions/ADR-0001-x.md", line: 3, column: 8 });
  });

  it("reports missing or unterminated front matter", () => {
    const r = load({ "sidecars/notes/a.md": "no front matter\n", "decisions/ADR-0001-x.md": "---\nid: ADR-0001\n" });
    expect(r.diagnostics.map(brief)).toEqual([
      { code: "sidecar/syntax", file: "decisions/ADR-0001-x.md", line: 1, column: 1 },
      { code: "sidecar/syntax", file: "sidecars/notes/a.md", line: 1, column: 1 },
    ]);
  });

  it("reports file names that do not match the identity key", () => {
    const note = "---\nid: other\nanchor: a\nauthor: me\ncreated: 2026-11-11T10:00:00Z\nstatus: open\ntype: todo\n---\n";
    const r = load({
      "sidecars/elements/foo.yaml": "id: bar\n",
      "sidecars/layout/v1.yaml": "view: v2\nnodes: {}\n",
      "sidecars/risk/r1.yaml": "id: r2\ncriterion: c\nstatus: closed\nparticipants: []\nscores: []\n",
      "sidecars/notes/n1.md": note,
      "decisions/ADR-0002-x.md": "---\nid: ADR-0001\ntitle: T\nstatus: draft\n---\n",
    });
    expect(r.diagnostics.map(brief)).toEqual([
      { code: "sidecar/filename-mismatch", file: "decisions/ADR-0002-x.md", line: 2, column: 5 },
      { code: "sidecar/filename-mismatch", file: "sidecars/elements/foo.yaml", line: 1, column: 5 },
      { code: "sidecar/filename-mismatch", file: "sidecars/layout/v1.yaml", line: 1, column: 7 },
      { code: "sidecar/filename-mismatch", file: "sidecars/notes/n1.md", line: 2, column: 5 },
      { code: "sidecar/filename-mismatch", file: "sidecars/risk/r1.yaml", line: 1, column: 5 },
    ]);
    expect(r.diagnostics[1]).toMatchObject({ subject: "bar", message: 'id: "bar" does not match file name "foo.yaml"' });
    expect(r.sidecars).toMatchObject({ elements: {}, layouts: {}, risk: {}, notes: {}, adrs: {} });
  });

  it("reports duplicate relationship ids and keeps the first", () => {
    const r = load({
      "sidecars/relationships.yaml": "- id: a->b#calls\n  mode: sync\n- id: b->c#calls\n- id: a->b#calls\n  mode: async\n",
    });
    expect(r.diagnostics.map(brief)).toEqual([{ code: "sidecar/duplicate-id", file: "sidecars/relationships.yaml", line: 4, column: 7 }]);
    expect(r.diagnostics[0]?.subject).toBe("a->b#calls");
    expect(r.sidecars.relationships).toEqual([
      { id: "a->b#calls", mode: "sync" },
      { id: "b->c#calls" },
    ]);
  });

  it("reports duplicate ADR ids across the decisions folder", () => {
    const adr = "---\nid: ADR-0001\ntitle: T\nstatus: draft\n---\n";
    const r = load({ "decisions/b/ADR-0001-x.md": adr, "decisions/a/ADR-0001-y.md": adr });
    expect(r.diagnostics.map(brief)).toEqual([{ code: "sidecar/duplicate-id", file: "decisions/b/ADR-0001-x.md", line: 2, column: 5 }]);
    expect(r.sidecars.adrs["ADR-0001"]?.path).toBe("decisions/a/ADR-0001-y.md");
  });

  it("reports a path supplied twice", () => {
    const r = loadSidecars([
      { path: "sidecars/elements/a.yaml", content: "id: a\n" },
      { path: "sidecars/elements/a.yaml", content: "id: a\ntags: [x]\n" },
    ]);
    expect(r.diagnostics.map((d) => d.code)).toEqual(["sidecar/duplicate-id"]);
    expect(r.sidecars.elements["a"]).toEqual({ id: "a" });
  });

  it("loads ADRs from a custom decisions folder", () => {
    const r = load({
      "designperspectives.yaml": "decisions: docs/adr\nname: X\nschemaVersion: 1\n",
      "docs/adr/ADR-0007-x.md": "---\nid: ADR-0007\ntitle: T\nstatus: draft\n---\n",
      "decisions/ADR-0001-x.md": "---\nid: ADR-0001\ntitle: T\nstatus: draft\n---\n",
    });
    expect(r.diagnostics).toEqual([]);
    expect(Object.keys(r.sidecars.adrs)).toEqual(["ADR-0007"]);
  });
});

describe("loadSidecars — robustness", () => {
  it("normalises CRLF line endings", () => {
    const crlf = (s: string) => s.replace(/\n/g, "\r\n");
    const lf = loadSidecars(canonicalFiles());
    const r = loadSidecars(canonicalFiles().map((f) => ({ ...f, content: crlf(f.content) })));
    expect(r.diagnostics).toEqual([]);
    expect(r.sidecars).toEqual(lf.sidecars);
    const bad = load({ "sidecars/elements/a.yaml": crlf("id: a\nstatus: accepted\nteamType: wrong\n") });
    expect(bad.diagnostics.map(brief)).toEqual([{ code: "sidecar/schema", file: "sidecars/elements/a.yaml", line: 3, column: 11 }]);
  });

  it("never throws for hostile content", () => {
    const contents = [
      "",
      "\u0000\u0001",
      "*alias",
      "a: &x [*x]",
      "!!binary aGVsbG8=",
      "!custom {a: 1}",
      "--- a\n--- b\n",
      "%YAML 9.9\n---\nid: a\n",
      "a: &a [1]\nb: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a, *a]\nc: [*b, *b, *b, *b, *b, *b, *b, *b, *b, *b]\nd: [*c, *c, *c, *c, *c, *c, *c, *c, *c, *c]\n",
      "__proto__: {id: a}\n",
      "[1, 2, 3]",
      "\"unterminated",
      "---\n---\n",
      "---\n",
      "x".repeat(10_000),
    ];
    const paths = Object.keys(CANONICAL_FILES);
    for (const content of contents) {
      const files = paths.map((path) => ({ path, content }));
      expect(() => loadSidecars(files)).not.toThrow();
      expect(loadSidecars(files).diagnostics.length).toBeGreaterThan(0);
    }
  });
});
