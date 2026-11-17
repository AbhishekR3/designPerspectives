/** System testing mode marks (ui/src/testing/testingDecor.ts): points, breakpoints, paused calls, trace hops, and the flow helpers stepForCall and stepLiveness. */
import { describe, expect, test } from "vitest";
import { stepForCall, stepLiveness, testingDecor } from "../../ui/src/testing/testingDecor.js";
import type { AppState, Diagram, Flow, InterceptPoint, ObservedTrace, TestCall, TestingState } from "../../src/shared/types.js";

const el = (id: string, parentId: string | null = null) => ({ id, name: id.toUpperCase(), parentId }) as never;
const state = {
  elements: [el("web"), el("api"), el("payments", "api"), el("ctrl", "payments"), el("db"), el("cache")],
  relationships: [{ id: "web--api" }, { id: "web--db" }],
} as unknown as AppState;

const diagram = {
  key: "containers-x",
  level: "container",
  scope: null,
  nodes: [{ id: "web" }, { id: "api" }, { id: "db" }],
  edges: [
    { id: "e1", source: "web", target: "api", relationshipIds: ["web--api", "web--api-2"] },
    { id: "e2", source: "web", target: "db", relationshipIds: ["web--db"] },
  ],
} as unknown as Diagram;

const point = (over: Partial<InterceptPoint> = {}): InterceptPoint => ({
  id: "web--api",
  relationshipId: "web--api",
  members: ["web--api", "web--api-2"],
  callerId: "web",
  targetElementId: "api",
  target: "http://127.0.0.1:3000/",
  port: 4100,
  url: "http://127.0.0.1:4100",
  state: "open",
  ...over,
});
const call = (over: Partial<TestCall> = {}): TestCall =>
  ({
    id: "c1",
    seq: 1,
    pointId: "web--api",
    relationshipId: "web--api-2",
    method: "POST",
    path: "/x",
    endpoint: null,
    suggested: null,
    state: "done",
    start: 0,
    durationMs: 5,
    status: 200,
    traceId: null,
    edited: false,
    ...over,
  }) as TestCall;
const testing = (over: Partial<TestingState> = {}): TestingState => ({
  available: true,
  version: 1,
  points: [],
  breakpoints: [],
  watches: [],
  calls: [],
  held: [],
  stepping: false,
  options: { holdSeconds: 60 },
  watchValues: {},
  ...over,
});
const bp = (id: string, relId: string, enabled = true) => ({ id, on: { type: "relationship" as const, id: relId }, phase: "request" as const, conditions: [], enabled });

describe("testingDecor", () => {
  test("nothing to show without testing state or a trace", () => {
    expect(testingDecor(diagram, state, null, null)).toEqual({ edges: {}, nodes: {} });
  });

  test("an open point marks the line that holds any of its members, with its port", () => {
    const d = testingDecor(diagram, state, testing({ points: [point()] }), null);
    expect(d.edges.e1).toMatchObject({ point: "open", port: 4100, breakpoint: null, paused: null });
    expect(d.edges.e2?.point ?? null).toBeNull();
  });

  test("a saved point is marked as saved", () => {
    const d = testingDecor(diagram, state, testing({ points: [point({ state: "saved", url: null })] }), null);
    expect(d.edges.e1).toMatchObject({ point: "saved", port: 4100 });
  });

  test("a breakpoint is on with an open point, hollow without one, and off when switched off", () => {
    const on = testingDecor(diagram, state, testing({ points: [point()], breakpoints: [bp("b", "web--api-2")] }), null);
    expect(on.edges.e1?.breakpoint).toBe("on");
    const hollow = testingDecor(diagram, state, testing({ breakpoints: [bp("b", "web--api")] }), null);
    expect(hollow.edges.e1?.breakpoint).toBe("hollow");
    const saved = testingDecor(diagram, state, testing({ points: [point({ state: "saved", url: null })], breakpoints: [bp("b", "web--api")] }), null);
    expect(saved.edges.e1?.breakpoint).toBe("hollow");
    const off = testingDecor(diagram, state, testing({ points: [point()], breakpoints: [bp("b", "web--api", false)] }), null);
    expect(off.edges.e1?.breakpoint).toBe("off");
  });

  test("a breakpoint on an element marks its box; one on a relationship the diagram does not draw marks nothing", () => {
    const d = testingDecor(diagram, state, testing({ breakpoints: [{ id: "n", on: { type: "element", id: "api" }, phase: "both", conditions: [], enabled: true }, bp("x", "other")] }), null);
    expect(d.nodes.api?.breakpoint).toBe("on");
    expect(d.edges.e1?.breakpoint ?? null).toBeNull();
  });

  test("a paused request or reply marks the line, and calls are counted", () => {
    const calls = [call({ id: "a", state: "held-request" }), call({ id: "b", seq: 2, state: "done" })];
    const request = testingDecor(diagram, state, testing({ points: [point()], calls, held: ["a"] }), null);
    expect(request.edges.e1).toMatchObject({ paused: "request", calls: 2 });
    const reply = testingDecor(diagram, state, testing({ points: [point()], calls: [call({ id: "a", state: "held-response" })], held: ["a"] }), null);
    expect(reply.edges.e1?.paused).toBe("response");
  });

  test("on a connector diagram, stage breakpoints and stage points mark the stage box, not a line", () => {
    const connector = { ...diagram, level: "connector", scope: "web--api", nodes: [{ id: "stage:web--api:s1" }], edges: [] } as unknown as Diagram;
    const t = testing({
      points: [point({ id: "stage:web--api:s1", stageId: "s1", relationshipId: "web--api", members: ["web--api"] })],
      breakpoints: [{ id: "s", on: { type: "stage", relationshipId: "web--api", stageId: "s1" }, phase: "request", conditions: [], enabled: true }],
    });
    const d = testingDecor(connector, state, t, null);
    expect(d.nodes["stage:web--api:s1"]).toMatchObject({ breakpoint: "on", point: "open", port: 4100 });
  });

  const trace = {
    traceId: "t",
    hops: [
      { from: "web", to: "api", spanId: "s1", relationshipId: "web--api" },
      { from: "ctrl", to: "cache", spanId: "s2", relationshipId: null },
    ],
    spans: [
      { spanId: "s1", durationMs: 12, error: null },
      { spanId: "s2", durationMs: 3, error: "boom" },
    ],
  } as unknown as ObservedTrace;

  test("a trace hop marks the line it uses as watched, with its duration", () => {
    const d = testingDecor(diagram, state, null, trace);
    expect(d.edges.e1).toMatchObject({ watched: true, ms: 12, error: false });
    expect(d.nodes.web?.watched).toBe(true);
  });

  test("a hop the model has no relationship for adds the other end to both boxes, mapped to the nearest box drawn", () => {
    const d = testingDecor(diagram, state, null, trace);
    // ctrl is inside payments, inside api (drawn); cache is not drawn and has no drawn ancestor, so there is no box to mark for it.
    expect(d.nodes.api?.notInModel ?? []).toEqual([]);
    const withCache = { ...diagram, nodes: [...diagram.nodes, { id: "cache" }] } as unknown as Diagram;
    const d2 = testingDecor(withCache, state, null, trace);
    expect(d2.nodes.api?.notInModel).toEqual(["CACHE"]);
    expect(d2.nodes.cache?.notInModel).toEqual(["CTRL"]);
    expect(d2.nodes.api?.error).toBe(true);
  });
});

describe("stepForCall", () => {
  const flow = {
    steps: [
      { relationshipId: "a", response: false },
      { relationshipId: "b", response: false },
      { relationshipId: "b", response: true },
      { relationshipId: "a", response: true },
    ],
  } as unknown as Flow;
  test("finds the next matching step after the cursor and wraps round", () => {
    expect(stepForCall(flow, call({ relationshipId: "b" }), null)).toBe(1);
    expect(stepForCall(flow, call({ relationshipId: "a" }), 0)).toBe(0);
    expect(stepForCall(flow, call({ relationshipId: "a" }), null)).toBe(0);
  });
  test("a call paused at its reply is a response step", () => {
    expect(stepForCall(flow, call({ relationshipId: "b", state: "held-response" }), null)).toBe(2);
    expect(stepForCall(flow, call({ relationshipId: "a", state: "held-response" }), 1)).toBe(3);
  });
  test("no step for a relationship the flow does not use", () => {
    expect(stepForCall(flow, call({ relationshipId: "zzz" }), null)).toBeNull();
    expect(stepForCall({ steps: [] } as unknown as Flow, call(), null)).toBeNull();
  });
});

describe("stepLiveness", () => {
  const step = { relationshipId: "web--api", response: false, description: "" };
  test("live when an open point covers the relationship", () => {
    expect(stepLiveness(state, testing({ points: [point()] }), null, step)).toBe("live");
  });
  test("watched when only the trace has a hop for it", () => {
    expect(stepLiveness(state, testing({ points: [point({ state: "saved" })] }), { hops: [{ relationshipId: "web--api" }] } as unknown as ObservedTrace, step)).toBe("watched");
  });
  test("not live otherwise", () => {
    expect(stepLiveness(state, testing(), null, step)).toBe("not-live");
    expect(stepLiveness(state, null, null, step)).toBe("not-live");
    expect(stepLiveness(state, testing({ points: [point()] }), null, { ...step, relationshipId: "gone" })).toBe("not-live");
  });
});
