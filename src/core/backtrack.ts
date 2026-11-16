/**
 * Backtracking: from one step of a pipeline (a connector's stages) or a flow, back to where its data
 * came from. For every step up to the chosen one it gathers the sample data, the code behind the
 * step (mapped files and the functions in them), the commits that changed those files, and the
 * commits that changed the step in the model. Steps with a change in the recent window (or an
 * uncommitted change) are marked, so the likely causes of a problem stand out.
 *
 * Code behind a step: a connector stage → the code of the element that implements it; step 0 (the
 * data entering) → the connector's own code; a flow step → the relationship's code and the code of
 * the element that receives the step. Field-by-field comparison of the samples is done in the UI.
 *
 * History comes from git (git.ts): the code folder's repository for files, the model folder's for
 * the model. Without a repository the step still lists its data, files and functions.
 */

import { CODE_KEY, elementSummary, getJson, relationshipSummary, STAGES_KEY, ModelError, buildIndex, type Index } from "./ops.js";
import { listFlows } from "./flows.js";
import { expandPaths } from "./code.js";
import type { CodeSource } from "./codefs.js";
import { findFunctions } from "./functions.js";
import { changedLinesSince, logFor, parentOf, uncommitted, type LogEntry } from "./git.js";
import type { Workspace } from "./workspace.js";
import type { BacktrackFile, BacktrackResult, BacktrackStep, ModelChange, Stage } from "../shared/types.js";

export const RECENT_DAYS = 14;
/** Most commits read per file, and of the model file. */
const LOG_LIMIT = 15;

export interface BacktrackQuery {
  connector?: string;
  /** 0 = the data entering; 1.. = stages. */
  stage?: number;
  flow?: string;
  /** 1.. */
  step?: number;
  days?: number;
}

export interface HistorySources {
  /** Working folder of the code (null: no code folder). Paths are relative to it. */
  codeDir: string | null;
  /** The model folder (architecture/); its workspace file is "workspace.json". */
  modelDir: string | null;
  /** The model at a commit (GitModels.at), for the model history. */
  modelAt: ((sha: string) => Workspace) | null;
}

interface Draft {
  index: number;
  name: string;
  description: string;
  elementId: string | null;
  relationshipId: string;
  stageId: string | null;
  example: string;
  format: string;
  paths: string[];
}

function stepsOf(idx: Index, ws: Workspace, q: BacktrackQuery): { title: string; target: number; steps: Draft[] } {
  if (q.connector) {
    const rel = idx.rel(q.connector);
    const s = relationshipSummary(rel);
    const target = q.stage ?? s.stages.length;
    if (!Number.isInteger(target) || target < 0 || target > s.stages.length) throw new ModelError(`Stage ${target} is not in this connector (it has ${s.stages.length}).`);
    const steps: Draft[] = [
      {
        index: 0,
        name: `${idx.el(rel.sourceId).name} sends`,
        description: s.description,
        elementId: rel.sourceId,
        relationshipId: rel.id,
        stageId: null,
        example: s.example,
        format: s.format,
        paths: s.codePaths,
      },
    ];
    s.stages.slice(0, target).forEach((st: Stage, i) => {
      const el = st.elementId && idx.elements.has(st.elementId) ? st.elementId : null;
      steps.push({
        index: i + 1,
        name: st.name,
        description: st.description ?? "",
        elementId: el,
        relationshipId: rel.id,
        stageId: st.id,
        example: st.example ?? "",
        format: st.format ?? "",
        paths: el ? getJson<string>(idx.el(el), CODE_KEY) : [],
      });
    });
    const label = target === 0 ? "the data entering it" : `stage ${target} of ${s.stages.length}`;
    return { title: `${idx.el(rel.sourceId).name} → ${idx.el(rel.destinationId).name}: ${label}`, target, steps };
  }
  if (q.flow) {
    const flow = listFlows(ws).find((f) => f.key === q.flow);
    if (!flow) throw new ModelError(`No flow with key "${q.flow}".`);
    const target = q.step ?? flow.steps.length;
    if (!Number.isInteger(target) || target < 1 || target > flow.steps.length) throw new ModelError(`Step ${target} is not in this flow (it has ${flow.steps.length}).`);
    const steps = flow.steps.slice(0, target).map((st, i): Draft => {
      const rel = idx.rel(st.relationshipId);
      const receiver = st.response ? rel.sourceId : rel.destinationId;
      return {
        index: i + 1,
        name: st.description || rel.description || "",
        description: `${idx.el(st.response ? rel.destinationId : rel.sourceId).name} → ${idx.el(receiver).name}`,
        elementId: receiver,
        relationshipId: rel.id,
        stageId: null,
        example: st.example ?? "",
        format: st.format ?? "",
        paths: [...getJson<string>(rel, CODE_KEY), ...getJson<string>(idx.el(receiver), CODE_KEY)],
      };
    });
    return { title: `${flow.title}: step ${target} of ${flow.steps.length}`, target, steps };
  }
  throw new ModelError('Say where to start: "connector" and "stage", or "flow" and "step".');
}

function fileInfo(code: CodeSource, codeDir: string | null, file: string, since: number): BacktrackFile {
  const text = code.read(file);
  const commits: LogEntry[] = codeDir ? logFor(codeDir, [file], LOG_LIMIT) : [];
  const dirty = codeDir ? uncommitted(codeDir, file) : false;
  const recent = commits.filter((c) => Date.parse(c.date) >= since);
  // Lines changed since just before the oldest recent commit (or since the last commit, for edits not committed yet).
  let changed: Set<number> | "all" = new Set();
  if (codeDir && (recent.length || dirty)) {
    const oldest = recent[recent.length - 1];
    const base = oldest ? parentOf(codeDir, oldest.sha) : (commits[0]?.sha ?? null);
    const lines = changedLinesSince(codeDir, base, file);
    // A changed blank line (the gap before a new function) says nothing about the function above it.
    const rows = text?.split("\n") ?? [];
    changed = lines === "all" ? "all" : new Set(lines.filter((l) => (rows[l - 1] ?? "").trim() !== ""));
  }
  const functions = text === null ? [] : findFunctions(file, text);
  return {
    path: file,
    exists: text !== null,
    functions: functions.map((f) => {
      let hit = changed === "all";
      if (changed !== "all") for (let l = f.line; l <= f.end && !hit; l++) hit = changed.has(l);
      return { name: f.name, kind: f.kind, line: f.line, changed: hit };
    }),
    commits,
    uncommitted: dirty,
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function changedKeys(a: object, b: object): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((k) => !same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** An element's fields that describe it (not values derived from its children). */
function elementFacts(idx: Index, id: string): Record<string, unknown> | null {
  if (!idx.elements.has(id)) return null;
  const { costRollup: _r, childCount: _c, ...rest } = elementSummary(idx, id);
  return rest;
}

function stageOf(idx: Index, relId: string, stageId: string): Stage | null {
  const r = idx.relationships.get(relId);
  return r ? (getJson<Stage>(r, STAGES_KEY).find((s) => s.id === stageId) ?? null) : null;
}

/** How each step's part of the model changed in each commit that changed the model file. */
function modelChanges(src: HistorySources, steps: Draft[]): Map<number, ModelChange[]> {
  const out = new Map<number, ModelChange[]>(steps.map((s) => [s.index, []]));
  if (!src.modelDir || !src.modelAt) return out;
  const commits = logFor(src.modelDir, ["workspace.json"], LOG_LIMIT);
  // Each commit in this list changed the model file, so the next older one holds the version before it.
  const usable = commits.length === LOG_LIMIT ? commits.length - 1 : commits.length;
  const idxAt = new Map<string, Index>();
  const index = (sha: string) => {
    let i = idxAt.get(sha);
    if (!i) idxAt.set(sha, (i = buildIndex(src.modelAt!(sha))));
    return i;
  };
  for (let n = 0; n < usable; n++) {
    const c = commits[n]!;
    const after = index(c.sha);
    const before = commits[n + 1] ? index(commits[n + 1]!.sha) : null;
    for (const s of steps) {
      const list = out.get(s.index)!;
      const record = (change: ModelChange["change"], what: string) => list.push({ ...c, change, what });
      if (s.stageId) {
        const a = before ? stageOf(before, s.relationshipId, s.stageId) : null;
        const b = stageOf(after, s.relationshipId, s.stageId);
        if (!a && b) record("added", `Stage "${b.name}" added`);
        else if (a && !b) record("removed", `Stage "${a.name}" removed`);
        else if (a && b && !same(a, b)) record("changed", `Stage "${b.name}": ${changedKeys(a, b).join(", ")}`);
      } else {
        const ra = before?.relationships.get(s.relationshipId);
        const rb = after.relationships.get(s.relationshipId);
        if (!ra && rb) record("added", "Relationship added");
        else if (ra && rb) {
          const { stages: _a, ...x } = relationshipSummary(ra);
          const { stages: _b, ...y } = relationshipSummary(rb);
          if (!same(x, y)) record("changed", `Relationship: ${changedKeys(x, y).join(", ")}`);
        }
      }
      if (s.elementId) {
        const a = before ? elementFacts(before, s.elementId) : null;
        const b = elementFacts(after, s.elementId);
        const label = (f: Record<string, unknown>) => `"${String(f.name)}"`;
        if (!a && b) record("added", `${label(b)} added to the model`);
        else if (a && b && !same(a, b)) record("changed", `${label(b)}: ${changedKeys(a, b).join(", ")}`);
      }
    }
  }
  return out;
}

export function backtrack(ws: Workspace, code: CodeSource, src: HistorySources, q: BacktrackQuery, now = Date.now()): BacktrackResult {
  const idx = buildIndex(ws);
  const { title, target, steps } = stepsOf(idx, ws, q);
  const days = q.days && q.days > 0 ? Math.min(q.days, 365) : RECENT_DAYS;
  const since = now - days * 86_400_000;
  const changes = modelChanges(src, steps);
  const fileCache = new Map<string, BacktrackFile>();
  const result: BacktrackStep[] = steps.map((s) => {
    const [files] = expandPaths(code, s.paths);
    const infos = files.map((f) => {
      let info = fileCache.get(f);
      if (!info) fileCache.set(f, (info = fileInfo(code, src.codeDir, f, since)));
      return info;
    });
    const modelChanges = changes.get(s.index) ?? [];
    const recent = infos.some((f) => f.uncommitted || f.commits.some((c) => Date.parse(c.date) >= since)) || modelChanges.some((c) => Date.parse(c.date) >= since);
    const { paths: _p, ...rest } = s;
    return { ...rest, files: infos, modelChanges, recent };
  });
  return {
    title,
    target,
    steps: result,
    recentDays: days,
    since: new Date(since).toISOString(),
    codeHistory: Boolean(src.codeDir && logFor(src.codeDir, ["."], 1).length),
    modelHistory: Boolean(src.modelDir && src.modelAt && logFor(src.modelDir, ["workspace.json"], 1).length),
  };
}
