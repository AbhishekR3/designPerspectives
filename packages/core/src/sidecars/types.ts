import type {
  AdrFrontMatter,
  ApprovalRecord,
  Characteristics,
  CodeMapping,
  ElementSidecar,
  Layout,
  NoteFrontMatter,
  Permissions,
  RelationshipSidecarEntry,
  RiskSession,
  WorkspaceSettings,
} from "@designperspectives/contracts";

export interface NoteDocument {
  frontMatter: NoteFrontMatter;
  /** Markdown after the closing `---` line: LF line endings, a single trailing newline (or empty). */
  body: string;
}

export interface AdrDocument {
  /** Path relative to `architecture/`, e.g. `decisions/ADR-0001-use-postgres.md`. */
  path: string;
  frontMatter: AdrFrontMatter;
  body: string;
}

/** Every sidecar file of an `architecture/` folder, parsed and validated (Zod defaults filled in). */
export interface SidecarSet {
  settings?: WorkspaceSettings;
  characteristics?: Characteristics;
  /** Key = element id. */
  elements: Record<string, ElementSidecar>;
  relationships: RelationshipSidecarEntry[];
  codemapping?: CodeMapping;
  /** Key = view id. */
  layouts: Record<string, Layout>;
  /** Key = note id. */
  notes: Record<string, NoteDocument>;
  /** Key = risk session id. */
  risk: Record<string, RiskSession>;
  /** Key = ADR id. */
  adrs: Record<string, AdrDocument>;
  /** Key = path relative to `architecture/`. */
  approvals: Record<string, ApprovalRecord>;
  permissions?: Permissions;
}

export function emptySidecarSet(): SidecarSet {
  return { elements: {}, relationships: [], layouts: {}, notes: {}, risk: {}, adrs: {}, approvals: {} };
}

/** Assigns a record entry without ever touching the prototype (safe for keys such as `__proto__`). */
export function setEntry<T>(record: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(record, key, { value, enumerable: true, writable: true, configurable: true });
}

export function hasEntry(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/** Code-unit string order: locale-independent, hence deterministic. */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
