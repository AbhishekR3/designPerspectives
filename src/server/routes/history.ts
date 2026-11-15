/** Undo and redo of the selected (editable) model. */

import type { Hono } from "hono";
import type { Ctx } from "../context.js";

export function registerHistory(app: Hono, ctx: Ctx): void {
  const { writable } = ctx;

  app.post("/api/undo", (c) => c.json({ ok: writable().undo() }));
  app.post("/api/redo", (c) => c.json({ ok: writable().redo() }));
}
