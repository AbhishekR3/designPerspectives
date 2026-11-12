import type { SidecarPattern } from "@designperspectives/contracts";

export const SETTINGS_PATH = "designperspectives.yaml";
export const PERMISSIONS_PATH = "permissions.yaml";
export const CHARACTERISTICS_PATH = "sidecars/characteristics.yaml";
export const RELATIONSHIPS_PATH = "sidecars/relationships.yaml";
export const CODEMAPPING_PATH = "sidecars/codemapping.yaml";
export const DEFAULT_DECISIONS_DIR = "decisions";
export const ADR_PATTERN: SidecarPattern = "decisions/**/ADR-*.md";

const FIXED_PATHS = new Map<string, SidecarPattern>([
  [SETTINGS_PATH, "designperspectives.yaml"],
  [PERMISSIONS_PATH, "permissions.yaml"],
  [CHARACTERISTICS_PATH, "sidecars/characteristics.yaml"],
  [RELATIONSHIPS_PATH, "sidecars/relationships.yaml"],
  [CODEMAPPING_PATH, "sidecars/codemapping.yaml"],
]);

/** One file per entry, directly inside the folder (no sub-folders). `sidecars/secure/**` matches nothing. */
const FOLDER_PATTERNS: ReadonlyArray<readonly [RegExp, SidecarPattern]> = [
  [/^sidecars\/elements\/[^/]+\.yaml$/, "sidecars/elements/*.yaml"],
  [/^sidecars\/layout\/[^/]+\.yaml$/, "sidecars/layout/*.yaml"],
  [/^sidecars\/notes\/[^/]+\.md$/, "sidecars/notes/*.md"],
  [/^sidecars\/risk\/[^/]+\.yaml$/, "sidecars/risk/*.yaml"],
  [/^approvals\/[^/]+\.sig\.yaml$/, "approvals/*.sig.yaml"],
];

const ADR_FILE_NAME = /^ADR-[^/]*\.md$/;

/**
 * Which sidecar schema governs a path (relative to `architecture/`, POSIX separators).
 * `undefined` means the path is not a sidecar (model sources, `sidecars/secure/**`, stages, standards, …).
 * `decisionsDir` is the workspace's `decisions` setting; ADRs may sit in sub-folders of it.
 */
export function classifySidecarPath(path: string, decisionsDir: string = DEFAULT_DECISIONS_DIR): SidecarPattern | undefined {
  const fixed = FIXED_PATHS.get(path);
  if (fixed) return fixed;
  const folder = FOLDER_PATTERNS.find(([re]) => re.test(path));
  if (folder) return folder[1];
  return isAdrPath(path, decisionsDir) ? ADR_PATTERN : undefined;
}

function isAdrPath(path: string, decisionsDir: string): boolean {
  const prefix = `${normalizeDir(decisionsDir)}/`;
  return path.startsWith(prefix) && ADR_FILE_NAME.test(baseName(path));
}

/** `./decisions/` → `decisions`. */
export function normalizeDir(dir: string): string {
  return dir.replace(/^(\.\/)+/, "").replace(/\/+$/, "");
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** File name without the given extension, e.g. `stemOf("a/b.c.yaml", ".yaml") === "b.c"`. */
export function stemOf(path: string, extension: string): string {
  const name = baseName(path);
  return name.endsWith(extension) ? name.slice(0, name.length - extension.length) : name;
}

export const elementPath = (id: string): string => `sidecars/elements/${id}.yaml`;
export const layoutPath = (view: string): string => `sidecars/layout/${view}.yaml`;
export const notePath = (id: string): string => `sidecars/notes/${id}.md`;
export const riskPath = (id: string): string => `sidecars/risk/${id}.yaml`;
