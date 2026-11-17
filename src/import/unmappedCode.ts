/**
 * `dp check` warning for source files that sit under a mapped container but that no component maps
 * (DEC-051). Read from the stored scan (`evidence.json`), so it needs no file walk, and only once an import
 * has been started (a scan exists) and only when the intake's depth reaches components (C3 or C4). Files
 * on the import ignore list do not count. A warning, never an error.
 */

import { buildIndex, CODE_KEY, getJson } from "../core/modelEdits.js";
import type { Workspace } from "../core/workspace.js";
import { readState } from "./analysis.js";
import { readIntake } from "./intake.js";
import { compileGlob, globMatches, readEvidence } from "./scan.js";

const covers = (codePath: string, rel: string): boolean => {
  const c = codePath.replace(/^\.\/+/, "").replace(/\/+$/, "");
  return c !== "" && c !== "." && (rel === c || rel.startsWith(`${c}/`));
};

export function unmappedCodeWarnings(projectRoot: string, ws: Workspace): string[] {
  const evidence = readEvidence(projectRoot);
  if (!evidence) return [];
  const { intake } = readIntake(projectRoot);
  if (intake.depth !== "c3" && intake.depth !== "c4") return [];
  let ignore: string[] = [];
  try {
    ignore = readState(projectRoot).ignore;
  } catch {
    /* an unreadable ignore list: nothing is ignored */
  }
  const globs = ignore.filter((g) => !/^c[1-4]:/.test(g)).map((g) => compileGlob(g));
  let idx;
  try {
    idx = buildIndex(ws);
  } catch {
    return []; // duplicate IDs: already an error
  }
  const pathsOf = (id: string): string[] => getJson<string>(idx.el(id), CODE_KEY).map(String);
  const containers = [...idx.elements.keys()].filter((id) => idx.kindOf(id) === "container").filter((id) => pathsOf(id).length);
  const components = [...idx.elements.keys()].filter((id) => idx.kindOf(id) === "component").flatMap(pathsOf);
  const files = evidence.facts.filter((f) => f.level === "c4" && f.kind === "source-file").map((f) => f.path);
  const out: string[] = [];
  for (const id of containers) {
    const own = pathsOf(id);
    const loose = files.filter((f) => own.some((p) => covers(p, f)) && !components.some((p) => covers(p, f)) && !globs.some((g) => globMatches(g, f)));
    if (!loose.length) continue;
    const shown = loose.slice(0, 3).join(", ");
    out.push(`Container "${idx.el(id).name}" has ${loose.length} source file${loose.length === 1 ? "" : "s"} that no component maps (unmapped code): ${shown}${loose.length > 3 ? ", ..." : ""}.`);
  }
  return out;
}
