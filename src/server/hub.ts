/**
 * A hub of projects (DEC-053): `dp serve --hub DIR` serves several project folders from one server.
 *
 *   DIR/hub.json            {"version": 1, "name": "...", "catalog": "catalog", "projects": [{"id", "path", "name"?}]}
 *   DIR/catalog/            the shared catalog: a normal project folder (H4)
 *   DIR/.dp/users.json      one sign-in for every project (optional)
 *   DIR/.dp/credentials.json  integration credentials (H5)
 *
 * Each project is served by its own app (`buildApp`, unchanged route modules), built on first use.
 * This app answers sign-in, the hub-level routes and the UI itself, and passes every other API
 * request to the project named by the `X-DP-Project` header. The sign-in is shared, so one session
 * covers every project. A project folder may not contain the hub folder or another project, so no
 * project's code routes can reach `hub.json`, the catalog or another project's model.
 */

import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { isObj, stableJson } from "../core/json.js";
import { ModelError } from "../core/ops.js";
import { checkProject, type CheckResult } from "../core/report.js";
import { atomicWrite, DEMO_DIR, initProject, NotFound, Project } from "../core/store.js";
import { Auth } from "./auth.js";
import { buildApp, onError } from "./app.js";
import type { AppOptions, Ctx } from "./context.js";
import { installProtection } from "./protect.js";
import { registerHub, needAdmin, type HubCtx, type HubEntry } from "./routes/hub.js";
import { registerUi } from "./routes/ui.js";
import { registerCredentials } from "./routes/credentials.js";
import { HttpError, objBody } from "./context.js";

export const HUB_FILE = "hub.json";
export const CATALOG_ID = "catalog";
const ID_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;

export class HubError extends Error {}

export interface HubFile {
  version: 1;
  name: string;
  /** Folder of the shared catalog, relative to the hub (null: no catalog). */
  catalog: string | null;
  projects: { id: string; path: string; name?: string }[];
}

const inside = (parent: string, child: string) => {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

/** Read and check `hub.json`. Paths are resolved against the hub folder. */
export function readHubFile(dir: string): HubFile {
  const file = path.join(dir, HUB_FILE);
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (e) {
    throw new HubError(fs.existsSync(file) ? `${file} is not valid JSON: ${(e as Error).message}` : `There is no ${HUB_FILE} in ${dir}. Create one with \`dp init --hub ${dir}\`.`);
  }
  return checkHub(dir, raw, file);
}

/** Check a hub file's content (`raw`, as parsed) against the folder `dir`; `file` names it in messages. */
export function checkHub(dir: string, raw: unknown, file = path.join(dir, HUB_FILE)): HubFile {
  if (!isObj(raw)) throw new HubError(`${file} must hold a JSON object.`);
  const projects = Array.isArray(raw.projects) ? raw.projects : null;
  if (!projects) throw new HubError(`${file} needs a "projects" list.`);
  const out: HubFile = { version: 1, name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : path.basename(path.resolve(dir)), catalog: null, projects: [] };
  if (raw.catalog !== undefined && raw.catalog !== null) {
    if (typeof raw.catalog !== "string" || !raw.catalog.trim()) throw new HubError(`"catalog" in ${file} must be a folder name or null.`);
    out.catalog = raw.catalog.trim();
  }
  const ids = new Set<string>();
  for (const [i, p] of projects.entries()) {
    if (!isObj(p) || typeof p.id !== "string" || typeof p.path !== "string") throw new HubError(`Project ${i + 1} in ${file} needs "id" and "path".`);
    if (!ID_RE.test(p.id)) throw new HubError(`Project ID "${p.id}" in ${file}: use lower-case letters, digits and dashes.`);
    if (p.id === CATALOG_ID) throw new HubError(`The project ID "${CATALOG_ID}" is kept for the shared catalog.`);
    if (ids.has(p.id)) throw new HubError(`Two projects in ${file} have the ID "${p.id}".`);
    ids.add(p.id);
    out.projects.push({ id: p.id, path: p.path, ...(typeof p.name === "string" && p.name.trim() ? { name: p.name.trim() } : {}) });
  }
  // Folders: none may hold the hub folder or another project (code routes of one could then write the other).
  const roots = [...out.projects.map((p) => ({ id: p.id, root: path.resolve(dir, p.path) })), ...(out.catalog ? [{ id: CATALOG_ID, root: path.resolve(dir, out.catalog) }] : [])];
  const hub = path.resolve(dir);
  for (const a of roots) {
    if (inside(a.root, hub)) throw new HubError(`Project "${a.id}" (${a.root}) holds the hub folder; give it a folder of its own.`);
    for (const b of roots) if (a !== b && inside(a.root, b.root)) throw new HubError(`Project "${a.id}" holds the folder of project "${b.id}"; projects need separate folders.`);
  }
  return out;
}

export function writeHubFile(dir: string, hub: HubFile): void {
  atomicWrite(path.join(dir, HUB_FILE), stableJson({ version: 1, name: hub.name, catalog: hub.catalog, projects: hub.projects }));
}

/** Create a hub folder: `hub.json`, an empty catalog, and (with `demo`) the demo hub's projects. */
export function initHub(dir: string, opts: { name?: string | null; demo?: boolean; copyDemo?: (dir: string) => void } = {}): string {
  const file = path.join(dir, HUB_FILE);
  if (fs.existsSync(file)) throw new HubError(`${file} already exists.`);
  fs.mkdirSync(dir, { recursive: true });
  if (opts.demo && opts.copyDemo) {
    opts.copyDemo(dir);
    return file;
  }
  writeHubFile(dir, { version: 1, name: opts.name || path.basename(path.resolve(dir)), catalog: CATALOG_ID, projects: [] });
  initProject(path.join(dir, CATALOG_ID), { name: "Shared catalog" });
  return file;
}

/** The hub as the hub-level routes see it, plus the project apps. */
export class Hub {
  readonly dir: string;
  private file!: HubFile;
  private stamp = "";
  private apps = new Map<string, { root: string; app: Hono; ctx: Ctx }>();

  constructor(
    dir: string,
    private readonly opts: AppOptions,
    readonly auth: Auth,
  ) {
    this.dir = path.resolve(dir);
    this.reload();
  }

  /** `hub.json` again when it changed on disk. A broken file keeps the last good one (and is logged). */
  private reload(): void {
    let st = "-";
    try {
      const s = fs.statSync(path.join(this.dir, HUB_FILE));
      st = `${s.mtimeMs}:${s.size}`;
    } catch {
      /* missing: readHubFile says so */
    }
    if (st === this.stamp) return;
    try {
      this.file = readHubFile(this.dir);
      this.stamp = st;
    } catch (e) {
      if (!this.file) throw e;
      console.error(`Keeping the previous hub.json: ${(e as Error).message}`);
      this.stamp = st;
    }
  }

  get name(): string {
    this.reload();
    return this.file.name;
  }

  get catalogId(): string | null {
    this.reload();
    return this.file.catalog ? CATALOG_ID : null;
  }

  entries(): HubEntry[] {
    this.reload();
    const list: HubEntry[] = this.file.projects.map((p) => ({ id: p.id, name: p.name ?? "", path: p.path, catalog: false, ctx: () => this.load(p.id, path.resolve(this.dir, p.path)).ctx }));
    if (this.file.catalog) {
      const root = path.resolve(this.dir, this.file.catalog);
      list.push({ id: CATALOG_ID, name: "Shared catalog", path: this.file.catalog, catalog: true, ctx: () => this.load(CATALOG_ID, root).ctx });
    }
    return list;
  }

  /** The project's app (built on first use; again if its folder in hub.json changed). */
  load(id: string, root: string): { app: Hono; ctx: Ctx } {
    const hit = this.apps.get(id);
    if (hit && hit.root === root) return hit;
    // Each project keeps its own code folder (its own root), traces folder and comments.
    const catalog = id === CATALOG_ID ? () => null : () => this.catalogWorkspace();
    const built = buildApp(root, { ...this.opts, codeRoot: null, tracesDir: null, usersFile: null, auth: this.auth, hub: true, catalog });
    const entry = { root, ...built };
    this.apps.set(id, entry);
    return entry;
  }

  /** The catalog's main model (null: no catalog, or it cannot be loaded). */
  catalogWorkspace() {
    this.reload();
    if (!this.file.catalog) return null;
    try {
      const p = this.load(CATALOG_ID, path.resolve(this.dir, this.file.catalog)).ctx.project;
      p.reloadIfChanged();
      return p.workspace;
    } catch {
      return null;
    }
  }

  app(id: string): Hono {
    const e = this.entries().find((x) => x.id === id);
    if (!e) throw new NotFound(`No project "${id}" in this hub.`);
    const root = e.catalog ? path.resolve(this.dir, this.file.catalog!) : path.resolve(this.dir, e.path);
    return this.load(id, root).app;
  }

  /** Add a project folder (a new empty or demo model) and list it in hub.json. */
  addProject(id: string, name: string, folder: string | null, template: "empty" | "demo"): void {
    this.reload();
    if (!ID_RE.test(id)) throw new ModelError("A project ID uses lower-case letters, digits and dashes, and starts with a letter or digit.");
    if (id === CATALOG_ID || this.file.projects.some((p) => p.id === id)) throw new ModelError(`There is already a project "${id}".`);
    const rel = folder?.trim() || id;
    const next: HubFile = { ...this.file, projects: [...this.file.projects, { id, path: rel, ...(name.trim() ? { name: name.trim() } : {}) }] };
    // Check the new layout before touching the disk.
    try {
      checkHub(this.dir, next);
    } catch (e) {
      if (e instanceof HubError) throw new ModelError(e.message);
      throw e;
    }
    const root = path.resolve(this.dir, rel);
    if (!fs.existsSync(path.join(root, "architecture", "workspace.json"))) initProject(root, { demo: template === "demo", name: name.trim() || id });
    writeHubFile(this.dir, next);
    this.reload();
  }
}

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/** The hub's app: sign-in, hub routes and the UI here; project routes passed on by `X-DP-Project`. */
export function createHubApp(dir: string, opts: AppOptions = {}): { app: Hono; hub: Hub } {
  const hubDir = path.resolve(dir);
  const readOnly = opts.readOnly ?? false;
  const auth = new Auth(hubDir, { usersFile: opts.usersFile, readOnly, codeRoot: hubDir, now: opts.now, limits: opts.authLimits });
  const hub = new Hub(hubDir, opts, auth);
  const app = new Hono();
  onError(app);
  installProtection(app, { allowedHosts: opts.allowedHosts });
  app.use("/api/*", auth.authenticate);
  auth.register(app);

  const hubCtx: HubCtx = {
    mode: "hub",
    name: () => hub.name,
    dir: hubDir,
    auth,
    readOnly,
    entries: () => hub.entries(),
    get catalogId() {
      return hub.catalogId;
    },
  };
  registerHub(app, hubCtx);
  registerCredentials(app, hubCtx, opts.secretKey);

  app.post("/api/hub/projects", async (c) => {
    needAdmin(hubCtx, c);
    const b = await objBody(c);
    const id = typeof b.id === "string" ? b.id.trim() : "";
    const template = b.template === "demo" ? "demo" : "empty";
    hub.addProject(id, typeof b.name === "string" ? b.name : "", typeof b.path === "string" ? b.path : null, template);
    return c.json({ id });
  });

  // Everything else under /api/ belongs to one project.
  app.all("/api/*", async (c) => {
    const id = c.req.header("x-dp-project")?.trim();
    if (!id) throw new HttpError(422, "This server serves several projects: say which one with the X-DP-Project header.");
    const target = hub.app(id);
    const req = c.req.raw;
    const body = SAFE.has(req.method) ? undefined : await c.req.text();
    return target.fetch(new Request(req.url, { method: req.method, headers: req.headers, body }), c.env);
  });

  registerUi(app);
  return { app, hub };
}

/** The demo hub (`demo/hub/`): copied into a new hub folder, never over existing files. */
export function copyDemoHub(dir: string): void {
  const src = path.join(DEMO_DIR, "hub");
  if (!fs.existsSync(path.join(src, HUB_FILE))) throw new HubError("This installation has no demo hub.");
  fs.cpSync(src, dir, { recursive: true, force: false, errorOnExist: false });
}

/** `dp check --hub`: every project and the catalog, each message prefixed with the project. */
export function checkHubFolder(dir: string): CheckResult {
  const file = readHubFile(dir);
  const errors: string[] = [];
  const warnings: string[] = [];
  const roots = [...file.projects.map((p) => [p.id, path.resolve(dir, p.path)] as const), ...(file.catalog ? [[CATALOG_ID, path.resolve(dir, file.catalog)] as const] : [])];
  for (const [id, root] of roots) {
    try {
      const r = checkProject(new Project(root));
      errors.push(...r.errors.map((e) => `[${id}] ${e}`));
      warnings.push(...r.warnings.map((w) => `[${id}] ${w}`));
    } catch (e) {
      errors.push(`[${id}] The model cannot be loaded: ${(e as Error).message}`);
    }
  }
  return { errors, warnings };
}
