/**
 * Text helpers for the DSL writer.
 *
 * DSL string escaping follows the upstream tokenizer (structurizr-dsl `Tokenizer` + `Tokens.get`, read at
 * structurizr/structurizr@ad34036): inside a quoted token `\"` becomes `"` and `\n` becomes a newline;
 * there is no escape for the backslash itself. So: `"` → `\"`, newline → `\n`, CR dropped, and a backslash
 * that would be read as part of an escape (followed by `n`, or last before the closing quote) is replaced by
 * U+29F5 (reverse solidus operator) — the only lossy case.
 */
const SAFE_BACKSLASH = "⧵";

function escapeChar(c: string, next: string | undefined): string {
  if (c === '"') return '\\"';
  if (c === "\n") return "\\n";
  if (c === "\\" && (next === "n" || next === undefined)) return SAFE_BACKSLASH;
  return c;
}

export function dslString(s: string): string {
  const t = s.replace(/\r\n?/g, "\n");
  let out = "";
  for (let i = 0; i < t.length; i++) out += escapeChar(t[i]!, t[i + 1]);
  return `"${out}"`;
}

/** Words the DSL parser treats as keywords; never used as bare identifiers. */
const RESERVED = new Set(
  [
    "workspace", "model", "views", "person", "softwareSystem", "container", "component", "group", "enterprise",
    "deploymentEnvironment", "deploymentGroup", "deploymentNode", "infrastructureNode", "containerInstance",
    "softwareSystemInstance", "instanceOf", "healthCheck", "properties", "perspectives", "tags", "tag",
    "description", "technology", "instances", "url", "include", "exclude", "autoLayout", "title", "default",
    "animation", "styles", "element", "relationship", "systemLandscape", "systemContext", "dynamic", "deployment",
    "filtered", "custom", "image", "theme", "themes", "branding", "terminology", "configuration", "users", "this",
    "archetypes",
  ].map((w) => w.toLowerCase()),
);

/** Local DSL identifier from an id segment: characters `a-zA-Z_0-9` only, never a keyword. */
export function identifierBase(segment: string): string {
  const s = segment.replace(/[^A-Za-z0-9_]/g, "_") || "e";
  return RESERVED.has(s.toLowerCase()) ? `${s}_` : s;
}

/** Line writer with 4-space indentation, LF endings and a trailing newline. */
export class Lines {
  private readonly out: string[] = [];
  private depth = 0;
  line(s: string): void {
    this.out.push(s === "" ? "" : "    ".repeat(this.depth) + s);
  }
  open(s: string): void {
    this.line(`${s} {`);
    this.depth++;
  }
  close(): void {
    this.depth--;
    this.line("}");
  }
  toString(): string {
    return this.out.join("\n") + "\n";
  }
}
