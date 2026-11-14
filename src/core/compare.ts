/**
 * A diagram of one model version, marked up against another version: nodes and lines get a
 * `change` (added / changed / removed / changed inside), and objects that only the other version
 * has are added back as read-only **ghosts** at their old positions. If the diagram itself only
 * exists in the other version (its system or container was removed), that version's diagram is
 * returned with everything marked removed.
 */

import { diagram as staticDiagram } from "./diagrams.js";
import { changeMap, type Snapshot } from "./diff.js";
import { flowDiagram } from "./flows.js";
import type { ChangeSet, Diagram, DiagramEdge } from "../shared/types.js";

export function diagramOf(s: Snapshot, key: string, codeRoot: string | null): Diagram | null {
  return staticDiagram(s.workspace, key, s.sidecar, codeRoot) ?? flowDiagram(s.workspace, key, s.sidecar);
}

export function compareDiagram(shown: Snapshot, other: Snapshot, key: string, cs: ChangeSet, codeRoot: string | null): Diagram | null {
  const d = diagramOf(shown, key, codeRoot);
  const o = diagramOf(other, key, codeRoot);
  if (!d && !o) return null;
  const changes = changeMap(cs);

  if (!d) {
    const gone = o!;
    for (const n of gone.nodes) Object.assign(n, { ghost: true, change: "removed" });
    for (const e of gone.edges) Object.assign(e, { ghost: true, change: "removed" });
    gone.compare = { against: cs.against, removed: true };
    gone.addable = [];
    return gone;
  }

  for (const n of d.nodes) {
    const c = changes.get(n.id);
    if (c) n.change = c;
  }
  const otherEdges = new Map((o?.edges ?? []).map((e) => [e.id, e]));
  for (const e of d.edges) {
    const c = edgeChange(e, otherEdges.get(e.id), changes, o !== null);
    if (c) e.change = c;
  }

  if (o) {
    const shownNodes = new Set(d.nodes.map((n) => n.id));
    for (const n of o.nodes) {
      if (shownNodes.has(n.id)) continue;
      d.nodes.push({ ...n, ghost: true, change: "removed", drillKey: null });
    }
    const shownEdges = new Set(d.edges.map((e) => e.id));
    for (const e of o.edges) {
      if (shownEdges.has(e.id)) continue;
      d.edges.push({ ...e, ghost: true, change: "removed", detailKey: null, drillTargets: [] });
    }
  }
  d.compare = { against: cs.against, removed: false };
  return d;
}

function edgeChange(
  e: DiagramEdge,
  before: DiagramEdge | undefined,
  changes: Map<string, string>,
  diagramExisted: boolean,
): DiagramEdge["change"] {
  if (!e.derived) return changes.get(e.id) as DiagramEdge["change"];
  // A derived line stands for several relationships.
  if (diagramExisted && !before) return "added";
  const under = e.relationshipIds.map((id) => changes.get(id)).filter(Boolean);
  if (before && before.relationshipIds.join("\n") !== e.relationshipIds.join("\n")) return "changed";
  if (under.length) return under.every((c) => c === "added") && !before ? "added" : "changed";
  return undefined;
}
