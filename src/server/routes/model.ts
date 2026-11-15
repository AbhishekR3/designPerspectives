/** Model routes: diagram positions, workspace, elements and relationships. */

import type { Hono } from "hono";
import * as diagrams from "../../core/diagrams.js";
import { isObj, str, type Obj } from "../../core/json.js";
import * as ops from "../../core/ops.js";
import { ModelError } from "../../core/ops.js";
import { body, HttpError, needStr, objBody, optStr, point, type Ctx } from "../context.js";

export function registerModel(app: Hono, ctx: Ctx): void {
  const { edit, ok } = ctx;

  app.put("/api/diagrams/:key/positions", async (c) => {
    const key = c.req.param("key");
    const b = await objBody(c);
    if (!isObj(b.positions)) throw new HttpError(422, '"positions" is required.');
    const positions: Record<string, { x: number; y: number }> = {};
    for (const [id, p] of Object.entries(b.positions)) positions[id] = point(p, `positions.${id}`);
    // auto=true: boxes placed by the automatic layout; these are not separate undo steps.
    const auto = ["true", "1", "yes", "on"].includes((c.req.query("auto") ?? "").toLowerCase());
    edit((ws) => diagrams.setPositions(ws, key, positions), !auto);
    return ok(c);
  });

  // ------------------------------------------------------------ workspace

  app.patch("/api/workspace", async (c) => {
    const patch = await objBody(c);
    edit((ws) => {
      if ("name" in patch) {
        const name = str(patch.name).trim();
        if (!name) throw new ModelError("The workspace needs a name.");
        ws.name = name;
      }
      if ("description" in patch) ws.description = str(patch.description) || null;
    });
    return ok(c);
  });

  // ------------------------------------------------------------ elements

  app.post("/api/elements", async (c) => {
    const b = await objBody(c);
    const kind = needStr(b, "kind");
    const diagramKey = optStr(b, "diagramKey");
    const position = b.position === null || b.position === undefined ? null : point(b.position, "position");
    // connectTo / connectFrom: also create a relationship from / to that element (same undo step),
    // so a person or system added on a context, container or component diagram shows there.
    const connect = { to: optStr(b, "connectTo"), from: optStr(b, "connectFrom"), description: optStr(b, "connectDescription") };
    const made = edit((ws) => {
      const r = ops.createConnectedElement(
        ws,
        {
          kind,
          name: optStr(b, "name"),
          parentId: optStr(b, "parentId"),
          description: optStr(b, "description"),
          technology: b.technology,
          external: Boolean(b.external),
          archType: optStr(b, "archType"),
          uniqueName: Boolean(b.uniqueName),
        },
        connect,
      );
      if (diagramKey && position) diagrams.setPositions(ws, diagramKey, { [r.id]: position });
      return r;
    });
    return c.json(made.relationshipId ? made : { id: made.id });
  });

  app.patch("/api/elements/:id", async (c) => {
    const { reslug, ...patch } = await objBody(c);
    const elementId = c.req.param("id");
    // reslug: the first rename right after creating the element; the ID follows the new name.
    // Never for an element that the main model (or, in a draft, the draft's base) already has:
    // there the new ID would show as a removal plus an addition.
    const { ref } = ctx.sel();
    const known =
      ref !== "main" &&
      (ops.buildIndex(ctx.project.workspace).elements.has(elementId) || (ref.startsWith("draft:") && ops.buildIndex(ctx.drafts.base(ctx.draftId(ref)).workspace).elements.has(elementId)));
    const id = edit((ws, sc) => ops.updateElement(ws, sc, elementId, patch, { reslug: reslug === true && !known }));
    return c.json({ ok: true, id });
  });

  /** Move a container to another software system, or a component to another container. */
  app.post("/api/elements/:id/move", async (c) => {
    const b = await objBody(c);
    const parentId = needStr(b, "parentId");
    const elementId = c.req.param("id");
    edit((ws, sc) => diagrams.moveWithLayout(ws, sc, elementId, parentId));
    return c.json({ ok: true, id: elementId, parentId });
  });

  /** Delete several elements as one edit (one undo step). An id that went with an earlier one (a child) is skipped. */
  app.post("/api/elements/delete", async (c) => {
    const b = await objBody(c);
    const ids = b.ids;
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((x): x is string => typeof x === "string" && x !== "")) {
      throw new HttpError(422, '"ids" must be a non-empty list of element IDs.');
    }
    const gone = edit((ws) => {
      const idx = ops.buildIndex(ws);
      for (const id of ids) idx.el(id); // unknown ids are refused before anything is deleted
      const all = new Set<string>();
      for (const id of ids) {
        if (all.has(id)) continue;
        for (const g of ops.deleteElement(ws, id)) all.add(g);
      }
      return all;
    });
    return c.json({ deleted: [...gone].sort() });
  });

  app.delete("/api/elements/:id", (c) => {
    const gone = edit((ws) => ops.deleteElement(ws, c.req.param("id")));
    return c.json({ deleted: [...gone].sort() });
  });

  /** Copy an element; optionally place the copy on a diagram (paste at a point) in the same undo step. */
  app.post("/api/elements/:id/duplicate", async (c) => {
    const raw = await body(c);
    if (raw !== null && !isObj(raw)) throw new HttpError(422, "The request body must be a JSON object.");
    const b: Obj = raw ?? {};
    const diagramKey = optStr(b, "diagramKey");
    const position = b.position === null || b.position === undefined ? null : point(b.position, "position");
    const id = edit((ws, sc) => {
      const newId = ops.duplicateElement(ws, sc, c.req.param("id"));
      if (diagramKey && position) diagrams.setPositions(ws, diagramKey, { [newId]: position });
      return newId;
    });
    return c.json({ id });
  });

  // ------------------------------------------------------------ relationships

  app.post("/api/relationships", async (c) => {
    const b = await objBody(c);
    const spec = {
      sourceId: needStr(b, "sourceId"),
      destinationId: needStr(b, "destinationId"),
      description: optStr(b, "description"),
      technology: b.technology,
      kind: optStr(b, "kind"),
    };
    return c.json({ id: edit((ws) => ops.createRelationship(ws, spec)) });
  });

  app.patch("/api/relationships/:id", async (c) => {
    const patch = await objBody(c);
    edit((ws) => ops.updateRelationship(ws, c.req.param("id"), patch));
    return ok(c);
  });

  app.delete("/api/relationships/:id", (c) => {
    edit((ws) => ops.deleteRelationship(ws, c.req.param("id")));
    return ok(c);
  });
}
