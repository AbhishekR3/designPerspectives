import { api } from "../api";
import { CodePaths } from "../CodeParts";
import { Fields, Section, TagInput } from "../fields";
import type { Common } from "./common";
import { promptDialog } from "../dialogs";

export function ConnectorPanel(p: Common) {
  const { state, diagram, mutate } = p;
  const c = diagram.connector;
  const rel = state.relationships.find((r) => r.id === diagram.scope);
  if (!c || !rel) return null;
  const save = (patch: object) => mutate(() => api.updateRelationship(rel.id, patch));
  return (
    <div className="panel-body" data-testid="connector-panel">
      <div className="panel-kind">Connector detail</div>
      <h2 className="panel-title">{c.name}</h2>
      <p className="muted">{rel.description}</p>
      <Fields loose>
        <label className="field">
          <span>Kind</span>
          <select value={rel.kind} onChange={(e) => save({ kind: e.target.value })}>
            <option value="">— not set —</option>
            {state.enums.connectorKinds.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <TagInput label="Technology / protocol" value={rel.technologies} suggestions={state.technologies} onChange={(v) => save({ technology: v })} />
      </Fields>
      <h4>
        Stages <span className="count">{rel.stages.length}</span>
      </h4>
      <ol className="stage-list">
        {rel.stages.map((s) => (
          <li key={s.id}>
            <button className="link" onClick={() => p.onSelect({ type: "node", id: `stage:${rel.id}:${s.id}` })}>
              {s.name}
            </button>
          </li>
        ))}
      </ol>
      {!state.readOnly && (
        <button
          className="primary"
          data-testid="add-stage"
          onClick={async () => {
            const name = await promptDialog({ title: "Name of the new stage", label: "A step inside this connector", confirmLabel: "Add" });
            if (name) save({ stages: [...rel.stages, { id: "", name }] });
          }}
        >
          + Add stage
        </button>
      )}
      {c.codeKey && <button onClick={() => p.onOpen(c.codeKey!)}>Open code of this connector</button>}
      {!c.codeKey && (
        <Section title="Code of this connector">
          <CodePaths paths={rel.codePaths} onSave={(v) => save({ codePaths: v })} />
        </Section>
      )}
      <p className="muted small">Stages are the steps inside a pipeline or protocol. A stage can point at the component that implements it; double-click the stage to open that component.</p>
      <button onClick={() => p.onOpen(diagram.breadcrumb[Math.max(0, diagram.breadcrumb.length - 2)].key)}>Back to the diagram</button>
    </div>
  );
}
