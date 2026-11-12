/**
 * Model Validation v1: pure checks of an in-memory Model against C4 structural and notation rules.
 * Diagnostics carry a `subject` (element, relationship, view or deployment id) and no file position;
 * callers map subjects to positions.
 */
import { sortDiagnostics, type Diagnostic, type Model } from "@designperspectives/contracts";
import { FIELD_RULES } from "./field-rules.js";
import { NOTATION_RULES } from "./notation-rules.js";
import { RELATIONSHIP_RULES } from "./relationship-rules.js";
import type { Rule, ValidationOptions } from "./rule.js";
import { STRUCTURE_RULES } from "./structure-rules.js";
import { VIEW_RULES } from "./view-rules.js";

export type { Rule, ValidationOptions } from "./rule.js";
export { BUILT_IN_GLOSSARY } from "./notation-rules.js";

export const RULES: readonly Rule[] = [
  ...STRUCTURE_RULES,
  ...FIELD_RULES,
  ...RELATIONSHIP_RULES,
  ...VIEW_RULES,
  ...NOTATION_RULES,
];

/** Runs every rule and returns the diagnostics in deterministic order. */
export function validateModel(model: Model, opts: ValidationOptions = {}): Diagnostic[] {
  return sortDiagnostics(RULES.flatMap((rule) => rule.check(model, opts)));
}
