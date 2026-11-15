/** Local web server: a JSON API over the model files, plus the built browser UI. */

import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import * as codemod from "../core/code.js";
import { compareDiagram, diagramOf } from "../core/compare.js";
import * as diagrams from "../core/diagrams.js";
import { diffModels } from "../core/diff.js";
import { ApplyConflict, Drafts } from "../core/drafts.js";
import { codeRel, DiskCode, NO_CODE, type CodeSource } from "../core/codefs.js";
import { currentBranch, GitCodes, GitError, GitModels, listRefs } from "../core/git.js";
import * as flows from "../core/flows.js";
import { isObj, str, type Obj } from "../core/json.js";
import * as ops from "../core/ops.js";
import { buildIndex, elementSummary, ModelError, relationshipSummary, slugify, unique } from "../core/ops.js";
import {
  BUILTIN_LENSES,
  edgeLayoutData,
  emptyLayout,
  lensData,
  makeLens,
  SECTIONS,
  styleData,
  type Sidecar,
} from "../core/sidecar.js";
import { NotFound, Project, staticDir, version, type ModelSource } from "../core/store.js";
import type { Workspace } from "../core/workspace.js";
import type { AppState, ChangeSet, CharacteristicDef, CostBand, CostSettings, EdgeLayout, Lens, Level, Section, Style } from "../shared/types.js";

/** An HTTP error with a status code; the body is {"detail": message}. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** The model version a request works on (header X-DP-Model) and the one it is compared with
 *  (header X-DP-Compare). */
export interface Selection {
  src: ModelSource;
  ref: string;
  title: string;
  cmp: ModelSource | null;
  cmpRef: string | null;
  cmpTitle: string | null;
  /** Where each version reads source files from. */
  code: CodeSource;
  cmpCode: CodeSource | null;
  /** Files the shown draft plans to edit. */
  planned: string[];
}

/** The two code sources of a comparison, for `diffModels`. */
export function codePair(sel: Selection) {
  return sel.cmpCode ? { before: sel.cmpCode, after: sel.code, planned: sel.planned } : undefined;
}

export function state(project: Project, readOnly = false, sel?: Selection, drafts?: Drafts, gitModels?: GitModels): AppState {
  const src = sel?.src ?? project;
  const ws = src.workspace;
  const sc = src.sidecar;
  const editable = src instanceof Project ? src : null;
  const idx = buildIndex(ws);
  return {
    workspace: { name: ws.name, description: ws.description || "" },
    root: project.root,
    elements: [...idx.elements.keys()].map((e) => elementSummary(idx, e)),
    relationships: [...idx.relationships.values()].map(relationshipSummary),
    diagrams: diagrams.diagramList(ws),
    tagGroups: sc.tagGroups.map((g) => ({ name: g.name, values: g.values.map((v) => ({ name: v.name, color: v.color })) })),
    characteristics: sc.characteristics.map((c) => ({ name: c.name, description: c.description })),
    costSettings: { currency: sc.cost.currency, bands: sc.cost.bands.map((b) => ({ name: b.name, max: b.max ?? null, color: b.color })) },
    lenses: [...BUILTIN_LENSES, ...sc.lenses].map((l) => ({ ...lensData(l), defaultOverlay: l.defaultOverlay ?? null, builtin: l.builtin }) as unknown as Lens),
    flows: flows.listFlows(ws),
    loadErrors: src.loadErrors,
    enums: ops.ENUMS,
    technologies: ops.technologyCatalog(idx),
    styles: Object.fromEntries(Object.entries(sc.styles).map(([k, v]) => [k, styleData(v) as Style])),
    canUndo: (editable?.undoStack.length ?? 0) > 0,
    canRedo: (editable?.redoStack.length ?? 0) > 0,
    codeRoot: project.codeRoot,
    sections: [...SECTIONS],
    readOnly: readOnly || src.readOnly,
    model: { ref: sel?.ref ?? "main", title: sel?.title ?? "Main model" },
    drafts: drafts?.list() ?? [],
    git: (() => {
      const repo = gitModels?.get();
      return repo ? { branch: currentBranch(repo), refs: listRefs(repo) } : null;
    })(),
    compare:
      sel?.cmp && sel.cmpRef
        ? { against: sel.cmpRef, title: sel.cmpTitle ?? sel.cmpRef, summary: diffModels(sel.cmp, src, sel.cmpRef, codePair(sel)).summary }
        : null,
  };
}

// ---------------------------------------------------------------- request body helpers

async function body(c: Context): Promise<unknown> {
  const text = await c.req.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(422, "The request body is not valid JSON.");
  }
}

async function objBody(c: Context): Promise<Obj> {
  const b = await body(c);
  if (!isObj(b)) throw new HttpError(422, "The request body must be a JSON object.");
  return b;
}

function needStr(o: Obj, key: string): string {
  if (typeof o[key] !== "string") throw new HttpError(422, `"${key}" is required and must be text.`);
  return o[key] as string;
}

function optStr(o: Obj, key: string): string | null {
  const v = o[key];
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw new HttpError(422, `"${key}" must be text.`);
  return v;
}

function num(v: unknown, what: string): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  if (!Number.isFinite(n)) throw new HttpError(422, `${what} must be a number.`);
  return n;
}

function point(v: unknown, what: string): { x: number; y: number } {
  if (!isObj(v)) throw new HttpError(422, `${what} must be an object with x and y.`);
  return { x: num(v.x, `${what}.x`), y: num(v.y, `${what}.y`) };
}

function strList(v: unknown, what: string): string[] {
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw new HttpError(422, `${what} must be a list of text.`);
  return v as string[];
}

const ROUTINGS = ["straight", "curved", "smooth", "orthogonal", "rounded"];

function edgeLayout(v: unknown): EdgeLayout {
  if (!isObj(v)) throw new HttpError(422, "An edge layout must be an object.");
  const out: Obj = { ...v };
  for (const k of ["sourceAnchor", "targetAnchor", "control"]) {
    if (v[k] === null || v[k] === undefined) delete out[k];
    else out[k] = point(v[k], k);
  }
  for (const k of ["labelT", "labelOffset"]) {
    if (v[k] === null || v[k] === undefined) delete out[k];
    else out[k] = num(v[k], k);
  }
  if (v.routing === null || v.routing === undefined) delete out.routing;
  else if (!ROUTINGS.includes(v.routing as string)) throw new HttpError(422, `Line shape must be one of: ${ROUTINGS.join(", ")}.`);
  return edgeLayoutData(out as EdgeLayout) as EdgeLayout;
}

// ---------------------------------------------------------------- the app

export interface AppOptions {
  codeRoot?: string | null;
  readOnly?: boolean;
  /** Host names (as in the Host header, without the port; IPv6 in brackets) the server answers to.
   *  Default: the loopback names. null turns the check off (a server bound to another interface). */
  allowedHosts?: string[] | null;
}

/** The names a browser uses for a server bound to a loopback address. */
export const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/** Largest request body the API accepts. */
export const MAX_BODY_BYTES = 5 * 1024 * 1024;

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Content-Security-Policy for the built UI (no inline scripts; React sets inline styles). */
const CSP = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", "data:", "blob:"],
  fontSrc: ["'self'", "data:"],
  connectSrc: ["'self'"],
  workerSrc: ["'self'", "blob:"],
  frameAncestors: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
};

/** "host[:port]" as a URL with `protocol` would normalise it (lower case, default port dropped), or null. */
function normHost(host: string, protocol = "http:"): URL | null {
  try {
    return new URL(`${protocol}//${host}`);
  } catch {
    return null;
  }
}

/** The Host the request was sent to (the header; the request URL when there is none, as in tests). */
const requestHost = (c: Context): string => c.req.header("host") ?? new URL(c.req.url).host;

function isJsonType(ct: string | undefined): boolean {
  return (ct ?? "").split(";")[0]!.trim().toLowerCase() === "application/json";
}

export function createApp(root: string, opts: AppOptions = {}): Hono {
  const readOnly = opts.readOnly ?? false;
  const project = new Project(root, opts.codeRoot);
  const drafts = new Drafts(project);
  const gitModels = new GitModels(project.dir);
  const gitCodes = new GitCodes(project.codeRoot);
  const disk = new DiskCode(project.codeRoot);
  const app = new Hono();
  const ok = (c: Context) => c.json({ ok: true });

  // Each request selects a model version; handlers read it from here (requests interleave at
  // `await`, so this cannot be a plain variable).
  const selection = new AsyncLocalStorage<Selection>();
  const sel = (): Selection =>
    selection.getStore() ?? { src: project, ref: "main", title: "Main model", cmp: null, cmpRef: null, cmpTitle: null, code: disk, cmpCode: null, planned: [] };
  const src = () => sel().src;
  const writable = (): Project => {
    const s = src();
    if (!(s instanceof Project)) throw new HttpError(403, "This version of the model is read-only.");
    return s;
  };
  const edit = <T>(fn: (ws: Workspace, sc: Sidecar) => T, record = true) => writable().edit(fn, record);

  const draftId = (ref: string) => ref.slice("draft:".length);
  /** A version's model, title and code. */
  const resolve = (ref: string): [ModelSource, string, CodeSource] => {
    if (ref === "main") return [project, "Main model", disk];
    if (ref.startsWith("draft:")) {
      const id = draftId(ref);
      return [drafts.get(id), `Draft: ${drafts.info(id).title}`, drafts.code(id)];
    }
    if (ref.startsWith("ref:")) {
      const name = ref.slice("ref:".length);
      const snap = gitModels.at(name);
      let code: CodeSource;
      try {
        code = gitCodes.at(name);
      } catch {
        code = NO_CODE; // the code folder is in another repository without that ref
      }
      return [snap, `Git: ${name} (${snap.sha.slice(0, 7)})${snap.present ? "" : ", no model"}`, code];
    }
    throw new HttpError(422, `Unknown model version "${ref}".`);
  };
  const resolveCompare = (ref: string, against: string): [ModelSource, string, CodeSource] => {
    if (against === "base") {
      if (!ref.startsWith("draft:")) throw new HttpError(422, "Only a draft has a base to compare with.");
      // A draft's planned code edits are compared with the code folder as it is now.
      return [drafts.base(draftId(ref)), "Main model when the draft was made", disk];
    }
    return resolve(against);
  };

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

  // ------------------------------------------------------------ request protection

  app.use(
    "*",
    secureHeaders({
      contentSecurityPolicy: CSP,
      xFrameOptions: "DENY",
      referrerPolicy: "no-referrer",
      strictTransportSecurity: false, // plain HTTP on a local port
    }),
  );

  // DNS rebinding: a page on evil.example whose name resolves to 127.0.0.1 sends Host: evil.example.
  const allowedHosts = opts.allowedHosts === undefined ? LOOPBACK_HOSTS : opts.allowedHosts;
  const hostSet = allowedHosts ? new Set(allowedHosts.map((h) => h.toLowerCase())) : null;
  // Names the user added (--allow-host): a proxy in front may rewrite Host, so the page's Origin
  // carries the public name while Host is the local one.
  const extraHosts = new Set([...(hostSet ?? [])].filter((h) => !LOOPBACK_HOSTS.includes(h) && !/^127\./.test(h)));
  if (hostSet) {
    app.use("*", async (c, next) => {
      const name = normHost(requestHost(c))?.hostname;
      if (!name || !hostSet.has(name)) return c.json({ detail: "This server only answers requests addressed to localhost." }, 403);
      await next();
    });
  }

  // Cross-site requests: another site's page must not change the model or the code folder.
  app.use("/api/*", async (c, next) => {
    if (!SAFE_METHODS.has(c.req.method)) {
      if (c.req.header("sec-fetch-site")?.toLowerCase() === "cross-site") {
        return c.json({ detail: "Cross-site requests are not allowed." }, 403);
      }
      const origin = c.req.header("origin");
      if (origin !== undefined) {
        // Same origin: the page's host:port is the one this request was sent to ("null" never is).
        let o: URL | null = null;
        try {
          o = new URL(origin);
        } catch {
          /* "null" or garbage */
        }
        const sameOrigin = o !== null && (o.protocol === "http:" || o.protocol === "https:") && (o.host === normHost(requestHost(c), o.protocol)?.host || extraHosts.has(o.hostname));
        if (!sameOrigin) return c.json({ detail: "Cross-origin requests are not allowed." }, 403);
      }
    }
    await next();
  });

  app.use(
    "/api/*",
    bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.json({ detail: "The request body is too large (over 5 MB)." }, 413) }),
  );

  // A request body must be JSON. A web page can send a text/plain POST without asking first; it
  // cannot send application/json to another origin without a preflight, which this server refuses.
  app.use("/api/*", async (c, next) => {
    if (!SAFE_METHODS.has(c.req.method) && c.req.raw.body) {
      const text = await c.req.text(); // cached: handlers read it again
      if (text.length && !isJsonType(c.req.header("content-type"))) {
        return c.json({ detail: "The request body must be JSON (Content-Type: application/json)." }, 415);
      }
    }
    await next();
  });

  // Viewer role: the model can be read but not changed (and code files cannot be saved).
  app.use("*", async (c, next) => {
    if (readOnly && !["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
      return c.json({ detail: "This server is read-only (viewer role)." }, 403);
    }
    await next();
  });

  app.use("/api/*", async (c, next) => {
    const ref = c.req.header("x-dp-model")?.trim() || "main";
    const [s, title, code] = resolve(ref);
    s.reloadIfChanged();
    const against = c.req.header("x-dp-compare")?.trim() || null;
    let cmp: ModelSource | null = null;
    let cmpTitle: string | null = null;
    let cmpCode: CodeSource | null = null;
    if (against) {
      [cmp, cmpTitle, cmpCode] = resolveCompare(ref, against);
      cmp.reloadIfChanged();
    }
    const planned = ref.startsWith("draft:") ? [...drafts.codePlan(draftId(ref)).files().keys()] : [];
    await selection.run({ src: s, ref, title, cmp, cmpRef: against, cmpTitle, code, cmpCode, planned }, next);
  });

  // ------------------------------------------------------------ read

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

  // ------------------------------------------------------------ drafts

  app.post("/api/drafts", async (c) => {
    const b = await objBody(c);
    return c.json({ id: drafts.create(needStr(b, "title"), optStr(b, "description") ?? "") });
  });

  app.patch("/api/drafts/:id", async (c) => {
    const b = await objBody(c);
    drafts.update(c.req.param("id"), {
      title: optStr(b, "title") ?? undefined,
      description: optStr(b, "description") ?? undefined,
      branch: optStr(b, "branch") ?? undefined,
      link: optStr(b, "link") ?? undefined,
    });
    return ok(c);
  });

  app.delete("/api/drafts/:id", (c) => {
    drafts.remove(c.req.param("id"));
    return ok(c);
  });

  /** The draft's coding plan. ?against=disk (the code folder) or ref:<branch> checks progress. */
  const planTarget = (against: string | undefined): CodeSource | null => {
    if (!against || against === "none") return null;
    if (against === "disk") return disk;
    if (against.startsWith("ref:")) return gitCodes.at(against.slice(4));
    throw new HttpError(422, 'Check against "disk" or "ref:<branch>".');
  };
  app.get("/api/drafts/:id/plan", (c) => c.json(drafts.plan(c.req.param("id"), planTarget(c.req.query("against")))));

  // ?code=0 / {"code": false}: apply the model changes only, not the planned code edits.
  const codeFlag = (v: unknown) => !(v === false || v === "0" || v === "false");
  app.get("/api/drafts/:id/apply-preview", (c) => c.json(drafts.preview(c.req.param("id"), { code: codeFlag(c.req.query("code")) })));

  app.post("/api/drafts/:id/apply", async (c) => {
    const b = await body(c);
    drafts.apply(c.req.param("id"), { code: codeFlag(isObj(b) ? b.code : undefined) });
    return ok(c);
  });

  app.put("/api/diagrams/:key/positions", async (c) => {
    const key = c.req.param("key");
    const b = await objBody(c);
    if (!isObj(b.positions)) throw new HttpError(422, '"positions" is required.');
    const positions: Record<string, { x: number; y: number }> = {};
    for (const [id, p] of Object.entries(b.positions)) positions[id] = point(p, `positions.${id}`);
    // auto=true: boxes placed by the automatic layout; these are not separate undo steps.
    const auto = ["true", "1", "yes", "on"].includes((c.req.query("auto") ?? "").toLowerCase());
    edit((ws) => diagrams.setPositions(ws, key, positions), !auto);
    return ok(c);
  });

  // ------------------------------------------------------------ workspace

  app.patch("/api/workspace", async (c) => {
    const patch = await objBody(c);
    edit((ws) => {
      if ("name" in patch) {
        const name = str(patch.name).trim();
        if (!name) throw new ModelError("The workspace needs a name.");
        ws.name = name;
      }
      if ("description" in patch) ws.description = str(patch.description) || null;
    });
    return ok(c);
  });

  // ------------------------------------------------------------ elements

  app.post("/api/elements", async (c) => {
    const b = await objBody(c);
    const kind = needStr(b, "kind");
    const diagramKey = optStr(b, "diagramKey");
    const position = b.position === null || b.position === undefined ? null : point(b.position, "position");
    const id = edit((ws) => {
      const newId = ops.createElement(ws, {
        kind,
        name: optStr(b, "name"),
        parentId: optStr(b, "parentId"),
        description: optStr(b, "description"),
        technology: b.technology,
        external: Boolean(b.external),
        archType: optStr(b, "archType"),
        uniqueName: Boolean(b.uniqueName),
      });
      if (diagramKey && position) diagrams.setPositions(ws, diagramKey, { [newId]: position });
      return newId;
    });
    return c.json({ id });
  });

  app.patch("/api/elements/:id", async (c) => {
    const patch = await objBody(c);
    edit((ws, sc) => ops.updateElement(ws, sc, c.req.param("id"), patch));
    return ok(c);
  });

  app.delete("/api/elements/:id", (c) => {
    const gone = edit((ws) => ops.deleteElement(ws, c.req.param("id")));
    return c.json({ deleted: [...gone].sort() });
  });

  /** Copy an element; optionally place the copy on a diagram (paste at a point) in the same undo step. */
  app.post("/api/elements/:id/duplicate", async (c) => {
    const raw = await body(c);
    if (raw !== null && !isObj(raw)) throw new HttpError(422, "The request body must be a JSON object.");
    const b: Obj = raw ?? {};
    const diagramKey = optStr(b, "diagramKey");
    const position = b.position === null || b.position === undefined ? null : point(b.position, "position");
    const id = edit((ws, sc) => {
      const newId = ops.duplicateElement(ws, sc, c.req.param("id"));
      if (diagramKey && position) diagrams.setPositions(ws, diagramKey, { [newId]: position });
      return newId;
    });
    return c.json({ id });
  });

  // ------------------------------------------------------------ relationships

  app.post("/api/relationships", async (c) => {
    const b = await objBody(c);
    const spec = {
      sourceId: needStr(b, "sourceId"),
      destinationId: needStr(b, "destinationId"),
      description: optStr(b, "description"),
      technology: b.technology,
      kind: optStr(b, "kind"),
    };
    return c.json({ id: edit((ws) => ops.createRelationship(ws, spec)) });
  });

  app.patch("/api/relationships/:id", async (c) => {
    const patch = await objBody(c);
    edit((ws) => ops.updateRelationship(ws, c.req.param("id"), patch));
    return ok(c);
  });

  app.delete("/api/relationships/:id", (c) => {
    edit((ws) => ops.deleteRelationship(ws, c.req.param("id")));
    return ok(c);
  });

  // ------------------------------------------------------------ tag groups

  interface TagValueIn {
    name: string;
    color: string;
    previousName: string | null;
  }
  const tagGroupIn = (b: Obj): { name: string; values: TagValueIn[] } => {
    const name = needStr(b, "name");
    const values = (Array.isArray(b.values) ? b.values : []).map((v) => {
      if (!isObj(v)) throw new HttpError(422, "Every tag value must be an object.");
      return { name: needStr(v, "name"), color: needStr(v, "color"), previousName: optStr(v, "previousName") };
    });
    return { name, values };
  };
  const groupValues = (values: TagValueIn[]) => values.filter((v) => v.name.trim()).map((v) => ({ name: v.name.trim(), color: v.color }));

  app.post("/api/tag-groups", async (c) => {
    const b = tagGroupIn(await objBody(c));
    edit((_ws, sc) => {
      const name = b.name.trim();
      if (!name) throw new ModelError("A tag group needs a name.");
      if (sc.tagGroups.some((g) => g.name === name)) throw new ModelError(`A tag group named "${name}" already exists.`);
      sc.tagGroups.push({ name, values: groupValues(b.values) });
    });
    return ok(c);
  });

  app.put("/api/tag-groups/:name", async (c) => {
    const name = c.req.param("name");
    const b = tagGroupIn(await objBody(c));
    edit((ws, sc) => {
      const group = sc.tagGroups.find((g) => g.name === name);
      if (!group) throw new ModelError(`No tag group named "${name}".`);
      const newName = b.name.trim();
      if (!newName) throw new ModelError("A tag group needs a name.");
      if (newName !== name) {
        if (sc.tagGroups.some((g) => g.name === newName)) throw new ModelError(`A tag group named "${newName}" already exists.`);
        ops.renameTagGroupEverywhere(ws, sc, name, newName);
      }
      const values = groupValues(b.values);
      const renames = new Map<string, string>();
      for (const v of b.values) if (v.previousName && v.name.trim() && v.previousName !== v.name.trim()) renames.set(v.previousName, v.name.trim());
      ops.rewriteTagValues(ws, newName, renames, new Set(values.map((v) => v.name)));
      group.name = newName;
      group.values = values;
    });
    return ok(c);
  });

  app.delete("/api/tag-groups/:name", (c) => {
    const name = c.req.param("name");
    edit((ws, sc) => {
      if (!sc.tagGroups.some((g) => g.name === name)) throw new ModelError(`No tag group named "${name}".`);
      ops.removeTagGroupEverywhere(ws, sc, name);
      sc.tagGroups = sc.tagGroups.filter((g) => g.name !== name);
    });
    return ok(c);
  });

  // ------------------------------------------------------------ characteristics and cost settings

  /** Replace the list of characteristics. Renames and removals are applied to every rating. */
  app.put("/api/characteristics", async (c) => {
    const b = await body(c);
    if (!Array.isArray(b)) throw new HttpError(422, "Expected a list of characteristics.");
    const rows = b.map((x) => {
      if (!isObj(x)) throw new HttpError(422, "Every characteristic must be an object.");
      return { name: needStr(x, "name"), description: optStr(x, "description") ?? "", previousName: optStr(x, "previousName") };
    });
    edit((ws, sc) => {
      const out: CharacteristicDef[] = [];
      for (const r of rows) {
        const name = r.name.trim();
        if (!name) continue;
        if (out.some((o) => o.name === name)) throw new ModelError(`The characteristic "${name}" is listed twice.`);
        out.push({ name, description: r.description.trim() });
      }
      const renames = new Map<string, string>();
      for (const r of rows) if (r.previousName && r.name.trim() && r.previousName !== r.name.trim()) renames.set(r.previousName, r.name.trim());
      ops.rewriteCharacteristics(ws, renames, new Set(out.map((o) => o.name)));
      sc.characteristics = out;
    });
    return ok(c);
  });

  app.put("/api/cost-settings", async (c) => {
    const b = await objBody(c);
    edit((_ws, sc) => {
      const currency = (typeof b.currency === "string" ? b.currency : "USD").trim() || "USD";
      if (!Array.isArray(b.bands)) throw new ModelError("Cost settings are not valid: bands must be a list.");
      const bands: CostBand[] = b.bands.map((x) => {
        if (!isObj(x) || typeof x.name !== "string" || typeof x.color !== "string") {
          throw new ModelError("Cost settings are not valid: every band needs a name and a colour.");
        }
        const max = x.max === null || x.max === undefined ? null : Number(x.max);
        if (max !== null && !Number.isFinite(max)) throw new ModelError("Cost settings are not valid: band limits must be numbers.");
        return { name: x.name.trim(), max, color: x.color };
      });
      if (!bands.length) throw new ModelError("Cost settings need at least one band.");
      const limits = bands.map((x) => x.max);
      if (limits.slice(0, -1).some((x) => x === null) || limits[limits.length - 1] !== null) {
        throw new ModelError("Only the last cost band can be open-ended, and it must be.");
      }
      const closed = limits.slice(0, -1) as number[];
      if (closed.some((x, i) => i > 0 && x <= closed[i - 1]!)) throw new ModelError("Cost band limits must increase from band to band.");
      if (bands.some((x) => !x.name)) throw new ModelError("Every cost band needs a name.");
      sc.cost = { currency, bands } satisfies CostSettings;
    });
    return ok(c);
  });

  // ------------------------------------------------------------ lenses

  const builtinIds = new Set(BUILTIN_LENSES.map((l) => l.id));
  const lensIn = (b: Obj, id: string): Lens => {
    const name = needStr(b, "name").trim();
    if (!name) throw new ModelError("A lens needs a name.");
    const visibleLevels = (b.visibleLevels === undefined ? ["landscape", "context", "container", "component"] : strList(b.visibleLevels, "visibleLevels")) as Level[];
    if (!visibleLevels.length) throw new ModelError("A lens must show at least one level.");
    return makeLens({
      id,
      name,
      visibleLevels,
      defaultOverlay: optStr(b, "defaultOverlay") || null,
      hiddenTagGroups: b.hiddenTagGroups === undefined ? [] : strList(b.hiddenTagGroups, "hiddenTagGroups"),
      showTechnology: b.showTechnology === undefined ? true : Boolean(b.showTechnology),
      showDescriptions: b.showDescriptions === undefined ? true : Boolean(b.showDescriptions),
      visibleSections: (b.visibleSections === undefined ? [...SECTIONS] : strList(b.visibleSections, "visibleSections")) as Section[],
    });
  };

  app.post("/api/lenses", async (c) => {
    const b = await objBody(c);
    const id = edit((_ws, sc) => {
      const name = needStr(b, "name");
      const lensId = unique(slugify(name), new Set([...sc.lenses.map((l) => l.id), ...builtinIds]));
      if ([...BUILTIN_LENSES, ...sc.lenses].some((l) => l.name === name.trim())) throw new ModelError(`A lens named "${name.trim()}" already exists.`);
      sc.lenses.push(lensIn(b, lensId));
      return lensId;
    });
    return c.json({ id });
  });

  app.put("/api/lenses/:id", async (c) => {
    const lensId = c.req.param("id");
    if (builtinIds.has(lensId)) throw new HttpError(403, "Built-in lenses cannot be changed. Duplicate it instead.");
    const b = await objBody(c);
    edit((_ws, sc) => {
      const i = sc.lenses.findIndex((l) => l.id === lensId);
      if (i < 0) throw new ModelError(`No lens with ID "${lensId}".`);
      const name = needStr(b, "name").trim();
      if ([...BUILTIN_LENSES, ...sc.lenses].some((o) => o.name === name && o.id !== lensId)) throw new ModelError(`A lens named "${name}" already exists.`);
      sc.lenses[i] = lensIn(b, lensId);
    });
    return ok(c);
  });

  app.delete("/api/lenses/:id", (c) => {
    const lensId = c.req.param("id");
    if (builtinIds.has(lensId)) throw new HttpError(403, "Built-in lenses cannot be deleted.");
    edit((_ws, sc) => {
      if (!sc.lenses.some((l) => l.id === lensId)) throw new ModelError(`No lens with ID "${lensId}".`);
      sc.lenses = sc.lenses.filter((l) => l.id !== lensId);
    });
    return ok(c);
  });

  // ------------------------------------------------------------ layout, styles, history

  /** Merge sizes / edge geometry / positions (connector and code diagrams) into the sidecar.
   *  A null value removes that entry. */
  app.put("/api/diagrams/:key/layout", async (c) => {
    const key = c.req.param("key");
    const patch = await objBody(c);
    edit((ws, sc) => {
      if (!diagrams.keyIsValid(ws, buildIndex(ws), key)) throw new HttpError(404, `No diagram ${key}`);
      const lay = (sc.layouts[key] ??= emptyLayout());
      for (const [id, v] of Object.entries(isObj(patch.sizes) ? patch.sizes : {})) {
        if (v === null) delete lay.sizes[id];
        else {
          if (!isObj(v)) throw new HttpError(422, "A size must be an object with w and h.");
          lay.sizes[id] = { w: Math.max(80, num(v.w, "w")), h: Math.max(50, num(v.h, "h")) };
        }
      }
      for (const [id, v] of Object.entries(isObj(patch.edges) ? patch.edges : {})) {
        if (v === null) delete lay.edges[id];
        else lay.edges[id] = edgeLayout(v);
      }
      for (const [id, v] of Object.entries(isObj(patch.positions) ? patch.positions : {})) {
        if (v === null) delete lay.positions[id];
        else lay.positions[id] = point(v, "position");
      }
    });
    return ok(c);
  });

  app.put("/api/styles/:target{.+}", async (c) => {
    const target = c.req.param("target");
    const b = await body(c);
    if (b !== null && !isObj(b)) throw new HttpError(422, "A style must be an object or null.");
    edit((ws, sc) => ops.setStyle(ws, sc, target, b as Obj | null));
    return ok(c);
  });

  app.post("/api/undo", (c) => c.json({ ok: writable().undo() }));
  app.post("/api/redo", (c) => c.json({ ok: writable().redo() }));

  // ------------------------------------------------------------ code

  // In a draft, code files are read from and saved to the draft's planned edits; the code folder
  // is only written when the draft is applied. A git version's code is read-only.
  const view = () => {
    const s = sel();
    return { draft: s.ref.startsWith("draft:") ? draftId(s.ref) : null, git: s.ref.startsWith("ref:"), code: s.code };
  };
  const relOf = (p: unknown): string => {
    const rel = codeRel(str(p));
    if (!rel) throw new ModelError("That path is outside the code folder.");
    if (project.codeRoot === null) throw new ModelError("No code folder is set. Start the app with --code-root <folder>.");
    return rel;
  };
  const draftOnly = (what: string): string => {
    const v = view();
    if (v.git) throw new HttpError(403, "This version of the model is read-only.");
    if (!v.draft) throw new ModelError(`${what} can only be planned in a draft. Open or start a draft first.`);
    return v.draft;
  };

  app.get("/api/code/tree", (c) => {
    const v = view();
    return c.json({ entries: codemod.listTree(v.draft || v.git ? v.code : project.codeRoot, c.req.query("path") ?? "") });
  });

  app.get("/api/code/file", (c) => {
    const p = c.req.query("path");
    if (p === undefined) throw new HttpError(422, '"path" is required.');
    const v = view();
    if (v.git) {
      const rel = relOf(p);
      const content = v.code.read(rel);
      if (content === null) throw new ModelError("No such file in this version.");
      return c.json({ path: rel, content, mtime: 0, planned: null, readOnly: true });
    }
    if (v.draft) {
      const rel = relOf(p);
      const plan = drafts.codePlan(v.draft);
      const planned = plan.files().get(rel);
      if (planned && planned.change !== "deleted") return c.json({ path: rel, content: plan.content(rel) ?? "", mtime: plan.mtime(rel) ?? 0, planned: planned.change, readOnly: false });
      const onDisk = codemod.readCodeFile(project.codeRoot, rel);
      return c.json({ ...onDisk, planned: planned?.change ?? null, readOnly: false });
    }
    return c.json({ ...codemod.readCodeFile(project.codeRoot, p), planned: null, readOnly: false });
  });

  app.put("/api/code/file", async (c) => {
    const b = await objBody(c);
    const mtime = b.mtime === null || b.mtime === undefined ? null : num(b.mtime, "mtime");
    const v = view();
    if (v.git) throw new HttpError(403, "This version of the model is read-only.");
    if (!v.draft) return c.json(codemod.writeCodeFile(project.codeRoot, str(b.path), str(b.content), mtime));
    const rel = relOf(b.path);
    const plan = drafts.codePlan(v.draft);
    const planned = plan.files().get(rel);
    const current = disk.read(rel);
    if (!planned && current === null) throw new ModelError("No such file. Use New file to plan a new one.");
    const curMtime = planned && planned.change !== "deleted" ? plan.mtime(rel) : current === null ? null : codemod.readCodeFile(project.codeRoot, rel).mtime;
    if (mtime !== null && curMtime !== null && Math.abs(curMtime - mtime) > 0.001) {
      throw new ModelError("The file changed since you opened it. Reopen it to see the new version.");
    }
    plan.write(rel, str(b.content), current);
    return c.json({ path: rel, mtime: plan.mtime(rel) ?? (current === null ? 0 : codemod.readCodeFile(project.codeRoot, rel).mtime) });
  });

  /** Plan a new file (drafts only). */
  app.post("/api/code/file", async (c) => {
    const b = await objBody(c);
    const id = draftOnly("New files");
    const rel = relOf(b.path);
    if (drafts.code(id).kind(rel) !== null) throw new ModelError(`${rel} already exists.`);
    drafts.codePlan(id).write(rel, str(b.content), null);
    return c.json({ path: rel });
  });

  /** Plan the removal of a file (drafts only). */
  app.delete("/api/code/file", (c) => {
    const id = draftOnly("Removing files");
    const rel = relOf(c.req.query("path"));
    if (drafts.code(id).kind(rel) !== "file") throw new ModelError("No such file.");
    drafts.codePlan(id).remove(rel, disk.read(rel));
    return ok(c);
  });

  /** Drop the draft's planned edit of one file. */
  app.post("/api/code/revert", async (c) => {
    const b = await objBody(c);
    const id = draftOnly("Reverting files");
    drafts.codePlan(id).revert(relOf(b.path));
    return ok(c);
  });

  // ------------------------------------------------------------ flows

  app.post("/api/flows", async (c) => {
    const b = await objBody(c);
    const title = needStr(b, "title");
    return c.json({ key: edit((ws) => flows.createFlow(ws, title, optStr(b, "description") ?? "")) });
  });

  app.put("/api/flows/:key", async (c) => {
    const patch = await objBody(c);
    edit((ws) => flows.updateFlow(ws, c.req.param("key"), patch));
    return ok(c);
  });

  app.delete("/api/flows/:key", (c) => {
    edit((ws) => flows.deleteFlow(ws, c.req.param("key")));
    return ok(c);
  });

  app.all("/api/*", (c) => c.json({ detail: "Not Found" }, 404));

  // ------------------------------------------------------------ UI

  const ui = staticDir();
  if (ui) {
    app.get("/*", (c) => {
      let rel: string;
      try {
        rel = decodeURIComponent(new URL(c.req.url).pathname).replace(/^\/+/, "");
      } catch {
        return c.json({ detail: "Bad path." }, 400);
      }
      const f = path.resolve(ui, rel);
      const insideUi = f.startsWith(path.resolve(ui) + path.sep);
      if (rel && insideUi && fs.existsSync(f) && fs.statSync(f).isFile()) {
        const headers: Record<string, string> = { "Content-Type": contentType(f) };
        // Asset names contain a content hash, so they can be cached for good.
        if (rel.startsWith("assets/")) headers["Cache-Control"] = "public, max-age=31536000, immutable";
        return c.body(fs.readFileSync(f), 200, headers);
      }
      // The page must not be cached: after an upgrade it names new asset files, and a cached
      // copy would keep loading the old UI.
      return c.body(fs.readFileSync(path.join(ui, "index.html")), 200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      });
    });
  } else {
    app.get("/", (c) => c.json({ detail: "The browser UI is not built. Run `npm ci && npm run build` in ui/." }));
  }

  return app;
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function contentType(f: string): string {
  return TYPES[path.extname(f).toLowerCase()] ?? "application/octet-stream";
}
