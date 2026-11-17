/** Reading findings reports (SARIF, code quality, SonarQube, dp) into linked work, and mapping a file to the deepest element that holds it. */

import { describe, expect, it } from "vitest";
import { WORK_IMPORT_SCHEMA, parseWorkReport, reportPath } from "../../src/core/workImport.js";
import { ModelError } from "../../src/core/modelEdits.js";
import { demoWs } from "./helpers.js";

const ws = demoWs();
const parse = (format: string, doc: unknown) => parseWorkReport(format, typeof doc === "string" ? doc : JSON.stringify(doc), ws);
const sarif = (results: unknown[], rules: unknown[] = []) => ({ version: "2.1.0", runs: [{ tool: { driver: { name: "t", rules } }, results }] });
const at = (uri: string, startLine?: number) => [{ physicalLocation: { artifactLocation: { uri }, region: startLine ? { startLine } : undefined } }];

describe("sarif", () => {
  it("reads the title, severity, type, key, link and where it was found", () => {
    const r = parse(
      "sarif",
      sarif(
        [{ ruleId: "py/sql", level: "note", message: { text: "SQL injection\nmore lines" }, partialFingerprints: { a: "fp-1" }, locations: at("file://./sample_code/api/sign_in.py", 12) }],
        [{ id: "py/sql", helpUri: "https://example.com/r", properties: { tags: ["security"], "security-severity": "9.5" } }],
      ),
    );
    expect(r.unmapped).toBe(0);
    expect(r.pushes).toEqual([
      {
        to: { type: "element", id: "sign-in-controller" },
        item: { type: "security", title: "SQL injection", status: "open", key: "fp-1", severity: "critical", url: "https://example.com/r", remote: "py/sql · sample_code/api/sign_in.py:12" },
      },
    ]);
  });

  it("maps level and security-severity to a severity, and the security tag to the type", () => {
    const rules = [
      { id: "tagged", properties: { tags: ["security", "x"] } },
      { id: "cvss", properties: { "security-severity": "7.0" } },
    ];
    const items = parse(
      "sarif",
      sarif(
        [
          { ruleId: "a", level: "error", message: { text: "e" } },
          { ruleId: "a", level: "warning", message: { text: "w" } },
          { ruleId: "a", level: "none", message: { text: "n" } },
          { ruleId: "tagged", level: "warning", message: { text: "t" } },
          { ruleId: "cvss", message: { text: "c" } },
          { ruleId: "a", message: { text: "m" }, properties: { "security-severity": "5" } },
          { ruleId: "a", message: { text: "l" }, properties: { "security-severity": "2.5" } },
        ],
        rules,
      ),
    ).pushes.map((p) => [p.item.title, p.item.severity, p.item.type]);
    expect(items).toEqual([
      ["e", "high", "issue"],
      ["w", "medium", "issue"],
      ["n", "low", "issue"],
      ["t", "medium", "security"],
      ["c", "high", "security"],
      ["m", "medium", "security"],
      ["l", "low", "security"],
    ]);
  });

  it("makes a key from rule, file and line without a fingerprint, ignores a link that is not http, and drops a repeat in one report", () => {
    const res = { ruleId: "r1", message: { text: "x" }, locations: at("sample_code/api/store.py", 3) };
    const r = parse("sarif", sarif([res, res, { ...res, locations: at("sample_code/api/store.py", 4) }], [{ id: "r1", helpUri: "file:///docs" }]));
    expect(r.pushes.map((p) => p.item.key)).toEqual(["r1:sample_code/api/store.py:3", "r1:sample_code/api/store.py:4"]);
    expect(r.pushes[0]!.item.url).toBeUndefined();
  });

  it("trims a long title to one line of at most 200 characters", () => {
    const t = parse("sarif", sarif([{ ruleId: "r", message: { text: `  ${"x".repeat(300)}\nsecond` } }])).pushes[0]!.item.title!;
    expect(t.length).toBe(200);
    expect(t.endsWith("…")).toBe(true);
  });
});

describe("gitlab-codequality", () => {
  it("reads description, severity, fingerprint and path", () => {
    const r = parse("gitlab-codequality", [
      { description: "Unused import", check_name: "unused", fingerprint: "f1", severity: "minor", location: { path: "sample_code/payments/validator.ts", lines: { begin: 3 } } },
      { description: "Bad", fingerprint: "f2", severity: "blocker", location: { path: "elsewhere/x.ts" } },
      { description: "Meh", fingerprint: "f3", severity: "info", location: { path: "./sample_code/payments/validator.ts" } },
      { description: "Big", fingerprint: "f4", severity: "major", location: { path: "sample_code/payments/validator.ts" } },
    ]);
    expect(r.unmapped).toBe(1);
    expect(r.pushes.map((p) => [p.item.key, p.item.severity, p.item.type, p.to])).toEqual([
      ["f1", "medium", "issue", { type: "element", id: "payment-validator" }],
      ["f2", "critical", "issue", { type: "project" }],
      ["f3", "low", "issue", { type: "element", id: "payment-validator" }],
      ["f4", "high", "issue", { type: "element", id: "payment-validator" }],
    ]);
    expect(r.pushes[0]!.item.remote).toBe("unused · sample_code/payments/validator.ts:3");
  });

  it("refuses a report that is not a list", () => {
    expect(() => parse("gitlab-codequality", { issues: [] })).toThrow(/JSON list/);
  });
});

describe("sonar-issues", () => {
  it("takes the path after the first colon, the key of the issue and VULNERABILITY as security", () => {
    const r = parse("sonar-issues", {
      issues: [
        { key: "AY1", rule: "py:S1", message: "Hash", severity: "BLOCKER", type: "VULNERABILITY", component: "proj:sample_code/api/security.py", line: 9 },
        { key: "AY2", rule: "py:S2", message: "Smell", severity: "INFO", type: "CODE_SMELL", component: "proj:sample_code/pipeline/mask_pii.py" },
        { key: "AY3", rule: "py:S3", message: "Bug", severity: "MAJOR", type: "BUG", component: "proj:nothing/here.py" },
      ],
    });
    expect(r.unmapped).toBe(1);
    expect(r.pushes.map((p) => [p.item.key, p.item.severity, p.item.type])).toEqual([
      ["AY1", "critical", "security"],
      ["AY2", "low", "issue"],
      ["AY3", "high", "issue"],
    ]);
    expect(r.pushes[1]!.to).toEqual({ type: "element", id: "pii-masker" });
  });

  it("needs an issues list", () => {
    expect(() => parse("sonar-issues", { total: 0 })).toThrow(/issues/);
  });
});

describe("dp", () => {
  it("takes a list or an object with items, and the target as an object or as text", () => {
    const items = [
      { to: "element:api-application", item: { title: "A" } },
      { to: { type: "project" }, item: { title: "B", type: "backlog" } },
      { to: "flow-sign-in", item: { title: "C" } },
    ];
    for (const doc of [items, { items }]) {
      const r = parse("dp", doc);
      expect(r.unmapped).toBe(0);
      expect(r.pushes.map((p) => p.to)).toEqual([{ type: "element", id: "api-application" }, { type: "project" }, { type: "diagram", id: "flow-sign-in" }]);
    }
  });

  it("refuses an entry without a target or an item, and a target the model does not have", () => {
    expect(() => parse("dp", [{ item: { title: "x" } }])).toThrow(/Item 1.*"to"/);
    expect(() => parse("dp", [{ to: "project" }])).toThrow(/Item 1/);
    expect(() => parse("dp", [{ to: "no-such-thing", item: { title: "x" } }])).toThrow(/not an element/);
    expect(() => parse("dp", { nope: 1 })).toThrow(/items/);
  });

  it("has a schema that names the formats of an item", () => {
    expect(WORK_IMPORT_SCHEMA.$defs.push.properties.item.properties).toHaveProperty("severity");
    expect(WORK_IMPORT_SCHEMA.$defs.push.required).toEqual(["to", "item"]);
  });
});

describe("strictness", () => {
  it("says what is wrong with bad JSON, an unknown format and a report that is too big or has too many findings", () => {
    expect(() => parse("sarif", "{not json")).toThrow(/not valid JSON/);
    expect(() => parse("sarif", "{not json")).toThrow(ModelError);
    expect(() => parse("csv", "[]")).toThrow(/Unknown format "csv"/);
    expect(() => parseWorkReport("sarif", " ".repeat(20_000_001), ws)).toThrow(/20 MB/);
    const many = Array.from({ length: 5001 }, (_, i) => ({ ruleId: "r", message: { text: `m${i}` } }));
    expect(() => parse("sarif", sarif(many))).toThrow(/5001 findings.*at most 5000/);
  });

  it("an empty report has nothing to push", () => {
    expect(parse("sarif", { version: "2.1.0", runs: [] })).toEqual({ pushes: [], unmapped: 0 });
  });
});

describe("mapping a file to an element", () => {
  const to = (file: string) => parse("gitlab-codequality", [{ description: "d", fingerprint: "k", location: { path: file } }]).pushes[0]!.to;

  it("a file path or a folder path matches on a whole segment", () => {
    expect(to("sample_code/pipeline/consume.py")).toEqual({ type: "element", id: "event-consumer" });
    expect(to("sample_code/pipeline/consume.pyc")).toEqual({ type: "project" });
    expect(to("sample_code/pipeline")).toEqual({ type: "project" }); // a folder holding the elements' files is not itself held
  });

  it("the most specific path wins, then the deeper element", () => {
    const w = structuredClone(ws);
    const walk = (els: any[]): any[] => els.flatMap((e) => [e, ...walk(e.containers ?? []), ...walk(e.components ?? [])]);
    const all = walk(w.model.softwareSystems as any[]);
    const set = (id: string, paths: string[]) => {
      const e = all.find((x) => x.id === id);
      e.properties = { ...e.properties, "dp.code.paths": JSON.stringify(paths) };
    };
    set("pipeline-worker", ["sample_code/pipeline"]);
    set("pii-masker", ["sample_code/pipeline/mask_pii.py"]);
    set("event-consumer", ["sample_code/pipeline/consume.py"]);
    set("analytics-platform", ["sample_code"]);
    const where = (f: string) => parseWorkReport("gitlab-codequality", JSON.stringify([{ description: "d", fingerprint: "k", location: { path: f } }]), w).pushes[0]!.to;
    expect(where("sample_code/pipeline/mask_pii.py")).toEqual({ type: "element", id: "pii-masker" });
    expect(where("sample_code/pipeline/other.py")).toEqual({ type: "element", id: "pipeline-worker" });
    expect(where("sample_code/misc.py")).toEqual({ type: "element", id: "analytics-platform" });
    // The same path on a parent and a child: the child wins.
    set("pipeline-worker", ["sample_code/pipeline/load_warehouse.py"]);
    set("warehouse-loader", ["sample_code/pipeline/load_warehouse.py"]);
    expect(where("sample_code/pipeline/load_warehouse.py")).toEqual({ type: "element", id: "warehouse-loader" });
  });

  it("reportPath drops file://, ./, a %SRCROOT% prefix and backslashes", () => {
    expect(reportPath("file://./a/b.py")).toBe("a/b.py");
    expect(reportPath("%SRCROOT%/a/b.py")).toBe("a/b.py");
    expect(reportPath("a\\b\\c.py")).toBe("a/b/c.py");
    expect(reportPath("a%20b/c.py")).toBe("a b/c.py");
    expect(reportPath("")).toBeNull();
    expect(reportPath(undefined)).toBeNull();
  });
});
