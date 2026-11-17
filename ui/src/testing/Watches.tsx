import { useState } from "react";
import type { TestCall, TestingState } from "../types";
import { shortId, type TestingActions } from "../hooks/useTesting";

/** Fields to follow from call to call (a body field, a header, a query value, the status) and the value each call had. */
export function Watches({ testing, actions }: { testing: TestingState; actions: TestingActions }) {
  const [field, setField] = useState("");
  const seq = new Map<string, TestCall>(testing.calls.map((c) => [c.id, c]));
  const add = () => {
    const f = field.trim();
    if (!f) return;
    void actions.setWatches([...testing.watches, { id: shortId(), field: f }]);
    setField("");
  };
  return (
    <section className="watches" data-testid="watches">
      <h4>
        Watch fields <span className="count">{testing.watches.length}</span>
      </h4>
      <div className="row">
        <input
          value={field}
          placeholder="body.amount, header.x-id, query.page, status"
          onChange={(e) => setField(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          aria-label="Field to watch"
          data-testid="watch-field"
        />
        <button className="small" disabled={!field.trim()} onClick={add} data-testid="watch-add">
          Watch
        </button>
      </div>
      {testing.watches.map((w) => {
        const values = testing.watchValues[w.id] ?? [];
        return (
          <div key={w.id} className="watch" data-testid={`watch-${w.id}`}>
            <div className="row between">
              <code>{w.field}</code>
              <button className="icon" onClick={() => void actions.setWatches(testing.watches.filter((x) => x.id !== w.id))} aria-label={`Stop watching ${w.field}`} title="Stop watching">
                ×
              </button>
            </div>
            {values.length === 0 ? (
              <div className="muted small">No call has this field yet.</div>
            ) : (
              <table className="watch-table small">
                <tbody>
                  {values.slice(-12).map((v, i) => (
                    <tr key={`${v.callId}-${i}`}>
                      <td className="muted">#{seq.get(v.callId)?.seq ?? "?"}</td>
                      <td>{v.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </section>
  );
}
