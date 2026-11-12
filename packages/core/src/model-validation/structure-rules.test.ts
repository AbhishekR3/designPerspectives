import { describe, expect, it } from "vitest";
import { diagnosticsFor, sample, sampleWith, subjectsFor } from "./test-support.js";

describe("model/id-format", () => {
  it("accepts the sample ids", () => {
    expect(subjectsFor(sample(), "model/id-format")).toEqual([]);
  });

  it("rejects invalid element, deployment node and instance ids", () => {
    const m = sampleWith((m) => {
      m.elements.push({ id: "Bad.Id", kind: "person", title: "X", description: "Y" });
      m.deploymentNodes.push({ id: "live.Web Server", kind: "deploymentNode", title: "Web" });
      m.deploymentInstances.push({ id: "live.dc.app.2api", of: "ibs.api" });
    });
    expect(subjectsFor(m, "model/id-format")).toEqual(["Bad.Id", "live.Web Server", "live.dc.app.2api"]);
    expect(diagnosticsFor(m, "model/id-format")[0]?.severity).toBe("error");
  });
});

describe("model/duplicate-id", () => {
  it("accepts unique ids", () => {
    expect(subjectsFor(sample(), "model/duplicate-id")).toEqual([]);
  });

  it("reports duplicate element, relationship, view and deployment ids once each", () => {
    const m = sampleWith((m) => {
      m.elements.push({ id: "ibs", kind: "softwareSystem", title: "Again", description: "Dup." });
      m.relationships.push({ source: "ibs.spa", target: "ibs.api", kind: "calls", label: "Makes calls to", technology: "HTTPS" });
      m.views.push({ id: "context", type: "context", title: "System Context View: X", scope: "ibs", include: ["*"] });
      m.deploymentInstances.push({ id: "live.dc", of: "ibs.api" });
    });
    const ds = diagnosticsFor(m, "model/duplicate-id");
    expect(ds.map((d) => d.subject).sort()).toEqual(["context", "ibs", "ibs.spa->ibs.api#calls", "live.dc"]);
    expect(ds.find((d) => d.subject === "ibs")?.message).toContain("used 2 times");
  });

  it("treats a relationship key as part of the id", () => {
    const m = sampleWith((m) => {
      m.relationships.push({ source: "ibs.spa", target: "ibs.api", kind: "calls", key: "b", label: "Makes calls to", technology: "HTTPS" });
    });
    expect(subjectsFor(m, "model/duplicate-id")).toEqual([]);
  });
});

describe("model/allowed-parent", () => {
  it("accepts the sample hierarchy", () => {
    expect(subjectsFor(sample(), "model/allowed-parent")).toEqual([]);
  });

  it("rejects kinds under the wrong parent", () => {
    const m = sampleWith((m) => {
      m.elements.push(
        { id: "ibs.staff", kind: "person", title: "Staff", description: "Bank staff." },
        { id: "orphan", kind: "container", title: "Orphan", technology: "Go", description: "No system." },
        { id: "ibs.db.table", kind: "component", title: "Table", technology: "SQL", description: "Not allowed in a data store." },
        { id: "ibs.code", kind: "codeElement", title: "Code", description: "Code under a system." },
        { id: "ibs.api.security.grp", kind: "group", title: "Group", description: "Group under a component." },
      );
    });
    expect(subjectsFor(m, "model/allowed-parent")).toEqual([
      "ibs.api.security.grp",
      "ibs.code",
      "ibs.db.table",
      "ibs.staff",
      "orphan",
    ]);
    const msg = diagnosticsFor(m, "model/allowed-parent").find((d) => d.subject === "ibs.db.table")?.message;
    expect(msg).toBe(
      'Component "ibs.db.table" is inside a data store ("ibs.db"); a component must be inside a container. Change its id so it sits under a valid parent.',
    );
  });

  it("accepts code elements under components and treats groups as transparent", () => {
    const m = sampleWith((m) => {
      m.elements.push(
        { id: "ibs.api.security.validator", kind: "codeElement", title: "Validator" },
        { id: "ibs.backend", kind: "group", title: "Backend", groupType: "layer" },
        { id: "ibs.backend.worker", kind: "container", title: "Worker", technology: "Go", description: "Runs jobs." },
        { id: "team", kind: "group", title: "Team" },
        { id: "team.ops", kind: "person", title: "Operator", description: "Operates the system." },
      );
    });
    expect(subjectsFor(m, "model/allowed-parent")).toEqual([]);
  });
});

describe("model/missing-parent", () => {
  it("accepts the sample", () => {
    expect(subjectsFor(sample(), "model/missing-parent")).toEqual([]);
  });

  it("reports an element whose parent id is undefined", () => {
    const m = sampleWith((m) => {
      m.elements.push({ id: "ghost.api", kind: "container", title: "API", technology: "Go", description: "Lost." });
    });
    const ds = diagnosticsFor(m, "model/missing-parent");
    expect(ds.map((d) => d.subject)).toEqual(["ghost.api"]);
    expect(ds[0]?.message).toContain('"ghost"');
    expect(subjectsFor(m, "model/allowed-parent")).toEqual([]);
  });
});

describe("model/relationship-endpoint", () => {
  it("accepts the sample", () => {
    expect(subjectsFor(sample(), "model/relationship-endpoint")).toEqual([]);
  });

  it("reports missing endpoints and self-relationships", () => {
    const m = sampleWith((m) => {
      m.relationships.push(
        { source: "ibs.api", target: "nowhere", kind: "calls", label: "Calls into", technology: "HTTPS" },
        { source: "ibs.api", target: "ibs.api", kind: "calls", label: "Calls into", technology: "HTTPS" },
      );
    });
    const ds = diagnosticsFor(m, "model/relationship-endpoint");
    expect(ds.map((d) => d.subject)).toEqual(["ibs.api->ibs.api#calls", "ibs.api->nowhere#calls"]);
    expect(ds[1]?.message).toContain('target "nowhere"');
  });

  it("allows deploysTo relationships to target deployment nodes", () => {
    const m = sampleWith((m) => {
      m.relationships.push({ source: "ibs.api", target: "live.dc.app", kind: "deploysTo", label: "Is deployed to", technology: "SSH" });
    });
    expect(subjectsFor(m, "model/relationship-endpoint")).toEqual([]);
  });
});

describe("model/deployment", () => {
  it("accepts the sample deployment model", () => {
    expect(subjectsFor(sample(), "model/deployment")).toEqual([]);
  });

  it("reports nodes outside an environment and multi-segment environments", () => {
    const m = sampleWith((m) => {
      m.deploymentNodes.push(
        { id: "staging.web", kind: "deploymentNode", title: "Web" },
        { id: "live.dc.cell", kind: "environment", title: "Cell" },
        { id: "aws", kind: "infrastructureNode", title: "AWS" },
      );
    });
    expect(subjectsFor(m, "model/deployment")).toEqual(["aws", "live.dc.cell", "staging.web"]);
  });

  it("reports instances of undeployable or unknown elements and instances outside a node", () => {
    const m = sampleWith((m) => {
      m.deploymentInstances.push(
        { id: "live.dc.app.sec", of: "ibs.api.security" },
        { id: "live.dc.app.ghost", of: "ghost" },
        { id: "live.db", of: "ibs.db" },
      );
    });
    const ds = diagnosticsFor(m, "model/deployment");
    expect(ds.map((d) => d.subject)).toEqual(["live.db", "live.dc.app.ghost", "live.dc.app.sec"]);
    expect(ds.find((d) => d.subject === "live.dc.app.sec")?.message).toContain("which is a component");
    expect(ds.find((d) => d.subject === "live.db")?.message).toContain('"live" is not one');
  });
});
