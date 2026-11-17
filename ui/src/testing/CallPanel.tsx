import { useEffect, useState } from "react";
import { api } from "../api";
import type { TestingActions } from "../hooks/useTesting";
import { SamplePayload } from "../inspect/SamplePayload";
import type { AppState, CallMessage, TestCall, TestCallDetail } from "../types";
import { CALL_STATE_LABEL, isPaused } from "./pausedCall";
import { changes, formOf, type MessageForm } from "./messageEdit";

const EXAMPLE_LIMIT = 8000;

/** Seconds left until a paused call is released by itself. */
function useCountdown(until: number | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [until]);
  return until ? Math.max(0, Math.ceil((until - now) / 1000)) : null;
}

/** One request or reply as read-only text. */
function MessageView({ title, message, previous, testId }: { title: string; message: CallMessage; previous?: string; testId: string }) {
  return (
    <div className="msg-view" data-testid={testId}>
      <div className="step-io-title">{title}</div>
      <div className="small">
        {message.method && <strong>{message.method} </strong>}
        {message.path}
        {message.status !== undefined && <strong>{message.status}</strong>}
      </div>
      {message.headers.length > 0 && (
        <details>
          <summary className="muted small">Headers ({message.headers.length})</summary>
          <pre className="example">{message.headers.map(([k, v]) => `${k}: ${v}`).join("\n")}</pre>
        </details>
      )}
      <Body message={message} previous={previous} />
    </div>
  );
}

function Body({ message, previous }: { message: CallMessage; previous?: string }) {
  if (message.bodyKind === "none") return <div className="muted small">No body.</div>;
  if (message.bodyKind === "binary") return <div className="muted small">A binary body, {message.bytes} bytes.</div>;
  if (message.bodyKind === "dropped" || message.body === null) return <div className="muted small">The body is not kept any more.</div>;
  return <SamplePayload text={message.body} previous={previous} />;
}

/** The editable parts of a request or a reply. */
function MessageFields({ form, setForm, kind, original, testId }: { form: MessageForm; setForm(f: MessageForm): void; kind: "request" | "reply"; original: CallMessage; testId: string }) {
  const set = (patch: Partial<MessageForm>) => setForm({ ...form, ...patch });
  const binary = original.bodyKind === "binary" || original.bodyKind === "dropped";
  return (
    <div className="msg-edit" data-testid={testId}>
      {kind === "request" ? (
        <div className="row">
          <label className="field msg-method">
            <span>Method</span>
            <input value={form.method} onChange={(e) => set({ method: e.target.value })} data-testid={`${testId}-method`} />
          </label>
          <label className="field grow">
            <span>Path</span>
            <input value={form.path} onChange={(e) => set({ path: e.target.value })} data-testid={`${testId}-path`} />
          </label>
        </div>
      ) : (
        <label className="field msg-method">
          <span>Status</span>
          <input value={form.status} inputMode="numeric" onChange={(e) => set({ status: e.target.value })} data-testid={`${testId}-status`} />
        </label>
      )}
      <label className="field">
        <span>Headers, one per line</span>
        <textarea rows={3} value={form.headers} onChange={(e) => set({ headers: e.target.value })} spellCheck={false} data-testid={`${testId}-headers`} />
      </label>
      <label className="field">
        <span>Body</span>
        <textarea
          className="mono"
          rows={8}
          value={form.body}
          disabled={binary}
          placeholder={binary ? (original.bodyKind === "binary" ? `A binary body, ${original.bytes} bytes. It goes on unchanged.` : "The body is not kept.") : ""}
          onChange={(e) => set({ body: e.target.value })}
          spellCheck={false}
          data-testid={`${testId}-body`}
        />
      </label>
      {original.masked.length > 0 && <div className="muted small">Hidden values ({original.masked.join(", ")}) show as ••• . Leave them as they are and the real value goes on.</div>}
    </div>
  );
}

/** A call chosen in the run log: where it stands, and what can be done with it. */
export function CallPanel({
  state,
  call,
  detail,
  actions,
  mutate,
  onReveal,
  onShowTrace,
  onClose,
}: {
  state: AppState;
  call: TestCall;
  detail: TestCallDetail | null;
  actions: TestingActions;
  mutate(fn: () => Promise<unknown>): Promise<boolean>;
  onReveal(relationshipId: string): void;
  onShowTrace(traceId: string): void;
  /** Back to the run log. */
  onClose(): void;
}) {
  const rel = state.relationships.find((r) => r.id === call.relationshipId);
  const held = isPaused(call);
  const atReply = call.state === "held-response";
  const left = useCountdown(held ? call.heldUntil : undefined);
  const [reqForm, setReqForm] = useState<MessageForm | null>(null);
  const [resForm, setResForm] = useState<MessageForm | null>(null);
  const [mine, setMine] = useState({ status: "200", body: "", delay: "0" });
  const [again, setAgain] = useState(false);
  // The fields start from what the server shows, once it has answered.
  useEffect(() => {
    setReqForm(detail ? formOf(detail.request) : null);
    setResForm(detail?.response ? formOf(detail.response) : null);
  }, [detail]);

  const canEditModel = state.can.editThis;
  const requestBody = detail?.request.body ?? "";
  const saveExample = () => {
    if (!rel || !detail) return;
    const body = (detail.request.body ?? detail.response?.body ?? "").slice(0, EXAMPLE_LIMIT);
    const json = (detail.request.body ? detail.request.bodyKind : detail.response?.bodyKind) === "json";
    void mutate(() => api.updateRelationship(rel.id, { example: body, format: json ? "JSON, seen in a test" : "Text, seen in a test" }));
  };
  const addEndpoint = () => {
    if (!rel || !call.suggested) return;
    const existing = rel.endpoints.map((e) => (e.method === "*" ? e.path : `${e.method} ${e.path}`));
    void mutate(() => api.updateRelationship(rel.id, { endpoints: [...existing, `${call.suggested!.method} ${call.suggested!.path}`] }));
  };

  const reqChanges = detail && reqForm ? changes(detail.request, reqForm, ["method", "path", "headers", "body"]) : {};
  const resChanges = detail?.response && resForm ? changes(detail.response, resForm, ["status", "headers", "body"]) : {};
  const hasReq = Object.keys(reqChanges).length > 0;
  const hasRes = Object.keys(resChanges).length > 0;

  return (
    <div className="panel-body call-panel" data-testid="call-panel">
      <div className="row between">
        <div className="panel-kind">Call #{call.seq}</div>
        <button className="small ghost" onClick={onClose} data-testid="call-close">
          Back to the run log
        </button>
      </div>
      <h2 className="panel-title">
        {call.method} {call.path}
      </h2>
      <dl className="facts">
        <dt>State</dt>
        <dd data-testid="call-state">
          {CALL_STATE_LABEL[call.state]}
          {call.status !== null && ` · ${call.status}`}
          {call.durationMs !== null && ` · ${call.durationMs} ms`}
        </dd>
        <dt>Relationship</dt>
        <dd>
          <button className="link" onClick={() => onReveal(call.relationshipId)} data-testid="call-reveal">
            {rel ? rel.description || rel.id : call.relationshipId}
          </button>
          {call.endpoint === null && <span className="badge subtle"> not in the model</span>}
        </dd>
        {held && left !== null && (
          <>
            <dt>Goes on by itself</dt>
            <dd data-testid="call-countdown">in {left} s</dd>
          </>
        )}
        {call.by && (
          <>
            <dt>Released by</dt>
            <dd>{call.by}</dd>
          </>
        )}
        {call.edited && (
          <>
            <dt>Edited</dt>
            <dd>You changed this call.</dd>
          </>
        )}
      </dl>
      {call.note && <p className="small muted">{call.note}</p>}
      {!detail && <div className="muted small">Loading the call…</div>}

      {detail && reqForm && held && !atReply && (
        <>
          <h4>Request, paused</h4>
          <MessageFields form={reqForm} setForm={setReqForm} kind="request" original={detail.request} testId="call-req" />
          {reqForm.body && <SamplePayload text={reqForm.body} previous={rel?.example || undefined} testId="call-req-sample" />}
          <div className="call-actions">
            <button className="primary" onClick={() => void actions.release(call.id, { do: "continue", ...(hasReq ? { request: reqChanges } : {}) })} data-testid="call-continue">
              Continue
            </button>
            <button onClick={() => void actions.release(call.id, { do: "continue", pauseOnReply: true, ...(hasReq ? { request: reqChanges } : {}) })} data-testid="call-continue-pause-reply">
              Continue and pause on the reply
            </button>
            <button onClick={() => void actions.release(call.id, { do: "continue", step: true, ...(hasReq ? { request: reqChanges } : {}) })} data-testid="call-step">
              Step
            </button>
            <button className="danger" onClick={() => void actions.release(call.id, { do: "drop" })} data-testid="call-drop">
              Drop
            </button>
          </div>
          <h4>Answer it yourself</h4>
          <p className="muted small">The service is not called. The caller gets the reply you write here.</p>
          <div className="msg-edit" data-testid="call-mine">
            <div className="row">
              <label className="field msg-method">
                <span>Status</span>
                <input value={mine.status} inputMode="numeric" onChange={(e) => setMine({ ...mine, status: e.target.value })} data-testid="call-mine-status" />
              </label>
              <label className="field msg-method">
                <span>Delay (ms)</span>
                <input value={mine.delay} inputMode="numeric" onChange={(e) => setMine({ ...mine, delay: e.target.value })} data-testid="call-mine-delay" />
              </label>
            </div>
            <label className="field">
              <span>Body</span>
              <textarea className="mono" rows={4} value={mine.body} onChange={(e) => setMine({ ...mine, body: e.target.value })} spellCheck={false} data-testid="call-mine-body" />
            </label>
            <button
              onClick={() => void actions.release(call.id, { do: "reply", status: Number(mine.status) || 200, body: mine.body, delayMs: Math.max(0, Number(mine.delay) || 0) })}
              data-testid="call-mine-send"
            >
              Send this reply
            </button>
          </div>
        </>
      )}

      {detail && held && atReply && (
        <>
          <MessageView title="Request" message={detail.request} previous={rel?.example || undefined} testId="call-request" />
          {resForm && detail.response && (
            <>
              <h4>Reply, paused</h4>
              <MessageFields form={resForm} setForm={setResForm} kind="reply" original={detail.response} testId="call-res" />
              <div className="call-actions">
                <button className="primary" onClick={() => void actions.release(call.id, { do: "continue-response", ...(hasRes ? { response: resChanges } : {}) })} data-testid="call-continue">
                  Continue
                </button>
                <button onClick={() => void actions.release(call.id, { do: "continue-response", step: true, ...(hasRes ? { response: resChanges } : {}) })} data-testid="call-step">
                  Step
                </button>
                <button className="danger" onClick={() => void actions.release(call.id, { do: "drop" })} data-testid="call-drop">
                  Drop
                </button>
              </div>
            </>
          )}
        </>
      )}

      {detail && !held && (
        <>
          {again && reqForm ? (
            <>
              <h4>Send again</h4>
              <MessageFields form={reqForm} setForm={setReqForm} kind="request" original={detail.request} testId="call-again" />
              <div className="call-actions">
                <button
                  className="primary"
                  onClick={() => {
                    void actions.resend(call.id, hasReq ? reqChanges : undefined);
                    setAgain(false);
                  }}
                  data-testid="call-resend-go"
                >
                  Send this request
                </button>
                <button onClick={() => setAgain(false)}>Cancel</button>
              </div>
            </>
          ) : (
            <MessageView title="Request" message={detail.request} previous={rel?.example || undefined} testId="call-request" />
          )}
          {detail.response && <MessageView title="Reply" message={detail.response} testId="call-response" />}
          {!again && (
            <div className="call-actions">
              <button onClick={() => setAgain(true)} data-testid="call-resend">
                Send again
              </button>
            </div>
          )}
        </>
      )}

      {(call.traceId || (canEditModel && rel)) && (
        <div className="call-actions">
          {call.traceId && (
            <button onClick={() => onShowTrace(call.traceId!)} data-testid="call-show-trace">
              Show trace
            </button>
          )}
          {canEditModel && rel && call.suggested && (
            <button onClick={addEndpoint} data-testid="call-add-endpoint">
              Add {call.suggested.method} {call.suggested.path} to this relationship
            </button>
          )}
          {canEditModel && rel && (requestBody || detail?.response?.body) && (
            <button onClick={saveExample} data-testid="call-save-example">
              Save this body as the example
            </button>
          )}
        </div>
      )}
    </div>
  );
}
