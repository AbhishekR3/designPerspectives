/** The import file (DEC-051): the schema, the reader, and the checks that need no LLM. One fixture per error. */

import path from "node:path";
import { describe, expect, it } from "vitest";
import { DiskCode } from "../../src/core/codeFiles.js";
import { Project } from "../../src/core/project.js";
import { checkImport } from "../../src/import/checks.js";
import { IMPORT_SCHEMA, MAX_FILE_BYTES, MAX_OBJECTS, parseImportFile } from "../../src/import/schema.js";
import { secretLike } from "../../src/shared/secretFields.js";
import type { FieldError, ImportFile } from "../../src/shared/types.js";
import { demoDir } from "./helpers.js";
import { sampleImport } from "./importFixture.js";

type Mutate = (f: any) => void;

function parsed(mutate: Mutate = () => {}): { file?: ImportFile; errors: FieldError[] } {
  const f = sampleImport();
  mutate(f);
  return parseImportFile(JSON.stringify(f));
}

function demo() {
  const dir = demoDir();
  return { dir, main: new Project(dir), code: new DiskCode(dir) };
}

describe("parseImportFile", () => {
  it("reads a valid file", () => {
    const r = parsed();
    expect(r.errors).toEqual([]);
    expect(r.file?.objects.map((o) => o.id)).toEqual(["ledger-service", "ledger-events"]);
  });

  const cases: [string, Mutate | string, string, RegExp][] = [
    ["not JSON", "{ nope", "", /Not valid JSON/],
    ["too large", "x".repeat(MAX_FILE_BYTES + 1), "", /at most 2097152 bytes/],
    ["unknown top-level field", (f) => (f.group = "x"), "/group", /Unknown field "group"\. Allowed here: schemaVersion/],
    ["unknown field in an object", (f) => (f.objects[0].inferred = true), "/objects/0/inferred", /Unknown field "inferred"/],
    ["unknown field in evidence", (f) => (f.objects[0].evidence[0].url = "x"), "/objects/0/evidence/0/url", /Unknown field "url"/],
    ["missing required field", (f) => delete f.objects[1].name, "/objects/1/name", /"name" is required/],
    ["missing top-level list", (f) => delete f.relationships, "/relationships", /"relationships" is required/],
    ["wrong type", (f) => (f.objects[0].name = 5), "/objects/0/name", /Must be text/],
    ["not in the list of types", (f) => (f.objects[0].type = "service"), "/objects/0/type", /Must be one of: person, system, container, component/],
    ["schema version", (f) => (f.schemaVersion = 2), "/schemaVersion", /Must be 1/],
    ["level", (f) => (f.level = "c4"), "/level", /Must be one of: c1, c2, c3, all/],
    ["ID pattern", (f) => (f.objects[0].id = "Ledger_Service"), "/objects/0/id", /Not a usable ID/],
    ["blank name", (f) => (f.objects[0].name = "  "), "/objects/0/name", /Must not be empty/],
    ["string too long", (f) => (f.objects[0].description = "x".repeat(2001)), "/objects/0/description", /At most 2000 characters/],
    ["evidence text too long", (f) => (f.objects[0].evidence[0].text = "x".repeat(301)), "/objects/0/evidence/0/text", /At most 300 characters/],
    ["evidence kind", (f) => (f.objects[0].evidence[0].kind = "url"), "/objects/0/evidence/0/kind", /Must be one of: file, user, scan/],
    ["evidence lines", (f) => (f.objects[0].evidence[0].lines = [3]), "/objects/0/evidence/0/lines", /At least 2 items/],
    ["evidence line number", (f) => (f.objects[0].evidence[0].lines = [0, 2]), "/objects/0/evidence/0/lines/0", /at least 1/],
    ["tag value type", (f) => (f.objects[0].tags = { Risk: 1 }), "/objects/0/tags/Risk", /Must be text/],
    ["pointer escaping", (f) => (f.objects[0].tags = { "a/b~c": 1 }), "/objects/0/tags/a~1b~0c", /Must be text/],
    ["confidence", (f) => (f.relationships[0].confidence = "sure"), "/relationships/0/confidence", /Must be one of: high, medium, low/],
    ["connector kind", (f) => (f.relationships[0].kind = "rpc"), "/relationships/0/kind", /Must be one of: sync-api/],
    ["decision status", (f) => (f.decisions[0].status = "accepted"), "/decisions/0/status", /Must be "proposed"/],
    ["flow step field", (f) => (f.flows[0].steps[0].rel = "x"), "/flows/0/steps/0/rel", /Unknown field "rel"/],
    ["too many objects", (f) => (f.objects = Array.from({ length: MAX_OBJECTS + 1 }, (_, i) => ({ id: `o-${i}`, type: "person", name: `P${i}` }))), "/objects", /At most 5000 items/],
  ];
  for (const [name, change, at, message] of cases) {
    it(`refuses: ${name}`, () => {
      const r = typeof change === "string" ? parseImportFile(change) : parsed(change);
      expect(r.file).toBeUndefined();
      const hit = r.errors.find((e) => e.pointer === at);
      expect(hit, JSON.stringify(r.errors)).toBeDefined();
      expect(hit!.message).toMatch(message);
    });
  }

  it("reports every error, each with a pointer", () => {
    const r = parsed((f) => {
      f.objects[0].foo = 1;
      f.objects[1].type = "x";
      f.relationships[0].description = 3;
    });
    expect(r.errors.map((e) => e.pointer)).toEqual(["/objects/0/foo", "/objects/1/type", "/relationships/0/description"]);
  });
});

// ------------------------------------------------------------------ the reader and the shipped schema agree

type Schema = Record<string, any>;
const defs = IMPORT_SCHEMA.$defs as Record<string, Schema>;
const deref = (s: Schema): Schema => (s.$ref ? defs[String(s.$ref).replace("#/$defs/", "")]! : s);

/** Every object schema reachable from the root, by a path like "objects[].evidence[](file)". */
function objectSchemas(s0: Schema, at: string, out: Map<string, Schema>): void {
  const s = deref(s0);
  if (s.oneOf) {
    for (const b of s.oneOf as Schema[]) objectSchemas(b, `${at}(${b.properties.kind.const})`, out);
    return;
  }
  if (s.type === "object" && s.properties) {
    out.set(at, s);
    for (const [k, v] of Object.entries(s.properties as Record<string, Schema>)) objectSchemas(v, at ? `${at}.${k}` : k, out);
  }
  if (s.type === "array" && s.items && typeof s.items === "object") objectSchemas(s.items, `${at}[]`, out);
}

/** The object at `path` in a value (first list item, the evidence item of that kind). */
function objectsAt(v: any, at: string): any[] {
  if (!at) return [v];
  let cur: any[] = [v];
  for (const part of at.split(".")) {
    const m = /^([^[(]+)(\[\])?(?:\((\w+)\))?$/.exec(part)!;
    const next: any[] = [];
    for (const c of cur) {
      let x = c?.[m[1]!];
      if (x === undefined) continue;
      const items = m[2] ? (x as any[]) : [x];
      for (x of items) if (!m[3] || x.kind === m[3]) next.push(x);
    }
    cur = next;
  }
  return cur;
}

describe("parseImportFile and IMPORT_SCHEMA agree", () => {
  it("the schema is draft 2020-12 and closed: every object refuses unknown keys (tags is the one map)", () => {
    expect(IMPORT_SCHEMA.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    const all = new Map<string, Schema>();
    objectSchemas(IMPORT_SCHEMA, "", all);
    expect(all.size).toBeGreaterThan(8);
    for (const [at, s] of all) {
      if (at.endsWith("tags")) expect(s.additionalProperties).toMatchObject({ type: "string" });
      else expect(s.additionalProperties, at).toBe(false);
    }
  });

  it("every key of a complete file is in the schema, every schema key is accepted, and every object refuses an unknown key and needs its required ones", () => {
    const file = sampleImport() as any;
    // Complete: every optional field present somewhere.
    file.objects[0].external = undefined;
    file.objects.push({
      id: "auditor",
      type: "person",
      name: "Auditor",
      external: true,
      description: "Reads the ledger.",
      archType: "box",
      owner: "Audit",
      tags: { Tier: "Tier 1" },
      evidence: [{ kind: "scan", fact: "x" }],
      confidence: "high",
      codePaths: [],
    });
    file.relationships[0].id = "api-application--ledger-service";
    file.relationships[0].kind = "sync-api";
    file.relationships[0].codePaths = ["sample_code/api"];
    file.relationships[0].evidence.push({ kind: "file", path: "a.py", lines: [1, 2], text: "t" }, { kind: "user", note: "n" });
    file.flows[0].description = "d";
    file.objects[0].evidence.push({ kind: "user", note: "n" }, { kind: "scan", fact: "f" });
    file.objects[1].evidence.push({ kind: "file", path: "a.py" }, { kind: "scan", fact: "f" });
    file.decisions[0].evidence.push({ kind: "file", path: "a.py", lines: [1, 1], text: "t" }, { kind: "scan", fact: "f" });
    file.source.backend = "handoff";
    file.source.model = "m";
    const text = JSON.stringify(file);
    expect(parseImportFile(text).errors).toEqual([]);

    const all = new Map<string, Schema>();
    objectSchemas(IMPORT_SCHEMA, "", all);
    for (const [at, s] of all) {
      const values = objectsAt(JSON.parse(text), at);
      if (at.endsWith("tags")) continue;
      expect(values.length, `the complete file has an object at ${at}`).toBeGreaterThan(0);
      const keys = new Set(values.flatMap((v) => Object.keys(v)));
      const schemaKeys = Object.keys(s.properties);
      // The reverse: each key the schema has appears in the complete file, which the reader accepted.
      for (const k of schemaKeys) expect(keys, `${at}.${k} is in the complete file`).toContain(k);
      for (const k of keys) expect(schemaKeys, `${at}.${k} is in the schema`).toContain(k);
      // Unknown key refused; each required key needed.
      const probe = (change: (o: any) => void) => {
        const f = JSON.parse(text);
        change(objectsAt(f, at)[0]);
        return parseImportFile(JSON.stringify(f)).errors;
      };
      expect(
        probe((o) => (o.zzUnknown = 1)).some((e) => e.message.startsWith('Unknown field "zzUnknown"')),
        at,
      ).toBe(true);
      for (const k of s.required ?? []) {
        // In an evidence item, `kind` picks the branch: without it, the error names the kinds.
        const expected = at.endsWith(")") && k === "kind" ? "Must be one of: file, user, scan." : `"${k}" is required.`;
        expect(
          probe((o) => delete o[k]).some((e) => e.message === expected),
          `${at}.${k}`,
        ).toBe(true);
      }
    }
  });
});

// ------------------------------------------------------------------ checks

function checked(mutate: Mutate = () => {}, setup?: (d: ReturnType<typeof demo>) => void) {
  const d = demo();
  setup?.(d);
  const f = sampleImport() as any;
  mutate(f);
  const r = parseImportFile(JSON.stringify(f));
  expect(r.errors, "the fixture still parses").toEqual([]);
  return checkImport(r.file!, d.main, d.code);
}

describe("checkImport", () => {
  it("passes the sample file, with warnings only for what it rewrites or cannot settle", () => {
    const r = checked();
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([{ pointer: "/objects/0/technologies/0", message: '"typescript" is written "TypeScript" in this project; the import uses "TypeScript".' }]);
  });

  const cases: [string, Mutate, string, RegExp][] = [
    ["object ID not its own slug", (f) => (f.objects[0].id = "ledger--service"), "/objects/0/id", /not a usable ID/],
    ["object ID twice", (f) => (f.objects[1].id = "ledger-service"), "/objects/1/id", /used twice in this file \(also at \/objects\/0\)/],
    ["object ID of a relationship", (f) => (f.objects[1].id = "security-component--database"), "/objects/1/id", /ID of a relationship in the model/],
    ["type differs from the model", (f) => f.objects.push({ id: "atm", type: "person", name: "ATM" }), "/objects/2/type", /already in the model as a softwareSystem/],
    ["person with a parent", (f) => f.objects.push({ id: "clerk", type: "person", name: "Clerk", parent: "atm" }), "/objects/2/parent", /People and systems have no parent/],
    ["container without a parent", (f) => delete f.objects[1].parent, "/objects/1/parent", /needs a parent/],
    ["parent missing", (f) => (f.objects[1].parent = "no-such-system"), "/objects/1/parent", /No element "no-such-system"/],
    ["parent of the wrong kind", (f) => (f.objects[1].parent = "ledger-service"), "/objects/1/parent", /sits inside a system; "ledger-service" is a container/],
    ["moving an existing object", (f) => f.objects.push({ id: "database", type: "container", name: "Database", parent: "analytics-platform" }), "/objects/2/parent", /does not move objects/],
    ["external container", (f) => (f.objects[1].external = true), "/objects/1/external", /Only people and systems are marked external/],
    [
      "technologies on a system",
      (f) => f.objects.push({ id: "ledger-co", type: "system", name: "Ledger Co", technologies: ["Java"] }),
      "/objects/2/technologies",
      /Only containers and components have technologies/,
    ],
    ["unknown tag group", (f) => (f.objects[0].tags = { Colour: "Red" }), "/objects/0/tags/Colour", /no tag group "Colour".*Groups: Risk, Lifecycle, Tier, Hosting/],
    ["unknown tag value", (f) => (f.objects[0].tags = { Risk: "Extreme" }), "/objects/0/tags/Risk", /"Extreme" is not a value of tag group "Risk"\. Values: Low, Medium, High/],
    ["name taken in the same parent", (f) => (f.objects[1].name = "Database"), "/objects/1/name", /The name "Database" is already used here \(by "database"\)/],
    ["name twice in the file", (f) => (f.objects[1].name = "Ledger Service"), "/objects/0/name", /already used here \(by "ledger-events"\)/],
    ["name taken among people and systems", (f) => f.objects.push({ id: "cashpoint", type: "system", name: "ATM" }), "/objects/2/name", /already used here \(by "atm"\)/],
    ["hidden code path", (f) => (f.objects[0].codePaths = [".github/workflows"]), "/objects/0/codePaths/0", /hidden path/],
    ["code path outside", (f) => (f.objects[0].codePaths = ["../elsewhere"]), "/objects/0/codePaths/0", /inside the code folder/],
    ["code path missing", (f) => (f.relationships[0].codePaths = ["sample_code/nope"]), "/relationships/0/codePaths/0", /does not exist in the code folder/],
    ["relationship end missing", (f) => (f.relationships[0].source = "nobody"), "/relationships/0/source", /No element "nobody"/],
    ['"uses"', (f) => (f.relationships[0].description = " Uses "), "/relationships/0/description", /not "uses"/],
    ['"uses" as via label', (f) => (f.relationships[1].viaDescription = "USES"), "/relationships/1/viaDescription", /not "uses"/],
    ["via with an ID", (f) => (f.relationships[1].id = "x--y"), "/relationships/1/id", /leave "id" out/],
    ["via without its label", (f) => delete f.relationships[1].viaDescription, "/relationships/1/viaDescription", /required with "via"/],
    ["via label without via", (f) => (f.relationships[0].viaDescription = "x"), "/relationships/0/viaDescription", /only used with "via"/],
    ["via is an end", (f) => (f.relationships[1].via = "database"), "/relationships/1/via", /must be a third element/],
    ["relationship ID not clean", (f) => (f.relationships[0].id = "api---ledger"), "/relationships/0/id", /not a usable ID/],
    ["relationship ID of an element", (f) => (f.relationships[0].id = "database"), "/relationships/0/id", /ID of an element/],
    [
      "relationship ID twice",
      (f) => ((f.relationships[0].id = "posts"), f.relationships.push({ id: "posts", source: "atm", target: "database", description: "Reads" })),
      "/relationships/2/id",
      /used twice/,
    ],
    ["relationship with itself", (f) => (f.relationships[0].target = "api-application"), "/relationships/0", /with itself/],
    ["relationship with its own parent", (f) => (f.relationships[0].target = "internet-banking-system"), "/relationships/0", /one contains the other/],
    ["relationship twice in the file", (f) => f.relationships.push({ ...f.relationships[0] }), "/relationships/2", /already in this file \(at \/relationships\/0\)/],
    ["explicit ID with other ends than the model's", (f) => (f.relationships[0].id = "security-component--database"), "/relationships/0/id", /an import does not change a relationship's ends/],
    [
      "explicit ID for a relationship the model has under another ID",
      (f) => f.relationships.push({ id: "reads-db", source: "security-component", target: "database", description: "Reads from and writes to" }),
      "/relationships/2",
      /as "security-component--database"; use that ID/,
    ],
    ["flow step unknown", (f) => (f.flows[0].steps[0].relationship = "nope"), "/flows/0/steps/0/relationship", /No relationship "nope"/],
    [
      "flow step ambiguous",
      (f) => f.relationships.push({ source: "api-application", target: "ledger-service", description: "Reads ledger entries from" }),
      "/flows/0/steps/0/relationship",
      /could mean 2 relationships/,
    ],
    ["decision about something unknown", (f) => f.decisions[0].affects.push("nothing-here"), "/decisions/0/affects/2", /No element or relationship "nothing-here"/],
    ["AWS key", (f) => (f.objects[0].description = "Uses key AKIAIOSFODNN7EXAMPLE to sign"), "/objects/0/description", /holds a secret value/],
    ["PEM block", (f) => (f.objects[0].evidence[0].text = "-----BEGIN RSA PRIVATE KEY-----"), "/objects/0/evidence/0/text", /holds a secret value/],
    ["secret field with a value", (f) => (f.questions = ["Is DB_PASSWORD=hunter22 still used?"]), "/questions/0", /holds a secret value/],
    ["long random token", (f) => (f.objects[1].description = "Token aZ3kQ9vB7xT2mL8pR4wE6yU1nC5sD0fG"), "/objects/1/description", /holds a secret value/],
  ];
  for (const [name, change, at, message] of cases) {
    it(`error: ${name}`, () => {
      const r = checked(change);
      const hit = r.errors.find((e) => e.pointer === at && message.test(e.message));
      expect(hit, JSON.stringify(r.errors, null, 1)).toBeDefined();
    });
  }

  it("names and placeholders are not taken for secrets", () => {
    for (const ok of [
      "Reads DB_PASSWORD from the environment",
      "password: <from vault>",
      "API_KEY=${API_KEY}",
      "token: checks expiry",
      "payment-service--payment-gateway-adapter",
      "d41d8cd98f00b204e9800998ecf8427e",
      "123e4567-e89b-12d3-a456-426614174000",
      "PaymentServiceControllerImplementation",
    ]) {
      expect(secretLike(ok), ok).toBeNull();
    }
  });

  it("warns where the code does not show a claimed import, and lists imports with no relationship", () => {
    const d = demo();
    const file: ImportFile = {
      schemaVersion: 1,
      level: "c3",
      objects: [
        { id: "ledger", type: "container", name: "Ledger", parent: "internet-banking-system" },
        { id: "ledger-controller", type: "component", name: "Ledger Controller", parent: "ledger", codePaths: ["sample_code/payments/controller.ts"] },
        { id: "ledger-orchestrator", type: "component", name: "Ledger Orchestrator", parent: "ledger", codePaths: ["sample_code/payments/orchestrator.ts"] },
        { id: "ledger-validator", type: "component", name: "Ledger Validator", parent: "ledger", codePaths: ["sample_code/payments/validator.ts"] },
      ],
      relationships: [
        { source: "ledger-controller", target: "ledger-orchestrator", description: "Hands entries to" },
        { source: "ledger-validator", target: "ledger-controller", description: "Calls back" },
      ],
    };
    const r = checkImport(file, d.main, d.code);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([
      { pointer: "/relationships/1", message: 'No import from the code of "Ledger Validator" to the code of "Ledger Controller" was found; check the relationship and its direction.' },
      {
        pointer: "/objects/2",
        message: 'The code of "Ledger Orchestrator" imports the code of "Ledger Validator" (1 import), but there is no relationship from "Ledger Orchestrator" to "Ledger Validator".',
      },
    ]);
  });

  it("warns about evidence files that are missing, and about code paths when there is no code folder", () => {
    const d = demo();
    const f = sampleImport();
    f.objects[0]!.evidence = [{ kind: "file", path: "sample_code/missing.py", lines: [5, 2] }];
    const r = checkImport(f, d.main, null);
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.pointer)).toEqual(["/objects/0/codePaths/0", "/objects/0/technologies/0", "/objects/0/evidence/0/lines"]);
    const withCode = checkImport(f, d.main, d.code);
    expect(withCode.warnings.map((w) => w.pointer)).toContain("/objects/0/evidence/0/path");
    expect(path.isAbsolute(d.dir)).toBe(true);
  });
});
