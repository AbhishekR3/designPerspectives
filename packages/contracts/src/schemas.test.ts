import { describe, expect, it } from "vitest";
import { ElementSidecarSchema, ProvenanceSchema, RelationshipSidecarEntrySchema, CharacteristicsSchema } from "./schemas.js";
import { satisfies } from "./semver.js";
import { isValidElementId, relationshipIdOf } from "./model.js";

describe("schemas", () => {
  it("accepts the element sidecar example from spec file 04 §4.1", () => {
    const r = ElementSidecarSchema.safeParse({
      id: "orders.api",
      owners: ["team-orders"],
      teamType: "stream-aligned",
      status: "accepted",
      provenance: [{ source: "parser-tier1", evidence: ["services/orders/src/api/**"], confidence: 0.9, at: "2026-11-11T10:00:00Z" }],
      characteristics: ["scalability", "availability"],
      quantum: "q-orders",
      risk: { availability: { impact: 3, likelihood: 1, score: 3, direction: "same" } },
      dataClassification: ["pii"],
      sla: { availability: "99.9%" },
      cost: { monthlyEstimate: 420, currency: "USD" },
      tags: ["new"],
      links: { repo: "https://example.invalid/repo" },
    });
    expect(r.success).toBe(true);
  });
  it("rejects unknown keys", () => {
    expect(ElementSidecarSchema.safeParse({ id: "a", ownerz: [] }).success).toBe(false);
  });
  it("requires confirmedBy for llm provenance (FF10)", () => {
    expect(ProvenanceSchema.safeParse({ source: "llm", at: "2026-11-11T10:00:00Z" }).success).toBe(false);
    expect(ProvenanceSchema.safeParse({ source: "llm", confirmedBy: "a@b.c", at: "2026-11-11T10:00:00Z" }).success).toBe(true);
  });
  it("rejects a risk score that is not impact × likelihood", () => {
    expect(ElementSidecarSchema.safeParse({ id: "a", risk: { x: { impact: 2, likelihood: 2, score: 3 } } }).success).toBe(false);
  });
  it("accepts relationship ids with and without a disambiguating key", () => {
    expect(RelationshipSidecarEntrySchema.safeParse({ id: "orders.ui->orders.api#calls" }).success).toBe(true);
    expect(RelationshipSidecarEntrySchema.safeParse({ id: "orders.ui->orders.api#calls:refunds" }).success).toBe(true);
    expect(relationshipIdOf({ source: "a", target: "b", kind: "calls", key: "x" })).toBe("a->b#calls:x");
  });
  it("limits driving characteristics to 7", () => {
    const driving = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, explicit: true }));
    expect(CharacteristicsSchema.safeParse({ driving, top3: [] }).success).toBe(false);
  });
});

describe("ids and semver", () => {
  it("validates element ids", () => {
    expect(isValidElementId("ibs.api.security")).toBe(true);
    expect(isValidElementId("Ibs")).toBe(false);
    expect(isValidElementId("ibs..api")).toBe(false);
    expect(isValidElementId("ibs.api_x")).toBe(false);
  });
  it("checks contract ranges", () => {
    expect(satisfies("0.1.3", "^0.1.0")).toBe(true);
    expect(satisfies("0.2.0", "^0.1.0")).toBe(false);
    expect(satisfies("1.4.0", "^1.2.0")).toBe(true);
    expect(satisfies("2.0.0", "^1.2.0")).toBe(false);
    expect(satisfies("1.2.9", "~1.2.0")).toBe(true);
    expect(satisfies("1.3.0", "~1.2.0")).toBe(false);
    expect(satisfies("3.0.0", ">=1.0.0")).toBe(true);
    expect(satisfies("1.0.0", "1.0.0")).toBe(true);
  });
});
