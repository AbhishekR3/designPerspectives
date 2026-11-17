/**
 * Import routes (DEC-051): scan the code, the intake, check and bring in an import file as a draft, the BMO
 * handoff, the per-item review of an import draft, the ignore list and finalizing a level. The logic lives in
 * `src/import` and `src/assistant`; these routes parse the request, pick the role-checked action (auth.ts) and answer.
 * The state is kept under `<project>/architecture/import/`.
 *
 * The review routes work on the draft the request selects (`X-DP-Model: draft:<id>`), so an engineer can
 * review only their own drafts. Item keys hold a ":" (`object:foo`, `relationship:a--b`); the item route takes
 * the rest of the path as the key.
 */

import fs from "node:fs";
import path from "node:path";
import type { Context, Hono } from "hono";
import { gitUserName } from "../../core/git.js";
import { parseHandoffRequest, readHandoffDescription, writeImportHandoff, checkHandoffResult } from "../../assistant/importTasks.js";
import { pasteBackText } from "../../assistant/tasks.js";
import { LEVELS, readEvidence, type Level } from "../../import/scan.js";
import { checkImport, missingContainers } from "../../import/checks.js";
import { ImportRejected, importToDraft } from "../../import/importer.js";
import { intakeLoosened, parseIntake, readIntake, writeIntake } from "../../import/intake.js";
import { changeIgnore, buildOverview, FinalizeRefused, lowConfidenceByLevel, scanProject, setLevelFinal } from "../../import/importStatus.js";
import { parseImportFile } from "../../import/schema.js";
import { acceptAll, isImportDraft, lowConfidence, readReview, setDecision, setFeedback, verifyAgain } from "../../import/review.js";
import { snapshotModel } from "../../import/analysis.js";
import { ModelError } from "../../core/modelEdits.js";
import { DEMO_DIR } from "../../core/project.js";
import type { AcceptAllResult, FieldError, ImportDraftResult, ImportExample, ImportFile, ImportReviewResponse, ReviewActionResult, ReviewDecision } from "../../shared/types.js";
import { decide } from "../auth.js";
import { body, HttpError, needStr, objBody, optStr, type Ctx } from "../routeContext.js";

const ITEM_ACTIONS = ["verify", "accept", "reject", "pending", "feedback"] as const;
const DECISION_OF: Record<string, ReviewDecision> = { accept: "accepted", reject: "rejected", pending: "pending" };

export function registerImport(app: Hono, ctx: Ctx): void {
  const { project, drafts, disk } = ctx;

  /** The draft the request selects (X-DP-Model: draft:<id>). */
  const draftOf = (): string => {
    const { ref } = ctx.sel();
    if (!ref.startsWith("draft:")) throw new HttpError(422, "Select an import draft first (header X-DP-Model: draft:<id>).");
    const id = ctx.draftId(ref);
    drafts.info(id); // 404 for an unknown draft
    return id;
  };
  /** Who a decision is recorded for: the signed-in user, else the git user name. */
  const by = (c: Context): string | null => ctx.who(c).user?.name ?? gitUserName(project.dir);
  const author = (c: Context): string | undefined => ctx.who(c).user?.name;

  /** 422 with the problems as a list as well as the sentence. */
  const refuse = (c: Context, detail: string, extra: Record<string, unknown>) => c.json({ detail, ...extra }, 422);
  const rejected = (c: Context, e: ImportRejected, extra: Record<string, unknown> = {}) => refuse(c, e.message, { errors: e.errors, warnings: e.warnings, ...extra });

  const containerWarnings = (file: ImportFile): FieldError[] => {
    const evidence = readEvidence(project.root);
    if (!evidence) return [];
    const existing = snapshotModel(project.workspace)
      .elements.filter((e) => e.kind === "container")
      .map((e) => ({ id: e.id, name: e.name, codePaths: e.codePaths }));
    return missingContainers(file, evidence, { ignore: buildOverview(project, drafts).state.ignore, existing });
  };

  /** A draft title nobody uses yet: `base`, then `base (2)`, ... */
  const freeTitle = (base: string): string => {
    const taken = new Set(drafts.list().map((d) => d.title));
    for (let n = 1; ; n++) {
      const t = n === 1 ? base : `${base} (${n})`;
      if (!taken.has(t)) return t;
    }
  };

  /** Make the draft from a parsed import file; `title` null: a free default. */
  const makeDraft = (c: Context, file: ImportFile, title: string | null, description: string, sourceText?: string): ImportDraftResult => {
    project.reloadIfChanged();
    const extra = containerWarnings(file);
    const r = importToDraft(drafts, file, {
      title: title?.trim() || freeTitle(`Import ${file.level === "all" ? "(all levels)" : file.level.toUpperCase()}`),
      description,
      author: author(c),
      ...(sourceText ? { sourceText } : {}),
    });
    return { draftId: r.draftId, report: r.report, warnings: [...r.warnings, ...extra], checklistAdded: r.checklistAdded };
  };

  // ---------------------------------------------------------------- the page

  app.get("/api/import", (c) => c.json(buildOverview(project, drafts)));

  /** The demo's ready-to-paste import file, offered only when it passes the check against this project's model (so: a project made from the demo). */
  app.get("/api/import/example", (c) => {
    const file = path.join(DEMO_DIR, "import-example.json");
    if (!fs.existsSync(file)) return c.json({ available: false, text: "" } satisfies ImportExample);
    const text = fs.readFileSync(file, "utf-8");
    const { file: parsed } = parseImportFile(text);
    if (!parsed) return c.json({ available: false, text: "" } satisfies ImportExample);
    project.reloadIfChanged();
    const available = checkImport(parsed, project, disk).errors.length === 0;
    return c.json({ available, text: available ? text : "" } satisfies ImportExample);
  });

  app.post("/api/import/scan", (c) => {
    scanProject(project, drafts, disk);
    return c.json(buildOverview(project, drafts));
  });

  app.put("/api/import/intake", async (c) => {
    const b = await body(c);
    const { errors } = parseIntake(b);
    if (errors.length) return refuse(c, `The intake is not valid: ${errors.map((e) => (e.path ? `${e.path} ${e.message}` : e.message)).join("; ")}`, { errors });
    // What the scan and BMO must not open, and how much they read, is the architect's to loosen; anyone who may edit the intake can tighten it.
    const loosened = intakeLoosened(readIntake(project.root).intake, parseIntake(b).intake);
    if (loosened.length && decide("import.final", ctx.who(c), "main", null) !== null) {
      throw new HttpError(403, `Only an architect can loosen what the scan and BMO may open: ${loosened.join("; ")}. You can add to those lists and lower the limits; ask an architect for the rest.`);
    }
    writeIntake(project.root, b);
    return c.json(buildOverview(project, drafts));
  });

  // ---------------------------------------------------------------- an import file

  /** Check only; never creates anything. */
  app.post("/api/import/check", async (c) => {
    const b = await objBody(c);
    const { file, errors } = parseImportFile(needStr(b, "text"));
    if (!file) return c.json({ errors, warnings: [] });
    project.reloadIfChanged();
    const check = checkImport(file, project, disk);
    return c.json({ errors: check.errors, warnings: [...check.warnings, ...containerWarnings(file)] });
  });

  app.post("/api/import/file", async (c) => {
    const b = await objBody(c);
    const { file, errors } = parseImportFile(needStr(b, "text"));
    if (!file) return refuse(c, `The import file was refused: ${errors.length} problem${errors.length === 1 ? "" : "s"}.`, { errors, warnings: [] });
    try {
      return c.json(makeDraft(c, file, optStr(b, "title"), optStr(b, "description") ?? ""));
    } catch (e) {
      if (e instanceof ImportRejected) return rejected(c, e);
      throw e;
    }
  });

  // ---------------------------------------------------------------- the handoff (BMO's prompt for the person's own coding agent)

  app.post("/api/import/handoff", async (c) => c.json(writeImportHandoff(project, drafts, disk, parseHandoffRequest(await objBody(c)))));

  app.post("/api/import/handoff/result", async (c) => {
    const b = await objBody(c);
    const text = b.text === undefined || b.text === null ? undefined : needStr(b, "text");
    const { task, result } = checkHandoffResult(project, drafts, disk, text);
    if (!result.ok) return refuse(c, `The result was refused: ${result.errors.length} problem${result.errors.length === 1 ? "" : "s"}.`, { errors: result.errors, pasteBack: result.pasteBack });
    if (result.output !== "import-file") throw new ModelError("This handoff does not make an import file.");
    try {
      return c.json(makeDraft(c, result.file, optStr(b, "title"), optStr(b, "description") ?? "", task === "describe-to-model" ? readHandoffDescription(project.root) : undefined));
    } catch (e) {
      if (e instanceof ImportRejected) return rejected(c, e, { pasteBack: pasteBackText(task, e.errors) });
      throw e;
    }
  });

  // ---------------------------------------------------------------- review of an import draft

  const reviewOf = (id: string) => {
    let review: ReturnType<typeof readReview> = null;
    try {
      review = readReview(drafts.main.dir, id);
    } catch (e) {
      if (!isImportDraft(drafts.main.dir, id)) throw e;
    }
    if (!review) {
      if (isImportDraft(drafts.main.dir, id))
        throw new HttpError(422, 'The review of this draft is missing or cannot be read. Use "Check again" to make it again from the import file; every item will be waiting.');
      throw new HttpError(404, "This draft is not an import draft: it has no review.");
    }
    return review;
  };

  app.get("/api/import/review", (c) => {
    const review = reviewOf(draftOf());
    const keys = lowConfidence(review);
    return c.json({ review, lowConfidenceKeys: keys, lowConfidence: keys.length } satisfies ImportReviewResponse);
  });

  app.post("/api/import/review/items/:key{.+}", async (c) => {
    const key = c.req.param("key");
    const b = await objBody(c);
    const action = needStr(b, "action");
    if (!(ITEM_ACTIONS as readonly string[]).includes(action)) throw new HttpError(422, `"action" must be one of ${ITEM_ACTIONS.join(", ")}.`);
    const id = draftOf();
    if (action === "verify") return c.json({ review: verifyAgain(drafts, id, key), reverted: [], alsoRejected: [] } satisfies ReviewActionResult);
    if (action === "feedback") return c.json({ review: setFeedback(drafts, id, key, optStr(b, "text") ?? ""), reverted: [], alsoRejected: [] } satisfies ReviewActionResult);
    const r = setDecision(drafts, id, key, DECISION_OF[action]!, by(c));
    return c.json({ review: r.review, reverted: r.reverted, alsoRejected: r.alsoRejected } satisfies ReviewActionResult);
  });

  app.post("/api/import/review/verify", (c) => c.json({ review: verifyAgain(drafts, draftOf(), null) }));

  app.post("/api/import/review/accept-all", (c) => {
    const r = acceptAll(drafts, draftOf(), by(c));
    return c.json({ review: r.review, accepted: r.accepted, skipped: r.skipped } satisfies AcceptAllResult);
  });

  app.post("/api/import/review/feedback", async (c) => {
    const b = await objBody(c);
    return c.json({ review: setFeedback(drafts, draftOf(), null, needStr(b, "text")) });
  });

  // ---------------------------------------------------------------- ignore list and levels (architects)

  app.post("/api/import/ignore", async (c) => {
    const b = await objBody(c);
    if (b.remove !== undefined && typeof b.remove !== "boolean") throw new HttpError(422, '"remove" must be true or false.');
    changeIgnore(project, needStr(b, "path"), b.remove === true);
    return c.json(buildOverview(project, drafts));
  });

  app.post("/api/import/levels/:level", async (c) => {
    const level = c.req.param("level") as Level;
    if (!LEVELS.includes(level)) throw new HttpError(422, `A level is one of ${LEVELS.join(", ")}.`);
    const b = await objBody(c);
    if (typeof b.final !== "boolean") throw new HttpError(422, '"final" is required and must be true or false.');
    try {
      setLevelFinal(project, drafts, level, b.final);
    } catch (e) {
      if (e instanceof FinalizeRefused) return refuse(c, e.message, { unmet: e.unmet, lowConfidence: lowConfidenceByLevel(drafts)[level] ?? 0 });
      throw e;
    }
    return c.json(buildOverview(project, drafts));
  });
}
