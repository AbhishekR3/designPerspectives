/** Read routes: health, state, diagrams and changes. */

import type { Hono } from "hono";
import { compareDiagram, diagramOf } from "../../core/compare.js";
import { diffModels } from "../../core/diff.js";
import { version } from "../../core/store.js";
import type { ChangeSet } from "../../shared/types.js";
import { codePair, HttpError, state, type Ctx } from "../context.js";

export function registerRead(app: Hono, ctx: Ctx): void {
  const { project, drafts, gitModels, readOnly, sel } = ctx;

  /** For process monitors: the server is up and the model files load. */
  app.get("/api/health", (c) => c.json({ ok: true, version: version(), loadErrors: project.loadErrors.length }));

  app.get("/api/state", (c) => c.json(state(project, readOnly, sel(), drafts, gitModels)));

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
