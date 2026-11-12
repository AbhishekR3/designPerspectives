/** Element-id refactor on the in-memory model (spec file 04 §3: an id change is an explicit, atomic refactor). */
import type { Model, ViewDef } from "@designperspectives/contracts";
import { renameElementId } from "../sidecars/index.js";

function renameInclude(entry: string, from: string, to: string): string {
  // View predicates: `*`, `<id>`, `<id>.*`, `<id>.**`, `a -> b`.
  return entry
    .split(/(\s*->\s*|\s*,\s*)/)
    .map((part) => {
      const m = /^([a-z][a-zA-Z0-9.-]*?)(\.\*\*|\.\*|\._)?$/.exec(part);
      return m ? renameElementId(m[1]!, from, to) + (m[2] ?? "") : part;
    })
    .join("");
}

function renameView(v: ViewDef, from: string, to: string): ViewDef {
  const r = (id: string): string => renameElementId(id, from, to);
  return {
    ...v,
    ...(v.scope ? { scope: r(v.scope) } : {}),
    include: v.include.map((i) => renameInclude(i, from, to)),
    ...(v.exclude ? { exclude: v.exclude.map((i) => renameInclude(i, from, to)) } : {}),
    ...(v.steps ? { steps: v.steps.map((s) => ({ ...s, source: r(s.source), target: r(s.target) })) } : {}),
  };
}

export function renameElementInModel(model: Model, from: string, to: string): Model {
  const r = (id: string): string => renameElementId(id, from, to);
  return {
    elements: model.elements.map((e) => ({ ...e, id: r(e.id) })),
    relationships: model.relationships.map((x) => ({ ...x, source: r(x.source), target: r(x.target) })),
    deploymentNodes: model.deploymentNodes,
    deploymentInstances: model.deploymentInstances.map((i) => ({ ...i, of: r(i.of) })),
    views: model.views.map((v) => renameView(v, from, to)),
  };
}
