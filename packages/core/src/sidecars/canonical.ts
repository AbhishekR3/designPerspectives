/**
 * Canonical form of a validated sidecar value, ready for YAML printing.
 *
 * Rules (file 04 canonical-file rules, task 0b-3):
 * - Mappings become `Map`s so that key order is exactly the order chosen here (plain objects would
 *   hoist integer-like keys).
 * - Keys of schema objects: the identity key (the first of `id`, `view`, `subject` the schema
 *   declares) first, then the rest in code-unit order. Record keys and keys of free-form
 *   (`z.unknown()`) mappings: code-unit order.
 * - Sequences keep their order (the caller sorts relationships by id).
 * - `undefined` values are dropped.
 * - DEFAULT-VALUE RULE: a key whose schema has a Zod `.default()` is omitted when its value deep-equals
 *   that default. Loading fills defaults back in, so canonical files never spell out defaults and
 *   `print(load(file)) === file` holds for canonical files. A file that spells out a default value
 *   loads fine but is not canonical: printing drops that key.
 */
import type { z } from "zod";
import { compareStrings } from "./types.js";

const IDENTITY_KEYS = ["id", "view", "subject"] as const;
const NO_DEFAULT = Symbol("no-default");

type AnySchema = z.ZodType;
interface SchemaDef {
  type: string;
  innerType?: AnySchema;
  shape?: Record<string, AnySchema>;
  element?: AnySchema;
  valueType?: AnySchema;
  defaultValue?: unknown;
}

/** Stands in for a missing schema (`z.unknown()` content): every mapping is a plain sorted mapping. */
const FREE_FORM: SchemaDef = { type: "unknown" };

function defOf(schema: AnySchema | undefined): SchemaDef | undefined {
  return schema ? (schema.def as unknown as SchemaDef) : undefined;
}

/** Strips optional / nullable / default / readonly wrappers. */
function unwrap(schema: AnySchema | undefined): AnySchema | undefined {
  let current = schema;
  for (let def = defOf(current); def?.innerType; def = defOf(current)) current = def.innerType;
  return current;
}

function defaultOf(schema: AnySchema | undefined): unknown {
  let current = schema;
  for (let def = defOf(current); def; def = defOf(current)) {
    if (def.type === "default") return def.defaultValue;
    current = def.innerType;
  }
  return NO_DEFAULT;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Map);
}

/** Order-insensitive structural key used for default comparison. */
export function stableKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableKey).join(",")}]`;
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort(compareStrings);
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableKey(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

/** Converts a validated value to its canonical, YAML-printable form (see module comment). */
export function canonicalize(schema: AnySchema | undefined, value: unknown): unknown {
  const def = defOf(unwrap(schema)) ?? FREE_FORM;
  if (Array.isArray(value)) return value.map((item) => canonicalize(def.element, item));
  if (!isPlainObject(value)) return value;
  return def.shape ? canonicalObject(def.shape, value) : canonicalRecord(def.valueType, value);
}

function canonicalRecord(valueSchema: AnySchema | undefined, value: Record<string, unknown>): Map<string, unknown> {
  const keys = Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort(compareStrings);
  return new Map(keys.map((k) => [k, canonicalize(valueSchema, value[k])]));
}

function canonicalObject(shape: Record<string, AnySchema>, value: Record<string, unknown>): Map<string, unknown> {
  const keys = orderKeys(Object.keys(value), shape).filter((k) => keepField(shape[k], value[k]));
  return new Map(keys.map((k) => [k, canonicalize(shape[k], value[k])]));
}

function orderKeys(keys: string[], shape: Record<string, AnySchema>): string[] {
  const identity = IDENTITY_KEYS.find((k) => k in shape);
  const rest = keys.filter((k) => k !== identity).sort(compareStrings);
  return identity !== undefined && keys.includes(identity) ? [identity, ...rest] : rest;
}

function keepField(schema: AnySchema | undefined, value: unknown): boolean {
  if (value === undefined) return false;
  const fallback = defaultOf(schema);
  return fallback === NO_DEFAULT || stableKey(fallback) !== stableKey(value);
}
