/** Model routes: diagram positions, workspace, elements and relationships, plus flows, linked catalog copies and linked work status. */

import type { Hono } from "hono";
import * as diagrams from "../../core/diagrams.js";
import * as flows from "../../core/flows.js";
import { isObj, str, type Obj } from "../../core/util.js";
import { applyStatuses, failures, fetchStatuses, refreshPlan, tokenFor } from "../../core/workStatus.js";
import * as ops from "../../core/modelEdits.js";
import { ModelError } from "../../core/modelEdits.js";
import { WORK_TOOLS, type WorkRefresh, type WorkToolId } from "../../shared/types.js";
import { body, HttpError, needStr, objBody, optStr, point, type Ctx } from "../routeContext.js";

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

  /**
   * Change several elements as one edit (one undo step): `{updates: [{id, patch}, ...]}`, each patch as in PATCH /api/elements/:id.
   * An error on any element (a name in use, a technology on a person) refuses the whole request: nothing is changed.
   * Never re-slugs: that is only for the first rename of a new element.
   */
  app.post("/api/elements/update", async (c) => {
    const b = await objBody(c);
    const list = b.updates;
    if (!Array.isArray(list) || list.length === 0 || list.length > 1000) throw new HttpError(422, '"updates" must be a list of 1 to 1000 changes: {id, patch}.');
    const seen = new Set<string>();
    const updates = list.map((u, i) => {
      if (!isObj(u) || Object.keys(u).some((k) => k !== "id" && k !== "patch")) throw new HttpError(422, `updates[${i}] must be an object with only "id" and "patch".`);
      if (typeof u.id !== "string" || u.id === "") throw new HttpError(422, `updates[${i}].id must be an element ID.`);
      if (!isObj(u.patch)) throw new HttpError(422, `updates[${i}].patch must be an object.`);
      if (seen.has(u.id)) throw new HttpError(422, `The element "${u.id}" is listed twice.`);
      seen.add(u.id);
      return { id: u.id, patch: u.patch as Obj };
    });
    edit((ws, sc) => {
      for (const u of updates) ops.updateElement(ws, sc, u.id, u.patch);
    });
    return c.json({ ok: true, updated: updates.map((u) => u.id) });
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

/** Linked copies of shared catalog elements in a project (DEC-055): add, link, update from the catalog, unlink. */
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

/** Flow routes: create, update and delete flows. */
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

/** Linked work status (DEC-059, DEC-085): one button refreshes every link of the shown version that a connection
 *  knows (GitHub, GitLab, SonarQube, Jira), wherever it is pinned. Optional body: {"tools": [...]} for some tools only. */
export function registerWork(app: Hono, ctx: Ctx): void {
  app.post("/api/work/refresh", async (c) => {
    const b = await body(c);
    if (b !== null && !isObj(b)) throw new HttpError(422, "The request body must be a JSON object.");
    let tools: WorkToolId[] | undefined;
    if (b && b.tools !== undefined) {
      if (!Array.isArray(b.tools) || b.tools.some((t) => typeof t !== "string" || !(WORK_TOOLS as readonly string[]).includes(t))) {
        throw new HttpError(422, `"tools" is a list of: ${WORK_TOOLS.join(", ")}.`);
      }
      tools = b.tools as WorkToolId[];
    }
    const project = ctx.writable();
    project.reloadIfChanged();
    const connections = ctx.integrations.connections();
    const plan = refreshPlan(project.workspace, connections, tools);
    const { states, byTool } = await fetchStatuses(plan, (conn) => tokenFor(conn, ctx.credentials, connections), ctx.fetch, project.sidecar.work.severity);
    const now = new Date().toISOString();
    // Look on a copy first: nothing to change, nothing written (and no undo step).
    const copy = structuredClone(project.workspace);
    applyStatuses(copy, states, now);
    const changed = JSON.stringify(copy) !== JSON.stringify(project.workspace);
    const updated = changed ? ctx.edit((ws) => applyStatuses(ws, states, now)) : [];
    return c.json({ checked: plan.links.length, updated, failed: failures(plan, states), byTool, unknown: plan.unknown } satisfies WorkRefresh);
  });
}
