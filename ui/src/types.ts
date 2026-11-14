export * from "../../src/shared/types";
import type { ElementSummary, NodeKind, DiagramLevel } from "../../src/shared/types";

export type Selection = { type: "node"; id: string } | { type: "edge"; id: string } | null;

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
