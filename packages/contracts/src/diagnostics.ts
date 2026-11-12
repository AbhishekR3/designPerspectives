export type Severity = "error" | "warning" | "info";

/** A problem found while loading or validating, pointing at a file position where one is known. */
export interface Diagnostic {
  severity: Severity;
  /** Stable machine-readable code, e.g. `model/allowed-parent`. */
  code: string;
  message: string;
  /** Path relative to the workspace's `architecture/` folder. */
  file?: string;
  /** 1-based. */
  line?: number;
  /** 1-based. */
  column?: number;
  /** Element, relationship or view id the diagnostic is about. */
  subject?: string;
  /** Book or spec reference that motivates the rule, e.g. "[C4 p.108]". */
  source?: string;
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === "error");
}

/** `file:line:column severity code message` — the format printed by `dp validate`. */
export function formatDiagnostic(d: Diagnostic): string {
  const pos = d.file ? `${d.file}${d.line ? `:${d.line}${d.column ? `:${d.column}` : ""}` : ""}` : "(workspace)";
  const subject = d.subject ? ` [${d.subject}]` : "";
  return `${pos} ${d.severity} ${d.code}${subject} ${d.message}`;
}

function cmp(a: string | number | undefined, b: string | number | undefined): number {
  const x = a ?? "";
  const y = b ?? "";
  return x < y ? -1 : x > y ? 1 : 0;
}

const SORT_KEYS: ReadonlyArray<(d: Diagnostic) => string | number | undefined> = [
  (d) => d.file,
  (d) => d.line ?? 0,
  (d) => d.column ?? 0,
  (d) => d.code,
  (d) => d.subject,
  (d) => d.message,
];

/** Deterministic ordering: file, line, column, code, subject, message. */
export function sortDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort((a, b) => SORT_KEYS.reduce((r, k) => r || cmp(k(a), k(b)), 0));
}
