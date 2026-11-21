/**
 * The BMO chat (the `ask` task): an open question about the model, docked over the canvas so the diagram stays usable
 * while it is open. Objects are referred to as "[Name]": typing "[" opens a list of matching elements and relationships
 * (bmoChatText.ts), and the chosen ones are sent as IDs; the server builds the prompt from them (COD-02).
 *
 * Every message is previewed before it goes (COD-03, "what was shown is what goes"): Enter shows a card with what will
 * be sent (the objects, the file excerpts, the size, where it goes, the full prompt); Enter again or Send sends it with
 * the preview's hash. Editing the message, or anything else the request is made of, discards the preview.
 *
 * The conversation lives in this tab only (`useBmoChatLog`, owned by App). Answers are shown as simple Markdown made of
 * React elements, never as HTML.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { api, ApiError } from "../api";
import { useBmoStatus, type BmoChatLog, type BmoRequest } from "../hooks/useBmo";
import { BMO_ASK_LIMITS, type AppState, type BmoPreview, type BmoRunResult, type Diagram, type Lens } from "../types";
import { Explainer, kb } from "./BmoSheet";
import {
  activeMention,
  historyToSend,
  inlineParts,
  insertMention,
  keepPicks,
  markdownBlocks,
  mentionTargets,
  resolveMentions,
  suggestMentions,
  type MentionPick,
  type MentionTarget,
} from "./bmoChatText";
import { errorMessage } from "./notify";

/** Text to put in the input when the chat is opened from an object ("Ask BMO about this"); `n` changes for each request. */
export interface BmoChatSeed {
  text: string;
  picks: MentionPick[];
  n: number;
}

interface Props {
  state: AppState;
  diagram: Diagram | null;
  lens: Lens;
  log: BmoChatLog;
  seed: BmoChatSeed | null;
  /** Show an element or relationship on the diagram. */
  onReveal(id: string): void;
  onClose(): void;
}

type Phase =
  | { name: "idle" }
  | { name: "previewing"; key: string }
  | { name: "preview"; key: string; preview: BmoPreview; body: BmoRequest; cancelled?: boolean }
  | { name: "running"; preview: BmoPreview }
  | { name: "error"; key: string; detail: string }
  | { name: "refused"; detail: string };

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function BmoChat({ state, diagram, lens, log, seed, onReveal, onClose }: Props) {
  const { status, error: statusError } = useBmoStatus();
  const blocked = status && !status.canRun.ok ? status.canRun.reason || "BMO is not available." : null;
  const [text, setText] = useState("");
  const [picks, setPicks] = useState<MentionPick[]>([]);
  const [caret, setCaret] = useState(0);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [active, setActive] = useState(0);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  const listEnd = useRef<HTMLDivElement>(null);
  const uid = useId();
  const listId = `${uid}-mentions`;

  const targets = useMemo(() => mentionTargets(state.elements, state.relationships), [state.elements, state.relationships]);
  const resolved = useMemo(() => resolveMentions(text, picks, targets), [text, picks, targets]);
  const refs = resolved.refs.slice(0, BMO_ASK_LIMITS.refs);
  const history = useMemo(
    () =>
      historyToSend(
        log.messages.filter((m) => m.role !== "note").map((m) => ({ role: m.role as "you" | "bmo", text: m.text })),
        BMO_ASK_LIMITS,
      ),
    [log.messages],
  );
  const body: BmoRequest = useMemo(
    () => ({ task: "ask", text: text.trim(), refs, ...(diagram ? { diagram: diagram.key } : {}), lens: lens.id, ...(history.length ? { history } : {}) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs is derived from `resolved`; its contents are what matter
    [text, resolved, diagram?.key, lens.id, history],
  );
  const key = useMemo(() => JSON.stringify(body), [body]);
  const previewShown = phase.name === "preview" && phase.key === key ? phase : null;

  // The mention being typed, and its suggestions.
  const mention = activeMention(text, caret);
  const suggestions = useMemo(() => (mention ? suggestMentions(targets, mention.query) : []), [mention?.start, mention?.query, targets]); // eslint-disable-line react-hooks/exhaustive-deps
  const popupOpen = !!mention && suggestions.length > 0 && dismissedAt !== mention.start;
  useEffect(() => {
    setActive(0);
  }, [mention?.query, mention?.start]);

  // Opening from an object: its "[Name]" goes into the input.
  useEffect(() => {
    if (!seed) return;
    setText((t) => {
      const next = t.trim() ? `${t.trimEnd()} ${seed.text}` : seed.text;
      pendingCaret.current = next.length;
      return next;
    });
    setPicks((p) => [...p, ...seed.picks]);
    input.current?.focus();
  }, [seed?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = input.current;
    if (el && pendingCaret.current !== null) {
      el.setSelectionRange(pendingCaret.current, pendingCaret.current);
      setCaret(pendingCaret.current);
      pendingCaret.current = null;
    }
  }, [text]);

  useEffect(() => () => abort.current?.abort(), []);
  // In braces: scrollIntoView returns a promise in newer browsers, and an effect may return only a cleanup function.
  useEffect(() => {
    listEnd.current?.scrollIntoView?.({ block: "nearest" });
  }, [log.messages.length, phase.name]);
  useEffect(() => {
    if (status && !blocked) input.current?.focus();
  }, [status, blocked]);

  const pick = (t: MentionTarget) => {
    if (!mention) return;
    const r = insertMention(text, mention.start, caret, t);
    pendingCaret.current = r.caret;
    setText(r.text);
    setPicks((p) => [...keepPicks(r.text, p), r.pick]);
    input.current?.focus();
  };

  const preview = useCallback(() => {
    if (!body.text) return;
    const k = key;
    setPhase({ name: "previewing", key: k });
    api.bmoPreview({ ...body }).then(
      (p) => setPhase((ph) => (ph.name === "previewing" && ph.key === k ? { name: "preview", key: k, preview: p, body } : ph)),
      (e) => {
        if (e instanceof ApiError && (e.status === 403 || e.status === 409)) setPhase({ name: "refused", detail: e.message });
        else setPhase({ name: "error", key: k, detail: errorMessage(e) });
      },
    );
  }, [body, key]);

  const send = useCallback(
    async (p: { preview: BmoPreview; body: BmoRequest }) => {
      const ctl = new AbortController();
      abort.current = ctl;
      const kept = { text, picks };
      const names = (p.preview.ask?.objects ?? []).map((o) => ({ id: o.id, name: o.name }));
      const mine = log.add({ role: "you", text: p.body.text ?? "", refs: names });
      setText("");
      setPicks([]);
      setPhase({ name: "running", preview: p.preview });
      try {
        const r: BmoRunResult = await api.bmoRun({ ...p.body, task: "ask", hash: p.preview.hash }, ctl.signal);
        if (r.output === "text") {
          const usage = r.usage
            ? [r.usage.inputTokens && `${r.usage.inputTokens.toLocaleString()} tokens in`, r.usage.outputTokens && `${r.usage.outputTokens.toLocaleString()} out`].filter(Boolean).join(", ")
            : "";
          log.add({ role: "bmo", text: r.text, meta: [r.model, usage, r.estCost ? `about ${r.estCost.total.toFixed(4)}` : ""].filter(Boolean).join(" · ") });
        }
        setPhase({ name: "idle" });
      } catch (e) {
        // Not answered: the message goes back into the input, so it can be previewed and sent again.
        log.remove(mine);
        setText(kept.text);
        setPicks(kept.picks);
        pendingCaret.current = kept.text.length;
        if (isAbort(e)) setPhase({ name: "error", key: "", detail: "Cancelled. Your message is back in the box; nothing was changed." });
        else if (e instanceof ApiError && e.status === 409 && /not the one that was shown/.test(e.message))
          setPhase({ name: "error", key: "", detail: "The model changed since the preview. Press Enter to see the new preview." });
        else setPhase({ name: "error", key: "", detail: errorMessage(e) });
      } finally {
        abort.current = null;
      }
    },
    [text, picks, log],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (popupOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const n = suggestions.length;
        setActive((a) => (e.key === "ArrowDown" ? (a + 1) % n : (a - 1 + n) % n));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(suggestions[Math.min(active, suggestions.length - 1)]!);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setDismissedAt(mention!.start);
        return;
      }
    }
    if (e.key === "Escape" && previewShown) {
      e.preventDefault();
      e.stopPropagation();
      setPhase({ name: "idle" });
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (phase.name === "running" || phase.name === "previewing") return;
      if (previewShown) void send(previewShown);
      else preview();
    }
  };

  const syncCaret = () => setCaret(input.current?.selectionStart ?? 0);
  const warnings = resolved.tokens.filter((t) => t.status === "ambiguous" || t.status === "unknown");
  const chips = resolved.refs.map((id) => targets.find((t) => t.id === id)!).filter(Boolean);
  const running = phase.name === "running";

  return (
    <section className="float bmo-chat" role="region" aria-label="Ask BMO" data-testid="bmo-chat">
      <header className="bmo-chat-head">
        <strong>Ask BMO</strong>
        <span className="muted small">about {diagram ? `“${diagram.title}”` : "the model"}</span>
        <span className="grow" />
        <button className="ghost tiny" onClick={log.clear} disabled={!log.messages.length || running} title="Forget this conversation (it is kept only in this tab)" data-testid="bmo-chat-clear">
          Clear
        </button>
        <button className="ghost tiny" onClick={onClose} aria-label="Close the chat" title="Close (the conversation stays until you clear it or reload)" data-testid="bmo-chat-close">
          ✕
        </button>
      </header>

      <div className="bmo-chat-log" role="log" aria-live="polite" aria-label="Conversation with BMO" data-testid="bmo-chat-log">
        {log.messages.length === 0 && (
          <p className="muted small bmo-chat-hint">
            Ask about the model. Type <kbd>[</kbd> to refer to an element or relationship, for example “What calls [API Application]?”. Each message is shown before it is sent.
          </p>
        )}
        {log.messages.map((m) => (
          <div key={m.id} className={`bmo-msg ${m.role}`} data-testid="bmo-chat-message" data-role={m.role}>
            {m.role === "bmo" ? <Markdown text={m.text} /> : <p className="bmo-msg-text">{m.text}</p>}
            {m.refs && m.refs.length > 0 && (
              <div className="bmo-chat-chips">
                {m.refs.map((r) => (
                  <button key={r.id} className="chip bmo-ref" onClick={() => onReveal(r.id)} title="Show it on the diagram" data-testid={`bmo-chat-msg-ref-${r.id}`}>
                    {r.name}
                  </button>
                ))}
              </div>
            )}
            {m.meta && <p className="muted small">{m.meta}</p>}
          </div>
        ))}
        {running && (
          <p role="status" className="bmo-running" data-testid="bmo-chat-running">
            <span className="spinner" aria-hidden="true" /> BMO is working…
            <button className="ghost tiny" onClick={() => abort.current?.abort()} data-testid="bmo-chat-cancel">
              Cancel
            </button>
          </p>
        )}
        <div ref={listEnd} />
      </div>

      {!status && !statusError && <p className="muted small">Checking BMO…</p>}
      {statusError && <p className="error-text">Could not read the BMO status: {statusError}</p>}
      {status && (blocked || phase.name === "refused") && (
        <div className="bmo-chat-card">
          <Explainer
            status={status}
            reason={blocked ?? (phase.name === "refused" ? phase.detail : "")}
            handoffNote={status.backend === "handoff" ? "The chat needs the direct backend: in handoff mode dp calls no model, and the chat has no handoff of its own." : undefined}
          />
        </div>
      )}

      {status && !blocked && (
        <div className="bmo-chat-compose">
          {previewShown && <PreviewCard preview={previewShown.preview} diagram={diagram} onSend={() => void send(previewShown)} onDiscard={() => setPhase({ name: "idle" })} onReveal={onReveal} />}
          {phase.name === "previewing" && phase.key === key && (
            <p className="muted small" data-testid="bmo-chat-previewing">
              Building the preview…
            </p>
          )}
          {phase.name === "error" && (phase.key === "" || phase.key === key) && (
            <p className="error-text small" role="alert" data-testid="bmo-chat-error">
              {phase.detail}
            </p>
          )}
          {(chips.length > 0 || warnings.length > 0) && (
            <div className="bmo-chat-chips" data-testid="bmo-chat-chips">
              {chips.map((t, i) => (
                <button
                  key={t.id}
                  className={`chip bmo-ref${i >= BMO_ASK_LIMITS.refs ? " over" : ""}`}
                  onClick={() => onReveal(t.id)}
                  title={`${t.kindLabel}${t.where ? ` ${t.where}` : ""}. Click to show it on the diagram.`}
                  data-testid={`bmo-chat-chip-${t.id}`}
                >
                  {t.name}
                </button>
              ))}
              {warnings.map((w) => (
                <span
                  key={`${w.start}`}
                  className="chip bmo-ref warn"
                  title={
                    w.status === "ambiguous" ? "More than one object has this name: type [ again and pick one from the list." : "No element or relationship has this name; it is sent as plain text."
                  }
                  data-testid="bmo-chat-warning"
                >
                  [{w.token}] {w.status === "ambiguous" ? "is ambiguous" : "not found"}
                </span>
              ))}
              {resolved.refs.length > BMO_ASK_LIMITS.refs && <span className="muted small">Only the first {BMO_ASK_LIMITS.refs} objects are attached.</span>}
            </div>
          )}
          <div className="bmo-chat-input">
            {popupOpen && (
              <ul className="bmo-mentions" role="listbox" id={listId} aria-label="Objects to refer to" data-testid="bmo-mention-list">
                {suggestions.map((t, i) => (
                  <li
                    key={t.id}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    className={i === active ? "active" : undefined}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(t);
                    }}
                    onMouseEnter={() => setActive(i)}
                    data-testid={`bmo-mention-${t.id}`}
                  >
                    <span className="bmo-mention-name">{t.name}</span>
                    <span className="muted small">
                      {t.kindLabel}
                      {t.where && ` ${t.where}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <textarea
              ref={input}
              value={text}
              rows={2}
              maxLength={BMO_ASK_LIMITS.questionChars}
              placeholder="Ask about the model… type [ to refer to an object"
              aria-label="Message to BMO"
              aria-autocomplete="list"
              aria-haspopup="listbox"
              aria-controls={popupOpen ? listId : undefined}
              aria-activedescendant={popupOpen ? `${listId}-${active}` : undefined}
              disabled={running}
              onChange={(e) => {
                setText(e.target.value);
                setCaret(e.target.selectionStart ?? e.target.value.length);
                setPicks((p) => keepPicks(e.target.value, p));
                if (phase.name !== "idle" && phase.name !== "running") setPhase({ name: "idle" });
              }}
              onKeyDown={onKeyDown}
              onKeyUp={syncCaret}
              onClick={syncCaret}
              onSelect={syncCaret}
              data-testid="bmo-chat-input"
            />
            <button
              className={previewShown ? "primary" : undefined}
              disabled={!text.trim() || running || phase.name === "previewing"}
              onClick={() => (previewShown ? void send(previewShown) : preview())}
              data-testid="bmo-chat-submit"
            >
              {previewShown ? "Send" : "Preview"}
            </button>
          </div>
          <p className="muted small bmo-chat-keys">
            {previewShown ? "Enter sends · editing the message discards this preview · Esc discards it" : "Enter previews what will be sent · Shift+Enter: new line"}
          </p>
        </div>
      )}
    </section>
  );
}

function PreviewCard({ preview, diagram, onSend, onDiscard, onReveal }: { preview: BmoPreview; diagram: Diagram | null; onSend(): void; onDiscard(): void; onReveal(id: string): void }) {
  const d = preview.destination;
  const where = [d.provider, d.model, d.host].filter(Boolean).join(" · ") || "a test backend";
  const ask = preview.ask;
  const bytes = preview.files.reduce((n, f) => n + f.bytes, 0);
  return (
    <div className="bmo-chat-card" data-testid="bmo-chat-preview">
      <p className="bmo-chat-card-title">
        <strong>Ready to send</strong> <span className="muted small">to {where}</span>
      </p>
      {ask && ask.objects.length > 0 && (
        <div className="bmo-chat-chips" data-testid="bmo-chat-preview-objects">
          <span className="muted small">With the details of</span>
          {ask.objects.map((o) => (
            <button key={o.id} className="chip bmo-ref" onClick={() => onReveal(o.id)} data-testid={`bmo-chat-preview-object-${o.id}`}>
              {o.name}
            </button>
          ))}
        </div>
      )}
      {ask?.context === "diagram" && (
        <p className="small" data-testid="bmo-chat-preview-context">
          No object referred to: the diagram {diagram ? `“${diagram.title}”` : "you are viewing"} is sent.
        </p>
      )}
      {ask?.context === "overview" && (
        <p className="small" data-testid="bmo-chat-preview-context">
          No object referred to: a short overview of the model (its systems and containers) is sent.
        </p>
      )}
      {ask && ask.history.given > 0 && <p className="small muted">{plural(ask.history.sent, "earlier message")} sent for context.</p>}
      {preview.files.length > 0 ? (
        <details className="small" data-testid="bmo-chat-preview-files">
          <summary>
            {plural(preview.files.length, "file excerpt")} ({kb(bytes)}), values that looked secret hidden
          </summary>
          <ul className="bmo-chat-files">
            {preview.files.map((f) => (
              <li key={f.path}>
                <code>{f.path}</code>{" "}
                <span className="muted">
                  {kb(f.bytes)}
                  {f.redactions ? `, ${plural(f.redactions, "value")} hidden` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p className="small muted">No file excerpts.</p>
      )}
      {ask && ask.trimmed.length > 0 && (
        <ul className="small muted bmo-chat-trimmed" data-testid="bmo-chat-trimmed">
          {ask.trimmed.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
      <p className="small" data-testid="bmo-chat-size">
        About {preview.estTokens.toLocaleString()} tokens{preview.maxInputTokens ? ` (a run takes at most ${preview.maxInputTokens.toLocaleString()})` : ""}.
        {preview.estCost && ` Estimated cost about ${preview.estCost.total.toFixed(4)} for the input.`}
      </p>
      <details className="bmo-prompt small" data-testid="bmo-chat-prompt">
        <summary>Show the full prompt</summary>
        <pre className="bmo-text">{preview.system}</pre>
        <pre className="bmo-text" data-testid="bmo-chat-prompt-user">
          {preview.user}
        </pre>
      </details>
      <div className="row">
        <button onClick={onDiscard} data-testid="bmo-chat-discard">
          Discard
        </button>
        <button className="primary" onClick={onSend} data-testid="bmo-chat-send">
          Send
        </button>
      </div>
    </div>
  );
}

/** BMO's answer as simple Markdown, built from React elements (text is never parsed as HTML). */
function Markdown({ text }: { text: string }) {
  const inline = (s: string): ReactNode[] =>
    inlineParts(s).map((p, i) => (p.type === "strong" ? <strong key={i}>{p.text}</strong> : p.type === "em" ? <em key={i}>{p.text}</em> : p.type === "code" ? <code key={i}>{p.text}</code> : p.text));
  return (
    <div className="bmo-md" data-testid="bmo-chat-answer">
      {markdownBlocks(text).map((b, i) =>
        b.type === "p" ? (
          <p key={i}>{inline(b.text)}</p>
        ) : b.type === "h" ? (
          <p key={i}>
            <strong>{inline(b.text)}</strong>
          </p>
        ) : b.type === "code" ? (
          <pre key={i} className="bmo-text">
            {b.text}
          </pre>
        ) : b.type === "ul" ? (
          <ul key={i}>
            {b.items.map((it, j) => (
              <li key={j}>{inline(it)}</li>
            ))}
          </ul>
        ) : (
          <ol key={i}>
            {b.items.map((it, j) => (
              <li key={j}>{inline(it)}</li>
            ))}
          </ol>
        ),
      )}
    </div>
  );
}
