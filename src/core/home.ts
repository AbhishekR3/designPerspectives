/**
 * The home page summary (DEC-052): a card per project, what needs a look, what is being watched,
 * the latest decisions, and (in a hub) how the shared catalog is used. Read-only; computed from
 * each project's main model, cached by its revision.
 */

import { decisionSummary } from "./decisions.js";
import { diagram as staticDiagram } from "./diagrams.js";
import { NO_CODE } from "./codefs.js";
import type { Drafts } from "./drafts.js";
import { logFor } from "./git.js";
import { listFlows } from "./flows.js";
import { buildIndex, CATALOG_KEY, getProps } from "./ops.js";
import { checkProject } from "./report.js";
import type { Project } from "./store.js";
import { decisionFlags, isoDay } from "../shared/decisionFlags.js";
import type { AttentionItem, DecisionSummary, HomeSummary, ProjectCard, Thumb, WatchItem } from "../shared/types.js";

/** One project as the home page sees it. `load` throws when the model cannot be read. */
export interface HomeProject {
  id: string;
  name: string;
  catalog: boolean;
  load(): { project: Project; drafts: Drafts };
}

const THUMB_W = 240;
const THUMB_H = 140;
/** Upcoming dates within this many days are listed under "Watching". */
const WATCH_DAYS = 120;

interface Texts {
  errors: string[];
  warnings: string[];
  drafts: { id: string; title: string; behind: number }[];
}
interface CardResult {
  card: ProjectCard;
  decisions: DecisionSummary[];
  texts: Texts;
  project: Project | null;
}
const cardCache = new WeakMap<Project, { key: string; card: ProjectCard; decisions: DecisionSummary[]; texts: Texts }>();
const logCache = new Map<string, { at: number; v: ProjectCard["lastCommit"] }>();

function lastCommit(dir: string): ProjectCard["lastCommit"] {
  const hit = logCache.get(dir);
  if (hit && Date.now() - hit.at < 30_000) return hit.v;
  const e = logFor(dir, ["."], 1)[0];
  const v = e ? { sha: e.sha, date: e.date, author: e.author, subject: e.subject } : null;
  logCache.set(dir, { at: Date.now(), v });
  return v;
}

/** The landscape as boxes and lines scaled into a small frame (stored positions; a grid where there are none). */
export function thumbnail(project: Project): Thumb | null {
  let d;
  try {
    d = staticDiagram(project.workspace, "landscape", project.sidecar, NO_CODE);
  } catch {
    return null;
  }
  if (!d || !d.nodes.length) return null;
  const cols = Math.ceil(Math.sqrt(d.nodes.length));
  const raw = d.nodes.map((n, i) => {
    const w = n.size?.w ?? 200;
    const h = n.size?.h ?? 110;
    const p = n.position ?? { x: (i % cols) * 280, y: Math.floor(i / cols) * 180 };
    return { id: n.id, x: p.x, y: p.y, w, h, kind: n.kind, external: n.external };
  });
  const minX = Math.min(...raw.map((b) => b.x));
  const minY = Math.min(...raw.map((b) => b.y));
  const maxX = Math.max(...raw.map((b) => b.x + b.w));
  const maxY = Math.max(...raw.map((b) => b.y + b.h));
  const pad = 8;
  // Capped, so a landscape of three boxes still looks like a small picture of a diagram.
  const s = Math.min((THUMB_W - 2 * pad) / Math.max(1, maxX - minX), (THUMB_H - 2 * pad) / Math.max(1, maxY - minY), 0.3);
  const ox = (THUMB_W - (maxX - minX) * s) / 2;
  const oy = (THUMB_H - (maxY - minY) * s) / 2;
  const r = (v: number) => Math.round(v * 10) / 10;
  const boxes = raw.map((b) => ({ x: r(ox + (b.x - minX) * s), y: r(oy + (b.y - minY) * s), w: r(b.w * s), h: r(b.h * s), kind: b.kind, external: b.external }));
  const at = new Map(raw.map((b, i) => [b.id, boxes[i]!]));
  const lines: Thumb["lines"] = [];
  for (const e of d.edges) {
    const a = at.get(e.source);
    const b = at.get(e.target);
    if (a && b && a !== b) lines.push([r(a.x + a.w / 2), r(a.y + a.h / 2), r(b.x + b.w / 2), r(b.y + b.h / 2)]);
  }
  return { w: THUMB_W, h: THUMB_H, boxes, lines };
}

/** A project's card and decision summaries, cached until its model or its drafts change. */
export function projectCard(p: HomeProject): CardResult {
  let project: Project;
  let drafts: Drafts;
  try {
    ({ project, drafts } = p.load());
    project.reloadIfChanged();
  } catch (e) {
    return { card: errorCard(p, (e as Error).message), decisions: [], texts: { errors: [], warnings: [], drafts: [] }, project: null };
  }
  const draftList = drafts.list();
  const key = `${project.revision}|${draftList.map((d) => `${d.id}:${d.behind}`).join(",")}`;
  const hit = cardCache.get(project);
  if (hit?.key === key) return { card: { ...hit.card, lastCommit: lastCommit(project.dir) }, decisions: hit.decisions, texts: hit.texts, project };

  const ws = project.workspace;
  let counts: ProjectCard["counts"] = { people: 0, systems: 0, containers: 0, components: 0, relationships: 0, flows: 0, decisions: project.decisions.length };
  let linked = 0;
  try {
    const idx = buildIndex(ws);
    for (const id of idx.elements.keys()) {
      const k = idx.kindOf(id);
      if (k === "person") counts.people++;
      else if (k === "softwareSystem") counts.systems++;
      else if (k === "container") counts.containers++;
      else counts.components++;
      if (getProps(idx.el(id))[CATALOG_KEY]) linked++;
    }
    counts = { ...counts, relationships: idx.relationships.size, flows: listFlows(ws).length };
  } catch {
    /* duplicate IDs: reported as an error below */
  }
  const check = checkProject(project);
  const card: ProjectCard = {
    id: p.id,
    name: p.name || ws.name,
    description: ws.description || "",
    error: null,
    catalog: p.catalog,
    counts,
    linked,
    drafts: { open: draftList.length, behind: draftList.filter((d) => d.behind > 0).length },
    problems: { errors: check.errors.length, warnings: check.warnings.length },
    lastCommit: null,
    thumb: thumbnail(project),
  };
  const decisions = project.decisions.map(decisionSummary);
  // Problems and drafts behind main are listed under "Needs attention".
  const texts: Texts = { errors: check.errors, warnings: check.warnings, drafts: draftList.filter((d) => d.behind > 0).map((d) => ({ id: d.id, title: d.title, behind: d.behind })) };
  cardCache.set(project, { key, card, decisions, texts });
  return { card: { ...card, lastCommit: lastCommit(project.dir) }, decisions, texts, project };
}

function errorCard(p: HomeProject, error: string): ProjectCard {
  return {
    id: p.id,
    name: p.name || p.id,
    description: "",
    error,
    catalog: p.catalog,
    counts: { people: 0, systems: 0, containers: 0, components: 0, relationships: 0, flows: 0, decisions: 0 },
    linked: 0,
    drafts: { open: 0, behind: 0 },
    problems: { errors: 1, warnings: 0 },
    lastCommit: null,
    thumb: null,
  };
}

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + n);
  return isoDay(d);
};

/** Everything the home page shows. `extra`: attention items from the shared catalog (hub). */
export function homeSummary(name: string, mode: "single" | "hub", projects: HomeProject[], extra: { attention?: AttentionItem[]; shared?: HomeSummary["shared"] } = {}): HomeSummary {
  const today = isoDay();
  const soon = addDays(today, WATCH_DAYS);
  const cards: ProjectCard[] = [];
  const attention: AttentionItem[] = [];
  const watch: WatchItem[] = [];
  const decisions: HomeSummary["decisions"] = [];

  for (const p of projects) {
    const { card, decisions: decs, texts, project } = projectCard(p);
    cards.push(card);
    if (card.error || !project) {
      attention.push({ kind: "errors", severity: "error", project: p.id, text: `The model cannot be loaded: ${card.error}`, target: null });
      continue;
    }
    if (texts.errors.length) {
      attention.push({
        kind: "errors",
        severity: "error",
        project: p.id,
        text: `${texts.errors.length} model problem${texts.errors.length === 1 ? "" : "s"}: ${texts.errors[0]}`,
        target: { type: "diagram", id: "landscape" },
      });
    }
    if (texts.warnings.length) {
      attention.push({
        kind: "warnings",
        severity: "info",
        project: p.id,
        text: `${texts.warnings.length} warning${texts.warnings.length === 1 ? "" : "s"} from dp check: ${texts.warnings[0]}`,
        target: null,
      });
    }
    for (const d of texts.drafts) {
      attention.push({
        kind: "draft-behind",
        severity: "info",
        project: p.id,
        text: `Draft "${d.title}" is ${d.behind} change${d.behind === 1 ? "" : "s"} behind main`,
        target: { type: "draft", id: d.id },
      });
    }
    for (const d of decs) {
      decisions.push({ ...d, project: p.id });
      const flags = decisionFlags(d, today);
      for (const f of flags) {
        if (f.kind === "proposed" && flags.some((x) => x.tone === "warn")) continue; // one line per decision is enough
        attention.push({ kind: "decision", severity: f.tone === "warn" ? "warn" : "info", project: p.id, text: `${d.id} ${d.title}: ${f.text.toLowerCase()}`, target: { type: "decision", id: d.id } });
      }
      if (d.status !== "accepted" && d.status !== "proposed") continue;
      if (d.reviewBy > today && d.reviewBy <= soon) watch.push({ project: p.id, decision: d.id, title: d.title, kind: "review", text: "Review", date: d.reviewBy });
      if (d.kind === "deferred" && d.decideBy > today && d.decideBy <= soon) watch.push({ project: p.id, decision: d.id, title: d.title, kind: "decide", text: "Decide by", date: d.decideBy });
      if (d.kind === "time-boxed" && d.expires > today && d.expires <= soon) watch.push({ project: p.id, decision: d.id, title: d.title, kind: "expires", text: "Expires", date: d.expires });
    }
    // Open triggers need the full records.
    for (const d of project.decisions) {
      if (d.error !== undefined || (d.status !== "accepted" && d.status !== "proposed")) continue;
      for (const t of d.triggers)
        if (!t.met) watch.push({ project: p.id, decision: d.id, title: d.title, kind: "trigger", text: t.alternative ? `${t.text} (→ ${t.alternative})` : t.text, date: null });
    }
  }
  attention.push(...(extra.attention ?? []));
  const order = { error: 0, warn: 1, info: 2 } as const;
  attention.sort((a, b) => order[a.severity] - order[b.severity]);
  watch.sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
  decisions.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  return { name, mode, projects: cards, attention, watch, decisions: decisions.slice(0, 20), shared: extra.shared ?? null };
}
