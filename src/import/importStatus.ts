/**
 * What the import routes and the `dp scan` command share (COD-02): the scan of a project, the analysis as it
 * stands now, the summary of the import drafts, the ignore list and the finalize rule. Nothing here reads
 * the network or calls a model.
 *
 * `evidence.json` and `analysis.json` are written by a scan. The analysis shown at other times is computed
 * again from the stored evidence and the model as it is now (cheap, no file walk), so accepting an import draft
 * shows at once in the numbers.
 */

import type { CodeSource } from "../core/codeFiles.js";
import type { Drafts } from "../core/drafts.js";
import { buildIndex, ModelError } from "../core/modelEdits.js";
import type { Project } from "../core/project.js";
import { checkProject } from "../core/cliReports.js";
import type { Analysis, ImportDraftSummary, ImportOverview, EvidenceSummary, ReviewDecision, ReviewLevel, ScanLevel } from "../shared/types.js";
import { analyse, canFinalize, defaultState, readState, snapshotModel, writeAnalysis, writeState, type ImportState } from "./analysis.js";
import { readIntake, type Intake } from "./intake.js";
import { lowConfidence, readImportFile, readReview } from "./review.js";
import { LEVELS, readEvidence, scanRepo, writeEvidence, type Evidence } from "./scan.js";
import { readManifest } from "../assistant/handoffBackend.js";

export function evidenceSummary(ev: Evidence): EvidenceSummary {
  const facts: Record<ScanLevel, number> = { c1: 0, c2: 0, c3: 0, c4: 0 };
  for (const f of ev.facts) facts[f.level]++;
  return {
    facts,
    files: { total: ev.files.total, byLanguage: ev.files.byLanguage, notAnalysable: ev.files.notAnalysable, binary: ev.files.binary, skipped: ev.files.skipped.length },
    imports: ev.imports.length,
    notParsed: ev.notParsed,
    limits: ev.limits,
  };
}

const LEVEL_OF_KIND: Record<string, ScanLevel> = { person: "c1", softwareSystem: "c1", container: "c2", component: "c3" };
const RANK: Record<ScanLevel, number> = { c1: 0, c2: 1, c3: 2, c4: 3 };

/** The import draft ids with their review states (drafts that are not import drafts, or whose review cannot be read, are left out). */
function importDrafts(drafts: Drafts): { id: string; title: string; author: string | null; review: NonNullable<ReturnType<typeof readReview>> }[] {
  const out = [];
  for (const d of drafts.list()) {
    try {
      const review = readReview(drafts.main.dir, d.id);
      if (review) out.push({ id: d.id, title: d.title, author: d.author ?? null, review });
    } catch {
      /* an unreadable review: the draft is shown as an ordinary draft */
    }
  }
  return out;
}

/** The C4 level a review item belongs to (objects by kind, relationships by their deeper end); `fallback` for an item no longer in the draft. */
function levelOfItem(key: string, ws: ReturnType<typeof buildIndex> | null, fallback: ScanLevel): ScanLevel {
  const i = key.indexOf(":");
  const kind = key.slice(0, i);
  const id = key.slice(i + 1);
  if (!ws) return fallback;
  if (kind === "object" && ws.elements.has(id)) return LEVEL_OF_KIND[ws.kindOf(id)] ?? fallback;
  if (kind === "relationship" && ws.relationships.has(id)) {
    const r = ws.relationships.get(id)!;
    const a = LEVEL_OF_KIND[ws.kindOf(r.sourceId)] ?? fallback;
    const b = LEVEL_OF_KIND[ws.kindOf(r.destinationId)] ?? fallback;
    return RANK[a] >= RANK[b] ? a : b;
  }
  return fallback;
}

/** Items waiting for an explicit accept (pending and unverified) across the import drafts, per C4 level. */
export function lowConfidenceByLevel(drafts: Drafts): Partial<Record<ScanLevel, number>> {
  const out: Partial<Record<ScanLevel, number>> = {};
  for (const d of importDrafts(drafts)) {
    const keys = lowConfidence(d.review);
    if (!keys.length) continue;
    let idx: ReturnType<typeof buildIndex> | null = null;
    try {
      idx = buildIndex(drafts.get(d.id).workspace);
    } catch {
      /* the draft has a model problem: items count at the file's level */
    }
    const fileLevel = readImportFile(drafts.main.dir, d.id)?.level;
    const fallback: ScanLevel = fileLevel && fileLevel !== "all" ? fileLevel : "c3";
    for (const k of keys) {
      const l = levelOfItem(k, idx, fallback);
      out[l] = (out[l] ?? 0) + 1;
    }
  }
  return out;
}

export function importDraftSummaries(drafts: Drafts): ImportDraftSummary[] {
  return importDrafts(drafts).map((d) => {
    const byLevel: Record<ReviewLevel, number> = { verified: 0, partly: 0, unverified: 0 };
    const byDecision: Record<ReviewDecision, number> = { pending: 0, accepted: 0, rejected: 0 };
    for (const i of Object.values(d.review.items)) {
      byLevel[i.level]++;
      byDecision[i.decision]++;
    }
    return { draftId: d.id, title: d.title, author: d.author, byLevel, byDecision, lowConfidence: lowConfidence(d.review).length, total: Object.keys(d.review.items).length };
  });
}

/** The analysis from the stored evidence and the model as it is now; null before the first scan. */
export function currentAnalysis(project: Project, drafts: Drafts, intake: Intake = readIntake(project.root).intake): { evidence: Evidence; analysis: Analysis } | null {
  const evidence = readEvidence(project.root);
  if (!evidence) return null;
  const state = readState(project.root);
  return { evidence, analysis: analyse(evidence, snapshotModel(project.workspace), intake, { ...state, lowConfidence: lowConfidenceByLevel(drafts) }) };
}

/** `GET /api/import`: everything the import page shows. Does not scan. */
export function buildOverview(project: Project, drafts: Drafts): ImportOverview {
  project.reloadIfChanged();
  const { intake, errors } = readIntake(project.root);
  const cur = currentAnalysis(project, drafts, intake);
  return {
    evidence: cur ? evidenceSummary(cur.evidence) : null,
    analysis: cur?.analysis ?? null,
    intake,
    intakeErrors: errors,
    state: readState(project.root),
    handoff: readManifest(project.root),
    importDrafts: importDraftSummaries(drafts),
  };
}

/** Source roots of the containers already in the model (the scan finds components below them). */
function containerRoots(project: Project): string[] {
  return snapshotModel(project.workspace)
    .elements.filter((e) => e.kind === "container")
    .flatMap((e) => e.codePaths)
    .map((p) => p.replace(/^\.?\/+|\/+$/g, ""))
    .filter((p) => p && p !== ".");
}

/** Walk the code, write `evidence.json` and `analysis.json`. Refused with a ModelError while the intake file has errors. */
export function scanProject(project: Project, drafts: Drafts, code: CodeSource): { evidence: Evidence; analysis: Analysis } {
  if (!code.hasRoot) throw new ModelError("There is no code folder to scan.");
  const { intake, errors } = readIntake(project.root);
  if (errors.length) throw new ModelError(`The intake has problems, so the scan is not run: ${errors.map((e) => (e.path ? `${e.path} ${e.message}` : e.message)).join("; ")}`);
  project.reloadIfChanged();
  const evidence = scanRepo(code, intake, { containerRoots: containerRoots(project) });
  writeEvidence(project.root, evidence);
  const analysis = currentAnalysis(project, drafts, intake)!.analysis;
  writeAnalysis(project.root, analysis);
  return { evidence, analysis };
}

/** Add `path` (a path, a glob or a candidate ID such as `c2:redis`) to the import ignore list, or remove it. */
export function changeIgnore(project: Project, path: string, remove: boolean): ImportState {
  const state = readState(project.root);
  const clean = path.trim().replace(/\\/g, "/");
  if (!clean) throw new ModelError("Give a path, a glob or a candidate ID to ignore.");
  state.ignore = remove ? state.ignore.filter((x) => x !== clean) : [...state.ignore, clean];
  writeState(project.root, state);
  return readState(project.root);
}

/** A level cannot be finalized yet: `unmet` says why. */
export class FinalizeRefused extends ModelError {
  constructor(
    readonly level: ScanLevel,
    readonly unmet: string[],
  ) {
    super(`${level.toUpperCase()} cannot be finalized yet: ${unmet.join("; ")}.`);
  }
}

/** Mark a level final (refused with `FinalizeRefused` while `canFinalize` names unmet conditions) or open it again. */
export function setLevelFinal(project: Project, drafts: Drafts, level: ScanLevel, final: boolean): ImportState {
  if (!LEVELS.includes(level)) throw new ModelError(`A level is one of ${LEVELS.join(", ")}.`);
  const state = readState(project.root);
  if (final) {
    const cur = currentAnalysis(project, drafts);
    if (!cur) throw new ModelError("Scan the code first: a level is finalized against what the scan found.");
    const unmet = canFinalize(level, cur.analysis, snapshotModel(project.workspace), checkProject(project).errors, lowConfidenceByLevel(drafts)[level] ?? 0);
    if (unmet.length) throw new FinalizeRefused(level, unmet);
  }
  state.levels = { ...defaultState().levels, ...state.levels, [level]: final };
  writeState(project.root, state);
  return readState(project.root);
}

/** The first of C1 to C3 that is not final (what `dp scan --prompt` works on), or null when all are. */
export function firstOpenLevel(project: Project): "c1" | "c2" | "c3" | null {
  const s = readState(project.root);
  return (["c1", "c2", "c3"] as const).find((l) => !s.levels[l]) ?? null;
}

const pad = (s: string | number, n: number, right = false): string => (right ? String(s).padStart(n) : String(s).padEnd(n));

/** The readiness analysis as a plain table, for `dp scan --plan`. */
export function analysisTable(a: Analysis): string {
  const rows = a.levels.map((l) => [l.level.toUpperCase(), String(l.candidates), String(l.decided), String(l.left), l.state]);
  const head = ["Level", "Candidates", "Decided", "Left", "State"];
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const line = (r: string[]) =>
    r
      .map((c, i) => (i > 0 && i < 4 ? pad(c, w[i]!, true) : pad(c, w[i]!)))
      .join("  ")
      .trimEnd();
  const out = [line(head), line(w.map((n) => "-".repeat(n))), ...rows.map(line)];
  const t = a.totals;
  out.push(
    "",
    `Total (C1 to C3 within the depth ${a.depth.toUpperCase()}, with the intake questions): ${t.candidates} candidates, ${t.decided} decided, ${t.left} left (${t.percent}%)`,
    `Review effort: ${t.effortItems} items, about ${t.reviewMinutes} minutes. BMO would read about ${t.tokens} tokens in ${t.passes} pass${t.passes === 1 ? "" : "es"}.`,
    `Files outside every component (upper bound until C3 is final): ${t.unmappedFiles}`,
  );
  if (t.intakeUnanswered.length) out.push(`Intake questions not answered: ${t.intakeUnanswered.join(", ")}`);
  out.push("", `Recommendation: ${a.recommendation.mode === "step-by-step" ? "step by step (one level at a time)" : "all levels in one go"}`);
  const fired = a.recommendation.rules.filter((r) => r.fired);
  if (fired.length) for (const r of fired) out.push(`  - ${r.rule} (${r.value}, threshold ${r.threshold})`);
  else out.push("  - no rule for step by step fired");
  if (a.broken.length) out.push("", "Problems:", ...a.broken.map((b) => `  - ${b}`));
  out.push("", "What the scan cannot see:", ...a.cannotSee.map((c) => `  - ${c}`));
  return out.join("\n") + "\n";
}
