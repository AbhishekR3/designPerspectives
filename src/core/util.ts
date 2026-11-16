/** Small helpers shared across the model modules: atomic file writes and JSON / value utilities. */

import fs from "node:fs";
import path from "node:path";

/** Write via a temporary file and rename (no half-written files). `mode`: the new file's permissions
 *  (set when the temporary file is created, so the content is never readable with wider ones). */
export function atomicWrite(file: string, text: string, mode?: number): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(tmp, text, mode === undefined ? "utf-8" : { encoding: "utf-8", mode });
    if (mode !== undefined) fs.chmodSync(tmp, mode);
    fs.renameSync(tmp, file);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
}

/** `p` made absolute with every existing part resolved to its real name (symlinks, and letter case on
 *  case-insensitive disks: `realpathSync.native` asks the operating system, plain `realpathSync` keeps the
 *  case as typed); the parts that do not exist yet are kept as given. */
export function realLoose(p: string): string {
  const abs = path.resolve(p);
  const rest: string[] = [];
  let cur = abs;
  for (;;) {
    try {
      const real = fs.realpathSync.native(cur);
      return rest.length ? path.join(real, ...rest.reverse()) : real;
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return abs;
      rest.push(path.basename(cur));
      cur = parent;
    }
  }
}

/** True if the disk holding `dir` ignores letter case in names (the default on macOS and Windows): the same
 *  path in other letters reaches the same folder. Checked by looking the path up again in other case. */
export function caseInsensitiveDisk(dir: string): boolean {
  try {
    const real = realLoose(dir);
    const id = fs.statSync(real);
    for (const alt of [real.toUpperCase(), real.toLowerCase()]) {
      if (alt === real) continue;
      try {
        const s = fs.statSync(alt);
        if (s.ino === id.ino && s.dev === id.dev) return true;
      } catch {
        /* not found in this case: keep looking */
      }
    }
  } catch {
    /* an unreadable folder: treat the disk as case-sensitive */
  }
  return false;
}

// ---- JSON and value helpers ----

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

/** True if any segment of a relative path starts with "." (.git, .env, a/.hidden/x): hidden files and
 *  folders are never read, written, listed or mapped (DEC-031). Used by codeFiles.ts and the model rules. */
export function isHidden(rel: string): boolean {
  return rel.split(/[\\/]/).some((part) => part.startsWith(".") && part !== "." && part !== "..");
}

export function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

export function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
