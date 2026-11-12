import { LineCounter, isMap, isNode, isScalar, parseDocument, stringify } from "yaml";
import type { Document, YAMLError } from "yaml";
import type { Diagnostic } from "@designperspectives/contracts";

export type DocPath = readonly PropertyKey[];

/** A parsed YAML text plus what is needed to map nodes back to file positions. */
export interface ParsedYaml {
  doc: Document;
  lineCounter: LineCounter;
  /** Lines before the YAML text inside its file (front matter starts after the opening `---`). */
  lineOffset: number;
}

export interface Position {
  line: number;
  column: number;
}

const PARSE_OPTIONS = { version: "1.2", schema: "core", prettyErrors: false, uniqueKeys: true } as const;

const PRINT_OPTIONS = {
  version: "1.2",
  schema: "core",
  indent: 2,
  indentSeq: true,
  lineWidth: 0,
  minContentWidth: 0,
  aliasDuplicateObjects: false,
} as const;

/** CRLF → LF and drop a leading byte-order mark. */
export function normalizeNewlines(text: string): string {
  return text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
}

export function parseYaml(text: string, lineOffset: number): ParsedYaml {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { ...PARSE_OPTIONS, lineCounter }) as Document;
  return { doc, lineCounter, lineOffset };
}

export function positionAt(parsed: ParsedYaml, offset: number): Position {
  const { line, col } = parsed.lineCounter.linePos(offset);
  return { line: line + parsed.lineOffset, column: col };
}

/** Syntax errors (severity error) and warnings of a parsed document, as diagnostics. */
export function syntaxDiagnostics(parsed: ParsedYaml, file: string): Diagnostic[] {
  const toDiagnostic = (severity: Diagnostic["severity"]) => (e: YAMLError): Diagnostic => ({
    severity,
    code: "sidecar/syntax",
    message: e.message,
    file,
    ...positionAt(parsed, e.pos[0]),
  });
  return [...parsed.doc.errors.map(toDiagnostic("error")), ...parsed.doc.warnings.map(toDiagnostic("warning"))];
}

function rangeStart(node: unknown): number | undefined {
  return isNode(node) && node.range ? node.range[0] : undefined;
}

/** Offset of the node at `path`, or of its nearest existing ancestor (the document start as last resort). */
export function nodeOffset(doc: Document, path: DocPath): number {
  for (let i = path.length; i > 0; i--) {
    const start = rangeStart(doc.getIn(path.slice(0, i) as unknown[], true));
    if (start !== undefined) return start;
  }
  return rangeStart(doc.contents) ?? 0;
}

/** Offset of the key `key` of the mapping at `path` (falls back to the mapping itself). */
export function keyOffset(doc: Document, path: DocPath, key: string): number {
  const map = path.length > 0 ? doc.getIn(path as unknown[], true) : doc.contents;
  const pair = isMap(map) ? map.items.find((p) => isScalar(p.key) && String(p.key.value) === key) : undefined;
  return rangeStart(pair?.key) ?? nodeOffset(doc, path);
}

/** Canonical YAML text of an already-canonicalized value: LF, 2-space indent, no folding, no aliases. */
export function printYaml(canonical: unknown): string {
  return ensureSingleTrailingNewline(stringify(canonical, PRINT_OPTIONS));
}

export function ensureSingleTrailingNewline(text: string): string {
  const trimmed = text.replace(/\n+$/, "");
  return trimmed === "" ? "" : `${trimmed}\n`;
}
