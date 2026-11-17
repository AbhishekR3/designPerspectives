/**
 * The import file, schema version 1 (DEC-051): a JSON file of proposed objects, relationships, flows and
 * decisions that the importer (importer.ts) turns into a draft. Written by BMO, a script or by hand.
 *
 * `IMPORT_SCHEMA` is the JSON Schema (draft 2020-12) shipped in the package (`dp import --schema` prints it,
 * the handoff writes it to disk). It is a TypeScript constant, not a .json file, because the package ships
 * only `dist/`. Every object has `additionalProperties: false`, so unknown keys are refused; the one map is
 * `tags` (tag group name → value), whose names are checked against the project's tag groups instead.
 *
 * `parseImportFile` is our own reader (no validator dependency). It walks `IMPORT_SCHEMA` itself, for the
 * small set of keywords the schema uses (see `walk`), so the reader and the shipped schema cannot drift
 * apart; tests/import-file.test.ts checks that they agree. Every error carries a JSON pointer (RFC 6901)
 * and a plain message. What needs the model or the code (IDs resolve, names unique, paths exist) is
 * checked afterwards by checks.ts.
 *
 * Limits: a file of at most 2 MB, 5,000 objects, 20,000 relationships, strings of at most 2,000
 * characters and evidence text of at most 300.
 */

import { ARCH_TYPES, CONNECTOR_KINDS } from "../core/modelEdits.js";
import { IMPORT_CONFIDENCE, IMPORT_LEVELS, IMPORT_OBJECT_TYPES, IMPORT_SOURCES, type FieldError, type ImportFile } from "../shared/types.js";

export const IMPORT_SCHEMA_VERSION = 1;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_OBJECTS = 5_000;
export const MAX_RELATIONSHIPS = 20_000;
export const MAX_STRING = 2_000;
export const MAX_EVIDENCE_TEXT = 300;
/** Errors reported for one file; the rest are counted. */
export const MAX_ERRORS = 200;

/** A model ID written in the file: lower-case letters, digits and dashes (a relationship's may hold "--"). */
export const ID_PATTERN = "^[a-z0-9][a-z0-9-]{0,80}$";

type Schema = Record<string, unknown>;

const text = (maxLength = MAX_STRING, minLength = 0): Schema => ({ type: "string", ...(minLength ? { minLength } : {}), maxLength });
const list = (items: Schema, maxItems: number): Schema => ({ type: "array", items, maxItems });
const id: Schema = { type: "string", pattern: ID_PATTERN };
/** A reference to an element or relationship, in the file or already in the model (whose IDs may be older forms). */
const ref: Schema = text(200, 1);

const evidence: Schema = {
  oneOf: [
    {
      type: "object",
      description: "A file in the code folder, with lines and a short quote.",
      properties: {
        kind: { const: "file" },
        path: text(1000, 1),
        lines: {
          type: "array",
          prefixItems: [
            { type: "integer", minimum: 1 },
            { type: "integer", minimum: 1 },
          ],
          items: false,
          minItems: 2,
          maxItems: 2,
        },
        text: text(MAX_EVIDENCE_TEXT),
      },
      required: ["kind", "path"],
      additionalProperties: false,
    },
    {
      type: "object",
      description: "Stated by the user (intake answers, typed feedback).",
      properties: { kind: { const: "user" }, note: text(MAX_STRING, 1) },
      required: ["kind", "note"],
      additionalProperties: false,
    },
    {
      type: "object",
      description: "A fact of the deterministic scan (evidence.json), by its ID.",
      properties: { kind: { const: "scan" }, fact: text(MAX_STRING, 1) },
      required: ["kind", "fact"],
      additionalProperties: false,
    },
  ],
};

const technologies = list(text(200, 1), 50);
const codePaths = list(text(1000, 1), 200);
const evidenceList: Schema = { type: "array", items: { $ref: "#/$defs/evidence" }, maxItems: 20 };
const confidence: Schema = { enum: [...IMPORT_CONFIDENCE], description: "The writer's own confidence. Shown in review, never used to decide anything." };

const object: Schema = {
  type: "object",
  properties: {
    id: { ...id, description: "The model ID, a slug. An ID already in the model means that object." },
    type: { enum: [...IMPORT_OBJECT_TYPES] },
    name: text(200, 1),
    external: { type: "boolean" },
    parent: { ...ref, description: "Containers: a system's ID; components: a container's ID (in this file or the model)." },
    description: text(),
    technologies,
    archType: { enum: ARCH_TYPES.map(([a]) => a) },
    owner: text(200),
    tags: {
      type: "object",
      description: "Tag group name to value; both must exist in the project's tag groups.",
      propertyNames: { minLength: 1, maxLength: 200 },
      additionalProperties: text(200, 1),
      maxProperties: 50,
    },
    codePaths,
    evidence: evidenceList,
    confidence,
  },
  required: ["id", "type", "name"],
  additionalProperties: false,
};

const relationship: Schema = {
  type: "object",
  properties: {
    id: { ...id, description: 'Explicit model ID (slugs joined by "--"); leave out for <source>--<target>. Not with via.' },
    source: ref,
    target: ref,
    description: { ...text(MAX_STRING, 1), description: 'What flows, e.g. "Sends payment requests"; never "uses".' },
    technologies,
    kind: { enum: CONNECTOR_KINDS.map(([k]) => k) },
    via: { ...ref, description: "The broker (queue, topic) that carries it: two relationships, source→via and via→target." },
    viaDescription: { ...text(MAX_STRING, 1), description: "The label of via→target; required with via." },
    codePaths,
    evidence: evidenceList,
    confidence,
  },
  required: ["source", "target", "description"],
  additionalProperties: false,
};

const flow: Schema = {
  type: "object",
  properties: {
    title: text(200, 1),
    description: text(),
    steps: list(
      {
        type: "object",
        properties: { relationship: ref, note: text() },
        required: ["relationship"],
        additionalProperties: false,
      },
      200,
    ),
  },
  required: ["title", "steps"],
  additionalProperties: false,
};

const decision: Schema = {
  type: "object",
  properties: {
    title: text(200, 1),
    status: { const: "proposed" },
    context: text(),
    decision: text(),
    alternatives: list(
      {
        type: "object",
        properties: { name: text(200, 1), whyNot: text() },
        required: ["name"],
        additionalProperties: false,
      },
      20,
    ),
    affects: list(ref, 100),
    evidence: evidenceList,
  },
  required: ["title", "status", "context", "decision"],
  additionalProperties: false,
};

/** The JSON Schema of an import file, version 1. */
export const IMPORT_SCHEMA: Schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://designperspectives.dev/schema/import-v1.json",
  title: "designPerspectives import file",
  description: "Proposed model objects for one C4 level; turned into a draft by `dp import`. Evidence and confidence are for review and never written to the model.",
  type: "object",
  properties: {
    schemaVersion: { const: IMPORT_SCHEMA_VERSION },
    promptVersion: text(50),
    level: { enum: [...IMPORT_LEVELS] },
    source: {
      type: "object",
      description: "Who wrote the file (shown in review only).",
      properties: { kind: { enum: [...IMPORT_SOURCES] }, backend: text(200), model: text(200) },
      required: ["kind"],
      additionalProperties: false,
    },
    objects: list({ $ref: "#/$defs/object" }, MAX_OBJECTS),
    relationships: list({ $ref: "#/$defs/relationship" }, MAX_RELATIONSHIPS),
    flows: list({ $ref: "#/$defs/flow" }, 200),
    decisions: list({ $ref: "#/$defs/decision" }, 200),
    ignore: list(text(1000, 1), 2000),
    questions: list(text(), 200),
    assumptions: list(text(), 200),
  },
  required: ["schemaVersion", "level", "objects", "relationships"],
  additionalProperties: false,
  $defs: { evidence, object, relationship, flow, decision },
};

// ------------------------------------------------------------------ reading

/** RFC 6901: "~" and "/" in a key are escaped. */
export const pointer = (base: string, key: string | number): string => `${base}/${String(key).replace(/~/g, "~0").replace(/\//g, "~1")}`;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const TYPE_LABEL: Record<string, string> = {
  string: "text (a JSON string)",
  integer: "a whole number",
  number: "a number",
  boolean: "true or false",
  array: "a list",
  object: "an object",
};

function typeOk(type: string, v: unknown): boolean {
  switch (type) {
    case "string":
      return typeof v === "string";
    case "integer":
      return typeof v === "number" && Number.isInteger(v);
    case "number":
      return typeof v === "number" && Number.isFinite(v);
    case "boolean":
      return typeof v === "boolean";
    case "array":
      return Array.isArray(v);
    case "object":
      return isObj(v);
    default:
      return false;
  }
}

const PATTERN_MESSAGE: Record<string, string> = {
  [ID_PATTERN]: 'Not a usable ID: lower-case letters, digits and dashes, starting with a letter or digit, at most 81 characters (e.g. "payment-service").',
};

function resolve(s: Schema): Schema {
  const r = s.$ref;
  if (typeof r !== "string") return s;
  const name = r.replace(/^#\/\$defs\//, "");
  const defs = IMPORT_SCHEMA.$defs as Record<string, Schema>;
  const target = defs[name];
  if (!target) throw new Error(`Unknown schema reference ${r}`);
  return target;
}

const quoteList = (xs: unknown[]) => xs.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(", ");

/**
 * Check `v` against schema `s0`. The keywords used by IMPORT_SCHEMA are supported: $ref (to $defs), type,
 * const, enum, pattern, minLength, maxLength, minimum, properties, required, additionalProperties (false or a
 * schema), propertyNames, maxProperties, items, prefixItems, minItems, maxItems, and oneOf whose branches
 * are told apart by a `const` on `kind`. Anything else throws, so the schema cannot use a keyword this
 * reader would silently skip.
 */
function walk(s0: Schema, v: unknown, at: string, out: FieldError[]): void {
  const s = resolve(s0);
  const add = (message: string, p = at): void => {
    out.push({ pointer: p, message });
  };
  for (const k of Object.keys(s)) if (!KNOWN_KEYWORDS.has(k)) throw new Error(`The import schema uses "${k}", which parseImportFile does not read.`);

  if (Array.isArray(s.oneOf)) {
    const branches = (s.oneOf as Schema[]).map(resolve);
    const kinds = branches.map((b) => ((b.properties as Record<string, Schema>).kind as Schema).const);
    if (!isObj(v)) return add(`Must be ${TYPE_LABEL.object}.`);
    const i = kinds.indexOf(v.kind);
    if (i < 0) return add(`Must be one of: ${quoteList(kinds)}.`, pointer(at, "kind"));
    return walk(branches[i]!, v, at, out);
  }
  if ("const" in s && v !== s.const) return add(`Must be ${JSON.stringify(s.const)}.`);
  if (Array.isArray(s.enum) && !s.enum.includes(v)) return add(`Must be one of: ${quoteList(s.enum)}.`);
  if (typeof s.type === "string" && !typeOk(s.type, v)) return add(`Must be ${TYPE_LABEL[s.type] ?? s.type}.`);

  if (typeof v === "string") {
    if (typeof s.minLength === "number" && v.trim().length < s.minLength) add(s.minLength === 1 ? "Must not be empty." : `At least ${s.minLength} characters.`);
    if (typeof s.maxLength === "number" && v.length > s.maxLength) add(`At most ${s.maxLength} characters (this has ${v.length}).`);
    if (typeof s.pattern === "string" && !new RegExp(s.pattern).test(v)) add(PATTERN_MESSAGE[s.pattern] ?? `Must match ${s.pattern}.`);
  }
  if (typeof v === "number" && typeof s.minimum === "number" && v < s.minimum) add(`Must be at least ${s.minimum}.`);

  if (Array.isArray(v)) {
    if (typeof s.maxItems === "number" && v.length > s.maxItems) return add(`At most ${s.maxItems} items (this has ${v.length}).`);
    if (typeof s.minItems === "number" && v.length < s.minItems) add(`At least ${s.minItems} items.`);
    const prefix = Array.isArray(s.prefixItems) ? (s.prefixItems as Schema[]) : [];
    v.forEach((x, i) => {
      if (i < prefix.length) walk(prefix[i]!, x, pointer(at, i), out);
      else if (s.items === false) add("Not expected here.", pointer(at, i));
      else if (isObj(s.items)) walk(s.items, x, pointer(at, i), out);
    });
  }

  if (isObj(v)) {
    const props = (s.properties ?? {}) as Record<string, Schema>;
    for (const k of (s.required ?? []) as string[]) if (!(k in v)) add(`"${k}" is required.`, pointer(at, k));
    const keys = Object.keys(v);
    if (typeof s.maxProperties === "number" && keys.length > s.maxProperties) add(`At most ${s.maxProperties} entries (this has ${keys.length}).`);
    for (const k of keys) {
      const p = pointer(at, k);
      if (Object.prototype.hasOwnProperty.call(props, k)) {
        walk(props[k]!, v[k], p, out);
        continue;
      }
      if (s.additionalProperties === false) {
        const allowed = Object.keys(props);
        add(`Unknown field "${k}". Allowed here: ${allowed.join(", ")}.`, p);
        continue;
      }
      if (isObj(s.propertyNames)) {
        const pn = s.propertyNames;
        if ((typeof pn.minLength === "number" && k.trim().length < pn.minLength) || (typeof pn.maxLength === "number" && k.length > pn.maxLength)) {
          add(`The name "${k.slice(0, 50)}" must be 1 to ${String(pn.maxLength)} characters.`, p);
        }
      }
      if (isObj(s.additionalProperties)) walk(s.additionalProperties, v[k], p, out);
    }
  }
}

const KNOWN_KEYWORDS = new Set([
  "$schema",
  "$id",
  "$defs",
  "$ref",
  "title",
  "description",
  "type",
  "const",
  "enum",
  "pattern",
  "minLength",
  "maxLength",
  "minimum",
  "properties",
  "required",
  "additionalProperties",
  "propertyNames",
  "maxProperties",
  "items",
  "prefixItems",
  "minItems",
  "maxItems",
  "oneOf",
]);

/** Check an already parsed value against IMPORT_SCHEMA. */
export function schemaErrors(value: unknown): FieldError[] {
  const out: FieldError[] = [];
  walk(IMPORT_SCHEMA, value, "", out);
  return out;
}

/** Cut a long error list, saying how many were left out. */
export function capErrors(errors: FieldError[], max = MAX_ERRORS): FieldError[] {
  if (errors.length <= max) return errors;
  return [...errors.slice(0, max), { pointer: "", message: `${errors.length - max} more problems are not listed.` }];
}

/**
 * Read an import file (JSON text). Returns the file when it follows the schema, and every error
 * otherwise (with a JSON pointer each; "" is the whole file). Nothing is repaired or guessed.
 */
export function parseImportFile(text: string): { file?: ImportFile; errors: FieldError[] } {
  const bytes = Buffer.byteLength(text, "utf-8");
  if (bytes > MAX_FILE_BYTES)
    return { errors: [{ pointer: "", message: `The file is ${bytes} bytes; an import file is at most ${MAX_FILE_BYTES} bytes (2 MB). Import one level, or one container, at a time.` }] };
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch (e) {
    return { errors: [{ pointer: "", message: `Not valid JSON: ${(e as Error).message}` }] };
  }
  const errors = schemaErrors(data);
  if (errors.length) return { errors: capErrors(errors) };
  return { file: data as ImportFile, errors: [] };
}
