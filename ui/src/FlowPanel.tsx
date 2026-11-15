import { useMemo, useState } from "react";
import { api } from "./api";
import { Fields, TextField } from "./fields";
import type { AppState, Flow, FlowStep } from "./types";
import { confirmDialog } from "./dialogs";

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
        steps: steps.map((s) => ({ relationshipId: s.relationshipId, description: s.description, response: s.response, example: s.example ?? "", format: s.format ?? "" })),
      }),
    );
  const setStep = (i: number, patch: Partial<FlowStep>) => saveSteps(flow.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: number) => {
    const s = [...flow.steps];
    const [x] = s.splice(i, 1);
    s.splice(i + d, 0, x);
    return saveSteps(s);
  };

  const cur = flowStep !== null ? flow.steps[flowStep] : null;
  const curRel = cur ? state.relationships.find((r) => r.id === cur.relationshipId) : null;
  return (
    <div className="panel-body" data-testid="flow-panel">
      {cur && curRel && (
        <div className="step-data" data-testid="step-data">
          <div className="panel-kind">
            Step {flowStep! + 1} of {flow.steps.length} · {cur.response ? "response" : "request"}
          </div>
          <div>
            <strong>{names.get(cur.response ? curRel.destinationId : curRel.sourceId)}</strong> → <strong>{names.get(cur.response ? curRel.sourceId : curRel.destinationId)}</strong>
          </div>
          <p>{cur.description || curRel.description}</p>
          {(cur.format || curRel.technologies.length > 0) && (
            <div className="muted small">
              {cur.format && <>Format: {cur.format}. </>}
              {curRel.technologies.length > 0 && <>Carried by: {curRel.technologies.join(", ")}.</>}
            </div>
          )}
          {cur.example ? (
            <pre className="example" data-testid="step-example">
              {cur.example}
            </pre>
          ) : (
            <div className="empty-note">No example data for this step.{!state.readOnly && " Add one under the step below."}</div>
          )}
          {curRel.sensitive.length > 0 && <div className="small">Sensitive: {curRel.sensitive.map((x) => `${x.item} (${x.level})`).join("; ")}</div>}
          {curRel.notes && <div className="muted small">{curRel.notes}</div>}
        </div>
      )}
      <div className="panel-kind">Flow</div>
      <Fields loose>
        <TextField label="Name" value={flow.title} onCommit={(v) => mutate(() => api.updateFlow(flow.key, { title: v }))} />
        <TextField label="Description" value={flow.description} multiline onCommit={(v) => mutate(() => api.updateFlow(flow.key, { description: v }))} />
      </Fields>
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
              {!state.readOnly && (
                <span className="step-tools">
                  <button className="icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up" title="Move up">
                    ↑
                  </button>
                  <button className="icon" disabled={i === flow.steps.length - 1} onClick={() => move(i, 1)} aria-label="Move down" title="Move down">
                    ↓
                  </button>
                  <button className="icon" onClick={() => saveSteps(flow.steps.filter((_, j) => j !== i))} aria-label="Remove step" title="Remove step">
                    ×
                  </button>
                </span>
              )}
            </div>
            <Fields loose>
              <TextField label="Step text" value={s.description} placeholder="(uses the relationship's description)" onCommit={(v) => setStep(i, { description: v })} />
              <TextField label="Data format" value={s.format ?? ""} placeholder="e.g. JSON, SQL, event" onCommit={(v) => setStep(i, { format: v })} />
              <TextField
                label="Example data sent / returned"
                value={s.example ?? ""}
                multiline
                rows={4}
                placeholder='e.g. {"username": "alice"}'
                onCommit={(v) => setStep(i, { example: v })}
                testId={`step-example-${i}`}
              />
              <label className="check small">
                <input type="checkbox" checked={s.response} onChange={(e) => setStep(i, { response: e.target.checked })} /> Response (travels back)
              </label>
            </Fields>
          </li>
        ))}
      </ol>
      {!state.readOnly && (
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
          <button disabled={!pick} data-testid="add-step" onClick={() => saveSteps([...flow.steps, { relationshipId: pick, description: "", response: false }])}>
            Add step
          </button>
        </div>
      )}
      {!state.readOnly && (
        <div className="panel-actions">
          <button
            className="danger"
            onClick={() => {
              void confirmDialog({ title: `Delete the flow "${flow.title}"?`, confirmLabel: "Delete", danger: true }).then(
                (yes) => yes && mutate(() => api.deleteFlow(flow.key)).then((ok) => ok && onDeleted()),
              );
            }}
          >
            Delete flow
          </button>
        </div>
      )}
    </div>
  );
}
