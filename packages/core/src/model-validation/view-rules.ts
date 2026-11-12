import {
  kindLabel,
  type DynamicStep,
  type ElementKind,
  type Model,
  type ViewDef,
  type ViewType,
} from "@designperspectives/contracts";
import { defineRule, indexModel, isBlank, isSelfOrAncestor, type Finding, type ModelIndex, type Rule } from "./rule.js";

export const VIEW_TITLE_PREFIXES: Readonly<Record<ViewType, string>> = {
  landscape: "System Landscape View",
  context: "System Context View:",
  container: "Container View:",
  component: "Component View:",
  dynamic: "Dynamic View:",
  deployment: "Deployment View:",
};

export const viewTitleFormatRule = defineRule(
  {
    code: "view/title-format",
    severity: "warning",
    source: "[C4 p.98]",
    description: "View titles state the view type and scope, e.g. \"Container View: Internet Banking System\".",
  },
  (model) =>
    model.views.flatMap((v) => {
      const prefix = VIEW_TITLE_PREFIXES[v.type];
      if (prefix === undefined || isBlank(v.title) || v.title.trim().startsWith(prefix)) return [];
      return [{ subject: v.id, message: `View "${v.id}" has title "${v.title}"; start it with "${prefix}" followed by the scope.` }];
    }),
);

function scopeKindFinding(v: ViewDef, index: ModelIndex, kind: ElementKind): string | undefined {
  const label = kindLabel(kind).toLowerCase();
  if (isBlank(v.scope)) return `needs a scope that is a ${label}; set "scope" to its id`;
  const scope = index.elements.get(v.scope ?? "");
  if (!scope) return `has scope "${v.scope}", which is not a defined element; set "scope" to the id of a ${label}`;
  if (scope.kind !== kind) return `has scope "${v.scope}", which is a ${kindLabel(scope.kind).toLowerCase()}; set "scope" to the id of a ${label}`;
  return undefined;
}

function dynamicScopeFinding(v: ViewDef, index: ModelIndex): string | undefined {
  if (isBlank(v.scope)) return 'needs a scope; set "scope" to the id of the element whose behaviour it shows';
  if (index.elements.has(v.scope ?? "")) return undefined;
  return `has scope "${v.scope}", which is not a defined element; set "scope" to an existing element id`;
}

function deploymentScopeFinding(v: ViewDef, index: ModelIndex): string | undefined {
  if (isBlank(v.environment)) return 'needs an environment; set "environment" to the id of a deployment environment';
  if (index.deploymentNodes.get(v.environment ?? "")?.kind === "environment") return undefined;
  return `has environment "${v.environment}", which is not a defined deployment environment; set it to an existing environment id`;
}

function landscapeScopeFinding(v: ViewDef): string | undefined {
  return isBlank(v.scope) ? undefined : `has scope "${v.scope}", but a system landscape view has no scope; remove "scope"`;
}

const SCOPE_CHECKS: Readonly<Record<ViewType, (v: ViewDef, index: ModelIndex) => string | undefined>> = {
  landscape: landscapeScopeFinding,
  context: (v, index) => scopeKindFinding(v, index, "softwareSystem"),
  container: (v, index) => scopeKindFinding(v, index, "softwareSystem"),
  component: (v, index) => scopeKindFinding(v, index, "container"),
  dynamic: dynamicScopeFinding,
  deployment: deploymentScopeFinding,
};

export const viewScopeRule = defineRule(
  {
    code: "view/scope",
    severity: "error",
    source: "[spec 04 §2, C4 p.98]",
    description: "Each view type has a scope (or environment) of the right kind; landscape views have none.",
  },
  (model) => {
    const index = indexModel(model);
    return model.views.flatMap((v) => {
      const problem = SCOPE_CHECKS[v.type]?.(v, index);
      return problem ? [{ subject: v.id, message: `${VIEW_TITLE_PREFIXES[v.type].replace(":", "")} "${v.id}" ${problem}.` }] : [];
    });
  },
);

function dynamicViews(model: Model): ViewDef[] {
  return model.views.filter((v) => v.type === "dynamic");
}

function stepEndpointFindings(v: ViewDef, step: DynamicStep, n: number, index: ModelIndex): Finding[] {
  return (["source", "target"] as const)
    .filter((role) => !index.elements.has(step[role]))
    .map((role) => ({
      subject: v.id,
      message: `Step ${n} of dynamic view "${v.id}" has ${role} "${step[role]}", which is not a defined element; correct the id or define the element.`,
    }));
}

function dynamicStepFindings(v: ViewDef, index: ModelIndex): Finding[] {
  const steps = v.steps ?? [];
  if (steps.length === 0) {
    return [{ subject: v.id, message: `Dynamic view "${v.id}" has no steps; add at least one numbered interaction.` }];
  }
  return steps.flatMap((step, i) => stepEndpointFindings(v, step, i + 1, index));
}

export const dynamicStepsRule = defineRule(
  {
    code: "view/dynamic-steps",
    severity: "error",
    source: "[spec 04 §2]",
    description: "Dynamic views have at least one step and every step refers to existing elements.",
  },
  (model) => {
    const index = indexModel(model);
    return dynamicViews(model).flatMap((v) => dynamicStepFindings(v, index));
  },
);

/** A relationship models a step when it links the step's endpoints, or their ancestors, in either direction. */
function isModelled(step: DynamicStep, model: Model): boolean {
  return model.relationships.some(
    (r) =>
      (isSelfOrAncestor(r.source, step.source) && isSelfOrAncestor(r.target, step.target)) ||
      (isSelfOrAncestor(r.source, step.target) && isSelfOrAncestor(r.target, step.source)),
  );
}

function unmodelledFindings(v: ViewDef, model: Model, index: ModelIndex): Finding[] {
  return (v.steps ?? []).flatMap((step, i) => {
    if (!index.elements.has(step.source) || !index.elements.has(step.target) || isModelled(step, model)) return [];
    return [
      {
        subject: v.id,
        message: `Step ${i + 1} of dynamic view "${v.id}" ("${step.source}" to "${step.target}") has no matching relationship in the model; add a relationship between them or their parents.`,
      },
    ];
  });
}

export const dynamicUnmodelledRule = defineRule(
  {
    code: "view/dynamic-unmodelled",
    severity: "warning",
    source: "[spec 04 §2]",
    description: "Every dynamic-view step corresponds to a modelled relationship (between the endpoints or their ancestors).",
  },
  (model) => {
    const index = indexModel(model);
    return dynamicViews(model).flatMap((v) => unmodelledFindings(v, model, index));
  },
);

export const VIEW_RULES: readonly Rule[] = [viewTitleFormatRule, viewScopeRule, dynamicStepsRule, dynamicUnmodelledRule];
