/** XML escaping and a simple character-count word wrap (deterministic; no font metrics). */

const XML_ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

export function escapeXml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => XML_ENTITIES[c]!);
}

function splitLong(word: string, max: number): string[] {
  const parts: string[] = [];
  for (let i = 0; i < word.length; i += max) parts.push(word.slice(i, i + max));
  return parts;
}

/** Wraps `text` into lines of at most `maxChars` characters (words longer than that are split). */
export function wrapText(text: string, maxChars: number): string[] {
  const max = Math.max(1, maxChars);
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean).flatMap((w) => splitLong(w, max))) {
    if (line && line.length + 1 + word.length > max) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Keeps at most `maxLines` lines, marking a cut with an ellipsis. */
export function clampLines(lines: string[], maxLines: number): string[] {
  if (lines.length <= maxLines) return lines;
  if (maxLines <= 0) return [];
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1]!.replace(/.$/, "")}…`;
  return kept;
}
