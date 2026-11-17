/**
 * Field names whose values are hidden ("•••") wherever dp shows data observed in a running system:
 * secrets (passwords, tokens, keys, cookies) and personal financial data (card numbers, IBANs).
 */
export const SECRET_FIELD = /pass(word|wd)?$|secret|token|authori[sz]ation|cookie|session|api[-_.]?key|ssn|cvv|cvc|card[-_.]?(number|no)|pan$|iban|pin$/i;

export const MASK = "•••";

// ------------------------------------------------------------------ names that hold a secret (the redaction)

/** Words that name a secret by themselves, in a variable, field or header name (`db_password`, `X-Auth-Token`, `signingSecret`). */
const SECRET_WORDS = new Set(["password", "passwd", "pwd", "passphrase", "secret", "secrets", "token", "credential", "credentials", "private", "apikey", "bearer"]);
/** In `<word>_key` the word says what kind of key: these are not secrets (a database or cache key, a public key). */
const PLAIN_KEY_QUALIFIERS = new Set([
  "primary",
  "foreign",
  "partition",
  "sort",
  "range",
  "hash",
  "cache",
  "route",
  "routing",
  "lookup",
  "unique",
  "public",
  "composite",
  "natural",
  "shard",
  "row",
  "map",
  "i18n",
  "translation",
  "message",
  "event",
  "group",
  "order",
  "item",
  "object",
  "storage",
  "bucket",
  "table",
  "index",
  "idempotency",
  "dedup",
  "correlation",
  "trace",
  "search",
  "filter",
  "feature",
  "flag",
  "config",
  "setting",
  "settings",
  "lang",
  "locale",
  "sub",
  "parent",
  "child",
  "node",
  "tree",
  "list",
  "dict",
  "json",
  "yaml",
  "short",
  "long",
  "default",
  "empty",
  "sample",
  "example",
  "test",
  "dummy",
  "placeholder",
]);
/** Compound words that run `key` on to what it is (`apikey`, `secretkey`, `privatekey`). */
const KEY_COMPOUND = /^(api|secret|private|access|signing|encryption|auth|master|license|licence|client|jwt|hmac|ssh|gpg|pgp|crypto|webhook|session)key$/;

/**
 * Whether a variable, field, header or attribute name holds a secret: everything `SECRET_FIELD` says, and the
 * words `passphrase`, `pwd`, `credential(s)`, `private`, and `<kind>_key` / `<kind>Key` (`PRIVATE_KEY`,
 * `ENCRYPTION_KEY`, `stripeKey`) unless the kind says it is no secret (`PRIMARY_KEY`, `partition_key`). A bare
 * `key`, `KEY_ID` and words that only contain it (`keyboard`, `monkey`) are not. SECRET_FIELD itself is kept as it
 * is: the trace masking shares it.
 */
export function isSecretName(name: string): boolean {
  if (SECRET_FIELD.test(name)) return true;
  if (name.length > 120) return false;
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (words.some((w) => SECRET_WORDS.has(w) || KEY_COMPOUND.test(w))) return true;
  const last = words.length - 1;
  if (last >= 1 && words[last] === "key") return !PLAIN_KEY_QUALIFIERS.has(words[last - 1]!);
  return false;
}

/** Strings shaped like a credential whatever field they are in: an AWS access key, a PEM block, and the
 *  prefixes of common API tokens (GitHub, Slack, OpenAI-style "sk-"). */
export const TOKEN_SHAPES: [RegExp, string][] = [
  [/\bAKIA[0-9A-Z]{16}\b/, "an AWS access key"],
  [/-----BEGIN\b/, "a PEM key or certificate block"],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, "a GitHub token"],
  [/\bgithub_pat_[A-Za-z0-9_]{30,}/, "a GitHub token"],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, "a Slack token"],
  [/\bsk-[A-Za-z0-9_-]{20,}/, "an API key"],
  [/\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}/, "a payment API key"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "a Google API key"],
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
const ASSIGN = /(?<![A-Za-z0-9_.])(?<![A-Za-z0-9_.]-)([A-Za-z_][A-Za-z0-9_.-]{0,60})\s*[:=]\s*["']?([^\s"',;)]{4,})/g;
const PLACEHOLDER = /^(<[^>]*>|\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|\*+|x{3,}|•+|\.\.\.|changeme|example|redacted|none|null|true|false|required|optional)$/i;

/** What makes `s` look like it holds a secret value, or null. The secret itself is never part of the answer. */
export function secretLike(s: string): string | null {
  for (const [re, what] of TOKEN_SHAPES) if (re.test(s)) return `looks like ${what}`;
  for (const m of s.matchAll(ASSIGN)) {
    const value = m[2]!;
    if (isSecretName(m[1]!) && !PLACEHOLDER.test(value) && value.length >= 6 && /[^A-Za-z]/.test(value)) return `gives a value for "${m[1]}"`;
  }
  if (highEntropyRun(s)) return "holds a long random-looking string (a key or token?)";
  return null;
}
