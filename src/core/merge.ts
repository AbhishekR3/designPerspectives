/**
 * Three-way merge of model units (see `units.ts`), used to apply a draft to the main model.
 *
 * `base` is the main model as it was when the draft was made, `ours` is main now, `theirs` is the
 * draft. Per unit: if only one side changed it, that side wins; if both made the same change, it
 * is kept; if both changed it differently, that is a conflict and nothing is applied. Positions
 * and other layout data never conflict: the draft's layout wins (it is cheap to redo).
 *
 * After the per-unit merge, references are checked: an element inside a removed element, a
 * relationship to a removed element, or a flow step over a removed relationship is a conflict.
 * Model rules (unique names, ...) are checked by the caller when the result is saved.
 */

import { isLayoutUnit, sameUnit, unitLabel, type Unit, type Units } from "./units.js";
import type { Conflict } from "../shared/types.js";

export interface MergeNames {
  ours: string;
  theirs: string;
}

export interface MergeResult {
  units: Units;
  conflicts: Conflict[];
}

export function merge3(base: Units, ours: Units, theirs: Units, names: MergeNames = { ours: "main", theirs: "the draft" }): MergeResult {
  const conflicts: Conflict[] = [];
  const chosen = new Map<string, Unit>();

  for (const key of keyOrder(ours, theirs)) {
    const b = base.get(key);
    const o = ours.get(key);
    const t = theirs.get(key);
    let pick: Unit | undefined;
    if (sameUnit(o, t)) pick = o;
    else if (sameUnit(b, o)) pick = t;
    else if (sameUnit(b, t)) pick = o;
    else if (isLayoutUnit((t ?? o)!)) pick = t;
    else {
      conflicts.push({ label: unitLabel((t ?? o)!), reason: bothReason(b, o, t, names) });
      pick = o;
    }
    if (pick) chosen.set(key, pick);
  }

  // References between units.
  const removedBy = (key: string) => (ours.has(key) ? names.theirs : names.ours);
  const elName = (id: string) => {
    const u = base.get(`el:${id}`) ?? ours.get(`el:${id}`) ?? theirs.get(`el:${id}`);
    return u && u.t === "el" ? `"${String(u.v.name)}"` : `"${id}"`;
  };
  for (const [key, u] of chosen) {
    if (u.t === "el" && u.parent !== null && !chosen.has(`el:${u.parent}`)) {
      conflicts.push({ label: unitLabel(u), reason: `It is inside ${elName(u.parent)}, which ${removedBy(`el:${u.parent}`)} removed.` });
    } else if (u.t === "rel") {
      for (const end of new Set([u.owner, String(u.v.sourceId), String(u.v.destinationId)])) {
        if (!chosen.has(`el:${end}`)) {
          conflicts.push({ label: unitLabel(u), reason: `It connects to ${elName(end)}, which ${removedBy(`el:${end}`)} removed.` });
          break;
        }
      }
    } else if (u.t === "view" && u.mode === "flow") {
      const steps = (u.v.relationships as { id: string }[] | undefined) ?? [];
      const missing = steps.find((s) => !chosen.has(`rel:${s.id}`));
      if (missing && !sameUnit(base.get(key), u)) {
        conflicts.push({ label: unitLabel(u), reason: `A step uses a relationship that ${removedBy(`rel:${missing.id}`)} removed.` });
      }
    }
  }
  return { units: chosen, conflicts };
}

function bothReason(b: Unit | undefined, o: Unit | undefined, t: Unit | undefined, n: MergeNames): string {
  if (!b) return `Added in both ${n.ours} and ${n.theirs}, differently.`;
  if (!o) return `Removed in ${n.ours}, changed in ${n.theirs}.`;
  if (!t) return `Changed in ${n.ours}, removed in ${n.theirs}.`;
  return `Changed in both ${n.ours} and ${n.theirs}, differently.`;
}

/** Keys of `ours` in order; keys only in `theirs` are placed after the key that precedes them
 *  there, so a new container lands next to its siblings rather than at the end of the model. */
function keyOrder(ours: Units, theirs: Units): string[] {
  const out = [...ours.keys()];
  const pos = new Map(out.map((k, i) => [k, i]));
  let prev: string | null = null;
  for (const k of theirs.keys()) {
    if (!pos.has(k)) {
      const at = prev === null ? 0 : out.indexOf(prev) + 1;
      out.splice(at, 0, k);
      pos.set(k, at);
    }
    prev = k;
  }
  return out;
}
