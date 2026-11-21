/** Comment routes: comments, ideas and questions on elements, relationships and diagrams (REC-01). */

import type { Context, Hono } from "hono";
import { cleanAuthor, cleanText } from "../../core/comments.js";
import * as diagrams from "../../core/diagrams.js";
import { ModelError } from "../../core/modelEdits.js";
import { gitUserName } from "../../core/git.js";
import type { CommentList, CommentThread } from "../../shared/types.js";
import { buildIndex } from "../../core/modelEdits.js";
import { HttpError, objBody, optStr, type Ctx } from "../routeContext.js";

export function registerComments(app: Hono, ctx: Ctx): void {
  const { comments, ok, sel, who } = ctx;
  const gitName = gitUserName(ctx.project.dir);

  /** Whose name goes on a new comment: the signed-in user (a sent name is ignored), else the sent name, else git's. */
  const authorOf = (c: Context, sent: string | null): string => {
    const user = who(c).user;
    return user ? user.name : cleanAuthor(sent ?? gitName);
  };

  /** May this person change or delete what `author` wrote? Their own, or anything for an architect (sign-in off: everyone is one). */
  const mayChange = (c: Context, author: string): boolean => {
    const w = who(c);
    return w.role === "architect" || (!!w.user && w.user.name.toLowerCase() === author.toLowerCase());
  };
  const needOwner = (c: Context, author: string, what: string) => {
    if (!mayChange(c, author)) throw new HttpError(403, `Only ${author} or an architect can ${what}.`);
  };

  /** The threads with `missing` set for the version shown: is what each one is about in it? */
  const annotate = (threads: CommentThread[]): CommentThread[] => {
    const ws = sel().src.workspace;
    const idx = buildIndex(ws);
    const keys = new Set(diagrams.diagramList(ws).map((d) => d.key));
    return threads.map((t) => {
      const here = t.target.type === "element" ? idx.elements.has(t.target.id) : t.target.type === "relationship" ? idx.relationships.has(t.target.id) : keys.has(t.target.id);
      return here ? t : { ...t, missing: true };
    });
  };
  const one = (t: CommentThread) => annotate([t])[0]!;

  app.get("/api/comments", (c) => c.json({ threads: annotate(comments.list()) } satisfies CommentList));

  app.post("/api/comments", async (c) => {
    const b = await objBody(c);
    const thread = comments.add({ kind: b.kind, target: b.target, diagram: b.diagram, position: b.position, text: b.text, author: authorOf(c, optStr(b, "author")) });
    return c.json(one(thread));
  });

  app.post("/api/comments/:id/replies", async (c) => {
    const b = await objBody(c);
    return c.json(one(comments.reply(c.req.param("id"), { text: b.text, author: authorOf(c, optStr(b, "author")) })));
  });

  /** Resolve or reopen, or place a diagram note (anyone who can comment), or change the wording or kind (its author, or an architect). */
  app.patch("/api/comments/:id", async (c) => {
    const id = c.req.param("id");
    const b = await objBody(c);
    const t = comments.get(id);
    if (!t) return c.json({ detail: "That comment no longer exists. It may have been deleted by someone else." }, 404);
    const wording = b.text !== undefined || b.kind !== undefined;
    if (b.status === undefined && !wording && b.position === undefined) throw new ModelError("Nothing to change: send status, text, kind or position.");
    if (b.status !== undefined && b.status !== "open" && b.status !== "resolved") throw new ModelError('The status must be "open" or "resolved".');
    if (wording) {
      needOwner(c, t.author, "change this comment");
      comments.edit(id, { text: b.text === undefined ? undefined : cleanText(b.text), kind: b.kind });
    }
    // Moving a note is not an edit of its wording: anyone who may comment may place it.
    if (b.position !== undefined) comments.setPosition(id, b.position);
    if (b.status !== undefined) comments.setStatus(id, b.status, authorOf(c, optStr(b, "author")));
    return c.json(one(comments.get(id)!));
  });

  app.delete("/api/comments/:id", (c) => {
    const t = comments.get(c.req.param("id"));
    if (!t) return c.json({ detail: "That comment no longer exists. It may have been deleted by someone else." }, 404);
    needOwner(c, t.author, "delete this comment");
    comments.remove(t.id);
    return ok(c);
  });

  app.delete("/api/comments/:id/replies/:rid", (c) => {
    const t = comments.get(c.req.param("id"));
    if (!t) return c.json({ detail: "That comment no longer exists. It may have been deleted by someone else." }, 404);
    const r = t.replies.find((x) => x.id === c.req.param("rid"));
    if (!r) return c.json({ detail: "That reply no longer exists. It may have been deleted by someone else." }, 404);
    needOwner(c, r.author, "delete this reply");
    return c.json(one(comments.removeReply(t.id, r.id)));
  });
}
