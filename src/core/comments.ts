/**
 * Comments, ideas and questions on the model (`architecture/comments.json`, DEC-049).
 *
 * A thread is anchored to an element, a relationship or a diagram by ID and holds replies. The file is
 * separate from the model: a comment is a conversation about the model, not part of it, so it has no undo
 * step, is not diffed or merged with drafts, and anyone allowed to comment can write to it. It is plain JSON
 * with a stable layout (threads in the order they were started), so it reads well in `git diff`.
 *
 * A file changed on disk (by `git checkout`, a merge, another process) is picked up on the next read.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { COMMENT_KINDS, type CommentKind, type CommentReply, type CommentTarget, type CommentThread } from "../shared/types.js";
import { atomicWrite, isObj, stableJson, type Obj } from "./util.js";
import { ModelError } from "./ops.js";
import { NotFound } from "./project.js";

export const COMMENTS_FILE = "comments.json";
/** Longest text of a comment or reply, and the caps that keep the file small. */
export const COMMENT_MAX = 4000;
export const AUTHOR_MAX = 80;
export const MAX_THREADS = 5000;
export const MAX_REPLIES = 200;

function stampOf(file: string): string {
  try {
    const s = fs.statSync(file, { bigint: true });
    return `${s.mtimeNs}:${s.size}`;
  } catch {
    return "-";
  }
}

const GONE = "That comment no longer exists. It may have been deleted by someone else.";
const newId = (prefix: string) => `${prefix}-${crypto.randomBytes(5).toString("hex")}`;
const isTime = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));
const isTargetType = (v: unknown): v is CommentTarget["type"] => v === "element" || v === "relationship" || v === "diagram";

/** The comment text, trimmed; refused when empty or too long. */
export function cleanText(v: unknown): string {
  const text = typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim() : "";
  if (!text) throw new ModelError("Write something first: the comment is empty.");
  if (text.length > COMMENT_MAX) throw new ModelError(`A comment can be at most ${COMMENT_MAX} characters (this one has ${text.length}).`);
  return text;
}

export function cleanKind(v: unknown): CommentKind {
  if (!COMMENT_KINDS.includes(v as CommentKind)) throw new ModelError(`The kind must be one of: ${COMMENT_KINDS.join(", ")}.`);
  return v as CommentKind;
}

export function cleanTarget(v: unknown): CommentTarget {
  if (!isObj(v) || !isTargetType(v.type) || typeof v.id !== "string" || !v.id.trim() || v.id.length > 300) {
    throw new ModelError('A comment needs a target: {"type": "element" | "relationship" | "diagram", "id": ...}.');
  }
  return { type: v.type, id: v.id };
}

export function cleanAuthor(v: unknown): string {
  const a = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  if (a.length > AUTHOR_MAX) throw new ModelError(`The author name can be at most ${AUTHOR_MAX} characters.`);
  return a || "Anonymous";
}

function parseReply(v: unknown): CommentReply | null {
  if (!isObj(v) || typeof v.id !== "string" || typeof v.text !== "string" || !v.text.trim() || !isTime(v.at)) return null;
  return { id: v.id, author: typeof v.author === "string" && v.author.trim() ? v.author.slice(0, AUTHOR_MAX) : "Anonymous", at: v.at, text: v.text.slice(0, COMMENT_MAX) };
}

function parseThread(v: unknown): CommentThread | null {
  if (!isObj(v) || typeof v.id !== "string" || typeof v.text !== "string" || !v.text.trim() || !isTime(v.at)) return null;
  if (!COMMENT_KINDS.includes(v.kind as CommentKind) || !isObj(v.target) || !isTargetType(v.target.type) || typeof v.target.id !== "string") return null;
  const t: CommentThread = {
    id: v.id,
    kind: v.kind as CommentKind,
    target: { type: v.target.type, id: v.target.id },
    diagram: typeof v.diagram === "string" ? v.diagram : null,
    author: typeof v.author === "string" && v.author.trim() ? v.author.slice(0, AUTHOR_MAX) : "Anonymous",
    at: v.at,
    text: v.text.slice(0, COMMENT_MAX),
    status: v.status === "resolved" ? "resolved" : "open",
    replies: (Array.isArray(v.replies) ? v.replies : []).map(parseReply).filter((r): r is CommentReply => r !== null),
  };
  if (t.status === "resolved") {
    if (typeof v.resolvedBy === "string") t.resolvedBy = v.resolvedBy.slice(0, AUTHOR_MAX);
    if (isTime(v.resolvedAt)) t.resolvedAt = v.resolvedAt;
  }
  return t;
}

/** The threads in a comments file; entries that are not valid are dropped (a hand edit must not break the app). */
export function parseComments(text: string): CommentThread[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  const list = isObj(data) && Array.isArray(data.threads) ? data.threads : [];
  const seen = new Set<string>();
  const out: CommentThread[] = [];
  for (const raw of list) {
    const t = parseThread(raw);
    if (t && !seen.has(t.id)) {
      seen.add(t.id);
      out.push(t);
    }
  }
  return out;
}

/** Keys in a fixed order, optional fields left out when empty. */
function threadData(t: CommentThread): Obj {
  const o: Obj = { id: t.id, kind: t.kind, target: { type: t.target.type, id: t.target.id } };
  if (t.diagram) o.diagram = t.diagram;
  Object.assign(o, { author: t.author, at: t.at, text: t.text, status: t.status });
  if (t.status === "resolved") {
    if (t.resolvedBy) o.resolvedBy = t.resolvedBy;
    if (t.resolvedAt) o.resolvedAt = t.resolvedAt;
  }
  if (t.replies.length) o.replies = t.replies.map((r) => ({ id: r.id, author: r.author, at: r.at, text: r.text }));
  return o;
}

export class CommentStore {
  private threads: CommentThread[] = [];
  private stamp = "";

  constructor(
    readonly file: string,
    private readonly now: () => number = Date.now,
  ) {
    this.reload();
  }

  private reload(): void {
    const s = stampOf(this.file);
    if (s === this.stamp) return;
    this.threads = fs.existsSync(this.file) ? parseComments(fs.readFileSync(this.file, "utf-8")) : [];
    this.stamp = s;
  }

  private save(): void {
    if (this.threads.length === 0 && !fs.existsSync(this.file)) return;
    atomicWrite(this.file, stableJson({ threads: this.threads.map(threadData) }));
    this.stamp = stampOf(this.file);
  }

  private time(): string {
    return new Date(this.now()).toISOString();
  }

  list(): CommentThread[] {
    this.reload();
    return structuredClone(this.threads);
  }

  get(id: string): CommentThread | undefined {
    this.reload();
    const t = this.threads.find((x) => x.id === id);
    return t ? structuredClone(t) : undefined;
  }

  /** The stored thread with ID `id`, or a "not found" error. Changes to it are kept by `save()`. */
  private need(id: string): CommentThread {
    this.reload();
    const t = this.threads.find((x) => x.id === id);
    if (!t) throw new NotFound(GONE);
    return t;
  }

  add(p: { kind: unknown; target: unknown; diagram?: unknown; text: unknown; author: string }): CommentThread {
    this.reload();
    if (this.threads.length >= MAX_THREADS) throw new ModelError(`This project already has ${MAX_THREADS} comment threads. Resolve and delete some first.`);
    const t: CommentThread = {
      id: newId("c"),
      kind: cleanKind(p.kind),
      target: cleanTarget(p.target),
      diagram: typeof p.diagram === "string" && p.diagram && p.diagram.length <= 300 ? p.diagram : null,
      author: p.author,
      at: this.time(),
      text: cleanText(p.text),
      status: "open",
      replies: [],
    };
    this.threads.push(t);
    this.save();
    return structuredClone(t);
  }

  reply(id: string, p: { text: unknown; author: string }): CommentThread {
    const t = this.need(id);
    if (t.replies.length >= MAX_REPLIES) throw new ModelError(`A thread can have at most ${MAX_REPLIES} replies. Start a new thread instead.`);
    t.replies.push({ id: newId("r"), author: p.author, at: this.time(), text: cleanText(p.text) });
    this.save();
    return structuredClone(t);
  }

  /** Resolve or reopen. `by` is the person doing it. */
  setStatus(id: string, status: "open" | "resolved", by: string): CommentThread {
    const t = this.need(id);
    t.status = status;
    if (status === "resolved") {
      t.resolvedBy = by;
      t.resolvedAt = this.time();
    } else {
      delete t.resolvedBy;
      delete t.resolvedAt;
    }
    this.save();
    return structuredClone(t);
  }

  /** Change the wording or the kind (callers check who may). */
  edit(id: string, p: { text?: unknown; kind?: unknown }): CommentThread {
    const t = this.need(id);
    const text = p.text === undefined ? t.text : cleanText(p.text);
    const kind = p.kind === undefined ? t.kind : cleanKind(p.kind);
    t.text = text;
    t.kind = kind;
    this.save();
    return structuredClone(t);
  }

  remove(id: string): void {
    this.reload();
    const i = this.threads.findIndex((t) => t.id === id);
    if (i < 0) throw new NotFound(GONE);
    this.threads.splice(i, 1);
    this.save();
  }

  removeReply(id: string, replyId: string): CommentThread {
    const t = this.need(id);
    const i = t.replies.findIndex((r) => r.id === replyId);
    if (i < 0) throw new NotFound("That reply no longer exists. It may have been deleted by someone else.");
    t.replies.splice(i, 1);
    this.save();
    return structuredClone(t);
  }
}

/** Where a project keeps its comments. */
export const commentsPath = (root: string): string => path.join(root, "architecture", COMMENTS_FILE);
