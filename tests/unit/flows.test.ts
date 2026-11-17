/** Flows stored as Structurizr dynamic views. */

import { describe, expect, test } from "vitest";
import * as flows from "../../src/core/flows.js";
import * as ops from "../../src/core/modelEdits.js";
import { buildIndex, ModelError } from "../../src/core/modelEdits.js";
import { demoWs } from "./helpers.js";

describe("flows", () => {
  test("demo flow", () => {
    const f = flows.listFlows(demoWs()).find((x) => x.title === "Sign in")!;
    expect(f.steps).toHaveLength(6);
    expect(f.steps.map((s) => s.order)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(f.steps[3]!.response).toBe(true);
    expect(f.scope).toBe("api-application");
    expect(f.warnings).toEqual([]);
  });

  test("create and edit flow", () => {
    const ws = demoWs();
    const key = flows.createFlow(ws, "Withdraw cash");
    flows.updateFlow(ws, key, {
      steps: [{ relationshipId: "personal-banking-customer--atm", description: "Asks for cash" }, { relationshipId: "atm--mainframe-banking-system" }],
    });
    const f = flows.listFlows(ws).find((x) => x.key === key)!;
    expect(f.scope).toBeNull(); // people and systems only: unscoped
    expect(f.warnings).toEqual([]);
    const view = ws.views.dynamicViews.find((v) => v.key === key)!;
    expect(view.elements.map((e) => e.id)).toEqual(["personal-banking-customer", "atm", "mainframe-banking-system"]);
  });

  test("unknown relationship rejected", () => {
    const ws = demoWs();
    const key = flows.createFlow(ws, "X");
    expect(() => flows.updateFlow(ws, key, { steps: [{ relationshipId: "nope" }] })).toThrow(ModelError);
  });

  test("scope warning for components of two containers", () => {
    const ws = demoWs();
    const k2 = ops.createElement(ws, { kind: "component", name: "Renderer", parentId: "web-application" });
    ops.createRelationship(ws, { sourceId: k2, destinationId: "sign-in-controller", description: "Calls" });
    const [, warnings] = flows.inferScope(buildIndex(ws), [k2, "sign-in-controller"]);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("more than one container");
  });

  test("deleting relationship removes its steps", () => {
    const ws = demoWs();
    ops.deleteRelationship(ws, "security-component--database");
    flows.syncFlows(ws);
    expect(flows.listFlows(ws).find((x) => x.title === "Sign in")!.steps).toHaveLength(4);
  });

  test("flow diagram", () => {
    const d = flows.flowDiagram(demoWs(), "flow-sign-in")!;
    expect(d.nodes).toHaveLength(4);
    expect(d.edges.find((e) => e.id === "sign-in-controller--security-component")!.steps).toEqual([2, 5]);
  });

  test("flow keys are unique and names required", () => {
    const ws = demoWs();
    expect(flows.createFlow(ws, "Sign in")).toBe("flow-sign-in-2");
    expect(() => flows.createFlow(ws, "  ")).toThrow(ModelError);
  });
});
