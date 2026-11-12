/**
 * Mapping between designPerspectives concepts and the LikeC4 DSL (ADR-0004, plan Q6: tool-owned files).
 * Evidence for every construct used here: docs/spikes/W0-SPIKE-LIKEC4.md and the probes listed in the adapter README.
 */
import type { DeploymentKind, ElementKind, ViewType } from "@designperspectives/contracts";

/** LikeC4 element kind used for each of our kinds. `group` is renamed: LikeC4 uses `group` as a view keyword. */
export const ELEMENT_KIND_TO_LIKEC4: Record<ElementKind, string> = {
  person: "person",
  softwareSystem: "softwareSystem",
  hardwareSystem: "hardwareSystem",
  container: "container",
  dataStore: "dataStore",
  queue: "queue",
  topic: "topic",
  component: "component",
  codeElement: "codeElement",
  group: "grouping",
};
export const LIKEC4_TO_ELEMENT_KIND = invert(ELEMENT_KIND_TO_LIKEC4);

/** `deploymentNode` cannot be used as a kind name (it is the spec keyword), so short names are used. */
export const DEPLOYMENT_KIND_TO_LIKEC4: Record<DeploymentKind, string> = {
  environment: "environment",
  deploymentNode: "node",
  infrastructureNode: "infra",
};
export const LIKEC4_TO_DEPLOYMENT_KIND = invert(DEPLOYMENT_KIND_TO_LIKEC4);

export const ELEMENT_SHAPES: Partial<Record<string, string>> = {
  person: "person",
  dataStore: "storage",
  queue: "queue",
};

/** View metadata that LikeC4 has no field for is carried in view tags (declared in spec.c4). */
export const VIEW_TYPE_TAG_PREFIX = "dp-type-";
export const VIEW_SCOPE_TAG_PREFIX = "dp-scope-";
export const VIEW_ENV_TAG_PREFIX = "dp-env-";
/** Element-id dots become `__` inside tags (ids never contain `_`). */
export const idToTag = (id: string): string => id.replaceAll(".", "__");
export const tagToId = (tag: string): string => tag.replaceAll("__", ".");

/** Relationship metadata key holding the disambiguating key (plan finding F4). */
export const REL_KEY_METADATA = "dpKey";
/** Element metadata key holding the group type for `group` elements. */
export const GROUP_TYPE_METADATA = "dpGroupType";

export const VIEW_TYPES_WITH_OF: readonly ViewType[] = ["context", "container", "component"];

/** Double-quoted DSL string; escapes keep every string on one line. Leading/trailing whitespace is trimmed. */
export function str(s: string): string {
  return (
    '"' +
    s
      .trim()
      .replaceAll("\\", "\\\\")
      .replaceAll('"', '\\"')
      .replaceAll("\n", "\\n")
      .replaceAll("\t", "\\t")
      .replaceAll("\r", "\\r") +
    '"'
  );
}

function invert(rec: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(rec).map(([k, v]) => [v, k]));
}
