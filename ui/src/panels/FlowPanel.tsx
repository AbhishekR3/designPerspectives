import { useMemo, useState } from "react";
import { api } from "../api";
import { Fields, TextField } from "./formParts";
import type { AppState, Flow, FlowStep } from "../types";
import { confirmDialog } from "../common/dialogs";
import { SamplePayload } from "../inspect/SamplePayload";
import { stepInfo, stepSummaryLine, type StepEnd, type StepInfo } from "./flowStepInfo";
import { LIVENESS_LABEL, type FlowTesting } from "../testing/flowTesting";

export function FlowPanel({
  flow,
  state,
  mutate,
  onDeleted,
  flowStep,
  setFlowStep,
  onBacktrack,
  onOpenDiagram,
  testing,
}: {
  flow: Flow;
  state: AppState;
  mutate(fn: () => Promise<unknown>): Promise<boolean>;
  onDeleted(): void;
  flowStep: number | null;
  setFlowStep(n: number | null): void;
  onBacktrack(q: { flow: string; step: number }): void;
  /** Open a diagram (the code diagram of an end of the step). */
  onOpenDiagram?(key: string): void;
  /** System testing mode: each step's liveness, its breakpoint, and a way into its pipeline. */
  testing?: FlowTesting;
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

  const summaries = useMemo(
    () =>
      flow.steps.map((_, i) => {
        const si = stepInfo(state, flow, i);
        return si ? stepSummaryLine(si) : "";
      }),
    [state, flow],
  );
  const info = flowStep !== null ? stepInfo(state, flow, flowStep) : null;
  return (
    <div className="panel-body" data-testid="flow-panel">
      {info && <StepView info={info} flow={flow} readOnly={state.readOnly} onBacktrack={onBacktrack} onOpenDiagram={onOpenDiagram} />}
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
              {testing && (
                <span className="step-testing">
                  <span className={`live-word ${testing.liveness(s)}`} data-testid={`step-live-${i}`}>
                    {LIVENESS_LABEL[testing.liveness(s)]}
                  </span>
                  {s.order && (
                    <button
                      className={`step-bp${testing.hasBreakpoint(s) ? " on" : ""}`}
                      onClick={() => testing.toggleBreakpoint(s)}
                      aria-pressed={testing.hasBreakpoint(s)}
                      aria-label={`Breakpoint on step ${i + 1}`}
                      title="Pause the call of this step"
                      data-testid={`step-bp-${i}`}
                    >
                      <span className="bp-dot" />
                    </button>
                  )}
                  {onOpenDiagram && (state.relationships.find((r) => r.id === s.relationshipId)?.stages.length ?? 0) > 0 && (
                    <button className="link small" onClick={() => onOpenDiagram(`connector-${s.relationshipId}`)} data-testid={`step-into-${i}`}>
                      Step into pipeline
                    </button>
                  )}
                </span>
              )}
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
            {summaries[i] && (
              <div className="step-summary muted small" data-testid={`step-summary-${i}`}>
                {summaries[i]}
              </div>
            )}
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

const kindLabel = (kind: string) => (kind ? kind[0].toUpperCase() + kind.slice(1) : "");

/** The current step: who sends and receives, the data going out and coming in, the files at the two ends and the details of the connection. */
function StepView({
  info,
  flow,
  readOnly,
  onBacktrack,
  onOpenDiagram,
}: {
  info: StepInfo;
  flow: Flow;
  readOnly: boolean;
  onBacktrack(q: { flow: string; step: number }): void;
  onOpenDiagram?(key: string): void;
}) {
  const { sender, receiver, output, input } = info;
  const inputDiffers = input !== output;
  const details: [string, React.ReactNode][] = [];
  const ends = [sender, receiver].filter((e) => e.kind || e.technology);
  if (ends.length) {
    details.push([
      "Ends",
      <>
        {ends.map((e, i) => (
          <span key={e.id}>
            {i > 0 && "; "}
            {e.name}: {[kindLabel(e.kind), e.technology].filter(Boolean).join(", ")}
          </span>
        ))}
      </>,
    ]);
  }
  if (info.technologies.length) details.push(["Carried by", info.technologies.join(", ")]);
  if (info.endpoints.length) details.push(["Endpoints", info.endpoints.join("; ")]);
  if (info.dataAccess.length) {
    details.push(["Data", info.dataAccess.map((a) => `${a.mode === "write" ? "writes" : "reads"} ${a.asset}${a.owner ? ` of ${a.owner}` : ""}`).join("; ")]);
  }
  if (info.stages.count) details.push(["Stages", `${info.stages.count}: ${info.stages.names.join(" → ")}`]);
  if (info.sensitive.length) details.push(["Sensitive", info.sensitive.map((x) => `${x.item} (${x.level})`).join("; ")]);
  if (info.openWork.length) details.push(["Open work", info.openWork.map((w) => `${w.title} (${w.type}, ${w.status})`).join("; ")]);
  if (info.notes) details.push(["Notes", info.notes]);

  const fileLine = (verb: string, end: StepEnd) => (
    <li>
      {verb} <strong>{end.name}</strong> {verb === "Leaves" ? "from" : "in"} {end.file ? <code>{end.file}</code> : <span className="muted">file not set</span>}
      {end.codeKey && onOpenDiagram && (
        <>
          {" "}
          <button className="link" onClick={() => onOpenDiagram(end.codeKey!)} title={`Open the code diagram of ${end.name}`} data-testid="step-open-code">
            Open code
          </button>
        </>
      )}
    </li>
  );

  return (
    <div className="step-data" data-testid="step-data">
      <div className="panel-kind">
        Step {info.number} of {info.total} · {info.response ? "response" : "request"}
      </div>
      <div>
        <strong>{sender.name}</strong> → <strong>{receiver.name}</strong>
      </div>
      <p>{info.text}</p>
      <div className="step-io">
        <div className="step-io-col" data-testid="step-output">
          <div className="step-io-title">Output</div>
          <div className="muted small">
            {info.response ? "Sent back by" : "Sent by"} {sender.name}
            {output.format && <> · {output.format}</>}
          </div>
          {output.example ? (
            <SamplePayload text={output.example} testId="step-example" />
          ) : (
            <div className="empty-note">No example data for this step.{!readOnly && " Add one under the step below."}</div>
          )}
          {info.cameIn && (
            <div className="small step-chain">
              Came in at step {info.cameIn.step}
              {info.cameIn.summary && <>: {info.cameIn.summary}</>}
            </div>
          )}
        </div>
        <div className="step-io-col" data-testid="step-input">
          <div className="step-io-title">Input</div>
          <div className="muted small">
            Received by {receiver.name}
            {input.format && <> · {input.format}</>}
          </div>
          {inputDiffers && input.example ? (
            <SamplePayload text={input.example} previous={output.example} testId="step-input-example" />
          ) : (
            <div className="empty-note">{inputDiffers ? `No sample of what ${receiver.name} gets.` : output.example ? "Arrives as sent." : "Nothing recorded."}</div>
          )}
          {info.goesOn && (
            <div className="small step-chain">
              Goes on in step {info.goesOn.step}
              {info.goesOn.summary && <>: {info.goesOn.summary}</>}
            </div>
          )}
        </div>
      </div>
      <div className="step-files" data-testid="step-files">
        <div className="step-io-title">Files</div>
        <ul>
          {fileLine("Leaves", sender)}
          {fileLine("Arrives at", receiver)}
        </ul>
        {info.response && <div className="muted small">A response travels back, so it leaves where the request arrived.</div>}
        {(!sender.file || !receiver.file) && <div className="muted small">Set the files on the relationship, under Files at the ends.</div>}
      </div>
      {details.length > 0 && (
        <dl className="step-details" data-testid="step-details">
          {details.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      <button onClick={() => onBacktrack({ flow: flow.key, step: info.number })} data-testid="flow-backtrack">
        Backtrack from this step
      </button>
    </div>
  );
}
