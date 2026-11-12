import { sortDiagnostics } from "@designperspectives/contracts";
import type { Diagnostic, SidecarPattern, SourceFile } from "@designperspectives/contracts";
import type { z } from "zod";
import { splitFrontMatter } from "./frontmatter.js";
import type { FrontMatterSplit } from "./frontmatter.js";
import { DEFAULT_DECISIONS_DIR, SETTINGS_PATH, classifySidecarPath } from "./paths.js";
import { SIDECAR_SPECS } from "./specs.js";
import type { SidecarSpec } from "./specs.js";
import type { FileContext, LoadState } from "./context.js";
import { compareStrings, emptySidecarSet } from "./types.js";
import type { SidecarSet } from "./types.js";
import { keyOffset, nodeOffset, normalizeNewlines, parseYaml, positionAt, syntaxDiagnostics } from "./yaml-io.js";
import type { DocPath } from "./yaml-io.js";

export interface LoadSidecarsResult {
  sidecars: SidecarSet;
  diagnostics: Diagnostic[];
}

/**
 * Parses and validates every sidecar among `files` (paths relative to `architecture/`; other paths are
 * ignored). Never throws for user content. A file contributes to the set only when it has no errors,
 * except that duplicate relationship ids drop only the later duplicates. Independent of input order.
 */
export function loadSidecars(files: readonly SourceFile[]): LoadSidecarsResult {
  const state: LoadState = { set: emptySidecarSet(), diagnostics: [] };
  const unique = uniqueByPath(files, state.diagnostics);
  // Settings first: their `decisions` folder decides which paths are ADRs.
  const [settings, rest] = partition(unique, (f) => f.path === SETTINGS_PATH);
  settings.forEach((file) => loadFile(state, file, "designperspectives.yaml"));
  const decisionsDir = state.set.settings?.decisions ?? DEFAULT_DECISIONS_DIR;
  for (const file of rest) {
    const pattern = classifySidecarPath(file.path, decisionsDir);
    if (pattern) loadFile(state, file, pattern);
  }
  return { sidecars: state.set, diagnostics: sortDiagnostics(state.diagnostics) };
}

function partition<T>(items: readonly T[], predicate: (item: T) => boolean): [T[], T[]] {
  return [items.filter(predicate), items.filter((item) => !predicate(item))];
}

/** Sorts by path (then content, so that duplicates resolve deterministically) and drops repeated paths. */
function uniqueByPath(files: readonly SourceFile[], diagnostics: Diagnostic[]): SourceFile[] {
  const sorted = [...files].sort((a, b) => compareStrings(a.path, b.path) || compareStrings(a.content, b.content));
  return sorted.filter((file, i) => {
    const repeated = i > 0 && sorted[i - 1]?.path === file.path;
    if (repeated) diagnostics.push(fileDiagnostic(file.path, "sidecar/duplicate-id", "the same path was supplied more than once"));
    return !repeated;
  });
}

function fileDiagnostic(file: string, code: string, message: string): Diagnostic {
  return { severity: "error", code, message, file, line: 1, column: 1 };
}

function loadFile(state: LoadState, file: SourceFile, pattern: SidecarPattern): void {
  try {
    loadFileUnsafe(state, file, pattern);
  } catch (error) {
    // Defensive: user content must never make the loader throw.
    state.diagnostics.push(fileDiagnostic(file.path, "sidecar/syntax", `could not be read: ${String(error)}`));
  }
}

function loadFileUnsafe(state: LoadState, file: SourceFile, pattern: SidecarPattern): void {
  const spec = SIDECAR_SPECS[pattern];
  const source = sourceOf(spec, normalizeNewlines(file.content));
  if (!source) {
    state.diagnostics.push(fileDiagnostic(file.path, "sidecar/syntax", "missing YAML front matter (--- … ---)"));
    return;
  }
  const ctx: FileContext = { state, file: file.path, parsed: parseYaml(source.yaml, source.lineOffset) };
  const value = readValue(ctx);
  if (value !== undefined) validateAndStore(ctx, spec, value.data, source.body);
}

interface SidecarSource extends FrontMatterSplit {
  /** Lines of the file before the YAML text. */
  lineOffset: number;
}

function sourceOf(spec: SidecarSpec, text: string): SidecarSource | undefined {
  if (!spec.markdown) return { yaml: text, body: "", lineOffset: 0 };
  const split = splitFrontMatter(text);
  return split && { ...split, lineOffset: 1 };
}

function validateAndStore(ctx: FileContext, spec: SidecarSpec, data: unknown, body: string): void {
  const result = spec.schema.safeParse(data);
  if (result.success) spec.store(ctx, result.data, body);
  else result.error.issues.forEach((issue) => ctx.state.diagnostics.push(issueDiagnostic(ctx, issue)));
}

/** The document as plain JS, or `undefined` (with diagnostics) when it has syntax errors. */
function readValue(ctx: FileContext): { data: unknown } | undefined {
  const diagnostics = syntaxDiagnostics(ctx.parsed, ctx.file);
  ctx.state.diagnostics.push(...diagnostics);
  if (diagnostics.some((d) => d.severity === "error")) return undefined;
  return { data: ctx.parsed.doc.toJS({ maxAliasCount: 100 }) };
}

function dotted(path: DocPath): string {
  return path.length > 0 ? path.map(String).join(".") : "(root)";
}

function issueDiagnostic(ctx: FileContext, issue: z.core.$ZodIssue): Diagnostic {
  const { doc } = ctx.parsed;
  const unknownKey = issue.code === "unrecognized_keys" ? issue.keys[0] : undefined;
  const offset = unknownKey === undefined ? nodeOffset(doc, issue.path) : keyOffset(doc, issue.path, unknownKey);
  return {
    severity: "error",
    code: "sidecar/schema",
    message: `${dotted(issue.path)}: ${issue.message}`,
    file: ctx.file,
    ...positionAt(ctx.parsed, offset),
  };
}
