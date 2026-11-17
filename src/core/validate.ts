/**
 * Checks run before every save and by `dp validate`.
 *
 * Structural rules mirror what structurizr-client WorkspaceUtils.loadWorkspaceFromJson rejects
 * (see structurizr-client/src/test/java/com/structurizr/api/WorkspaceRulesValidationTests.java),
 * so a file we write should load in Structurizr. Sidecar rules are ours.
 */

import { decisionErrors } from "./decisions.js";
import { buildIndex, getProps, ModelError, TAG_PREFIX, type Index } from "./modelEdits.js";
import { BUILTIN_LENSES, LEVELS, type Sidecar } from "./designPerspectivesFile.js";
import { allViews, VIEW_LISTS, type Workspace } from "./workspace.js";
import type { Decision } from "../shared/types.js";

function counts<T>(items: T[], key: (t: T) => string = String): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) m.set(key(it), (m.get(key(it)) ?? 0) + 1);
  return m;
}

/** Wording for a problem found `c` times: the plain message for two, a count above that, so that
 *  `Project.edit` (which refuses messages that were not there before) notices a problem getting worse. */
const times = (c: number) => (c > 2 ? ` There are ${c} of them.` : "");
const TIMES = / There are (\d+) of them\.$/;

/** The messages in `after` that are new or worse than in `before`: a message that was not there, or
 *  a counted problem whose count went up. A count going down (repairing duplicates one by one) is not new. */
export function addedErrors(before: string[], after: string[]): string[] {
  const split = (e: string): [string, number] => {
    const m = TIMES.exec(e);
    return m ? [e.slice(0, m.index), Number(m[1])] : [e, 1];
  };
  const had = new Map(before.map(split));
  return after.filter((e) => {
    const [base, n] = split(e);
    const was = had.get(base);
    return was === undefined || n > was;
  });
}

/** Model rule errors in the workspace, the sidecar and the decision records. */
export function errors(ws: Workspace, sidecar: Sidecar, decisions: Decision[] = []): string[] {
  return [...modelErrors(ws, sidecar), ...decisionErrors(decisions)];
}

function modelErrors(ws: Workspace, sidecar: Sidecar): string[] {
  const out: string[] = [];
  let idx: Index;
  try {
    idx = buildIndex(ws); // duplicate element / relationship IDs
  } catch (e) {
    if (e instanceof ModelError) return [e.message];
    throw e;
  }

  // Names (Structurizr Model.hydrate)
  for (const [n, c] of counts([...ws.model.people, ...ws.model.softwareSystems], (e) => e.name)) {
    if (c > 1) out.push(`A person or software system named "${n}" already exists.${times(c)}`);
  }
  for (const s of ws.model.softwareSystems) {
    for (const [n, c] of counts(s.containers ?? [], (x) => x.name)) {
      if (c > 1) out.push(`A container named "${n}" already exists within "${s.name}".${times(c)}`);
    }
    for (const cont of s.containers ?? []) {
      for (const [n, c] of counts(cont.components ?? [], (x) => x.name)) {
        if (c > 1) out.push(`A component named "${n}" already exists within "${cont.name}".${times(c)}`);
      }
    }
  }

  // Relationships
  const pairs = new Map<string, { a: string; b: string; d: string; n: number }>();
  for (const r of idx.relationships.values()) {
    for (const end of [r.sourceId, r.destinationId]) {
      if (!idx.elements.has(end)) out.push(`Relationship "${r.id}" points to a missing element "${end}".`);
    }
    if (!idx.elements.has(r.sourceId) || !idx.elements.has(r.destinationId)) continue;
    const d = r.description || "";
    const k = `${r.sourceId}\u0000${r.destinationId}\u0000${d}`;
    const p = pairs.get(k) ?? { a: r.sourceId, b: r.destinationId, d, n: 0 };
    p.n++;
    pairs.set(k, p);
  }
  for (const { a, b, d, n } of pairs.values()) {
    if (n > 1) {
      out.push(`A relationship with the description "${d}" already exists between "${idx.elements.get(a)!.name}" and "${idx.elements.get(b)!.name}".${times(n)}`);
    }
  }
  // A relationship cannot join an element and its own parent or child (Structurizr refuses to add one).
  // Self-relationships are not flagged: Structurizr models can legitimately contain them.
  for (const r of idx.relationships.values()) {
    if (!idx.elements.has(r.sourceId) || !idx.elements.has(r.destinationId) || r.sourceId === r.destinationId) continue;
    if (idx.ancestors(r.sourceId).includes(r.destinationId) || idx.ancestors(r.destinationId).includes(r.sourceId)) {
      out.push(`Relationship "${r.id}" joins "${idx.elements.get(r.sourceId)!.name}" and "${idx.elements.get(r.destinationId)!.name}", one of which contains the other.`);
    }
  }

  // Views
  for (const [k, c] of counts(allViews(ws), (v) => v.key)) if (c > 1) out.push(`A view with the key ${k} already exists.${times(c)}`);
  // Element checks only for view types we model; deployment views hold deployment nodes.
  for (const list of VIEW_LISTS) {
    for (const v of ws.views[list]) {
      const scope = v.softwareSystemId || v.containerId || v.elementId;
      if (scope && !idx.elements.has(scope)) {
        out.push(`The view with key "${v.key}" is associated with an element (id=${scope}), but that element does not exist in the model.`);
      }
      for (const e of v.elements) {
        if (!idx.elements.has(e.id)) out.push(`The view with key "${v.key}" references an element (id=${e.id}), but that element does not exist in the model.`);
      }
      for (const r of v.relationships) {
        if (!idx.relationships.has(r.id)) {
          out.push(`The view with key "${v.key}" references a relationship (id=${r.id}), but that relationship does not exist in the model.`);
        }
      }
    }
  }

  // Sidecar
  const groups = new Map<string, Set<string>>();
  for (const [n, c] of counts(sidecar.tagGroups, (g) => g.name)) if (c > 1) out.push(`Two tag groups are named "${n}".`);
  for (const g of sidecar.tagGroups) {
    if (!g.name.trim()) out.push("A tag group has an empty name.");
    groups.set(g.name, new Set(g.values.map((v) => v.name)));
    for (const [n, c] of counts(g.values, (v) => v.name)) if (c > 1) out.push(`Tag group "${g.name}" has the value "${n}" twice.`);
  }
  for (const el of idx.elements.values()) {
    for (const [k, val] of Object.entries(getProps(el))) {
      if (!k.startsWith(TAG_PREFIX)) continue;
      const group = k.slice(TAG_PREFIX.length);
      const allowed = groups.get(group);
      if (!allowed) out.push(`"${el.name}" has a value for tag group "${group}", which is not defined.`);
      else if (!allowed.has(val)) out.push(`"${el.name}" has "${val}" for tag group "${group}", which is not one of its values.`);
    }
  }
  for (const [n, c] of counts(sidecar.lenses, (l) => l.id)) if (c > 1) out.push(`Two lenses have the ID "${n}".`);
  const charNames = new Set(sidecar.characteristics.map((c) => c.name));
  for (const lens of sidecar.lenses) {
    const builtin = BUILTIN_LENSES.find((b) => b.id === lens.id);
    if (builtin) out.push(`The lens ID "${builtin.id}" is reserved for the built-in ${builtin.name} lens.`);
    const bad = lens.visibleLevels.filter((lv) => !(LEVELS as readonly string[]).includes(lv));
    if (bad.length) out.push(`Lens "${lens.name}" has unknown levels: ${bad.join(", ")}.`);
    // Default overlay: a tag group name, "@cost", "@tech", "@work:<type>" or "@char:<characteristic>".
    const ov = lens.defaultOverlay;
    if (!ov || ov === "@cost" || ov === "@tech" || ov.startsWith("@work:")) continue;
    if (ov.startsWith("@char:")) {
      if (!charNames.has(ov.slice(6))) out.push(`Lens "${lens.name}" uses characteristic "${ov.slice(6)}", which is not defined.`);
    } else if (!groups.has(ov)) out.push(`Lens "${lens.name}" uses tag group "${ov}", which is not defined.`);
  }
  return out;
}
