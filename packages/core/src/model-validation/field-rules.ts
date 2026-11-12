import { kindLabel, type ElementKind } from "@designperspectives/contracts";
import { defineRule, isBlank, type Rule } from "./rule.js";

export const titleRequiredRule = defineRule(
  {
    code: "model/title-required",
    severity: "error",
    source: "[spec 04 §2]",
    description: "Elements and views have a non-empty title.",
  },
  (model) => [
    ...model.elements
      .filter((e) => isBlank(e.title))
      .map((e) => ({ subject: e.id, message: `Element "${e.id}" has no title; add a short name such as the one people use for it.` })),
    ...model.views
      .filter((v) => isBlank(v.title))
      .map((v) => ({ subject: v.id, message: `View "${v.id}" has no title; add one that states the view type and scope.` })),
  ],
);

const DESCRIPTION_EXEMPT: readonly ElementKind[] = ["group", "codeElement"];

export const descriptionRequiredRule = defineRule(
  {
    code: "model/description-required",
    severity: "warning",
    source: "[C4 p.100–102]",
    description: "Elements other than groups and code elements have a short description of their responsibilities.",
  },
  (model) =>
    model.elements
      .filter((e) => !DESCRIPTION_EXEMPT.includes(e.kind) && isBlank(e.description))
      .map((e) => ({
        subject: e.id,
        message: `${kindLabel(e.kind)} "${e.id}" has no description; add a sentence describing its key responsibilities.`,
      })),
);

const TECHNOLOGY_KINDS: readonly ElementKind[] = ["container", "dataStore", "queue", "topic", "component"];

export const technologyRequiredRule = defineRule(
  {
    code: "model/technology-required",
    severity: "error",
    source: "[C4 p.36–37]",
    description: "Containers, data stores, queues, topics and components state their technology.",
  },
  (model) =>
    model.elements
      .filter((e) => TECHNOLOGY_KINDS.includes(e.kind) && isBlank(e.technology))
      .map((e) => ({
        subject: e.id,
        message: `${kindLabel(e.kind)} "${e.id}" has no technology; state it, e.g. "Java and Spring Boot" or "PostgreSQL database schema".`,
      })),
);

export const FIELD_RULES: readonly Rule[] = [titleRequiredRule, descriptionRequiredRule, technologyRequiredRule];
