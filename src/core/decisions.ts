/**
 * Decision records (REC-04): one Markdown file per decision in `<model folder>/decisions/`,
 * named `NNNN-slug.md`. The number is the decision's ID; the file keeps its name when the title
 * changes. Other files in the folder (a README) are ignored.
 *
 *   ---
 *   status: accepted                      proposed | accepted | rejected | deprecated | superseded
 *   kind: conditional                     choice | conditional | deferred | time-boxed | policy | reversal
 *   date: 2026-11-15
 *   deciders: [Platform team, "Smith, J."]
 *   affects: [internet-banking-system, database]   element and relationship IDs
 *   supersedes: [0003]                    superseded-by is kept in step (see `syncSupersedes`)
 *   tags: [data]
 *   review-by: 2027-05-01                 also decide-by (deferred), expires (time-boxed),
 *   ---                                   applies-to (policy)
 *
 *   # Title
 *
 *   ## Context / ## Decision / ## Consequences      free Markdown
 *   ## Alternatives
 *   ### Kafka
 *   - Why not now: nobody can run it
 *   - Would choose if:
 *     - we had a platform team
 *   ## Revisit triggers
 *   - [ ] We have a platform team (→ Kafka)
 *
 * The front matter is a small fixed grammar, not YAML: `key: value` or `key: [a, b]` (block lists
 * `  - a` are read too), values in double quotes when they need them. Sections with other headings
 * and unknown keys are kept as written. A file that does not follow the format is reported and
 * never rewritten. Decisions are written only when they change, so a hand-formatted file keeps its
 * formatting until it is edited here.
 *
 * Decisions are part of the model: they are units (`modelUnits.ts`), so drafts, diffs, the three-way
 * merge and git versions include them (REC-04).
 */

import fs from "node:fs";
import path from "node:path";
import { atomicWrite, isObj, type Obj } from "./util.js";
import { ModelError, slugify } from "./modelEdits.js";
import {
  DECISION_KINDS,
  DECISION_STATUSES,
  type Decision,
  type DecisionAlternative,
  type DecisionInput,
  type DecisionKind,
  type DecisionStatus,
  type DecisionSummary,
  type DecisionTrigger,
} from "../shared/types.js";

export const DECISIONS_DIR = "decisions";
export const DECISION_FILE_RE = /^(\d{4})-[a-z0-9-]*\.md$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Front matter keys in the order they are written, with the field each one fills. */
const META: [string, keyof Decision, "text" | "list"][] = [
  ["status", "status", "text"],
  ["kind", "kind", "text"],
  ["date", "date", "text"],
  ["deciders", "deciders", "list"],
  ["affects", "affects", "list"],
  ["supersedes", "supersedes", "list"],
  ["superseded-by", "supersededBy", "list"],
  ["tags", "tags", "list"],
  ["review-by", "reviewBy", "text"],
  ["decide-by", "decideBy", "text"],
  ["expires", "expires", "text"],
  ["applies-to", "appliesTo", "text"],
];
const META_KEYS = new Map(META.map(([k, f, t]) => [k, { field: f, type: t }]));

const SECTION = { context: "Context", decision: "Decision", alternatives: "Alternatives", consequences: "Consequences", triggers: "Revisit triggers" } as const;
const WHY_NOT = "Why not now:";
const WOULD = "Would choose if:";
const ARROW = " (→ ";

export function blankDecision(id: string, file: string, title: string, kind: DecisionKind = "choice", date = today()): Decision {
  return {
    id,
    file,
    title,
    status: "proposed",
    kind,
    date,
    deciders: [],
    affects: [],
    supersedes: [],
    supersededBy: [],
    tags: [],
    reviewBy: "",
    decideBy: "",
    expires: "",
    appliesTo: "",
    context: "",
    decision: "",
    alternatives: [],
    consequences: "",
    triggers: [],
    extra: [],
    extraMeta: [],
  };
}

export const today = (): string => new Date().toISOString().slice(0, 10);

// ------------------------------------------------------------------ front matter values

function needsQuote(v: string, inList: boolean): boolean {
  return v === "" || /^\s|\s$|^["[]|\n/.test(v) || (inList && /[,\]"]/.test(v));
}

const scalar = (v: string) => (needsQuote(v, false) ? JSON.stringify(v) : v);
const list = (vs: string[]) => `[${vs.map((v) => (needsQuote(v, true) ? JSON.stringify(v) : v)).join(", ")}]`;

function parseScalar(raw: string): string {
  const v = raw.trim();
  if (!v.startsWith('"')) return v;
  try {
    const s = JSON.parse(v);
    if (typeof s === "string") return s;
  } catch {
    /* fall through */
  }
  throw new Error(`the value ${v} is not a valid quoted text`);
}

function parseList(raw: string): string[] {
  const v = raw.trim();
  if (!v.startsWith("[") || !v.endsWith("]")) throw new Error(`"${v}" is not a list like [a, b]`);
  const inner = v.slice(1, -1);
  const out: string[] = [];
  let i = 0;
  while (i < inner.length) {
    while (inner[i] === " ") i++;
    if (i >= inner.length) break;
    if (inner[i] === '"') {
      // A JSON string: find its closing quote.
      let j = i + 1;
      while (j < inner.length && inner[j] !== '"') j += inner[j] === "\\" ? 2 : 1;
      out.push(parseScalar(inner.slice(i, j + 1)));
      i = j + 1;
      while (inner[i] === " ") i++;
      if (i < inner.length && inner[i] !== ",") throw new Error(`unexpected text after a quoted value in ${v}`);
      i++;
    } else {
      const j = inner.indexOf(",", i);
      const item = (j < 0 ? inner.slice(i) : inner.slice(i, j)).trim();
      if (item) out.push(item);
      i = j < 0 ? inner.length : j + 1;
    }
  }
  return out;
}

// ------------------------------------------------------------------ parse

/** Read one decision file. Never throws: a file that cannot be read comes back with `error` (and `raw`). */
export function parseDecision(file: string, text: string): Decision {
  const m = DECISION_FILE_RE.exec(file);
  const id = m?.[1] ?? file;
  try {
    if (!m) throw new Error("the file name must look like 0007-short-title.md");
    return parseStrict(id, file, text);
  } catch (e) {
    const d = blankDecision(id, file, file.replace(/\.md$/, ""));
    return { ...d, error: (e as Error).message, raw: text };
  }
}

function parseStrict(id: string, file: string, text: string): Decision {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (lines[0] !== "---") throw new Error('it must start with a "---" line');
  const end = lines.indexOf("---", 1);
  if (end < 0) throw new Error('the front matter has no closing "---" line');
  const d = blankDecision(id, file, "", "choice", "");
  const seen = new Set<string>();

  const at = (i: number) => lines[i] ?? "";
  for (let i = 1; i < end; i++) {
    const line = at(i);
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const km = /^([A-Za-z][A-Za-z0-9_-]*):(.*)$/.exec(line);
    if (!km) throw new Error(`line ${i + 1} of the front matter is not "key: value"`);
    const key = km[1]!;
    let value = km[2]!.trim();
    // A block list: "key:" followed by "  - item" lines.
    if (!value && i + 1 < end && /^\s+- /.test(at(i + 1))) {
      const items: string[] = [];
      while (i + 1 < end && /^\s+- /.test(at(i + 1))) items.push(parseScalar(at(++i).replace(/^\s+- /, "")));
      value = list(items);
    }
    if (seen.has(key)) throw new Error(`"${key}" appears twice in the front matter`);
    seen.add(key);
    const known = META_KEYS.get(key);
    if (!known) {
      d.extraMeta.push([key, value]);
      continue;
    }
    if (known.type === "list") (d as unknown as Obj)[known.field] = value ? parseList(value) : [];
    else (d as unknown as Obj)[known.field] = value ? parseScalar(value) : "";
  }
  if (!(DECISION_STATUSES as readonly string[]).includes(d.status)) throw new Error(`"${d.status || "(none)"}" is not a status (${DECISION_STATUSES.join(", ")})`);
  if (!(DECISION_KINDS as readonly string[]).includes(d.kind)) throw new Error(`"${d.kind || "(none)"}" is not a kind (${DECISION_KINDS.join(", ")})`);

  // Body: "# Title", text before the first "##", then "##" sections.
  const body = lines.slice(end + 1);
  const t = body.findIndex((l) => /^# /.test(l));
  if (t < 0) throw new Error('it has no "# Title" line');
  if (body.slice(0, t).some((l) => l.trim())) throw new Error('there is text between the front matter and the "# Title" line');
  d.title = (body[t] ?? "").slice(2).trim();
  const sections: { heading: string; lines: string[] }[] = [{ heading: "", lines: [] }];
  for (const l of body.slice(t + 1)) {
    if (/^## /.test(l)) sections.push({ heading: l.slice(3).trim(), lines: [] });
    else sections[sections.length - 1]!.lines.push(l);
  }
  const taken = new Set<string>();
  for (const s of sections) {
    const text = trimLines(s.lines);
    const h = s.heading.toLowerCase();
    const once = (k: string) => !taken.has(k) && (taken.add(k), true);
    if (!s.heading) {
      if (text) d.extra.push({ heading: "", body: text });
    } else if (h === "context" && once(h)) d.context = text;
    else if (h === "decision" && once(h)) d.decision = text;
    else if (h === "consequences" && once(h)) d.consequences = text;
    else if (h === "alternatives" && !taken.has(h) && parseAlternatives(text)) {
      taken.add(h);
      d.alternatives = parseAlternatives(text)!;
    } else if (h === "revisit triggers" && !taken.has(h) && parseTriggers(text)) {
      taken.add(h);
      d.triggers = parseTriggers(text)!;
    } else d.extra.push({ heading: s.heading, body: text });
  }
  return d;
}

/** Lines joined, without blank lines at either end. */
function trimLines(lines: string[]): string {
  let a = 0;
  let b = lines.length;
  while (a < b && !lines[a]!.trim()) a++;
  while (b > a && !lines[b - 1]!.trim()) b--;
  return lines.slice(a, b).join("\n");
}

/** "### Name" blocks with "Why not now" / "Would choose if" bullets; null if the text has another shape. */
function parseAlternatives(text: string): DecisionAlternative[] | null {
  if (!text) return [];
  const lines = text.split("\n");
  if (!/^### /.test(lines[0] ?? "")) return null;
  const out: DecisionAlternative[] = [];
  let cur: DecisionAlternative | null = null;
  let mode: "notes" | "why" | "would" = "notes";
  let notes: string[] = [];
  const close = () => {
    if (cur) cur.notes = trimLines(notes);
  };
  for (const l of lines) {
    if (/^### /.test(l)) {
      close();
      cur = { name: l.slice(4).trim(), whyNot: "", wouldChooseIf: [], notes: "" };
      out.push(cur);
      notes = [];
      mode = "notes";
    } else if (l.startsWith(`- ${WHY_NOT}`)) {
      cur!.whyNot = l.slice(2 + WHY_NOT.length).trim();
      mode = "why";
    } else if (l.startsWith(`- ${WOULD}`)) {
      const rest = l.slice(2 + WOULD.length).trim();
      if (rest) cur!.wouldChooseIf.push(rest);
      mode = "would";
    } else if (mode === "would" && /^ {2}- /.test(l)) {
      cur!.wouldChooseIf.push(l.slice(4).trim());
    } else if (mode === "why" && /^ {2}\S/.test(l)) {
      cur!.whyNot += `\n${l.slice(2)}`;
    } else if (!l.trim() && mode !== "notes") {
      // a blank line between bullets
    } else {
      if (mode !== "notes") return null; // other text after the bullets: keep the section as written
      notes.push(l);
    }
  }
  close();
  return out;
}

const TRIGGER_RE = /^- \[([ xX])\] (.*)$/;

function parseTriggers(text: string): DecisionTrigger[] | null {
  if (!text) return [];
  const out: DecisionTrigger[] = [];
  for (const l of text.split("\n")) {
    if (!l.trim()) continue;
    const m = TRIGGER_RE.exec(l);
    if (!m) return null;
    let t = m[2]!.trim();
    let alternative = "";
    const a = t.lastIndexOf(ARROW);
    if (a >= 0 && t.endsWith(")")) {
      alternative = t.slice(a + ARROW.length, -1).trim();
      t = t.slice(0, a).trim();
    }
    out.push({ text: t, met: m[1] !== " ", alternative });
  }
  return out;
}

// ------------------------------------------------------------------ write

/** The file text of a decision (the file as it was, for one that cannot be read). */
export function serializeDecision(d: Decision): string {
  if (d.error !== undefined) return d.raw ?? "";
  const meta = ["---"];
  for (const [key, field, type] of META) {
    const v = d[field];
    if (type === "list") {
      if ((v as string[]).length) meta.push(`${key}: ${list(v as string[])}`);
    } else if (v || key === "status" || key === "kind" || key === "date") meta.push(`${key}: ${scalar(v as string)}`);
  }
  for (const [k, v] of d.extraMeta) meta.push(`${k}: ${v}`);
  meta.push("---");

  const blocks: string[] = [meta.join("\n"), `# ${d.title}`];
  const pre = d.extra.find((s) => s.heading === "");
  if (pre) blocks.push(pre.body);
  const section = (heading: string, body: string) => blocks.push(body ? `## ${heading}\n\n${body}` : `## ${heading}`);
  section(SECTION.context, d.context);
  section(SECTION.decision, d.decision);
  if (d.alternatives.length) {
    const alts = d.alternatives.map((a) => {
      const parts = [`### ${a.name}`];
      if (a.notes) parts.push(a.notes);
      const bullets: string[] = [];
      if (a.whyNot) bullets.push(`- ${WHY_NOT} ${a.whyNot.split("\n").join("\n  ")}`);
      if (a.wouldChooseIf.length) bullets.push(`- ${WOULD}`, ...a.wouldChooseIf.map((c) => `  - ${c}`));
      if (bullets.length) parts.push(bullets.join("\n"));
      return parts.join("\n\n");
    });
    section(SECTION.alternatives, alts.join("\n\n"));
  }
  if (d.consequences) section(SECTION.consequences, d.consequences);
  if (d.triggers.length) {
    section(SECTION.triggers, d.triggers.map((t) => `- [${t.met ? "x" : " "}] ${t.text}${t.alternative ? `${ARROW}${t.alternative})` : ""}`).join("\n"));
  }
  for (const s of d.extra) if (s.heading) section(s.heading, s.body);
  return blocks.join("\n\n") + "\n";
}

// ------------------------------------------------------------------ files

export const decisionsDir = (modelDir: string): string => path.join(modelDir, DECISIONS_DIR);

/** Decision file names in a folder, sorted. */
function decisionFiles(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".md") && /^\d{4}-/.test(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/** The decisions in `<modelDir>/decisions/`, by file name. */
export function readDecisions(modelDir: string): Decision[] {
  const dir = decisionsDir(modelDir);
  return decisionFiles(dir).map((f) => parseDecision(f, fs.readFileSync(path.join(dir, f), "utf-8")));
}

/** A cheap fingerprint of the decision files (names, sizes, times), to notice changes on disk. */
export function decisionsStamp(modelDir: string): string {
  const dir = decisionsDir(modelDir);
  return decisionFiles(dir)
    .map((f) => {
      try {
        const s = fs.statSync(path.join(dir, f), { bigint: true });
        return `${f}:${s.mtimeNs}:${s.size}`;
      } catch {
        return `${f}:-`;
      }
    })
    .join(",");
}

const same = (a: Decision, b: Decision) => JSON.stringify(a) === JSON.stringify(b);

/** Write the decisions that differ from `before`, delete files no longer listed. Files that cannot be
 *  read are never rewritten (only written when new, e.g. carried in by a draft). */
export function writeDecisions(modelDir: string, before: Decision[], after: Decision[]): void {
  const dir = decisionsDir(modelDir);
  const old = new Map(before.map((d) => [d.file, d]));
  const keep = new Set(after.map((d) => d.file));
  for (const d of after) {
    const o = old.get(d.file);
    if (o && (same(o, d) || o.error !== undefined) && fs.existsSync(path.join(dir, d.file))) continue;
    if (!DECISION_FILE_RE.test(d.file)) throw new ModelError(`"${d.file}" is not a valid decision file name.`);
    atomicWrite(path.join(dir, d.file), serializeDecision(d));
  }
  for (const f of old.keys()) {
    if (!keep.has(f) && DECISION_FILE_RE.test(f)) fs.rmSync(path.join(dir, f), { force: true });
  }
}

// ------------------------------------------------------------------ summaries and checks

export function decisionSummary(d: Decision): DecisionSummary {
  return {
    id: d.id,
    file: d.file,
    title: d.title,
    status: d.status,
    kind: d.kind,
    date: d.date,
    affects: d.affects,
    tags: d.tags,
    supersedes: d.supersedes,
    supersededBy: d.supersededBy,
    reviewBy: d.reviewBy,
    decideBy: d.decideBy,
    expires: d.expires,
    triggers: { open: d.triggers.filter((t) => !t.met).length, met: d.triggers.filter((t) => t.met).length },
    ...(d.error !== undefined ? { error: d.error } : {}),
  };
}

/** Problems that block saving: unreadable files, two files with one number, broken links, bad dates. */
export function decisionErrors(decs: Decision[]): string[] {
  const out: string[] = [];
  const ids = new Map<string, number>();
  for (const d of decs) ids.set(d.id, (ids.get(d.id) ?? 0) + 1);
  for (const [id, n] of ids) if (n > 1) out.push(`${n} decision files have the number ${id}.`);
  for (const d of decs) {
    if (d.error !== undefined) {
      out.push(`Decision file "${d.file}" cannot be read: ${d.error}.`);
      continue;
    }
    for (const s of d.supersedes) if (!ids.has(s)) out.push(`Decision ${d.id} replaces decision ${s}, which does not exist.`);
    for (const [label, v] of [
      ["date", d.date],
      ["review-by", d.reviewBy],
      ["decide-by", d.decideBy],
      ["expires", d.expires],
    ] as const) {
      if (v && !DATE_RE.test(v)) out.push(`Decision ${d.id}: ${label} "${v}" is not a date like 2026-11-15.`);
    }
  }
  return out;
}

/** Problems worth a look that do not block saving: decisions about objects no longer in the model. */
export function decisionWarnings(decs: Decision[], exists: (id: string) => boolean): string[] {
  const out: string[] = [];
  for (const d of decs) {
    for (const a of d.affects) if (!exists(a)) out.push(`Decision ${d.id} "${d.title}" is about "${a}", which is no longer in the model.`);
  }
  return out;
}

// ------------------------------------------------------------------ edits

const MAX_TEXT = 100_000;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function text(v: unknown, what: string, oneLine = false): string {
  if (typeof v !== "string") throw new ModelError(`${what} must be text.`);
  if (v.length > MAX_TEXT) throw new ModelError(`${what} is too long.`);
  const s = oneLine ? v.replace(/\s*\n\s*/g, " ").trim() : v.replace(/\r\n?/g, "\n").trim();
  // A "## " line inside a section would start a new section when the file is read back.
  return oneLine ? s : s.replace(/^(#{1,2}) /gm, "### ");
}

function texts(v: unknown, what: string): string[] {
  if (!Array.isArray(v)) throw new ModelError(`${what} must be a list.`);
  return v.map((x, i) => text(x, `${what} item ${i + 1}`, true)).filter(Boolean);
}

function date(v: unknown, what: string): string {
  const s = text(v, what, true);
  if (s && !DATE_RE.test(s)) throw new ModelError(`${what} must be a date like 2026-11-15.`);
  return s;
}

/** Check a client's fields and copy them onto `d`. */
export function applyInput(d: Decision, input: unknown): void {
  if (!isObj(input)) throw new ModelError("A decision must be a JSON object.");
  const i = input as Obj;
  if (i.title !== undefined) {
    const t = text(i.title, "The title", true);
    if (!t) throw new ModelError("A decision needs a title.");
    d.title = t;
  }
  if (i.status !== undefined) {
    if (!(DECISION_STATUSES as readonly unknown[]).includes(i.status)) throw new ModelError(`Status must be one of: ${DECISION_STATUSES.join(", ")}.`);
    d.status = i.status as DecisionStatus;
  }
  if (i.kind !== undefined) {
    if (!(DECISION_KINDS as readonly unknown[]).includes(i.kind)) throw new ModelError(`Kind must be one of: ${DECISION_KINDS.join(", ")}.`);
    d.kind = i.kind as DecisionKind;
  }
  if (i.date !== undefined) d.date = date(i.date, "The date") || d.date;
  for (const k of ["deciders", "affects", "supersedes", "tags"] as const) {
    if (i[k] !== undefined) d[k] = [...new Set(texts(i[k], cap(k)))];
  }
  if (i.reviewBy !== undefined) d.reviewBy = date(i.reviewBy, "Review by");
  if (i.decideBy !== undefined) d.decideBy = date(i.decideBy, "Decide by");
  if (i.expires !== undefined) d.expires = date(i.expires, "Expires");
  if (i.appliesTo !== undefined) d.appliesTo = text(i.appliesTo, "Applies to", true);
  for (const k of ["context", "decision", "consequences"] as const) if (i[k] !== undefined) d[k] = text(i[k], cap(k));
  if (i.alternatives !== undefined) {
    if (!Array.isArray(i.alternatives)) throw new ModelError("Alternatives must be a list.");
    d.alternatives = i.alternatives.map((a, n) => {
      if (!isObj(a)) throw new ModelError(`Alternative ${n + 1} must be an object.`);
      const name = text(a.name ?? "", `Alternative ${n + 1}'s name`, true);
      if (!name) throw new ModelError(`Alternative ${n + 1} needs a name.`);
      const whyNot = text(a.whyNot ?? "", `Why not "${name}"`).replace(/\n{2,}/g, "\n");
      return { name, whyNot, wouldChooseIf: texts(a.wouldChooseIf ?? [], `Conditions for "${name}"`), notes: text(a.notes ?? "", `Notes on "${name}"`) };
    });
    const names = d.alternatives.map((a) => a.name);
    const dup = names.find((n, k) => names.indexOf(n) !== k);
    if (dup) throw new ModelError(`Two alternatives are named "${dup}".`);
  }
  if (i.triggers !== undefined) {
    if (!Array.isArray(i.triggers)) throw new ModelError("Revisit triggers must be a list.");
    d.triggers = i.triggers
      .map((t, n) => {
        if (!isObj(t)) throw new ModelError(`Trigger ${n + 1} must be an object.`);
        return { text: text(t.text ?? "", `Trigger ${n + 1}`, true), met: t.met === true, alternative: text(t.alternative ?? "", `Trigger ${n + 1}'s alternative`, true) };
      })
      .filter((t) => t.text);
  }
}

/** Keep `supersededBy` and the "superseded" status in step with the accepted decisions' `supersedes`. */
export function syncSupersedes(decs: Decision[]): void {
  const by = new Map<string, string[]>();
  for (const d of decs) {
    if (d.error !== undefined || d.status !== "accepted") continue;
    for (const s of d.supersedes) by.set(s, [...(by.get(s) ?? []), d.id]);
  }
  for (const d of decs) {
    if (d.error !== undefined) continue;
    const next = (by.get(d.id) ?? []).sort();
    if (next.length && d.status !== "superseded") d.status = "superseded";
    if (JSON.stringify(next) !== JSON.stringify(d.supersededBy)) d.supersededBy = next;
  }
}

function find(decs: Decision[], id: string): Decision {
  const d = decs.find((x) => x.id === id);
  if (!d) throw new ModelError(`No decision ${id}.`);
  if (d.error !== undefined) throw new ModelError(`Decision file "${d.file}" cannot be read (${d.error}). Fix it in a text editor first.`);
  return d;
}

const nextId = (decs: Decision[]) => String(Math.max(0, ...decs.map((d) => Number(d.id) || 0)) + 1).padStart(4, "0");
/** `0007-short-title.md`: the title's slug, cut at a word boundary to at most 50 characters. */
function fileFor(id: string, title: string): string {
  let slug = slugify(title);
  if (slug.length > 50) slug = slug.slice(0, 51).replace(/-[^-]*$/, "") || slug.slice(0, 50);
  return `${id}-${slug}.md`;
}

/** Add a decision; returns its ID. */
export function createDecision(decs: Decision[], input: unknown): string {
  const title = isObj(input) && typeof input.title === "string" ? input.title.trim() : "";
  if (!title) throw new ModelError("A decision needs a title.");
  const id = nextId(decs);
  if (Number(id) > 9999) throw new ModelError("There are no decision numbers left.");
  const d = blankDecision(id, fileFor(id, title), title);
  applyInput(d, input);
  checkLinks(decs, d);
  decs.push(d);
  syncSupersedes(decs);
  return id;
}

export function updateDecision(decs: Decision[], id: string, input: DecisionInput | unknown): void {
  const d = find(decs, id);
  applyInput(d, input);
  checkLinks(decs, d);
  syncSupersedes(decs);
}

export function setDecisionStatus(decs: Decision[], id: string, status: unknown): void {
  updateDecision(decs, id, { status });
}

/** Remove a decision and the links to it from the others. */
export function deleteDecision(decs: Decision[], id: string): void {
  const i = decs.findIndex((x) => x.id === id);
  if (i < 0) throw new ModelError(`No decision ${id}.`);
  decs.splice(i, 1);
  for (const d of decs) {
    if (d.error !== undefined) continue;
    d.supersedes = d.supersedes.filter((s) => s !== id);
  }
  syncSupersedes(decs);
}

function checkLinks(decs: Decision[], d: Decision): void {
  for (const s of d.supersedes) {
    if (s === d.id) throw new ModelError("A decision cannot replace itself.");
    if (!decs.some((x) => x.id === s)) throw new ModelError(`There is no decision ${s} to replace.`);
  }
}

/** The decisions about an element or relationship. (Deleting the object leaves them as they are:
 *  they stay readable, and `dp check` warns.) */
export function decisionsAbout(decs: Decision[], id: string): Decision[] {
  return decs.filter((d) => d.affects.includes(id));
}

// ------------------------------------------------------------------ merge support

/**
 * Before a three-way merge (applying a draft): decisions the draft added whose number main has
 * also used since (for a different file) get the next free numbers, and the draft's links to them
 * follow. Without this, two people writing decisions in parallel would always conflict.
 * Returns the draft's decisions, renumbered (the input is not changed).
 */
export function renumberAdded(base: Decision[], ours: Decision[], theirs: Decision[]): Decision[] {
  const baseFiles = new Set(base.map((d) => d.file));
  const ourIds = new Map(ours.map((d) => [d.id, d.file]));
  const out = structuredClone(theirs);
  const used = new Set([...ours, ...theirs].map((d) => d.id));
  let n = Math.max(0, ...[...used].map((x) => Number(x) || 0));
  const renamed = new Map<string, string>();
  for (const d of out) {
    if (baseFiles.has(d.file)) continue;
    const ourFile = ourIds.get(d.id);
    if (ourFile === undefined || ourFile === d.file) continue;
    const id = String(++n).padStart(4, "0");
    renamed.set(d.id, id);
    d.file = `${id}${d.file.slice(d.id.length)}`;
    d.id = id; // an unreadable file keeps its text; only its name changes
  }
  if (renamed.size) {
    for (const d of out) {
      d.supersedes = d.supersedes.map((s) => renamed.get(s) ?? s);
      d.supersededBy = d.supersededBy.map((s) => renamed.get(s) ?? s);
    }
  }
  return out;
}
