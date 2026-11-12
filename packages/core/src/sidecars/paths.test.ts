import { describe, expect, it } from "vitest";
import { classifySidecarPath } from "./index.js";

describe("classifySidecarPath", () => {
  it.each([
    ["designperspectives.yaml", "designperspectives.yaml"],
    ["permissions.yaml", "permissions.yaml"],
    ["sidecars/characteristics.yaml", "sidecars/characteristics.yaml"],
    ["sidecars/relationships.yaml", "sidecars/relationships.yaml"],
    ["sidecars/codemapping.yaml", "sidecars/codemapping.yaml"],
    ["sidecars/elements/orders.api.yaml", "sidecars/elements/*.yaml"],
    ["sidecars/layout/landscape.yaml", "sidecars/layout/*.yaml"],
    ["sidecars/notes/n-1.md", "sidecars/notes/*.md"],
    ["sidecars/risk/rs-1.yaml", "sidecars/risk/*.yaml"],
    ["decisions/ADR-0001-x.md", "decisions/**/ADR-*.md"],
    ["decisions/2026/q4/ADR-0002-y.md", "decisions/**/ADR-*.md"],
    ["approvals/ADR-0001.sig.yaml", "approvals/*.sig.yaml"],
  ])("%s → %s", (path, pattern) => {
    expect(classifySidecarPath(path)).toBe(pattern);
  });

  it.each([
    "model/orders.c4",
    "sidecars/secure/keys.yaml",
    "sidecars/secure/elements/a.yaml",
    "sidecars/elements/nested/a.yaml",
    "sidecars/elements/a.yml",
    "sidecars/notes/a.yaml",
    "decisions/README.md",
    "decisions/adr-0001.md",
    "approvals/ADR-0001.yaml",
    "stages/s1.yaml",
    "standards/naming.yaml",
    "other/designperspectives.yaml",
    "",
  ])("%s → not a sidecar", (path) => {
    expect(classifySidecarPath(path)).toBeUndefined();
  });

  it("honours a custom decisions folder", () => {
    expect(classifySidecarPath("docs/adr/ADR-0001-x.md", "./docs/adr/")).toBe("decisions/**/ADR-*.md");
    expect(classifySidecarPath("decisions/ADR-0001-x.md", "docs/adr")).toBeUndefined();
  });
});
