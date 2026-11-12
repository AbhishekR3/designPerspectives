/**
 * Translation of view inclusion rules. Our `*` means "the C4 default content for this view type";
 * LikeC4 needs explicit expressions for some types (evidence: spike probes 2–6):
 *  - landscape: `*`
 *  - context of S: `S, * -> S, S -> *`   (LikeC4 `-> S ->` returned no neighbours in a probe)
 *  - container of S / component of C: `*` inside `view ... of S`
 *  - dynamic: no include; content comes from steps
 *  - deployment of environment E: every node and instance under E listed explicitly
 *    (`E.**` and `E._` returned only the environment box in a probe)
 */
import type { Model, ViewDef } from "@designperspectives/contracts";

export function defaultInclude(v: ViewDef, model: Model): string[] {
  switch (v.type) {
    case "landscape":
    case "container":
    case "component":
      return ["*"];
    case "context":
      return v.scope ? [v.scope, `* -> ${v.scope}`, `${v.scope} -> *`] : ["*"];
    case "dynamic":
      return [];
    case "deployment":
      return deploymentIds(v.environment, model);
  }
}

function deploymentIds(env: string | undefined, model: Model): string[] {
  if (!env) return [];
  const prefix = `${env}.`;
  return [...model.deploymentNodes.map((n) => n.id), ...model.deploymentInstances.map((i) => i.id)]
    .filter((id) => id.startsWith(prefix))
    .sort();
}

/** Our include list → LikeC4 expressions. `*` expands to the default content; other entries pass through. */
export function includeToDsl(v: ViewDef, model: Model): string[] {
  const out: string[] = [];
  for (const entry of v.include) {
    if (entry === "*") out.push(...defaultInclude(v, model));
    else out.push(entry);
  }
  return out;
}

// ---- reverse direction (parsed LikeC4 rule objects → strings) -------------------------------

interface RefExpr {
  ref?: { model?: string; deployment?: string };
  selector?: string;
  wildcard?: boolean;
  source?: RefExpr;
  target?: RefExpr;
}

const SELECTOR_SUFFIX: Record<string, string> = { children: ".*", descendants: ".**", expanded: "._" };

export function exprToString(x: RefExpr): string | undefined {
  if (x.wildcard) return "*";
  if (x.ref) {
    const base = x.ref.model ?? x.ref.deployment;
    if (!base) return undefined;
    return base + (x.selector ? (SELECTOR_SUFFIX[x.selector] ?? "") : "");
  }
  if (x.source && x.target) {
    const s = exprToString(x.source);
    const t = exprToString(x.target);
    return s && t ? `${s} -> ${t}` : undefined;
  }
  return undefined;
}

/**
 * Parsed include strings → our include list: if the strings start with the default expansion,
 * that prefix is folded back into `*`.
 */
export function includeFromDsl(v: ViewDef, model: Model, parsed: string[]): string[] {
  if (v.type === "dynamic") return [];
  if (parsed.length === 0) return ["*"];
  const def = defaultInclude(v, model);
  const startsWithDefault = def.length > 0 && def.every((d, i) => parsed[i] === d);
  return startsWithDefault ? ["*", ...parsed.slice(def.length)] : parsed;
}
