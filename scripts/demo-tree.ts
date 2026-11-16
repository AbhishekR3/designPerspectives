/** Write a folder's whole content so that a reader copying it at the same time never sees a half-written file. */
import fs from "node:fs";
import path from "node:path";
import { atomicWrite } from "../src/core/util.js";

/** Every file under `dir`, as `/`-joined paths relative to it. */
function filesUnder(dir: string, prefix = ""): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(path.join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`]));
}

/** Remove folders under `dir` that hold nothing (not `dir` itself). */
function pruneEmpty(dir: string): void {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const sub = path.join(dir, e.name);
    pruneEmpty(sub);
    if (fs.readdirSync(sub).length === 0) fs.rmdirSync(sub);
  }
}

/**
 * Make `dir` hold exactly `files` (relative path to text). Each file is written atomically (a temporary
 * file renamed into place) and the folder is never removed and recreated, so it is never missing or
 * half-written for a concurrent copy; files that are no longer wanted are deleted afterwards.
 */
export function writeTree(dir: string, files: Map<string, string>): void {
  for (const [rel, text] of files) atomicWrite(path.join(dir, rel), text);
  for (const rel of filesUnder(dir)) if (!files.has(rel)) fs.rmSync(path.join(dir, rel), { force: true });
  if (fs.existsSync(dir)) pruneEmpty(dir);
}

/** The files under `dir` as a map for `writeTree`, with `prefix` put before each path. */
export function readTree(dir: string, prefix = ""): Map<string, string> {
  return new Map(filesUnder(dir).map((rel) => [`${prefix}${rel}`, fs.readFileSync(path.join(dir, rel), "utf-8")]));
}
