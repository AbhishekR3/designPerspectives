import type { Relationship } from "@designperspectives/contracts";
import { describe, expect, it } from "vitest";
import { diagnosticsFor, sample, sampleWith, subjectsFor } from "./test-support.js";

function withRelationship(r: Relationship) {
  return sampleWith((m) => {
    m.relationships.push(r);
  });
}

describe("relationship/label-required", () => {
  it("accepts the sample", () => {
    expect(subjectsFor(sample(), "relationship/label-required")).toEqual([]);
  });

  it("reports a blank label", () => {
    const m = withRelationship({ source: "ibs.api", target: "ibs.spa", kind: "sendsTo", label: " ", technology: "WebSocket" });
    expect(subjectsFor(m, "relationship/label-required")).toEqual(["ibs.api->ibs.spa#sendsTo"]);
    expect(subjectsFor(m, "relationship/preposition")).toEqual([]);
  });
});

describe("relationship/vague-label", () => {
  it("accepts intent labels", () => {
    expect(subjectsFor(sample(), "relationship/vague-label")).toEqual([]);
  });

  it.each(["Uses", "  uses ", "calls", "Connects to", "TALKS TO", "interacts with", "depends on", "->", "use"])(
    "rejects %j",
    (label) => {
      const m = withRelationship({ source: "ibs.api", target: "ibs.spa", kind: "sendsTo", label, technology: "WebSocket" });
      const ds = diagnosticsFor(m, "relationship/vague-label");
      expect(ds.map((d) => d.subject)).toEqual(["ibs.api->ibs.spa#sendsTo"]);
      expect(ds[0]?.message).toContain("Makes API calls to");
      expect(subjectsFor(m, "relationship/preposition")).toEqual([]);
    },
  );

  it("accepts labels that only contain a vague word", () => {
    const m = withRelationship({ source: "ibs.api", target: "ibs.spa", kind: "sendsTo", label: "Uses push notifications to", technology: "WebSocket" });
    expect(subjectsFor(m, "relationship/vague-label")).toEqual([]);
  });
});

describe("relationship/preposition", () => {
  it("produces no infos for the sample", () => {
    expect(subjectsFor(sample(), "relationship/preposition")).toEqual([]);
  });

  it("reports labels that do not end with a preposition, ignoring trailing punctuation", () => {
    const m = sampleWith((m) => {
      m.relationships.push(
        { source: "ibs.api", target: "ibs.spa", kind: "sendsTo", label: "Pushes notifications", technology: "WebSocket" },
        { source: "corebanking", target: "ibs", kind: "sendsTo", label: "Sends statements to.", technology: "SFTP" },
      );
    });
    const ds = diagnosticsFor(m, "relationship/preposition");
    expect(ds.map((d) => d.subject)).toEqual(["ibs.api->ibs.spa#sendsTo"]);
    expect(ds[0]?.severity).toBe("info");
  });
});

describe("relationship/technology-required", () => {
  it("accepts the sample (person interactions are exempt)", () => {
    expect(subjectsFor(sample(), "relationship/technology-required")).toEqual([]);
  });

  it("warns when a container-level relationship has no technology", () => {
    const m = sampleWith((m) => {
      m.relationships.push(
        { source: "ibs.api", target: "ibs.spa", kind: "sendsTo", label: "Pushes notifications to" },
        { source: "corebanking", target: "ibs", kind: "sendsTo", label: "Sends statements to" },
      );
    });
    const ds = diagnosticsFor(m, "relationship/technology-required");
    expect(ds.map((d) => d.subject)).toEqual(["ibs.api->ibs.spa#sendsTo"]);
    expect(ds[0]?.severity).toBe("warning");
  });
});

describe("relationship/bidirectional", () => {
  it("accepts the sample", () => {
    expect(subjectsFor(sample(), "relationship/bidirectional")).toEqual([]);
  });

  it("warns once per pair with the same kind in both directions", () => {
    const m = sampleWith((m) => {
      m.relationships.push(
        { source: "ibs.api", target: "ibs.spa", kind: "calls", label: "Makes callbacks to", technology: "HTTPS" },
        { source: "ibs.api", target: "ibs.spa", kind: "calls", key: "b", label: "Makes more callbacks to", technology: "HTTPS" },
      );
    });
    const ds = diagnosticsFor(m, "relationship/bidirectional");
    expect(ds.map((d) => d.subject)).toEqual(["ibs.api->ibs.spa#calls"]);
  });

  it("allows opposite directions with different kinds", () => {
    const m = withRelationship({ source: "ibs.db", target: "ibs.api", kind: "sendsTo", label: "Sends change events to", technology: "CDC" });
    expect(subjectsFor(m, "relationship/bidirectional")).toEqual([]);
  });
});
