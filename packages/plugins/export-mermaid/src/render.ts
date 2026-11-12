/** Renders a Diagram as Mermaid flowchart text (not the experimental Mermaid C4 syntax). */
import type { Diagram, DiagramNode } from "./diagram.js";

const RESERVED = new Set(["end", "graph", "flowchart", "subgraph", "direction", "style", "class", "classDef", "click", "linkStyle", "default"]);

const ENTITIES: Record<string, string> = { "#": "#35;", '"': "#quot;", "<": "#lt;", ">": "#gt;", "|": "#124;", "`": "#96;" };

/** Escapes text for a quoted Mermaid label (Mermaid entity codes; `#` first so codes stay intact). */
export function escapeLabel(text: string): string {
  return oneLine(text).replace(/[#"<>|`]/g, (c) => ENTITIES[c]!);
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Safe, unique Mermaid ids: `.` and `-` become `_`; collisions and keywords get a numeric suffix. */
export function mermaidIds(ids: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  const taken = new Set<string>();
  for (const id of [...new Set(ids)].sort()) {
    const base = id.replace(/[^A-Za-z0-9_]/g, "_");
    let candidate = RESERVED.has(base) ? `${base}_1` : base;
    for (let n = 2; taken.has(candidate); n++) candidate = `${base}_${n}`;
    taken.add(candidate);
    out.set(id, candidate);
  }
  return out;
}

function nodeLine(n: DiagramNode, id: string): string {
  const label = `"${n.lines.map(escapeLabel).join("<br/>")}"`;
  if (n.shape === "rounded") return `${id}(${label})`;
  return n.shape === "cylinder" ? `${id}[(${label})]` : `${id}[${label}]`;
}

function renderLevel(d: Diagram, ids: ReadonlyMap<string, string>, parent: string | undefined, depth: number, out: string[]): void {
  const pad = "  ".repeat(depth);
  for (const n of d.nodes.filter((x) => x.group === parent)) out.push(pad + nodeLine(n, ids.get(n.id)!));
  for (const g of d.groups.filter((x) => x.parent === parent)) {
    out.push(`${pad}subgraph ${ids.get(g.id)!}["${escapeLabel(g.label)}"]`);
    renderLevel(d, ids, g.id, depth + 1, out);
    out.push(`${pad}end`);
  }
}

export function renderMermaid(d: Diagram): string {
  const sorted: Diagram = {
    ...d,
    nodes: [...d.nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    groups: [...d.groups].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  };
  const ids = mermaidIds([...d.nodes.map((n) => n.id), ...d.groups.map((g) => g.id)]);
  // Mermaid only recognises front matter at the very start of the text, so the comment follows it.
  const out = ["---", `title: ${JSON.stringify(oneLine(d.title))}`, "---", `%% ${oneLine(d.title)}`, "flowchart LR"];
  renderLevel(sorted, ids, undefined, 1, out);
  for (const e of d.edges) {
    const arrow = e.async ? "-.->" : "-->";
    const label = e.label ? `|"${escapeLabel(e.label)}"|` : "";
    out.push(`  ${ids.get(e.source)!} ${arrow}${label} ${ids.get(e.target)!}`);
  }
  return `${out.join("\n")}\n`;
}
