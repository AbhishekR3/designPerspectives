/**
 * Reports for the command line and CI (Stage C3): `dp check` (problems in the model, its drafts
 * and its code mapping) and `dp diff` (what changed between two versions, as Markdown for a pull
 * request comment, or JSON).
 */

import { expandPaths } from "./code.js";
import { decisionWarnings } from "./decisions.js";
import { Drafts } from "./drafts.js";
import type { Snapshot } from "./diff.js";
import { buildIndex, CODE_KEY, getJson, type Index } from "./ops.js";
import type { Project } from "./store.js";
import type { ChangeSet, ObjectChange } from "../shared/types.js";

export interface CheckResult {
  errors: string[];
  warnings: string[];
}

/** Model rule errors in the main model and every draft; warnings for code paths that do not exist and
 *  for decisions about objects no longer in the model. */
export function checkProject(main: Project): CheckResult {
  const errors = [...main.loadErrors];
  const warnings: string[] = [];
  const drafts = new Drafts(main);
  for (const d of drafts.list()) {
    try {
      for (const e of drafts.get(d.id).loadErrors) errors.push(`Draft "${d.title}": ${e}`);
    } catch (e) {
      errors.push(`Draft "${d.title}" cannot be read: ${(e as Error).message}`);
    }
  }
  let idx: Index | null = null;
  try {
    idx = buildIndex(main.workspace);
  } catch {
    /* duplicate IDs: already an error */
  }
  if (idx) {
    const check = (label: string, paths: string[]) => {
      if (!paths.length) return;
      const [, missing] = expandPaths(main.codeRoot, paths);
      for (const m of missing) warnings.push(`${label} points to "${m}", which does not exist in ${main.codeRoot}.`);
    };
    for (const el of idx.elements.values()) check(`"${el.name}"`, getJson<string>(el, CODE_KEY));
    for (const r of idx.relationships.values()) {
      const name = `${idx.elements.get(r.sourceId)?.name ?? r.sourceId} → ${idx.elements.get(r.destinationId)?.name ?? r.destinationId}`;
      check(`Relationship "${name}"`, getJson<string>(r, CODE_KEY));
    }
    const i = idx;
    warnings.push(...decisionWarnings(main.decisions, (id) => i.elements.has(id) || i.relationships.has(id)));
  }
  return { errors, warnings };
}

// ------------------------------------------------------------------ dp diff

const SIGN: Record<string, string> = { added: "Added", changed: "Changed", removed: "Removed" };
const KIND: Record<string, string> = { person: "Person", softwareSystem: "Software system", container: "Container", component: "Component" };

/** Text for one Markdown table cell. */
function cell(v: unknown): string {
  const s = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
  return s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").replace(/</g, "&lt;").slice(0, 300);
}

function fields(c: ObjectChange): string {
  return c.fields.map((f) => f.label).join(", ");
}

/** The change set as Markdown, for a pull request comment. */
export function diffMarkdown(cs: ChangeSet, before: Snapshot, after: Snapshot, baseLabel: string, headLabel: string): string {
  const ia = buildIndex(before.workspace);
  const ib = buildIndex(after.workspace);
  const s = cs.summary;
  const out: string[] = ["## Architecture changes", "", `Compared ${baseLabel} with ${headLabel}.`, ""];
  if (s.added + s.changed + s.removed === 0 && !cs.code.length) {
    out.push(s.layout ? `No model changes (${s.layout} layout change${s.layout === 1 ? "" : "s"} only).` : "No architecture changes.");
    return out.join("\n") + "\n";
  }
  out.push(
    `**${s.added} added · ${s.changed} changed · ${s.removed} removed**${s.code ? ` · ${s.code} code file${s.code === 1 ? "" : "s"}` : ""}${s.layout ? ` (and ${s.layout} layout changes)` : ""}`,
    "",
  );

  const where = (id: string, removed: boolean) => {
    const idx = removed ? ia : ib;
    const p = idx.parentOf(id);
    return p ? (idx.elements.get(p)?.name ?? p) : "";
  };
  if (cs.elements.length) {
    out.push("### Elements", "", "| Change | Type | Name | In | What changed |", "|---|---|---|---|---|");
    for (const c of cs.elements) {
      out.push(`| ${SIGN[c.change]} | ${cell(KIND[c.kind] ?? c.kind)} | ${cell(c.name)} | ${cell(where(c.id, c.change === "removed"))} | ${cell(fields(c))} |`);
    }
    out.push("");
  }
  if (cs.relationships.length) {
    out.push("### Relationships", "", "| Change | Relationship | What changed |", "|---|---|---|");
    for (const c of cs.relationships) out.push(`| ${SIGN[c.change]} | ${cell(c.name)} | ${cell(fields(c))} |`);
    out.push("");
  }
  if (cs.flows.length) {
    out.push("### Flows", "", "| Change | Flow | What changed |", "|---|---|---|");
    for (const c of cs.flows) out.push(`| ${SIGN[c.change]} | ${cell(c.name)} | ${cell(fields(c))} |`);
    out.push("");
  }
  if (cs.decisions.length) {
    out.push("### Decisions", "", "| Change | Decision | What changed |", "|---|---|---|");
    for (const c of cs.decisions) out.push(`| ${SIGN[c.change]} | ${cell(c.name)} | ${cell(fields(c))} |`);
    out.push("");
  }
  if (cs.settings.length) {
    out.push("### Settings", "", "| Change | Setting |", "|---|---|");
    for (const c of cs.settings) out.push(`| ${SIGN[c.change]} | ${cell(c.name)} |`);
    out.push("");
  }
  if (cs.code.length) {
    out.push("### Code", "", "Files behind objects mapped to code (`dp.code.paths`).", "", "| Object | File | Change |", "|---|---|---|");
    for (const c of cs.code) for (const f of c.files) out.push(`| ${cell(c.ownerName)} | \`${cell(f.path)}\` | ${SIGN[f.change]} |`);
    const imports = cs.code.flatMap((c) => c.imports.map((i) => ({ ...i, owner: c.ownerName })));
    if (imports.length) {
      out.push("", "| Object | Import | Change |", "|---|---|---|");
      for (const i of imports) out.push(`| ${cell(i.owner)} | \`${cell(i.from)}\` → \`${cell(i.to)}\` | ${SIGN[i.change]} |`);
    }
    out.push("");
  }
  // Field details for changed elements and relationships, collapsed.
  const detailed = [...cs.elements, ...cs.relationships].filter((c) => c.change === "changed" && c.fields.some((f) => f.field !== "other"));
  if (detailed.length) {
    out.push("<details><summary>Before and after</summary>", "", "| Object | Field | Before | After |", "|---|---|---|---|");
    for (const c of detailed) {
      for (const f of c.fields) if (f.field !== "other") out.push(`| ${cell(c.name)} | ${cell(f.label)} | ${cell(f.before)} | ${cell(f.after)} |`);
    }
    out.push("", "</details>", "");
  }
  return out.join("\n");
}
