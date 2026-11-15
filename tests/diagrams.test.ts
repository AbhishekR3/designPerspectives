/** What each level shows, computed from the demo model. */

import { describe, expect, test } from "vitest";
import * as diagrams from "../src/core/diagrams.js";
import * as ops from "../src/core/ops.js";
import { emptySidecar } from "../src/core/sidecar.js";
import type { Diagram } from "../src/shared/types.js";
import { demoWs } from "./helpers.js";

const names = (d: Diagram) => d.nodes.map((n) => n.name).sort();
const dia = (ws: ReturnType<typeof demoWs>, key: string) => diagrams.diagram(ws, key)!;

describe("diagrams", () => {
  test("landscape shows people and systems", () => {
    const d = dia(demoWs(), "landscape");
    expect(d.nodes).toHaveLength(8);
    expect(d.nodes.every((n) => n.kind === "person" || n.kind === "softwareSystem")).toBe(true);
  });

  test("context shows system and neighbours", () => {
    expect(names(dia(demoWs(), "context-internet-banking-system"))).toEqual([
      "Analytics Platform",
      "E-mail System",
      "Internet Banking System",
      "Mainframe Banking System",
      "Personal Banking Customer",
    ]);
  });

  test("container view includes derived edges", () => {
    const d = dia(demoWs(), "containers-internet-banking-system");
    expect(d.boundary!.name).toBe("Internet Banking System");
    expect(d.nodes.filter((n) => n.inScope).map((n) => n.name).sort()).toEqual([
      "API Application",
      "Database",
      "Mobile App",
      "Single-Page Application",
      "Web Application",
    ]);
    const edges = new Map(d.edges.map((e) => [`${e.source}|${e.target}`, e]));
    // API Application -> Database exists only via Security Component -> Database.
    const e = edges.get("api-application|database")!;
    expect(e.derived).toBe(true);
    expect(e.relationshipIds).toEqual(["security-component--database"]);
    expect(e.description).toBe("Reads from and writes to");
    // Explicit customer -> web application stays explicit.
    expect(edges.get("personal-banking-customer|web-application")!.derived).toBe(false);
    // The system itself is the boundary, not a node.
    expect(d.nodes.map((n) => n.id)).not.toContain("internet-banking-system");
  });

  test("component view maps outside elements", () => {
    const d = dia(demoWs(), "components-api-application");
    expect(d.nodes.filter((n) => !n.inScope).map((n) => n.name).sort()).toEqual([
      "Database",
      "E-mail System",
      "Mainframe Banking System",
      "Mobile App",
      "Single-Page Application",
    ]);
  });

  test("explicit relationship suppresses derived", () => {
    const pairs = dia(demoWs(), "landscape").edges.map((e) => `${e.source}|${e.target}`);
    expect(pairs.filter((p) => p === "personal-banking-customer|internet-banking-system")).toHaveLength(1);
  });

  test("rename shows in every diagram", () => {
    const ws = demoWs();
    ops.updateElement(ws, emptySidecar(), "mainframe-banking-system", { name: "Core Banking" });
    for (const key of ["landscape", "context-internet-banking-system", "containers-internet-banking-system", "components-api-application"]) {
      expect(names(dia(ws, key)), key).toContain("Core Banking");
    }
  });

  test("breadcrumb", () => {
    expect(dia(demoWs(), "components-api-application").breadcrumb.map((c) => c.key)).toEqual([
      "landscape",
      "context-internet-banking-system",
      "containers-internet-banking-system",
      "components-api-application",
    ]);
  });

  test("drill keys", () => {
    const by = new Map(dia(demoWs(), "landscape").nodes.map((n) => [n.id, n.drillKey]));
    expect(by.get("internet-banking-system")).toBe("containers-internet-banking-system");
    expect(by.get("personal-banking-customer")).toBeNull();
  });

  test("positions are stored in Structurizr units", () => {
    const ws = demoWs();
    diagrams.setPositions(ws, "landscape", { atm: { x: 100, y: 50.4 } });
    const ev = diagrams.findView(ws, "landscape")!.elements.find((e) => e.id === "atm")!;
    expect([ev.x, ev.y]).toEqual([200, 101]);
    const pos = new Map(dia(ws, "landscape").nodes.map((n) => [n.id, n.position]));
    expect(pos.get("atm")).toEqual({ x: 100, y: 50.5 });
  });

  test("opening an unlisted diagram creates its view", () => {
    const ws = demoWs();
    expect(diagrams.findView(ws, "containers-atm")).toBeUndefined();
    diagrams.setPositions(ws, "containers-atm", {});
    expect(diagrams.findView(ws, "containers-atm")).toBeDefined();
    expect(diagrams.diagramList(ws).map((d) => d.key)).toContain("containers-atm");
  });

  test("sync views lists shown elements", () => {
    const ws = demoWs();
    const s = ops.createElement(ws, { kind: "softwareSystem", name: "Fraud Check" });
    ops.createRelationship(ws, { sourceId: "api-application", destinationId: s, description: "Checks payments with" });
    diagrams.syncViews(ws);
    const v = diagrams.findView(ws, "containers-internet-banking-system")!;
    expect(v.elements.map((e) => e.id)).toContain("fraud-check");
    expect(v.relationships.map((r) => r.id)).toContain("api-application--fraud-check");
  });

  test("unknown keys give no diagram", () => {
    const ws = demoWs();
    for (const key of ["nope", "containers-", "containers-nope", "components-atm", "context-api-application"]) {
      expect(diagrams.diagram(ws, key), key).toBeNull();
    }
  });
});

describe("from scratch", () => {
  test("people and systems need a connection outside the landscape", () => {
    const ws = demoWs();
    expect(dia(ws, "landscape").connectRequired).toEqual([]);
    for (const key of ["context-atm", "containers-internet-banking-system", "components-api-application"]) {
      const d = dia(ws, key);
      expect(d.addable, key).toEqual(expect.arrayContaining(["person", "softwareSystem"]));
      expect(d.connectRequired, key).toEqual(["person", "softwareSystem"]);
    }
  });

  test("an unconnected person is not drawn on a container diagram; a connected one is", () => {
    const ws = demoWs();
    const p = ops.createElement(ws, { kind: "person", name: "Auditor" });
    expect(dia(ws, "containers-internet-banking-system").nodes.map((n) => n.id)).not.toContain(p);
    // A relationship to the system itself does not draw it there either (only on the context diagram).
    ops.createRelationship(ws, { sourceId: p, destinationId: "internet-banking-system" });
    expect(dia(ws, "containers-internet-banking-system").nodes.map((n) => n.id)).not.toContain(p);
    expect(dia(ws, "context-internet-banking-system").nodes.map((n) => n.id)).toContain(p);
    const { id: q } = ops.createConnectedElement(ws, { kind: "person", name: "Teller" }, { to: "web-application" });
    expect(dia(ws, "containers-internet-banking-system").nodes.map((n) => n.id)).toContain(q);
  });

  test("every software system is listed with its context and containers diagrams", () => {
    const ws = demoWs();
    const s = ops.createElement(ws, { kind: "softwareSystem", name: "Loans" });
    const list = diagrams.diagramList(ws);
    const keys = list.map((d) => d.key);
    for (const sys of ["atm", "mainframe-banking-system", s]) {
      expect(keys).toContain(`context-${sys}`);
      expect(keys).toContain(`containers-${sys}`);
    }
    expect(list.find((d) => d.key === `containers-${s}`)!.parentKey).toBe(`context-${s}`);
    expect(dia(ws, "landscape").nodes.find((n) => n.id === s)!.drillKey).toBe(`containers-${s}`);
    // Systems keep the order of the model; the first one stays first.
    expect(keys.slice(0, 3)).toEqual(["landscape", "context-internet-banking-system", "containers-internet-banking-system"]);
    // Only diagrams of systems with containers are stored as views.
    diagrams.syncViews(ws);
    expect(diagrams.findView(ws, `context-${s}`)).toBeUndefined();
  });

  test("moving forgets layout the element no longer has", () => {
    const ws = demoWs();
    const sc = emptySidecar();
    diagrams.syncViews(ws);
    diagrams.setPositions(ws, "containers-internet-banking-system", { database: { x: 10, y: 10 }, "web-application": { x: 50, y: 50 } });
    sc.layouts["containers-internet-banking-system"] = {
      sizes: { database: { w: 300, h: 100 }, "web-application": { w: 300, h: 100 } },
      edges: { "derived:api-application->database": { route: "orthogonal" } as never },
      positions: {},
    };
    diagrams.moveWithLayout(ws, sc, "database", "analytics-platform");
    diagrams.syncViews(ws);
    const v = diagrams.findView(ws, "containers-internet-banking-system")!;
    expect(v.elements.map((e) => e.id)).not.toContain("database");
    expect(v.elements.find((e) => e.id === "web-application")).toMatchObject({ x: 100, y: 100 });
    expect(sc.layouts["containers-internet-banking-system"]!.sizes).toEqual({ "web-application": { w: 300, h: 100 } });
    expect(sc.layouts["containers-internet-banking-system"]!.edges).toEqual({});
    // The line now goes to the system the database moved to.
    const edges = dia(ws, "containers-internet-banking-system").edges.map((e) => e.id);
    expect(edges).toContain("derived:api-application->analytics-platform");
    expect(dia(ws, "containers-analytics-platform").nodes.find((n) => n.id === "database")!.inScope).toBe(true);
  });
});
