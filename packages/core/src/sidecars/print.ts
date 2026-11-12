import {
  AdrFrontMatterSchema,
  ApprovalRecordSchema,
  CharacteristicsSchema,
  CodeMappingSchema,
  ElementSidecarSchema,
  LayoutSchema,
  NoteFrontMatterSchema,
  PermissionsSchema,
  RelationshipsSidecarSchema,
  RiskSessionSchema,
  WorkspaceSettingsSchema,
} from "@designperspectives/contracts";
import type { SourceFile } from "@designperspectives/contracts";
import type { z } from "zod";
import { canonicalize } from "./canonical.js";
import { joinFrontMatter } from "./frontmatter.js";
import {
  CHARACTERISTICS_PATH,
  CODEMAPPING_PATH,
  PERMISSIONS_PATH,
  RELATIONSHIPS_PATH,
  SETTINGS_PATH,
  elementPath,
  layoutPath,
  notePath,
  riskPath,
} from "./paths.js";
import { compareStrings } from "./types.js";
import type { SidecarSet } from "./types.js";
import { printYaml } from "./yaml-io.js";

function yamlText(schema: z.ZodType, value: unknown): string {
  return printYaml(canonicalize(schema, value));
}

function single(path: string, schema: z.ZodType, value: unknown): SourceFile[] {
  return value === undefined ? [] : [{ path, content: yamlText(schema, value) }];
}

function perEntry<T>(record: Record<string, T>, pathOf: (key: string) => string, schema: z.ZodType): SourceFile[] {
  return Object.entries(record).map(([key, value]) => ({ path: pathOf(key), content: yamlText(schema, value) }));
}

/** relationships.yaml is sorted by id and omitted when there are no entries. */
function relationshipsFile(set: SidecarSet): SourceFile[] {
  const sorted = [...set.relationships].sort((a, b) => compareStrings(a.id, b.id));
  return sorted.length === 0 ? [] : single(RELATIONSHIPS_PATH, RelationshipsSidecarSchema, sorted);
}

function markdownFiles(set: SidecarSet): SourceFile[] {
  const notes = Object.entries(set.notes).map(([id, note]) => ({
    path: notePath(id),
    content: joinFrontMatter(yamlText(NoteFrontMatterSchema, note.frontMatter), note.body),
  }));
  const adrs = Object.values(set.adrs).map((adr) => ({
    path: adr.path,
    content: joinFrontMatter(yamlText(AdrFrontMatterSchema, adr.frontMatter), adr.body),
  }));
  return [...notes, ...adrs];
}

/**
 * Prints a sidecar set as canonical files (see canonical.ts for the rules), sorted by path.
 * Deterministic: the same set always yields byte-identical files.
 */
export function printSidecars(set: SidecarSet): SourceFile[] {
  return [
    ...single(SETTINGS_PATH, WorkspaceSettingsSchema, set.settings),
    ...single(PERMISSIONS_PATH, PermissionsSchema, set.permissions),
    ...single(CHARACTERISTICS_PATH, CharacteristicsSchema, set.characteristics),
    ...single(CODEMAPPING_PATH, CodeMappingSchema, set.codemapping),
    ...relationshipsFile(set),
    ...perEntry(set.elements, elementPath, ElementSidecarSchema),
    ...perEntry(set.layouts, layoutPath, LayoutSchema),
    ...perEntry(set.risk, riskPath, RiskSessionSchema),
    ...perEntry(set.approvals, (path) => path, ApprovalRecordSchema),
    ...markdownFiles(set),
  ].sort((a, b) => compareStrings(a.path, b.path));
}
