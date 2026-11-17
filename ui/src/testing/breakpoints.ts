import { shortId, type TestingActions } from "../hooks/useTesting";
import type { AppState, Breakpoint, BreakpointTarget, Diagram, Selection, TestingState } from "../types";

/** The address an element runs at: its own, or the nearest parent's that has one. */
export function targetOf(state: AppState, elementId: string): { url: string; elementId: string } | null {
  for (let id: string | null = elementId, n = 0; id && n < 50; n++) {
    const el = state.elements.find((e) => e.id === id);
    if (!el) return null;
    if (el.runUrl) return { url: el.runUrl, elementId: el.id };
    id = el.parentId;
  }
  return null;
}

export function sameTarget(a: BreakpointTarget, b: BreakpointTarget): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "step" && b.type === "step") return a.flow === b.flow && a.order === b.order;
  if (a.type === "stage" && b.type === "stage") return a.relationshipId === b.relationshipId && a.stageId === b.stageId;
  return (a as { id: string }).id === (b as { id: string }).id;
}

/** What a breakpoint set on the selected line or box is on: one relationship each for a line, an element for a box, a stage for a stage box. */
export function targetsOf(sel: Selection, diagram: Diagram | null, state: AppState): BreakpointTarget[] {
  if (!diagram) return [];
  if (sel?.type === "edge") {
    const e = diagram.edges.find((x) => x.id === sel.id);
    return e && !e.ghost ? e.relationshipIds.map((id) => ({ type: "relationship", id })) : [];
  }
  if (sel?.type === "node") {
    const n = diagram.nodes.find((x) => x.id === sel.id);
    if (!n || n.ghost) return [];
    if (n.kind === "stage") return diagram.scope && n.stageId ? [{ type: "stage", relationshipId: diagram.scope, stageId: n.stageId }] : [];
    return state.elements.some((x) => x.id === n.id) ? [{ type: "element", id: n.id }] : [];
  }
  return [];
}

/** The breakpoints on these targets. */
export const breakpointsOn = (testing: TestingState, targets: BreakpointTarget[]): Breakpoint[] => testing.breakpoints.filter((b) => targets.some((t) => sameTarget(t, b.on)));

/** Set a breakpoint on every target, or take them all away when there are some. */
export function toggleBreakpoints(testing: TestingState, targets: BreakpointTarget[], actions: TestingActions) {
  if (targets.length === 0) return;
  const have = breakpointsOn(testing, targets);
  if (have.length) return actions.setBreakpoints(testing.breakpoints.filter((b) => !have.includes(b)));
  const added = targets.map((on): Breakpoint => ({ id: shortId(), on, phase: "request", conditions: [], enabled: true }));
  return actions.setBreakpoints([...testing.breakpoints, ...added]);
}

/** Change the same thing on the breakpoints on these targets (the phase, the conditions). */
export function patchBreakpoints(testing: TestingState, targets: BreakpointTarget[], patch: Partial<Breakpoint>, actions: TestingActions) {
  return actions.setBreakpoints(testing.breakpoints.map((b) => (targets.some((t) => sameTarget(t, b.on)) ? { ...b, ...patch } : b)));
}
