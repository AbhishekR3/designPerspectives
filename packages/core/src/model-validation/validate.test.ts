import type { Model } from "@designperspectives/contracts";
import { describe, expect, it } from "vitest";
import { RULES, validateModel } from "./index.js";
import { sample, sampleWith } from "./test-support.js";

/** Deterministic Fisher-Yates shuffle (mulberry32 PRNG). */
function shuffled<T>(items: readonly T[], seed: number): T[] {
  let state = seed;
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function shuffleModel(m: Model, seed: number): Model {
  return {
    elements: shuffled(m.elements, seed),
    relationships: shuffled(m.relationships, seed + 1),
    deploymentNodes: shuffled(m.deploymentNodes, seed + 2),
    deploymentInstances: shuffled(m.deploymentInstances, seed + 3),
    views: shuffled(m.views, seed + 4),
  };
}

/** A model that trips many rules at once. */
function brokenModel(): Model {
  return sampleWith((m) => {
    m.elements.push(
      { id: "Bad", kind: "person", title: "" },
      { id: "zeta", kind: "softwareSystem", title: "GL System", description: "Posts KYC checks." },
      { id: "alpha", kind: "softwareSystem", title: "Ledger", description: "The GL." },
      { id: "ibs.db.table", kind: "component", title: "Table" },
      { id: "ghost.api", kind: "container", title: "API" },
    );
    m.relationships.push(
      { source: "ibs.api", target: "ibs.spa", kind: "calls", label: "uses" },
      { source: "zeta", target: "alpha", kind: "sendsTo", label: "Sends ACH files" },
      { source: "alpha", target: "zeta", kind: "sendsTo", label: "Sends replies to" },
      { source: "ibs.api", target: "nowhere", kind: "calls", label: "" },
    );
    m.deploymentNodes.push({ id: "staging.web", kind: "deploymentNode", title: "Web" });
    m.deploymentInstances.push({ id: "live.db", of: "ibs.api.security" });
    m.views.push(
      { id: "dyn", type: "dynamic", title: "Sign in", include: [], steps: [{ source: "ibs.spa", target: "ibs.db", label: "Reads" }] },
      { id: "cmp", type: "component", title: "Component View: X", scope: "ibs", include: ["*"] },
      { id: "cmp", type: "component", title: "Component View: Y", scope: "ibs.api", include: ["*"] },
      { id: "dyn2", type: "dynamic", title: "Dynamic View: Empty", scope: "ibs", include: [] },
    );
  });
}

describe("validateModel", () => {
  it("reports no errors, warnings or acronym infos for the contract sample model", () => {
    const ds = validateModel(sample());
    expect(ds.filter((d) => d.severity !== "info")).toEqual([]);
    expect(ds.filter((d) => d.code === "notation/acronym")).toEqual([]);
    expect(ds).toEqual([]);
  });

  it("returns diagnostics with subject and source but no file position", () => {
    const ds = validateModel(brokenModel());
    expect(ds.length).toBeGreaterThan(15);
    for (const d of ds) {
      expect(d.subject).toBeTypeOf("string");
      expect(d.source).toMatch(/^\[.+\]$/);
      expect(d.file).toBeUndefined();
      expect(d.line).toBeUndefined();
      expect(d.message).not.toContain("!");
    }
  });

  it("is deterministic across runs and input order", () => {
    const expected = validateModel(brokenModel());
    expect(validateModel(brokenModel())).toEqual(expected);
    for (const seed of [1, 7, 42, 1234]) {
      expect(validateModel(shuffleModel(brokenModel(), seed))).toEqual(expected);
    }
  });

  it("does not mutate the model", () => {
    const m = brokenModel();
    const before = JSON.stringify(m);
    validateModel(m);
    expect(JSON.stringify(m)).toBe(before);
  });

  it("exposes rules with unique codes, sources and descriptions", () => {
    const codes = RULES.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.sort()).toEqual([
      "model/allowed-parent",
      "model/deployment",
      "model/description-required",
      "model/duplicate-id",
      "model/id-format",
      "model/missing-parent",
      "model/relationship-endpoint",
      "model/technology-required",
      "model/title-required",
      "notation/acronym",
      "relationship/bidirectional",
      "relationship/label-required",
      "relationship/preposition",
      "relationship/technology-required",
      "relationship/vague-label",
      "view/dynamic-steps",
      "view/dynamic-unmodelled",
      "view/scope",
      "view/title-format",
    ]);
    for (const r of RULES) {
      expect(r.source).toBeTruthy();
      expect(r.description).toBeTruthy();
    }
  });

  it("covers every rule code in the broken model", () => {
    const seen = new Set(validateModel(brokenModel()).map((d) => d.code));
    expect([...RULES.map((r) => r.code)].filter((c) => !seen.has(c))).toEqual([]);
  });
});
