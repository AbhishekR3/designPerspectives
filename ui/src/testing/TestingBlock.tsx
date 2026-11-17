import { useState } from "react";
import { api } from "../api";
import { CopyButton } from "../common/CopyButton";
import type { TestingActions } from "../hooks/useTesting";
import { PipelineData } from "../inspect/SamplePayload";
import { TextField } from "../panels/formParts";
import type { AppState, BreakpointCondition, BreakpointTarget, Diagram, InterceptPoint, Selection, TestingState } from "../types";
import { breakpointsOn, patchBreakpoints, targetOf, targetsOf, toggleBreakpoints } from "./breakpoints";

const OPS: BreakpointCondition["op"][] = ["=", "!=", "contains", ">", "<", "exists"];

/** The breakpoint switch of the selected line or box, with the phase to pause at and the conditions that must hold. */
function BreakpointControls({ testing, targets, actions, subject }: { testing: TestingState; targets: BreakpointTarget[]; actions: TestingActions; subject: string }) {
  const bps = breakpointsOn(testing, targets);
  const first = bps[0];
  const [draft, setDraft] = useState<BreakpointCondition[] | null>(null);
  const rows = draft ?? first?.conditions ?? [];
  const setRow = (i: number, patch: Partial<BreakpointCondition>) => setDraft(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const phase = first?.phase ?? "request";
  return (
    <div className="bp-controls" data-testid="bp-controls">
      <label className="check">
        <input type="checkbox" checked={bps.length > 0} onChange={() => void toggleBreakpoints(testing, targets, actions)} data-testid="bp-toggle" />
        Breakpoint: pause {subject} (F9)
      </label>
      {first && (
        <>
          <label className="field inline">
            <span>Pause at</span>
            <select value={phase} onChange={(e) => void patchBreakpoints(testing, targets, { phase: e.target.value as "request" | "response" | "both" }, actions)} data-testid="bp-phase">
              <option value="request">the request</option>
              <option value="response">the reply</option>
              <option value="both">both</option>
            </select>
          </label>
          <label className="check small">
            <input type="checkbox" checked={first.enabled} onChange={(e) => void patchBreakpoints(testing, targets, { enabled: e.target.checked }, actions)} data-testid="bp-enabled" /> Switched on
          </label>
          <details open={rows.length > 0}>
            <summary className="muted small">Only when… ({rows.length})</summary>
            {rows.map((c, i) => (
              <div key={i} className="bp-cond row" data-testid={`bp-cond-${i}`}>
                <input value={c.field} placeholder="body.amount" onChange={(e) => setRow(i, { field: e.target.value })} aria-label="Field" />
                <select value={c.op} onChange={(e) => setRow(i, { op: e.target.value as BreakpointCondition["op"] })} aria-label="Comparison">
                  {OPS.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
                <input value={c.value} disabled={c.op === "exists"} onChange={(e) => setRow(i, { value: e.target.value })} aria-label="Value" />
                <button className="icon" onClick={() => setDraft(rows.filter((_, j) => j !== i))} aria-label="Remove this condition" title="Remove">
                  ×
                </button>
              </div>
            ))}
            <p className="muted small">Fields: body.amount, header.x-id, query.page, status.</p>
            <div className="row">
              <button className="small" onClick={() => setDraft([...rows, { field: "", op: "=", value: "" }])} data-testid="bp-cond-add">
                Add a condition
              </button>
              {draft && (
                <button
                  className="small primary"
                  onClick={() => {
                    void patchBreakpoints(testing, targets, { conditions: draft.filter((c) => c.field.trim()) }, actions);
                    setDraft(null);
                  }}
                  data-testid="bp-cond-save"
                >
                  Apply
                </button>
              )}
            </div>
          </details>
        </>
      )}
    </div>
  );
}

/** The intercept point of a line or stage: its base URL to copy, and a way to close it. */
function PointControls({
  point,
  target,
  callerName,
  targetName,
  onOpen,
  actions,
  refusal,
}: {
  point: InterceptPoint | undefined;
  target: string | null;
  callerName: string;
  targetName: string;
  onOpen(): void;
  actions: TestingActions;
  refusal?: string | null;
}) {
  return (
    <div className="point-controls" data-testid="point-controls">
      {point?.state === "open" && point.url ? (
        <>
          <div className="small muted">Base URL</div>
          <div className="row">
            <code className="point-url truncate" data-testid="point-url">
              {point.url}
            </code>
            <CopyButton text={point.url} className="small" testId="point-copy" />
          </div>
          <p className="small">
            Set the base URL that {callerName} uses for {targetName} to this, then restart it. Its calls to {point.target} then pass through dp and show in the run log.
          </p>
          <button className="small" onClick={() => void actions.closePoint(point.id)} data-testid="point-close">
            Close
          </button>
        </>
      ) : (
        <>
          {point?.state === "saved" && <p className="small muted">An intercept point is remembered at port {point.port}. It is not listening.</p>}
          {point?.state === "error" && <p className="small danger">{point.error ?? "The intercept point could not start."}</p>}
          <button className="primary" disabled={!target} onClick={onOpen} data-testid="point-open">
            Open intercept point
          </button>
          {!target && <span className="muted small"> It needs an address to forward to.</span>}
        </>
      )}
      {refusal && <p className="small danger">{refusal}</p>}
    </div>
  );
}

/** The part of the panel the testing mode adds above the object's details: an address, an intercept point and a breakpoint for the selected line, box or stage. */
export function TestingBlock({
  state,
  diagram,
  selection,
  testing,
  actions,
  mutate,
}: {
  state: AppState;
  diagram: Diagram;
  selection: Selection;
  testing: TestingState;
  actions: TestingActions;
  mutate(fn: () => Promise<unknown>): Promise<boolean>;
}) {
  const name = (id: string) => state.elements.find((e) => e.id === id)?.name ?? id;
  const canEdit = state.can.editThis;
  const [refusal, setRefusal] = useState<{ key: string; text: string } | null>(null);
  const targets = targetsOf(selection, diagram, state);
  if (!selection || selection.type === "nodes" || targets.length === 0) return null;

  const addressField = (elementId: string) => {
    const el = state.elements.find((e) => e.id === elementId);
    if (!el || !canEdit) return null;
    return (
      <TextField
        label={`Address ${el.name} runs at`}
        value={el.runUrl}
        placeholder={targetOf(state, el.id)?.url ?? "http://localhost:3000/"}
        onCommit={(v) => void mutate(() => api.updateElement(el.id, { runUrl: v }))}
        testId="field-run-url-here"
      />
    );
  };

  if (selection.type === "edge") {
    const edge = diagram.edges.find((e) => e.id === selection.id)!;
    const rels = edge.relationshipIds.map((id) => state.relationships.find((r) => r.id === id)).filter((r) => !!r);
    const rel = rels.find((r) => targetOf(state, r.destinationId)) ?? rels[0];
    if (!rel) return null;
    const target = targetOf(state, rel.destinationId);
    const point = testing.points.find((p) => !p.stageId && p.members.some((m) => edge.relationshipIds.includes(m)));
    return (
      <div className="panel-body testing-block" data-testid="testing-block">
        <div className="panel-kind">System testing</div>
        <div className="small" data-testid="testing-target">
          {target ? (
            <>
              Target address: <code>{target.url}</code>
              {target.elementId !== rel.destinationId && <span className="muted"> (from {name(target.elementId)})</span>}
            </>
          ) : (
            <>No address: set one on {name(rel.destinationId)}</>
          )}
        </div>
        {addressField(rel.destinationId)}
        <PointControls
          point={point}
          target={target?.url ?? null}
          callerName={name(rel.sourceId)}
          targetName={name(rel.destinationId)}
          onOpen={() => void actions.openPoint(rel.id)}
          actions={actions}
        />
        <BreakpointControls testing={testing} targets={targets} actions={actions} subject="calls on this line" />
        {targets.length > 0 && !point && breakpointsOn(testing, targets).some((b) => b.enabled) && (
          <p className="small muted" data-testid="bp-hollow-note">
            No intercept point is open for this line, so the breakpoint cannot pause anything yet.
          </p>
        )}
      </div>
    );
  }

  const node = diagram.nodes.find((n) => n.id === selection.id)!;
  if (node.kind === "stage") {
    const rel = state.relationships.find((r) => r.id === diagram.scope);
    const stage = rel?.stages.find((s) => s.id === node.stageId);
    if (!rel || !stage) return null;
    const target = stage.elementId ? targetOf(state, stage.elementId) : null;
    const point = testing.points.find((p) => p.stageId === stage.id && p.relationshipId === rel.id);
    const key = `${rel.id}:${stage.id}`;
    const why = refusal?.key === key ? refusal.text : null;
    const live = !!target && !why;
    return (
      <div className="panel-body testing-block" data-testid="testing-block">
        <div className="panel-kind">System testing · stage</div>
        {live ? (
          <PointControls
            point={point}
            target={target.url}
            callerName={name(rel.sourceId)}
            targetName={stage.name}
            onOpen={() => void actions.tryOpenPoint(rel.id, stage.id).then((r) => setRefusal(r ? { key, text: r.error } : null))}
            actions={actions}
          />
        ) : (
          <>
            <span className="badge subtle" data-testid="stage-not-live">
              Not live: sample data
            </span>
            <p className="small muted">{why ?? "Link this stage to an element that has an address it runs at, and it can have an intercept point."}</p>
            {!why && !target && (
              <button className="small" onClick={() => void actions.tryOpenPoint(rel.id, stage.id).then((r) => r && setRefusal({ key, text: r.error }))} data-testid="point-open">
                Open intercept point
              </button>
            )}
          </>
        )}
        <BreakpointControls testing={testing} targets={targets} actions={actions} subject="calls at this stage" />
        {!live && (
          <>
            <h4>Written by hand, not from the running system</h4>
            <PipelineData rel={rel} state={state} />
          </>
        )}
      </div>
    );
  }

  const el = state.elements.find((e) => e.id === node.id);
  if (!el) return null;
  const own = targetOf(state, el.id);
  return (
    <div className="panel-body testing-block" data-testid="testing-block">
      <div className="panel-kind">System testing</div>
      <div className="small" data-testid="testing-target">
        {own ? (
          <>
            Address: <code>{own.url}</code>
            {own.elementId !== el.id && <span className="muted"> (from {name(own.elementId)})</span>}
          </>
        ) : (
          <>No address set on {el.name}.</>
        )}
      </div>
      {el.kind !== "person" && addressField(el.id)}
      <BreakpointControls testing={testing} targets={targets} actions={actions} subject={`calls into ${el.name}`} />
    </div>
  );
}
