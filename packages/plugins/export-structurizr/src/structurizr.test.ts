import { describe, expect, it } from "vitest";
import type { ExportInput, Model } from "@designperspectives/contracts";
import { CONTRACTS_VERSION } from "@designperspectives/contracts";
import { contractSampleModel, runExporterContract } from "@designperspectives/contracts/testing";
import plugin, { StructurizrDslExporter, StructurizrJsonExporter } from "./index.js";
import { dslString } from "./text.js";
import { richModel, undefinedIdentifiers, upstreamTokens } from "./test-support.test-helper.js";

const sampleInput = (): ExportInput => ({ model: contractSampleModel(), views: [], workspaceName: "Internet Banking" });

runExporterContract(() => new StructurizrDslExporter(), sampleInput);
runExporterContract(() => new StructurizrJsonExporter(), sampleInput);

type J = Record<string, unknown> & { id: string };
interface Ws {
  model: Record<string, unknown>;
  views: Record<string, J[]>;
  properties: Record<string, string>;
}
const arr = (v: unknown): J[] => (v ?? []) as J[];

function dsl(model: Model, name = "Internet Banking"): string {
  return new StructurizrDslExporter().export({ model, views: [], workspaceName: name })[0]!.content;
}

function json(model: Model): Ws {
  const [file] = new StructurizrJsonExporter().export({ model, views: [], workspaceName: "W" });
  expect(file!.path).toBe("workspace.json");
  return JSON.parse(file!.content) as Ws;
}

/** Every JSON element in nesting order (people, systems, containers, components, deployment nodes, instances). */
function allElements(ws: Ws): J[] {
  const out: J[] = [];
  const walk = (e: J): void => {
    out.push(e);
    for (const k of ["containers", "components", "children", "infrastructureNodes", "softwareSystemInstances", "containerInstances"]) arr(e[k]).forEach(walk);
  };
  for (const k of ["people", "softwareSystems", "deploymentNodes"]) arr(ws.model[k]).forEach(walk);
  return out;
}

const vl = (ws: Ws, list: string): J[] => ws.views[list] ?? [];
const relationshipsOf = (ws: Ws): J[] => allElements(ws).flatMap((e) => arr(e.relationships));
const byDpId = (ws: Ws, id: string): J => allElements(ws).find((e) => (e.properties as Record<string, string>)["dp.id"] === id)!;

function danglingInView(v: J, elementIds: Set<string>, relIds: Set<string>): string[] {
  const missingElements = arr(v.elements).filter((e) => !elementIds.has(e.id)).map((e) => `${v.key as string}: element ${e.id}`);
  const missingRels = arr(v.relationships).filter((r) => !relIds.has(r.id)).map((r) => `${v.key as string}: rel ${r.id}`);
  return [...missingElements, ...missingRels];
}

function danglingReferences(ws: Ws): string[] {
  const elementIds = new Set(allElements(ws).map((e) => e.id));
  const rels = relationshipsOf(ws);
  const relIds = new Set(rels.map((r) => r.id));
  const errors = rels.filter((r) => !elementIds.has(r.sourceId as string) || !elementIds.has(r.destinationId as string)).map((r) => `rel ${r.id}`);
  for (const [list, views] of Object.entries(ws.views)) if (list !== "configuration") for (const v of views) errors.push(...danglingInView(v, elementIds, relIds));
  return errors;
}

describe("plug-in module", () => {
  it("declares the manifest and both exporters", () => {
    expect(plugin.manifest).toEqual({
      id: "@designperspectives/plugin-export-structurizr",
      version: "0.1.0",
      contracts: "^" + CONTRACTS_VERSION,
      provides: ["Exporter"],
    });
    expect(plugin.exporters!.map((e) => [e.format, e.needsLayout])).toEqual([
      ["structurizr-dsl", false],
      ["structurizr-json", false],
    ]);
  });
});

describe("structurizr-json on the contract sample", () => {
  const ws = json(contractSampleModel());

  it("nests elements as Structurizr does and keeps dp.id", () => {
    expect(arr(ws.model.people)).toHaveLength(1);
    expect(arr(ws.model.softwareSystems).map((s) => s.name)).toEqual(["Core Banking System", "Internet Banking System"]);
    const ibs = byDpId(ws, "ibs");
    expect(arr(ibs.containers).map((c) => (c.properties as Record<string, string>)["dp.id"])).toEqual(["ibs.api", "ibs.db", "ibs.spa"]);
    expect(arr(byDpId(ws, "ibs.api").components).map((c) => c.name)).toEqual(["Security Component"]);
    expect(allElements(ws).filter((e) => e.name !== undefined && !String(e.tags).includes("Deployment Node"))).toHaveLength(7);
    for (const e of allElements(ws)) expect((e.properties as Record<string, string>)["dp.id"]).toBeTruthy();
  });

  it("assigns sequential numeric ids in canonical order", () => {
    expect(["corebanking", "customer", "ibs", "ibs.api", "ibs.api.security", "ibs.db", "ibs.spa"].map((id) => byDpId(ws, id).id)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
  });

  it("marks data stores with the Database tag", () => {
    expect(byDpId(ws, "ibs.db").tags).toBe("Element,Container,Database");
    expect((byDpId(ws, "ibs.db").properties as Record<string, string>)["dp.kind"]).toBe("dataStore");
  });

  it("stores relationships on their source element", () => {
    const rels = relationshipsOf(ws);
    expect(rels).toHaveLength(8);
    for (const e of allElements(ws)) for (const r of arr(e.relationships)) expect(r.sourceId).toBe(e.id);
    const spaToApi = arr(byDpId(ws, "ibs.spa").relationships).find((r) => r.destinationId === byDpId(ws, "ibs.api").id)!;
    expect(spaToApi).toMatchObject({ description: "Makes API calls to", technology: "JSON/HTTPS", tags: "Relationship", properties: { "dp.kind": "calls" } });
    expect(spaToApi.interactionStyle).toBeUndefined();
    expect(danglingReferences(ws)).toEqual([]);
  });

  it("exports the deployment node tree with a container instance", () => {
    const dc = arr(ws.model.deploymentNodes)[0]!;
    expect(dc).toMatchObject({ name: "Bank data centre", environment: "Live", technology: "Data centre", tags: "Element,Deployment Node" });
    const inst = arr(arr(dc.children)[0]!.containerInstances)[0]!;
    expect(inst).toMatchObject({ containerId: byDpId(ws, "ibs.api").id, instanceId: 1, environment: "Live", properties: { "dp.id": "live.dc.app.api" } });
  });

  it("exports views keyed by view id with explicit membership", () => {
    expect(vl(ws, "systemContextViews").map((v: J) => v.key)).toEqual(["context"]);
    expect(vl(ws, "containerViews").map((v: J) => v.key)).toEqual(["containers"]);
    expect(vl(ws, "componentViews").map((v: J) => v.key)).toEqual(["api-components"]);
    const names = (v: J): string[] => arr(v.elements).map((e) => allElements(ws).find((x) => x.id === e.id)!.name as string);
    const ctx = vl(ws, "systemContextViews")[0] as J;
    expect(ctx).toMatchObject({ title: "System Context View: Internet Banking System", softwareSystemId: byDpId(ws, "ibs").id });
    expect(names(ctx)).toEqual(["Core Banking System", "Personal Banking Customer", "Internet Banking System"]);
    expect(arr(ctx.relationships)).toHaveLength(2);
    expect(names(vl(ws, "containerViews")[0] as J)).toEqual(["Core Banking System", "Personal Banking Customer", "API Application", "Database", "Single-Page Application"]);
    expect(names(vl(ws, "componentViews")[0] as J)).toEqual(["Security Component", "Database", "Single-Page Application"]);
    expect(ctx).not.toHaveProperty("elements.0.x");
  });

  it("is 2-space indented with a trailing newline", () => {
    const content = new StructurizrJsonExporter().export(sampleInput())[0]!.content;
    expect(content.startsWith('{\n  "id": 0,\n  "name": "Internet Banking"')).toBe(true);
    expect(content.endsWith("}\n")).toBe(true);
  });

  it("exports a sendsTo relationship added to the sample as Asynchronous", () => {
    const m = contractSampleModel();
    m.relationships.push({ source: "ibs.api", target: "corebanking", kind: "sendsTo", label: "Sends payment orders to", technology: "AMQP" });
    const w = json(m);
    const rel = arr(byDpId(w, "ibs.api").relationships).find((r) => r.description === "Sends payment orders to")!;
    expect(rel).toMatchObject({ interactionStyle: "Asynchronous", tags: "Relationship,Asynchronous", properties: { "dp.kind": "sendsTo" } });
    expect(dsl(m)).toMatch(/ibs\.api -> corebanking "Sends payment orders to" "AMQP" \{\n\s+tags "Asynchronous"/);
  });

  it("does not depend on input order", () => {
    const m = contractSampleModel();
    const shuffled: Model = { ...m, elements: [...m.elements].reverse(), relationships: [...m.relationships].reverse(), views: [...m.views].reverse() };
    expect(json(shuffled)).toEqual(ws);
  });
});

describe("structurizr-json on a richer model", () => {
  const ws = json(richModel());
  const api = (): J => byDpId(ws, "bank.digital.ibs.api");
  const events = (): J => byDpId(ws, "bank.digital.ibs.events");

  it("exports async relationships with interactionStyle Asynchronous", () => {
    const toEvents = arr(api().relationships).filter((r) => r.destinationId === events().id);
    expect(toEvents.map((r) => [r.description, r.interactionStyle, r.tags, (r.properties as Record<string, string>)["dp.kind"]])).toEqual([
      ["Publishes events to", "Asynchronous", "Relationship,Asynchronous", "publishesTo"],
      ["Publishes events to [sendsTo]", "Asynchronous", "Relationship,Asynchronous", "sendsTo"],
    ]);
    const toHsm = arr(api().relationships).find((r) => r.destinationId === byDpId(ws, "hsm").id)!;
    expect(toHsm.properties).toEqual({ "dp.kind": "calls", "dp.key": "sign" });
  });

  it("maps groups, queues, topics and hardware systems by convention", () => {
    expect(byDpId(ws, "bank.digital.ibs").group).toBe("Big Bank plc/Digital");
    expect(ws.model.properties).toEqual({ "structurizr.groupSeparator": "/" });
    expect(events().tags).toBe("Element,Container,Queue");
    expect(byDpId(ws, "bank.digital.ibs.modeL").tags).toBe("Element,Container,Topic");
    expect(byDpId(ws, "hsm").tags).toBe("Element,Software System,Hardware System,secure fips");
    expect(byDpId(ws, "bank.digital.ibs.model").name).toBe("API (bank.digital.ibs.model)");
  });

  it("lists everything without a Structurizr equivalent in a workspace property", () => {
    const lines = (ws.properties["dp.notExported"] as string).split("\n");
    expect(lines).toEqual(
      expect.arrayContaining([
        'codeElement bank.digital.ibs.api.signin.handler "SignInHandler" (no Structurizr equivalent)',
        'group empty "Empty group" (group without exported members)',
        expect.stringMatching(/^relationship bank\.digital\.ibs->bank\.digital\.ibs\.api#calls "Contains" \(Structurizr forbids/),
        expect.stringMatching(/^relationship bank\.digital\.ibs\.api\.signin\.handler->hsm#calls/),
        expect.stringMatching(/^infrastructureNode live\.lb2 "Stray load balancer"/),
        expect.stringMatching(/^view bad /),
        expect.stringMatching(/^dynamicStep signin-flow#3 "Touches the HSM"/),
        "viewSelector c2: include nothing (matches no exported element)",
      ]),
    );
    expect(ws.properties["dp.notExported"]).not.toContain("live.k8s.lb ");
  });

  it("exports instances, infrastructure nodes and replicated instance relationships", () => {
    const k8s = arr(ws.model.deploymentNodes).find((n) => n.name === "Kubernetes")!;
    expect(arr(k8s.infrastructureNodes).map((n) => n.tags)).toEqual(["Element,Infrastructure Node"]);
    const rack = arr(ws.model.deploymentNodes).find((n) => n.name === "HSM rack")!;
    expect(arr(rack.softwareSystemInstances)[0]).toMatchObject({ softwareSystemId: byDpId(ws, "hsm").id, environment: "Live" });
    const apiInst = byDpId(ws, "live.k8s.pod.api");
    const linked = arr(apiInst.relationships).map((r) => [r.destinationId, r.linkedRelationshipId]);
    const modelRelIds = arr(api().relationships).map((r) => r.id);
    expect(linked.length).toBe(3);
    for (const [, l] of linked) expect(modelRelIds).toContain(l);
    expect(linked.map(([d]) => d)).toContain(byDpId(ws, "live.k8s.pod.events").id);
  });

  it("exports landscape, dynamic and deployment views", () => {
    expect(vl(ws, "systemLandscapeViews")[0]!.elements).toHaveLength(3);
    const dyn = vl(ws, "dynamicViews")[0] as J;
    expect(dyn).toMatchObject({ key: "signin-flow", elementId: byDpId(ws, "bank.digital.ibs").id, description: 'Sign-in "happy" path' });
    expect(arr(dyn.relationships).map((r) => [r.description, r.order])).toEqual([
      ["Signs in", "1"],
      ["Emits SignedIn", "2"],
    ]);
    const dep = vl(ws, "deploymentViews")[0] as J;
    expect(dep.environment).toBe("Live");
    expect(arr(dep.elements)).toHaveLength(7);
    expect(arr(dep.relationships).length).toBeGreaterThan(0);
    const c2 = vl(ws, "containerViews").find((v: J) => v.key === "c2") as J;
    const shown = arr(c2.elements).map((e) => allElements(ws).find((x) => x.id === e.id)!.name);
    expect(shown).toEqual(["API", "Events", "Model topic", "Customer"]);
    expect(vl(ws, "containerViews").map((v: J) => v.key)).toEqual(["c2"]);
    expect(danglingReferences(ws)).toEqual([]);
  });

  it("honours ExportOptions.viewIds", () => {
    const [f] = new StructurizrJsonExporter().export({ model: richModel(), views: [], workspaceName: "W" }, { viewIds: ["ctx"] });
    const views = JSON.parse(f!.content).views as Record<string, unknown>;
    expect(Object.keys(views)).toEqual(["systemContextViews", "configuration"]);
  });
});

describe("structurizr-dsl", () => {
  it("defines every identifier before it is referenced (sample and rich model)", () => {
    expect(undefinedIdentifiers(dsl(contractSampleModel()))).toEqual([]);
    expect(undefinedIdentifiers(dsl(richModel()))).toEqual([]);
  });

  it("the identifier checker catches forward references", () => {
    expect(undefinedIdentifiers('model {\n    a -> b "x"\n    a = person "A"\n}\n')).toEqual(["line 2: a", "line 2: b"]);
  });

  it("writes the expected structure for the sample", () => {
    const text = dsl(contractSampleModel());
    expect(text).toContain("!identifiers hierarchical");
    expect(text).toContain('workspace "Internet Banking" {');
    expect(text).toContain('ibs.spa -> ibs.api "Makes API calls to" "JSON/HTTPS" {');
    expect(text).toContain('"dp.id" "ibs.api.security"');
    expect(text).toContain('db = container "Database" {');
    expect(text).toContain('tags "Database"');
    expect(text).toMatch(/live = deploymentEnvironment "Live" \{\n\s+dc = deploymentNode "Bank data centre" \{/);
    expect(text).toMatch(/api = containerInstance ibs\.api \{/);
    expect(text).toContain('systemContext ibs "context" {');
    expect(text).toContain('component ibs.api "api-components" {');
    expect(text).toContain("include *");
    expect(text.includes("\r")).toBe(false);
    expect(text.endsWith("}\n")).toBe(true);
  });

  it("writes groups, async tags, odd identifiers and all view kinds for the rich model", () => {
    const text = dsl(richModel());
    expect(text).toMatch(/group "Big Bank plc" \{\n\s+group "Digital" \{\n\s+ibs = softwareSystem "Internet Banking System" \{/);
    expect(text).toContain('"structurizr.groupSeparator" "/"');
    expect(text).toMatch(/ibs\.api -> ibs\.events "Publishes events to \[sendsTo\]" "AMQP" \{\n\s+tags "Asynchronous"/);
    expect(text).toContain("modeL_ = container");
    expect(text).toContain("model__2 = container");
    expect(text).toContain('hsm_rack = deploymentNode "HSM rack"');
    expect(text).toContain("hsm = softwareSystemInstance hsm {");
    expect(text).toContain('// not exported: codeElement bank.digital.ibs.api.signin.handler "SignInHandler" (no Structurizr equivalent)');
    expect(text).toContain('systemLandscape "landscape" {');
    expect(text).toContain('dynamic ibs "signin-flow" "Sign-in \\"happy\\" path" {');
    expect(text).toContain('ibs.api -> ibs.events "Emits SignedIn" "AMQP"');
    expect(text).toContain('deployment * live "live-deploy" {');
    expect(text).toContain("include ibs.api ibs.events ibs.modeL_ ibs.model__2 user");
    expect(text).toContain("exclude ibs.model__2");
    expect(text).not.toContain('"bad"');
  });

  it("escapes strings so the upstream tokenizer reads them back", () => {
    const cases: Array<[string, string]> = [
      ['Say "hi"', 'Say "hi"'],
      ["two\nlines\r\nhere", "two\nlines\nhere"],
      ["C:\\temp", "C:\\temp"],
      ['a \\" b', 'a \\" b'],
      ["back\\\nslash", "back\\\nslash"],
      // no escape exists for a backslash before "n" or at the end: replaced by U+29F5 (documented, lossy)
      ["C:\\new", "C:\u29F5new"],
      ["trailing\\", "trailing\u29F5"],
    ];
    for (const [input, expected] of cases) {
      expect(upstreamTokens(`x = person ${dslString(input)} {`)).toEqual(["x", "=", "person", expected, "{"]);
    }
  });

  it("escapes titles in the written file", () => {
    const m = contractSampleModel();
    m.elements[0] = { ...m.elements[0]!, title: 'The "customer"\nof C:\\bank' };
    const line = dsl(m).split("\n").find((l) => l.includes("= person"))!;
    expect(upstreamTokens(line)[3]).toBe('The "customer"\nof C:\\bank');
  });
});
