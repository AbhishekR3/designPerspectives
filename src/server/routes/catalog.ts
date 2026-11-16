/** Linked copies of shared catalog elements in a project (DEC-055): add, link, update from the catalog, unlink. */

import type { Hono } from "hono";
import * as ops from "../../core/ops.js";
import { HttpError, needStr, objBody, optStr, type Ctx } from "../context.js";

export function registerCatalog(app: Hono, ctx: Ctx): void {
  const { edit, ok } = ctx;
  const catalog = () => {
    const ws = ctx.catalog();
    if (!ws) throw new HttpError(422, "This project has no shared catalog: serve it in a hub with a catalog (dp serve --hub).");
    return ws;
  };

  app.post("/api/elements/from-catalog", async (c) => {
    const b = await objBody(c);
    const cat = catalog();
    return c.json({ id: edit((ws) => ops.addFromCatalog(ws, cat, needStr(b, "catalogId"), optStr(b, "parentId"))) });
  });

  app.post("/api/elements/:id/catalog", async (c) => {
    const b = await objBody(c);
    const src = ops.catalogSource(catalog(), needStr(b, "catalogId"));
    edit((ws) => ops.linkCatalog(ws, c.req.param("id"), src));
    return ok(c);
  });

  app.post("/api/elements/:id/catalog/sync", (c) => {
    const cat = catalog();
    edit((ws) => {
      const id = c.req.param("id");
      const linked = ops.getProps(ops.buildIndex(ws).el(id))[ops.CATALOG_KEY];
      if (!linked) throw new ops.ModelError("This element is not a copy of a catalog element.");
      ops.syncFromCatalog(ws, id, ops.catalogSource(cat, linked));
    });
    return ok(c);
  });

  app.delete("/api/elements/:id/catalog", (c) => {
    edit((ws) => ops.unlinkCatalog(ws, c.req.param("id")));
    return ok(c);
  });
}
