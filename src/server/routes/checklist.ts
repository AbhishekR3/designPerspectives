/** Checklist routes (DEC-084): the items with their checks for the version shown, starter lists, and changes to items. */

import type { Context, Hono } from "hono";
import { STARTERS } from "../../core/checklist.js";
import { checkRules } from "../../core/checklistRules.js";
import * as diagrams from "../../core/diagrams.js";
import { gitUserName } from "../../core/git.js";
import { buildIndex, ModelError } from "../../core/modelEdits.js";
import type { ChecklistItem, ChecklistResponse, ChecklistRule } from "../../shared/types.js";
import { objBody, type Ctx } from "../routeContext.js";

export function registerChecklist(app: Hono, ctx: Ctx): void {
  const { checklist, sel, who, project, drafts } = ctx;
  const gitName = gitUserName(project.dir);
  const nameOf = (c: Context): string => who(c).user?.name ?? gitName ?? "Anonymous";

  /** The items as the version shown sees them: each rule's result, the status that follows from it, and `missing` targets. */
  const annotate = (items: ChecklistItem[]): ChecklistItem[] => {
    const src = sel().src;
    const ws = src.workspace;
    const rules = items.map((i) => i.rule).filter((r): r is ChecklistRule => !!r);
    const checks = rules.length
      ? checkRules(rules, { workspace: ws, sidecar: src.sidecar, decisions: src.decisions, root: project.root, modelDir: project.dir, draftIds: drafts.list().map((d) => d.id) })
      : {};
    let has: ((t: NonNullable<ChecklistItem["target"]>) => boolean) | null = null;
    const here = (t: NonNullable<ChecklistItem["target"]>): boolean => {
      if (!has) {
        let idx: ReturnType<typeof buildIndex> | null;
        try {
          idx = buildIndex(ws);
        } catch {
          idx = null;
        }
        const keys = new Set(diagrams.diagramList(ws).map((d) => d.key));
        has = (x) => (x.type === "diagram" ? keys.has(x.id) : !idx || (x.type === "element" ? idx.elements.has(x.id) : idx.relationships.has(x.id)));
      }
      return has(t);
    };
    return items.map((i) => {
      const out: ChecklistItem = { ...i };
      if (i.rule) {
        const check = checks[i.rule]!;
        out.check = check;
        if (i.status !== "skipped") {
          out.status = check.passing ? "done" : "open";
          if (check.passing) out.doneBy = "dp";
        }
      }
      if (i.target && !here(i.target)) out.missing = true;
      return out;
    });
  };

  const response = (): ChecklistResponse => {
    const items = annotate(checklist.list());
    const keys = new Set(items.map((i) => i.starter).filter(Boolean));
    const count = (s: string) => items.filter((i) => i.status === s).length;
    return {
      items,
      starters: STARTERS.map((s) => ({ id: s.id, title: s.title, description: s.description, added: s.items.filter((x) => keys.has(x.key)).length, total: s.items.length })),
      summary: {
        open: count("open"),
        done: count("done"),
        skipped: count("skipped"),
        total: items.length,
        fromBmo: items.filter((i) => i.source === "bmo" && i.status === "open").length,
      },
    };
  };
  const one = (item: ChecklistItem) => annotate([item])[0]!;

  app.get("/api/checklist", (c) => c.json(response()));

  app.post("/api/checklist", async (c) => {
    const b = await objBody(c);
    return c.json(one(checklist.add({ text: b.text, kind: b.kind, section: b.section, target: b.target, author: nameOf(c) })));
  });

  /** Add the items of a starter list that are not on the checklist yet; answers the whole checklist. */
  app.post("/api/checklist/starters/:id", (c) => {
    checklist.addStarter(c.req.param("id"), nameOf(c));
    return c.json(response());
  });

  app.patch("/api/checklist/:id", async (c) => {
    const b = await objBody(c);
    const keys = ["text", "kind", "section", "status", "answer", "target"] as const;
    if (!keys.some((k) => b[k] !== undefined)) throw new ModelError(`Nothing to change: send ${keys.join(", ")}.`);
    return c.json(one(checklist.update(c.req.param("id"), { text: b.text, kind: b.kind, section: b.section, status: b.status, answer: b.answer, target: b.target }, nameOf(c))));
  });

  app.delete("/api/checklist/:id", (c) => {
    checklist.remove(c.req.param("id"));
    return ctx.ok(c);
  });

  /** Delete every done item, or every skipped one ({"status": "done" | "skipped"}); answers the whole checklist. */
  app.post("/api/checklist/clear", async (c) => {
    const b = await objBody(c);
    if (b.status !== "done" && b.status !== "skipped") throw new ModelError('Send {"status": "done"} or {"status": "skipped"}.');
    // By the status shown, so an item dp ticked goes with the ones people ticked.
    checklist.removeMany(
      annotate(checklist.list())
        .filter((i) => i.status === b.status)
        .map((i) => i.id),
    );
    return c.json(response());
  });
}
