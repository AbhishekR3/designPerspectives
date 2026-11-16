import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { PipelineData, SamplePayload } from "./SamplePayload";
import { ObservedTraceView, RecentTraces } from "./ObservedTrace";
import type { AppState, InspectResult, Relationship } from "./types";

/** A click reported by the script the UI proxy adds to the app (src/server/inspectScript.ts). */
interface Click {
  id: string;
  selector: string;
  tag: string;
  text: string;
  label: string;
  at: number;
}

/** A fetch / XMLHttpRequest call reported by that script; status and response arrive when it ends. */
interface Call {
  id: string;
  clickId: string | null;
  method: string;
  url: string;
  at: number;
  request: string;
  status?: number;
  ms?: number;
  response?: string;
  error?: string;
  /** The trace ID the script put on the call (same-origin calls), for the trace files. */
  traceId?: string;
}

const MAX_CLICKS = 50;
const MAX_CALLS = 400;

/**
 * The live UI inspector: the element's running app in a frame (through dp's UI proxy), and for the
 * selected click, the calls it made, the relationships they match, and what those lead to.
 */
export function LiveUiInspector({
  state,
  elementId,
  mutate,
  onClose,
  onReveal,
  onOpen,
}: {
  state: AppState;
  elementId: string;
  mutate(fn: () => Promise<unknown>): Promise<boolean>;
  onClose(): void;
  onReveal(id: string): void;
  onOpen(key: string): void;
}) {
  const element = state.elements.find((e) => e.id === elementId);
  const uiUrl = element?.uiUrl;
  const frame = useRef<HTMLIFrameElement>(null);
  const [proxy, setProxy] = useState<{ url: string; origin: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<string>("");
  const [clicks, setClicks] = useState<Click[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [frameKey, setFrameKey] = useState(0);

  useEffect(() => {
    let live = true;
    api.uiProxy(elementId).then(
      (p) => live && setProxy(p),
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, [elementId, uiUrl]);

  useEffect(() => {
    if (!proxy) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== proxy.origin || e.source !== frame.current?.contentWindow) return;
      const m = e.data as { type?: string; click?: Click; call?: Call; href?: string };
      if (m.type === "dp-ready" && m.href) setPage(m.href);
      else if (m.type === "dp-click" && m.click) {
        const click = { ...m.click, at: Date.now() };
        setClicks((cs) => [click, ...cs].slice(0, MAX_CLICKS));
        setPicked(click.id);
      } else if (m.type === "dp-call" && m.call) {
        // Calls to the app's own origin go through the proxy: show and match them at the app's address.
        const call = { ...m.call, url: displayUrl(m.call.url, proxy.origin, uiUrl) };
        setCalls((cs) => [...cs, call].slice(-MAX_CALLS));
      } else if (m.type === "dp-done" && m.call) {
        const done = m.call;
        setCalls((cs) => cs.map((c) => (c.id === done.id ? { ...c, ...done, method: c.method, url: c.url, clickId: c.clickId, at: c.at } : c)));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [proxy, uiUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector(".modal-backdrop") && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const hello = () => proxy && frame.current?.contentWindow?.postMessage({ type: "dp-hello" }, proxy.origin);

  const click = clicks.find((c) => c.id === picked) ?? null;
  const shown = useMemo(() => calls.filter((c) => c.clickId === picked), [calls, picked]);
  const background = calls.filter((c) => c.clickId === null);

  return (
    <div className="inspector" role="dialog" aria-modal="true" aria-label="Live UI inspector" data-testid="inspector">
      <div className="inspector-head">
        <div className="inspector-title">
          <span className="panel-kind">Live UI</span> <strong>{element?.name ?? elementId}</strong>
          <span className="muted small truncate" title={page || element?.uiUrl}>
            {page ? displayUrl(page, proxy?.origin, element?.uiUrl) : element?.uiUrl}
          </span>
        </div>
        <div className="row">
          <button onClick={() => setFrameKey((k) => k + 1)} disabled={!proxy}>
            Reload app
          </button>
          <button
            onClick={() => {
              setClicks([]);
              setCalls([]);
              setPicked(null);
            }}
          >
            Clear
          </button>
          <button className="primary" onClick={onClose} data-testid="inspector-close">
            Close
          </button>
        </div>
      </div>
      <div className="inspector-body">
        <div className="inspector-frame">
          {error && <div className="empty-note inspector-error">{error}</div>}
          {proxy && (
            <iframe
              key={frameKey}
              ref={frame}
              src={proxy.url}
              title={`Live UI of ${element?.name ?? elementId}`}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
              onLoad={hello}
              data-testid="inspector-frame"
            />
          )}
        </div>
        <div className="inspector-side panel-body" data-testid="inspector-side">
          <h4>Clicks</h4>
          {!clicks.length && <div className="empty-note">Click something in the app. The calls it makes in the next two seconds show here, with the part of the model they use.</div>}
          <ol className="inspector-clicks">
            {clicks.map((c) => {
              const n = calls.filter((x) => x.clickId === c.id).length;
              return (
                <li key={c.id}>
                  <button className={c.id === picked ? "on" : ""} onClick={() => setPicked(c.id)} data-testid="inspector-click">
                    <span className="truncate">{clickLabel(c)}</span>
                    <span className="muted small">
                      {n} call{n === 1 ? "" : "s"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          {click && (
            <ClickDetail
              key={click.id}
              click={click}
              calls={shown}
              state={state}
              elementId={elementId}
              mutate={mutate}
              onReveal={(id) => {
                onClose();
                onReveal(id);
              }}
              onOpen={(k) => {
                onClose();
                onOpen(k);
              }}
            />
          )}
          {background.length > 0 && (
            <details className="inspector-bg">
              <summary className="muted small">
                {background.length} call{background.length === 1 ? "" : "s"} not caused by a click (page load, polling)
              </summary>
              <ul>
                {background.slice(-30).map((c) => (
                  <li key={c.id} className="small">
                    <code>
                      {c.method} {pathOf(c.url)}
                    </code>{" "}
                    <span className="muted">{c.status ?? "…"}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <RecentTraces
            state={state}
            uiElementId={elementId}
            onReveal={(id) => {
              onClose();
              onReveal(id);
            }}
          />
        </div>
      </div>
    </div>
  );
}

function ClickDetail({
  click,
  calls,
  state,
  elementId,
  mutate,
  onReveal,
  onOpen,
}: {
  click: Click;
  calls: Call[];
  state: AppState;
  elementId: string;
  mutate(fn: () => Promise<unknown>): Promise<boolean>;
  onReveal(id: string): void;
  onOpen(key: string): void;
}) {
  const [result, setResult] = useState<InspectResult | null>(null);
  const callKey = calls.map((c) => `${c.method} ${c.url}`).join("\n");
  useEffect(() => {
    if (!callKey) {
      setResult(null);
      return;
    }
    let live = true;
    const list = callKey.split("\n").map((l) => {
      const i = l.indexOf(" ");
      return { method: l.slice(0, i), url: l.slice(i + 1) };
    });
    api.inspect(elementId, list).then(
      (r) => live && setResult(r),
      () => undefined,
    );
    return () => {
      live = false;
    };
    // `state` changes after every edit (an endpoint added), so the calls are matched again.
  }, [callKey, elementId, state]);

  const rel = (id: string) => state.relationships.find((r) => r.id === id);
  const name = (id: string) => state.elements.find((e) => e.id === id)?.name ?? id;
  const relLabel = (r: Relationship) => `${name(r.sourceId)} → ${name(r.destinationId)}`;

  return (
    <div className="inspector-detail" data-testid="inspector-detail">
      <div className="muted small">
        <code>{click.selector}</code>
      </div>
      {!calls.length && <div className="empty-note">This click made no HTTP calls (it may only change the page, or navigate).</div>}
      {result && result.elements.length > 0 && (
        <div className="inspector-touches" data-testid="inspector-touches">
          <span className="muted small">Touches</span>
          {result.elements.map((id) => (
            <button key={id} className="chip" onClick={() => onReveal(id)} title="Show in the diagram">
              {name(id)}
            </button>
          ))}
        </div>
      )}
      {result && result.flows.length > 0 && (
        <div className="small">
          Part of {result.flows.length === 1 ? "flow" : "flows"}:{" "}
          {result.flows.map((f, i) => (
            <span key={f.key}>
              {i > 0 && ", "}
              <button className="link" onClick={() => onOpen(f.key)}>
                {f.title}
              </button>
            </span>
          ))}
        </div>
      )}
      {calls.map((c, i) => {
        const r = result?.calls[i];
        return (
          <div key={c.id} className="inspector-call" data-testid="inspector-call">
            <div className="pd-head">
              <code className="pd-name">
                {c.method} {pathOf(c.url)}
              </code>
              <span className={`muted small${c.status && c.status >= 400 ? " danger" : ""}`}>
                {c.status === undefined ? "…" : c.status || c.error || "failed"}
                {c.ms !== undefined && ` · ${c.ms} ms`}
              </span>
            </div>
            {c.traceId && c.status !== undefined && <ObservedTraceView traceId={c.traceId} uiElementId={elementId} state={state} onReveal={onReveal} />}
            {r && r.matches.length === 0 && <Unmapped call={r} candidates={result!.candidates.map(rel).filter(Boolean) as Relationship[]} relLabel={relLabel} mutate={mutate} readOnly={state.readOnly} />}
            {r?.matches.map((id) => {
              const m = rel(id);
              return m ? <Matched key={id} rel={m} call={c} result={result!} state={state} relLabel={relLabel} mutate={mutate} /> : null;
            })}
          </div>
        );
      })}
    </div>
  );
}

function Matched({
  rel,
  call,
  result,
  state,
  relLabel,
  mutate,
}: {
  rel: Relationship;
  call: Call;
  result: InspectResult;
  state: AppState;
  relLabel(r: Relationship): string;
  mutate(fn: () => Promise<unknown>): Promise<boolean>;
}) {
  const save = (example: string) => mutate(() => api.updateRelationship(rel.id, { example, format: "JSON, seen in the live UI" }));
  // The hops that continue this relationship, in walk order, with their depth for indenting.
  const chain: { r: Relationship; depth: number }[] = [];
  const add = (via: string) => {
    for (const h of result.hops.filter((x) => x.via === via)) {
      const r = state.relationships.find((x) => x.id === h.relationshipId);
      if (!r) continue;
      chain.push({ r, depth: h.depth });
      add(h.relationshipId);
    }
  };
  add(rel.id);
  return (
    <div className="inspector-match" data-testid="inspector-match">
      <div>
        <strong>{relLabel(rel)}</strong>: {rel.description}
        {rel.technologies.length > 0 && <span className="muted small"> · {rel.technologies.join(", ")}</span>}
      </div>
      {call.request && (
        <>
          <div className="muted small">Sent (seen now)</div>
          <SamplePayload text={call.request} />
        </>
      )}
      {call.response && (
        <>
          <div className="muted small">Returned (seen now)</div>
          <SamplePayload text={call.response} />
        </>
      )}
      {rel.example && (
        <>
          <div className="muted small">Documented example{rel.format ? ` · ${rel.format}` : ""}</div>
          <SamplePayload text={rel.example} />
        </>
      )}
      {!state.readOnly && (call.request || call.response) && (
        <div className="row small">
          {call.request && <button onClick={() => void save(call.request)}>Save sent data as the example</button>}
          {call.response && <button onClick={() => void save(call.response!)}>Save returned data as the example</button>}
        </div>
      )}
      {chain.length > 0 && (
        <div className="inspector-chain" data-testid="inspector-chain">
          <div className="muted small">Then, in the model (every way on from here, not only what this call used)</div>
          {chain.map(({ r, depth }) => (
            <ChainStep key={r.id} rel={r} depth={depth} state={state} relLabel={relLabel} />
          ))}
          {result.truncated && <div className="muted small">… and more, further away.</div>}
        </div>
      )}
    </div>
  );
}

function ChainStep({ rel, depth, state, relLabel }: { rel: Relationship; depth: number; state: AppState; relLabel(r: Relationship): string }) {
  const [open, setOpen] = useState(false);
  const hasData = Boolean(rel.example) || rel.stages.some((s) => s.example);
  return (
    <div className="inspector-step" style={{ marginLeft: (depth - 1) * 14 }}>
      <div>
        → <strong>{relLabel(rel)}</strong>: {rel.description}
        {rel.technologies.length > 0 && <span className="muted small"> · {rel.technologies.join(", ")}</span>}
      </div>
      {rel.stages.length > 0 && <div className="muted small">Stages: {rel.stages.map((s) => s.name).join(" → ")}</div>}
      {hasData && (
        <button className="link small" onClick={() => setOpen(!open)}>
          {open ? "Hide data" : "Show data"}
        </button>
      )}
      {open && <PipelineData rel={rel} state={state} />}
    </div>
  );
}

function Unmapped({
  call,
  candidates,
  relLabel,
  mutate,
  readOnly,
}: {
  call: InspectResult["calls"][number];
  candidates: Relationship[];
  relLabel(r: Relationship): string;
  mutate(fn: () => Promise<unknown>): Promise<boolean>;
  readOnly: boolean;
}) {
  const [target, setTarget] = useState(candidates[0]?.id ?? "");
  const ep = `${call.suggested.method} ${call.suggested.path}`;
  if (readOnly || !candidates.length)
    return <div className="empty-note small">Not in the model: no relationship from this UI lists this call.{!candidates.length && " This UI has no outgoing relationships yet."}</div>;
  const r = candidates.find((x) => x.id === target);
  return (
    <div className="inspector-unmapped" data-testid="inspector-unmapped">
      <div className="small">Not in the model yet. Add it as an endpoint of:</div>
      <div className="row">
        <select value={target} onChange={(e) => setTarget(e.target.value)} style={{ flex: 1, minWidth: 0 }}>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {relLabel(c)}: {c.description}
            </option>
          ))}
        </select>
        <button className="primary" disabled={!r} onClick={() => r && void mutate(() => api.updateRelationship(r.id, { endpoints: [...r.endpoints, call.suggested] }))} data-testid="inspector-add-endpoint">
          Add <code>{ep}</code>
        </button>
      </div>
    </div>
  );
}

function clickLabel(c: Click): string {
  const what = c.label || c.text;
  return what ? `${c.tag} “${what}”` : c.selector || c.tag;
}

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

/** The page's address as the app knows it (the proxy's origin replaced by the app's own). */
function displayUrl(href: string, proxyOrigin: string | undefined, uiUrl: string | undefined): string {
  if (!proxyOrigin || !uiUrl || !href.startsWith(proxyOrigin)) return href;
  try {
    return new URL(uiUrl).origin + href.slice(proxyOrigin.length);
  } catch {
    return href;
  }
}
