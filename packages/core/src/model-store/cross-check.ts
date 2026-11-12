/** Consistency between sidecars and the model: every sidecar reference must point at something that exists. */
import type { Diagnostic, Model } from "@designperspectives/contracts";
import { relationshipIdOf } from "@designperspectives/contracts";
import type { SidecarSet } from "../sidecars/index.js";

function missing(code: string, file: string, subject: string, what: string): Diagnostic {
  return { severity: "warning", code, file, subject, message: `${what} "${subject}" does not exist in the model.` };
}

type Check = (ctx: { elements: Set<string>; rels: Set<string>; views: Set<string> }, s: SidecarSet) => Diagnostic[];

const CHECKS: Check[] = [
  (c, s) => Object.keys(s.elements).filter((id) => !c.elements.has(id)).map((id) => missing("sidecar/unknown-element", `sidecars/elements/${id}.yaml`, id, "Element")),
  (c, s) => s.relationships.filter((r) => !c.rels.has(r.id)).map((r) => missing("sidecar/unknown-relationship", "sidecars/relationships.yaml", r.id, "Relationship")),
  (c, s) => Object.keys(s.layouts).filter((v) => !c.views.has(v)).map((v) => missing("sidecar/unknown-view", `sidecars/layout/${v}.yaml`, v, "View")),
  (c, s) => (s.codemapping?.rules ?? []).filter((r) => !c.elements.has(r.element)).map((r) => missing("sidecar/unknown-element", "sidecars/codemapping.yaml", r.element, "Element")),
  (c, s) =>
    Object.values(s.adrs).flatMap((adr) => adr.frontMatter.elements.filter((e) => !c.elements.has(e)).map((e) => missing("sidecar/unknown-element", adr.path, e, "Element"))),
];

export function crossCheck(model: Model, s: SidecarSet): Diagnostic[] {
  const ctx = {
    elements: new Set(model.elements.map((e) => e.id)),
    rels: new Set(model.relationships.map(relationshipIdOf)),
    views: new Set(model.views.map((v) => v.id)),
  };
  return CHECKS.flatMap((check) => check(ctx, s));
}
