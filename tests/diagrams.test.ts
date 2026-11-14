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
