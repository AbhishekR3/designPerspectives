/** Local web server: a JSON API over the model files, plus the built browser UI. */

import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import { Hono, type Context } from "hono";
import * as codemod from "../core/code.js";
import { compareDiagram, diagramOf } from "../core/compare.js";
import * as diagrams from "../core/diagrams.js";
import { diffModels } from "../core/diff.js";
import { ApplyConflict, Drafts } from "../core/drafts.js";
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
}

export function state(project: Project, readOnly = false, sel?: Selection, drafts?: Drafts): AppState {
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
    compare:
      sel?.cmp && sel.cmpRef
        ? { against: sel.cmpRef, title: sel.cmpTitle ?? sel.cmpRef, summary: diffModels(sel.cmp, src, sel.cmpRef).summary }
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
}

export function createApp(root: string, opts: AppOptions = {}): Hono {
  const readOnly = opts.readOnly ?? false;
  const project = new Project(root, opts.codeRoot);
  const drafts = new Drafts(project);
  const app = new Hono();
  const ok = (c: Context) => c.json({ ok: true });

  // Each request selects a model version; handlers read it from here (requests interleave at
  // `await`, so this cannot be a plain variable).
  const selection = new AsyncLocalStorage<Selection>();
  const sel = (): Selection => selection.getStore() ?? { src: project, ref: "main", title: "Main model", cmp: null, cmpRef: null, cmpTitle: null };
  const src = () => sel().src;
  const writable = (): Project => {
    const s = src();
    if (!(s instanceof Project)) throw new HttpError(403, "This version of the model is read-only.");
    return s;
  };
  const edit = <T>(fn: (ws: Workspace, sc: Sidecar) => T, record = true) => writable().edit(fn, record);

  const draftId = (ref: string) => ref.slice("draft:".length);
  const resolve = (ref: string): [ModelSource, string] => {
    if (ref === "main") return [project, "Main model"];
    if (ref.startsWith("draft:")) {
      const id = draftId(ref);
      return [drafts.get(id), `Draft: ${drafts.info(id).title}`];
    }
    throw new HttpError(422, `Unknown model version "${ref}".`);
  };
  const resolveCompare = (ref: string, against: string): [ModelSource, string] => {
    if (against === "base") {
      if (!ref.startsWith("draft:")) throw new HttpError(422, "Only a draft has a base to compare with.");
      return [drafts.base(draftId(ref)), "Main model when the draft was made"];
    }
    return resolve(against);
  };

  app.onError((err, c) => {
    if (err instanceof ApplyConflict) return c.json({ detail: err.message, conflicts: err.conflicts }, 409);
    if (err instanceof NotFound) return c.json({ detail: err.message }, 404);
    if (err instanceof ModelError) return c.json({ detail: err.message }, 422);
    if (err instanceof HttpError) return c.json({ detail: err.message }, err.status as 400);
    if (err instanceof diagrams.UnknownDiagram) return c.json({ detail: `No diagram ${err.message}` }, 404);
    console.error(err);
    return c.json({ detail: `Internal error: ${(err as Error).message}` }, 500);
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
    const [s, title] = resolve(ref);
    s.reloadIfChanged();
    const against = c.req.header("x-dp-compare")?.trim() || null;
    let cmp: ModelSource | null = null;
    let cmpTitle: string | null = null;
    if (against) {
      [cmp, cmpTitle] = resolveCompare(ref, against);
      cmp.reloadIfChanged();
    }
    await selection.run({ src: s, ref, title, cmp, cmpRef: against, cmpTitle }, next);
  });

  // ------------------------------------------------------------ read

  /** For process monitors: the server is up and the model files load. */
  app.get("/api/health", (c) => c.json({ ok: true, version: version(), loadErrors: project.loadErrors.length }));

  app.get("/api/state", (c) => c.json(state(project, readOnly, sel(), drafts)));

  /** The changes between the shown model and the one it is compared with. */
  const changes = (): ChangeSet => {
    const { src: s, cmp, cmpRef } = sel();
    if (!cmp || !cmpRef) throw new HttpError(422, "Nothing to compare with: send the X-DP-Compare header.");
    return diffModels(cmp, s, cmpRef);
  };

  app.get("/api/diagrams/:key", (c) => {
    const key = c.req.param("key");
    const { src: s, cmp } = sel();
    const d = cmp ? compareDiagram(s, cmp, key, changes(), project.codeRoot) : diagramOf(s, key, project.codeRoot);
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
    drafts.update(c.req.param("id"), { title: optStr(b, "title") ?? undefined, description: optStr(b, "description") ?? undefined });
    return ok(c);
  });

  app.delete("/api/drafts/:id", (c) => {
    drafts.remove(c.req.param("id"));
    return ok(c);
  });

  app.get("/api/drafts/:id/apply-preview", (c) => c.json(drafts.preview(c.req.param("id"))));

  app.post("/api/drafts/:id/apply", (c) => {
    drafts.apply(c.req.param("id"));
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

  app.post("/api/elements/:id/duplicate", (c) => c.json({ id: edit((ws, sc) => ops.duplicateElement(ws, sc, c.req.param("id"))) }));

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

  app.get("/api/code/tree", (c) => c.json({ entries: codemod.listTree(project.codeRoot, c.req.query("path") ?? "") }));

  app.get("/api/code/file", (c) => {
    const p = c.req.query("path");
    if (p === undefined) throw new HttpError(422, '"path" is required.');
    return c.json(codemod.readCodeFile(project.codeRoot, p));
  });

  app.put("/api/code/file", async (c) => {
    const b = await objBody(c);
    const mtime = b.mtime === null || b.mtime === undefined ? null : num(b.mtime, "mtime");
    return c.json(codemod.writeCodeFile(project.codeRoot, str(b.path), str(b.content), mtime));
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
      const rel = decodeURIComponent(new URL(c.req.url).pathname).replace(/^\/+/, "");
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
