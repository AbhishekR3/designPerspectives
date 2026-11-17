/** Hub-level routes (DEC-053, DEC-054): what the server serves and the home page summary, plus the integration
 *  credentials (DEC-056). The same routes answer for a single project (`dp serve PATH`) and for a hub (`dp serve --hub DIR`). */

import type { Context, Hono } from "hono";
import { CredentialStore } from "../../core/credentials.js";
import type { IntegrationsStore } from "../../core/integrations.js";
import { catalogEntries, sharedUsage } from "../../core/catalog.js";
import { homeSummary, type HomeProject } from "../../core/homeSummary.js";
import { history, uncommitted } from "../../core/history.js";
import type { GitModels } from "../../core/git.js";
import type { Project } from "../../core/project.js";
import type { CatalogUpdate, HistoryList, HomeSummary, HubInfo, HubWorkList, AttentionItem, SharedUsage } from "../../shared/types.js";
import { listWork } from "../../core/work.js";
import { WORK_STATUSES, WORK_TYPES } from "../../core/modelEdits.js";
import { isOpenWork } from "../../shared/workLinks.js";
import { decide, type Who } from "../auth.js";
import type { Auth } from "../auth.js";
import type { Ctx } from "../routeContext.js";
import { HttpError, objBody } from "../routeContext.js";

/** One project of the hub; `ctx()` builds it on first use and throws when its model cannot be loaded. */
export interface HubEntry {
  id: string;
  name: string;
  path: string;
  catalog: boolean;
  ctx(): Ctx;
}

export interface HubCtx {
  mode: "single" | "hub";
  name(): string;
  /** The hub folder, or the single project's folder. */
  dir: string;
  auth: Auth;
  readOnly: boolean;
  entries(): HubEntry[];
  catalogId: string | null;
  /** Hub: copy catalog changes into every project first (DEC-057). */
  sync?(): void;
  /** Hub: catalog changes copied into projects, newest first. */
  updates?(): CatalogUpdate[];
}

/** The projects the request's user may see (DEC-060): all of them, except where their role is "none". */
export function visibleEntries(hub: HubCtx, c: Context): HubEntry[] {
  if (hub.mode !== "hub") return hub.entries();
  const name = whoOf(hub, c).user?.name;
  return hub.entries().filter((e) => hub.auth.canSee(name, e.id));
}

/** Every loadable project's main model that the user may see; the catalog's definitions are used either way. */
function usageOf(hub: HubCtx, c: Context): SharedUsage {
  const projects: { id: string; ws: import("../../core/workspace.js").Workspace }[] = [];
  let catalog = null;
  const seen = new Set(visibleEntries(hub, c).map((e) => e.id));
  for (const e of hub.entries()) {
    if (!e.catalog && !seen.has(e.id)) continue;
    try {
      const p = e.ctx().project;
      p.reloadIfChanged();
      if (e.catalog) catalog = p.workspace;
      else projects.push({ id: e.id, ws: p.workspace });
    } catch {
      /* a project that cannot load is reported on its card */
    }
  }
  return sharedUsage(projects, catalog);
}

/** "Needs attention" items and the home page's numbers from the shared usage. */
export function usageAttention(u: SharedUsage): { attention: AttentionItem[]; shared: HomeSummary["shared"] } {
  const attention: AttentionItem[] = [];
  for (const m of u.missing)
    attention.push({
      kind: "catalog-missing",
      severity: "error",
      project: m.project,
      text: `"${m.name}" is a copy of the catalog element "${m.catalogId}", which no longer exists`,
      target: { type: "element", id: m.elementId },
    });
  for (const d of u.drift)
    attention.push({
      kind: "catalog-drift",
      severity: "warn",
      project: d.project,
      text: `"${d.name}" differs from the shared catalog (${d.fields.join(", ")}): update it from the catalog`,
      target: { type: "element", id: d.elementId },
    });
  for (const a of u.assets.filter((x) => x.flags.includes("several-writers"))) {
    const who = [...new Set(a.access.filter((x) => x.mode === "write").map((x) => x.project))];
    attention.push({
      kind: "multi-writer",
      severity: "warn",
      project: who[0] ?? "",
      text: `${a.kind[0]!.toUpperCase()}${a.kind.slice(1)} "${a.name}" in ${a.holder.name} is written by ${who.length} projects: ${who.join(", ")}`,
      target: { type: "catalog", id: a.key },
    });
  }
  for (const x of u.unknown)
    attention.push({ kind: "unknown-asset", severity: "info", project: x.project, text: `A relationship uses "${x.asset}", which ${x.holder} does not list as its data`, target: null });
  const shared =
    u.mode === "hub"
      ? {
          elements: u.elements.length,
          linkedCopies: u.elements.reduce((n, e) => n + e.usedBy.length, 0),
          assets: u.assets.length,
          sharedAssets: u.assets.filter((a) => a.flags.includes("used-by-several")).length,
          multiWriter: u.assets.filter((a) => a.flags.includes("several-writers")).length,
        }
      : null;
  return { attention, shared };
}

export function whoOf(hub: HubCtx, c: Context): Who {
  return c.get("dpWho") ?? { user: null, role: hub.readOnly ? "viewer" : "architect", loginRequired: false, readOnlyServer: hub.readOnly };
}

/** 403 unless the request may do hub administration (architects; everyone when sign-in is off). */
export function needAdmin(hub: HubCtx, c: Context): void {
  const why = decide("admin", whoOf(hub, c), "main");
  if (why) throw new HttpError(403, why);
}

export function hubInfo(hub: HubCtx, c: Context): HubInfo {
  const who = whoOf(hub, c);
  return {
    mode: hub.mode,
    name: hub.name(),
    catalog: hub.catalogId,
    canAdmin: decide("admin", who, "main") === null,
    loginRequired: who.loginRequired,
    me: who.user,
    readOnly: !!who.readOnlyServer,
    projects: visibleEntries(hub, c).map((e) => {
      const r = who.user && !who.readOnlyServer ? (hub.mode === "hub" ? (hub.auth.roleIn(who.user.name, e.id) ?? who.role) : who.role) : who.user ? "viewer" : null;
      const role = r === "none" ? null : r; // not listed (visibleEntries); narrows the type
      try {
        const ws = e.ctx().project.workspace;
        return { id: e.id, name: e.name || ws.name, description: ws.description || "", path: e.path, error: null, catalog: e.catalog, role };
      } catch (err) {
        return { id: e.id, name: e.name || e.id, description: "", path: e.path, error: (err as Error).message, catalog: e.catalog, role };
      }
    }),
  };
}

export function registerHub(app: Hono, hub: HubCtx): void {
  app.get("/api/hub", (c) => {
    hub.sync?.();
    return c.json(hubInfo(hub, c));
  });

  app.get("/api/home", (c) => {
    const projects: HomeProject[] = visibleEntries(hub, c).map((e) => ({
      id: e.id,
      name: e.name,
      catalog: e.catalog,
      load: () => {
        const x = e.ctx();
        return { project: x.project, drafts: x.drafts };
      },
    }));
    // In a hub, the catalog's own card comes last and its problems show like any project's.
    hub.sync?.();
    const seen = new Set(projects.map((p) => p.id));
    const catalogUpdates = (hub.updates?.() ?? [])
      .map((u) => ({ ...u, projects: u.projects.filter((p) => seen.has(p.project)) }))
      .filter((u) => u.projects.length)
      .slice(0, 10);
    return c.json(homeSummary(hub.name(), hub.mode, projects, { ...usageAttention(usageOf(hub, c)), catalogUpdates }));
  });

  /** The shared catalog's elements (empty without a catalog), for "add from the catalog" and "link". */
  app.get("/api/catalog", (c) => {
    const cat = hub.entries().find((e) => e.catalog);
    return c.json(cat ? catalogEntries(cat.ctx().project.workspace) : []);
  });

  /** Git history of the projects' models (DEC-058): `?project=<id>` for one, `?limit=` (default 20, at most 100). */
  app.get("/api/history", (c) => {
    const want = c.req.query("project") || null;
    const limit = Math.max(1, Math.min(100, Number(c.req.query("limit")) || 20));
    const list: { id: string; project: Project; models: GitModels }[] = [];
    for (const e of visibleEntries(hub, c)) {
      if (want && e.id !== want) continue;
      try {
        const x = e.ctx();
        list.push({ id: e.id, project: x.project, models: x.gitModels });
      } catch {
        /* cannot be loaded */
      }
    }
    if (want && !list.length) throw new HttpError(404, `No project "${want}".`);
    return c.json({
      projects: list.map((p) => ({ project: p.id, git: !!p.models.get(), uncommitted: uncommitted(p.project, p.models) })),
      commits: history(list, limit),
    } satisfies HistoryList);
  });

  /** Who uses which shared element and which data, across the projects (one project when not a hub). */
  app.get("/api/catalog/usage", (c) => {
    hub.sync?.();
    return c.json(usageOf(hub, c));
  });
}

/** Integration credentials (DEC-056): architects list, add, rotate, edit and remove them. Values are write-only. */
export function registerCredentials(app: Hono, hub: HubCtx, secret?: string | null): void {
  const store = new CredentialStore(hub.dir, secret === undefined ? (process.env.DP_SECRET_KEY ?? null) : secret);
  const name = (n: string) => decodeURIComponent(n);

  app.get("/api/credentials", (c) => {
    needAdmin(hub, c);
    return c.json(store.list());
  });
  app.post("/api/credentials", async (c) => {
    needAdmin(hub, c);
    store.add(await objBody(c));
    return c.json({ ok: true });
  });
  app.put("/api/credentials/:name", async (c) => {
    needAdmin(hub, c);
    store.rotate(name(c.req.param("name")), (await objBody(c)).value);
    return c.json({ ok: true });
  });
  app.patch("/api/credentials/:name", async (c) => {
    needAdmin(hub, c);
    store.update(name(c.req.param("name")), await objBody(c));
    return c.json({ ok: true });
  });
  app.delete("/api/credentials/:name", (c) => {
    needAdmin(hub, c);
    store.remove(name(c.req.param("name")));
    return c.json({ ok: true });
  });
}

/** Linked work of every project the user may see, from each main model (DEC-088): the rows of the hub's Work
 *  page. A project that cannot be loaded is listed with its error and no rows. */
export function hubWork(hub: HubCtx, c: Context, store: IntegrationsStore): HubWorkList {
  const connections = store.infos();
  const out: HubWorkList = { projects: [], rows: [], connections, types: WORK_TYPES.map(([id, label]) => ({ id, label })), statuses: [...WORK_STATUSES] };
  for (const e of visibleEntries(hub, c)) {
    try {
      const p = e.ctx().project;
      p.reloadIfChanged();
      const { rows } = listWork(p.workspace, connections);
      out.projects.push({ id: e.id, name: e.name || p.workspace.name, catalog: e.catalog, error: null, open: rows.filter((r) => isOpenWork(r.item)).length, total: rows.length });
      for (const r of rows) out.rows.push({ ...r, project: e.id });
    } catch (err) {
      out.projects.push({ id: e.id, name: e.name || e.id, catalog: e.catalog, error: (err as Error).message, open: 0, total: 0 });
    }
  }
  return out;
}

/** Tool connections for linked work (DEC-085): architects list, replace and remove them. They name credentials
 *  by name only; a value never leaves the server. Kept in `.dp/integrations.json` of the hub (or the project).
 *  Also the hub's list of linked work (`GET /api/hub/work`, everyone), which labels links by these connections. */
export function registerIntegrations(app: Hono, hub: HubCtx, store: IntegrationsStore): void {
  app.get("/api/hub/work", (c) => {
    hub.sync?.();
    return c.json(hubWork(hub, c, store));
  });
  app.get("/api/integrations", (c) => {
    needAdmin(hub, c);
    return c.json(store.settings());
  });
  app.put("/api/integrations", async (c) => {
    needAdmin(hub, c);
    store.replace((await objBody(c)).connections);
    return c.json(store.settings());
  });
  app.delete("/api/integrations/:id", (c) => {
    needAdmin(hub, c);
    store.remove(c.req.param("id"));
    return c.json(store.settings());
  });
}
