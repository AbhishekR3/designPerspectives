import type {
  DeploymentInstance,
  DeploymentNode,
  Diagnostic,
  Element,
  Model,
  Severity,
} from "@designperspectives/contracts";

export interface ValidationOptions {
  /** Extra acronyms considered defined (in addition to the built-in glossary). */
  glossary?: string[];
}

export interface Rule {
  code: string;
  severity: Severity;
  source?: string;
  description: string;
  check(model: Model, opts: ValidationOptions): Diagnostic[];
}

/** What a rule reports before code, severity and source are attached. */
export interface Finding {
  subject: string;
  message: string;
}

export interface RuleMeta {
  code: string;
  severity: Severity;
  source: string;
  description: string;
}

export type FindingsFn = (model: Model, opts: ValidationOptions) => Finding[];

/** Builds a rule whose diagnostics all share the rule's code, severity and source. */
export function defineRule(meta: RuleMeta, find: FindingsFn): Rule {
  return {
    ...meta,
    check: (model, opts) =>
      find(model, opts).map((f) => ({
        severity: meta.severity,
        code: meta.code,
        message: f.message,
        subject: f.subject,
        source: meta.source,
      })),
  };
}

export function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface ModelIndex {
  elements: Map<string, Element>;
  deploymentNodes: Map<string, DeploymentNode>;
  deploymentInstances: Map<string, DeploymentInstance>;
}

function mapById<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    if (!map.has(item.id)) map.set(item.id, item);
  }
  return map;
}

/** Lookup maps built once per rule check. Duplicate ids keep their first occurrence. */
export function indexModel(model: Model): ModelIndex {
  return {
    elements: mapById(model.elements),
    deploymentNodes: mapById(model.deploymentNodes),
    deploymentInstances: mapById(model.deploymentInstances),
  };
}

/** True when `ancestor` is `id` itself or one of its dot-separated ancestors. */
export function isSelfOrAncestor(ancestor: string, id: string): boolean {
  return ancestor === id || id.startsWith(`${ancestor}.`);
}
