/**
 * What BMO may read, and what is hidden before anything is sent (DEC-051, plan section 5 "Defences").
 *
 * `selectFiles` decides which code files may be opened for BMO at all: only files the `CodeSource` reads
 * (it confines reads to the code root, resolves symlinks and refuses hidden paths, DEC-031), minus the
 * intake's `mustNotOpen` and `scope.exclude` globs and the import ignore list, minus a deny-list of names that
 * usually hold secrets even when they are not hidden (`*secret*`, `*.pem`, `id_rsa*`, `credentials*`, `npmrc`,
 * real `.env`-style files, ...), minus binary files. Every file it hands out is redacted.
 *
 * `redactText` replaces secret VALUES with `MASK`:
 * - PEM blocks (`-----BEGIN … -----END …`), and everything after an unterminated `-----BEGIN`;
 * - credentials in URLs (`scheme://user:pass@host` → `scheme://•••@host`);
 * - the value of any key that matches `SECRET_FIELD`, in `KEY=VALUE`, `key: value` (also YAML block
 *   scalars `key: |` and the lines under them), JSON `"key": "value"` and inline `key=value` forms;
 * - token-shaped strings (`TOKEN_SHAPES`: AWS keys, GitHub, Slack, `sk-` keys), JWTs, `Bearer` tokens and
 *   long high-entropy runs.
 * Then every line is checked again with `secretLike`; a line that still looks like it holds a secret is
 * masked whole. Any failure masks the whole text (fail closed): raw text is never returned on an error.
 *
 * What it does not do: it cannot know that an ordinary word is a password (`password = "letmein"` is caught
 * by its key; `connect("db", "letmein")` is not), and it does not read binary files or images at all.
 */

import { cleanRel, type CodeSource } from "../core/codeFiles.js";
import { isHidden } from "../core/util.js";
import type { Intake } from "../import/intake.js";
import { compileGlob, globMatches } from "../import/scan.js";
import { ENTROPY_MIN, MASK, SECRET_FIELD, TOKEN_SHAPES, entropy, secretLike } from "../shared/mask.js";

// ------------------------------------------------------------------ which files

/** File names never opened for BMO, even when not hidden (matched against the name, letter case ignored). */
export const DENY_NAMES = [
  "*secret*",
  "*.pem",
  "*.key",
  "*.crt",
  "*.cer",
  "*.der",
  "*.pfx",
  "*.p12",
  "*.jks",
  "*.keystore",
  "*.ppk",
  "*.kdbx",
  "*.tfstate",
  "*.tfstate.*",
  "*.tfvars",
  "id_rsa*",
  "id_dsa*",
  "id_ecdsa*",
  "id_ed25519*",
  "credentials*",
  "*credentials.json",
  "npmrc",
  "_npmrc",
  "yarnrc",
  "pypirc",
  "netrc",
  "_netrc",
  "pgpass",
  "htpasswd",
  "*.htpasswd",
  "docker-config.json",
  "kubeconfig*",
];

/** Real environment files (`prod.env`, `env.local`, `env`), unless the name says it is a sample. */
const ENV_FILE = /(^|[._-])env($|[._-])/i;
const SAMPLE = /example|sample|template|dist|defaults?/i;

const DENY_GLOBS = DENY_NAMES.map((p) => compileGlob(p));

/** Why a file name is refused for BMO, or null. */
export function deniedName(rel: string): string | null {
  const name = (rel.split("/").pop() ?? rel).toLowerCase();
  const hit = DENY_NAMES.find((_, i) => globMatches(DENY_GLOBS[i]!, name));
  if (hit) return `the name matches "${hit}" (files that usually hold secrets are never sent)`;
  if (ENV_FILE.test(name) && !SAMPLE.test(name) && !/\.(py|js|ts|mjs|cjs|tsx|jsx|go|rb|java|md)$/.test(name)) return "an environment file (only samples such as .env.example-style names are sent)";
  return null;
}

export interface Excerpt {
  path: string;
  /** The redacted text. */
  text: string;
  redactions: number;
}

export interface FileSelector {
  /** Why `rel` may not be opened for BMO, or null when it may. */
  refused(rel: string): string | null;
  /** The redacted text of an allowed file, or `{refused}` with the reason it is not given. */
  read(rel: string): Excerpt | { refused: string };
  /** The globs that must not be opened (intake `mustNotOpen`, `scope.exclude`, the ignore list), for the prompt. */
  readonly mustNotOpen: string[];
}

/**
 * The files BMO may read, as a gate over `code`. `ignore`: the import ignore list (globs of paths "not part
 * of this system"). Candidate IDs in the list (they hold a ":") are not paths and are skipped.
 */
export function selectFiles(code: CodeSource, intake: Pick<Intake, "mustNotOpen" | "scope">, ignore: string[] = []): FileSelector {
  const never = [
    ...intake.mustNotOpen.map((g) => ["it is in the intake's must-not-open list", g] as const),
    ...intake.scope.exclude.map((g) => ["it is excluded from the scope in the intake", g] as const),
    ...ignore.filter((g) => !g.includes(":")).map((g) => ["it is in the import ignore list", g] as const),
  ].map(([why, g]) => ({ why, glob: g, re: compileGlob(g) }));
  const include = intake.scope.include.map((g) => compileGlob(g));
  const refused = (rel0: string): string | null => {
    const rel = cleanRel(rel0);
    if (rel === null || rel === "") return "it is outside the code folder";
    if (isHidden(rel)) return "hidden files and folders are never opened";
    const hit = never.find((n) => globMatches(n.re, rel));
    if (hit) return `${hit.why} ("${hit.glob}")`;
    if (include.length && !include.some((g) => globMatches(g, rel))) return "it is outside the scope given in the intake";
    const denied = deniedName(rel);
    if (denied) return denied;
    if (!code.hasRoot) return "there is no code folder";
    if (code.kind(rel) !== "file") return "it is not a readable file in the code folder";
    return null;
  };
  return {
    mustNotOpen: never.map((n) => n.glob),
    refused,
    read(rel0) {
      const why = refused(rel0);
      if (why) return { refused: why };
      const rel = cleanRel(rel0)!;
      const text = code.read(rel);
      if (text === null) return { refused: "it could not be read" };
      if (text.slice(0, 8192).includes("\u0000")) return { refused: "it is a binary file" };
      const r = redactText(text);
      if (r.failed) return { refused: "redaction failed, so the file is not sent" };
      return { path: rel, text: r.text, redactions: r.count };
    },
  };
}

// ------------------------------------------------------------------ redaction

export interface Redacted {
  text: string;
  /** How many values were replaced by MASK. */
  count: number;
  /** True when redaction failed: `text` is then empty and must not be replaced by the original. */
  failed?: boolean;
}

/** A value that names no secret: empty, a placeholder, a reference to a variable, or a type name. */
const SAFE_VALUE =
  /^(|<[^>]*>|\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|\{\{\s*[\w.]+\s*\}\}|\*+|x{3,}|•+|\.\.\.|changeme|example|redacted|none|null|nil|undefined|true|false|required|optional|string|str|number|int|integer|boolean|bool|bytes|any|unknown|secretstr|\[\]|\{\}|""|'')$/i;

const PEM = /-----BEGIN [^\n-]{0,60}-----[\s\S]*?-----END [^\n-]{0,60}-----/g;
const PEM_OPEN = /-----BEGIN\b[\s\S]*$/;
const URL_CRED = /\b([a-z][a-z0-9+.-]{1,20}:\/\/)[^\s/@'"<>]+@/gi;
const BEARER = /\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/-]{12,}=*/g;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const TOKENS = TOKEN_SHAPES.filter(([re]) => !re.source.includes("BEGIN")).map(([re]) => new RegExp(re.source, "g"));
const RUN = /[A-Za-z0-9+=_-]{32,}/g;

/** `key = value` / `key: value` at the start of a line (env files, YAML, INI, code declarations); the value is the rest of the line. */
const LINE_ASSIGN = /^(\s*(?:-\s+)?(?:export\s+)?(?:(?:const|let|var|val|final|static|private|public|protected|readonly)\s+)*)(["']?)([A-Za-z_][A-Za-z0-9_.-]{0,80})\2(\s*[:=]\s*)(.*)$/;
/** A list entry that names a secret (`- name: DB_PASSWORD`); its `value:` line follows. */
const NAMED_ENTRY = /^\s*(?:-\s+)?(?:name|key)\s*:\s*["']?([A-Za-z_][A-Za-z0-9_.-]*)["']?\s*$/;
const VALUE_LINE = /^(\s*(?:-\s+)?value\s*:\s*)(\S.*)$/;
/** Reading a variable from the environment by name: the name is useful and holds no secret. */
const ENV_REF_SRC =
  "process\\.env\\.[A-Za-z_]\\w*|process\\.env\\[[\"'][A-Za-z_]\\w*[\"']\\]|os\\.environ\\[[\"'][A-Za-z_]\\w*[\"']\\]|os\\.environ\\.get\\([\"'][A-Za-z_]\\w*[\"']\\)|os\\.getenv\\([\"'][A-Za-z_]\\w*[\"']\\)|import\\.meta\\.env\\.[A-Za-z_]\\w*";
const ENV_REF = new RegExp(`^(${ENV_REF_SRC})[,;]?$`);
const ENV_REFS = new RegExp(ENV_REF_SRC, "g");
const ENV_REF_AT = new RegExp(`^(${ENV_REF_SRC})`);
/** Inline `key=value`, `key: value`, `"key": "value"` anywhere in a line; the value is one quoted string or one run. */
const INLINE_ASSIGN =
  /(["']?)([A-Za-z_][A-Za-z0-9_.-]{0,80})\1(\s*[:=]\s*)((?:<[^<>\n]{0,80}>|\{\{[^}\n]{0,80}\}\}|\$\{[^}\n]{0,80}\})(?=[\s,;"'`)}\]]|$)|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`[^`\n]*`|[^\s,;&)}\]"'`]+)/g;

const unquote = (v: string): string => v.replace(/^(["'`])([\s\S]*)\1$/, "$2");
const isSafe = (v: string): boolean => SAFE_VALUE.test(unquote(v.trim().replace(/[,;]$/, "").trim())) || ENV_REF.test(v.trim());
const quotedMask = (v: string): string => {
  const q = v.trim()[0];
  return q === '"' || q === "'" || q === "`" ? `${q}${MASK}${q}` : MASK;
};

function redactLines(text: string, bump: () => void): string {
  const lines = text.split("\n");
  let blockIndent = -1;
  let namedSecret = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const indent = line.length - line.trimStart().length;
    if (namedSecret > 0) {
      namedSecret--;
      const v = VALUE_LINE.exec(line);
      if (v && !isSafe(v[2]!)) {
        lines[i] = `${v[1]}${quotedMask(v[2]!)}`;
        bump();
        namedSecret = 0;
        continue;
      }
    }
    const named = NAMED_ENTRY.exec(line);
    if (named && SECRET_FIELD.test(named[1]!)) namedSecret = 2;
    if (blockIndent >= 0) {
      if (line.trim() === "" || indent > blockIndent) {
        if (line.trim() !== "") {
          lines[i] = `${line.slice(0, indent)}${MASK}`;
          bump();
        }
        continue;
      }
      blockIndent = -1;
    }
    const m = LINE_ASSIGN.exec(line);
    if (!m || !SECRET_FIELD.test(m[3]!)) continue;
    const value = m[5]!;
    // A YAML block scalar: the secret is on the lines under it.
    if (/^[|>][+-]?\d*\s*(#.*)?$/.test(value.trim())) {
      blockIndent = indent;
      continue;
    }
    // A value that opens an object or list on its own line, or a function: the members are checked one by one.
    if (/^[{[(]\s*$/.test(value.trim()) || /^(function\b|\(.*\)\s*=>)/.test(value.trim())) continue;
    if (isSafe(value)) continue;
    const trail = /[,;]\s*$/.exec(value)?.[0] ?? "";
    lines[i] = `${m[1]}${m[2]}${m[3]}${m[2]}${m[4]}${quotedMask(value)}${trail.trim()}`;
    bump();
  }
  return lines.join("\n");
}

function highEntropy(run: string): boolean {
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/].filter((r) => r.test(run)).length;
  return classes >= 2 && entropy(run) >= ENTROPY_MIN;
}

function redactUnsafe(text: string): Redacted {
  let count = 0;
  const bump = () => {
    count++;
  };
  let t = text.replace(PEM, () => (bump(), MASK));
  t = t.replace(PEM_OPEN, () => (bump(), MASK));
  t = t.replace(URL_CRED, (_m, scheme: string) => (bump(), `${scheme}${MASK}@`));
  t = redactLines(t, bump);
  t = t.replace(INLINE_ASSIGN, (m, q: string, key: string, sep: string, value: string, offset: number, all: string) => {
    if (!SECRET_FIELD.test(key) || isSafe(value) || ENV_REF_AT.test(all.slice(offset + m.length - value.length))) return m;
    bump();
    return `${q}${key}${q}${sep}${quotedMask(value)}`;
  });
  t = t.replace(BEARER, (_m, word: string) => (bump(), `${word} ${MASK}`));
  t = t.replace(JWT, () => (bump(), MASK));
  for (const re of TOKENS) t = t.replace(re, () => (bump(), MASK));
  t = t.replace(RUN, (run) => (highEntropy(run) ? (bump(), MASK) : run));
  // Second net: a line the rules above missed but that still looks like it holds a secret is masked whole.
  t = t
    .split("\n")
    .map((line) => {
      if (!secretLike(line.replace(ENV_REFS, ""))) return line;
      bump();
      return `${line.slice(0, line.length - line.trimStart().length)}${MASK} (line hidden: it looked like it held a secret)`;
    })
    .join("\n");
  return { text: t, count };
}

/** `text` with secret values replaced by MASK, and how many were replaced. Never returns the raw text on an error. */
export function redactText(text: string): Redacted {
  try {
    return redactUnsafe(text);
  } catch {
    return { text: "", count: 0, failed: true };
  }
}

/** A JSON value with every string redacted (keys and structure kept), for the files written next to a
 *  handoff prompt. A string that cannot be redacted becomes MASK (fail closed). */
export function redactValue<T>(v: T): T {
  if (typeof v === "string") {
    const r = redactText(v);
    return (r.failed ? MASK : r.text) as T;
  }
  if (Array.isArray(v)) return v.map((x) => redactValue(x)) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redactValue(x)])) as T;
  return v;
}
