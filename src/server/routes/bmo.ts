/**
 * BMO routes (DEC-051, owner answers 3 and 4): the settings, a preview of exactly what would be sent, and a run.
 *
 *   GET  /api/bmo            the settings without anything secret, what the caller may do, the tasks
 *   PUT  /api/bmo/settings   architects only (action `admin`); replaces `.dp/bmo.json`; never answers with a key
 *   POST /api/bmo/preview    {task, ...selectors}: the built prompt, the files in it, where it goes, its hash
 *   POST /api/bmo/run        {task, ...selectors, hash}: sends that prompt if it is still the same and carries out the answer
 *
 * Who may do what, in one place (the route enforces what `decide()` cannot see):
 * - `bmo.run` is open to every role, on a read-only server too (auth.ts). Whether BMO may run at all is the settings:
 *   enabled, backend "direct", a credential (not Ollama), and the caller's role in `allowedRoles` (per hub project);
 *   without sign-in the one local user is an architect.
 * - A text task (explain, challenge, draft-summary) changes nothing, so the role in `allowedRoles` is all it needs.
 * - A task that makes a draft (describe-to-model, import-level, suggest-labels) needs the right to create one
 *   (`decide("draft.create")`: not a viewer, not a read-only server); the refusal points to the handoff text instead.
 * - decision-from-draft writes into the draft the request selects (`X-DP-Model: draft:<id>`), so it needs the right to edit
 *   that draft (`decide("edit")`: an engineer only their own).
 * The backend is never a request's choice: `AppOptions.bmoBackend` (tests), else the direct backend the settings name.
 * The settings live with the credentials (the hub's `.dp/` in a hub), not in the project or its sidecar.
 */

import path from "node:path";
import type { Context, Hono } from "hono";
import { asBmoError, BmoError, type Backend } from "../../assistant/backend.js";
import { directBackend, type DirectFetch } from "../../assistant/providerBackend.js";
import { BmoInvalid, destinationOf, EFFECT, parseSelectors, planTask, previewOf, runBmo, StalePreview, taskList, type BmoEnv, type Planned, type Selectors } from "../../assistant/runTask.js";
import { allowedRolesFor, canRun, defaultSettings, parseSettings, publicStatus, readSettings, writeSettings, type BmoSettings } from "../../assistant/settings.js";
import { ModelError } from "../../core/modelEdits.js";
import type { BmoPreview, BmoRunFailure, BmoRunResult, BmoSettingsData, BmoStatus } from "../../shared/types.js";
import type { CredentialStore } from "../../core/credentials.js";
import { decide } from "../auth.js";
import { whoOf, type HubCtx } from "./hub.js";
import { HttpError, objBody, type Ctx } from "../routeContext.js";

/** Where the plain-language refusals of a draft task point: the handoff, which needs no model call. */
const HANDOFF_HINT = "BMO can still write the prompt for you to run in your own coding agent (the Import page, or dp scan --prompt); the result comes back through the import file.";

/** The settings of a hub or project folder; a file that cannot be read gives the defaults and says why (`problem`). */
function settingsOf(root: string): { s: BmoSettings; problem: string | null } {
  try {
    return { s: readSettings(root), problem: null };
  } catch (e) {
    if (e instanceof ModelError) return { s: defaultSettings(), problem: e.message };
    throw e;
  }
}

/** The status the settings page and the run button read; `project`: the hub project whose role list applies (none: the hub's own page). */
function statusFor(s: BmoSettings, problem: string | null, creds: CredentialStore, g: { ok: true } | { ok: false; reason: string }, admin: boolean, fake: boolean, project?: string): BmoStatus {
  return {
    ...publicStatus(s, creds, project),
    canRun: g.ok ? { ok: true } : { ok: false, reason: g.reason },
    canAdmin: admin,
    tasks: taskList(),
    fake,
    problem,
    settings: admin ? (s satisfies BmoSettingsData) : null,
  };
}

/**
 * The hub's own BMO routes (the settings belong to the hub, so the settings page of a hub must not depend on one
 * of its projects): `GET /api/bmo` and `PUT /api/bmo/settings` without `X-DP-Project`. Only an architect of the
 * hub (the base role, not a role in one project) may change or see the settings; the status says what the caller's
 * base role may run. The same file as the projects use (`<hub>/.dp/bmo.json`).
 */
export function registerHubBmo(app: Hono, hub: HubCtx, credentials: CredentialStore, fake: boolean): void {
  const root = hub.dir;
  const admin = (c: Context): boolean => {
    const w = whoOf(hub, c);
    return decide("admin", w, "main") === null && (!w.user || hub.auth.baseRole(w.user.name) === "architect");
  };
  const status = (c: Context): BmoStatus => {
    const { s, problem } = settingsOf(root);
    const role = whoOf(hub, c).role;
    // With a plugged-in backend (tests) the provider checks are skipped, as in a project; the role list still applies.
    const g = fake
      ? allowedRolesFor(s).includes(role)
        ? { ok: true as const }
        : { ok: false as const, reason: `BMO is not open to the ${role} role here.` }
      : problem
        ? { ok: false as const, reason: problem }
        : canRun(s, credentials, role);
    return statusFor(s, problem, credentials, g, admin(c), fake);
  };
  // With `X-DP-Project` the request is one project's (its role list applies): the project answers it.
  const forProject = (c: Context): boolean => !!c.req.header("x-dp-project")?.trim();
  app.get("/api/bmo", async (c, next) => (forProject(c) ? next() : c.json(status(c))));
  app.put("/api/bmo/settings", async (c, next) => {
    if (forProject(c)) return next();
    if (!admin(c)) throw new HttpError(403, "The BMO settings are shared by the whole hub: only an architect of the hub (not of one project only) can change them.");
    const b = await objBody(c);
    const { settings: parsed, errors } = parseSettings(b);
    if (!parsed) return c.json({ detail: `The settings are not valid: ${errors.map((e) => `${e.pointer || "/"}: ${e.message}`).join("; ")}`, errors }, 422);
    writeSettings(root, b);
    return c.json(status(c));
  });
}

const KIND_STATUS: Record<BmoError["kind"], number> = { off: 409, refused: 422, "invalid-output": 422, "too-large": 413, backend: 502 };

export function registerBmo(app: Hono, ctx: Ctx): void {
  const { project, drafts, disk, sel, who } = ctx;
  /** Settings and the run log live next to the credentials: the hub folder in a hub, the project folder otherwise. */
  const root = ctx.credentials.root;
  const dpDir = path.join(path.resolve(root), ".dp");

  const settings = (): { s: BmoSettings; problem: string | null } => settingsOf(root);

  /** May the caller run BMO now? A plugged-in backend (tests) skips the provider checks but not the role. */
  const gate = (c: Context, s: BmoSettings, problem: string | null): { ok: true } | { ok: false; status: 403 | 409; reason: string } => {
    const role = who(c).role;
    if (!allowedRolesFor(s, ctx.projectId ?? undefined).includes(role)) return { ok: false, status: 403, reason: `BMO is not open to the ${role} role here.` };
    if (ctx.bmoBackend) return { ok: true };
    if (problem) return { ok: false, status: 409, reason: problem };
    const r = canRun(s, ctx.credentials, role, ctx.projectId ?? undefined);
    return r.ok ? r : { ok: false, status: 409, reason: r.reason };
  };

  const canAdmin = (c: Context): boolean => decide("admin", who(c), "main") === null && hubArchitect(c) === null;

  /** In a hub the settings are shared by every project: being an architect of one project is not enough. */
  const hubArchitect = (c: Context): string | null => {
    if (!ctx.projectId) return null;
    const name = who(c).user?.name;
    if (!name) return null; // sign-in is off: the one local user
    return ctx.auth.baseRole(name) === "architect" ? null : "The BMO settings are shared by the whole hub: only an architect of the hub (not of one project only) can change them.";
  };

  const statusOf = (c: Context): BmoStatus => {
    const { s, problem } = settings();
    const g = gate(c, s, problem);
    return statusFor(s, problem, ctx.credentials, g, canAdmin(c), !!ctx.bmoBackend, ctx.projectId ?? undefined);
  };

  app.get("/api/bmo", (c) => c.json(statusOf(c)));

  app.put("/api/bmo/settings", async (c) => {
    const why = hubArchitect(c);
    if (why) throw new HttpError(403, why);
    const b = await objBody(c);
    const { settings: parsed, errors } = parseSettings(b);
    if (!parsed) return c.json({ detail: `The settings are not valid: ${errors.map((e) => `${e.pointer || "/"}: ${e.message}`).join("; ")}`, errors }, 422);
    writeSettings(root, b);
    return c.json(statusOf(c));
  });

  // ---------------------------------------------------------------- preview and run

  const env = (): BmoEnv => {
    const s = sel();
    return { project, drafts, disk, view: { src: s.src, ref: s.ref, code: s.code } };
  };

  /** Rights beyond `bmo.run` that this task needs (see the file header); throws 403 / 422. */
  const needRights = (c: Context, selectors: Selectors): void => {
    const effect = EFFECT[selectors.task];
    const w = who(c);
    if (effect === "new-draft") {
      const why = decide("draft.create", w, "main");
      if (why) throw new HttpError(403, `${why} This task makes a draft. ${HANDOFF_HINT}`);
    } else if (effect === "edit-draft") {
      const { ref } = sel();
      if (!ref.startsWith("draft:")) throw new HttpError(422, "This task writes into a draft: select one first (header X-DP-Model: draft:<id>).");
      const why = decide("edit", w, ref, drafts.info(ctx.draftId(ref)).author ?? null);
      if (why) throw new HttpError(403, `${why} This task writes a proposed decision into the draft.`);
    }
  };

  /** Everything before a prompt is built: the selectors, then the settings gate, then the draft rights. */
  const prepare = (c: Context, body: unknown, extra: readonly string[]): { selectors: Selectors; s: BmoSettings; plan: Planned } => {
    const selectors = parseSelectors(body, extra);
    const { s, problem } = settings();
    const g = gate(c, s, problem);
    if (!g.ok) throw new HttpError(g.status, g.reason);
    needRights(c, selectors);
    // The budget caps the digest; a prompt over runTokenLimit(budget) is refused as too large (settings.ts).
    const plan = planTask(env(), selectors, s.passBudgetTokens);
    return { selectors, s, plan };
  };

  const backendFor = (s: BmoSettings): Backend => {
    if (ctx.bmoBackend) return ctx.bmoBackend;
    // The server's own fetch (tests stub it); the key goes only to the settings' host (providerBackend.ts).
    const doFetch: DirectFetch = async (url, init) => {
      const r = await ctx.fetch(url, init);
      const headers = (r as { headers?: { get(name: string): string | null } }).headers;
      return { ok: r.ok, status: r.status, ...(headers ? { headers } : {}), text: async () => (r.text ? r.text() : JSON.stringify(await r.json())) };
    };
    return directBackend(s, ctx.credentials, { fetch: doFetch });
  };

  /** BmoError and a refused build as JSON answers with the right status. */
  const fail = (c: Context, e: unknown): Response => {
    if (e instanceof StalePreview) return c.json({ detail: e.message }, 409);
    if (e instanceof BmoInvalid) return c.json({ detail: e.message, errors: e.errors, pasteBack: e.pasteBack, warnings: e.warnings } satisfies BmoRunFailure, 422);
    if (e instanceof BmoError) return c.json({ detail: e.message }, KIND_STATUS[e.kind] as 409);
    throw e;
  };

  app.post("/api/bmo/preview", async (c) => {
    const { s, plan } = prepare(c, await objBody(c), []);
    try {
      return c.json(previewOf(plan, s, destinationOf(s, ctx.bmoBackend)) satisfies BmoPreview);
    } catch (e) {
      return fail(c, asBmoError(e));
    }
  });

  app.post("/api/bmo/run", async (c) => {
    const b = await objBody(c);
    const hash = b.hash;
    if (typeof hash !== "string" || !hash) throw new HttpError(422, '"hash" is required: preview the task first and send the hash it returned.');
    const { s, plan } = prepare(c, b, ["hash"]);
    try {
      const w = who(c);
      const result = await runBmo(
        { env: env(), settings: s, backend: backendFor(s), dest: destinationOf(s, ctx.bmoBackend), dpDir, who: w.user?.name ?? null, author: w.user?.name, signal: c.req.raw.signal },
        plan,
        hash,
      );
      return c.json(result satisfies BmoRunResult);
    } catch (e) {
      return fail(c, e);
    }
  });
}
