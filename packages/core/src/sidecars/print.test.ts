import { describe, expect, it } from "vitest";
import { emptySidecarSet, loadSidecars, printSidecars } from "./index.js";
import { CANONICAL_FILES, canonicalFiles } from "./test-fixtures.js";

const roundTrip = (files: Record<string, string>) =>
  printSidecars(loadSidecars(Object.entries(files).map(([path, content]) => ({ path, content }))).sidecars);

describe("printSidecars", () => {
  it("FF6: reproduces canonical input byte-for-byte, files sorted by path", () => {
    const printed = printSidecars(loadSidecars(canonicalFiles()).sidecars);
    expect(printed.map((f) => f.path)).toEqual(Object.keys(CANONICAL_FILES).sort());
    for (const file of printed) expect(file.content).toBe(CANONICAL_FILES[file.path]);
  });

  it("is idempotent and independent of input order", () => {
    const once = printSidecars(loadSidecars([...canonicalFiles()].reverse()).sidecars);
    const twice = printSidecars(loadSidecars(once).sidecars);
    expect(twice).toEqual(once);
    expect(once).toEqual(printSidecars(loadSidecars(canonicalFiles()).sidecars));
  });

  it("prints an empty set as no files", () => {
    expect(printSidecars(emptySidecarSet())).toEqual([]);
  });

  it("canonicalises key order (identity key first), relationship order and quoting", () => {
    const printed = roundTrip({
      "sidecars/elements/a.yaml": "tags: ['x']\nstatus: 'accepted'\nid: a\nlinks: {z: '1', b: \"true\"}\n",
      "sidecars/relationships.yaml": "- {mode: sync, id: c->a#calls}\n- id: a->b#calls\n",
      "approvals/x.sig.yaml": `role: r\nsubject: s\nat: 2026-11-12T09:00:00Z\napprover: a\ncontentHash: sha256:${"0".repeat(64)}\n`,
    });
    expect(printed).toEqual([
      {
        path: "approvals/x.sig.yaml",
        content: `subject: s\napprover: a\nat: 2026-11-12T09:00:00Z\ncontentHash: sha256:${"0".repeat(64)}\nrole: r\n`,
      },
      { path: "sidecars/elements/a.yaml", content: 'id: a\nlinks:\n  b: "true"\n  z: "1"\nstatus: accepted\ntags:\n  - x\n' },
      { path: "sidecars/relationships.yaml", content: "- id: a->b#calls\n- id: c->a#calls\n  mode: sync\n" },
    ]);
  });

  it("DEFAULT RULE: values equal to their Zod default are omitted; loading fills them back", () => {
    const explicit = {
      "designperspectives.yaml":
        "schemaVersion: 1\nname: X\nmodelBackend: likec4\ndecisions: decisions\nplugins: []\nthresholds:\n  decisionCostUsd: 5000\n",
      "sidecars/codemapping.yaml": "rules:\n  - element: a\n    include: [src/**]\n    exclude: []\n    pinned: false\n",
      "sidecars/risk/r.yaml": "id: r\ncriterion: c\nstatus: closed\nparticipants: []\nscores: []\nmitigations: []\n",
    };
    const printed = roundTrip(explicit);
    expect(printed).toEqual([
      { path: "designperspectives.yaml", content: "name: X\nschemaVersion: 1\n" },
      { path: "sidecars/codemapping.yaml", content: "rules:\n  - element: a\n    include:\n      - src/**\n" },
      { path: "sidecars/risk/r.yaml", content: "id: r\ncriterion: c\nparticipants: []\nscores: []\nstatus: closed\n" },
    ]);
    const reloaded = loadSidecars(printed).sidecars;
    expect(reloaded.settings).toEqual({
      schemaVersion: 1,
      name: "X",
      modelBackend: "likec4",
      decisions: "decisions",
      plugins: [],
      thresholds: { decisionCostUsd: 5000 },
    });
    expect(reloaded.codemapping?.rules[0]).toEqual({ element: "a", include: ["src/**"], exclude: [], pinned: false });
    // a non-default value inside a defaulted object is kept
    expect(roundTrip({ "designperspectives.yaml": "name: X\nschemaVersion: 1\nthresholds: {decisionCostUsd: 1}\n" })[0]?.content).toBe(
      "name: X\nschemaVersion: 1\nthresholds:\n  decisionCostUsd: 1\n",
    );
  });

  it("does not fold long strings and keeps multi-line strings exact", () => {
    const long = "word ".repeat(60).trim();
    const printed = roundTrip({
      "sidecars/elements/a.yaml": `id: a\nlinks:\n  doc: ${long}\n  multi: "line one\\nline two\\n"\n`,
    });
    const content = printed[0]?.content ?? "";
    expect(content).toContain(`  doc: ${long}\n`);
    expect(loadSidecars(printed).sidecars.elements["a"]?.links).toEqual({ doc: long, multi: "line one\nline two\n" });
    expect(roundTrip(Object.fromEntries(printed.map((f) => [f.path, f.content])))).toEqual(printed);
  });

  it("normalises Markdown: CRLF → LF, exactly one trailing newline, body otherwise byte-for-byte", () => {
    const note = "---\r\nid: n\r\nanchor: a\r\nauthor: me\r\ncreated: 2026-11-11T10:00:00Z\r\nstatus: open\r\ntype: todo\r\n---\r\n  body  \r\n\r\n\ttab\r\n\r\n\r\n";
    const printed = roundTrip({ "sidecars/notes/n.md": note });
    expect(printed).toEqual([
      {
        path: "sidecars/notes/n.md",
        content: "---\nid: n\nanchor: a\nauthor: me\ncreated: 2026-11-11T10:00:00Z\nstatus: open\ntype: todo\n---\n  body  \n\n\ttab\n",
      },
    ]);
  });

  it("prints values of a set built in code, not only loaded ones", () => {
    const set = emptySidecarSet();
    set.relationships.push({ id: "b->a#calls" }, { id: "a->b#calls", mode: undefined });
    set.layouts["v"] = { view: "v", nodes: { "10": { x: 1, y: 2 }, "9": { x: 3, y: 4 }, a: { x: 0, y: 0 } } };
    expect(printSidecars(set)).toEqual([
      { path: "sidecars/layout/v.yaml", content: 'view: v\nnodes:\n  "10":\n    x: 1\n    y: 2\n  "9":\n    x: 3\n    y: 4\n  a:\n    x: 0\n    y: 0\n' },
      { path: "sidecars/relationships.yaml", content: "- id: a->b#calls\n- id: b->a#calls\n" },
    ]);
  });
});
