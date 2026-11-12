/**
 * Maps validation diagnostics (which carry a subject id) to file:line in the model files as they are on disk.
 * Uses a brace-depth scanner rather than indentation, so hand-edited (non-canonical) files are located correctly.
 */
import type { Diagnostic, SourceFile } from "@designperspectives/contracts";

interface Position {
  file: string;
  line: number;
}

const DECL = /^([a-zA-Z][\w-]*)\s*=\s*[a-zA-Z]/;
const REL = /^([a-z][\w.-]*)\s+-\[(\w+)\]->\s+([a-z][\w.-]*)\s/;
const VIEW = /^(?:dynamic |deployment )?view\s+([\w-]+)/;

/** Removes string literals so braces inside titles or descriptions are not counted. */
const stripStrings = (s: string): string => s.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/\/\/.*$/, "");

/** Brace delta of a line: `{` opens, `}` closes. */
function braceDelta(code: string): number {
  return (code.match(/\{/g)?.length ?? 0) - (code.match(/\}/g)?.length ?? 0);
}

interface ScanState {
  /** Declared name at each open brace depth (undefined for anonymous blocks such as `model {`). */
  names: Array<string | undefined>;
}

function recordLine(code: string, state: ScanState, put: (key: string) => void): void {
  const decl = DECL.exec(code);
  const rel = REL.exec(code);
  const view = VIEW.exec(code);
  if (decl) put(fullId(state, decl[1]!));
  if (rel) put(`${rel[1]}->${rel[3]}#${rel[2]}`);
  if (view) put(`view:${view[1]}`);
  updateStack(code, state, decl?.[1]);
}

function fullId(state: ScanState, name: string): string {
  return [...state.names.filter((n): n is string => !!n), name].join(".");
}

function updateStack(code: string, state: ScanState, declared: string | undefined): void {
  const delta = braceDelta(code);
  for (let i = 0; i < delta; i++) state.names.push(i === 0 ? declared : undefined);
  for (let i = 0; i > delta; i--) state.names.pop();
}

function indexDeclarations(files: readonly SourceFile[]): Map<string, Position> {
  const index = new Map<string, Position>();
  for (const f of files) {
    const state: ScanState = { names: [] };
    f.content.split("\n").forEach((text, i) => {
      recordLine(stripStrings(text.trim()), state, (key) => {
        if (!index.has(key)) index.set(key, { file: f.path, line: i + 1 });
      });
    });
  }
  return index;
}

function lookup(index: Map<string, Position>, subject: string): Position | undefined {
  return index.get(subject) ?? index.get(`view:${subject}`) ?? index.get(subject.replace(/:[^:]+$/, ""));
}

export function locateSubjects(diagnostics: readonly Diagnostic[], files: readonly SourceFile[]): Diagnostic[] {
  const index = indexDeclarations(files);
  return diagnostics.map((d) => {
    const pos = !d.file && d.subject ? lookup(index, d.subject) : undefined;
    return pos ? { ...d, file: pos.file, line: pos.line } : d;
  });
}
