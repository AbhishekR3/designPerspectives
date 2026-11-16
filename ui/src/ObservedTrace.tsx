import { useEffect, useState } from "react";
import { api } from "./api";
import type { AppState, ObservedSpan, ObservedTrace } from "./types";

/** Re-asks for a trace while its spans arrive: exporters write a little after the response. */
const RETRY_MS = [400, 800, 1500, 3000, 6000];

/**
 * A trace from the trace files laid over the model: the steps the request took between elements
 * (each marked with the relationship it uses, or as not in the model), services no element
 * matches, and the spans themselves.
 */
export function ObservedTraceView({ traceId, uiElementId, state, onReveal }: { traceId: string; uiElementId: string | null; state: AppState; onReveal(id: string): void }) {
  const [trace, setTrace] = useState<ObservedTrace | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;
    let last = -1;
    const ask = () => {
      api.trace(traceId, uiElementId).then(
        (t) => {
          if (!live) return;
          setTrace(t);
          setMissing(false);
          // Ask again until the span count stops growing.
          if (t.spanCount !== last && tries < RETRY_MS.length) {
            last = t.spanCount;
            timer = setTimeout(ask, RETRY_MS[tries++]);
          }
        },
        () => {
          if (!live) return;
          if (tries < RETRY_MS.length) timer = setTimeout(ask, RETRY_MS[tries++]);
          else setMissing(true);
        },
      );
    };
    ask();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [traceId, uiElementId, state]);

  const name = (id: string | null) => (id ? (state.elements.find((e) => e.id === id)?.name ?? id) : "?");
  if (!trace)
    return (
      <div className="muted small" data-testid="trace-pending">
        {missing ? `No trace ${traceId.slice(0, 8)}… in the trace files. The backend may not record traces, or writes them elsewhere (dp serve --traces <folder>).` : "Looking for this call in the trace files…"}
      </div>
    );
  const depth = new Map<string, number>();
  for (const s of trace.spans) depth.set(s.spanId, s.parentId ? (depth.get(s.parentId) ?? 0) + 1 : 0);
  const notInModel = trace.hops.filter((h) => !h.relationshipId);
  return (
    <div className="observed" data-testid="observed-trace">
      <div className="small">
        <strong>Observed in traces</strong>{" "}
        <span className="muted">
          · {trace.durationMs} ms · {trace.spanCount} spans · trace {trace.traceId.slice(0, 8)}…
        </span>
        {trace.error && <span className="danger"> · failed</span>}
      </div>
      <ol className="observed-hops">
        {trace.hops.map((h) => {
          const rel = h.relationshipId ? state.relationships.find((r) => r.id === h.relationshipId) : null;
          return (
            <li key={h.spanId + h.to} className={h.relationshipId ? "" : "drift"} data-testid="observed-hop">
              <button className="link" onClick={() => onReveal(h.from)}>
                {name(h.from)}
              </button>{" "}
              →{" "}
              <button className="link" onClick={() => onReveal(h.to)}>
                {name(h.to)}
              </button>
              {rel ? <span className="muted small"> · {rel.description}</span> : <span className="small"> · not in the model</span>}
            </li>
          );
        })}
      </ol>
      {(notInModel.length > 0 || trace.unmapped.length > 0) && (
        <div className="observed-drift small" data-testid="observed-drift">
          The running system differs from the model:
          {notInModel.length > 0 && ` ${notInModel.length} step${notInModel.length === 1 ? "" : "s"} with no relationship.`}
          {trace.unmapped.length > 0 && ` Not in the model: ${trace.unmapped.join(", ")}.`}
        </div>
      )}
      <details>
        <summary className="muted small">Spans ({trace.spans.length})</summary>
        <div className="spans">
          {trace.spans.map((s) => (
            <SpanRow key={s.spanId} span={s} depth={depth.get(s.spanId) ?? 0} total={trace.durationMs} element={s.elementId ? name(s.elementId) : null} />
          ))}
        </div>
      </details>
    </div>
  );
}

function SpanRow({ span, depth, total, element }: { span: ObservedSpan; depth: number; total: number; element: string | null }) {
  const left = total ? (span.startMs / total) * 100 : 0;
  const width = total ? Math.max((span.durationMs / total) * 100, 0.8) : 100;
  const attrs = Object.entries(span.attributes)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  return (
    <div className={`span-row${span.error ? " failed" : ""}`} title={attrs}>
      <div className="span-name" style={{ paddingLeft: depth * 10 }}>
        <span className="truncate">{span.name}</span>
        {element && <span className="muted small truncate"> {element}</span>}
      </div>
      <div className="span-bar">
        <span style={{ left: `${left}%`, width: `${width}%` }} />
      </div>
      <div className="span-ms small muted">{span.durationMs} ms</div>
      {span.error && <div className="span-error small">{span.error}</div>}
    </div>
  );
}

/** The newest traces in the trace files; picking one shows it over the model. */
export function RecentTraces({ state, uiElementId, onReveal }: { state: AppState; uiElementId: string | null; onReveal(id: string): void }) {
  const [list, setList] = useState<Awaited<ReturnType<typeof api.traces>> | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    api.traces(20).then(
      (l) => live && setList(l),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [tick]);
  return (
    <details className="inspector-bg" data-testid="recent-traces" onToggle={(e) => (e.target as HTMLDetailsElement).open && setTick((t) => t + 1)}>
      <summary className="muted small">Recent traces{list ? ` (${list.traces.length})` : ""}</summary>
      {list && !list.exists && <div className="muted small">No trace folder at {list.dir}. Point dp at one with dp serve --traces &lt;folder&gt;.</div>}
      <button className="small" onClick={() => setTick((t) => t + 1)}>
        Refresh
      </button>
      <ul>
        {list?.traces.map((t) => (
          <li key={t.traceId} className="small">
            <button className={`link${t.error ? " danger" : ""}`} onClick={() => setPicked(picked === t.traceId ? null : t.traceId)}>
              {t.name}
            </button>{" "}
            <span className="muted">
              {t.service} · {t.durationMs} ms · {new Date(t.start).toLocaleTimeString()}
            </span>
            {picked === t.traceId && <ObservedTraceView traceId={t.traceId} uiElementId={uiElementId} state={state} onReveal={onReveal} />}
          </li>
        ))}
      </ul>
    </details>
  );
}
