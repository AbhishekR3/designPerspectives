/**
 * Coding plan for a draft (model first, then code): what to build, change, connect or remove,
 * derived from the draft's changes, and a progress check against the code (the code folder or a
 * git branch).
 *
 * Only what the code can show is checked automatically (no code scan beyond imports is built):
 *   - an added or re-mapped element: its code paths exist;
 *   - a removed element: its code paths are gone;
 *   - an added relationship between two mapped elements: some file of the source imports some
 *     file of the destination (removed relationship: no such import remains);
 *   - a planned code edit: the file exists / is gone / was changed.
 * Everything else (technology changes, flows, unmapped elements) is listed to check by hand.
 */

import { expandPaths, scanImports } from "./codeMap.js";
import { sha1, type CodePlan, type CodeSource } from "./codeFiles.js";
import type { Snapshot } from "./diff.js";
import { buildIndex, CODE_KEY, getJson, splitTech, type Index } from "./ops.js";
import type { ChangeSet, CodingPlan, DraftInfo, PlanItem } from "../shared/types.js";

const KIND: Record<string, string> = { person: "person", softwareSystem: "software system", container: "container", component: "component" };
/** Fields that need code work when they change; the rest are documentation in the model. */
const CODE_FIELDS = new Set(["technologies", "codePaths", "archType", "sourceId", "destinationId", "kind", "stages"]);

type Check =
  | { type: "paths-exist"; paths: string[] }
  | { type: "paths-gone"; paths: string[] }
  | { type: "imports"; from: string[]; to: string[]; want: boolean }
  | { type: "file"; path: string; change: "added" | "changed" | "deleted"; base: string | null; planned: string | null }
  | { type: "manual"; why: string }
  | { type: "none" };

interface Item extends Omit<PlanItem, "status" | "evidence" | "auto"> {
  check: Check;
}

function sectionOf(idx: Index, id: string): string {
  const chain = idx
    .ancestors(id)
    .slice(1)
    .reverse()
    .map((a) => idx.elements.get(a)!.name);
  return chain.length ? chain.join(" / ") : "Landscape";
}

const paths = (idx: Index, id: string) => getJson<string>(idx.elements.get(id), CODE_KEY);
const code = (ps: string[]) => ps.map((p) => `\`${p}\``).join(", ");

export function buildPlanItems(base: Snapshot, draft: Snapshot, cs: ChangeSet, plan: CodePlan | null): Item[] {
  const ia = buildIndex(base.workspace);
  const ib = buildIndex(draft.workspace);
  const items: Item[] = [];
  const removedEls = new Set(cs.elements.filter((e) => e.change === "removed").map((e) => e.id));

  const connections = (idx: Index, id: string) => {
    const out: string[] = [];
    for (const r of idx.relationships.values()) {
      const tech = splitTech(r.technology).join(", ");
      const text = `${r.description || "uses"}${tech ? ` [${tech}]` : ""}`;
      if (r.sourceId === id) out.push(`→ ${idx.elements.get(r.destinationId)?.name ?? r.destinationId}: ${text}`);
      else if (r.destinationId === id) out.push(`← ${idx.elements.get(r.sourceId)?.name ?? r.sourceId}: ${text}`);
    }
    return out;
  };

  for (const c of cs.elements) {
    if (c.change === "added") {
      const el = ib.el(c.id);
      const ps = paths(ib, c.id);
      const tech = splitTech(el.technology).join(", ");
      const conns = connections(ib, c.id);
      items.push({
        id: `el:${c.id}:add`,
        section: sectionOf(ib, c.id),
        kind: "build",
        title: `Build the ${KIND[ib.kindOf(c.id)]} "${el.name}"${tech ? ` (${tech})` : ""}`,
        details: [
          ...(el.description ? [el.description] : []),
          ps.length ? `Code: ${code(ps)}` : "Code: not mapped yet. Add code paths to it in the draft so progress can be checked.",
          ...(conns.length ? [`Connections: ${conns.join("; ")}`] : []),
        ],
        check: ps.length ? { type: "paths-exist", paths: ps } : { type: "manual", why: "no code paths in the draft" },
      });
    } else if (c.change === "removed") {
      const el = ia.el(c.id);
      // Children of a removed element are covered by removing the element.
      if (
        ia
          .ancestors(c.id)
          .slice(1)
          .some((a) => removedEls.has(a))
      )
        continue;
      const ps = paths(ia, c.id);
      items.push({
        id: `el:${c.id}:remove`,
        section: sectionOf(ia, c.id),
        kind: "remove",
        title: `Remove the ${KIND[ia.kindOf(c.id)]} "${el.name}"${ia.childrenOf(c.id).length ? " and everything inside it" : ""}`,
        details: [ps.length ? `Code to remove: ${code(ps)}` : "Code: not mapped; find and remove it by hand."],
        check: ps.length ? { type: "paths-gone", paths: ps } : { type: "manual", why: "no code paths" },
      });
    } else {
      const codeFields = c.fields.filter((f) => CODE_FIELDS.has(f.field));
      const el = ib.el(c.id);
      const detail = c.fields.map((f) => `${f.label}: ${show(f.before)} → ${show(f.after)}`);
      if (!codeFields.length) {
        items.push({
          id: `el:${c.id}:doc`,
          section: sectionOf(ib, c.id),
          kind: "model",
          title: `"${el.name}": ${c.fields.map((f) => f.label.toLowerCase()).join(", ")}`,
          details: detail,
          check: { type: "none" },
        });
        continue;
      }
      const newPaths = c.fields.find((f) => f.field === "codePaths");
      const ps = paths(ib, c.id);
      const tech = c.fields.find((f) => f.field === "technologies");
      items.push({
        id: `el:${c.id}:change`,
        section: sectionOf(ib, c.id),
        kind: "change",
        title: tech ? `Move "${el.name}" from ${show(tech.before)} to ${show(tech.after)}` : `Change "${el.name}": ${codeFields.map((f) => f.label.toLowerCase()).join(", ")}`,
        details: detail,
        check: newPaths && ps.length ? { type: "paths-exist", paths: ps } : { type: "manual", why: tech ? "technology is not visible to the import scan" : "not visible in the code paths" },
      });
    }
  }

  for (const c of cs.relationships) {
    const idx = c.change === "removed" ? ia : ib;
    const r = idx.rel(c.id);
    if (c.change === "removed" && (removedEls.has(r.sourceId) || removedEls.has(r.destinationId))) continue;
    const a = idx.elements.get(r.sourceId)!;
    const b = idx.elements.get(r.destinationId)!;
    const tech = splitTech(r.technology).join(", ");
    const pa = paths(idx, r.sourceId);
    const pb = paths(idx, r.destinationId);
    const mapped = pa.length > 0 && pb.length > 0;
    if (c.change === "changed") {
      const codeFields = c.fields.filter((f) => CODE_FIELDS.has(f.field));
      const detail = c.fields.map((f) => `${f.label}: ${show(f.before)} → ${show(f.after)}`);
      items.push({
        id: `rel:${c.id}:${codeFields.length ? "change" : "doc"}`,
        section: sectionOf(idx, r.sourceId),
        kind: codeFields.length ? "change" : "model",
        title: `${a.name} → ${b.name}: ${c.fields.map((f) => f.label.toLowerCase()).join(", ")}`,
        details: detail,
        check: codeFields.length ? { type: "manual", why: "protocol and technology are not visible to the import scan" } : { type: "none" },
      });
      continue;
    }
    const add = c.change === "added";
    items.push({
      id: `rel:${c.id}:${add ? "add" : "remove"}`,
      section: sectionOf(idx, r.sourceId),
      kind: add ? "connect" : "disconnect",
      title: `${add ? "Connect" : "Disconnect"} ${a.name} → ${b.name}${r.description ? `: ${r.description}` : ""}${tech ? ` [${tech}]` : ""}`,
      details: mapped ? [`Checked by imports from ${code(pa)} to ${code(pb)}.`] : ["Not checked automatically: both ends need code paths."],
      check: mapped ? { type: "imports", from: pa, to: pb, want: add } : { type: "manual", why: "an end has no code paths" },
    });
  }

  for (const c of cs.flows) {
    if (c.change === "removed") {
      items.push({ id: `flow:${c.id}:remove`, section: "Flows", kind: "model", title: `Flow "${c.name}" removed`, details: [], check: { type: "none" } });
      continue;
    }
    const view = draft.workspace.views.dynamicViews.find((v) => v.key === c.id);
    const steps = (view?.relationships ?? []).map((s, i) => {
      const r = ib.relationships.get(s.id);
      return r ? `${i + 1}. ${ib.elements.get(r.sourceId)?.name} → ${ib.elements.get(r.destinationId)?.name}: ${s.description || r.description || ""}` : "";
    });
    items.push({
      id: `flow:${c.id}:${c.change}`,
      section: "Flows",
      kind: "build",
      title: `${c.change === "added" ? "Implement" : "Update"} the flow "${c.name}"`,
      details: steps.filter(Boolean),
      check: { type: "manual", why: "flows are checked by testing the running system" },
    });
  }

  for (const s of cs.settings) items.push({ id: `setting:${s.id}`, section: "Settings", kind: "model", title: `${s.name} ${s.change}`, details: [], check: { type: "none" } });

  if (plan) {
    for (const [rel, p] of plan.files()) {
      items.push({
        id: `file:${rel}`,
        section: "Planned code edits",
        kind: "file",
        title: `${p.change === "added" ? "Create" : p.change === "deleted" ? "Delete" : "Change"} ${rel}`,
        details: p.change === "deleted" ? [] : ["The draft holds the planned content (open the file in the draft to see it)."],
        check: { type: "file", path: rel, change: p.change, base: p.base, planned: p.change === "deleted" ? null : plan.content(rel) },
      });
    }
  }
  return items;
}

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(", ") : "—";
  return typeof v === "string" ? v : JSON.stringify(v);
}

/** Evaluate one check against the code. */
function evaluate(check: Check, src: CodeSource): Pick<PlanItem, "status" | "evidence"> {
  switch (check.type) {
    case "none":
      return { status: "info", evidence: "" };
    case "manual":
      return { status: "manual", evidence: `Check by hand: ${check.why}.` };
    case "paths-exist": {
      const [files, missing] = expandPaths(src, check.paths);
      if (missing.length) return { status: "open", evidence: `Missing: ${missing.join(", ")}` };
      return files.length ? { status: "done", evidence: `${files.length} file${files.length === 1 ? "" : "s"} found` } : { status: "open", evidence: "The folder has no source files yet" };
    }
    case "paths-gone": {
      const left = check.paths.filter((p) => expandPaths(src, [p])[1].length === 0);
      return left.length ? { status: "open", evidence: `Still there: ${left.join(", ")}` } : { status: "done", evidence: "Removed" };
    }
    case "imports": {
      const [fa] = expandPaths(src, check.from);
      const [fb] = expandPaths(src, check.to);
      const setB = new Set(fb);
      const setA = new Set(fa);
      const cross = scanImports(src, [...new Set([...fa, ...fb])]).filter(([x, y]) => setA.has(x) && setB.has(y));
      if (check.want)
        return cross.length
          ? { status: "done", evidence: `${cross[0]![0]} imports ${cross[0]![1]}` }
          : { status: "open", evidence: "No import from the source's files to the destination's files yet" };
      return cross.length ? { status: "open", evidence: `Still imported: ${cross[0]![0]} → ${cross[0]![1]}` } : { status: "done", evidence: "No imports left" };
    }
    case "file": {
      const now = src.read(check.path);
      if (check.change === "deleted") return now === null ? { status: "done", evidence: "Deleted" } : { status: "open", evidence: "The file is still there" };
      if (now === null) return { status: "open", evidence: "The file does not exist yet" };
      if (now === check.planned) return { status: "done", evidence: "Matches the planned content" };
      if (check.change === "added" || check.base === null || sha1(now) !== check.base) return { status: "done", evidence: "Written (differs from the planned content)" };
      return { status: "open", evidence: "Not changed yet" };
    }
  }
}

/** The plan, optionally checked against `target` (the code folder or a branch). */
export function codingPlan(info: DraftInfo, items: Item[], target: CodeSource | null): CodingPlan {
  const out: PlanItem[] = items.map(({ check, ...it }) => {
    const auto = check.type !== "manual" && check.type !== "none";
    if (check.type === "none") return { ...it, auto, status: "info", evidence: "" };
    if (!target) return { ...it, auto, status: check.type === "manual" ? "manual" : "unchecked", evidence: check.type === "manual" ? `Check by hand: ${check.why}.` : "" };
    if (!target.hasRoot && auto) return { ...it, auto, status: "unchecked", evidence: "No code to check against" };
    return { ...it, auto, ...evaluate(check, target) };
  });
  const count = (s: string) => out.filter((i) => i.status === s).length;
  const plan: CodingPlan = {
    draftId: info.id,
    title: info.title,
    description: info.description,
    ...(info.author ? { author: info.author } : {}),
    branch: info.branch,
    link: info.link,
    checkedAgainst: target ? target.label : null,
    items: out,
    summary: { done: count("done"), open: count("open"), manual: count("manual"), unchecked: count("unchecked") },
    markdown: "",
  };
  plan.markdown = planMarkdown(plan);
  return plan;
}

const BOX: Record<string, string> = { done: "[x]", open: "[ ]", manual: "[ ]", unchecked: "[ ]" };

export function planMarkdown(p: CodingPlan): string {
  const out: string[] = [`# Coding plan: ${p.title}`, ""];
  if (p.description) out.push(p.description, "");
  const meta = [`Draft \`${p.draftId}\``];
  if (p.author) meta.push(`by ${p.author}`);
  if (p.branch) meta.push(`branch \`${p.branch}\``);
  if (p.link) meta.push(p.link);
  out.push(meta.join(" · "), "");
  if (p.checkedAgainst) {
    out.push(`Checked against ${p.checkedAgainst}: **${p.summary.done} done · ${p.summary.open} open · ${p.summary.manual} to check by hand**`, "");
  }
  const work = p.items.filter((i) => i.status !== "info");
  const docs = p.items.filter((i) => i.status === "info");
  if (!work.length) out.push("No code work: the draft changes only the model's documentation.", "");
  const sections = [...new Set(work.map((i) => i.section))];
  for (const s of sections) {
    out.push(`## ${s}`, "");
    for (const i of work.filter((x) => x.section === s)) {
      const note = i.status === "manual" ? " _(check by hand)_" : i.status === "open" && p.checkedAgainst ? " _(open)_" : "";
      out.push(`- ${BOX[i.status]} **${i.title}**${note}`);
      for (const d of i.details) out.push(`  - ${d}`);
      if (p.checkedAgainst && i.evidence && i.status !== "manual") out.push(`  - _${i.evidence}_`);
    }
    out.push("");
  }
  if (docs.length) {
    out.push("## Model-only changes (no code work)", "");
    for (const i of docs) out.push(`- ${i.title}`);
    out.push("");
  }
  return out.join("\n");
}
