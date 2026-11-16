/**
 * The evidence digest (plan section 5, "Budgeting"): what BMO is given to read for one C4 level, when it
 * cannot read the repository itself. It holds the scan's facts for the level (each with its ID, so BMO can
 * cite it as `{"kind": "scan", "fact": "<id>"}`) and excerpts of files, ranked:
 *
 * 1. manifests and configuration the level's facts come from (package.json, Dockerfiles, compose, env samples),
 *    plus a README at the top of the scope;
 * 2. entry points (`main.*`, `index.*`, `app.*`, `server.*`, `__main__.py`, ...), shallow ones first;
 * 3. files of the most-imported folders (from `evidence.imports`);
 * 4. at C3, the other files of the container's component folders.
 *
 * Every excerpt goes through `selectFiles` (must-not-open, deny-list, hidden paths) and `redactText`. The text
 * is cut at the budget (tokens ≈ bytes ÷ 4): files that do not fit are listed under "Left out", with the
 * reason. At C3 the digest is for one container: only facts and files under its code paths.
 *
 * Deterministic: the same evidence, code, intake and options give the same text.
 */

import path from "node:path";
import type { CodeSource } from "../core/codeFiles.js";
import type { Intake } from "../import/intake.js";
import type { Evidence, Fact } from "../import/scan.js";
import { estimateTokens } from "./backend.js";
import { selectFiles } from "./redact.js";

const posix = path.posix;

/** One file excerpt included in a prompt: shown to the person before anything is sent. */
export interface Sent {
  path: string;
  /** Bytes of the excerpt as sent (after redaction and cutting). */
  bytes: number;
  lines: number;
  /** Values replaced by the mask in this excerpt. */
  redactions: number;
}

export interface LeftOut {
  path: string;
  reason: string;
}

export interface DigestOptions {
  level: "c1" | "c2" | "c3";
  /** Tokens the digest may use (bytes ÷ 4). */
  budgetTokens: number;
  /** C3: the container the digest is for; only its code paths are read. */
  container?: { id: string; name: string; codePaths: string[] };
  /** The import ignore list (globs of paths not part of the system). */
  ignore?: string[];
  /** Bytes of one file that are included at most (default 24,000); the rest of the file is cut. */
  maxFileBytes?: number;
}

export interface Digest {
  level: "c1" | "c2" | "c3";
  text: string;
  attachments: Sent[];
  leftOut: LeftOut[];
  estTokens: number;
  budgetTokens: number;
  /** Facts written / facts for the level that did not fit. */
  facts: { shown: number; leftOut: number };
}

const LEVEL_TITLE = { c1: "C1, system context", c2: "C2, containers", c3: "C3, components" } as const;
const ENTRY = /^(main|index|app|server|cli|__main__|manage|wsgi|asgi|handler|lambda_function|program|bootstrap|start)\.[a-z]+$/i;
const README = /^readme(\.[a-z]+)?$/i;
const MAX_LEFT_OUT_LINES = 60;

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const dirOf = (rel: string): string => (posix.dirname(rel) === "." ? "" : posix.dirname(rel));
const depthOf = (rel: string): number => rel.split("/").length;
const bytesOf = (s: string): number => Buffer.byteLength(s, "utf-8");

function factLine(f: Fact): string {
  const at = f.line ? `${f.path}:${f.line}` : f.path;
  return `- ${f.id} | ${f.kind} ${JSON.stringify(f.name)} at ${at}${f.detail ? ` (${f.detail})` : ""}${f.system ? ` -> known service ${JSON.stringify(f.system)}` : ""}`;
}

/** Cut `text` to at most `max` bytes at a line end; returns the kept lines and the total line count. */
function cutLines(text: string, max: number): { lines: string[]; total: number } {
  const all = text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  const lines: string[] = [];
  let used = 0;
  for (const l of all) {
    const b = bytesOf(l) + 1;
    if (used + b > max && lines.length) break;
    if (used + b > max) {
      lines.push(l.slice(0, Math.max(0, max - 1)));
      break;
    }
    lines.push(l);
    used += b;
  }
  return { lines, total: all.length };
}

/** Build the digest for one level. */
export function buildDigest(evidence: Evidence, code: CodeSource, intake: Pick<Intake, "mustNotOpen" | "scope">, opts: DigestOptions): Digest {
  const level = opts.level;
  const budgetBytes = Math.max(0, Math.floor(opts.budgetTokens * 4));
  const maxFile = opts.maxFileBytes ?? 24_000;
  const gate = selectFiles(code, intake, opts.ignore ?? []);
  const roots = level === "c3" ? (opts.container?.codePaths ?? []).map((p) => p.replace(/^\.?\/+|\/+$/g, "")).map((p) => (p === "." ? "" : p)) : [];
  const inScope = (rel: string) => level !== "c3" || roots.some((r) => r === "" || rel === r || rel.startsWith(`${r}/`));

  // ---- facts
  const facts = evidence.facts.filter((f) => {
    if (level === "c3") return (f.level === "c3" || f.level === "c2") && inScope(f.path);
    return f.level === level;
  });
  const head: string[] = [`# Evidence digest: ${LEVEL_TITLE[level]}`];
  if (level === "c3") {
    if (opts.container) head.push(`Container: ${opts.container.id} ${JSON.stringify(opts.container.name)}; code paths: ${roots.length ? roots.join(", ") : "(none mapped)"}`);
    else head.push("No container given: there is nothing to read at C3 without one.");
  }
  const f = evidence.files;
  head.push(
    `Files scanned: ${f.total}; by language: ${
      Object.entries(f.byLanguage)
        .map(([k, n]) => `${k} ${n}`)
        .join(", ") || "none"
    }.`,
  );
  const na = Object.entries(f.notAnalysable);
  if (na.length) head.push(`Languages whose imports dp does not read: ${na.map(([k, n]) => `${k} ${n}`).join(", ")}.`);
  head.push("", `## Scan facts (${facts.length}); cite one as {"kind": "scan", "fact": "<id>"}`);
  const factLines = facts.map(factLine);
  if (level === "c3") {
    const dirs = new Set(facts.filter((x) => x.kind === "component-dir").map((x) => x.path));
    const edges = evidence.imports.filter(([a, b]) => dirs.has(a) && dirs.has(b));
    if (edges.length) factLines.push("", "## Imports between component folders (from -> to: number of file imports)", ...edges.map(([a, b, n]) => `- ${a} -> ${b}: ${n}`));
  }
  // Facts take at most half the budget; the rest is for file excerpts.
  const factBudget = Math.floor(budgetBytes / 2) - bytesOf(head.join("\n"));
  const keptFacts: string[] = [];
  let factBytes = 0;
  for (const l of factLines) {
    if (factBytes + bytesOf(l) + 1 > factBudget) break;
    keptFacts.push(l);
    factBytes += bytesOf(l) + 1;
  }
  const factsLeft = factLines.length - keptFacts.length;
  const factsShown = Math.min(keptFacts.length, facts.length);
  if (factsLeft) keptFacts.push(`- (${factsLeft} more lines of facts did not fit in the budget)`);

  // ---- ranked files
  const ranked: string[] = [];
  const seen = new Set<string>();
  const push = (rel: string) => {
    if (seen.has(rel) || !inScope(rel)) return;
    seen.add(rel);
    ranked.push(rel);
  };
  const sources = evidence.facts.filter((x) => x.kind === "source-file").map((x) => x.path);
  // 1. manifests and configuration behind the level's facts, then a README at the top of the scope.
  const manifestFacts = level === "c3" ? facts.filter((x) => x.level === "c2") : facts;
  [...new Set(manifestFacts.filter((x) => x.kind !== "component-dir").map((x) => x.path))].sort(cmp).forEach(push);
  const readmes = evidence.files.sizes
    .map(([p]) => p)
    .filter((p) => README.test(posix.basename(p)) && (level === "c3" ? roots.includes(dirOf(p)) : dirOf(p) === ""))
    .sort(cmp);
  readmes.forEach(push);
  // 2. entry points, shallow first.
  sources
    .filter((p) => ENTRY.test(posix.basename(p)))
    .sort((a, b) => depthOf(a) - depthOf(b) || cmp(a, b))
    .forEach(push);
  // 3. files of the most-imported folders.
  const incoming = new Map<string, number>();
  for (const [, to, n] of evidence.imports) incoming.set(to, (incoming.get(to) ?? 0) + n);
  const byDir = new Map<string, string[]>();
  for (const p of sources) byDir.set(dirOf(p), [...(byDir.get(dirOf(p)) ?? []), p]);
  for (const [dir] of [...incoming].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))) (byDir.get(dir) ?? []).sort(cmp).forEach(push);
  // 4. at C3, the other files of the component folders.
  if (level === "c3") {
    const dirs = facts
      .filter((x) => x.kind === "component-dir")
      .map((x) => x.path)
      .sort(cmp);
    for (const d of dirs) (byDir.get(d) ?? []).sort(cmp).forEach(push);
  }

  // ---- excerpts within the budget
  type Ex = { sent: Sent; block: string };
  const included: Ex[] = [];
  const leftOut: LeftOut[] = [];
  const assemble = (): string => {
    const parts = [...head, ...keptFacts];
    if (included.length) parts.push("", `## File excerpts (${included.length}); values that looked secret are shown as •••`, ...included.map((e) => e.block));
    if (leftOut.length) {
      parts.push("", `## Left out (${leftOut.length})`);
      leftOut.slice(0, MAX_LEFT_OUT_LINES).forEach((l) => parts.push(`- ${l.path} (${l.reason})`));
      if (leftOut.length > MAX_LEFT_OUT_LINES) parts.push(`- and ${leftOut.length - MAX_LEFT_OUT_LINES} more`);
    }
    return parts.join("\n") + "\n";
  };
  let used = bytesOf(assemble());
  const budgetNote = `did not fit in the budget of ${opts.budgetTokens} tokens`;
  for (const rel of ranked) {
    const r = gate.read(rel);
    if ("refused" in r) {
      leftOut.push({ path: rel, reason: `not opened: ${r.refused}` });
      continue;
    }
    const { lines, total } = cutLines(r.text, maxFile);
    const cut = lines.length < total;
    const body = lines.map((l, i) => `${i + 1}: ${l}`).join("\n");
    const title = `### ${rel} (${cut ? `first ${lines.length} of ${total} lines` : `${total} lines`}${r.redactions ? `; ${r.redactions} value${r.redactions === 1 ? "" : "s"} hidden` : ""})`;
    const block = `\n${title}\n\`\`\`\n${body}\n\`\`\``;
    const add = bytesOf(block) + 1 + (included.length ? 0 : 80);
    if (used + add > budgetBytes) {
      leftOut.push({ path: rel, reason: budgetNote });
      continue;
    }
    const excerpt = lines.join("\n");
    included.push({ sent: { path: rel, bytes: bytesOf(excerpt), lines: lines.length, redactions: r.redactions }, block });
    used += add;
  }
  // The "Left out" list takes room too: drop the last excerpts until the whole fits.
  let text = assemble();
  while (bytesOf(text) > budgetBytes && included.length) {
    const last = included.pop()!;
    leftOut.push({ path: last.sent.path, reason: budgetNote });
    text = assemble();
  }
  return {
    level,
    text,
    attachments: included.map((e) => e.sent),
    leftOut,
    estTokens: estimateTokens(text),
    budgetTokens: opts.budgetTokens,
    facts: { shown: factsShown, leftOut: facts.length - factsShown },
  };
}
