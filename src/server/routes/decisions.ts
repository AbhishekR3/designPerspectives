/** Decision record routes (DEC-050): list, read, create, change and delete decisions of the selected version. */

import type { Hono } from "hono";
import * as decisions from "../../core/decisions.js";
import { HttpError, objBody, type Ctx } from "../context.js";

export function registerDecisions(app: Hono, ctx: Ctx): void {
  const { edit, ok, sel } = ctx;

  const one = (id: string) => {
    const d = sel().src.decisions.find((x) => x.id === id);
    if (!d) throw new HttpError(404, `No decision ${id}.`);
    return d;
  };
  /** The API never sends a file's raw text: `error` says what is wrong with it. */
  const shown = <T extends { raw?: string }>(d: T): Omit<T, "raw"> => {
    const { raw: _raw, ...rest } = d;
    return rest;
  };

  app.get("/api/decisions", (c) => c.json(sel().src.decisions.map(shown)));

  app.get("/api/decisions/:id", (c) => c.json(shown(one(c.req.param("id")))));

  /** The file as it is (or would be) written, for "view source" and copying. */
  app.get("/api/decisions/:id/markdown", (c) => {
    const d = one(c.req.param("id"));
    return c.body(decisions.serializeDecision(d), 200, { "Content-Type": "text/markdown; charset=utf-8" });
  });

  app.post("/api/decisions", async (c) => {
    const b = await objBody(c);
    return c.json({ id: edit((_ws, _sc, decs) => decisions.createDecision(decs, b)) });
  });

  app.put("/api/decisions/:id", async (c) => {
    const b = await objBody(c);
    edit((_ws, _sc, decs) => decisions.updateDecision(decs, c.req.param("id"), b));
    return ok(c);
  });

  app.patch("/api/decisions/:id/status", async (c) => {
    const b = await objBody(c);
    edit((_ws, _sc, decs) => decisions.setDecisionStatus(decs, c.req.param("id"), b.status));
    return ok(c);
  });

  app.delete("/api/decisions/:id", (c) => {
    edit((_ws, _sc, decs) => decisions.deleteDecision(decs, c.req.param("id")));
    return ok(c);
  });
}
