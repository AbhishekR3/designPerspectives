/** Backtracking route: from a pipeline stage or flow step back to where its data came from, with code and history. */

import type { Hono } from "hono";
import { backtrack } from "../../core/backtrack.js";
import { HttpError, type Ctx } from "../context.js";

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
