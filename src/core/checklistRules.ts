/**
 * The checks dp makes itself for checklist items with a rule (DEC-084). The model rules read the version shown
 * (main, a draft, or a git version); the import rules read the project's import files (`architecture/import/`),
 * which belong to main. Each result says how many things fail and which elements and relationships they are, so
 * the checklist can show them one by one.
 *
 * Every rule is cheap: the model rules walk the index once, the import rules read small JSON files. A file that
 * cannot be read makes its rule fail with the reason, never the whole checklist.
 */

import { listFlows } from "./flows.js";
import { buildIndex, CODE_KEY, getJson, type Index } from "./modelEdits.js";
import { errors as modelErrors } from "./validate.js";
import type { Sidecar } from "./designPerspectivesFile.js";
import type { Workspace } from "./workspace.js";
import type { ChecklistCheck, ChecklistRule, Decision } from "../shared/types.js";
import { intakeUnanswered, readState } from "../import/analysis.js";
import { readIntake } from "../import/intake.js";
import { lowConfidence, readReview } from "../import/review.js";
import { readEvidence } from "../import/scan.js";
import { unmappedCodeWarnings } from "../import/unmappedCode.js";

/** "1 line", "3 lines". */
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** At most this many failing IDs are sent with a result. */
export const MAX_IDS = 50;

export interface RuleEnv {
  workspace: Workspace;
  sidecar: Sidecar;
  decisions: Decision[];
  /** The project folder (the one that holds `architecture/`). */
  root: string;
  /** The model folder of main (`architecture/`), where the import reviews are kept. */
  modelDir: string;
  /** The IDs of the drafts there are. */
  draftIds: string[];
}

const pass = (detail: string): ChecklistCheck => ({ passing: true, count: 0, detail, ids: [] });
const fail = (count: number, detail: string, ids: string[] = []): ChecklistCheck => ({ passing: false, count, detail, ids: ids.slice(0, MAX_IDS) });

/** Names of the first few, for a detail line. */
function names(idx: Index, ids: string[]): string {
  const shown = ids.slice(0, 3).map((id) => idx.elements.get(id)?.name ?? relName(idx, id));
  return ids.length > 3 ? `${shown.join(", ")} and ${ids.length - 3} more` : shown.join(", ");
}

function relName(idx: Index, id: string): string {
  const r = idx.relationships.get(id);
  if (!r) return id;
  return `${idx.elements.get(r.sourceId)?.name ?? r.sourceId} → ${idx.elements.get(r.destinationId)?.name ?? r.destinationId}`;
}

type Check = (env: RuleEnv, idx: Index | null) => ChecklistCheck;

const needIndex =
  (f: (env: RuleEnv, idx: Index) => ChecklistCheck): Check =>
  (env, idx) =>
    idx ? f(env, idx) : fail(1, "The model has two objects with the same ID; fix that first.");

const ofKind = (idx: Index, ...kinds: string[]) => [...idx.elements.keys()].filter((id) => kinds.includes(idx.kindOf(id)));

const RULES: Record<ChecklistRule, Check> = {
  people: needIndex((_, idx) => (ofKind(idx, "person").length ? pass(`${plural(ofKind(idx, "person").length, "person", "people")} in the model.`) : fail(1, "No person in the model yet."))),

  containers: needIndex((_, idx) => {
    const own = ofKind(idx, "softwareSystem").filter((id) => !idx.isExternal(id));
    if (!own.length) return fail(1, "No system of your own yet (a system that is not external).");
    const empty = own.filter((id) => !idx.childrenOf(id).length);
    return empty.length ? fail(empty.length, `${plural(empty.length, "system")} without containers: ${names(idx, empty)}.`, empty) : pass("Every system of yours has containers.");
  }),

  descriptions: needIndex((_, idx) => {
    const missing = [...idx.elements.keys()].filter((id) => !(idx.el(id).description ?? "").trim());
    return missing.length ? fail(missing.length, `${plural(missing.length, "object")} without a description: ${names(idx, missing)}.`, missing) : pass("Every object has a description.");
  }),

  technology: needIndex((_, idx) => {
    const missing = ofKind(idx, "container", "component").filter((id) => !(idx.el(id).technology ?? "").trim());
    return missing.length
      ? fail(missing.length, `${plural(missing.length, "container or component", "containers and components")} without a technology: ${names(idx, missing)}.`, missing)
      : pass("Every container and component has a technology.");
  }),

  labels: needIndex((_, idx) => {
    const bad = [...idx.relationships.values()].filter((r) => {
      const d = (r.description ?? "").trim().toLowerCase();
      return !d || d === "uses";
    });
    const ids = bad.map((r) => r.id);
    return ids.length ? fail(ids.length, `${plural(ids.length, "line")} with no label or "Uses": ${names(idx, ids)}.`, ids) : pass("Every line says what flows.");
  }),

  "code-paths": needIndex((_, idx) => {
    const missing = ofKind(idx, "container", "component").filter((id) => !idx.isExternal(id) && !getJson<string>(idx.el(id), CODE_KEY).length);
    return missing.length
      ? fail(missing.length, `${plural(missing.length, "container or component", "containers and components")} not mapped to code: ${names(idx, missing)}.`, missing)
      : pass("Every container and component of yours is mapped to code.");
  }),

  decisions: (env) => (env.decisions.length ? pass(`${plural(env.decisions.length, "decision record")}.`) : fail(1, "No decision record yet.")),

  flows: (env) => {
    let n = 0;
    try {
      n = listFlows(env.workspace).length;
    } catch {
      /* counted as none */
    }
    return n ? pass(`${plural(n, "flow")}.`) : fail(1, "No flow yet.");
  },

  "model-errors": (env) => {
    const errs = modelErrors(env.workspace, env.sidecar, env.decisions);
    return errs.length ? fail(errs.length, `${plural(errs.length, "problem")}. First: ${errs[0]}`) : pass("dp finds no problem in the model.");
  },

  intake: (env) => {
    const { intake, errors } = readIntake(env.root);
    if (errors.length) return fail(errors.length, `The intake has problems: ${errors[0]!.path ? `${errors[0]!.path} ` : ""}${errors[0]!.message}`);
    const left = intakeUnanswered(intake);
    return left.length ? fail(left.length, `Not answered yet: ${left.join(", ")}.`) : pass("The intake is answered.");
  },

  scan: (env) => {
    try {
      const ev = readEvidence(env.root);
      return ev ? pass("The code was scanned.") : fail(1, "The code has not been scanned yet.");
    } catch (e) {
      return fail(1, `The scan cannot be read: ${(e as Error).message}`);
    }
  },

  "level-c1": (env) => levelFinal(env, "c1", "The system context (C1)"),
  "level-c2": (env) => levelFinal(env, "c2", "The containers (C2)"),
  "level-c3": (env) => levelFinal(env, "c3", "The components (C3)"),

  review: (env) => {
    let items = 0;
    let drafts = 0;
    for (const id of env.draftIds) {
      let n: number;
      try {
        const state = readReview(env.modelDir, id);
        n = state ? lowConfidence(state).length : 0;
      } catch {
        n = 0; // an unreadable review is refused on apply anyway
      }
      if (n) {
        items += n;
        drafts++;
      }
    }
    return items ? fail(items, `${plural(items, "unverified item")} wait in ${plural(drafts, "import draft")}.`) : pass("No unverified import item waits.");
  },

  unmapped: (env) => {
    let warnings: string[];
    try {
      warnings = unmappedCodeWarnings(env.root, env.workspace);
    } catch (e) {
      return fail(1, `The scan cannot be read: ${(e as Error).message}`);
    }
    return warnings.length ? fail(warnings.length, warnings[0]!) : pass("No source file is left outside the components.");
  },
};

function levelFinal(env: RuleEnv, level: "c1" | "c2" | "c3", what: string): ChecklistCheck {
  try {
    return readState(env.root).levels[level] ? pass(`${what} is marked final.`) : fail(1, `${what} is not marked final yet (Import code page).`);
  } catch (e) {
    return fail(1, `The import state cannot be read: ${(e as Error).message}`);
  }
}

/** The result of each rule asked for. */
export function checkRules(rules: Iterable<ChecklistRule>, env: RuleEnv): Partial<Record<ChecklistRule, ChecklistCheck>> {
  let idx: Index | null;
  try {
    idx = buildIndex(env.workspace);
  } catch {
    idx = null; // duplicate IDs: the model rules say so
  }
  const out: Partial<Record<ChecklistRule, ChecklistCheck>> = {};
  for (const r of new Set(rules)) out[r] = RULES[r](env, idx);
  return out;
}
