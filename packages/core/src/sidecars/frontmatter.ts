import { ensureSingleTrailingNewline } from "./yaml-io.js";

export interface FrontMatterSplit {
  /** YAML text between the delimiters, ending with a newline unless empty. */
  yaml: string;
  body: string;
}

const OPENING = "---\n";
const CLOSING = /\n---(?:\n|$)/g;

/** Splits `---\n<yaml>---\n<body>` (LF-normalised text). `undefined` when there is no complete front matter. */
export function splitFrontMatter(text: string): FrontMatterSplit | undefined {
  if (!text.startsWith(OPENING)) return undefined;
  const closing = new RegExp(CLOSING);
  closing.lastIndex = OPENING.length - 1;
  const match = closing.exec(text);
  if (!match) return undefined;
  return { yaml: text.slice(OPENING.length, match.index + 1), body: text.slice(match.index + match[0].length) };
}

/** Body as stored and printed: byte-for-byte except for a single trailing newline (none when empty). */
export function normalizeBody(body: string): string {
  return ensureSingleTrailingNewline(body);
}

export function joinFrontMatter(yaml: string, body: string): string {
  return `${OPENING}${yaml}---\n${normalizeBody(body)}`;
}
