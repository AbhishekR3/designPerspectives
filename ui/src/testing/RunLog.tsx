import type { AppState, TestCall, TestingState } from "../types";
import type { TestingActions } from "../hooks/useTesting";
import { CALL_STATE_LABEL, isPaused } from "./pausedCall";

/** The run log: every call that came through an intercept point, paused ones first. */
export function RunLog({
  state,
  testing,
  selectedCall,
  onSelect,
  actions,
}: {
  state: AppState;
  testing: TestingState;
  selectedCall: string | null;
  onSelect(call: TestCall): void;
  actions: TestingActions;
}) {
  const paused = testing.calls.filter(isPaused);
  const rest = testing.calls.filter((c) => !isPaused(c)).reverse();
  const rows = [...paused, ...rest];
  const relName = (id: string) => state.relationships.find((r) => r.id === id)?.description ?? id;
  return (
    <section className="run-log" data-testid="run-log">
      <div className="row between">
        <h4>
          Run log <span className="count">{testing.calls.length}</span>
        </h4>
        <button className="small ghost" disabled={testing.calls.length === 0} onClick={() => void actions.clearCalls()} data-testid="run-log-clear">
          Clear
        </button>
      </div>
      {rows.length === 0 && (
        <div className="empty-note" data-testid="run-log-empty">
          {testing.points.some((p) => p.state === "open")
            ? "No calls yet. Send a request to the base URL of an intercept point."
            : "No intercept point is open. Click a line, then Open intercept point, and point the calling service at its base URL."}
        </div>
      )}
      <ul className="run-rows">
        {rows.map((c) => {
          const unmatched = c.endpoint === null && !!c.suggested;
          return (
            <li key={c.id}>
              <button
                className={`run-row${isPaused(c) ? " paused" : ""}${selectedCall === c.id ? " on" : ""}${c.state === "failed" || (c.status ?? 0) >= 500 ? " failed" : ""}`}
                onClick={() => onSelect(c)}
                title={relName(c.relationshipId)}
                data-testid={`call-row-${c.id}`}
              >
                <span className="muted run-seq">#{c.seq}</span>
                <span className="run-method">{c.method}</span>
                <span className="run-path truncate">{c.path}</span>
                <span className="run-status">{c.status ?? ""}</span>
                <span className="muted run-ms">{c.durationMs !== null ? `${c.durationMs} ms` : ""}</span>
                <span className={`run-state${isPaused(c) ? " paused" : ""}`}>{CALL_STATE_LABEL[c.state]}</span>
                {unmatched && <span className="badge subtle run-unmatched">not in the model</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
