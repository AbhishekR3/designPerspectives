/** CSS class per element kind. Colour is decorative: every card also shows its kind as text. */
const KNOWN = new Set(["person", "softwareSystem", "hardwareSystem", "container", "dataStore", "queue", "topic", "component", "codeElement", "group"]);

export function kindClass(kind: string): string {
  return KNOWN.has(kind) ? `kind-${kind}` : "kind-other";
}
