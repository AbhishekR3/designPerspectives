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

/** Deterministic ordering: file, line, column, code, subject. */
export function sortDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort(
    (a, b) =>
      cmp(a.file, b.file) ||
      cmp(a.line ?? 0, b.line ?? 0) ||
      cmp(a.column ?? 0, b.column ?? 0) ||
      cmp(a.code, b.code) ||
      cmp(a.subject, b.subject) ||
      cmp(a.message, b.message),
  );
}
