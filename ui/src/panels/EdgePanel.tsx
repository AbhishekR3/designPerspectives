import { api } from "../api";
import { CodePaths } from "../CodeParts";
import { Section, TagInput, TextField } from "../fields";
import { openWork } from "../overlays";
import { StylePanel } from "../StylePanel";
import { type EdgeLayout, type Relationship } from "../types";
import type { Common } from "./common";
import { NotesEditor, SensitiveEditor } from "./sectionEditors";
import { WorkEditor } from "./valueEditors";

export function EdgePanel({ edgeId, ...p }: Common & { edgeId: string }) {
  const { state, diagram, mutate, lens } = p;
  const edge = diagram.edges.find((e) => e.id === edgeId);
  if (!edge) return null;
  const byId = new Map(state.elements.map((e) => [e.id, e]));
  const rels = edge.relationshipIds.map((id) => state.relationships.find((r) => r.id === id)).filter(Boolean) as Relationship[];
  const name = (id: string) => byId.get(id)?.name ?? diagram.nodes.find((n) => n.id === id)?.name ?? id;
  const style = edge.style;
  const setLayout = (layout: EdgeLayout) => mutate(() => api.layout(diagram.key, { edges: { [edge.id]: layout } }));
  const has = (s: (typeof lens.visibleSections)[number]) => lens.visibleSections.includes(s);
  const lineControls = diagram.level !== "flow" && (
    <>
      <label className="field inline">
        <span>Line shape</span>
        <select
          value={edge.layout.routing ?? "auto"}
          onChange={(e) => {
            const next = { ...edge.layout };
            if (e.target.value === "auto") delete next.routing;
            else next.routing = e.target.value as EdgeLayout["routing"];
            setLayout(next);
          }}
          data-testid="line-shape"
        >
          <option value="auto">Automatic</option>
          <option value="straight">Straight</option>
          <option value="curved">Curved (through the bend point)</option>
          <option value="smooth">Smooth S-curve</option>
          <option value="orthogonal">Right angles (elbow)</option>
          <option value="rounded">Rounded right angles</option>
        </select>
      </label>
      <button onClick={() => setLayout({})} disabled={Object.keys(edge.layout).length === 0} data-testid="reset-line">
        Reset line position
      </button>
      <p className="muted small">Drag the round grips on a selected line to move its ends to any point on a box, bend it, or slide its label.</p>
    </>
  );

  if (edge.id.startsWith("file:")) {
    return (
      <div className="panel-body" data-testid="edge-panel">
        <div className="panel-kind">Import</div>
        <p>
          {name(edge.source)} imports {name(edge.target)}.
        </p>
        <Section title="Appearance">
          <StylePanel target={edge.id} style={style} edge mutate={mutate} />
        </Section>
        {lineControls}
      </div>
    );
  }

  if (edge.derived) {
    return (
      <div className="panel-body" data-testid="edge-panel">
        <div className="panel-kind">Derived connection</div>
        <p className="muted">
          {name(edge.source)} → {name(edge.target)} is not drawn in the model directly. It comes from these relationships between elements inside them:
        </p>
        <ul className="rel-list">
          {rels.map((r) => {
            const t = edge.drillTargets.find((d) => d.relationshipId === r.id);
            return (
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
                  {r.technologies.length > 0 && ` [${r.technologies.join(", ")}]`}
                </div>
                {t && (
                  <button className="link small" onClick={() => p.onOpen(t.key)} data-testid={`open-drill-${r.id}`}>
                    Open where it is drawn
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <Section title="Appearance">
          <StylePanel target={edge.id} style={style} edge mutate={mutate} />
        </Section>
        {lineControls}
      </div>
    );
  }
  const r = rels[0];
  if (!r) return null;
  const save = (patch: object) => mutate(() => api.updateRelationship(r.id, patch));
  const detailKey = edge.detailKey ?? `connector-${r.id}`;
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
      {has("technology") && <TagInput label="Technology / protocol" value={r.technologies} suggestions={state.technologies} onChange={(v) => save({ technology: v })} testId="field-rel-technology" />}
      <label className="field">
        <span>Kind</span>
        <select value={r.kind} onChange={(e) => save({ kind: e.target.value })} data-testid="field-rel-kind">
          <option value="">— not set —</option>
          {state.enums.connectorKinds.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <button className="primary" onClick={() => p.onOpen(detailKey)} data-testid="open-connector">
        Open connector detail{r.stages.length ? ` (${r.stages.length} stages)` : ""}
      </button>
      {has("work") && (
        <Section title={`Linked work${openWork(r).length ? ` · ${openWork(r).length} open` : ""}`} count={r.work.length} testId="sec-rel-work">
          <WorkEditor rows={r.work} enums={p.state.enums} onSave={(rows) => save({ work: rows })} />
        </Section>
      )}
      {has("notes") && (
        <Section title="Notes" count={r.notes ? 1 : 0}>
          <NotesEditor value={r.notes} onSave={(v) => save({ notes: v })} />
        </Section>
      )}
      {has("sensitive") && (
        <Section title="Sensitive information" count={r.sensitive.length}>
          <SensitiveEditor rows={r.sensitive} levels={state.enums.sensitivity} onSave={(v) => save({ sensitive: v })} />
        </Section>
      )}
      {has("code") && (
        <Section title="Code" count={r.codePaths.length}>
          <CodePaths paths={r.codePaths} onSave={(v) => save({ codePaths: v })} onOpenDiagram={() => p.onOpen(`code-${r.id}`)} />
        </Section>
      )}
      <Section title="Appearance" count={Object.keys(style).length}>
        <StylePanel target={edge.id.startsWith("conn:") ? r.id : edge.id} style={style} edge mutate={mutate} />
      </Section>
      {lineControls}
      <div className="panel-actions">
        <button
          className="danger"
          onClick={() => {
            if (window.confirm("Delete this relationship? Flow steps that use it are removed too.")) mutate(() => api.deleteRelationship(r.id)).then((ok) => ok && p.onSelect(null));
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
