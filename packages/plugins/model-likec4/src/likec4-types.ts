/**
 * Minimal structural types for the parts of LikeC4's parsed / layouted model this adapter reads.
 * Observed in @likec4/language-services 1.60.0 (spike probes). Kept local so no LikeC4 type leaks out (FF1).
 */
export type Text = string | { txt?: string; md?: string } | null | undefined;

export interface LcElement {
  id: string;
  kind: string;
  title: string;
  description?: Text;
  technology?: string | null;
  tags?: string[] | null;
  metadata?: Record<string, string | string[]> | null;
}

export interface LcRelation {
  id: string;
  source: { model: string };
  target: { model: string };
  kind?: string;
  title?: string | null;
  technology?: string | null;
  tags?: string[] | null;
  metadata?: Record<string, string | string[]> | null;
}

export interface LcDeploymentElement {
  id: string;
  kind?: string;
  element?: string;
  title?: string;
  description?: Text;
  technology?: string | null;
  tags?: string[] | null;
}

export interface LcRuleExpr {
  ref?: { model?: string; deployment?: string };
  selector?: string;
  wildcard?: boolean;
  source?: LcRuleExpr;
  target?: LcRuleExpr;
}

export interface LcView {
  id: string;
  _type: "element" | "dynamic" | "deployment";
  title?: string | null;
  description?: Text;
  tags?: string[] | null;
  viewOf?: string;
  sourcePath?: string;
  rules?: Array<{ include?: LcRuleExpr[]; exclude?: LcRuleExpr[] }>;
  steps?: Array<{ source: string; target: string; title?: string | null; isBackward?: boolean }>;
}

export interface LcParsedModel {
  elements: Record<string, LcElement>;
  relations: Record<string, LcRelation>;
  deployments: { elements: Record<string, LcDeploymentElement> } | Record<string, LcDeploymentElement>;
  views: Record<string, LcView>;
}

export interface LcLayoutNode {
  id: string;
  kind: string;
  title: string;
  description?: Text;
  technology?: string | null;
  parent: string | null;
  children: string[];
  modelRef?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LcLayoutEdge {
  id: string;
  source: string;
  target: string;
  label?: string | null;
  kind?: string;
  relations?: string[];
  points: Array<[number, number]>;
}

export interface LcLayoutView {
  id: string;
  title?: string | null;
  description?: Text;
  bounds: { x: number; y: number; width: number; height: number };
  nodes: LcLayoutNode[];
  edges: LcLayoutEdge[];
}

export interface LcError {
  message: string;
  line?: number;
  range?: { start: { line: number; character: number } };
  sourceFsPath?: string;
}

export interface LcInstance {
  getErrors(): LcError[];
  parsedModel(): Promise<{ $data: LcParsedModel }>;
  layoutedModel(): Promise<{ $data: { views: Record<string, LcLayoutView> } }>;
  dispose(): Promise<void>;
}

export function text(t: Text): string | undefined {
  if (t == null) return undefined;
  const s = typeof t === "string" ? t : (t.txt ?? t.md);
  return s?.trim() ? s.trim() : undefined;
}
