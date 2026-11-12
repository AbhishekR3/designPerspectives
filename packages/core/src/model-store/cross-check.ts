/** Consistency between sidecars and the model: every sidecar reference must point at something that exists. */
import type { Diagnostic, Model } from "@designperspectives/contracts";
import { relationshipIdOf } from "@designperspectives/contracts";
import type { SidecarSet } from "../sidecars/index.js";

function missing(code: string, file: string, subject: string, what: string): Diagnostic {
  return { severity: "warning", code, file, subject, message: `${what} "${subject}" does not exist in the model.` };
}

export function crossCheck(model: Model, s: SidecarSet): Diagnostic[] {
  const elements = new Set(model.elements.map((e) => e.id));
  const rels = new Set(model.relationships.map(relationshipIdOf));
  const views = new Set(model.views.map((v) => v.id));
  const out: Diagnostic[] = [];
  for (const id of Object.keys(s.elements)) if (!elements.has(id)) out.push(missing("sidecar/unknown-element", `sidecars/elements/${id}.yaml`, id, "Element"));
  for (const r of s.relationships) if (!rels.has(r.id)) out.push(missing("sidecar/unknown-relationship", "sidecars/relationships.yaml", r.id, "Relationship"));
  for (const v of Object.keys(s.layouts)) if (!views.has(v)) out.push(missing("sidecar/unknown-view", `sidecars/layout/${v}.yaml`, v, "View"));
  for (const rule of s.codemapping?.rules ?? []) if (!elements.has(rule.element)) out.push(missing("sidecar/unknown-element", "sidecars/codemapping.yaml", rule.element, "Element"));
  for (const adr of Object.values(s.adrs)) {
    for (const e of adr.frontMatter.elements) if (!elements.has(e)) out.push(missing("sidecar/unknown-element", adr.path, e, "Element"));
  }
  return out;
}
