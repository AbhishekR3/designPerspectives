/**
 * Entry point used by both writers: the export plan plus a record of view selectors that match nothing
 * exported (so nothing is dropped silently).
 */
import type { Model } from "@designperspectives/contracts";
import type { Plan } from "./plan.js";
import { buildPlan } from "./plan.js";
import { resolveSelector } from "./membership.js";

function recordUnresolvedSelectors(plan: Plan): void {
  for (const pv of plan.views) {
    if (pv.szType === "dynamic") continue;
    const selectors = [...pv.view.include.map((s) => ["include", s]), ...(pv.view.exclude ?? []).map((s) => ["exclude", s])];
    for (const [verb, sel] of selectors) {
      if (sel === "*" || resolveSelector(plan, pv, sel!).length > 0) continue;
      plan.notExported.push({ kind: "viewSelector", id: `${pv.view.id}: ${verb} ${sel}`, reason: "matches no exported element" });
    }
  }
}

export function exportPlan(model: Model, viewIds?: readonly string[]): Plan {
  const plan = buildPlan(model, viewIds);
  recordUnresolvedSelectors(plan);
  return plan;
}
