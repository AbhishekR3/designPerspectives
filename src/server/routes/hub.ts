/** Hub-level routes (DEC-052, DEC-053): what the server serves and the home page summary. The same
 *  routes answer for a single project (`dp serve PATH`) and for a hub (`dp serve --hub DIR`). */

import type { Context, Hono } from "hono";
import { catalogEntries, sharedUsage } from "../../core/catalog.js";
import { homeSummary, type HomeProject } from "../../core/home.js";
import type { HomeSummary, HubInfo, AttentionItem, SharedUsage } from "../../shared/types.js";
import { decide, type Who } from "../auth.js";
import type { Auth } from "../auth.js";
import type { Ctx } from "../context.js";
import { HttpError } from "../context.js";

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
}

/** Every loadable project's main model (the catalog apart). */
function usageOf(hub: HubCtx): SharedUsage {
  const projects: { id: string; ws: import("../../core/workspace.js").Workspace }[] = [];
  let catalog = null;
  for (const e of hub.entries()) {
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
    projects: hub.entries().map((e) => {
      try {
        const ws = e.ctx().project.workspace;
        return { id: e.id, name: e.name || ws.name, description: ws.description || "", path: e.path, error: null, catalog: e.catalog };
      } catch (err) {
        return { id: e.id, name: e.name || e.id, description: "", path: e.path, error: (err as Error).message, catalog: e.catalog };
      }
    }),
  };
}

export function registerHub(app: Hono, hub: HubCtx): void {
  app.get("/api/hub", (c) => c.json(hubInfo(hub, c)));

  app.get("/api/home", (c) => {
    const projects: HomeProject[] = hub.entries().map((e) => ({
      id: e.id,
      name: e.name,
      catalog: e.catalog,
      load: () => {
        const x = e.ctx();
        return { project: x.project, drafts: x.drafts };
      },
    }));
    // In a hub, the catalog's own card comes last and its problems show like any project's.
    return c.json(homeSummary(hub.name(), hub.mode, projects, usageAttention(usageOf(hub))));
  });

  /** The shared catalog's elements (empty without a catalog), for "add from the catalog" and "link". */
  app.get("/api/catalog", (c) => {
    const cat = hub.entries().find((e) => e.catalog);
    return c.json(cat ? catalogEntries(cat.ctx().project.workspace) : []);
  });

  /** Who uses which shared element and which data, across the projects (one project when not a hub). */
  app.get("/api/catalog/usage", (c) => c.json(usageOf(hub)));
}
