import { CopyButton } from "../common/CopyButton";
import type { TestingActions } from "../hooks/useTesting";
import { Modal } from "../panels/formParts";
import type { AppState, InterceptPoint, TestingState } from "../types";

const POINT_STATE: Record<InterceptPoint["state"], string> = { open: "open", saved: "saved", error: "error" };

/** Every intercept point: what it forwards to, the base URL to give the calling service, and a way to open or close it. */
export function SetupHelper({
  state,
  testing,
  actions,
  onReveal,
  onClose,
}: {
  state: AppState;
  testing: TestingState;
  actions: TestingActions;
  onReveal(relationshipId: string): void;
  onClose(): void;
}) {
  const name = (id: string) => state.elements.find((e) => e.id === id)?.name ?? id;
  const anySaved = testing.points.some((p) => p.state === "saved");
  return (
    <Modal title="Intercept points" onClose={onClose} wide testId="testing-setup">
      <div className="setup-body">
        <p className="small">
          An intercept point is a local address that passes calls on to the real service. Point the calling service at its base URL, and its calls show in the run log, where they can be paused.
        </p>
        <p className="small muted">To add one, click a line on the diagram, then Open intercept point.</p>
        {testing.points.length === 0 ? (
          <div className="empty-note">No intercept points yet.</div>
        ) : (
          <table className="points-table small" data-testid="points-table">
            <thead>
              <tr>
                <th>Calls</th>
                <th>Forwards to</th>
                <th>Base URL</th>
                <th>State</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {testing.points.map((p) => (
                <tr key={p.id} data-testid={`point-row-${p.id}`}>
                  <td>
                    <button className="link" onClick={() => onReveal(p.relationshipId)} title="Show this line on the diagram">
                      {name(p.callerId)} → {p.stageId ? "stage" : name(p.targetElementId)}
                    </button>
                  </td>
                  <td>
                    <code>{p.target}</code>
                  </td>
                  <td>
                    {p.url ? (
                      <span className="row">
                        <code>{p.url}</code>
                        <CopyButton text={p.url} className="small" testId={`point-copy-${p.id}`} />
                      </span>
                    ) : (
                      <span className="muted">{p.port ? `port ${p.port}` : "none"}</span>
                    )}
                  </td>
                  <td>
                    <span className={`point-state ${p.state}`}>{POINT_STATE[p.state]}</span>
                    {p.error && <div className="danger">{p.error}</div>}
                  </td>
                  <td>
                    {p.state === "open" ? (
                      <button className="small" onClick={() => void actions.closePoint(p.id)} data-testid={`point-close-${p.id}`}>
                        Close
                      </button>
                    ) : (
                      <button className="small" onClick={() => void actions.openPoint(p.relationshipId, p.stageId)} data-testid={`point-open-${p.id}`}>
                        Open
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="row between">
          {anySaved ? (
            <button onClick={() => void actions.startSaved()} data-testid="points-start-saved">
              Start saved points
            </button>
          ) : (
            <span />
          )}
          <label className="field inline small">
            <span>A paused call goes on by itself after (seconds)</span>
            <input
              type="number"
              min={10}
              max={600}
              defaultValue={testing.options.holdSeconds}
              key={testing.options.holdSeconds}
              onBlur={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n !== testing.options.holdSeconds) void actions.setHoldSeconds(n);
              }}
              data-testid="hold-seconds"
            />
          </label>
        </div>
      </div>
    </Modal>
  );
}
