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
import type { AdrFrontMatter, RelationshipSidecarEntry, SidecarPattern } from "@designperspectives/contracts";
import type { z } from "zod";
import { reportAt } from "./context.js";
import type { FileContext } from "./context.js";
import { normalizeBody } from "./frontmatter.js";
import { stemOf } from "./paths.js";
import { hasEntry, setEntry } from "./types.js";

/** How one kind of sidecar file is validated and stored. */
export interface SidecarSpec {
  schema: z.ZodType;
  /** Markdown with YAML front matter (validated by `schema`) instead of a plain YAML file. */
  markdown: boolean;
  store(ctx: FileContext, value: unknown, body: string): void;
}

function spec<S extends z.ZodType>(
  schema: S,
  store: (ctx: FileContext, value: z.output<S>, body: string) => void,
  markdown = false,
): SidecarSpec {
  return { schema, markdown, store: (ctx, value, body) => store(ctx, value as z.output<S>, body) };
}

/** The identity value must equal the file stem; reports `sidecar/filename-mismatch` otherwise. */
function stemMatches(ctx: FileContext, key: string, value: string, extension: string): boolean {
  const stem = stemOf(ctx.file, extension);
  if (stem === value) return true;
  reportAt(ctx, "sidecar/filename-mismatch", [key], `${key}: "${value}" does not match file name "${stem}${extension}"`, value);
  return false;
}

function storeRelationships(ctx: FileContext, entries: RelationshipSidecarEntry[]): void {
  const seen = new Set<string>();
  entries.forEach((entry, index) => {
    if (seen.has(entry.id)) {
      reportAt(ctx, "sidecar/duplicate-id", [index, "id"], `${index}.id: duplicate relationship id "${entry.id}"`, entry.id);
      return;
    }
    seen.add(entry.id);
    ctx.state.set.relationships.push(entry);
  });
}

/** ADR file names start with the id (`ADR-0001-<slug>.md`); ids are unique across the decisions folder. */
function storeAdr(ctx: FileContext, frontMatter: AdrFrontMatter, body: string): void {
  const { id } = frontMatter;
  const { adrs } = ctx.state.set;
  if (!adrNameMatches(ctx, id)) return;
  const other = hasEntry(adrs, id) ? adrs[id] : undefined;
  if (other) reportAt(ctx, "sidecar/duplicate-id", ["id"], `id: "${id}" is also used by ${other.path}`, id);
  else setEntry(adrs, id, { path: ctx.file, frontMatter, body: normalizeBody(body) });
}

function adrNameMatches(ctx: FileContext, id: string): boolean {
  const stem = stemOf(ctx.file, ".md");
  if (stem === id || stem.startsWith(`${id}-`)) return true;
  reportAt(ctx, "sidecar/filename-mismatch", ["id"], `id: file name "${stem}.md" must start with "${id}"`, id);
  return false;
}

export const SIDECAR_SPECS: Record<SidecarPattern, SidecarSpec> = {
  "designperspectives.yaml": spec(WorkspaceSettingsSchema, (ctx, v) => {
    ctx.state.set.settings = v;
  }),
  "permissions.yaml": spec(PermissionsSchema, (ctx, v) => {
    ctx.state.set.permissions = v;
  }),
  "sidecars/characteristics.yaml": spec(CharacteristicsSchema, (ctx, v) => {
    ctx.state.set.characteristics = v;
  }),
  "sidecars/codemapping.yaml": spec(CodeMappingSchema, (ctx, v) => {
    ctx.state.set.codemapping = v;
  }),
  "sidecars/relationships.yaml": spec(RelationshipsSidecarSchema, storeRelationships),
  "sidecars/elements/*.yaml": spec(ElementSidecarSchema, (ctx, v) => {
    if (stemMatches(ctx, "id", v.id, ".yaml")) setEntry(ctx.state.set.elements, v.id, v);
  }),
  "sidecars/layout/*.yaml": spec(LayoutSchema, (ctx, v) => {
    if (stemMatches(ctx, "view", v.view, ".yaml")) setEntry(ctx.state.set.layouts, v.view, v);
  }),
  "sidecars/risk/*.yaml": spec(RiskSessionSchema, (ctx, v) => {
    if (stemMatches(ctx, "id", v.id, ".yaml")) setEntry(ctx.state.set.risk, v.id, v);
  }),
  "sidecars/notes/*.md": spec(
    NoteFrontMatterSchema,
    (ctx, v, body) => {
      if (stemMatches(ctx, "id", v.id, ".md")) setEntry(ctx.state.set.notes, v.id, { frontMatter: v, body: normalizeBody(body) });
    },
    true,
  ),
  "decisions/**/ADR-*.md": spec(AdrFrontMatterSchema, storeAdr, true),
  "approvals/*.sig.yaml": spec(ApprovalRecordSchema, (ctx, v) => setEntry(ctx.state.set.approvals, ctx.file, v)),
};
