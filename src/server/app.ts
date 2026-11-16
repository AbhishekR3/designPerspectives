/** Local web server: a JSON API over the model files, plus the built browser UI. */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ApplyConflict } from "../core/drafts.js";
import { GitError } from "../core/git.js";
import * as diagrams from "../core/diagrams.js";
import { ModelError } from "../core/ops.js";
import { NotFound } from "../core/store.js";
import { createContext, HttpError, type AppOptions } from "./context.js";
import { authorize } from "./auth.js";
import { installProtection } from "./protect.js";
import { registerComments } from "./routes/comments.js";
import { registerCode } from "./routes/code.js";
import { registerDecisions } from "./routes/decisions.js";
import { registerDrafts } from "./routes/drafts.js";
import { registerFlows } from "./routes/flows.js";
import { registerHistory } from "./routes/history.js";
import { registerBacktrack } from "./routes/backtrack.js";
import { registerInspect } from "./routes/inspect.js";
import { registerModel } from "./routes/model.js";
import { registerRead } from "./routes/read.js";
import { registerSidecar } from "./routes/sidecar.js";
import { registerUi } from "./routes/ui.js";

export { codePair, HttpError, state, type Access, type AppOptions, type Selection } from "./context.js";
export { ROUTE_RULES } from "./auth.js";
export { LOOPBACK_HOSTS, MAX_BODY_BYTES } from "./protect.js";

export function createApp(root: string, opts: AppOptions = {}): Hono {
  const ctx = createContext(root, opts);
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof GitError) return c.json({ detail: err.message }, 422);
    if (err instanceof ApplyConflict) return c.json({ detail: err.message, conflicts: err.conflicts }, 409);
    if (err instanceof NotFound) return c.json({ detail: err.message }, 404);
    if (err instanceof ModelError) return c.json({ detail: err.message }, 422);
    if (err instanceof HttpError) return c.json({ detail: err.message }, err.status as 400);
    if (err instanceof diagrams.UnknownDiagram) return c.json({ detail: `No diagram ${err.message}` }, 404);
    if (err instanceof HTTPException) return c.json({ detail: err.message || "Bad request." }, err.status);
    // Unexpected: the details (paths, stack) go to the server log, not to the browser.
    console.error(err);
    return c.json({ detail: "Internal error. See the server log." }, 500);
  });

  installProtection(app, { allowedHosts: opts.allowedHosts });

  // Sign-in first (401 before anything about the model is looked at), then the model version,
  // then the role check, which needs the version: one place decides every change (auth.ts).
  app.use("/api/*", ctx.auth.authenticate);
  app.use("/api/*", ctx.selectVersion);
  app.use("/api/*", authorize(ctx));

  ctx.auth.register(app);

  registerRead(app, ctx);
  registerDrafts(app, ctx);
  registerModel(app, ctx);
  registerSidecar(app, ctx);
  registerHistory(app, ctx);
  registerCode(app, ctx);
  registerFlows(app, ctx);
  registerDecisions(app, ctx);
  registerInspect(app, ctx);
  registerBacktrack(app, ctx);
  registerComments(app, ctx);

  app.all("/api/*", (c) => c.json({ detail: "Not Found" }, 404));

  registerUi(app, ctx);

  return app;
}
