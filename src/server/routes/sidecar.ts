/** Sidecar routes: tag groups, characteristics, cost settings, lenses, diagram layout and styles. */

import type { Hono } from "hono";
import * as diagrams from "../../core/diagrams.js";
import { isObj, type Obj } from "../../core/util.js";
import * as ops from "../../core/modelEdits.js";
import { buildIndex, ModelError, slugify, unique } from "../../core/modelEdits.js";
import { BUILTIN_LENSES, edgeLayoutData, emptyLayout, isLineShape, LINE_SHAPES, makeLens, SECTIONS } from "../../core/designPerspectivesFile.js";
import type { CharacteristicDef, CostBand, CostSettings, EdgeLayout, Lens, Level, Section } from "../../shared/types.js";
import { body, HttpError, needStr, num, objBody, optStr, point, strList, type Ctx } from "../routeContext.js";

const ROUTINGS: readonly string[] = LINE_SHAPES;

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

export function registerSidecar(app: Hono, ctx: Ctx): void {
  const { edit, ok } = ctx;

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

  /** Merge the default line shape / sizes / edge geometry / positions (connector and code diagrams)
   *  into the sidecar. A null value removes that entry (`lineShape: null` goes back to rounded right angles). */
  app.put("/api/diagrams/:key/layout", async (c) => {
    const key = c.req.param("key");
    const patch = await objBody(c);
    // auto=true: a detail saved together with the edit before it (such as which side a new line leaves from); not a separate undo step.
    const auto = ["true", "1", "yes", "on"].includes((c.req.query("auto") ?? "").toLowerCase());
    if (patch.lineShape !== undefined && patch.lineShape !== null && !isLineShape(patch.lineShape)) {
      throw new HttpError(422, `Line shape must be one of: ${LINE_SHAPES.join(", ")}.`);
    }
    edit((ws, sc) => {
      if (!diagrams.keyIsValid(ws, buildIndex(ws), key)) throw new HttpError(404, `No diagram ${key}`);
      const lay = (sc.layouts[key] ??= emptyLayout());
      if (patch.lineShape === null) delete lay.lineShape;
      else if (isLineShape(patch.lineShape)) lay.lineShape = patch.lineShape;
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
    }, !auto);
    return ok(c);
  });

  app.put("/api/styles/:target{.+}", async (c) => {
    const target = c.req.param("target");
    const b = await body(c);
    if (b !== null && !isObj(b)) throw new HttpError(422, "A style must be an object or null.");
    edit((ws, sc) => ops.setStyle(ws, sc, target, b as Obj | null));
    return ok(c);
  });
}
