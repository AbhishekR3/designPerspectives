import type { Diagnostic, Model } from "@designperspectives/contracts";
import { contractSampleModel } from "@designperspectives/contracts/testing";
import { validateModel, type ValidationOptions } from "./index.js";

export function sample(): Model {
  return contractSampleModel();
}

/** Sample model with `edit` applied. */
export function sampleWith(edit: (m: Model) => void): Model {
  const m = sample();
  edit(m);
  return m;
}

export function diagnosticsFor(model: Model, code: string, opts?: ValidationOptions): Diagnostic[] {
  return validateModel(model, opts).filter((d) => d.code === code);
}

export function subjectsFor(model: Model, code: string, opts?: ValidationOptions): (string | undefined)[] {
  return diagnosticsFor(model, code, opts).map((d) => d.subject);
}
