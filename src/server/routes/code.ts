/** Code routes: the code tree and files, and planned code edits in drafts. */

import type { Hono } from "hono";
import * as codemod from "../../core/code.js";
import { codeRel } from "../../core/codefs.js";
import { str } from "../../core/json.js";
import { ModelError } from "../../core/ops.js";
import { HttpError, num, objBody, type Ctx } from "../context.js";

export function registerCode(app: Hono, ctx: Ctx): void {
  const { project, drafts, disk, ok, sel, draftId } = ctx;

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
}
