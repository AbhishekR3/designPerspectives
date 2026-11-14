import { useState } from "react";
import { api } from "./api";
import { TextField } from "./fields";
import { KIND_LABEL, type AppState, type Diagram, type ElementSummary, type Lens, type Relationship } from "./types";

interface Common {
  state: AppState;
  diagram: Diagram;
  lens: Lens;
  mutate(fn: () => Promise<unknown>): Promise<boolean>;
  onSelect(sel: { type: "node" | "edge"; id: string } | null): void;
  onOpen(key: string): void;
  onReveal(elementId: string): void;
  focusName: boolean;
}

export function homeDiagramOf(el: ElementSummary): string {
  if (el.kind === "container") return `containers-${el.parentId}`;
  if (el.kind === "component") return `components-${el.parentId}`;
  return "landscape";
}

function ConnectionList({
  title,
  rels,
  other,
  inside,
  selfId,
  state,
  onReveal,
  testId,
}: {
  title: string;
  rels: Relationship[];
  other(r: Relationship): string;
  inside(r: Relationship): string;
  selfId: string;
  state: AppState;
  onReveal(id: string): void;
  testId: string;
}) {
  const byId = new Map(state.elements.map((e) => [e.id, e]));
  return (
    <div className="connections" data-testid={testId}>
      <h4>
        {title} <span className="count">{rels.length}</span>
      </h4>
      {rels.length === 0 && <div className="muted">None</div>}
      <ul>
        {rels.map((r) => {
          const o = byId.get(other(r));
          return (
            <li key={r.id}>
              <button className="link" onClick={() => onReveal(other(r))} title="Show this element">
                {o?.name ?? other(r)}
              </button>
              <div className="muted small">
                {r.description}
                {r.technology && ` [${r.technology}]`}
                {inside(r) !== selfId && <> · via {byId.get(inside(r))?.name ?? inside(r)}</>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ObjectPanel({ element, ...p }: Common & { element: ElementSummary }) {
  const { state, lens, mutate } = p;
  const save = (patch: object) => mutate(() => api.updateElement(element.id, patch));
  // Connections of the element and of everything inside it (a container lists its components' connections).
  const subtree = new Set([element.id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const e of state.elements)
      if (e.parentId && subtree.has(e.parentId) && !subtree.has(e.id)) {
        subtree.add(e.id);
        grew = true;
      }
  }
  const incoming = state.relationships.filter((r) => subtree.has(r.destinationId) && !subtree.has(r.sourceId));
  const outgoing = state.relationships.filter((r) => subtree.has(r.sourceId) && !subtree.has(r.destinationId));
  const groups = state.tagGroups.filter((g) => !lens.hiddenTagGroups.includes(g.name));
  const parent = element.parentId ? state.elements.find((e) => e.id === element.parentId) : null;
  const [newLink, setNewLink] = useState({ label: "", url: "" });
  const drill = element.kind === "softwareSystem" ? `containers-${element.id}` : element.kind === "container" ? `components-${element.id}` : null;

  return (
    <div className="panel-body" data-testid="object-panel">
      <div className="panel-kind">
        {KIND_LABEL[element.kind]}
        {parent && <span className="muted"> in {parent.name}</span>}
      </div>
      <TextField
        label="Name"
        value={element.name}
        onCommit={(v) => save({ name: v })}
        testId="field-name"
        autoFocus={p.focusName}
      />
      <TextField label="Description" value={element.description} multiline onCommit={(v) => save({ description: v })} testId="field-description" />
      {(element.kind === "container" || element.kind === "component") && (
        <TextField label="Technology" value={element.technology} onCommit={(v) => save({ technology: v })} testId="field-technology" />
      )}
      <TextField label="Owner" value={element.owner} onCommit={(v) => save({ owner: v })} testId="field-owner" />
      <TextField label="Main link (URL)" value={element.url} onCommit={(v) => save({ url: v })} placeholder="https://" />
      <div className="field">
        <span>Other links</span>
        <ul className="links">
          {element.links.map((l, i) => (
            <li key={i}>
              <a href={l.url} target="_blank" rel="noreferrer">
                {l.label || l.url}
              </a>
              <button className="icon" aria-label="Remove link" onClick={() => save({ links: element.links.filter((_, j) => j !== i) })}>
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="row">
          <input placeholder="Label" value={newLink.label} onChange={(e) => setNewLink({ ...newLink, label: e.target.value })} />
          <input placeholder="https://" value={newLink.url} onChange={(e) => setNewLink({ ...newLink, url: e.target.value })} />
          <button
            disabled={!newLink.url.trim()}
            onClick={async () => {
              if (await save({ links: [...element.links, newLink] })) setNewLink({ label: "", url: "" });
            }}
          >
            Add
          </button>
        </div>
      </div>
      {(element.kind === "person" || element.kind === "softwareSystem") && (
        <label className="check">
          <input type="checkbox" checked={element.location === "External"} onChange={(e) => save({ external: e.target.checked })} />
          External (outside our organisation)
        </label>
      )}
      {groups.length > 0 && (
        <div className="tag-fields">
          <h4>Tags</h4>
          {groups.map((g) => (
            <label className="field inline" key={g.name}>
              <span>{g.name}</span>
              <select
                value={element.tags[g.name] ?? ""}
                data-testid={`tag-${g.name}`}
                onChange={(e) => save({ tags: { [g.name]: e.target.value || null } })}
              >
                <option value="">—</option>
                {g.values.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}
      <ConnectionList title="Incoming" rels={incoming} other={(r) => r.sourceId} inside={(r) => r.destinationId} selfId={element.id} state={state} onReveal={p.onReveal} testId="incoming" />
      <ConnectionList title="Outgoing" rels={outgoing} other={(r) => r.destinationId} inside={(r) => r.sourceId} selfId={element.id} state={state} onReveal={p.onReveal} testId="outgoing" />
      <div className="panel-actions">
        {drill && <button onClick={() => p.onOpen(drill)}>Open {element.kind === "softwareSystem" ? "containers" : "components"}</button>}
        {element.kind === "softwareSystem" && <button onClick={() => p.onOpen(`context-${element.id}`)}>Open context</button>}
        <button
          className="danger"
          data-testid="delete-element"
          onClick={() => {
            const n = element.childCount;
            const msg = n ? `Delete "${element.name}" and the ${n} element(s) inside it?` : `Delete "${element.name}"?`;
            if (window.confirm(`${msg} Its connections are deleted too.`))
              mutate(() => api.deleteElement(element.id)).then((ok) => ok && p.onSelect(null));
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export function EdgePanel({ edgeId, ...p }: Common & { edgeId: string }) {
  const { state, diagram, mutate } = p;
  const edge = diagram.edges.find((e) => e.id === edgeId);
  if (!edge) return null;
  const byId = new Map(state.elements.map((e) => [e.id, e]));
  const rels = edge.relationshipIds.map((id) => state.relationships.find((r) => r.id === id)).filter(Boolean) as Relationship[];
  const name = (id: string) => byId.get(id)?.name ?? id;

  if (edge.derived) {
    return (
      <div className="panel-body" data-testid="edge-panel">
        <div className="panel-kind">Derived connection</div>
        <p className="muted">
          {name(edge.source)} → {name(edge.target)} is not drawn in the model directly. It comes from these relationships between
          elements inside them:
        </p>
        <ul className="rel-list">
          {rels.map((r) => (
            <li key={r.id}>
              <button className="link" onClick={() => p.onReveal(r.sourceId)}>
                {name(r.sourceId)}
              </button>{" "}
              →{" "}
              <button className="link" onClick={() => p.onReveal(r.destinationId)}>
                {name(r.destinationId)}
              </button>
              <div className="muted small">
                {r.description}
                {r.technology && ` [${r.technology}]`}
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const r = rels[0];
  if (!r) return null;
  const save = (patch: object) => mutate(() => api.updateRelationship(r.id, patch));
  return (
    <div className="panel-body" data-testid="edge-panel">
      <div className="panel-kind">Relationship</div>
      <p>
        <button className="link" onClick={() => p.onReveal(r.sourceId)}>
          {name(r.sourceId)}
        </button>{" "}
        →{" "}
        <button className="link" onClick={() => p.onReveal(r.destinationId)}>
          {name(r.destinationId)}
        </button>
      </p>
      <TextField label="Description" value={r.description} onCommit={(v) => save({ description: v })} testId="field-rel-description" autoFocus={p.focusName} />
      <TextField label="Technology" value={r.technology} onCommit={(v) => save({ technology: v })} testId="field-rel-technology" />
      <div className="panel-actions">
        <button
          className="danger"
          onClick={() => {
            if (window.confirm("Delete this relationship? Flow steps that use it are removed too."))
              mutate(() => api.deleteRelationship(r.id)).then((ok) => ok && p.onSelect(null));
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
