/**
 * The import ledger: what the importer last wrote, so a re-import can tell a person's edit from its own
 * value without any label in the model (DEC-051).
 *
 *   architecture/import/ledger.json              per element / relationship ID and field, the canonical
 *                                                value the importer wrote and main now holds
 *   architecture/import/pending/<draftId>.json   the same, for one import draft not yet (fully) applied
 *
 * On re-import, each field is a three-way: base = ledger, ours = the model, theirs = the new file (see
 * importer.ts). The folder sits next to `drafts/`, outside every model copy: a draft copies only the model
 * files (workspace, sidecar, decisions), and `dp check` and the validation never read it.
 *
 * When the ledger is written (a choice the plan left open): the importer writes a *pending* ledger when it
 * creates the draft. `foldApplied` runs when a draft is applied (`Drafts.apply`, right after main is
 * written): each pending entry whose value main now holds moves into ledger.json. So:
 * - an applied draft's values reach the ledger at the moment they reach main, so a person's edit made
 *   after the apply is later recognised as an edit ("kept your edit");
 * - a discarded draft's values never do: `Drafts.remove` deletes its pending file (and `settleLedger`, run
 *   before every import, deletes pending files whose draft folder is gone), so it cannot poison later imports;
 * - a value a person changed inside the draft before applying is not folded (main holds the person's
 *   value), so the next import sees no record for it and only fills empty fields: the safe direction;
 * - a partly applied draft (stage S3) can fold what was accepted and keep the rest pending (`keepPending`).
 * Trade-off: the ledger follows applies made through dp only; a draft merged by hand leaves it behind
 * (re-imports are then conservative). Deleting the import folder makes re-imports fill-only, never destructive.
 */

import fs from "node:fs";
import path from "node:path";
import { getJson, getProps, OWNER_KEY, ARCH_KEY, CODE_KEY, KIND_KEY, splitTech, TAG_PREFIX, buildIndex } from "../core/ops.js";
import { atomicWrite, isObj, stableJson } from "../core/util.js";
import type { Element, Kind, Relationship, Workspace } from "../core/workspace.js";

export const IMPORT_DIR = "import";
export const LEDGER_FILE = "ledger.json";
export const PENDING_DIR = "pending";

/** A field's canonical value: text, a flag, or a list (technologies, code paths). */
export type LedgerValue = string | boolean | string[];
/** Field name → value. Element fields: name, description, external, technologies, archType, owner,
 *  `tag:<Group>`, codePaths. Relationship fields: description, technologies, kind, codePaths. */
export type LedgerEntry = Record<string, LedgerValue>;

export interface Ledger {
  version: 1;
  elements: Record<string, LedgerEntry>;
  relationships: Record<string, LedgerEntry>;
}

export const emptyLedger = (): Ledger => ({ version: 1, elements: Object.create(null), relationships: Object.create(null) });

/** `<model folder>/import`. */
export const importDir = (modelDir: string): string => path.join(modelDir, IMPORT_DIR);
export const ledgerPath = (modelDir: string): string => path.join(importDir(modelDir), LEDGER_FILE);
export const pendingPath = (modelDir: string, draftId: string): string => path.join(importDir(modelDir), PENDING_DIR, `${draftId}.json`);

/** Values compare by their JSON text. */
export const sameValue = (a: LedgerValue | undefined, b: LedgerValue | undefined): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Empty: "", false is not empty (a flag always has a value), [] is. */
export const isEmptyValue = (v: LedgerValue | undefined): boolean => v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

function cleanEntries(v: unknown): Record<string, LedgerEntry> {
  const out: Record<string, LedgerEntry> = Object.create(null);
  if (!isObj(v)) return out;
  for (const [id, fields] of Object.entries(v)) {
    if (!isObj(fields)) continue;
    const e: LedgerEntry = {};
    for (const [f, x] of Object.entries(fields)) {
      if (typeof x === "string" || typeof x === "boolean" || (Array.isArray(x) && x.every((y) => typeof y === "string"))) e[f] = x as LedgerValue;
    }
    out[id] = e;
  }
  return out;
}

/** Read a ledger file; a missing or unreadable one is empty (re-imports then only fill empty fields). */
export function readLedger(file: string): Ledger {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf-8")) as unknown;
    if (!isObj(data)) return emptyLedger();
    return { version: 1, elements: cleanEntries(data.elements), relationships: cleanEntries(data.relationships) };
  } catch {
    return emptyLedger();
  }
}

const sortKeys = <T>(rec: Record<string, T>): Record<string, T> =>
  Object.fromEntries(
    Object.keys(rec)
      .sort()
      .map((k) => [k, rec[k]!]),
  );

/** The ledger as file text: IDs and fields in sorted order, so the same content always gives the same bytes. */
export function ledgerText(l: Ledger): string {
  const part = (rec: Record<string, LedgerEntry>) =>
    Object.fromEntries(
      Object.keys(rec)
        .sort()
        .map((id) => [id, sortKeys(rec[id]!)]),
    );
  return stableJson({ version: 1, elements: part(l.elements), relationships: part(l.relationships) });
}

export function writeLedger(file: string, l: Ledger): void {
  atomicWrite(file, ledgerText(l));
}

// ------------------------------------------------------------------ canonical values in the model

/** The ledger fields of an element, as the model holds them now. */
export function elementFields(el: Element, kind: Kind): LedgerEntry {
  const props = getProps(el);
  const out: LedgerEntry = { name: el.name, description: el.description || "" };
  if (kind === "person" || kind === "softwareSystem") out.external = el.location === "External";
  else out.technologies = splitTech(el.technology);
  out.archType = props[ARCH_KEY] ?? "";
  out.owner = props[OWNER_KEY] ?? "";
  for (const [k, v] of Object.entries(props)) if (k.startsWith(TAG_PREFIX)) out[`tag:${k.slice(TAG_PREFIX.length)}`] = v;
  out.codePaths = getJson<string>(el, CODE_KEY).map(String);
  return out;
}

/** The ledger fields of a relationship, as the model holds them now. */
export function relationshipFields(r: Relationship): LedgerEntry {
  return { description: r.description || "", technologies: splitTech(r.technology), kind: getProps(r)[KIND_KEY] ?? "", codePaths: getJson<string>(r, CODE_KEY).map(String) };
}

/** A tag field missing on the element is empty (""), like any unset text field. */
export const fieldOf = (entry: LedgerEntry, field: string): LedgerValue => entry[field] ?? (field === "external" ? false : field === "technologies" || field === "codePaths" ? [] : "");

// ------------------------------------------------------------------ pending ledgers and settling

/** Record what an import wrote into the draft `draftId`. */
export function writePending(modelDir: string, draftId: string, l: Ledger): void {
  writeLedger(pendingPath(modelDir, draftId), l);
}

/** Forget an import draft's pending ledger (the draft was discarded). */
export function dropPending(modelDir: string, draftId: string): void {
  fs.rmSync(pendingPath(modelDir, draftId), { force: true });
}

/**
 * After the draft `draftId` was applied to `main`: move each of its pending entries whose value main now
 * holds into ledger.json. The pending file is removed, or with `keepPending` (a partial apply) keeps only
 * the entries not moved. Does nothing for a draft that is not an import.
 */
export function foldApplied(modelDir: string, main: Workspace, draftId: string, opts: { keepPending?: boolean } = {}): void {
  const pfile = pendingPath(modelDir, draftId);
  if (!fs.existsSync(pfile)) return;
  const pending = readLedger(pfile);
  const file = ledgerPath(modelDir);
  const ledger = readLedger(file);
  const left = emptyLedger();
  const idx = buildIndex(main);
  const fold = (part: "elements" | "relationships", now: (id: string) => LedgerEntry | null) => {
    for (const [id, fields] of Object.entries(pending[part])) {
      const cur = now(id);
      for (const [f, v] of Object.entries(fields)) {
        if (cur && sameValue(fieldOf(cur, f), v)) (ledger[part][id] ??= {})[f] = v;
        else (left[part][id] ??= {})[f] = v;
      }
    }
  };
  fold("elements", (id) => (idx.elements.has(id) ? elementFields(idx.elements.get(id)!, idx.kindOf(id)) : null));
  fold("relationships", (id) => (idx.relationships.has(id) ? relationshipFields(idx.relationships.get(id)!) : null));
  writeLedger(file, ledger);
  const empty = !Object.keys(left.elements).length && !Object.keys(left.relationships).length;
  if (opts.keepPending && !empty) writeLedger(pfile, left);
  else fs.rmSync(pfile, { force: true });
}

/**
 * The ledger to use as the base of a new import. Pending files whose draft is gone (`alive` false; a
 * draft folder deleted by hand) are removed first, without being folded: an applied draft was folded
 * when it was applied, so a gone draft's leftovers are from a discarded one.
 */
export function settleLedger(modelDir: string, alive: (draftId: string) => boolean): Ledger {
  const dir = path.join(importDir(modelDir), PENDING_DIR);
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith(".json") && !n.startsWith("."));
  } catch {
    /* no pending ledgers */
  }
  for (const name of names) {
    const draftId = name.slice(0, -".json".length);
    if (!alive(draftId)) fs.rmSync(path.join(dir, name), { force: true });
  }
  return readLedger(ledgerPath(modelDir));
}
