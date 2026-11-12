/** Maps validation diagnostics (which carry a subject id) to file:line in the canonical model files. */
import type { Diagnostic, SourceFile } from "@designperspectives/contracts";

interface Position {
  file: string;
  line: number;
}

function indexDeclarations(files: readonly SourceFile[]): Map<string, Position> {
  const index = new Map<string, Position>();
  for (const f of files) {
    const stack: string[] = [];
    f.content.split("\n").forEach((text, i) => {
      const trimmed = text.trim();
      const decl = /^([a-zA-Z][\w-]*) = /.exec(trimmed);
      const rel = /^([a-z][\w.-]*) -\[(\w+)\]-> ([a-z][\w.-]*) /.exec(trimmed);
      const view = /^(?:dynamic |deployment )?view ([\w-]+)/.exec(trimmed);
      const depth = (text.length - text.trimStart().length) / 2 - 1;
      stack.length = Math.max(depth, 0);
      if (decl) {
        stack[depth] = decl[1]!;
        index.set(stack.slice(0, depth + 1).join("."), { file: f.path, line: i + 1 });
      }
      if (rel) index.set(`${rel[1]}->${rel[3]}#${rel[2]}`, { file: f.path, line: i + 1 });
      if (view) index.set(`view:${view[1]}`, { file: f.path, line: i + 1 });
    });
  }
  return index;
}

export function locateSubjects(diagnostics: readonly Diagnostic[], files: readonly SourceFile[]): Diagnostic[] {
  const index = indexDeclarations(files);
  return diagnostics.map((d) => {
    if (d.file || !d.subject) return d;
    const pos = index.get(d.subject) ?? index.get(`view:${d.subject}`) ?? index.get(d.subject.replace(/:[^:]+$/, ""));
    return pos ? { ...d, file: pos.file, line: pos.line } : d;
  });
}
