import type { CallMessage } from "../types";

/** Headers as text, one `Name: value` per line. */
export const headersToText = (h: [string, string][]): string => h.map(([k, v]) => `${k}: ${v}`).join("\n");

/** Text back to headers: a line without a colon is left out. */
export function textToHeaders(text: string): [string, string][] {
  const out: [string, string][] = [];
  for (const line of text.split("\n")) {
    const i = line.indexOf(":");
    if (i <= 0) continue;
    const name = line.slice(0, i).trim();
    if (name) out.push([name, line.slice(i + 1).trim()]);
  }
  return out;
}

/** What a person can change in a request or a reply, as the form holds it (all text). */
export interface MessageForm {
  method: string;
  path: string;
  status: string;
  headers: string;
  body: string;
}

export const formOf = (m: CallMessage): MessageForm => ({
  method: m.method ?? "",
  path: m.path ?? "",
  status: m.status !== undefined ? String(m.status) : "",
  headers: headersToText(m.headers),
  body: m.body ?? "",
});

/** Only the fields the person changed, in the shape the server takes for an edit. */
export function changes(original: CallMessage, form: MessageForm, fields: ("method" | "path" | "status" | "headers" | "body")[]): Partial<CallMessage> {
  const was = formOf(original);
  const out: Partial<CallMessage> = {};
  for (const f of fields) {
    if (form[f] === was[f]) continue;
    if (f === "headers") out.headers = textToHeaders(form.headers);
    else if (f === "status") {
      const n = Number(form.status);
      if (Number.isInteger(n)) out.status = n;
    } else out[f] = form[f];
  }
  return out;
}
