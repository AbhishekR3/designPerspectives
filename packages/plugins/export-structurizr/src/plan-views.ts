/**
 * Which views are exported, their Structurizr type and scope, and the relationships behind dynamic steps.
 */
import type { DynamicStep, ViewDef, ViewType } from "@designperspectives/contracts";
import type { Plan, PlanEnvironment, PlanRelationship, SzKind } from "./plan.js";

export type SzViewType = "systemLandscape" | "systemContext" | "container" | "component" | "dynamic" | "deployment";

export interface PlanStep {
  step: DynamicStep;
  rel: PlanRelationship;
  /** 1-based order among exported steps. */
  order: number;
}

export interface PlanView {
  view: ViewDef;
  szType: SzViewType;
  /** Exported scope element id (software system or container), when the view has one. */
  scope?: string;
  env?: PlanEnvironment;
  steps: PlanStep[];
}

interface ViewRule {
  szType: SzViewType;
  /** Allowed Structurizr kinds of the scope; empty = the view takes no scope. */
  scopeKinds: SzKind[];
  scopeRequired: boolean;
}

const RULES: Record<ViewType, ViewRule> = {
  landscape: { szType: "systemLandscape", scopeKinds: [], scopeRequired: false },
  context: { szType: "systemContext", scopeKinds: ["softwareSystem"], scopeRequired: true },
  container: { szType: "container", scopeKinds: ["softwareSystem"], scopeRequired: true },
  component: { szType: "component", scopeKinds: ["container"], scopeRequired: true },
  dynamic: { szType: "dynamic", scopeKinds: ["softwareSystem", "container"], scopeRequired: false },
  deployment: { szType: "deployment", scopeKinds: ["softwareSystem"], scopeRequired: false },
};

type Skip = (kind: string, id: string, title: string | undefined, reason: string) => void;

function resolveScope(plan: Plan, v: ViewDef, rule: ViewRule): { scope?: string; problem?: string } {
  if (rule.scopeKinds.length === 0 || v.scope === undefined) {
    return rule.scopeRequired ? { problem: "view needs a scope" } : {};
  }
  const kind = plan.elements.get(v.scope)?.szKind;
  if (kind && rule.scopeKinds.includes(kind)) return { scope: v.scope };
  return { problem: `scope must be an exported ${rule.scopeKinds.join(" or ")}` };
}

function resolveStep(plan: Plan, s: DynamicStep): PlanRelationship | undefined {
  const candidates = plan.relationships.filter((r) => r.rel.source === s.source && r.rel.target === s.target);
  return candidates.find((r) => r.rel.label === s.label) ?? candidates[0];
}

function resolveSteps(plan: Plan, v: ViewDef, skip: Skip): PlanStep[] {
  const steps: PlanStep[] = [];
  (v.steps ?? []).forEach((step, i) => {
    const rel = resolveStep(plan, step);
    if (rel) steps.push({ step, rel, order: steps.length + 1 });
    else skip("dynamicStep", `${v.id}#${i + 1}`, step.label, "no exported relationship between the step's elements");
  });
  return steps;
}

function resolveEnvironment(plan: Plan, v: ViewDef): { env?: PlanEnvironment; problem?: string } {
  if (v.type !== "deployment") return {};
  const env = plan.environments.find((e) => e.id === v.environment);
  return env ? { env } : { problem: "deployment view needs an exported environment" };
}

function planView(plan: Plan, v: ViewDef, skip: Skip): PlanView | undefined {
  const rule = RULES[v.type];
  const { scope, problem } = resolveScope(plan, v, rule);
  const { env, problem: envProblem } = resolveEnvironment(plan, v);
  const reason = problem ?? envProblem;
  if (reason) {
    skip("view", v.id, v.title, reason);
    return undefined;
  }
  return {
    view: v,
    szType: rule.szType,
    ...(scope !== undefined ? { scope } : {}),
    ...(env ? { env } : {}),
    steps: v.type === "dynamic" ? resolveSteps(plan, v, skip) : [],
  };
}

export function planViews(plan: Plan, views: readonly ViewDef[], skip: Skip): PlanView[] {
  const out: PlanView[] = [];
  for (const v of views) {
    const pv = planView(plan, v, skip);
    if (pv) out.push(pv);
  }
  return out;
}
