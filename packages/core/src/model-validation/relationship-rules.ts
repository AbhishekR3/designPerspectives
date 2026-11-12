import { relationshipIdOf, type ElementKind, type Relationship } from "@designperspectives/contracts";
import { compareStrings, defineRule, indexModel, isBlank, type Finding, type ModelIndex, type Rule } from "./rule.js";

export const labelRequiredRule = defineRule(
  {
    code: "relationship/label-required",
    severity: "error",
    source: "[spec 04 §2, C4 p.108]",
    description: "Every relationship has a non-empty label.",
  },
  (model) =>
    model.relationships
      .filter((r) => isBlank(r.label))
      .map((r) => {
        const id = relationshipIdOf(r);
        return { subject: id, message: `Relationship "${id}" has no label; describe its intent, e.g. "Makes API calls to".` };
      }),
);

const VAGUE_LABELS: ReadonlySet<string> = new Set([
  "uses",
  "use",
  "calls",
  "connects to",
  "talks to",
  "interacts with",
  "depends on",
  "->",
]);

function isVague(label: string): boolean {
  return VAGUE_LABELS.has(label.trim().toLowerCase());
}

export const vagueLabelRule = defineRule(
  {
    code: "relationship/vague-label",
    severity: "error",
    source: "[C4 p.108]",
    description: "Relationship labels describe intent rather than a generic verb such as \"uses\".",
  },
  (model) =>
    model.relationships
      .filter((r) => !isBlank(r.label) && isVague(r.label))
      .map((r) => {
        const id = relationshipIdOf(r);
        return {
          subject: id,
          message: `Relationship "${id}" has the vague label "${r.label.trim()}"; describe the intent and end with a preposition, e.g. "Makes API calls to" or "Reads customer data from".`,
        };
      }),
);

export const PREPOSITIONS: readonly string[] = ["to", "from", "using", "with", "via", "for", "into", "on", "in", "at", "of", "by"];

function lastWord(label: string): string {
  const words = label.trim().toLowerCase().split(/\s+/);
  return (words.at(-1) ?? "").replace(/[^a-z]/g, "");
}

export const prepositionRule = defineRule(
  {
    code: "relationship/preposition",
    severity: "info",
    source: "[C4 p.108]",
    description: "Relationship labels end with a preposition so they read as \"source label target\".",
  },
  (model) =>
    model.relationships
      .filter((r) => !isBlank(r.label) && !isVague(r.label) && !PREPOSITIONS.includes(lastWord(r.label)))
      .map((r) => {
        const id = relationshipIdOf(r);
        return {
          subject: id,
          message: `Relationship label "${r.label.trim()}" does not end with a preposition (${PREPOSITIONS.join(", ")}); phrase it to read as "<source> <label> <target>", e.g. "Sends e-mail using".`,
        };
      }),
);

const TECHNICAL_KINDS: readonly ElementKind[] = ["container", "dataStore", "queue", "topic", "component"];

/**
 * Inter-process relationships need a technology. Relationships to or from a person describe a
 * human interaction and are exempt.
 */
function needsTechnology(r: Relationship, index: ModelIndex): boolean {
  const kinds = [index.elements.get(r.source)?.kind, index.elements.get(r.target)?.kind];
  if (kinds.includes("person")) return false;
  return kinds.some((k) => k !== undefined && TECHNICAL_KINDS.includes(k));
}

export const relationshipTechnologyRule = defineRule(
  {
    code: "relationship/technology-required",
    severity: "warning",
    source: "[C4 p.37]",
    description: "Relationships to or from containers, data stores, queues, topics or components state their technology (person interactions exempt).",
  },
  (model) => {
    const index = indexModel(model);
    return model.relationships
      .filter((r) => isBlank(r.technology) && needsTechnology(r, index))
      .map((r) => {
        const id = relationshipIdOf(r);
        return { subject: id, message: `Relationship "${id}" has no technology; state the protocol or mechanism, e.g. "JSON/HTTPS" or "SQL/TCP".` };
      });
  },
);

function pairKey(source: string, target: string, kind: string): string {
  return `${source}\u0000${target}\u0000${kind}`;
}

function bidirectionalFindings(relationships: readonly Relationship[]): Finding[] {
  const keys = new Set(relationships.map((r) => pairKey(r.source, r.target, r.kind)));
  const reported = new Set<string>();
  const findings: Finding[] = [];
  const sorted = [...relationships].sort((a, b) => compareStrings(relationshipIdOf(a), relationshipIdOf(b)));
  for (const r of sorted) {
    const key = pairKey(r.source, r.target, r.kind);
    if (r.source >= r.target || reported.has(key) || !keys.has(pairKey(r.target, r.source, r.kind))) continue;
    reported.add(key);
    const id = relationshipIdOf(r);
    findings.push({
      subject: id,
      message: `"${r.source}" and "${r.target}" both have a ${r.kind} relationship to each other; keep the one that shows the direction of the dependency or the initiator, or use different kinds.`,
    });
  }
  return findings;
}

export const bidirectionalRule = defineRule(
  {
    code: "relationship/bidirectional",
    severity: "warning",
    source: "[C4 p.110]",
    description: "Two elements do not have same-kind relationships in both directions.",
  },
  (model) => bidirectionalFindings(model.relationships),
);

export const RELATIONSHIP_RULES: readonly Rule[] = [
  labelRequiredRule,
  vagueLabelRule,
  prepositionRule,
  relationshipTechnologyRule,
  bidirectionalRule,
];
