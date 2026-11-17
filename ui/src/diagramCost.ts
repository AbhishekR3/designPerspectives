import type { Diagram, ElementSummary } from "../../src/shared/types.js";

/** What the cost line of a diagram shows: the diagram's own scope, plus a second row for costly boxes drawn around it. */
export interface DiagramCost {
  /** Cost of the system or container the diagram is about (the sum of the boxes shown on the landscape). */
  total: number;
  /** Cost of boxes shown that are not part of the scope, such as external systems. 0 when there are none. */
  outside: number;
  /** Row label for `outside`: "Outside this system" or "Outside this container". */
  outsideLabel: string;
}

const NODE_KINDS_WITHOUT_COST = new Set(["stage", "file"]);

/**
 * Summing every box on a container diagram would add the neighbouring systems to the system's own cost, so a scoped diagram
 * shows the roll-up of its scope (everything inside it, even objects the diagram does not draw). Costly boxes outside the
 * scope stay visible in their own row, so nothing is hidden. The landscape has no scope and sums the boxes shown; there
 * the boxes are siblings, so their roll-ups do not count anything twice.
 */
export function diagramCost(diagram: Pick<Diagram, "level" | "scope" | "nodes">, elements: Pick<ElementSummary, "id" | "kind" | "costRollup">[]): DiagramCost {
  const nodes = diagram.nodes.filter((n) => !NODE_KINDS_WITHOUT_COST.has(n.kind));
  const sum = (list: { costRollup?: number }[]) => Math.round(list.reduce((s, n) => s + (n.costRollup ?? 0), 0) * 100) / 100;
  const scoped = diagram.level === "context" || diagram.level === "container" || diagram.level === "component";
  const scope = scoped && diagram.scope ? elements.find((e) => e.id === diagram.scope) : undefined;
  if (!scope) return { total: sum(nodes), outside: 0, outsideLabel: "" };
  const outside = sum(nodes.filter((n) => n.id !== scope.id && !n.inScope));
  return { total: scope.costRollup ?? 0, outside, outsideLabel: diagram.level === "component" ? "Outside this container" : "Outside this system" };
}
