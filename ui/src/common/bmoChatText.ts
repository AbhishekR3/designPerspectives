/**
 * The text rules of the BMO chat, as pure functions so they can be tested without a browser:
 * - mentions: typing "[" starts a reference to an element or relationship; `activeMention` finds the one being typed,
 *   `suggestMentions` ranks the objects for it (prefix matches first, then word starts, then any substring), and
 *   `insertMention` puts "[Exact Name]" in the text;
 * - resolving: `resolveMentions` turns every "[...]" in a message into the object it means: the one picked from the
 *   list (remembered by ID, so two objects with the same name stay apart), else the one object with exactly that name;
 *   otherwise the token is reported as ambiguous or unknown, so the chat can warn before anything is sent;
 * - `historyToSend`: the latest earlier turns that fit the server's limits;
 * - `markdownBlocks` / `inlineParts`: the small Markdown subset BMO's answers use, as plain data the chat renders with
 *   React elements (never as HTML).
 */

import type { BmoTurn, ElementSummary, Relationship } from "../../../src/shared/types.js";

export interface MentionTarget {
  id: string;
  type: "element" | "relationship";
  /** The text between the brackets: the element's name, or "Source → Destination: label" for a relationship. */
  name: string;
  /** "Container", "Relationship", ... */
  kindLabel: string;
  /** Where it sits ("in API Application"), or "". */
  where: string;
}

/** A choice made from the suggestion list: the token text it inserted, and the object it means. */
export interface MentionPick {
  token: string;
  id: string;
}

export type MentionStatus = "picked" | "name" | "ambiguous" | "unknown";

export interface MentionToken {
  /** The text between the brackets. */
  token: string;
  /** Index of the "[" in the message. */
  start: number;
  status: MentionStatus;
  /** The object it means (picked or by its exact name); absent when ambiguous or unknown. */
  target?: MentionTarget;
}

const KIND: Record<string, string> = { person: "Person", softwareSystem: "Software System", container: "Container", component: "Component" };

/** A name that can sit between brackets (no brackets or line breaks of its own). */
const bracketable = (name: string) => !!name.trim() && !/[[\]\n]/.test(name);

/** The objects a mention can refer to: every element, and every relationship as "Source → Destination: label". */
export function mentionTargets(
  elements: Pick<ElementSummary, "id" | "name" | "kind" | "parentId">[],
  relationships: Pick<Relationship, "id" | "sourceId" | "destinationId" | "description">[],
): MentionTarget[] {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const out: MentionTarget[] = [];
  for (const e of elements) {
    if (!KIND[e.kind] || !bracketable(e.name)) continue;
    const parent = e.parentId ? byId.get(e.parentId) : undefined;
    out.push({ id: e.id, type: "element", name: e.name, kindLabel: KIND[e.kind]!, where: parent ? `in ${parent.name}` : "" });
  }
  for (const r of relationships) {
    const s = byId.get(r.sourceId)?.name ?? r.sourceId;
    const d = byId.get(r.destinationId)?.name ?? r.destinationId;
    const name = `${s} → ${d}${r.description.trim() ? `: ${r.description.trim()}` : ""}`;
    if (bracketable(name)) out.push({ id: r.id, type: "relationship", name, kindLabel: "Relationship", where: "" });
  }
  return out;
}

/** The mention being typed at the caret: the text after an unclosed "[" on the same line, or null. */
export function activeMention(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf("[");
  if (start < 0) return null;
  const query = before.slice(start + 1);
  if (/[\]\n[]/.test(query) || query.length > 120) return null;
  return { start, query };
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");

/**
 * Up to `limit` objects for a query, letter case ignored: names that start with it first, then names with a word that
 * starts with it, then names that hold it anywhere. Elements before relationships, then shorter names, then by name.
 * An empty query lists elements by name.
 */
export function suggestMentions(targets: MentionTarget[], query: string, limit = 8): MentionTarget[] {
  const q = norm(query.trimStart());
  const scored: { t: MentionTarget; s: number }[] = [];
  for (const t of targets) {
    const n = norm(t.name);
    let s: number;
    if (!q) s = t.type === "element" ? 0 : -1;
    else if (n.startsWith(q)) s = 0;
    else if (n.includes(` ${q}`) || n.includes(`→ ${q}`) || n.includes(`-${q}`)) s = 1;
    else if (n.includes(q)) s = 2;
    else s = -1;
    if (s >= 0) scored.push({ t, s });
  }
  scored.sort(
    (a, b) =>
      a.s - b.s ||
      (a.t.type === b.t.type ? 0 : a.t.type === "element" ? -1 : 1) ||
      a.t.name.length - b.t.name.length ||
      a.t.name.localeCompare(b.t.name) ||
      (a.t.id < b.t.id ? -1 : a.t.id > b.t.id ? 1 : 0),
  );
  return scored.slice(0, limit).map((x) => x.t);
}

/**
 * Put "[Name]" in place of the mention being typed (from its "[" to the caret, and the rest of a token already closed
 * after the caret). A space follows when the next character is a letter or digit, or at the end. Returns the new text,
 * the caret after the token and the pick to remember.
 */
export function insertMention(text: string, start: number, caret: number, target: MentionTarget): { text: string; caret: number; pick: MentionPick } {
  let end = caret;
  const closing = /^[^[\]\n]*\]/.exec(text.slice(caret));
  if (closing) end = caret + closing[0].length;
  const token = `[${target.name}]`;
  const rest = text.slice(end);
  const sep = rest === "" || /^[\p{L}\p{N}]/u.test(rest) ? " " : "";
  return { text: text.slice(0, start) + token + sep + rest, caret: start + token.length + sep.length, pick: { token: target.name, id: target.id } };
}

const TOKEN = /\[([^[\]\n]{1,300})\]/g;

/**
 * Every "[...]" in a message and what it means, and the IDs to send (each once, in the order first named). The k-th
 * "[X]" uses the k-th pick made for "X" (the last one when there are fewer), so two same-named objects picked from the
 * list stay apart; a token with no pick resolves by exact name (letter case only when nothing matches exactly).
 */
export function resolveMentions(text: string, picks: MentionPick[], targets: MentionTarget[]): { tokens: MentionToken[]; refs: string[] } {
  const byId = new Map(targets.map((t) => [t.id, t]));
  const seen = new Map<string, number>();
  const tokens: MentionToken[] = [];
  for (const m of text.matchAll(TOKEN)) {
    const token = m[1]!;
    const k = seen.get(token) ?? 0;
    seen.set(token, k + 1);
    const mine = picks.filter((p) => p.token === token && byId.has(p.id));
    if (mine.length) {
      tokens.push({ token, start: m.index!, status: "picked", target: byId.get(mine[Math.min(k, mine.length - 1)]!.id)! });
      continue;
    }
    let hits = targets.filter((t) => t.name === token);
    if (!hits.length) hits = targets.filter((t) => norm(t.name.trim()) === norm(token.trim()));
    if (hits.length === 1) tokens.push({ token, start: m.index!, status: "name", target: hits[0]! });
    else tokens.push({ token, start: m.index!, status: hits.length ? "ambiguous" : "unknown" });
  }
  const refs: string[] = [];
  for (const t of tokens) if (t.target && !refs.includes(t.target.id)) refs.push(t.target.id);
  return { tokens, refs };
}

/** The picks whose token is still in the text (the others were edited away). */
export const keepPicks = (text: string, picks: MentionPick[]): MentionPick[] => picks.filter((p) => text.includes(`[${p.token}]`));

/** The latest earlier turns that fit the limits: at most `turns`, each cut to `turnChars`, `historyChars` together. */
export function historyToSend(turns: BmoTurn[], limits: { turns: number; turnChars: number; historyChars: number }): BmoTurn[] {
  const out: BmoTurn[] = [];
  let total = 0;
  for (let i = turns.length - 1; i >= 0 && out.length < limits.turns; i--) {
    let text = turns[i]!.text.trim();
    if (!text) continue;
    if (text.length > limits.turnChars) text = `${text.slice(0, limits.turnChars - 1)}…`;
    if (total + text.length > limits.historyChars) break;
    total += text.length;
    out.unshift({ role: turns[i]!.role, text });
  }
  return out;
}

// ------------------------------------------------------------------ simple Markdown, as data

export type MdBlock = { type: "p"; text: string } | { type: "h"; text: string } | { type: "ul" | "ol"; items: string[] } | { type: "code"; text: string };
export type MdInline = { type: "text" | "strong" | "em" | "code"; text: string };

/** Paragraphs, headings, bullet and numbered lists and fenced code: the Markdown BMO's answers use. Anything else is text. */
export function markdownBlocks(text: string): MdBlock[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: MdBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ type: "p", text: para.join("\n") });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^\s*```/.test(line)) {
      flush();
      const body: string[] = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]!); i++) body.push(lines[i]!);
      out.push({ type: "code", text: body.join("\n") });
      continue;
    }
    const h = /^\s{0,3}#{1,6}\s+(.*)$/.exec(line);
    if (h) {
      flush();
      out.push({ type: "h", text: h[1]!.trim() });
      continue;
    }
    const li = /^\s*(?:([-*+])|(\d{1,3})[.)])\s+(.*)$/.exec(line);
    if (li) {
      flush();
      const type = li[1] ? "ul" : "ol";
      const last = out[out.length - 1];
      if (last && last.type === type) last.items.push(li[3]!);
      else out.push({ type, items: [li[3]!] });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    // A line that continues a list item (indented) joins it.
    const last = out[out.length - 1];
    if (!para.length && last && (last.type === "ul" || last.type === "ol") && /^\s+\S/.test(line)) {
      last.items[last.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    para.push(line);
  }
  flush();
  return out;
}

/** `code`, **strong** and *emphasis* in a line of text; everything else stays text. */
export function inlineParts(text: string): MdInline[] {
  const out: MdInline[] = [];
  const re = /`([^`\n]+)`|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*/g;
  let i = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > i) out.push({ type: "text", text: text.slice(i, m.index) });
    if (m[1] !== undefined) out.push({ type: "code", text: m[1] });
    else if (m[2] !== undefined || m[3] !== undefined) out.push({ type: "strong", text: (m[2] ?? m[3])! });
    else out.push({ type: "em", text: m[4]! });
    i = m.index! + m[0].length;
  }
  if (i < text.length) out.push({ type: "text", text: text.slice(i) });
  return out;
}
