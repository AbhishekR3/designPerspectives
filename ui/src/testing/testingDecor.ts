import type { AppState, Diagram, Flow, FlowStep, ObservedTrace, TestCall, TestingState } from "../../../src/shared/types.js";

/**
 * What the system testing mode draws on a diagram (no React, no DOM): intercept points, breakpoints, paused calls,
 * calls seen and the hops of a chosen trace. `Canvas` gets the result as one prop and `BoxesAndLines` draws it.
 */

export interface EdgeMark {
  /** An intercept point covers this line: open (listening), or saved (remembered, not started). */
  point: "open" | "saved" | null;
  port: number | null;
  /** A breakpoint on the line: "on" (it can pause calls), "off" (switched off), "hollow" (enabled, but no open point covers the line, so nothing can pause). */
  breakpoint: "on" | "off" | "hollow" | null;
  /** A call is paused on this line, at its request or at its reply. */
  paused: "request" | "response" | null;
  /** Calls in the run log for this line. */
  calls: number;
  /** A trace hop (watched, not paused) runs along this line. */
  watched: boolean;
  ms: number | null;
  error: boolean;
}

export interface NodeMark {
  breakpoint: "on" | "off" | null;
  watched: boolean;
  error: boolean;
  /** Names of boxes a trace shows this box talking to that no relationship covers. */
  notInModel: string[];
  /** A stage of a connector: an intercept point stands in front of it. */
  point?: "open" | "saved" | null;
  port?: number | null;
}

export interface TestingDecor {
  edges: Record<string, EdgeMark>;
  nodes: Record<string, NodeMark>;
}

const emptyEdge = (): EdgeMark => ({ point: null, port: null, breakpoint: null, paused: null, calls: 0, watched: false, ms: null, error: false });
const emptyNode = (): NodeMark => ({ breakpoint: null, watched: false, error: false, notInModel: [], point: null, port: null });

/** The id of a stage box on a connector diagram. */
export const stageNodeId = (relationshipId: string, stageId: string) => `stage:${relationshipId}:${stageId}`;

const isHeld = (c: TestCall) => c.state === "held-request" || c.state === "held-response";

export function testingDecor(diagram: Diagram, appState: AppState, testing: TestingState | null, trace: ObservedTrace | null): TestingDecor {
  const out: TestingDecor = { edges: {}, nodes: {} };
  const edgeOf = (id: string) => (out.edges[id] ??= emptyEdge());
  const nodeOf = (id: string) => (out.nodes[id] ??= emptyNode());
  const nodeIds = new Set(diagram.nodes.map((n) => n.id));
  const parent = new Map(appState.elements.map((e) => [e.id, e.parentId]));
  const nameOf = (id: string) => appState.elements.find((e) => e.id === id)?.name ?? id;
  /** The box of this diagram that stands for an element: the element itself, or its nearest ancestor that is drawn. */
  const boxOf = (id: string): string | null => {
    for (let at: string | null | undefined = id, n = 0; at && n < 50; at = parent.get(at), n++) if (nodeIds.has(at)) return at;
    return null;
  };

  if (testing) {
    const flowSteps = new Map((diagram.flow?.steps ?? []).map((s) => [s.order ?? "", s]));
    for (const edge of diagram.edges) {
      const rels = new Set(edge.relationshipIds);
      if (rels.size === 0) continue;
      const covered = testing.points.filter((p) => !p.stageId && p.members.some((m) => rels.has(m)));
      const open = covered.find((p) => p.state === "open");
      const saved = covered.find((p) => p.state === "saved");
      // A breakpoint on a relationship, or on a step of this flow whose relationship this line is.
      const bps = testing.breakpoints.filter((b) => {
        if (b.on.type === "relationship") return rels.has(b.on.id);
        if (b.on.type === "step") return diagram.flow?.key === b.on.flow && rels.has(flowSteps.get(b.on.order)?.relationshipId ?? "");
        return false;
      });
      const mark = (out.edges[edge.id] ??= emptyEdge());
      if (open) [mark.point, mark.port] = ["open", open.port];
      else if (saved) [mark.point, mark.port] = ["saved", saved.port];
      if (bps.length) {
        const live = bps.some((b) => b.enabled);
        mark.breakpoint = !live ? "off" : open ? "on" : "hollow";
      }
      for (const c of testing.calls) {
        if (c.stageId || !rels.has(c.relationshipId)) continue;
        mark.calls++;
      }
      for (const id of testing.held) {
        const c = testing.calls.find((x) => x.id === id);
        if (!c || c.stageId || !rels.has(c.relationshipId) || !isHeld(c)) continue;
        mark.paused = c.state === "held-response" ? "response" : "request";
        break;
      }
    }
    // Boxes: a breakpoint on an element, or on a stage of a connector (and its point).
    for (const b of testing.breakpoints) {
      if (b.on.type === "element" && nodeIds.has(b.on.id)) {
        const m = nodeOf(b.on.id);
        m.breakpoint = b.enabled ? "on" : (m.breakpoint ?? "off");
      } else if (b.on.type === "stage") {
        const id = stageNodeId(b.on.relationshipId, b.on.stageId);
        if (!nodeIds.has(id)) continue;
        const m = nodeOf(id);
        m.breakpoint = b.enabled ? "on" : (m.breakpoint ?? "off");
      }
    }
    for (const p of testing.points) {
      if (!p.stageId || p.state === "error") continue;
      const id = stageNodeId(p.relationshipId, p.stageId);
      if (!nodeIds.has(id)) continue;
      const m = nodeOf(id);
      if (p.state === "open" || !m.point) [m.point, m.port] = [p.state, p.port];
    }
  }

  if (trace) {
    for (const hop of trace.hops) {
      const span = trace.spans.find((s) => s.spanId === hop.spanId);
      const failed = !!span?.error;
      const from = boxOf(hop.from);
      const to = boxOf(hop.to);
      for (const id of new Set([from, to])) {
        if (!id) continue;
        const m = nodeOf(id);
        m.watched = true;
        m.error = m.error || failed;
      }
      if (hop.relationshipId) {
        const edge = diagram.edges.find((e) => e.relationshipIds.includes(hop.relationshipId!));
        if (!edge) continue;
        const mark = edgeOf(edge.id);
        mark.watched = true;
        mark.ms ??= span?.durationMs ?? null;
        mark.error = mark.error || failed;
      } else if (from && to && from !== to) {
        const add = (box: string, other: string) => {
          const m = nodeOf(box);
          const name = nameOf(other);
          if (!m.notInModel.includes(name)) m.notInModel.push(name);
        };
        add(from, hop.to);
        add(to, hop.from);
      }
    }
  }
  return out;
}

/**
 * The step of a flow that a paused call is: the next step after `cursor` (wrapping round to the first) that uses the
 * call's relationship and travels the same way (a call paused at its reply is a response step).
 */
export function stepForCall(flow: Flow, call: TestCall, cursor: number | null): number | null {
  const response = call.state === "held-response";
  const n = flow.steps.length;
  for (let k = 1; k <= n; k++) {
    const i = ((((cursor ?? -1) + k) % n) + n) % n;
    const s = flow.steps[i];
    if (s && s.relationshipId === call.relationshipId && s.response === response) return i;
  }
  return null;
}

/** Whether a flow step can be paused (an open point covers its relationship), is only seen in the chosen trace, or neither. */
export function stepLiveness(appState: AppState, testing: TestingState | null, trace: ObservedTrace | null, step: FlowStep): "live" | "watched" | "not-live" {
  if (!appState.relationships.some((r) => r.id === step.relationshipId)) return "not-live";
  if (testing?.points.some((p) => p.state === "open" && !p.stageId && p.members.includes(step.relationshipId))) return "live";
  if (trace?.hops.some((h) => h.relationshipId === step.relationshipId)) return "watched";
  return "not-live";
}
