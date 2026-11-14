/** JSON helpers shared by the model modules. */

export type Obj = Record<string, unknown>;

export function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** File format: 2-space indent and a final newline, so `git diff` stays readable. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

/**
 * One-line JSON with ", " and ": " separators. Used for the JSON stored inside `dp.*` properties,
 * so values written by earlier (Python) versions keep the same text when re-saved.
 */
export function inlineJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return "[" + value.map(inlineJson).join(", ") + "]";
  if (isObj(value)) {
    return (
      "{" +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => JSON.stringify(k) + ": " + inlineJson(v))
        .join(", ") +
      "}"
    );
  }
  return JSON.stringify(value);
}

/** Round half to even (as Python's round()), so exact .5 values land where earlier versions put them. */
export function roundHalfEven(x: number): number {
  const r = Math.round(x);
  if (Math.abs(x % 1) === 0.5) return 2 * Math.round(x / 2);
  return r;
}

export function round2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

export function deepClone<T>(v: T): T {
  return structuredClone(v);
}

/** Order keys: the listed ones first (in that order), then any others in their original order. */
export function ordered(obj: Obj, keys: readonly string[], drop: (k: string, v: unknown) => boolean = () => false): Obj {
  const out: Obj = {};
  for (const k of keys) {
    if (k in obj && obj[k] !== null && obj[k] !== undefined && !drop(k, obj[k])) out[k] = obj[k];
  }
  for (const [k, v] of Object.entries(obj)) {
    if (!keys.includes(k) && v !== null && v !== undefined) out[k] = v;
  }
  return out;
}

export function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

export function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
