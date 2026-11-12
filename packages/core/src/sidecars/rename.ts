import type { Characteristics, CodeMapping, RiskSession } from "@designperspectives/contracts";
import { setEntry } from "./types.js";
import type { SidecarSet } from "./types.js";

type Rename = (id: string) => string;

/** `from` → `to`, and `from.x.y` → `to.x.y`; anything else unchanged. */
export function renameElementId(id: string, from: string, to: string): string {
  if (id === from) return to;
  return id.startsWith(`${from}.`) ? `${to}${id.slice(from.length)}` : id;
}

const RELATIONSHIP_ID = /^([^>#]*)->([^#]*)#(.*)$/;

/** Renames both endpoints of `<source>-><target>#<kind>[:<key>]`; other strings go through `rename`. */
export function renameReference(ref: string, rename: Rename): string {
  const match = RELATIONSHIP_ID.exec(ref);
  if (!match) return rename(ref);
  const [, source = "", target = "", rest = ""] = match;
  return `${rename(source)}->${rename(target)}#${rest}`;
}

function mapRecord<T>(record: Record<string, T>, fn: (key: string, value: T) => [string, T]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(record)) {
    const [newKey, newValue] = fn(key, value);
    setEntry(out, newKey, newValue);
  }
  return out;
}

function renameCharacteristics(c: Characteristics | undefined, rename: Rename): Characteristics | undefined {
  if (!c) return undefined;
  return { ...c, driving: c.driving.map((d) => ({ ...d, scope: d.scope.map(rename) })) };
}

function renameCodeMapping(m: CodeMapping | undefined, rename: Rename): CodeMapping | undefined {
  if (!m) return undefined;
  return { ...m, rules: m.rules.map((r) => ({ ...r, element: rename(r.element) })) };
}

function renameRisk(session: RiskSession, rename: Rename): RiskSession {
  return {
    ...session,
    scores: session.scores.map((s) => ({ ...s, element: rename(s.element) })),
    mitigations: session.mitigations.map((m) => ({ ...m, element: rename(m.element) })),
  };
}

/**
 * Rewrites every sidecar reference to element `from` (and to its descendants `from.*`) so it points at `to`:
 * element sidecar keys and ids, both endpoints of relationship ids, code-mapping rules, layout node keys,
 * note anchors, ADR `elements`, risk scores and mitigations, and characteristic `scope` entries.
 * Pure: the input is not modified. The caller must ensure `to` (and `to.*`) do not exist yet; on a
 * collision the renamed entry wins.
 */
export function renameElementInSidecars(set: SidecarSet, from: string, to: string): SidecarSet {
  const rename: Rename = (id) => renameElementId(id, from, to);
  return {
    ...set,
    characteristics: renameCharacteristics(set.characteristics, rename),
    elements: mapRecord(set.elements, (key, e) => [rename(key), { ...e, id: rename(e.id) }]),
    relationships: set.relationships.map((r) => ({ ...r, id: renameReference(r.id, rename) })),
    codemapping: renameCodeMapping(set.codemapping, rename),
    layouts: mapRecord(set.layouts, (key, l) => [key, { ...l, nodes: mapRecord(l.nodes, (n, p) => [rename(n), p]) }]),
    notes: mapRecord(set.notes, (key, n) => [
      key,
      { ...n, frontMatter: { ...n.frontMatter, anchor: renameReference(n.frontMatter.anchor, rename) } },
    ]),
    risk: mapRecord(set.risk, (key, s) => [key, renameRisk(s, rename)]),
    adrs: mapRecord(set.adrs, (key, a) => [key, { ...a, frontMatter: { ...a.frontMatter, elements: a.frontMatter.elements.map(rename) } }]),
  };
}
