/** Minimal semver range check for plug-in contract ranges: supports exact, ^, ~, >= . No prerelease tags. */
type V = [number, number, number];

function parse(v: string): V | undefined {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined;
}

function cmp(a: V, b: V): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

function caretUpper(b: V): V {
  if (b[0] > 0) return [b[0] + 1, 0, 0];
  if (b[1] > 0) return [0, b[1] + 1, 0];
  return [0, 0, b[2] + 1];
}

const UPPER: Record<string, (b: V) => V | undefined> = {
  "^": caretUpper,
  "~": (b) => [b[0], b[1] + 1, 0],
  ">=": () => undefined,
};

function operatorOf(r: string): string {
  if (r.startsWith(">=")) return ">=";
  return r[0] === "^" || r[0] === "~" ? r[0] : "=";
}

function inRange(v: V, base: V, op: string): boolean {
  if (op === "=") return cmp(v, base) === 0;
  const upper = UPPER[op]!(base);
  return cmp(v, base) >= 0 && (upper === undefined || cmp(v, upper) < 0);
}

export function satisfies(version: string, range: string): boolean {
  const r = range.trim();
  const op = operatorOf(r);
  const v = parse(version);
  const base = parse(r.slice(op === "=" ? 0 : op.length));
  return !!v && !!base && inRange(v, base, op);
}
