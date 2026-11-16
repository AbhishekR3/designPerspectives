/**
 * Functions, methods and classes in a source file, found line by line with patterns (no parser):
 * TypeScript / JavaScript and Python. Used by backtracking to list the code behind a step and to
 * say which functions changed recently. Each entry runs from its line to the line before the next
 * entry (an approximation: nested functions end their parent's range).
 */

export interface FoundFunction {
  name: string;
  kind: "function" | "method" | "class";
  line: number;
  end: number;
}

const KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "return", "function", "constructor", "else", "do", "try", "with"]);

const JS: [RegExp, FoundFunction["kind"]][] = [
  [/^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*[<(]/, "function"],
  [/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*(?::\s*[^=]+)?=>|[A-Za-z_$][\w$]*\s*=>)/, "function"],
  [/^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/, "class"],
  [/^\s+(?:(?:public|private|protected|static|async|readonly|override|get|set)\s+)*([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\([^)]*\)\s*(?::\s*[^{;]+)?\{\s*$/, "method"],
];
const PY: [RegExp, FoundFunction["kind"]][] = [
  [/^(\s*)(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/, "function"],
  [/^(\s*)class\s+([A-Za-z_]\w*)/, "class"],
];

export function findFunctions(file: string, text: string): FoundFunction[] {
  const lines = text.split("\n");
  const py = /\.py$/i.test(file);
  const js = /\.(m?[jt]sx?|cjs|mts|cts)$/i.test(file);
  if (!py && !js) return [];
  const found: FoundFunction[] = [];
  lines.forEach((l, i) => {
    for (const [re, kind] of py ? PY : JS) {
      const m = re.exec(l);
      if (!m) continue;
      const name = py ? m[2]! : m[1]!;
      if (KEYWORDS.has(name)) continue;
      const nested = py ? m[1]!.length > 0 : kind === "method";
      found.push({ name, kind: py && kind === "function" && nested ? "method" : kind, line: i + 1, end: lines.length });
      break;
    }
  });
  for (let i = 0; i < found.length - 1; i++) found[i]!.end = Math.max(found[i]!.line, found[i + 1]!.line - 1);
  return found;
}
