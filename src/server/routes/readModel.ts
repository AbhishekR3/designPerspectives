/** Read routes: health, state, diagrams and changes, plus undo / redo and backtracking. */

import type { Hono } from "hono";
import { backtrack } from "../../core/backtrack.js";
import { compareDiagram, diagramOf, diffModels } from "../../core/diff.js";
import { version } from "../../core/project.js";
import type { ChangeSet } from "../../shared/types.js";
import { codePair, HttpError, state, type Ctx } from "../routeContext.js";

export function registerRead(app: Hono, ctx: Ctx): void {
  const { project, drafts, gitModels, readOnly, sel } = ctx;

  /** For process monitors: the server is up and the model files load. */
  app.get("/api/health", (c) => c.json({ ok: true, version: version(), loadErrors: project.loadErrors.length }));

  app.get("/api/state", (c) => c.json(state(project, readOnly, sel(), drafts, gitModels, ctx.access(c))));

  /** The changes between the shown model and the one it is compared with. */
  const changes = (): ChangeSet => {
    const { src: s, cmp, cmpRef } = sel();
    if (!cmp || !cmpRef) throw new HttpError(422, "Nothing to compare with: send the X-DP-Compare header.");
    return diffModels(cmp, s, cmpRef, codePair(sel()));
  };

  app.get("/api/diagrams/:key", (c) => {
    const key = c.req.param("key");
    const { src: s, cmp, code, cmpCode } = sel();
    const d = cmp ? compareDiagram(s, cmp, key, changes(), code, cmpCode ?? code) : diagramOf(s, key, code);
    if (!d) throw new HttpError(404, `No diagram ${key}`);
    return c.json(d);
  });

  app.get("/api/changes", (c) => c.json(changes()));
}

/** Undo and redo of the selected (editable) model. */
export function registerHistory(app: Hono, ctx: Ctx): void {
  const { writable } = ctx;

  app.post("/api/undo", (c) => c.json({ ok: writable().undo() }));
  app.post("/api/redo", (c) => c.json({ ok: writable().redo() }));
}

/** Backtracking route: from a pipeline stage or flow step back to where its data came from, with code and history. */
export function registerBacktrack(app: Hono, ctx: Ctx): void {
  const { sel, project, gitModels } = ctx;

  app.get("/api/backtrack", (c) => {
    const q = c.req.query();
    const num = (k: string): number | undefined => {
      if (q[k] === undefined || q[k] === "") return undefined;
      const n = Number(q[k]);
      if (!Number.isInteger(n)) throw new HttpError(422, `"${k}" must be a whole number.`);
      return n;
    };
    const s = sel();
    return c.json(
      backtrack(
        s.src.workspace,
        s.code,
        { codeDir: project.codeRoot, modelDir: project.dir, modelAt: gitModels.get() ? (sha) => gitModels.at(sha).workspace : null },
        { connector: q.connector || undefined, stage: num("stage"), flow: q.flow || undefined, step: num("step"), days: num("days") },
      ),
    );
  });
}
