import { relationshipIdOf, type Model } from "@designperspectives/contracts";
import { compareStrings, defineRule, type Finding, type Rule, type ValidationOptions } from "./rule.js";

/** Acronyms considered well known; anything else should be defined in the workspace glossary. */
export const BUILT_IN_GLOSSARY: readonly string[] = [
  "API", "UI", "URL", "HTTP", "HTTPS", "JSON", "XML", "SQL", "TCP", "PDF", "AWS", "S3", "SES",
  "REST", "ID", "SPA", "CDN", "DNS", "VPC", "JWT", "MFA", "CPU", "OS", "LTS",
];

const ACRONYM_PATTERN = /\b[A-Z]{2,6}s?\b/g;

interface TextSource {
  subject: string;
  texts: (string | undefined)[];
}

/** Texts to scan, in canonical order (elements by id, then relationships by id). */
function textSources(model: Model): TextSource[] {
  const elements = [...model.elements]
    .sort((a, b) => compareStrings(a.id, b.id))
    .map((e) => ({ subject: e.id, texts: [e.title, e.description, e.technology] }));
  const relationships = model.relationships
    .map((r) => ({ subject: relationshipIdOf(r), texts: [r.label] }))
    .sort((a, b) => compareStrings(a.subject, b.subject));
  return [...elements, ...relationships];
}

function acronymsIn(text: string): string[] {
  return [...text.matchAll(ACRONYM_PATTERN)].map((m) => m[0].replace(/s$/, ""));
}

/** First subject (in canonical order) using each acronym. */
function firstUses(model: Model): Map<string, string> {
  const uses = new Map<string, string>();
  for (const source of textSources(model)) {
    for (const acronym of source.texts.flatMap((t) => (t ? acronymsIn(t) : []))) {
      if (!uses.has(acronym)) uses.set(acronym, source.subject);
    }
  }
  return uses;
}

function undefinedAcronyms(model: Model, opts: ValidationOptions): Finding[] {
  const known = new Set([...BUILT_IN_GLOSSARY, ...(opts.glossary ?? []).map((g) => g.trim())]);
  return [...firstUses(model)]
    .filter(([acronym]) => !known.has(acronym))
    .map(([acronym, subject]) => ({
      subject,
      message: `Acronym "${acronym}" is not in the glossary; add a glossary entry explaining it, or spell it out.`,
    }));
}

export const acronymRule = defineRule(
  {
    code: "notation/acronym",
    severity: "info",
    source: "[C4 p.98–99]",
    description: "Acronyms in element text and relationship labels are explained in a glossary.",
  },
  undefinedAcronyms,
);

export const NOTATION_RULES: readonly Rule[] = [acronymRule];
