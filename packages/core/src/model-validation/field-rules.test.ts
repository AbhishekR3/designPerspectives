import { describe, expect, it } from "vitest";
import { diagnosticsFor, sample, sampleWith, subjectsFor } from "./test-support.js";

describe("model/title-required", () => {
  it("accepts the sample", () => {
    expect(subjectsFor(sample(), "model/title-required")).toEqual([]);
  });

  it("reports blank element and view titles", () => {
    const m = sampleWith((m) => {
      m.elements[0]!.title = "  ";
      m.views[0]!.title = "";
    });
    expect(subjectsFor(m, "model/title-required")).toEqual(["context", "customer"]);
    expect(diagnosticsFor(m, "model/title-required")[0]?.severity).toBe("error");
  });
});

describe("model/description-required", () => {
  it("accepts the sample", () => {
    expect(subjectsFor(sample(), "model/description-required")).toEqual([]);
  });

  it("warns on missing descriptions but exempts groups and code elements", () => {
    const m = sampleWith((m) => {
      delete m.elements[1]!.description;
      m.elements.push(
        { id: "ibs.api.security.validator", kind: "codeElement", title: "Validator" },
        { id: "ibs.backend", kind: "group", title: "Backend" },
      );
    });
    const ds = diagnosticsFor(m, "model/description-required");
    expect(ds.map((d) => d.subject)).toEqual(["ibs"]);
    expect(ds[0]?.severity).toBe("warning");
  });
});

describe("model/technology-required", () => {
  it("accepts the sample", () => {
    expect(subjectsFor(sample(), "model/technology-required")).toEqual([]);
  });

  it("reports containers, data stores, queues, topics and components without technology", () => {
    const m = sampleWith((m) => {
      delete m.elements[2]!.technology; // ibs.spa
      m.elements.push(
        { id: "ibs.events", kind: "topic", title: "Events", description: "Domain events." },
        { id: "ibs.jobs", kind: "queue", title: "Jobs", description: "Work items.", technology: " " },
      );
    });
    expect(subjectsFor(m, "model/technology-required")).toEqual(["ibs.events", "ibs.jobs", "ibs.spa"]);
  });

  it("does not require technology on people and software systems", () => {
    const m = sampleWith((m) => {
      m.elements.push({ id: "mainframe", kind: "softwareSystem", title: "Mainframe", description: "Legacy." });
    });
    expect(subjectsFor(m, "model/technology-required")).toEqual([]);
  });
});
