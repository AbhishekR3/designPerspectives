/**
 * Three-way merge of model units (see `units.ts`), used to apply a draft to the main model.
 *
 * `base` is the main model as it was when the draft was made, `ours` is main now, `theirs` is the
 * draft. Per unit: if only one side changed it, that side wins; if both made the same change, it
 * is kept; if both changed it differently, that is a conflict and nothing is applied. Positions
 * and other layout data never conflict: the draft's layout wins (it is cheap to redo).
 *
 * An element's parent is part of its unit, so moving an element (to another system or container) is
 * a change to that element: it merges like any other change, conflicts with a different change to
 * the same element on the other side, and a move into a parent the other side removed is caught by
 * the reference check below.
 *
 * After the per-unit merge, references are checked: an element inside a removed element, a
 * relationship to a removed element, or a flow step over a removed relationship is a conflict.
 * Model rules (unique names, ...) are checked by the caller when the result is saved.
 *
 * `revertClosure` / `revertUnits` reset chosen units of a draft to its base with what depends on them; they
 * take an item out of an import draft (a reject) and hold items back on a partial apply (drafts.ts).
 */

import { parseKey } from "./diagrams.js";
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
  return { units: placeMoved(chosen, ours, theirs), conflicts };
}

/** An element the draft moved to another parent is placed after the unit that precedes it in the
 *  draft, so it keeps its place among its new siblings (`unflatten` attaches it to its parent). */
function placeMoved(chosen: Units, ours: Units, theirs: Units): Units {
  const order = [...chosen.keys()];
  const theirKeys = [...theirs.keys()];
  let moved = false;
  for (const [key, u] of chosen) {
    const o = ours.get(key);
    if (u.t !== "el" || !o || o.t !== "el" || o.parent === u.parent) continue;
    const prev = theirKeys[theirKeys.indexOf(key) - 1];
    if (prev === undefined || !chosen.has(prev)) continue;
    order.splice(order.indexOf(key), 1);
    order.splice(order.indexOf(prev) + 1, 0, key);
    moved = true;
  }
  return moved ? new Map(order.map((k) => [k, chosen.get(k)!])) : chosen;
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

// ------------------------------------------------------------------ reverting units (reject, hold)

/** Units to reset to the base, and for each unit pulled in by the closure, the unit that pulled it in. */
export interface RevertSet {
  keys: Set<string>;
  because: Map<string, string>;
}

export interface ClosureOptions {
  /** Also revert flows that step over a new relationship being reverted (otherwise the step is dropped by `syncFlows`). */
  flows?: boolean;
  /** Also revert decisions whose `affects` names a new element or relationship being reverted. */
  decisions?: boolean;
}

/** The element or relationship ID a diagram key is about (`components-<id>`, `code-<id>`, ...), if any. */
const scopeOf = (diagramKey: string): string | null => parseKey(diagramKey)?.scope ?? null;

/**
 * The units of `theirs` (a draft) to reset to `base` so that resetting `seeds` leaves a consistent model.
 * Downward, for a unit the draft added (it goes away): an element's children and the relationships that
 * touch it; positions, styles, layout entries and diagram views about an element or relationship; the
 * stored data of a view that goes; with `flows`, flows that step over a relationship that goes; with
 * `decisions`, decisions that name something that goes. Upward, for a unit that comes back as in the base:
 * its parent, the ends of a relationship, the relationships of a flow's steps and the view of a position,
 * when the draft does not have them. Keys in neither version are ignored.
 */
export function revertClosure(base: Units, theirs: Units, seeds: Iterable<string>, opts: ClosureOptions = {}): RevertSet {
  const keys = new Set<string>();
  const because = new Map<string, string>();
  const queue: string[] = [];
  const add = (k: string, from: string | null) => {
    if (keys.has(k) || (!base.has(k) && !theirs.has(k))) return;
    keys.add(k);
    if (from !== null) because.set(k, from);
    queue.push(k);
  };

  const children = new Map<string, string[]>();
  const relsOf = new Map<string, string[]>();
  const about = new Map<string, string[]>();
  const viewKids = new Map<string, string[]>();
  const flowsOver = new Map<string, string[]>();
  const decsAbout = new Map<string, string[]>();
  const push = (m: Map<string, string[]>, id: string | null, k: string) => {
    if (id === null) return;
    const l = m.get(id);
    if (l) l.push(k);
    else m.set(id, [k]);
  };
  for (const [k, u] of theirs) {
    switch (u.t) {
      case "el":
        push(children, u.parent, k);
        break;
      case "rel":
        for (const e of new Set([u.owner, String(u.v.sourceId), String(u.v.destinationId)])) push(relsOf, e, k);
        break;
      case "view":
        if (u.mode === "flow") for (const s of (u.v.relationships as { id: string }[] | undefined) ?? []) push(flowsOver, String(s.id), k);
        else push(about, scopeOf(String(u.v.key)), k);
        break;
      case "vel":
      case "vrel":
        push(about, String(u.v.id), k);
        push(viewKids, u.view, k);
        break;
      case "lay":
        push(about, u.id, k);
        push(about, scopeOf(u.diagram), k);
        break;
      case "laymeta":
        push(about, scopeOf(u.diagram), k);
        break;
      case "style":
        push(about, u.target, k);
        break;
      case "dec":
        for (const a of u.v.affects) push(decsAbout, a, k);
        break;
    }
  }

  for (const s of seeds) add(s, null);
  while (queue.length) {
    const k = queue.shift()!;
    const b = base.get(k);
    const t = theirs.get(k);
    if (t && !b) {
      // Added in the draft: it goes away, and so does what depends on it.
      const each = (list: string[] | undefined) => list?.forEach((x) => add(x, k));
      if (t.t === "el") {
        const id = String(t.v.id);
        each(children.get(id));
        each(relsOf.get(id));
        each(about.get(id));
        if (opts.decisions) each(decsAbout.get(id));
      } else if (t.t === "rel") {
        const id = String(t.v.id);
        each(about.get(id));
        if (opts.flows) each(flowsOver.get(id));
        if (opts.decisions) each(decsAbout.get(id));
      } else if (t.t === "view") each(viewKids.get(String(t.v.key)));
    }
    if (b) {
      // Comes back as in the base: what it needs must be there too.
      const need = (key: string) => {
        if (!theirs.has(key)) add(key, k);
      };
      if (b.t === "el" && b.parent !== null) need(`el:${b.parent}`);
      else if (b.t === "rel") for (const e of new Set([b.owner, String(b.v.sourceId), String(b.v.destinationId)])) need(`el:${e}`);
      else if (b.t === "view" && b.mode === "flow") for (const s of (b.v.relationships as { id: string }[] | undefined) ?? []) need(`rel:${String(s.id)}`);
      else if (b.t === "vel" || b.t === "vrel") need(`view:${b.view}`);
    }
  }
  return { keys, because };
}

/** `theirs` with the units in `keys` reset to `base`: changed ones get the base value in place, added
 *  ones are dropped, removed ones come back after the unit that precedes them in the base. */
export function revertUnits(base: Units, theirs: Units, keys: Set<string>): Units {
  const order: string[] = [];
  const value = new Map<string, Unit>();
  for (const [k, u] of theirs) {
    if (!keys.has(k)) value.set(k, u);
    else if (base.has(k)) value.set(k, base.get(k)!);
    else continue;
    order.push(k);
  }
  let prev: string | null = null;
  for (const [k, u] of base) {
    if (keys.has(k) && !theirs.has(k)) {
      const at = prev === null ? 0 : order.indexOf(prev) + 1;
      order.splice(at, 0, k);
      value.set(k, u);
    }
    if (value.has(k)) prev = k;
  }
  return new Map(order.map((k) => [k, value.get(k)!]));
}

/** Keys whose unit differs between two versions (in either). */
export function changedKeys(a: Units, b: Units): Set<string> {
  const out = new Set<string>();
  for (const [k, u] of a) if (!sameUnit(u, b.get(k))) out.add(k);
  for (const k of b.keys()) if (!a.has(k)) out.add(k);
  return out;
}
