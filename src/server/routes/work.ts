/** The linked work routes (WRK-02): list every item with what it is pinned to, replace one target's list, and
 *  merge items that tools push or import. Status refresh from the tools is in routes/model.ts. */

import type { Hono } from "hono";
import { cleanWorkTarget, getWork, listWork, setWork } from "../../core/work.js";
import { MAX_FINDINGS, parseWorkReport, pushWork } from "../../core/workImport.js";
import { isObj } from "../../core/util.js";
import { MAX_BODY_BYTES } from "../requestProtection.js";
import { WORK_IMPORT_FORMATS, type WorkImportFormat, type WorkPush } from "../../shared/types.js";
import { HttpError, objBody, type Ctx } from "../routeContext.js";

/** `source`, `closeMissing` and `dryRun` of a push or an import. */
function pushOptions(b: Record<string, unknown>) {
  if (b.source !== undefined && b.source !== null && typeof b.source !== "string") throw new HttpError(422, '"source" must be text.');
  for (const k of ["closeMissing", "dryRun"]) if (b[k] !== undefined && typeof b[k] !== "boolean") throw new HttpError(422, `"${k}" must be true or false.`);
  return { source: (b.source as string | null | undefined) || undefined, closeMissing: b.closeMissing === true, dryRun: b.dryRun === true };
}

export function registerWorkItems(app: Hono, ctx: Ctx): void {
  app.get("/api/work", (c) => c.json(listWork(ctx.sel().src.workspace, ctx.workConnections())));

  app.put("/api/work/target", async (c) => {
    const b = await objBody(c);
    const target = cleanWorkTarget(b.target);
    ctx.writable().reloadIfChanged();
    ctx.edit((ws) => setWork(ws, target, b.work ?? []));
    return c.json({ ok: true, work: getWork(ctx.sel().src.workspace, target) });
  });

  app.post("/api/work/items", async (c) => {
    const b = await objBody(c);
    if (!Array.isArray(b.items)) throw new HttpError(422, '"items" must be a list of {"to", "item"}.');
    if (b.items.length > MAX_FINDINGS) throw new HttpError(422, `At most ${MAX_FINDINGS} items in one push.`);
    if (b.items.some((x) => !isObj(x))) throw new HttpError(422, 'Each item needs "to" and "item".');
    return c.json(pushWork(ctx.writable(), b.items as WorkPush[], pushOptions(b)));
  });

  app.post("/api/work/import", async (c) => {
    const b = await objBody(c);
    if (typeof b.format !== "string" || !(WORK_IMPORT_FORMATS as readonly string[]).includes(b.format)) throw new HttpError(422, `"format" must be one of ${WORK_IMPORT_FORMATS.join(", ")}.`);
    if (typeof b.report !== "string") throw new HttpError(422, `"report" must be the report's text (a request is at most ${MAX_BODY_BYTES / 1024 / 1024} MB; \`dp work import\` reads larger files).`);
    const project = ctx.writable();
    project.reloadIfChanged();
    const { pushes, unmapped } = parseWorkReport(b.format as WorkImportFormat, b.report, project.workspace, project.sidecar.work.severity);
    return c.json({ ...pushWork(project, pushes, pushOptions(b)), unmapped });
  });
}
