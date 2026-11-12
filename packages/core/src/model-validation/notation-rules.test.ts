import { describe, expect, it } from "vitest";
import { diagnosticsFor, sample, sampleWith, subjectsFor } from "./test-support.js";

describe("notation/acronym", () => {
  it("finds no undefined acronyms in the sample", () => {
    expect(subjectsFor(sample(), "notation/acronym")).toEqual([]);
  });

  it("reports each undefined acronym once, against the first subject in id order", () => {
    const m = sampleWith((m) => {
      m.elements.push(
        { id: "zeta", kind: "softwareSystem", title: "GL System", description: "Posts KYC checks." },
        { id: "alpha", kind: "softwareSystem", title: "Ledger", description: "The bank's GL with APIs." },
      );
      m.relationships.push({ source: "zeta", target: "alpha", kind: "sendsTo", label: "Sends ACH files to" });
    });
    const ds = diagnosticsFor(m, "notation/acronym");
    expect(ds.map((d) => [d.subject, d.message])).toEqual([
      ["alpha", 'Acronym "GL" is not in the glossary; add a glossary entry explaining it, or spell it out.'],
      ["zeta", 'Acronym "KYC" is not in the glossary; add a glossary entry explaining it, or spell it out.'],
      ["zeta->alpha#sendsTo", 'Acronym "ACH" is not in the glossary; add a glossary entry explaining it, or spell it out.'],
    ]);
    expect(ds[0]?.severity).toBe("info");
  });

  it("accepts acronyms defined through the glossary option and plural forms of known acronyms", () => {
    const m = sampleWith((m) => {
      m.elements.push({ id: "gl", kind: "softwareSystem", title: "GL", description: "Exposes APIs and IDs." });
    });
    expect(subjectsFor(m, "notation/acronym", { glossary: ["GL"] })).toEqual([]);
  });
});
