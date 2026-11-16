/** Local web server: a JSON API over the model files, plus the built browser UI. */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ApplyConflict } from "../core/drafts.js";
import { GitError } from "../core/git.js";
import * as diagrams from "../core/diagrams.js";
import { ModelError } from "../core/ops.js";
import { NotFound } from "../core/project.js";
import { createContext, HttpError, type AppOptions, type Ctx } from "./context.js";
import { authorize } from "./auth.js";
import { installProtection } from "./protect.js";
import { registerCode } from "./routes/code.js";
import { registerComments } from "./routes/comments.js";
import { registerDecisions } from "./routes/decisions.js";
import { registerDrafts } from "./routes/drafts.js";
import { registerCredentials, registerHub, type HubCtx } from "./routes/hub.js";
import { registerBmo } from "./routes/bmo.js";
import { registerImport } from "./routes/import.js";
import { registerInspect } from "./routes/inspect.js";
import { registerCatalog, registerFlows, registerModel, registerWork } from "./routes/model.js";
import { registerBacktrack, registerHistory, registerRead } from "./routes/read.js";
import { registerSidecar } from "./routes/sidecar.js";
import { registerUi } from "./routes/ui.js";

export { codePair, HttpError, state, type Access, type AppOptions, type Selection } from "./context.js";
export { ROUTE_RULES } from "./auth.js";
export { LOOPBACK_HOSTS, MAX_BODY_BYTES } from "./protect.js";

export function createApp(root: string, opts: AppOptions = {}): Hono {
  return buildApp(root, opts).app;
}

/** Errors as JSON answers; the same mapping for a project's app and for the hub's. */
export function onError(app: Hono): void {
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
}

/**
 * A project's app and its context. `opts.hub` set: the app is one project of a hub, which answers the
 * hub-level routes and the UI itself (hub.ts). Otherwise the app serves one project, and answers the
 * hub-level routes as a hub of one.
 */
export function buildApp(root: string, opts: AppOptions & { hub?: boolean } = {}): { app: Hono; ctx: Ctx } {
  const ctx = createContext(root, opts);
  const app = new Hono();
  onError(app);

  installProtection(app, { allowedHosts: opts.allowedHosts });

  // Sign-in first (401 before anything about the model is looked at), then the model version,
  // then the role check, which needs the version: one place decides every change (auth.ts).
  app.use("/api/*", ctx.auth.authenticate);
  if (opts.projectId) app.use("/api/*", ctx.auth.projectRole(opts.projectId));
  app.use("/api/*", ctx.selectVersion);
  app.use("/api/*", authorize(ctx));

  ctx.auth.register(app);

  if (!opts.hub) {
    const hub = singleHub(root, ctx);
    registerHub(app, hub);
    registerCredentials(app, hub, opts.secretKey);
  }
  registerRead(app, ctx);
  registerDrafts(app, ctx);
  registerImport(app, ctx); // before the model routes: its paths are under /api/import
  registerBmo(app, ctx); // before the model routes: its paths are under /api/bmo
  registerCatalog(app, ctx); // before the model routes: "/api/elements/from-catalog" is not an element ID
  registerModel(app, ctx);
  registerSidecar(app, ctx);
  registerHistory(app, ctx);
  registerCode(app, ctx);
  registerFlows(app, ctx);
  registerWork(app, ctx);
  registerDecisions(app, ctx);
  registerInspect(app, ctx);
  registerBacktrack(app, ctx);
  registerComments(app, ctx);

  app.all("/api/*", (c) => c.json({ detail: "Not Found" }, 404));

  if (!opts.hub) registerUi(app);

  return { app, ctx };
}

/** A single project seen as a hub of one. */
function singleHub(root: string, ctx: Ctx): HubCtx {
  const entry = { id: "main", name: "", path: root, catalog: false, ctx: () => ctx };
  return { mode: "single", name: () => ctx.project.workspace.name, dir: root, auth: ctx.auth, readOnly: ctx.readOnly, entries: () => [entry], catalogId: null };
}
