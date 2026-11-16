/**
 * The importer (DEC-051): an import file becomes a new draft, through the model operations only.
 *
 * `importToDraft` checks the file (checks.ts) against the main model and the code, refuses it on any error,
 * creates a draft (drafts.ts) and applies the file inside ONE `Project.edit` on the draft, so the import is
 * one undo step there and the result is validated like any edit. Order is fixed: objects by level (people,
 * systems, containers, components), then by ID; then relationships, flows and decisions in file order. A
 * `via` relationship becomes two (source→via with `description`, via→target with `viaDescription`).
 *
 * Never written to the model: `evidence`, `confidence`, `source`, `ignore`, `questions`, `assumptions`.
 * Code paths are, through `updateElement` / `updateRelationship` (so `cleanPaths` applies).
 *
 * Re-import (an ID, or a relationship's source, target and description, already in the model): each field
 * is a three-way with base = the ledger (ledger.ts), ours = the model, theirs = the file. Equal: nothing to
 * do. Ours differs from base: a person edited it; kept. No ledger value: only an empty field is filled.
 * Otherwise the file's value is written. Flows and decisions whose title is already there are kept as they
 * are. Nothing is ever deleted: objects an earlier import wrote that this file leaves out are listed.
 *
 * Deterministic: the same file and the same model give the same draft, byte for byte (`date` fixes the
 * draft's and the decisions' date; nothing else depends on time or chance).
 *
 * The draft gets a review (review.ts): the import file is kept as `import/files/<draftId>.json` and each object,
 * relationship, flow and decision the import created or changed becomes a pending review item with a computed level.
 */

import fs from "node:fs";
import path from "node:path";
import { DiskCode, type CodeSource } from "../core/codeFiles.js";
import { createDecision, today } from "../core/decisions.js";
import type { Drafts } from "../core/drafts.js";
import { createFlow, listFlows, updateFlow } from "../core/flows.js";
import { buildIndex, CATALOG_KEY, cleanPaths, createElement, createRelationship, getProps, ModelError, splitTech, updateElement, updateRelationship, type Index } from "../core/ops.js";
import { WORKSPACE_FILE } from "../core/project.js";
import type { Sidecar } from "../core/sidecar.js";
import type { Kind, Workspace } from "../core/workspace.js";
import type { Decision, FieldError, ImportFile, ImportKept, ImportKeptReason, ImportLevel, ImportObject, ImportReport, ImportReportItem } from "../shared/types.js";
import { checkImport, KIND_OF, planRelationships, relIdentity, resolveRelRef, techNormaliser, type PlannedRel } from "./checks.js";
import { elementFields, emptyLedger, fieldOf, isEmptyValue, relationshipFields, sameValue, settleLedger, writePending, type Ledger, type LedgerEntry, type LedgerValue } from "./ledger.js";
import { pointer } from "./schema.js";
import { createReview, decisionSlug, itemKey, type ImportOrigin } from "./review.js";
import type { Evidence } from "./scan.js";

/** The file was refused: every error (with its JSON pointer), plus the warnings found on the way. */
export class ImportRejected extends ModelError {
  constructor(
    readonly errors: FieldError[],
    readonly warnings: FieldError[] = [],
  ) {
    const first = errors[0];
    super(`The import file was refused: ${errors.length} problem${errors.length === 1 ? "" : "s"}.${first ? ` First: ${first.pointer ? `${first.pointer}: ` : ""}${first.message}` : ""}`);
    this.name = "ImportRejected";
  }
}

export interface ImportOptions {
  /** The draft's title (must be free among drafts). */
  title: string;
  description?: string;
  /** Who the draft is credited to (the signed-in user; default: the Drafts' author). */
  author?: string | null;
  /** YYYY-MM-DD for the draft and its decisions (default: today). */
  date?: string;
  /** Where code paths are checked (default: the main project's code folder). */
  code?: CodeSource;
  /** The scan results the review levels are checked against (default: `architecture/import/evidence.json`, if any). */
  evidence?: Evidence | null;
}

export interface ImportResult {
  draftId: string;
  report: ImportReport;
  /** What the checks could not settle (shown in review). */
  warnings: FieldError[];
}

const RANK: Record<Kind, number> = { person: 0, softwareSystem: 1, container: 2, component: 3 };
const LEVEL_KINDS: Record<ImportLevel, Kind[]> = { c1: ["person", "softwareSystem"], c2: ["container"], c3: ["component"], all: ["person", "softwareSystem", "container", "component"] };
/** Fields of a linked catalog copy that come from the catalog (DEC-055). */
const CATALOG_FIELDS = new Set(["name", "description", "technologies"]);

const KEPT_MESSAGE: Record<ImportKeptReason, string> = {
  "your-edit": "Kept your edit: the model's value was changed after the last import.",
  "not-empty": "Kept the model's value: no earlier import of this field is recorded, so only empty fields are filled.",
  catalog: "Kept: this value comes from the shared catalog.",
  exists: "Kept: one with this title is already in the model.",
};

/** The fields the file states for an object, as canonical values. */
function objectFields(o: ImportObject, kind: Kind, norm: (t: string) => string): LedgerEntry {
  const out: LedgerEntry = { name: o.name.trim() };
  if (o.description !== undefined) out.description = o.description.trim();
  if ((kind === "person" || kind === "softwareSystem") && o.external !== undefined) out.external = o.external;
  if ((kind === "container" || kind === "component") && o.technologies !== undefined) out.technologies = splitTech(o.technologies.map(norm));
  if (o.archType !== undefined) out.archType = o.archType === "box" ? "" : o.archType;
  if (o.owner !== undefined) out.owner = o.owner.trim();
  for (const g of Object.keys(o.tags ?? {}).sort()) out[`tag:${g}`] = o.tags![g]!;
  if (o.codePaths !== undefined) out.codePaths = cleanPaths(o.codePaths);
  return out;
}

/** The fields the file states for a relationship (description only when it is matched by ID, as it may change then). */
function relFields(p: PlannedRel, norm: (t: string) => string, withDescription: boolean): LedgerEntry {
  const out: LedgerEntry = {};
  if (withDescription) out.description = p.description;
  if (p.technologies !== undefined) out.technologies = splitTech(p.technologies.map(norm));
  if (p.kind !== undefined) out.kind = p.kind;
  if (p.codePaths !== undefined) out.codePaths = cleanPaths(p.codePaths);
  return out;
}

/** An element patch for `updateElement` from ledger fields. */
function elementPatch(fields: LedgerEntry): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const tags: Record<string, string> = {};
  for (const [f, v] of Object.entries(fields)) {
    if (f.startsWith("tag:")) tags[f.slice(4)] = v as string;
    else if (f === "technologies") patch.technology = v;
    else patch[f] = v;
  }
  if (Object.keys(tags).length) patch.tags = tags;
  return patch;
}

function relPatch(fields: LedgerEntry): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [f, v] of Object.entries(fields)) patch[f === "technologies" ? "technology" : f] = v;
  return patch;
}

/** Run a model operation; a ModelError becomes an ImportRejected at `at`. */
function op<T>(at: string, fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof ModelError && !(e instanceof ImportRejected)) throw new ImportRejected([{ pointer: at, message: e.message }]);
    throw e;
  }
}

/**
 * Apply a checked import file to a model (the draft's copy, inside `Project.edit`). Returns the report and
 * the ledger of what the file now has in the model (for `writePending`). `ledger`: the settled ledger (base).
 */
export function applyImport(
  ws: Workspace,
  sc: Sidecar,
  decs: Decision[],
  file: ImportFile,
  ledger: Ledger,
  opts: { date?: string } = {},
): { report: ImportReport; written: Ledger; origins: ImportOrigin[] } {
  const norm = techNormaliser(ws);
  const report: ImportReport = { created: [], updated: [], kept: [], notInImport: [], unchanged: 0 };
  const written = emptyLedger();
  // What the review lists (review.ts): every object, relationship, flow and decision the import created or changed.
  const origins: ImportOrigin[] = [];

  /** Three-way per field; returns the fields to write. */
  const merge = (what: "element" | "relationship", id: string, name: string, ours: LedgerEntry, theirs: LedgerEntry, base: LedgerEntry | undefined, linked: boolean, out: LedgerEntry): LedgerEntry => {
    const write: LedgerEntry = {};
    const keep = (field: string, reason: ImportKeptReason) => report.kept.push({ id, what, name, field, reason, message: KEPT_MESSAGE[reason] } satisfies ImportKept);
    for (const [field, t] of Object.entries(theirs)) {
      const o: LedgerValue = fieldOf(ours, field);
      if (sameValue(o, t)) {
        out[field] = t;
        continue;
      }
      if (linked && CATALOG_FIELDS.has(field)) {
        keep(field, "catalog");
        continue;
      }
      const b = base?.[field];
      if (b === undefined ? !isEmptyValue(o) : !sameValue(o, b)) {
        keep(field, b === undefined ? "not-empty" : "your-edit");
        continue;
      }
      write[field] = t;
      out[field] = t;
    }
    return write;
  };

  // ---- objects: by level, then by ID
  const order = file.objects.map((o, i) => ({ o, i })).sort((a, b) => RANK[KIND_OF[a.o.type]] - RANK[KIND_OF[b.o.type]] || (a.o.id < b.o.id ? -1 : a.o.id > b.o.id ? 1 : 0));
  for (const { o, i } of order) {
    const at = pointer("/objects", i);
    const kind = KIND_OF[o.type];
    const theirs = op(at, () => objectFields(o, kind, norm));
    const idx = buildIndex(ws);
    const el = idx.elements.get(o.id);
    const out: LedgerEntry = {};
    if (!el) {
      op(at, () => {
        createElement(ws, {
          kind,
          id: o.id,
          name: theirs.name as string,
          parentId: o.parent ?? null,
          description: (theirs.description as string | undefined) ?? null,
          technology: theirs.technologies,
          external: theirs.external === true,
          archType: (theirs.archType as string | undefined) || null,
        });
        const rest = Object.fromEntries(Object.entries(theirs).filter(([f]) => !["name", "description", "technologies", "external", "archType"].includes(f)));
        if (Object.keys(rest).length) updateElement(ws, sc, o.id, elementPatch(rest));
      });
      Object.assign(out, theirs);
      report.created.push({ id: o.id, what: "element", name: theirs.name as string, fields: Object.keys(theirs) });
      origins.push({ key: itemKey("object", o.id), kind: "object", pointer: at });
    } else {
      const linked = !!getProps(el)[CATALOG_KEY];
      const write = merge("element", o.id, el.name, elementFields(el, kind), theirs, ledger.elements[o.id], linked, out);
      if (Object.keys(write).length) {
        op(at, () => updateElement(ws, sc, o.id, elementPatch(write)));
        report.updated.push({ id: o.id, what: "element", name: el.name, fields: Object.keys(write) });
        origins.push({ key: itemKey("object", o.id), kind: "object", pointer: at });
      } else report.unchanged++;
    }
    if (Object.keys(out).length) written.elements[o.id] = out;
  }

  // ---- relationships (via expanded), in file order
  const idx0 = buildIndex(ws);
  const planned = planRelationships(file, idx0);
  const actual = new Map<string, string>();
  for (const p of planned) {
    const out: LedgerEntry = {};
    const label = `${p.source} → ${p.target}`;
    if (!p.match) {
      const theirs = op(p.pointer, () => relFields(p, norm, true));
      const id = op(p.pointer, () => {
        const rid = createRelationship(ws, { sourceId: p.source, destinationId: p.target, description: p.description, technology: theirs.technologies, kind: p.kind ?? null, id: p.explicitId });
        if (theirs.codePaths !== undefined) updateRelationship(ws, rid, { codePaths: theirs.codePaths });
        return rid;
      });
      Object.assign(out, theirs);
      actual.set(relIdentity(p), id);
      report.created.push({ id, what: "relationship", name: `${label}: ${p.description}`, fields: Object.keys(theirs) });
      origins.push({ key: itemKey("relationship", id), kind: "relationship", pointer: p.pointer });
      written.relationships[id] = out;
      continue;
    }
    const id = p.match;
    actual.set(id, id);
    const r = buildIndex(ws).rel(id);
    const theirs = op(p.pointer, () => relFields(p, norm, p.explicitId !== null));
    const write = merge("relationship", id, `${label}: ${r.description || ""}`, relationshipFields(r), theirs, ledger.relationships[id], false, out);
    if (Object.keys(write).length) {
      op(p.pointer, () => updateRelationship(ws, id, relPatch(write)));
      report.updated.push({ id, what: "relationship", name: `${label}: ${r.description || ""}`, fields: Object.keys(write) });
      origins.push({ key: itemKey("relationship", id), kind: "relationship", pointer: p.pointer });
    } else report.unchanged++;
    if (Object.keys(out).length) written.relationships[id] = { ...(written.relationships[id] ?? {}), ...out };
  }
  const relId = (ref: string): string => {
    const r = resolveRelRef(ref, planned, idx0);
    if ("error" in r) throw new ImportRejected([{ pointer: "", message: r.error }]);
    return actual.get(r.identity) ?? r.identity;
  };

  // ---- flows: new titles only
  (file.flows ?? []).forEach((f, i) => {
    const at = pointer("/flows", i);
    const title = f.title.trim();
    const there = listFlows(ws).find((x) => x.title === title);
    if (there) {
      report.kept.push({ id: there.key, what: "flow", name: title, field: "", reason: "exists", message: KEPT_MESSAGE.exists });
      return;
    }
    const key = op(at, () => {
      const k = createFlow(ws, title, f.description?.trim() ?? "");
      updateFlow(ws, k, { steps: f.steps.map((s) => ({ relationshipId: relId(s.relationship), description: s.note?.trim() ?? "" })) });
      return k;
    });
    report.created.push({ id: key, what: "flow", name: title, fields: ["steps"] });
    origins.push({ key: itemKey("flow", key), kind: "flow", pointer: at });
  });

  // ---- decisions: proposed, new titles only
  const elements = buildIndex(ws).elements;
  (file.decisions ?? []).forEach((d, i) => {
    const at = pointer("/decisions", i);
    const title = d.title.trim();
    const there = decs.find((x) => x.error === undefined && x.title === title);
    if (there) {
      report.kept.push({ id: there.id, what: "decision", name: title, field: "", reason: "exists", message: KEPT_MESSAGE.exists });
      return;
    }
    const id = op(at, () =>
      createDecision(decs, {
        title,
        status: "proposed",
        date: opts.date ?? today(),
        context: d.context,
        decision: d.decision,
        alternatives: (d.alternatives ?? []).map((a) => ({ name: a.name, whyNot: a.whyNot ?? "", wouldChooseIf: [], notes: "" })),
        affects: (d.affects ?? []).map((a) => (elements.has(a) ? a : relId(a))),
      }),
    );
    report.created.push({ id, what: "decision", name: title, fields: ["context", "decision"] });
    origins.push({ key: itemKey("decision", decisionSlug(decs.find((x) => x.id === id)!.file)), kind: "decision", pointer: at });
  });

  // ---- what an earlier import wrote at this level and this file leaves out (never deleted)
  report.notInImport = notInImport(buildIndex(ws), file, ledger, written);
  return { report, written, origins };
}

function notInImport(idx: Index, file: ImportFile, ledger: Ledger, written: Ledger): ImportReportItem[] {
  const kinds = new Set(LEVEL_KINDS[file.level]);
  const inFile = new Set([...file.objects.map((o) => o.id), ...Object.keys(written.elements)]);
  const out: ImportReportItem[] = [];
  for (const id of Object.keys(ledger.elements).sort()) {
    if (inFile.has(id) || !idx.elements.has(id) || !kinds.has(idx.kindOf(id))) continue;
    out.push({ id, what: "element", name: idx.elements.get(id)!.name, fields: [] });
  }
  for (const id of Object.keys(ledger.relationships).sort()) {
    const r = idx.relationships.get(id);
    if (!r || id in written.relationships) continue;
    const ends = [r.sourceId, r.destinationId].filter((e) => idx.elements.has(e)).map((e) => idx.kindOf(e));
    const deepest = ends.sort((a, b) => RANK[b] - RANK[a])[0];
    if (file.level !== "all" && (!deepest || !kinds.has(deepest))) continue;
    out.push({ id, what: "relationship", name: `${r.sourceId} → ${r.destinationId}: ${r.description || ""}`, fields: [] });
  }
  return out;
}

/**
 * Check `file` and bring it in as a new draft of `drafts.main`. Throws ImportRejected (a ModelError) when
 * the checks find errors, or when an operation refuses a value; the draft is then not kept. The ledger
 * is settled first (ledger.ts) and a pending ledger is written for the new draft.
 */
export function importToDraft(drafts: Drafts, file: ImportFile, opts: ImportOptions): ImportResult {
  const main = drafts.main;
  main.reloadIfChanged();
  const check = checkImport(file, main, opts.code ?? new DiskCode(main.codeRoot));
  if (check.errors.length) throw new ImportRejected(check.errors, check.warnings);
  const ledger = settleLedger(main.dir, (id) => fs.existsSync(path.join(drafts.dir, id, WORKSPACE_FILE)));
  const date = opts.date ?? today();
  const id = drafts.create(opts.title, opts.description ?? "", opts.author, date);
  try {
    const { report, written, origins } = drafts.get(id).edit((ws, sc, decs) => applyImport(ws, sc, decs, file, ledger, { date }));
    writePending(main.dir, id, written);
    createReview(drafts, id, file, origins, { code: opts.code, evidence: opts.evidence });
    return { draftId: id, report, warnings: check.warnings };
  } catch (e) {
    drafts.remove(id);
    throw e;
  }
}
