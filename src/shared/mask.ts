/**
 * Field names whose values are hidden ("•••") wherever dp shows data observed in a running system:
 * secrets (passwords, tokens, keys, cookies) and personal financial data (card numbers, IBANs).
 * The live UI script (src/server/inspectScript.ts) carries the same list as text; keep them equal.
 */
export const SECRET_FIELD = /pass(word|wd)?$|secret|token|authori[sz]ation|cookie|session|api[-_.]?key|ssn|cvv|cvc|card[-_.]?(number|no)|pan$|iban|pin$/i;

export const MASK = "•••";

/** Strings shaped like a credential whatever field they are in: an AWS access key, a PEM block, and the
 *  prefixes of common API tokens (GitHub, Slack, OpenAI-style "sk-"). */
export const TOKEN_SHAPES: [RegExp, string][] = [
  [/\bAKIA[0-9A-Z]{16}\b/, "an AWS access key"],
  [/-----BEGIN\b/, "a PEM key or certificate block"],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, "a GitHub token"],
  [/\bgithub_pat_[A-Za-z0-9_]{30,}/, "a GitHub token"],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, "a Slack token"],
  [/\bsk-[A-Za-z0-9_-]{20,}/, "an API key"],
];

/** Shannon entropy of a string, in bits per character. */
export function entropy(s: string): number {
  const counts = new Map<string, number>();
  for (const c of s) counts.set(c, (counts.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of counts.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/** A run of 32 or more token characters that mixes at least two of lower case, upper case and digits, with
 *  high entropy (random keys and tokens), but not hex hashes (git commits) or UUIDs, which stay below it. */
const RUN = /[A-Za-z0-9+=_-]{32,}/g;
export const ENTROPY_MIN = 4.2;

function highEntropyRun(s: string): boolean {
  for (const m of s.matchAll(RUN)) {
    const run = m[0];
    const classes = [/[a-z]/, /[A-Z]/, /[0-9]/].filter((r) => r.test(run)).length;
    if (classes >= 2 && entropy(run) >= ENTROPY_MIN) return true;
  }
  return false;
}

/** `name=value` or `name: value` where the name is a secret field and the value is not a placeholder and
 *  holds a digit or a symbol (so prose such as "token: checks expiry" is not taken for a secret). */
const ASSIGN = /([A-Za-z_][A-Za-z0-9_.-]{0,60})\s*[:=]\s*["']?([^\s"',;)]{4,})/g;
const PLACEHOLDER = /^(<[^>]*>|\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|\*+|x{3,}|•+|\.\.\.|changeme|example|redacted|none|null|true|false|required|optional)$/i;

/** What makes `s` look like it holds a secret value, or null. The secret itself is never part of the answer. */
export function secretLike(s: string): string | null {
  for (const [re, what] of TOKEN_SHAPES) if (re.test(s)) return `looks like ${what}`;
  for (const m of s.matchAll(ASSIGN)) {
    const value = m[2]!;
    if (SECRET_FIELD.test(m[1]!) && !PLACEHOLDER.test(value) && value.length >= 6 && /[^A-Za-z]/.test(value)) return `gives a value for "${m[1]}"`;
  }
  if (highEntropyRun(s)) return "holds a long random-looking string (a key or token?)";
  return null;
}
