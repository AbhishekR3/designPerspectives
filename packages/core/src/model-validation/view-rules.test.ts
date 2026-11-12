import type { ViewDef } from "@designperspectives/contracts";
import { describe, expect, it } from "vitest";
import { diagnosticsFor, sample, sampleWith, subjectsFor } from "./test-support.js";

function withViews(...views: ViewDef[]) {
  return sampleWith((m) => {
    m.views.push(...views);
  });
}

describe("view/title-format", () => {
  it("accepts the sample titles", () => {
    expect(subjectsFor(sample(), "view/title-format")).toEqual([]);
  });

  it("warns when the title does not start with the type prefix", () => {
    const m = withViews(
      { id: "landscape", type: "landscape", title: "System Landscape View for Big Bank plc", include: ["*"] },
      { id: "deploy", type: "deployment", title: "Live deployment", environment: "live", include: ["*"] },
      { id: "ctx2", type: "context", title: "System Context View Internet Banking", scope: "ibs", include: ["*"] },
    );
    const ds = diagnosticsFor(m, "view/title-format");
    expect(ds.map((d) => d.subject)).toEqual(["ctx2", "deploy"]);
    expect(ds[1]?.message).toBe('View "deploy" has title "Live deployment"; start it with "Deployment View:" followed by the scope.');
  });
});

describe("view/scope", () => {
  it("accepts the sample scopes", () => {
    expect(subjectsFor(sample(), "view/scope")).toEqual([]);
  });

  it("accepts valid landscape, dynamic and deployment views", () => {
    const m = withViews(
      { id: "landscape", type: "landscape", title: "System Landscape View", include: ["*"] },
      { id: "signin", type: "dynamic", title: "Dynamic View: Sign in", scope: "ibs.api", include: [], steps: [{ source: "ibs.spa", target: "ibs.api", label: "Submits credentials to" }] },
      { id: "deploy", type: "deployment", title: "Deployment View: Live", environment: "live", scope: "ibs", include: ["*"] },
    );
    expect(subjectsFor(m, "view/scope")).toEqual([]);
  });

  it("reports missing, unknown and wrong-kind scopes", () => {
    const m = withViews(
      { id: "a-ctx", type: "context", title: "System Context View: X", include: ["*"] },
      { id: "b-cnt", type: "container", title: "Container View: X", scope: "ibs.api", include: ["*"] },
      { id: "c-cmp", type: "component", title: "Component View: X", scope: "ibs", include: ["*"] },
      { id: "d-dyn", type: "dynamic", title: "Dynamic View: X", scope: "ghost", include: [], steps: [{ source: "customer", target: "ibs", label: "Signs in to" }] },
      { id: "e-dep", type: "deployment", title: "Deployment View: X", environment: "live.dc", include: ["*"] },
      { id: "f-land", type: "landscape", title: "System Landscape View", scope: "ibs", include: ["*"] },
      { id: "g-dep", type: "deployment", title: "Deployment View: X", include: ["*"] },
    );
    const ds = diagnosticsFor(m, "view/scope");
    expect(ds.map((d) => d.subject)).toEqual(["a-ctx", "b-cnt", "c-cmp", "d-dyn", "e-dep", "f-land", "g-dep"]);
    expect(ds[1]?.message).toBe(
      'Container View "b-cnt" has scope "ibs.api", which is a container; set "scope" to the id of a software system.',
    );
  });
});

describe("view/dynamic-steps", () => {
  it("accepts the sample (no dynamic views) and a valid dynamic view", () => {
    expect(subjectsFor(sample(), "view/dynamic-steps")).toEqual([]);
    const m = withViews({ id: "signin", type: "dynamic", title: "Dynamic View: Sign in", scope: "ibs", include: [], steps: [{ source: "ibs.spa", target: "ibs.api.security", label: "Submits credentials to" }] });
    expect(subjectsFor(m, "view/dynamic-steps")).toEqual([]);
  });

  it("reports dynamic views without steps and steps with unknown endpoints", () => {
    const m = withViews(
      { id: "empty", type: "dynamic", title: "Dynamic View: Empty", scope: "ibs", include: [] },
      { id: "broken", type: "dynamic", title: "Dynamic View: Broken", scope: "ibs", include: [], steps: [{ source: "ibs.spa", target: "ghost", label: "Calls into" }] },
    );
    const ds = diagnosticsFor(m, "view/dynamic-steps");
    expect(ds.map((d) => d.subject)).toEqual(["broken", "empty"]);
    expect(ds[0]?.message).toContain('Step 1 of dynamic view "broken" has target "ghost"');
  });
});

describe("view/dynamic-unmodelled", () => {
  it("accepts steps modelled directly, in reverse, or between ancestors", () => {
    const m = withViews({
      id: "signin",
      type: "dynamic",
      title: "Dynamic View: Sign in",
      scope: "ibs",
      include: [],
      steps: [
        { source: "ibs.spa", target: "ibs.api.security", label: "Submits credentials to" },
        { source: "ibs.db", target: "ibs.api.security", label: "Returns user record to" },
        { source: "ibs.api.security", target: "corebanking", label: "Checks customer with" },
      ],
    });
    expect(subjectsFor(m, "view/dynamic-unmodelled")).toEqual([]);
  });

  it("warns when no relationship exists between the step endpoints", () => {
    const m = withViews({
      id: "signin",
      type: "dynamic",
      title: "Dynamic View: Sign in",
      scope: "ibs",
      include: [],
      steps: [
        { source: "ibs.spa", target: "ibs.api", label: "Submits credentials to" },
        { source: "ibs.spa", target: "ibs.db", label: "Reads directly from" },
      ],
    });
    const ds = diagnosticsFor(m, "view/dynamic-unmodelled");
    expect(ds.map((d) => d.message)).toEqual([
      'Step 2 of dynamic view "signin" ("ibs.spa" to "ibs.db") has no matching relationship in the model; add a relationship between them or their parents.',
    ]);
    expect(ds[0]?.severity).toBe("warning");
  });
});
