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
import { asBmoError, BmoError, type Backend } from "../../bmo/backend.js";
import { directBackend, type DirectFetch } from "../../bmo/direct.js";
import { BmoInvalid, destinationOf, EFFECT, parseSelectors, planTask, previewOf, runBmo, StalePreview, taskList, type BmoEnv, type Planned, type Selectors } from "../../bmo/service.js";
import { allowedRolesFor, canRun, defaultSettings, parseSettings, publicStatus, readSettings, writeSettings, type BmoSettings } from "../../bmo/settings.js";
import { ModelError } from "../../core/ops.js";
import type { BmoPreview, BmoRunFailure, BmoRunResult, BmoSettingsData, BmoStatus } from "../../shared/types.js";
import { decide } from "../auth.js";
import { HttpError, objBody, type Ctx } from "../context.js";

/** Where the plain-language refusals of a draft task point: the handoff, which needs no model call. */
const HANDOFF_HINT = "BMO can still write the prompt for you to run in your own coding agent (the Import page, or dp scan --prompt); the result comes back through the import file.";

const KIND_STATUS: Record<BmoError["kind"], number> = { off: 409, refused: 422, "invalid-output": 422, "too-large": 413, backend: 502 };

export function registerBmo(app: Hono, ctx: Ctx): void {
  const { project, drafts, disk, sel, who } = ctx;
  /** Settings and the run log live next to the credentials: the hub folder in a hub, the project folder otherwise. */
  const root = ctx.credentials.root;
  const dpDir = path.join(path.resolve(root), ".dp");

  /** The settings; a file that cannot be read gives the defaults and says why (`problem`). */
  const settings = (): { s: BmoSettings; problem: string | null } => {
    try {
      return { s: readSettings(root), problem: null };
    } catch (e) {
      if (e instanceof ModelError) return { s: defaultSettings(), problem: e.message };
      throw e;
    }
  };

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
    const admin = canAdmin(c);
    return {
      ...publicStatus(s, ctx.credentials, ctx.projectId ?? undefined),
      canRun: g.ok ? { ok: true } : { ok: false, reason: g.reason },
      canAdmin: admin,
      tasks: taskList(),
      fake: !!ctx.bmoBackend,
      problem,
      settings: admin ? (s satisfies BmoSettingsData) : null,
    };
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
    // A prompt over this size is refused as too large (the digest is cut at the budget; the rest is the fixed text and the model).
    const plan = planTask(env(), selectors, Math.ceil(s.passBudgetTokens * 1.5));
    return { selectors, s, plan };
  };

  const backendFor = (s: BmoSettings): Backend => {
    if (ctx.bmoBackend) return ctx.bmoBackend;
    // The server's own fetch (tests stub it); the key goes only to the settings' host (direct.ts).
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
