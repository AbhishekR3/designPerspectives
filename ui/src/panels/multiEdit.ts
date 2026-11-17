/**
 * The rules behind editing several selected elements at once. Pure functions on the summaries, so the panel only draws them
 * and the rules can be tested: what value the selection shares, which chips are on all or only some, and which elements
 * need a patch for a change (an element that already has the value gets none, so one click is one small edit).
 */
import type { ElementSummary } from "../../../src/shared/types.js";

export interface ElementPatch {
  id: string;
  patch: Record<string, unknown>;
}

/** The value every element has, or "mixed" when they differ (an empty selection is mixed too). */
export function commonValue(values: string[]): { mixed: false; value: string } | { mixed: true } {
  return values.length > 0 && values.every((v) => v === values[0]) ? { mixed: false, value: values[0]! } : { mixed: true };
}

export interface ListChip {
  item: string;
  /** How many of the `total` elements have it. */
  count: number;
  total: number;
}

/** Every item that appears on any element, in the order first seen, with how many elements have it. */
export function listChips(lists: string[][]): ListChip[] {
  const counts = new Map<string, number>();
  for (const l of lists) for (const item of new Set(l)) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts].map(([item, count]) => ({ item, count, total: lists.length }));
}

/** Add an item to every list that lacks it, or remove it from every list that has it. Only lists that change get a patch. */
export function listPatches(items: { id: string; list: string[] }[], key: string, change: { add: string } | { remove: string }): ElementPatch[] {
  const out: ElementPatch[] = [];
  for (const { id, list } of items) {
    if ("add" in change) {
      const item = change.add.trim();
      if (item && !list.includes(item)) out.push({ id, patch: { [key]: [...list, item] } });
    } else if (list.includes(change.remove)) out.push({ id, patch: { [key]: list.filter((x) => x !== change.remove) } });
  }
  return out;
}

/** Set a plain field (owner, symbol) on every element whose value differs. */
export function fieldPatches(items: { id: string; value: string }[], key: string, next: string): ElementPatch[] {
  return items.filter((x) => x.value !== next).map((x) => ({ id: x.id, patch: { [key]: next } }));
}

/** Set one tag group's value (null clears it) on every element whose value differs. */
export function tagPatches(els: Pick<ElementSummary, "id" | "tags">[], group: string, value: string | null): ElementPatch[] {
  return els.filter((e) => (e.tags[group] ?? null) !== value).map((e) => ({ id: e.id, patch: { tags: { [group]: value } } }));
}

/** Technology is edited only when every selected element can have it (containers and components) and none is a catalog copy (its technology comes from the catalog). */
export function technologyEditable(els: Pick<ElementSummary, "kind" | "catalogId">[]): boolean {
  return els.length > 0 && els.every((e) => (e.kind === "container" || e.kind === "component") && !e.catalogId);
}

/** The symbol (box shape) exists for everything but people. */
export function symbolEditable(els: Pick<ElementSummary, "kind">[]): boolean {
  return els.length > 0 && els.every((e) => e.kind !== "person");
}
