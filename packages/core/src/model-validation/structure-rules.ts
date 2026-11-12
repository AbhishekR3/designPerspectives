import {
  isValidElementId,
  kindLabel,
  parentIdOf,
  relationshipIdOf,
  type DeploymentInstance,
  type DeploymentNode,
  type Element,
  type ElementKind,
  type Relationship,
} from "@designperspectives/contracts";
import { defineRule, indexModel, type Finding, type ModelIndex, type Rule } from "./rule.js";

const ID_HINT = 'use dot-separated segments that each start with a lower-case letter followed by letters, digits or hyphens, e.g. "ibs.api"';

function invalidIds(items: readonly { id: string }[], what: string): Finding[] {
  return items
    .filter((item) => !isValidElementId(item.id))
    .map((item) => ({ subject: item.id, message: `${what} id "${item.id}" is not valid; ${ID_HINT}.` }));
}

export const idFormatRule = defineRule(
  {
    code: "model/id-format",
    severity: "error",
    source: "[spec 04 §3]",
    description: "Element, deployment node and deployment instance ids are dot-separated lower-camel slugs.",
  },
  (model) => [
    ...invalidIds(model.elements, "Element"),
    ...invalidIds(model.deploymentNodes, "Deployment node"),
    ...invalidIds(model.deploymentInstances, "Deployment instance"),
  ],
);

function duplicatesOf(ids: readonly string[], what: string): Finding[] {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts]
    .filter(([, n]) => n > 1)
    .map(([id, n]) => ({ subject: id, message: `${what} id "${id}" is used ${n} times; give each one a unique id.` }));
}

export const duplicateIdRule = defineRule(
  {
    code: "model/duplicate-id",
    severity: "error",
    source: "[spec 04 §3]",
    description: "Element, relationship, view and deployment ids are unique.",
  },
  (model) => [
    ...duplicatesOf(model.elements.map((e) => e.id), "Element"),
    ...duplicatesOf(model.relationships.map(relationshipIdOf), "Relationship"),
    ...duplicatesOf(model.views.map((v) => v.id), "View"),
    ...duplicatesOf([...model.deploymentNodes, ...model.deploymentInstances].map((d) => d.id), "Deployment"),
  ],
);

const TOP = "top";
type ParentKind = ElementKind | typeof TOP;

const ALLOWED_PARENTS: Record<ElementKind, readonly ParentKind[]> = {
  person: [TOP],
  softwareSystem: [TOP],
  hardwareSystem: [TOP],
  container: ["softwareSystem"],
  dataStore: ["softwareSystem"],
  queue: ["softwareSystem"],
  topic: ["softwareSystem"],
  component: ["container"],
  codeElement: ["component"],
  group: [TOP, "softwareSystem", "container"],
};

interface EffectiveParent {
  id?: string;
  kind: ParentKind;
}

/**
 * The nearest ancestor that is not a group (groups only cluster their members, they do not change
 * the C4 hierarchy). Undefined when an ancestor is missing; that is reported by `model/missing-parent`.
 */
function effectiveParent(id: string, elements: Map<string, Element>): EffectiveParent | undefined {
  let parentId = parentIdOf(id);
  while (parentId !== undefined) {
    const parent = elements.get(parentId);
    if (!parent) return undefined;
    if (parent.kind !== "group") return { id: parentId, kind: parent.kind };
    parentId = parentIdOf(parentId);
  }
  return { kind: TOP };
}

function placeText(kind: ParentKind): string {
  return kind === TOP ? "at the top level" : `inside a ${kindLabel(kind).toLowerCase()}`;
}

function allowedText(kinds: readonly ParentKind[]): string {
  const parts = kinds.map(placeText);
  return parts.length === 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} or ${parts.at(-1) ?? ""}`;
}

function parentFinding(element: Element, index: ModelIndex): Finding | undefined {
  const parent = effectiveParent(element.id, index.elements);
  const allowed = ALLOWED_PARENTS[element.kind];
  if (!parent || !allowed || allowed.includes(parent.kind)) return undefined;
  const where = parent.id ? `${placeText(parent.kind)} ("${parent.id}")` : placeText(parent.kind);
  return {
    subject: element.id,
    message: `${kindLabel(element.kind)} "${element.id}" is ${where}; a ${kindLabel(element.kind).toLowerCase()} must be ${allowedText(allowed)}. Change its id so it sits under a valid parent.`,
  };
}

export const allowedParentRule = defineRule(
  {
    code: "model/allowed-parent",
    severity: "error",
    source: "[spec 04 §2, C4 p.17–21]",
    description: "Each element kind sits under an allowed parent kind (groups are transparent).",
  },
  (model) => {
    const index = indexModel(model);
    return model.elements.flatMap((e) => parentFinding(e, index) ?? []);
  },
);

export const missingParentRule = defineRule(
  {
    code: "model/missing-parent",
    severity: "error",
    source: "[spec 04 §3]",
    description: "The parent id of every nested element exists.",
  },
  (model) => {
    const { elements } = indexModel(model);
    return model.elements.flatMap((e) => {
      const parentId = parentIdOf(e.id);
      if (parentId === undefined || elements.has(parentId)) return [];
      return [{ subject: e.id, message: `Element "${e.id}" has parent id "${parentId}", which is not defined; define "${parentId}" or move the element.` }];
    });
  },
);

function endpointExists(id: string, r: Relationship, index: ModelIndex): boolean {
  if (index.elements.has(id)) return true;
  return r.kind === "deploysTo" && (index.deploymentNodes.has(id) || index.deploymentInstances.has(id));
}

function endpointFindings(r: Relationship, index: ModelIndex): Finding[] {
  const id = relationshipIdOf(r);
  const findings: Finding[] = [];
  for (const [role, endpoint] of [["source", r.source], ["target", r.target]] as const) {
    if (!endpointExists(endpoint, r, index)) {
      findings.push({ subject: id, message: `Relationship "${id}" has ${role} "${endpoint}", which is not a defined element; define it or correct the id.` });
    }
  }
  if (r.source === r.target) {
    findings.push({ subject: id, message: `Relationship "${id}" points from "${r.source}" to itself; remove it or model the interaction between distinct elements.` });
  }
  return findings;
}

export const relationshipEndpointRule = defineRule(
  {
    code: "model/relationship-endpoint",
    severity: "error",
    source: "[spec 04 §2]",
    description: "Relationship source and target exist and differ.",
  },
  (model) => {
    const index = indexModel(model);
    return model.relationships.flatMap((r) => endpointFindings(r, index));
  },
);

const INSTANTIABLE_KINDS: readonly ElementKind[] = ["container", "dataStore", "queue", "topic", "softwareSystem"];

function environmentIdFinding(node: DeploymentNode): Finding | undefined {
  const segments = node.id.split(".");
  if (segments.length === 1) return undefined;
  return { subject: node.id, message: `Environment "${node.id}" must have a single-segment id, e.g. "${segments.at(-1)}".` };
}

function nodeEnvironmentFinding(node: DeploymentNode, index: ModelIndex): Finding | undefined {
  const envId = node.id.split(".")[0] ?? "";
  if (index.deploymentNodes.get(envId)?.kind === "environment") return undefined;
  return {
    subject: node.id,
    message: `Deployment node "${node.id}" must start with the id of an environment, but "${envId}" is not an environment; define environment "${envId}" or prefix the id with an existing environment.`,
  };
}

function nodeFinding(node: DeploymentNode, index: ModelIndex): Finding | undefined {
  return node.kind === "environment" ? environmentIdFinding(node) : nodeEnvironmentFinding(node, index);
}

function instanceOfFinding(instance: DeploymentInstance, index: ModelIndex): Finding | undefined {
  const target = index.elements.get(instance.of);
  if (target && INSTANTIABLE_KINDS.includes(target.kind)) return undefined;
  const problem = target ? `is a ${kindLabel(target.kind).toLowerCase()}` : "is not a defined element";
  return {
    subject: instance.id,
    message: `Deployment instance "${instance.id}" is an instance of "${instance.of}", which ${problem}; point it at a container, data store, queue, topic or software system.`,
  };
}

function instanceParentFinding(instance: DeploymentInstance, index: ModelIndex): Finding | undefined {
  const parentId = parentIdOf(instance.id) ?? "";
  const kind = index.deploymentNodes.get(parentId)?.kind;
  if (kind === "deploymentNode" || kind === "infrastructureNode") return undefined;
  return {
    subject: instance.id,
    message: `Deployment instance "${instance.id}" must sit inside a deployment or infrastructure node, but "${parentId}" is not one; prefix the id with an existing node id.`,
  };
}

export const deploymentRule = defineRule(
  {
    code: "model/deployment",
    severity: "error",
    source: "[spec 04 §2]",
    description: "Deployment nodes live under an environment; instances refer to deployable elements and sit inside nodes.",
  },
  (model) => {
    const index = indexModel(model);
    return [
      ...model.deploymentNodes.flatMap((n) => nodeFinding(n, index) ?? []),
      ...model.deploymentInstances.flatMap((i) => instanceOfFinding(i, index) ?? []),
      ...model.deploymentInstances.flatMap((i) => instanceParentFinding(i, index) ?? []),
    ];
  },
);

export const STRUCTURE_RULES: readonly Rule[] = [
  idFormatRule,
  duplicateIdRule,
  allowedParentRule,
  missingParentRule,
  relationshipEndpointRule,
  deploymentRule,
];
