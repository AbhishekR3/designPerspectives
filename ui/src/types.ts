export * from "../../src/shared/types";
import type { ElementSummary, NodeKind, DiagramLevel } from "../../src/shared/types";

/** The selected box, line, or several boxes at once (two or more; lines are never part of a multi-selection). */
export type Selection = { type: "node"; id: string } | { type: "edge"; id: string } | { type: "nodes"; ids: string[] } | null;

/** A selection of these boxes: none, one, or several. */
export const nodeSelection = (ids: string[]): Selection => (ids.length === 0 ? null : ids.length === 1 ? { type: "node", id: ids[0] } : { type: "nodes", ids });

/** The boxes in a selection (empty when it is a line or nothing). */
export const selectedNodeIds = (s: Selection): string[] => (s?.type === "node" ? [s.id] : s?.type === "nodes" ? s.ids : []);

export const KIND_LABEL: Record<NodeKind, string> = {
  person: "Person",
  softwareSystem: "Software System",
  container: "Container",
  component: "Component",
  stage: "Stage",
  file: "File",
};

export const LEVEL_LABEL: Record<DiagramLevel, string> = {
  landscape: "Landscape",
  context: "Context",
  container: "Container",
  component: "Component",
  code: "Code",
  connector: "Connector",
  flow: "Flow",
};

export function homeDiagramOf(el: ElementSummary): string {
  if (el.kind === "container") return `containers-${el.parentId}`;
  if (el.kind === "component") return `components-${el.parentId}`;
  return "landscape";
}
