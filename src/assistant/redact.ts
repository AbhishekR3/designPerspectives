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
 * - credentials in URLs (`scheme://user:pass@host`, the password may hold `/` and `@`) and in scheme-less
 *   DSNs (`user:pass@tcp(host)/db`); the path of Slack, Discord and similar webhook URLs;
 * - the value of any key that `isSecretName` says is a secret (shared/secretFields.ts), in `KEY=VALUE`, `key: value`
 *   (also YAML block scalars `key: |`, quoted and TOML triple-quoted strings that run over several lines, and
 *   the lines that continue a plain value), JSON `"key": "value"` and inline `key=value` forms;
 * - the same by name in XML (`<add key="ApiKey" value="…"/>`, `<password>…</password>`), in calls and index
 *   forms (`setRequestProperty("X-Api-Key", "…")`, `headers["x-api-key"] = "…"`, `put("password", "…")`);
 * - every value under `data:` / `stringData:` of a Kubernetes `kind: Secret` document;
 * - `_auth=`, `mysql -pXXXX`, `--password XXXX`, SQL `PASSWORD '…'` and `IDENTIFIED BY '…'`;
 * - token-shaped strings (`TOKEN_SHAPES`: AWS keys, GitHub, Slack, `sk-` keys), JWTs, `Bearer` tokens, long hex
 *   strings that are assigned to a constant or sit next to a secret name, and long high-entropy runs.
 * Every pattern is linear in the size of the text (no nested or overlapping repeats; scans that look back or
 * ahead are bounded), because the text comes from a repository.
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
import { ENTROPY_MIN, MASK, TOKEN_SHAPES, entropy, isSecretName, secretLike } from "../shared/secretFields.js";

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
  "terraform.tfstate*",
  "web.config",
  "appsettings*.json",
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
  /** The rules every path is held to: the path as given, and the path it really is once links are resolved. */
  const rulesFor = (rel: string): string | null => {
    if (isHidden(rel)) return "hidden files and folders are never opened";
    const hit = never.find((n) => globMatches(n.re, rel));
    if (hit) return `${hit.why} ("${hit.glob}")`;
    if (include.length && !include.some((g) => globMatches(g, rel))) return "it is outside the scope given in the intake";
    return deniedName(rel);
  };
  const refused = (rel0: string): string | null => {
    const rel = cleanRel(rel0);
    if (rel === null || rel === "") return "it is outside the code folder";
    const why = rulesFor(rel);
    if (why) return why;
    if (!code.hasRoot) return "there is no code folder";
    if (code.kind(rel) !== "file") return "it is not a readable file in the code folder";
    // A link: the file it really is must pass the same rules (a link into a closed folder or to id_rsa opens nothing).
    const real = code.resolved?.(rel);
    if (real !== undefined && real !== null && real !== rel) {
      const viaLink = rulesFor(real);
      if (viaLink) return `it is a link to "${real}": ${viaLink}`;
    }
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

const BEARER = /\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/-]{12,}=*/g;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const TOKENS = TOKEN_SHAPES.filter(([re]) => !re.source.includes("BEGIN")).map(([re]) => new RegExp(re.source, "g"));
const RUN = /[A-Za-z0-9+=_-]{32,}/g;

/** `scheme://` and what follows it up to a space, quote or bracket: the part with credentials is cut out of this by hand. */
const URL_REST = /\b([a-z][a-z0-9+.-]{1,20}:\/\/)([^\s'"<>`]*)/gi;
/** Webhook URLs whose path is the credential (Slack, Discord, Teams, Zapier, Google Chat). */
const WEBHOOK =
  /\b(https?:\/\/(?:hooks\.slack\.com\/(?:services|workflows|triggers)|(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/(?:v\d{1,2}\/)?webhooks|[a-z0-9.-]{1,80}\.webhook\.office\.com\/webhook[a-z0-9]{0,3}|outlook\.office\.com\/webhook|hooks\.zapier\.com\/hooks\/catch|chat\.googleapis\.com\/v1\/spaces)\/?)[^\s'"<>`]+/gi;
const DSN_HOST = /@(?:tcp|unix|pipe|memory|cloudsql|udp)\(/g;
/** An npm registry login: `//host/:_auth=BASE64`. */
const NPM_AUTH = /(?<![A-Za-z0-9])(_auth\s*=\s*)(\S+)/g;
/** SQL: `PASSWORD '…'`, `PASSWORD = '…'`, `IDENTIFIED BY '…'`, `IDENTIFIED WITH plugin BY '…'`. */
const SQL_PASSWORD =
  /(?<![\w"'`.])(PASSWORD|IDENTIFIED[ \t]{1,4}BY|IDENTIFIED[ \t]{1,4}WITH[ \t]{1,4}\w{1,40}[ \t]{1,4}(?:BY|AS))([ \t]{1,4}|[ \t]{0,4}=[ \t]{0,4})('(?:[^'\\\n]|\\.|''){1,200}'|"(?:[^"\\\n]|\\.){1,200}")/gi;
/** A command line flag that takes a secret as the next word. */
const FLAG_SECRET = /(--(?:password|passwd|pass|secret|token|api-key|apikey))[ \t]{1,4}(?!-)(\S{1,200})/gi;
const MYSQL_P = /(^|[ \t])(-p)([^\s-]\S{0,200})/g;
const MYSQL_WORD = /\bmysql(?:dump|admin|sh)?\b/i;
/** `("password", "value")`, `.put("password", "value")`, `headers["x-api-key"] = "value"`. */
const KEYED_VALUE = /(["'])([A-Za-z_][A-Za-z0-9_.-]{0,80})\1(\s{0,4}(?:,|\]\s{0,4}:?=|\)\s{0,4}=)\s{0,4})("(?:[^"\\\n]|\\.){0,500}"|'(?:[^'\\\n]|\\.){0,500}')/g;
/** An XML start tag, at most 2000 characters, and its attributes. */
const XML_TAG = /<[A-Za-z][^<>]{0,2000}>/g;
const XML_ATTR = /(?<![A-Za-z0-9_:.])(?<![A-Za-z0-9_:.]-)([A-Za-z_][\w:.-]{0,60})\s{0,4}=\s{0,4}("[^"]{0,1000}"|'[^']{0,1000}')/g;
const XML_KEY_ATTR = /^(key|name|id|setting|param|variable|var|property|prop)$/i;
const XML_ELEMENT = /<([A-Za-z_][\w:.-]{0,80})(?:\s[^<>]{0,200})?>([^<>]{1,500})<\/\1>/g;
/** A hex string of 32 or more digits assigned to a name (`HMAC = "9f86…"`, `"salt": "…"`). */
const HEX_ASSIGN = /(?<![A-Za-z0-9_.])(?<![A-Za-z0-9_.]-)([A-Za-z_][A-Za-z0-9_.-]{0,80})(["'`]?)([ \t]{0,4}[:=][ \t]{0,4})(["'`]?)([0-9a-fA-F]{32,})\4(?![0-9A-Za-z])/g;
const HEX_RUN = /(?<![0-9A-Za-z])[0-9a-fA-F]{32,}(?![0-9A-Za-z])/g;
/** Words that say a hex string is a digest or an id, not a key. */
const HASHY = new Set([
  "sha",
  "sha1",
  "sha256",
  "sha384",
  "sha512",
  "md5",
  "commit",
  "hash",
  "checksum",
  "digest",
  "etag",
  "rev",
  "revision",
  "id",
  "uuid",
  "guid",
  "integrity",
  "tag",
  "fingerprint",
  "thumbprint",
]);

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
  /(?<![A-Za-z0-9_.])(?<![A-Za-z0-9_.]-)(["']?)([A-Za-z_][A-Za-z0-9_.-]{0,80})\1(\s*[:=]\s*)((?:<[^<>\n]{0,80}>|\{\{[^}\n]{0,80}\}\}|\$\{[^}\n]{0,80}\})(?=[\s,;"'`)}\]]|$)|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`[^`\n]*`|[^\s,;&)}\]"'`]+)/g;

const unquote = (v: string): string => v.replace(/^(["'`])([\s\S]*)\1$/, "$2");
const isSafe = (v: string): boolean => SAFE_VALUE.test(unquote(v.trim().replace(/[,;]$/, "").trim())) || ENV_REF.test(v.trim());
const quotedMask = (v: string): string => {
  const q = v.trim()[0];
  return q === '"' || q === "'" || q === "`" ? `${q}${MASK}${q}` : MASK;
};
const indentOf = (line: string): number => line.length - line.trimStart().length;

/** PEM blocks, found with `indexOf` (a pattern for them is quadratic on repeated BEGIN lines): from a BEGIN line to the END line; with no END, to the end of the text. */
function maskPem(text: string, bump: () => void): string {
  let out = "";
  let pos = 0;
  for (;;) {
    const begin = text.indexOf("-----BEGIN", pos);
    if (begin < 0) break;
    out += text.slice(pos, begin) + MASK;
    bump();
    const end = text.indexOf("-----END", begin + 10);
    if (end < 0) return out;
    const close = text.indexOf("-----", end + 8);
    pos = close < 0 ? text.length : close + 5;
  }
  return out + text.slice(pos);
}

/** `scheme://user:password@host`: the password may hold `/` and `@`, so the credentials end at the last `@` of the URL, unless what comes before it is a path (`host/a@b`) or `host:port/…`. */
function maskUrlCredentials(text: string, bump: () => void): string {
  return text.replace(URL_REST, (m, scheme: string, rest: string) => {
    const at = rest.lastIndexOf("@");
    if (at < 0) return m;
    const info = rest.slice(0, at);
    const slash = info.indexOf("/");
    if (slash >= 0) {
      const colon = info.indexOf(":");
      if (colon < 0 || colon > slash || /^[^/:@]*:\d*\//.test(info)) return m;
    }
    bump();
    return `${scheme}${MASK}@${rest.slice(at + 1)}`;
  });
}

/** Scheme-less DSNs (`user:password@tcp(host:3306)/db`): the credentials run back from the `@` to the last space, quote or bracket (at most 260 characters). */
function maskDsn(text: string, bump: () => void): string {
  let out = "";
  let last = 0;
  DSN_HOST.lastIndex = 0;
  for (let m = DSN_HOST.exec(text); m; m = DSN_HOST.exec(text)) {
    let s = m.index;
    const limit = Math.max(last, m.index - 260);
    while (s > limit && !/[\s'"`(=,]/.test(text[s - 1]!)) s--;
    const info = text.slice(s, m.index);
    const colon = info.indexOf(":");
    if (colon < 1 || colon === info.length - 1 || info.includes(MASK)) continue;
    out += text.slice(last, s) + MASK;
    last = m.index;
    bump();
  }
  return out + text.slice(last);
}

/** XML and .NET configuration: a `value="…"` next to a secret-named `key`/`name`, an attribute named like a secret, and `<password>…</password>`. */
function maskXml(text: string, bump: () => void): string {
  let t = text.replace(XML_TAG, (tag) => {
    const attrs = [...tag.matchAll(XML_ATTR)];
    if (!attrs.some((a) => XML_KEY_ATTR.test(a[1]!) && isSecretName(a[2]!.slice(1, -1)))) return tag;
    return tag.replace(XML_ATTR, (m, name: string, value: string) => {
      if (name.toLowerCase() !== "value" || isSafe(value)) return m;
      bump();
      return `${name}=${quotedMask(value)}`;
    });
  });
  t = t.replace(XML_ELEMENT, (m, name: string, content: string) => {
    if (!isSecretName(name) || isSafe(content.trim())) return m;
    bump();
    return m.replace(content, MASK);
  });
  return t;
}

/** The lines (by index) of Kubernetes `kind: Secret` documents whose value must be masked: every entry under `data:` and `stringData:`. */
function secretDocEntries(lines: string[]): Set<number> {
  const force = new Set<number>();
  let start = 0;
  const docEnd = (end: number) => {
    let isSecret = false;
    for (let i = start; i < end && !isSecret; i++) isSecret = /^kind:\s*["']?Secret["']?\s*(#.*)?$/.test(lines[i]!);
    if (!isSecret) return;
    let entry = -1;
    let inData = false;
    for (let i = start; i < end; i++) {
      const line = lines[i]!;
      if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
      const indent = indentOf(line);
      if (indent === 0) {
        inData = /^(data|stringData):\s*(#.*)?$/.test(line);
        entry = -1;
      } else if (inData) {
        if (entry < 0) entry = indent;
        if (indent === entry) force.add(i);
      }
    }
  };
  for (let i = 0; i < lines.length; i++) {
    if (/^---(\s|$)/.test(lines[i]!)) {
      docEnd(i);
      start = i + 1;
    }
  }
  docEnd(lines.length);
  return force;
}

/** Where the quote that a value opens on line `i` closes, searching at most 200 lines on; -1 when it does not. */
function closingLine(lines: string[], i: number, quote: string): number {
  for (let j = i + 1; j < Math.min(lines.length, i + 200); j++) if (lines[j]!.includes(quote)) return j;
  return -1;
}

function redactLines(text: string, bump: () => void): string {
  const lines = text.split("\n");
  const force = secretDocEntries(lines);
  let blockIndent = -1;
  let namedSecret = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const indent = indentOf(line);
    if (MYSQL_WORD.test(line) && line.includes("-p")) {
      lines[i] = line.replace(MYSQL_P, (_m, lead: string, flag: string) => (bump(), `${lead}${flag}${MASK}`));
    }
    if (line.includes("--")) {
      lines[i] = lines[i]!.replace(FLAG_SECRET, (m, flag: string, value: string) => (isSafe(value) ? m : (bump(), `${flag} ${MASK}`)));
    }
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
    if (named && isSecretName(named[1]!)) namedSecret = 2;
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
    if (!m || !(isSecretName(m[3]!) || force.has(i))) continue;
    const value = m[5]!;
    const v = value.trim();
    // A YAML block scalar: the secret is on the lines under it.
    if (/^[|>][+-]?\d*\s*(#.*)?$/.test(v)) {
      blockIndent = indent;
      continue;
    }
    // A value that opens an object or list on its own line, or a function: the members are checked one by one.
    if (/^[{[(]\s*$/.test(v) || /^(function\b|\(.*\)\s*=>)/.test(v)) continue;
    const head = `${m[1]}${m[2]}${m[3]}${m[2]}${m[4]}`;
    // A TOML string in triple quotes, or a quoted string that runs over several lines: every line is the secret.
    const triple = /^("""|''')/.exec(v);
    const quote = triple ? triple[1]! : /^(["'])(?:[^"'\\]|\\.)*$/.test(v) || /^"(?:[^"\\]|\\.)*$/.test(v) || /^'(?:[^'\\]|\\.)*$/.test(v) ? v[0]! : "";
    if (quote && !v.slice(quote.length).includes(quote) && !isSafe(v)) {
      const end = closingLine(lines, i, quote);
      lines[i] = `${head}${quote}${MASK}`;
      bump();
      if (end >= 0) {
        for (let j = i + 1; j < end; j++) lines[j] = MASK;
        lines[end] = `${quote}${lines[end]!.slice(lines[end]!.indexOf(quote) + quote.length)}`;
        i = end;
      }
      continue;
    }
    if (isSafe(value)) continue;
    const trail = /[,;]\s*$/.exec(value)?.[0] ?? "";
    lines[i] = `${head}${quotedMask(value)}${trail.trim()}`;
    bump();
    // A plain value that goes on in the lines under it (indented more, and no key or list entry of its own).
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j]!;
      if (next.trim() === "" || indentOf(next) <= indent || /^\s*(?:-\s|[A-Za-z_"'][\w."'-]*\s*[:=])/.test(next)) break;
      lines[j] = `${next.slice(0, indentOf(next))}${MASK}`;
      bump();
      i = j;
    }
  }
  return lines.join("\n");
}

function highEntropy(run: string): boolean {
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/].filter((r) => r.test(run)).length;
  return classes >= 2 && entropy(run) >= ENTROPY_MIN;
}

const wordsOf = (name: string): string[] =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
const hashy = (name: string): boolean => wordsOf(name).some((w) => HASHY.has(w));
const CONSTANT_DECL = /\b(?:const|final|static|val|readonly)\s+(?:\w+\s+)*$/;

/** Long hex strings are usually hashes (git commits) and are kept, unless they are assigned to a constant or sit on a line that names a secret. */
function maskHex(text: string, bump: () => void): string {
  let t = text.replace(HEX_ASSIGN, (m, name: string, q1: string, sep: string, q2: string, _hex: string, offset: number, all: string) => {
    if (hashy(name)) return m;
    const lineStart = all.lastIndexOf("\n", offset) + 1;
    const before = all.slice(lineStart, offset);
    if (!isSecretName(name) && !/^[A-Z][A-Z0-9_]{2,}$/.test(name) && !CONSTANT_DECL.test(before)) return m;
    bump();
    return `${name}${q1}${sep}${q2}${MASK}${q2}`;
  });
  t = t
    .split("\n")
    .map((line) => {
      if (line.length < 40 || !HEX_RUN.test(line)) return line;
      HEX_RUN.lastIndex = 0;
      const names = line.match(/[A-Za-z_][A-Za-z0-9_.-]{0,80}/g) ?? [];
      if (names.some(hashy) || !names.some(isSecretName)) return line;
      return line.replace(HEX_RUN, () => (bump(), MASK));
    })
    .join("\n");
  return t;
}

function redactUnsafe(text: string): Redacted {
  let count = 0;
  const bump = () => {
    count++;
  };
  let t = maskPem(text, bump);
  t = t.replace(WEBHOOK, (_m, base: string) => (bump(), `${base}${MASK}`));
  t = maskUrlCredentials(t, bump);
  t = maskDsn(t, bump);
  t = redactLines(t, bump);
  t = maskXml(t, bump);
  t = t.replace(KEYED_VALUE, (m, q: string, key: string, sep: string, value: string) => {
    if (!isSecretName(key) || isSafe(value)) return m;
    bump();
    return `${q}${key}${q}${sep}${quotedMask(value)}`;
  });
  t = t.replace(SQL_PASSWORD, (m, kw: string, sep: string, value: string) => {
    if (isSafe(value)) return m;
    bump();
    return `${kw}${sep}${quotedMask(value)}`;
  });
  t = t.replace(NPM_AUTH, (m, lead: string, value: string) => (isSafe(value) ? m : (bump(), `${lead}${MASK}`)));
  t = t.replace(INLINE_ASSIGN, (m, q: string, key: string, sep: string, value: string, offset: number, all: string) => {
    if (!isSecretName(key) || isSafe(value) || ENV_REF_AT.test(all.slice(offset + m.length - value.length))) return m;
    bump();
    return `${q}${key}${q}${sep}${quotedMask(value)}`;
  });
  t = t.replace(BEARER, (_m, word: string) => (bump(), `${word} ${MASK}`));
  t = t.replace(JWT, () => (bump(), MASK));
  for (const re of TOKENS) t = t.replace(re, () => (bump(), MASK));
  t = maskHex(t, bump);
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

/** Why `text` must not be kept as it is, or null: what `redactText` would mask. The secret itself is never part of the answer. */
export function secretIn(text: string): string | null {
  const r = redactText(text);
  if (r.failed) return "could not be checked for secrets";
  return r.count > 0 ? "looks like it holds a secret value (a password, key, token or connection string)" : null;
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
