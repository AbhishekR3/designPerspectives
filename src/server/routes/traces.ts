/** Trace routes: the trace files in the traces folder, and one trace laid over the model. */

import type { Hono } from "hono";
import { observe } from "../../core/traces.js";
import { HttpError, type Ctx } from "../routeContext.js";

export function registerTraces(app: Hono, ctx: Ctx): void {
  const { sel, traces, project } = ctx;

  app.get("/api/traces", (c) => {
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 30) || 30, 1), 200);
    return c.json(traces.list(limit));
  });

  app.get("/api/traces/:id", (c) => {
    const id = c.req.param("id");
    if (!/^[0-9a-f]{16,32}$/i.test(id)) throw new HttpError(422, "A trace ID is 32 hexadecimal characters.");
    const spans = traces.spans(id);
    if (!spans) throw new HttpError(404, `Trace ${id} is not in the trace files (yet).`);
    const ui = c.req.query("ui") || null;
    return c.json(observe(sel().src.workspace, project.codeRoot, spans, ui));
  });
}
