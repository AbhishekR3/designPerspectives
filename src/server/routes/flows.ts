/** Flow routes: create, update and delete flows. */

import type { Hono } from "hono";
import * as flows from "../../core/flows.js";
import { needStr, objBody, optStr, type Ctx } from "../context.js";

export function registerFlows(app: Hono, ctx: Ctx): void {
  const { edit, ok } = ctx;

  app.post("/api/flows", async (c) => {
    const b = await objBody(c);
    const title = needStr(b, "title");
    return c.json({ key: edit((ws) => flows.createFlow(ws, title, optStr(b, "description") ?? "")) });
  });

  app.put("/api/flows/:key", async (c) => {
    const patch = await objBody(c);
    edit((ws) => flows.updateFlow(ws, c.req.param("key"), patch));
    return ok(c);
  });

  app.delete("/api/flows/:key", (c) => {
    edit((ws) => flows.deleteFlow(ws, c.req.param("key")));
    return ok(c);
  });
}
