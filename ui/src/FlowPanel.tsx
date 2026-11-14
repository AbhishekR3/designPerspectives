import { useMemo, useState } from "react";
import { api } from "./api";
import { TextField } from "./fields";
import type { AppState, Flow, FlowStep } from "./types";

export function FlowPanel({
  flow,
  state,
  mutate,
  onDeleted,
  flowStep,
  setFlowStep,
}: {
  flow: Flow;
  state: AppState;
  mutate(fn: () => Promise<unknown>): Promise<boolean>;
  onDeleted(): void;
  flowStep: number | null;
  setFlowStep(n: number | null): void;
}) {
  const [filter, setFilter] = useState("");
  const [pick, setPick] = useState("");
  const names = useMemo(() => new Map(state.elements.map((e) => [e.id, e.name])), [state.elements]);
  const relLabel = (id: string) => {
    const r = state.relationships.find((x) => x.id === id);
    if (!r) return id;
    return `${names.get(r.sourceId)} → ${names.get(r.destinationId)}: ${r.description}`;
  };
  const options = state.relationships
    .map((r) => ({ id: r.id, label: relLabel(r.id) }))
    .filter((o) => o.label.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => a.label.localeCompare(b.label));

  const saveSteps = (steps: FlowStep[]) =>
    mutate(() =>
      api.updateFlow(flow.key, {
        steps: steps.map((s) => ({ relationshipId: s.relationshipId, description: s.description, response: s.response })),
      }),
    );
  const setStep = (i: number, patch: Partial<FlowStep>) => saveSteps(flow.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: number) => {
    const s = [...flow.steps];
    const [x] = s.splice(i, 1);
    s.splice(i + d, 0, x);
    return saveSteps(s);
  };

  return (
    <div className="panel-body" data-testid="flow-panel">
      <div className="panel-kind">Flow</div>
      <TextField label="Name" value={flow.title} onCommit={(v) => mutate(() => api.updateFlow(flow.key, { title: v }))} />
      <TextField label="Description" value={flow.description} multiline onCommit={(v) => mutate(() => api.updateFlow(flow.key, { description: v }))} />
      {flow.warnings.length > 0 && (
        <div className="warning">
          <strong>May not open in Structurizr:</strong>
          <ul>
            {flow.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      <h4>
        Steps <span className="count">{flow.steps.length}</span>
      </h4>
      <ol className="steps" data-testid="flow-steps">
        {flow.steps.map((s, i) => (
          <li key={`${i}-${s.relationshipId}`} className={flowStep === i ? "current" : ""}>
            <div className="step-head">
              <button className="link" onClick={() => setFlowStep(i)} title="Show this step">
                {relLabel(s.relationshipId)}
              </button>
              <span className="step-tools">
                <button className="icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                  ↑
                </button>
                <button className="icon" disabled={i === flow.steps.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                  ↓
                </button>
                <button className="icon" onClick={() => saveSteps(flow.steps.filter((_, j) => j !== i))} aria-label="Remove step">
                  ×
                </button>
              </span>
            </div>
            <TextField label="Step text" value={s.description} placeholder="(uses the relationship's description)" onCommit={(v) => setStep(i, { description: v })} />
            <label className="check small">
              <input type="checkbox" checked={s.response} onChange={(e) => setStep(i, { response: e.target.checked })} /> Response (travels back)
            </label>
          </li>
        ))}
      </ol>
      <div className="add-step">
        <h4>Add a step</h4>
        <input placeholder="Filter relationships…" value={filter} onChange={(e) => setFilter(e.target.value)} data-testid="step-filter" />
        <select value={pick} onChange={(e) => setPick(e.target.value)} size={6} data-testid="step-select">
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          disabled={!pick}
          data-testid="add-step"
          onClick={() => saveSteps([...flow.steps, { relationshipId: pick, description: "", response: false }])}
        >
          Add step
        </button>
      </div>
      <div className="panel-actions">
        <button
          className="danger"
          onClick={() => {
            if (window.confirm(`Delete the flow "${flow.title}"?`)) mutate(() => api.deleteFlow(flow.key)).then((ok) => ok && onDeleted());
          }}
        >
          Delete flow
        </button>
      </div>
    </div>
  );
}
