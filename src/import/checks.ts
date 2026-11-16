/**
 * Checks on an import file that need the model or the code but no LLM (DEC-051, backlog section 4 "Checks
 * the tool does without trusting the LLM"). Run after `parseImportFile` and before the importer, which
 * refuses a file with errors. Nothing is guessed or repaired: an error is something provably wrong (an ID
 * that does not resolve, a name already used, a path that does not exist, a secret); a warning is
 * something the tool cannot settle by rule (a claimed import between components that the code does not show).
 *
 * The one rewrite is technology names: a name the project already has in another letter case is written
 * the project's way (`techNormaliser`), and a warning says so.
 *
 * Code is read only through a `CodeSource` (`DiskCode` confines reads to the code folder and refuses hidden
 * paths), never with raw file access.
 */

import { expandPaths, scanImports } from "../core/codeMap.js";
import { cleanRel, type CodeSource } from "../core/codeFiles.js";
import { buildIndex, CATALOG_KEY, CHILD_KIND, cleanPaths, CODE_KEY, getJson, getProps, isCleanId, ModelError, technologyCatalog, type Index } from "../core/ops.js";
import type { Sidecar } from "../core/sidecar.js";
import { isHidden } from "../core/util.js";
import type { Kind, Workspace } from "../core/workspace.js";
import { secretLike } from "../shared/mask.js";
import type { Decision, FieldError, ImportCheck, ImportEvidence, ImportFile, ImportObjectType } from "../shared/types.js";
import { pointer } from "./schema.js";

/** The model's kind for each object type of the file. */
export const KIND_OF: Record<ImportObjectType, Kind> = { person: "person", system: "softwareSystem", container: "container", component: "component" };

/** The parts of a model version the checks read. */
export interface ModelView {
  workspace: Workspace;
  sidecar: Sidecar;
  decisions?: Decision[];
}

/** A relationship description that says nothing: refused (DEC-051, no inferred labels). */
export const isUses = (d: string): boolean => d.trim().toLowerCase() === "uses";

/** Technology names written the project's way when it already has them in another letter case
 *  (names in the model first, then the suggested list); other names are kept as written (trimmed). */
export function techNormaliser(ws: Workspace): (t: string) => string {
  const known = new Map<string, string>();
  for (const t of technologyCatalog(buildIndex(ws))) if (!known.has(t.toLowerCase())) known.set(t.toLowerCase(), t);
  return (t) => known.get(t.trim().toLowerCase()) ?? t.trim();
}

// ------------------------------------------------------------------ relationships as they will be written

/** One relationship the file will write: a plain one, or a leg of a `via` relationship. */
export interface PlannedRel {
  /** `/relationships/<i>` of the relationship it comes from. */
  pointer: string;
  index: number;
  /** "main": no via; "in": source→via; "out": via→target. */
  leg: "main" | "in" | "out";
  /** How flow steps and decisions may name it: the explicit ID, else `<source>--<target>`. */
  key: string;
  explicitId: string | null;
  source: string;
  target: string;
  description: string;
  technologies?: string[];
  kind?: string;
  codePaths?: string[];
  /** The model relationship this is: by explicit ID, else by source, target and description. */
  match: string | null;
}

/** The relationships of the file, `via` expanded, each matched to the model's when it is already there. */
export function planRelationships(file: ImportFile, idx: Index): PlannedRel[] {
  const out: PlannedRel[] = [];
  const findBy = (s: string, t: string, d: string) => [...idx.relationships.values()].find((r) => r.sourceId === s && r.destinationId === t && (r.description || "").trim() === d)?.id ?? null;
  file.relationships.forEach((r, index) => {
    const at = pointer("/relationships", index);
    const common = { pointer: at, index, technologies: r.technologies, kind: r.kind, codePaths: r.codePaths };
    if (r.via) {
      const viaDescription = (r.viaDescription ?? "").trim();
      for (const [leg, s, t, d] of [
        ["in", r.source, r.via, r.description.trim()],
        ["out", r.via, r.target, viaDescription],
      ] as const) {
        out.push({ ...common, leg, key: `${s}--${t}`, explicitId: null, source: s, target: t, description: d, match: findBy(s, t, d) });
      }
      return;
    }
    const d = r.description.trim();
    const explicitId = r.id ?? null;
    const match = explicitId ? (idx.relationships.has(explicitId) ? explicitId : null) : findBy(r.source, r.target, d);
    out.push({ ...common, leg: "main", key: explicitId ?? `${r.source}--${r.target}`, explicitId, source: r.source, target: r.target, description: d, match });
  });
  return out;
}

/** Identity of a planned relationship: the model's ID when matched, else a name for the new one. */
export const relIdentity = (p: PlannedRel): string => p.match ?? `new:${p.pointer}:${p.leg}`;

/** Resolve a relationship reference (flow step, decision `affects`): the identity it names, or why not. */
export function resolveRelRef(ref: string, planned: PlannedRel[], idx: Index): { identity: string } | { error: string } {
  const ids = new Set(planned.filter((p) => p.key === ref).map(relIdentity));
  if (idx.relationships.has(ref)) ids.add(ref);
  if (ids.size === 1) return { identity: [...ids][0]! };
  if (!ids.size) return { error: `No relationship "${ref}" in this file or the model.` };
  return { error: `"${ref}" could mean ${ids.size} relationships; give the relationship an "id" and use that.` };
}

// ------------------------------------------------------------------ the checks

/** Every string in a parsed value, with its pointer. */
function strings(v: unknown, at: string, out: [string, string][]): void {
  if (typeof v === "string") out.push([at, v]);
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, pointer(at, i), out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) strings(x, pointer(at, k), out);
}

/**
 * Check an import file (already through `parseImportFile`) against a model version and the code.
 * `code`: where code paths are looked up (null or no root: paths are not checked, and a warning says so).
 */
export function checkImport(file: ImportFile, model: ModelView, code: CodeSource | null): ImportCheck {
  const errors: FieldError[] = [];
  const warnings: FieldError[] = [];
  const err = (p: string, message: string) => errors.push({ pointer: p, message });
  const warn = (p: string, message: string) => warnings.push({ pointer: p, message });
  let idx: Index;
  try {
    idx = buildIndex(model.workspace);
  } catch (e) {
    if (e instanceof ModelError) return { errors: [{ pointer: "", message: `The model itself has a problem: ${e.message}` }], warnings };
    throw e;
  }
  const hasCode = !!code?.hasRoot;
  const norm = techNormaliser(model.workspace);

  // ---- objects: IDs, kinds, parents
  const fileObj = new Map<string, number>();
  file.objects.forEach((o, i) => {
    const at = pointer("/objects", i);
    if (fileObj.has(o.id)) err(pointer(at, "id"), `The ID "${o.id}" is used twice in this file (also at ${pointer("/objects", fileObj.get(o.id)!)}).`);
    else fileObj.set(o.id, i);
  });
  const kindOf = (id: string): Kind | null => {
    const i = fileObj.get(id);
    if (i !== undefined) return KIND_OF[file.objects[i]!.type];
    return idx.elements.has(id) ? idx.kindOf(id) : null;
  };
  /** Parents as they will be: the model's, with the file's on top. */
  const parentOf = (id: string): string | null => {
    const i = fileObj.get(id);
    if (i !== undefined) return file.objects[i]!.parent ?? null;
    return idx.elements.has(id) ? idx.parentOf(id) : null;
  };
  const ancestors = (id: string): string[] => {
    const out = [id];
    for (let p = parentOf(id); p && !out.includes(p) && out.length < 10; p = parentOf(p)) out.push(p);
    return out;
  };

  const groups = new Map(model.sidecar.tagGroups.map((g) => [g.name, new Set(g.values.map((v) => v.name))]));
  file.objects.forEach((o, i) => {
    const at = pointer("/objects", i);
    const kind = KIND_OF[o.type];
    if (!isCleanId(o.id)) err(pointer(at, "id"), `"${o.id}" is not a usable ID: write it as its own slug (lower-case letters, digits and single dashes), e.g. "payment-service".`);
    if (idx.relationships.has(o.id)) err(pointer(at, "id"), `"${o.id}" is the ID of a relationship in the model.`);
    if (!o.name.trim()) err(pointer(at, "name"), "A name must not be blank.");
    const existing = idx.elements.get(o.id);
    if (existing && idx.kindOf(o.id) !== kind) err(pointer(at, "type"), `"${o.id}" is already in the model as a ${idx.kindOf(o.id)}, not a ${kind}.`);
    if (kind === "person" || kind === "softwareSystem") {
      if (o.parent !== undefined) err(pointer(at, "parent"), "People and systems have no parent.");
      if (o.technologies?.length) err(pointer(at, "technologies"), "Only containers and components have technologies.");
    } else {
      if (o.external !== undefined) err(pointer(at, "external"), "Only people and systems are marked external.");
      if (o.parent === undefined) err(pointer(at, "parent"), `A ${o.type} needs a parent: the ${o.type === "container" ? "system" : "container"} it sits in.`);
      else {
        const pk = kindOf(o.parent);
        if (!pk) err(pointer(at, "parent"), `No element "${o.parent}" in this file or the model.`);
        else if (CHILD_KIND[pk] !== kind) err(pointer(at, "parent"), `A ${o.type} sits inside a ${o.type === "container" ? "system" : "container"}; "${o.parent}" is a ${pk}.`);
        else if (existing && idx.kindOf(o.id) === kind && idx.parentOf(o.id) !== o.parent) {
          err(pointer(at, "parent"), `"${o.id}" is in the model inside "${idx.parentOf(o.id)}"; an import does not move objects. Move it in the model first, or use its parent here.`);
        }
      }
    }
    if (existing && getProps(existing)[CATALOG_KEY]) {
      const differs = o.name !== existing.name || (o.description !== undefined && o.description !== (existing.description || ""));
      if (differs) warn(at, `"${existing.name}" is a copy of a shared catalog element: its name, description and technology come from the catalog and are kept.`);
    }
    for (const [g, v] of Object.entries(o.tags ?? {})) {
      const values = groups.get(g);
      if (!values) err(pointer(pointer(at, "tags"), g), `There is no tag group "${g}" in this project. Groups: ${[...groups.keys()].join(", ") || "none"}.`);
      else if (!values.has(v)) err(pointer(pointer(at, "tags"), g), `"${v}" is not a value of tag group "${g}". Values: ${[...values].join(", ")}.`);
    }
  });

  // ---- names unique per scope (people and systems together; containers per system; components per container)
  const scopeOf = (kind: Kind, parent: string | null) => (kind === "person" || kind === "softwareSystem" ? "" : (parent ?? "?"));
  const named = new Map<string, { id: string; at: string | null }[]>();
  const addName = (scope: string, name: string, id: string, at: string | null) => {
    const k = `${scope}\u0000${name}`;
    named.set(k, [...(named.get(k) ?? []), { id, at }]);
  };
  for (const [id, el] of idx.elements) if (!fileObj.has(id)) addName(scopeOf(idx.kindOf(id), idx.parentOf(id)), el.name, id, null);
  file.objects.forEach((o, i) => {
    const existing = idx.elements.get(o.id);
    // A linked catalog copy keeps its name.
    const name = existing && getProps(existing)[CATALOG_KEY] ? existing.name : o.name.trim();
    addName(scopeOf(KIND_OF[o.type], o.parent ?? null), name, o.id, pointer("/objects", i));
  });
  for (const [k, list] of named) {
    if (list.length < 2) continue;
    const name = k.split("\u0000")[1];
    for (const x of list) {
      if (!x.at) continue;
      const others = list.filter((y) => y !== x).map((y) => `"${y.id}"`);
      err(pointer(x.at, "name"), `The name "${name}" is already used here (by ${others.join(", ")}). Names are unique among people and systems, and within one parent.`);
    }
  }

  // ---- code paths
  let noCodeWarned = false;
  const checkPaths = (at: string, paths: string[] | undefined) => {
    (paths ?? []).forEach((p, j) => {
      const pp = pointer(pointer(at, "codePaths"), j);
      let clean: string;
      try {
        clean = cleanPaths([p])[0] ?? "";
      } catch (e) {
        if (e instanceof ModelError) return err(pp, e.message);
        throw e;
      }
      if (!clean) return err(pp, "A code path must not be blank.");
      if (!hasCode) {
        if (!noCodeWarned) warn(pp, "There is no code folder, so code paths were not checked.");
        noCodeWarned = true;
        return;
      }
      if (clean !== "." && !code!.kind(clean)) err(pp, `"${p}" does not exist in ${code!.label}.`);
    });
  };
  file.objects.forEach((o, i) => checkPaths(pointer("/objects", i), o.codePaths));
  file.relationships.forEach((r, i) => checkPaths(pointer("/relationships", i), r.codePaths));

  // ---- relationships
  const elementExists = (id: string) => kindOf(id) !== null;
  const explicit = new Map<string, number>();
  file.relationships.forEach((r, i) => {
    const at = pointer("/relationships", i);
    for (const f of ["source", "target", "via"] as const) {
      const v = r[f];
      if (v !== undefined && !elementExists(v)) err(pointer(at, f), `No element "${v}" in this file or the model.`);
    }
    if (isUses(r.description)) err(pointer(at, "description"), 'Say what flows ("Sends payment requests"), not "uses".');
    if (r.via !== undefined) {
      if (r.id !== undefined) err(pointer(at, "id"), `A relationship with "via" becomes two, "${r.source}--${r.via}" and "${r.via}--${r.target}"; leave "id" out.`);
      if (r.viaDescription === undefined) err(pointer(at, "viaDescription"), `"viaDescription" is required with "via": the label of "${r.via}" → "${r.target}".`);
      else if (isUses(r.viaDescription)) err(pointer(at, "viaDescription"), 'Say what flows, not "uses".');
      if (r.via === r.source || r.via === r.target) err(pointer(at, "via"), "The broker must be a third element, not one of the two ends.");
    } else if (r.viaDescription !== undefined) err(pointer(at, "viaDescription"), '"viaDescription" is only used with "via".');
    if (r.id !== undefined) {
      if (!isCleanId(r.id, true)) err(pointer(at, "id"), `"${r.id}" is not a usable ID: slugs joined by "--", e.g. "web-app--api".`);
      if (fileObj.has(r.id) || idx.elements.has(r.id)) err(pointer(at, "id"), `"${r.id}" is the ID of an element.`);
      if (explicit.has(r.id)) err(pointer(at, "id"), `The ID "${r.id}" is used twice in this file (also at ${pointer("/relationships", explicit.get(r.id)!)}).`);
      else explicit.set(r.id, i);
    }
  });

  const planned = planRelationships(file, idx);
  const pairs = new Map<string, PlannedRel>();
  for (const p of planned) {
    if (!elementExists(p.source) || !elementExists(p.target) || p.source === p.target) {
      if (p.source === p.target && elementExists(p.source)) err(p.pointer, `"${p.source}" cannot have a relationship with itself.`);
      continue;
    }
    if (ancestors(p.source).includes(p.target) || ancestors(p.target).includes(p.source)) {
      err(p.pointer, `"${p.source}" and "${p.target}": one contains the other, and an element cannot have a relationship with its own parent or child.`);
    }
    const m = p.match ? idx.relationships.get(p.match) : undefined;
    if (p.explicitId && m && (m.sourceId !== p.source || m.destinationId !== p.target)) {
      err(pointer(p.pointer, "id"), `"${p.explicitId}" is in the model from "${m.sourceId}" to "${m.destinationId}"; an import does not change a relationship's ends.`);
    }
    const k = `${p.source}\u0000${p.target}\u0000${p.description}`;
    const twin = pairs.get(k);
    if (twin) err(p.pointer, `A relationship "${p.description}" from "${p.source}" to "${p.target}" is already in this file (at ${twin.pointer}).`);
    else pairs.set(k, p);
    const clash = [...idx.relationships.values()].find((r) => r.id !== p.match && r.sourceId === p.source && r.destinationId === p.target && (r.description || "").trim() === p.description);
    if (clash) err(p.pointer, `The model already has the relationship "${p.description}" from "${p.source}" to "${p.target}" as "${clash.id}"; use that ID or leave "id" out.`);
  }

  // ---- technologies written the project's way
  const techs = (at: string, list: string[] | undefined) =>
    (list ?? []).forEach((t, j) => {
      const n = norm(t);
      if (n !== t) warn(pointer(pointer(at, "technologies"), j), `"${t}" is written "${n}" in this project; the import uses "${n}".`);
    });
  file.objects.forEach((o, i) => techs(pointer("/objects", i), o.technologies));
  file.relationships.forEach((r, i) => techs(pointer("/relationships", i), r.technologies));

  // ---- flows and decisions name things that exist
  (file.flows ?? []).forEach((f, i) => {
    const at = pointer("/flows", i);
    if (!f.title.trim()) err(pointer(at, "title"), "A flow needs a title.");
    f.steps.forEach((s, j) => {
      const r = resolveRelRef(s.relationship, planned, idx);
      if ("error" in r) err(pointer(pointer(pointer(at, "steps"), j), "relationship"), r.error);
    });
  });
  (file.decisions ?? []).forEach((d, i) => {
    const at = pointer("/decisions", i);
    if (!d.title.trim()) err(pointer(at, "title"), "A decision needs a title.");
    (d.affects ?? []).forEach((a, j) => {
      if (elementExists(a)) return;
      const r = resolveRelRef(a, planned, idx);
      if ("error" in r) err(pointer(pointer(at, "affects"), j), `No element or relationship "${a}" in this file or the model.`);
    });
  });

  // ---- evidence that points at files (review only, so only warnings)
  const checkEvidence = (at: string, list: ImportEvidence[] | undefined) =>
    (list ?? []).forEach((e, j) => {
      if (e.kind !== "file") return;
      const ep = pointer(pointer(at, "evidence"), j);
      const rel = cleanRel(e.path);
      if (rel === null || rel === "" || isHidden(rel)) return warn(pointer(ep, "path"), `"${e.path}" is outside the code folder or hidden; it cannot be checked.`);
      if (hasCode && code!.kind(rel) !== "file") warn(pointer(ep, "path"), `"${e.path}" is not a file in ${code!.label}.`);
      if (e.lines && e.lines[0] > e.lines[1]) warn(pointer(ep, "lines"), "The first line comes after the last.");
    });
  file.objects.forEach((o, i) => checkEvidence(pointer("/objects", i), o.evidence));
  file.relationships.forEach((r, i) => checkEvidence(pointer("/relationships", i), r.evidence));
  (file.decisions ?? []).forEach((d, i) => checkEvidence(pointer("/decisions", i), d.evidence));

  // ---- no secret-looking values, anywhere in the file
  const all: [string, string][] = [];
  strings(file, "", all);
  for (const [p, s] of all) {
    const why = secretLike(s);
    if (why) err(p, `This ${why}. An import file holds names, never secret values: remove it.`);
  }

  // ---- import edges between mapped components
  if (hasCode) importEdges(file, idx, code!, planned, fileObj, warn);

  return { errors, warnings };
}

/**
 * Claimed relationships between two components whose code is mapped, checked against the imports in that
 * code: a claimed one with no import is a warning (it may be a call that is not an import), and imports
 * between components of the file with no relationship either way are listed. Reads at most MAX_FILES
 * files per component (expandPaths).
 */
function importEdges(file: ImportFile, idx: Index, code: CodeSource, planned: PlannedRel[], fileObj: Map<string, number>, warn: (p: string, m: string) => void): void {
  const pathsOf = new Map<string, string[]>();
  const nameOf = (id: string) => {
    const i = fileObj.get(id);
    return i !== undefined ? file.objects[i]!.name : (idx.elements.get(id)?.name ?? id);
  };
  const isComponent = (id: string) => {
    const i = fileObj.get(id);
    return i !== undefined ? file.objects[i]!.type === "component" : idx.elements.has(id) && idx.kindOf(id) === "component";
  };
  const mapped = (id: string): string[] => {
    const i = fileObj.get(id);
    if (i !== undefined && file.objects[i]!.codePaths?.length) return file.objects[i]!.codePaths!;
    return idx.elements.has(id) ? getJson<string>(idx.elements.get(id)!, CODE_KEY) : [];
  };
  const involved = new Set<string>();
  file.objects.forEach((o) => o.type === "component" && involved.add(o.id));
  for (const p of planned) for (const e of [p.source, p.target]) if (isComponent(e)) involved.add(e);
  for (const id of [...involved].sort()) {
    const paths = mapped(id);
    if (!paths.length) continue;
    const [files] = expandPaths(code, paths);
    if (files.length) pathsOf.set(id, files);
  }
  if (pathsOf.size < 2) return;
  // A file belongs to the component with the longest matching path (a component inside another's folder).
  const owner = new Map<string, { id: string; len: number }>();
  for (const id of pathsOf.keys()) {
    for (const p of mapped(id)) {
      const base = p.replace(/\/+$/, "");
      for (const f of pathsOf.get(id)!) {
        if (f !== base && !f.startsWith(`${base}/`) && base !== ".") continue;
        const cur = owner.get(f);
        if (!cur || base.length > cur.len) owner.set(f, { id, len: base.length });
      }
    }
  }
  const edges = new Map<string, number>();
  for (const [a, b] of scanImports(code, [...owner.keys()].sort())) {
    const ca = owner.get(a)?.id;
    const cb = owner.get(b)?.id;
    if (!ca || !cb || ca === cb) continue;
    const k = `${ca}\u0000${cb}`;
    edges.set(k, (edges.get(k) ?? 0) + 1);
  }
  for (const p of planned) {
    if (p.leg !== "main" || !pathsOf.has(p.source) || !pathsOf.has(p.target)) continue;
    if (!edges.has(`${p.source}\u0000${p.target}`)) {
      warn(p.pointer, `No import from the code of "${nameOf(p.source)}" to the code of "${nameOf(p.target)}" was found; check the relationship and its direction.`);
    }
  }
  const claimed = new Set(planned.map((p) => `${p.source}\u0000${p.target}`));
  for (const r of idx.relationships.values()) claimed.add(`${r.sourceId}\u0000${r.destinationId}`);
  for (const [k, n] of [...edges].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (claimed.has(k)) continue;
    const [a, b] = k.split("\u0000") as [string, string];
    const at = fileObj.has(a) ? pointer("/objects", fileObj.get(a)!) : fileObj.has(b) ? pointer("/objects", fileObj.get(b)!) : null;
    if (!at) continue;
    warn(at, `The code of "${nameOf(a)}" imports the code of "${nameOf(b)}" (${n} import${n === 1 ? "" : "s"}), but there is no relationship from "${nameOf(a)}" to "${nameOf(b)}".`);
  }
}
