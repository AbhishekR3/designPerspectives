/** Draft routes: create, edit, discard, the coding plan, and apply. */

import type { Hono } from "hono";
import { isObj } from "../../core/json.js";
import type { CodeSource } from "../../core/codefs.js";
import { body, HttpError, needStr, objBody, optStr, type Ctx } from "../context.js";

export function registerDrafts(app: Hono, ctx: Ctx): void {
  const { drafts, disk, gitCodes, ok } = ctx;

  app.post("/api/drafts", async (c) => {
    const b = await objBody(c);
    // With sign-in, a draft is always credited to the signed-in user; a sent author is ignored.
    const user = ctx.who(c).user;
    const author = user ? user.name : (optStr(b, "author")?.trim() ?? null);
    if (author !== null && author.length > 80) throw new HttpError(422, '"author" can be at most 80 characters.');
    return c.json({ id: drafts.create(needStr(b, "title"), optStr(b, "description") ?? "", author) });
  });

  app.patch("/api/drafts/:id", async (c) => {
    const b = await objBody(c);
    drafts.update(c.req.param("id"), {
      title: optStr(b, "title") ?? undefined,
      description: optStr(b, "description") ?? undefined,
      branch: optStr(b, "branch") ?? undefined,
      link: optStr(b, "link") ?? undefined,
    });
    return ok(c);
  });

  app.delete("/api/drafts/:id", (c) => {
    drafts.remove(c.req.param("id"));
    return ok(c);
  });

  /** The draft's coding plan. ?against=disk (the code folder) or ref:<branch> checks progress. */
  const planTarget = (against: string | undefined): CodeSource | null => {
    if (!against || against === "none") return null;
    if (against === "disk") return disk;
    if (against.startsWith("ref:")) return gitCodes.at(against.slice(4));
    throw new HttpError(422, 'Check against "disk" or "ref:<branch>".');
  };
  app.get("/api/drafts/:id/plan", (c) => c.json(drafts.plan(c.req.param("id"), planTarget(c.req.query("against")))));

  // ?code=0 / {"code": false}: apply the model changes only, not the planned code edits.
  const codeFlag = (v: unknown) => !(v === false || v === "0" || v === "false");
  app.get("/api/drafts/:id/apply-preview", (c) => c.json(drafts.preview(c.req.param("id"), { code: codeFlag(c.req.query("code")) })));

  app.post("/api/drafts/:id/apply", async (c) => {
    const b = await body(c);
    drafts.apply(c.req.param("id"), { code: codeFlag(isObj(b) ? b.code : undefined) });
    return ok(c);
  });
}
