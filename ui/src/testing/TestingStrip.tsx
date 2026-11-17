import { Icon } from "../common/icons";
import type { TestingActions } from "../hooks/useTesting";
import type { TestingState, TraceList } from "../types";
import { continueCall, dropCall, pausedTarget } from "./pausedCall";

/** The strip above the canvas while the system testing mode is on: what is paused, the controls that go on, and the trace picker. */
export function TestingStrip({
  testing,
  denied,
  canTest,
  selectedCall,
  actions,
  traces,
  traceId,
  onPickTrace,
  onRefreshTraces,
  onOpenPoints,
  onExit,
}: {
  testing: TestingState | null;
  denied: string | null;
  canTest: boolean;
  selectedCall: string | null;
  actions: TestingActions;
  traces: TraceList | null;
  traceId: string | null;
  onPickTrace(id: string | null): void;
  onRefreshTraces(): void;
  onOpenPoints(): void;
  onExit(): void;
}) {
  const usable = canTest && !denied && !!testing?.available;
  const target = usable ? pausedTarget(testing, selectedCall) : null;
  const note =
    denied ?? (!canTest ? "Your role cannot use system testing here. Traces can still be shown." : testing && !testing.available ? (testing.reason ?? "System testing is not available here.") : null);
  const known = traces?.traces.some((t) => t.traceId === traceId);
  return (
    <div className="draft-strip testing-strip" data-testid="testing-strip" role="region" aria-label="System testing">
      <Icon name="pipeline" size={14} />
      <strong className="strip-title">System testing</strong>
      <div className="strip-meta">
        {usable && (
          <span className={`small${target ? " paused-count" : " muted"}`} data-testid="testing-paused-count">
            {testing!.held.length} paused
          </span>
        )}
        {note && (
          <span className="small strip-note" data-testid="testing-note">
            {note}
          </span>
        )}
      </div>
      <div className="strip-actions">
        {usable && (
          <>
            <button className="small primary" disabled={!target} onClick={() => target && void continueCall(target, actions)} title="Let the paused call go on (F8)" data-testid="testing-continue">
              Continue (F8)
            </button>
            <button
              className="small"
              disabled={!target}
              onClick={() => target && void continueCall(target, actions, true)}
              title="Let it go on, and pause the next call or reply (F10)"
              data-testid="testing-step"
            >
              Step (F10)
            </button>
            <button
              className="small danger"
              disabled={!target}
              onClick={() => target && void dropCall(target, actions)}
              title="Drop the paused call: the caller gets an error"
              data-testid="testing-drop"
            >
              Drop
            </button>
            <button
              className={`small${testing!.stepping ? " active" : ""}`}
              aria-pressed={testing!.stepping}
              onClick={() => void actions.step(!testing!.stepping)}
              title="Pause the next call or reply that arrives"
              data-testid="testing-pause-next"
            >
              Pause next
            </button>
            <button className="small" onClick={onOpenPoints} title="Intercept points: where calls are watched and paused" data-testid="testing-points">
              Intercept points ({testing!.points.length})
            </button>
          </>
        )}
        <label className="small testing-trace-pick" title="Show a trace from the trace files on the diagram">
          <span className="muted">Trace</span>{" "}
          <select value={traceId ?? ""} onChange={(e) => onPickTrace(e.target.value || null)} data-testid="testing-trace">
            <option value="">No trace</option>
            {traceId && !known && <option value={traceId}>{`Trace ${traceId.slice(0, 8)}…`}</option>}
            {traces?.traces.map((t) => (
              <option key={t.traceId} value={t.traceId}>
                {`${t.name} · ${t.durationMs} ms · ${new Date(t.start).toLocaleTimeString()}`}
              </option>
            ))}
          </select>
        </label>
        <button className="small ghost" onClick={onRefreshTraces} title="Look for new traces" data-testid="testing-trace-refresh">
          Refresh
        </button>
        <button className="small" onClick={onExit} data-testid="testing-exit">
          Exit
        </button>
      </div>
    </div>
  );
}
