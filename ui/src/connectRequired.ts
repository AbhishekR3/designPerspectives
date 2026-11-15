import type { Diagram, Selection } from "./types";
import { selectedNodeIds } from "./types";

/**
 * Adding a person or software system on a context, container or component diagram: the new box only
 * appears there when it is connected to a box drawn inside (see `connectRequired` of a diagram), so it is
 * created together with a line to that box.
 *
 * On a context diagram that box is the system itself. On a container or component diagram it is the
 * selected box inside the boundary, or the only box inside it.
 */
export type ConnectPlan = { connectTo?: string; connectFrom?: string };

export const NEEDS_BOX = "Select the box it connects to first, then add it.";

/** Boxes drawn inside the boundary that a new person or system can connect to. */
const insideBoxes = (d: Diagram) => d.nodes.filter((n) => n.inScope && !n.ghost && n.id !== d.scope);

/** True when adding this kind here needs a box to connect it to. */
export const needsConnection = (d: Diagram, kind: string) => (d.connectRequired ?? []).includes(kind);

/** Why this kind cannot be added right now (shown on the disabled palette item), or null. */
export function addBlockedReason(d: Diagram, kind: string): string | null {
  if (!needsConnection(d, kind) || d.level === "context") return null;
  if (insideBoxes(d).length > 0) return null;
  return `Add a ${d.level === "container" ? "container" : "component"} first: a ${kind === "person" ? "person" : "system"} here is shown by its connection to a box inside.`;
}

/** The connection a new box of this kind gets: none needed, a target, or why it cannot be added yet. */
export function connectPlan(d: Diagram, kind: string, selection: Selection): { plan: ConnectPlan | null } | { problem: string } {
  if (!needsConnection(d, kind)) return { plan: null };
  // A person uses the box; a software system is used by it.
  const toward = (id: string): ConnectPlan => (kind === "person" ? { connectTo: id } : { connectFrom: id });
  if (d.level === "context") return d.scope ? { plan: toward(d.scope) } : { problem: NEEDS_BOX };
  const boxes = insideBoxes(d);
  const picked = selectedNodeIds(selection).length === 1 ? boxes.find((n) => n.id === selectedNodeIds(selection)[0]) : undefined;
  if (picked) return { plan: toward(picked.id) };
  if (boxes.length === 1) return { plan: toward(boxes[0].id) };
  return { problem: boxes.length === 0 ? (addBlockedReason(d, kind) ?? NEEDS_BOX) : NEEDS_BOX };
}
