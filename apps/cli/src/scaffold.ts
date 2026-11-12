/** Files written by `dp init` (spec file 04 §1). Generated through the same printers as every save. */
import type { Permissions, WorkspaceSettings } from "@designperspectives/contracts";
import { emptyModel } from "@designperspectives/contracts";
import { emptySidecarSet, type SidecarSet } from "@designperspectives/core";

export function defaultPermissions(): Permissions {
  return {
    profiles: {
      architect: { title: "Architect", capabilities: ["view", "comment", "propose", "approve", "edit", "export", "admin"], perspectives: [], members: [] },
      engineer: { title: "Engineer", capabilities: ["view", "comment", "propose", "export"], levels: ["container", "component", "code", "dynamic", "deployment"], perspectives: [], members: [] },
      business: { title: "Business stakeholder", capabilities: ["view", "comment", "export"], levels: ["landscape", "context"], perspectives: [], members: [] },
    },
    decisionRights: [],
  };
}

export function scaffold(name: string): { model: ReturnType<typeof emptyModel>; sidecars: SidecarSet } {
  const settings: WorkspaceSettings = {
    schemaVersion: 1,
    name,
    modelBackend: "likec4",
    decisions: "decisions",
    plugins: [],
    thresholds: { decisionCostUsd: 5000 },
  };
  const sidecars = emptySidecarSet();
  sidecars.settings = settings;
  sidecars.permissions = defaultPermissions();
  return { model: emptyModel(), sidecars };
}
