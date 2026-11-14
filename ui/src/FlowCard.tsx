import { useEffect, useRef, useState } from "react";
import { Icon, iconFor } from "./icons";
import type { AppState, Diagram, Flow } from "./types";

/** Flows menu and, while a flow is open, the step card: Introduction, the steps, Conclusion. */
export function FlowCard({
  state,
  diagram,
  flow,
  flowStep,
  setFlowStep,
  playing,
  setPlaying,
  onOpen,
  onNewFlow,
}: {
  state: AppState;
  diagram: Diagram | null;
  flow: Flow | undefined;
  flowStep: number | null;
  setFlowStep(n: number | null): void;
  playing: boolean;
  setPlaying(v: boolean): void;
  onOpen(key: string): void;
  onNewFlow(): void;
}) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const n = flow?.steps.length ?? 0;
  const phase = !flow ? null : flowStep === null ? "intro" : flowStep >= n ? "end" : "step";
  const step = phase === "step" ? flow!.steps[flowStep!] : null;
  const edge = step ? diagram?.edges.find((e) => e.id === step.relationshipId) : null;
  const nodeOf = (id?: string) => diagram?.nodes.find((x) => x.id === id);
  const [from, to] = step?.response ? [nodeOf(edge?.target), nodeOf(edge?.source)] : [nodeOf(edge?.source), nodeOf(edge?.target)];
  const parentKey = diagram && diagram.breadcrumb.length > 1 ? diagram.breadcrumb[diagram.breadcrumb.length - 2].key : "landscape";
  const go = (v: number | null) => {
    setPlaying(false);
    setFlowStep(v);
  };

  return (
    <div className="flowbox" ref={ref}>
      <div className="row">
        <button className={`float-btn${flow ? " on" : ""}`} onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} data-testid="flows-menu">
          <Icon name="flows" size={15} /> <span className="flow-name">{flow ? flow.title : "Flows"}</span> <Icon name="chevron" size={13} />
        </button>
        {flow && (
          <button
            className={`float-btn icon${playing ? " on" : ""}`}
            onClick={() => {
              if (!playing && (flowStep === null || flowStep >= n - 1)) setFlowStep(null);
              setPlaying(!playing);
            }}
            disabled={!n}
            title={playing ? "Pause" : "Play the flow"}
            data-testid="play"
          >
            <Icon name={playing ? "pause" : "play"} size={14} />
          </button>
        )}
      </div>
      {open && (
        <div className="pop-menu wide" role="menu" data-testid="flow-list">
          {state.flows.length === 0 && <div className="muted small pad">No flows yet.</div>}
          {state.flows.map((f) => (
            <button
              key={f.key}
              role="menuitem"
              className={f.key === flow?.key ? "on" : ""}
              onClick={() => {
                setOpen(false);
                onOpen(f.key);
              }}
              data-testid={`flow-${f.key}`}
            >
              <Icon name="flows" size={13} /> {f.title} <span className="muted">{f.steps.length} steps</span>
            </button>
          ))}
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onNewFlow();
            }}
            data-testid="new-flow"
          >
            <Icon name="plus" size={13} /> New flow
          </button>
        </div>
      )}
      {flow && (
        <div className="flow-card float" data-testid="player">
          <div className="flow-card-head">
            <span className="muted small">
              <Icon name="eye" size={13} /> View
            </span>
            <select
              value={flowStep === null ? "intro" : flowStep >= n ? "end" : String(flowStep)}
              onChange={(e) => go(e.target.value === "intro" ? null : e.target.value === "end" ? n : Number(e.target.value))}
              data-testid="step-counter"
              aria-label="Step"
            >
              <option value="intro">Introduction</option>
              {flow.steps.map((_, i) => (
                <option key={i} value={i}>
                  Step {i + 1} of {n}
                </option>
              ))}
              <option value="end">Conclusion</option>
            </select>
            <button className="ghost icon" onClick={() => onOpen(parentKey)} title="Close the flow" aria-label="Close the flow">
              <Icon name="close" size={14} />
            </button>
          </div>
          <div className="flow-card-nav">
            <button className="ghost" onClick={() => go(null)} title="Back to the introduction">
              <Icon name="restart" size={13} /> Restart
            </button>
            <button onClick={() => go(flowStep === null ? null : flowStep === 0 ? null : flowStep - 1)} disabled={flowStep === null} data-testid="step-prev">
              <Icon name="back" size={13} /> Back
            </button>
            <button onClick={() => go(flowStep === null ? 0 : Math.min(n, flowStep + 1))} disabled={phase === "end" || (!n && phase !== "intro")} data-testid="step-next">
              Next <Icon name="forward" size={13} />
            </button>
          </div>
          <div className={`flow-step ${phase}`}>
            {phase === "intro" && (
              <>
                <div className="flow-step-title">Introduction</div>
                <span className="pill intro">? Introduction</span>
                <p className="small">{flow.description || `${n} steps. Press Next to walk through them.`}</p>
              </>
            )}
            {phase === "step" && step && (
              <>
                <div className="flow-step-title">
                  {flowStep! + 1}. {step.description || edge?.description || "Step"}
                </div>
                <div className="row between">
                  <span className="pill msg">{step.response ? "← Response" : "→ Message"}</span>
                  <button className="ghost small" onClick={() => setDetails(!details)}>
                    Details <Icon name="chevron" size={11} className={details ? "flip" : ""} />
                  </button>
                </div>
                {details && (
                  <div className="flow-route small">
                    {from && (
                      <span>
                        <Icon name={iconFor(from.kind, from.archType)} size={12} /> {from.name}
                      </span>
                    )}
                    <span className="muted">To</span>
                    {to && (
                      <span>
                        <Icon name={iconFor(to.kind, to.archType)} size={12} /> {to.name}
                      </span>
                    )}
                    {!edge && <span className="muted">This step's relationship is not drawn on this diagram.</span>}
                  </div>
                )}
              </>
            )}
            {phase === "end" && (
              <>
                <div className="flow-step-title">Conclusion</div>
                <span className="pill end">⚑ Conclusion</span>
                <p className="small muted">All {n} steps are shown on the diagram.</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
