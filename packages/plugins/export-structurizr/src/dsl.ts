/**
 * Structurizr DSL writer (`workspace.dsl`). Readable, lossy export (no layout; async only as a tag).
 * Identifiers are hierarchical (`!identifiers hierarchical`): derived from the last segment of our ids,
 * made unique case-insensitively among siblings, as the upstream IdentifiersRegister requires.
 * Top-level deployment nodes are prefixed by their environment identifier (upstream behaviour).
 */
import type { Exporter, ExportInput, ExportOptions, SourceFile } from "@designperspectives/contracts";
import type { Plan, PlanElement, PlanGroup, PlanNode, PlanInstance } from "./plan.js";
import { cmp, GROUP_SEPARATOR, notExportedLines } from "./plan.js";
import { exportPlan } from "./build.js";
import type { PlanView } from "./plan-views.js";
import { resolveSelector } from "./membership.js";
import { dslString as q, identifierBase, Lines } from "./text.js";

class Identifiers {
  private readonly byKey = new Map<string, string>();
  private readonly used = new Map<string, Set<string>>();
  /** Assigns `key` an identifier below `parentIdent` ("" = top level). */
  assign(key: string, parentIdent: string, id: string): string {
    const base = identifierBase(id.slice(id.lastIndexOf(".") + 1));
    let set = this.used.get(parentIdent);
    if (!set) this.used.set(parentIdent, (set = new Set()));
    let local = base;
    for (let n = 2; set.has(local.toLowerCase()); n++) local = `${base}_${n}`;
    set.add(local.toLowerCase());
    const full = parentIdent ? `${parentIdent}.${local}` : local;
    this.byKey.set(key, full);
    return full;
  }
  get(key: string): string | undefined {
    return this.byKey.get(key);
  }
}

interface Ctx {
  plan: Plan;
  out: Lines;
  ids: Identifiers;
}

const KEYWORD: Record<PlanElement["szKind"], string> = {
  person: "person",
  softwareSystem: "softwareSystem",
  container: "container",
  component: "component",
};

function writeProperties(out: Lines, props: ReadonlyArray<[string, string | undefined]>): void {
  out.open("properties");
  for (const [k, v] of props) if (v !== undefined) out.line(`${q(k)} ${q(v)}`);
  out.close();
}

function writeDetails(out: Lines, d: { description?: string | undefined; technology?: string | undefined; tags: string[] }): void {
  if (d.description) out.line(`description ${q(d.description)}`);
  if (d.technology) out.line(`technology ${q(d.technology)}`);
  if (d.tags.length > 0) out.line(`tags ${q(d.tags.join(","))}`);
}

type Item = { kind: "element"; id: string; e: PlanElement } | { kind: "group"; id: string; g: PlanGroup };

/** Items directly inside a holder: a structural parent ("e:<id>", "e:" = model) or a group ("g:<id>"). */
function itemsOf(plan: Plan, holder: string): Item[] {
  const items: Item[] = [];
  for (const e of plan.elements.values()) {
    const h = e.groupIds.length > 0 ? `g:${e.groupIds.at(-1)}` : `e:${e.parent ?? ""}`;
    if (h === holder) items.push({ kind: "element", id: e.el.id, e });
  }
  for (const g of plan.groups.values()) {
    const h = g.outer !== undefined ? `g:${g.outer}` : `e:${g.parent}`;
    if (h === holder) items.push({ kind: "group", id: g.id, g });
  }
  return items.sort((a, b) => cmp(a.id, b.id));
}

function writeItems(ctx: Ctx, holder: string, parentIdent: string): void {
  for (const item of itemsOf(ctx.plan, holder)) {
    if (item.kind === "group") {
      ctx.out.open(`group ${q(item.g.title)}`);
      writeItems(ctx, `g:${item.id}`, parentIdent);
      ctx.out.close();
    } else writeElement(ctx, item.e, parentIdent);
  }
}

function writeElement(ctx: Ctx, e: PlanElement, parentIdent: string): void {
  const ident = ctx.ids.assign(`e:${e.el.id}`, parentIdent, e.el.id);
  const local = ident.slice(ident.lastIndexOf(".") + 1);
  ctx.out.open(`${local} = ${KEYWORD[e.szKind]} ${q(e.name)}`);
  const technology = e.szKind === "container" || e.szKind === "component" ? e.el.technology : undefined;
  writeDetails(ctx.out, { description: e.el.description, technology, tags: e.tags });
  writeProperties(ctx.out, [
    ["dp.id", e.el.id],
    ["dp.kind", e.el.kind],
  ]);
  writeItems(ctx, `e:${e.el.id}`, ident);
  ctx.out.close();
}

function writeRelationships(ctx: Ctx): void {
  for (const r of ctx.plan.relationships) {
    const src = ctx.ids.get(`e:${r.rel.source}`)!;
    const dst = ctx.ids.get(`e:${r.rel.target}`)!;
    const tech = r.rel.technology ? ` ${q(r.rel.technology)}` : "";
    ctx.out.open(`${src} -> ${dst} ${q(r.description)}${tech}`);
    if (r.tags.length > 0) ctx.out.line(`tags ${q(r.tags.join(","))}`);
    writeProperties(ctx.out, [
      ["dp.kind", r.rel.kind],
      ["dp.key", r.rel.key],
    ]);
    ctx.out.close();
  }
}

type DeploymentItem = { id: string; node?: PlanNode; inst?: PlanInstance };

function deploymentItems(plan: Plan, env: string, parent: string | undefined): DeploymentItem[] {
  const nodes = [...plan.nodes.values()].filter((n) => n.env === env && n.parent === parent).map((n) => ({ id: n.node.id, node: n }));
  const insts = parent === undefined ? [] : plan.instances.filter((i) => i.node === parent).map((i) => ({ id: i.inst.id, inst: i }));
  return [...nodes, ...insts].sort((a, b) => cmp(a.id, b.id));
}

function writeInstance(ctx: Ctx, i: PlanInstance, parentIdent: string): void {
  const ident = ctx.ids.assign(`d:${i.inst.id}`, parentIdent, i.inst.id);
  const keyword = i.szKind === "container" ? "containerInstance" : "softwareSystemInstance";
  ctx.out.open(`${ident.slice(ident.lastIndexOf(".") + 1)} = ${keyword} ${ctx.ids.get(`e:${i.inst.of}`)!}`);
  writeProperties(ctx.out, [["dp.id", i.inst.id]]);
  ctx.out.close();
}

function writeNode(ctx: Ctx, n: PlanNode, parentIdent: string): void {
  const ident = ctx.ids.assign(`d:${n.node.id}`, parentIdent, n.node.id);
  ctx.out.open(`${ident.slice(ident.lastIndexOf(".") + 1)} = ${n.node.kind} ${q(n.name)}`);
  writeDetails(ctx.out, { description: n.node.description, technology: n.node.technology, tags: n.tags });
  writeProperties(ctx.out, [["dp.id", n.node.id]]);
  writeDeploymentItems(ctx, n.env, n.node.id, ident);
  ctx.out.close();
}

function writeDeploymentItems(ctx: Ctx, env: string, parent: string | undefined, parentIdent: string): void {
  for (const item of deploymentItems(ctx.plan, env, parent)) {
    if (item.node) writeNode(ctx, item.node, parentIdent);
    else writeInstance(ctx, item.inst!, parentIdent);
  }
}

function writeDeployment(ctx: Ctx): void {
  for (const env of ctx.plan.environments) {
    const ident = ctx.ids.assign(`v:${env.id}`, "", env.id);
    ctx.out.open(`${ident} = deploymentEnvironment ${q(env.name)}`);
    writeDeploymentItems(ctx, env.id, undefined, ident);
    ctx.out.close();
  }
}

function selectorIdents(ctx: Ctx, pv: PlanView, selectors: readonly string[]): string[] {
  const prefix = pv.env ? "d:" : "e:";
  const out: string[] = [];
  for (const sel of selectors) {
    const idents = sel === "*" ? ["*"] : resolveSelector(ctx.plan, pv, sel).map((id) => ctx.ids.get(prefix + id)!);
    for (const i of idents) if (!out.includes(i)) out.push(i);
  }
  return out;
}

function viewHeader(ctx: Ctx, pv: PlanView): string {
  const scope = pv.scope !== undefined ? ctx.ids.get(`e:${pv.scope}`)! : "*";
  const key = q(pv.view.id) + (pv.view.description ? ` ${q(pv.view.description)}` : "");
  if (pv.szType === "systemLandscape") return `systemLandscape ${key}`;
  if (pv.szType === "deployment") return `deployment ${scope} ${ctx.ids.get(`v:${pv.env!.id}`)!} ${key}`;
  return `${pv.szType} ${scope} ${key}`;
}

function writeViewBody(ctx: Ctx, pv: PlanView): void {
  if (pv.szType === "dynamic") {
    for (const s of pv.steps) {
      const tech = s.step.technology ? ` ${q(s.step.technology)}` : "";
      ctx.out.line(`${ctx.ids.get(`e:${s.rel.rel.source}`)!} -> ${ctx.ids.get(`e:${s.rel.rel.target}`)!} ${q(s.step.label)}${tech}`);
    }
    return;
  }
  const include = selectorIdents(ctx, pv, pv.view.include);
  const exclude = selectorIdents(ctx, pv, (pv.view.exclude ?? []).filter((s) => s !== "*"));
  if (include.length > 0) ctx.out.line(`include ${include.join(" ")}`);
  if (exclude.length > 0) ctx.out.line(`exclude ${exclude.join(" ")}`);
}

const STYLES: ReadonlyArray<[string, string]> = [
  ["Database", "Cylinder"],
  ["Person", "Person"],
  ["Queue", "Pipe"],
  ["Topic", "Pipe"],
];

function writeViews(ctx: Ctx): void {
  ctx.out.open("views");
  for (const pv of ctx.plan.views) {
    ctx.out.open(viewHeader(ctx, pv));
    ctx.out.line(`title ${q(pv.view.title)}`);
    writeViewBody(ctx, pv);
    ctx.out.line("autoLayout");
    ctx.out.close();
    ctx.out.line("");
  }
  ctx.out.open("styles");
  for (const [tag, shape] of STYLES) {
    ctx.out.open(`element ${q(tag)}`);
    ctx.out.line(`shape ${shape}`);
    ctx.out.close();
  }
  ctx.out.close();
  ctx.out.close();
}

export function toStructurizrDsl(plan: Plan, workspaceName: string): string {
  const out = new Lines();
  const ctx: Ctx = { plan, out, ids: new Identifiers() };
  out.line("// Structurizr DSL exported by designPerspectives. Generated file: edit the designPerspectives model instead.");
  for (const l of notExportedLines(plan)) out.line(`// not exported: ${l}`);
  out.open(`workspace ${q(workspaceName)}`);
  out.line("!identifiers hierarchical");
  out.line("!impliedRelationships false");
  out.line("");
  out.open("model");
  if (plan.nestedGroups) writeProperties(out, [["structurizr.groupSeparator", GROUP_SEPARATOR]]);
  writeItems(ctx, "e:", "");
  out.line("");
  writeRelationships(ctx);
  out.line("");
  writeDeployment(ctx);
  out.close();
  out.line("");
  writeViews(ctx);
  out.close();
  return out.toString();
}

export class StructurizrDslExporter implements Exporter {
  readonly format = "structurizr-dsl";
  readonly description = "Structurizr DSL workspace (workspace.dsl); lossy: no layout, asynchronous relationships as a tag.";
  readonly needsLayout = false;
  export(input: ExportInput, options?: ExportOptions): SourceFile[] {
    return [{ path: "workspace.dsl", content: toStructurizrDsl(exportPlan(input.model, options?.viewIds), input.workspaceName) }];
  }
}
