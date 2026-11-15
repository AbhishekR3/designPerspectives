import { api } from "../api";
import { Section, TagInput, TextField } from "../fields";
import { StylePanel } from "../StylePanel";
import { KIND_LABEL, type DiagramNode, type Stage } from "../types";
import type { Common } from "./common";

export function StagePanel({ node, ...p }: Common & { node: DiagramNode }) {
  const { state, mutate, diagram } = p;
  const relId = diagram.scope!;
  const rel = state.relationships.find((r) => r.id === relId);
  if (!rel) return null;
  const stages = rel.stages;
  const idx = stages.findIndex((s) => s.id === node.stageId);
  const st = stages[idx];
  if (!st) return null;
  const saveStages = (next: Stage[]) => mutate(() => api.updateRelationship(relId, { stages: next }));
  const patch = (changes: Partial<Stage>) => saveStages(stages.map((s, i) => (i === idx ? { ...s, ...changes } : s)));
  const move = (d: number) => {
    const next = [...stages];
    [next[idx], next[idx + d]] = [next[idx + d], next[idx]];
    saveStages(next);
  };
  const components = state.elements.filter((e) => e.kind === "component" || e.kind === "container");
  return (
    <div className="panel-body" data-testid="stage-panel">
      <div className="panel-kind">Stage {idx + 1} of {stages.length}</div>
      <TextField label="Name" value={st.name} onCommit={(v) => patch({ name: v })} testId="stage-name" />
      <TextField label="Description" value={st.description ?? ""} multiline onCommit={(v) => patch({ description: v })} />
      <TagInput label="Technology" value={st.technologies ?? []} suggestions={state.technologies} onChange={(v) => patch({ technologies: v })} testId="stage-tech" />
      <label className="field">
        <span>Symbol</span>
        <select value={st.archType ?? "pipeline"} onChange={(e) => patch({ archType: e.target.value })}>
          {state.enums.archTypes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Implemented by (opens when double-clicked)</span>
        <select value={st.elementId ?? ""} onChange={(e) => patch({ elementId: e.target.value || undefined })} data-testid="stage-element">
          <option value="">— none —</option>
          {components.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} ({KIND_LABEL[e.kind]})
            </option>
          ))}
        </select>
      </label>
      {node.drillKey && <button onClick={() => p.onOpen(node.drillKey!)}>Open what implements this stage</button>}
      <Section title="Appearance" testId="sec-style">
        <StylePanel target={node.id} style={node.style} edge={false} mutate={mutate} />
      </Section>
      <div className="panel-actions">
        <button disabled={idx === 0} onClick={() => move(-1)}>
          Move earlier
        </button>
        <button disabled={idx === stages.length - 1} onClick={() => move(1)}>
          Move later
        </button>
        <button className="danger" onClick={() => saveStages(stages.filter((_, i) => i !== idx)).then((ok) => ok && p.onSelect(null))}>
          Delete stage
        </button>
      </div>
    </div>
  );
}
