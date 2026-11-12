import { describe, expect, it } from "vitest";
import { contractSampleModel, runModelPortContract } from "@designperspectives/contracts/testing";
import { LikeC4ModelPort } from "./index.js";
import type { Model } from "@designperspectives/contracts";

runModelPortContract(() => new LikeC4ModelPort());

function withExtras(): Model {
  const m = contractSampleModel();
  m.elements.push({ id: "ibs.api.layer", kind: "group", groupType: "layer", title: "Web layer" });
  m.relationships.push({ source: "ibs.spa", target: "ibs.api", kind: "calls", label: "Makes refund calls to", technology: "JSON/HTTPS", key: "refunds" });
  m.views.push({ id: "signin", type: "dynamic", title: "Dynamic View: sign in", scope: "ibs", include: [], steps: [{ source: "customer", target: "ibs.spa", label: "Signs in using" }, { source: "ibs.spa", target: "ibs.api", label: "Makes API calls to" }] });
  m.views.push({ id: "live", type: "deployment", title: "Deployment View: Internet Banking System (Live)", environment: "live", include: ["*"] });
  return m;
}

describe("LikeC4ModelPort specifics", () => {
  it("round-trips group types, relationship keys, dynamic scope and deployment environment", async () => {
    const port = new LikeC4ModelPort();
    const { model, diagnostics } = await port.load(port.print(withExtras()));
    expect(diagnostics).toEqual([]);
    expect(model.elements.find((e) => e.id === "ibs.api.layer")?.groupType).toBe("layer");
    expect(model.relationships.filter((r) => r.source === "ibs.spa" && r.target === "ibs.api").map((r) => r.key ?? null).sort()).toEqual([null, "refunds"]);
    const dyn = model.views.find((v) => v.id === "signin");
    expect(dyn?.scope).toBe("ibs");
    expect(dyn?.steps).toHaveLength(2);
    const live = model.views.find((v) => v.id === "live");
    expect(live?.environment).toBe("live");
    expect(live?.include).toEqual(["*"]);
  });

  it("context view shows the system and its direct neighbours only", async () => {
    const port = new LikeC4ModelPort();
    const view = await port.layoutView(contractSampleModel(), "context");
    expect(view.nodes.map((n) => n.id).sort()).toEqual(["corebanking", "customer", "ibs"]);
    expect(view.edges.length).toBe(2);
  });

  it("container view nests containers inside the system boundary", async () => {
    const port = new LikeC4ModelPort();
    const view = await port.layoutView(contractSampleModel(), "containers");
    const boundary = view.nodes.find((n) => n.id === "ibs");
    expect(boundary?.isBoundary).toBe(true);
    expect(view.nodes.filter((n) => n.parent === "ibs").map((n) => n.id).sort()).toEqual(["ibs.api", "ibs.db", "ibs.spa"]);
    const spaApi = view.edges.find((e) => e.source === "ibs.spa" && e.target === "ibs.api");
    expect(spaApi?.technology).toBe("JSON/HTTPS");
  });

  it("deployment view includes nodes and instances under the environment", async () => {
    const port = new LikeC4ModelPort();
    const view = await port.layoutView(withExtras(), "live");
    expect(view.nodes.map((n) => n.id).sort()).toEqual(["live.dc", "live.dc.app", "live.dc.app.api"]);
    expect(view.nodes.find((n) => n.id === "live.dc.app.api")?.kind).toBe("container");
  });

  it("reports a syntax error with a 1-based line in the right file", async () => {
    const port = new LikeC4ModelPort();
    const files = port.print(contractSampleModel());
    const views = files.find((f) => f.path === "model/views.c4")!;
    const lines = views.content.split("\n");
    lines.splice(2, 0, "  this is not valid {{");
    const broken = files.map((f) => (f === views ? { ...f, content: lines.join("\n") } : f));
    const { diagnostics } = await port.load(broken);
    expect(diagnostics[0]?.file).toBe("model/views.c4");
    expect(diagnostics[0]?.line).toBe(3);
  });
});
