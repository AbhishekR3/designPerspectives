/** LikeC4 parsed model → designPerspectives Model, with diagnostics for anything outside the strict preset. */
import type {
  DeploymentInstance,
  DeploymentNode,
  Diagnostic,
  Element,
  ElementKind,
  GroupType,
  Model,
  Relationship,
  RelationshipKind,
  ViewDef,
  ViewType,
} from "@designperspectives/contracts";
import { RELATIONSHIP_KINDS, VIEW_TYPES } from "@designperspectives/contracts";
import {
  GROUP_TYPE_METADATA,
  LIKEC4_TO_DEPLOYMENT_KIND,
  LIKEC4_TO_ELEMENT_KIND,
  REL_KEY_METADATA,
  VIEW_ENV_TAG_PREFIX,
  VIEW_SCOPE_TAG_PREFIX,
  VIEW_TYPE_TAG_PREFIX,
  tagToId,
} from "./dsl.js";
import { exprToString, includeFromDsl } from "./view-rules.js";
import { text, type LcDeploymentElement, type LcParsedModel, type LcRelation, type LcView } from "./likec4-types.js";

const SYSTEM_TAG_PREFIXES = [VIEW_TYPE_TAG_PREFIX, VIEW_SCOPE_TAG_PREFIX, VIEW_ENV_TAG_PREFIX];

function opt<K extends string, V>(key: K, value: V | undefined | null): { [P in K]?: V } {
  return (value === undefined || value === null ? {} : { [key]: value }) as { [P in K]?: V };
}

function tags(t: string[] | null | undefined): { tags?: string[] } {
  const list = (t ?? []).filter((x) => !SYSTEM_TAG_PREFIXES.some((p) => x.startsWith(p)));
  return list.length ? { tags: [...list].sort() } : {};
}

function meta(m: Record<string, string | string[]> | null | undefined, key: string): string | undefined {
  const v = m?.[key];
  return Array.isArray(v) ? v[0] : v;
}

function readElements(pm: LcParsedModel, diags: Diagnostic[]): Element[] {
  const out: Element[] = [];
  for (const e of Object.values(pm.elements)) {
    const kind = LIKEC4_TO_ELEMENT_KIND[e.kind] as ElementKind | undefined;
    if (!kind) {
      diags.push({ severity: "error", code: "likec4/unknown-kind", subject: e.id, message: `Element kind "${e.kind}" is not part of the strict C4 preset.` });
      continue;
    }
    out.push({
      id: e.id,
      kind,
      title: e.title.trim(),
      ...opt("description", text(e.description)),
      ...opt("technology", e.technology?.trim() || undefined),
      ...tags(e.tags),
      ...opt("groupType", meta(e.metadata, GROUP_TYPE_METADATA) as GroupType | undefined),
    });
  }
  return out;
}

function readRelationship(r: LcRelation, diags: Diagnostic[]): Relationship | undefined {
  const subject = `${r.source.model}->${r.target.model}`;
  if (!r.kind || !(RELATIONSHIP_KINDS as readonly string[]).includes(r.kind)) {
    diags.push({ severity: "error", code: "likec4/relationship-kind", subject, message: `Relationship needs one of the kinds ${RELATIONSHIP_KINDS.join(", ")}; found "${r.kind ?? "(none)"}".` });
    return undefined;
  }
  return {
    source: r.source.model,
    target: r.target.model,
    kind: r.kind as RelationshipKind,
    label: r.title?.trim() ?? "",
    ...opt("technology", r.technology?.trim() || undefined),
    ...opt("key", meta(r.metadata, REL_KEY_METADATA)),
    ...tags(r.tags),
  };
}

function deploymentRecord(pm: LcParsedModel): Record<string, LcDeploymentElement> {
  const d = pm.deployments as { elements?: Record<string, LcDeploymentElement> };
  return d.elements ?? (pm.deployments as Record<string, LcDeploymentElement>);
}

function readDeployment(pm: LcParsedModel, diags: Diagnostic[]): { nodes: DeploymentNode[]; instances: DeploymentInstance[] } {
  const nodes: DeploymentNode[] = [];
  const instances: DeploymentInstance[] = [];
  for (const d of Object.values(deploymentRecord(pm))) {
    if (d.element) {
      instances.push({ id: d.id, of: d.element });
      continue;
    }
    const kind = LIKEC4_TO_DEPLOYMENT_KIND[d.kind ?? ""] as DeploymentNode["kind"] | undefined;
    if (!kind) {
      diags.push({ severity: "error", code: "likec4/unknown-kind", subject: d.id, message: `Deployment kind "${d.kind}" is not part of the preset.` });
      continue;
    }
    nodes.push({ id: d.id, kind, title: (d.title ?? d.id).trim(), ...opt("description", text(d.description)), ...opt("technology", d.technology?.trim() || undefined), ...tags(d.tags) });
  }
  return { nodes, instances };
}

function tagValue(v: LcView, prefix: string): string | undefined {
  const t = (v.tags ?? []).find((x) => x.startsWith(prefix));
  return t?.slice(prefix.length);
}

function viewType(v: LcView): ViewType {
  const declared = tagValue(v, VIEW_TYPE_TAG_PREFIX);
  if (declared && (VIEW_TYPES as readonly string[]).includes(declared)) return declared as ViewType;
  if (v._type === "dynamic") return "dynamic";
  if (v._type === "deployment") return "deployment";
  return v.viewOf ? "container" : "landscape";
}

function ruleStrings(v: LcView, which: "include" | "exclude", diags: Diagnostic[]): string[] {
  const out: string[] = [];
  for (const rule of v.rules ?? []) {
    for (const x of rule[which] ?? []) {
      const s = exprToString(x);
      if (s) out.push(s);
      else diags.push({ severity: "warning", code: "likec4/unsupported-rule", subject: v.id, message: `View rule ${JSON.stringify(x)} is not supported and was dropped.` });
    }
  }
  return out;
}

function readView(v: LcView, partial: Model, diags: Diagnostic[]): ViewDef {
  const type = viewType(v);
  const scopeTag = tagValue(v, VIEW_SCOPE_TAG_PREFIX);
  const envTag = tagValue(v, VIEW_ENV_TAG_PREFIX);
  const base: ViewDef = {
    id: v.id,
    type,
    title: (v.title ?? "").trim(),
    ...opt("description", text(v.description)),
    ...opt("scope", v.viewOf ?? (scopeTag ? tagToId(scopeTag) : undefined)),
    ...opt("environment", envTag ? tagToId(envTag) : undefined),
    include: [],
  };
  base.include = includeFromDsl(base, partial, ruleStrings(v, "include", diags));
  const exclude = ruleStrings(v, "exclude", diags);
  if (exclude.length) base.exclude = exclude;
  if (v.steps) base.steps = v.steps.map((s) => (s.isBackward ? { source: s.target, target: s.source } : { source: s.source, target: s.target })).map((s, i) => ({ ...s, label: (v.steps![i]!.title ?? "").trim() }));
  return base;
}

export function readModel(pm: LcParsedModel): { model: Model; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const elements = readElements(pm, diagnostics);
  const relationships = Object.values(pm.relations)
    .map((r) => readRelationship(r, diagnostics))
    .filter((r): r is Relationship => !!r);
  const { nodes, instances } = readDeployment(pm, diagnostics);
  const partial: Model = { elements, relationships, deploymentNodes: nodes, deploymentInstances: instances, views: [] };
  // The index view is generated by LikeC4 itself and has no source file.
  const views = Object.values(pm.views)
    .filter((v) => v.sourcePath)
    .map((v) => readView(v, partial, diagnostics));
  return { model: { ...partial, views }, diagnostics };
}
