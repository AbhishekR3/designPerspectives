/**
 * Comments, ideas and questions (DEC-049): the server state (`useComments`), the discussion block shown in
 * the details panel for one object (`Discussion`), and the list for the diagram on screen (`DiagramComments`).
 *
 * Comments are kept next to the model, not in it: every role can write them (a viewer too), they have no undo
 * step, and they are reloaded when the model changes and when the window regains focus.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../api";
import { confirmDialog } from "./dialogs";
import { dialogOpen, isTyping } from "../panels/fields";
import { Icon } from "./icons";
import { run } from "./notify";
import { AUTHOR_KEY, storage } from "../storage";
import { COMMENT_KIND_LABEL, COMMENT_KINDS, type AppState, type CommentKind, type CommentTarget, type CommentThread, type Diagram, type Selection } from "../types";

export interface CommentCount {
  open: number;
  total: number;
  /** An open question is among them. */
  question: boolean;
}

/** The thread target of a line on a diagram: its relationship (not for derived lines, imports or ghosts). */
export function edgeCommentTarget(e: { id: string; derived: boolean; ghost?: boolean; relationshipIds: string[] }): CommentTarget | null {
  if (e.derived || e.ghost || e.id.startsWith("file:") || !e.relationshipIds[0]) return null;
  return { type: "relationship", id: e.relationshipIds[0] };
}

export const targetKey = (t: CommentTarget) => `${t.type}:${t.id}`;
const sameTarget = (a: CommentTarget, b: CommentTarget) => a.type === b.type && a.id === b.id;

/** What the comment tools need: the threads, who may do what, and the actions (each reloads the threads). */
export interface CommentsApi {
  threads: CommentThread[];
  /** The server takes comments (not a --read-only server). */
  can: boolean;
  /** Signed-in name, or null when sign-in is off. */
  me: string | null;
  isArchitect: boolean;
  /** Counts of the threads of each element and relationship, for the badges. */
  counts: { element: Record<string, CommentCount>; relationship: Record<string, CommentCount> };
  openTotal: number;
  /** Ask the details panel to open the composer for this target. */
  askFor(t: CommentTarget): void;
  request: { seq: number; key: string } | null;
  claimed: { current: number };
  add(kind: CommentKind, target: CommentTarget, diagram: string | null, text: string, author: string): Promise<boolean>;
  reply(id: string, text: string, author: string): Promise<boolean>;
  setStatus(id: string, status: "open" | "resolved", author: string): Promise<boolean>;
  edit(id: string, patch: { text?: string; kind?: CommentKind }): Promise<boolean>;
  remove(id: string): Promise<boolean>;
  removeReply(id: string, replyId: string): Promise<boolean>;
}

export const CommentsContext = createContext<CommentsApi | null>(null);
export const useCommentsApi = (): CommentsApi | null => useContext(CommentsContext);

const EMPTY: CommentThread[] = [];

export function useComments(state: AppState | null): CommentsApi {
  const [threads, setThreads] = useState<CommentThread[]>(EMPTY);
  const [request, setRequest] = useState<{ seq: number; key: string } | null>(null);
  const claimed = useRef(0);
  const seq = useRef(0);
  const loaded = !!state;
  const version = state?.version;
  const ref = state?.model.ref;

  const reload = useCallback(async () => {
    const my = ++seq.current;
    try {
      const r = await api.comments();
      if (my === seq.current) setThreads(r.threads);
    } catch {
      /* keep what is shown: a failed refresh is not worth an error of its own */
    }
  }, []);
  useEffect(() => {
    if (loaded) void reload();
  }, [loaded, version, ref, reload]);
  useEffect(() => {
    // Like the model: not while someone is typing or a dialog is open (a comment being written must not be disturbed).
    const onFocus = () => !isTyping(document.activeElement) && !dialogOpen() && void reload();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);

  const act = useCallback(
    async (fn: () => Promise<unknown>) => {
      const done = await run(fn);
      await reload();
      return done !== undefined;
    },
    [reload],
  );

  const counts = useMemo(() => {
    const out: CommentsApi["counts"] = { element: {}, relationship: {} };
    for (const t of threads) {
      if (t.target.type === "diagram") continue;
      const m = out[t.target.type];
      const c = (m[t.target.id] ??= { open: 0, total: 0, question: false });
      c.total++;
      if (t.status === "open") {
        c.open++;
        if (t.kind === "question") c.question = true;
      }
    }
    return out;
  }, [threads]);

  const can = state?.can.comment ?? false;
  return {
    threads,
    can,
    me: state?.me?.name ?? null,
    isArchitect: !state?.me || state.me.role === "architect",
    counts,
    openTotal: threads.filter((t) => t.status === "open" && !t.missing).length,
    request,
    claimed,
    askFor: (t) => setRequest((r) => ({ seq: (r?.seq ?? 0) + 1, key: targetKey(t) })),
    add: (kind, target, diagram, text, author) => act(() => api.addComment({ kind, target, diagram, text, ...(author ? { author } : {}) })),
    reply: (id, text, author) => act(() => api.replyToComment(id, text, author || undefined)),
    setStatus: (id, status, author) => act(() => api.updateComment(id, { status, ...(author ? { author } : {}) })),
    edit: (id, patch) => act(() => api.updateComment(id, patch)),
    remove: (id) => act(() => api.deleteComment(id)),
    removeReply: (id, replyId) => act(() => api.deleteReply(id, replyId)),
  };
}

// ---------------------------------------------------------------- small helpers

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 14) return `${Math.floor(s / 86400)} days ago`;
  return new Date(iso).toLocaleDateString();
}

const KIND_HINT: Record<CommentKind, string> = {
  comment: "A remark about this",
  idea: "A suggestion for a change",
  question: "Something that needs an answer",
};
const PLACEHOLDER: Record<CommentKind, string> = {
  comment: "Write a comment…",
  idea: "Suggest an improvement…",
  question: "Ask a question…",
};

function KindChip({ kind }: { kind: CommentKind }) {
  return <span className={`ck ck-${kind}`}>{COMMENT_KIND_LABEL[kind]}</span>;
}

/** The name a person writes under when sign-in is off: remembered in this browser, optional. */
function useAuthor(me: string | null): [string, (v: string) => void] {
  const [name, setName] = useState(() => storage.get(AUTHOR_KEY) ?? "");
  const set = (v: string) => {
    setName(v);
    storage.set(AUTHOR_KEY, v);
  };
  return [me ?? name, set];
}

// ---------------------------------------------------------------- composer

function Composer({
  placeholder,
  submitLabel,
  initial = "",
  kinds,
  autoFocus,
  askName,
  onSubmit,
  onCancel,
  testId,
}: {
  placeholder?: string;
  submitLabel: string;
  initial?: string;
  /** Offer the three kinds, starting with this one; none: a reply or an edit. */
  kinds?: CommentKind;
  autoFocus?: boolean;
  /** Offer a name field (sign-in is off). */
  askName?: { value: string; onChange(v: string): void };
  onSubmit(text: string, kind: CommentKind): Promise<boolean>;
  onCancel?(): void;
  testId: string;
}) {
  const [text, setText] = useState(initial);
  const [kind, setKind] = useState<CommentKind>(kinds ?? "comment");
  const [busy, setBusy] = useState(false);
  const el = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocus) el.current?.focus();
  }, [autoFocus]);
  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    const done = await onSubmit(text, kind);
    setBusy(false);
    if (done) {
      setText("");
      onCancel?.();
    }
  };
  return (
    <div className="composer" data-testid={testId}>
      {kinds && (
        <div className="kind-pick" role="radiogroup" aria-label="Kind of note">
          {COMMENT_KINDS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={`ck-btn ck-${k}${kind === k ? " on" : ""}`} title={KIND_HINT[k]} onClick={() => setKind(k)} data-testid={`${testId}-kind-${k}`}>
              {COMMENT_KIND_LABEL[k]}
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={el}
        value={text}
        rows={3}
        maxLength={4000}
        placeholder={placeholder ?? PLACEHOLDER[kind]}
        aria-label={placeholder ?? PLACEHOLDER[kind]}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          } else if (e.key === "Escape" && onCancel) {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }
        }}
        data-testid={`${testId}-text`}
      />
      {askName && <input className="composer-name" value={askName.value} maxLength={80} placeholder="Your name (optional)" aria-label="Your name" onChange={(e) => askName.onChange(e.target.value)} data-testid={`${testId}-name`} />}
      <div className="composer-actions">
        <button className="primary small" disabled={!text.trim() || busy} onClick={() => void submit()} data-testid={`${testId}-submit`} title="Ctrl/Cmd+Enter">
          {submitLabel}
        </button>
        {onCancel && (
          <button className="ghost small" onClick={onCancel} data-testid={`${testId}-cancel`}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- one thread

function ThreadView({ t, api: c, about }: { t: CommentThread; api: CommentsApi; about?: ReactNode }) {
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useAuthor(c.me);
  const mine = (author: string) => c.isArchitect || (!!c.me && c.me.toLowerCase() === author.toLowerCase());
  const askName = c.me ? undefined : { value: name, onChange: setName };
  return (
    <li className={`thread ${t.status}`} data-testid={`thread-${t.id}`} data-kind={t.kind}>
      <div className="thread-head">
        <KindChip kind={t.kind} />
        <strong>{t.author}</strong>
        <span className="muted" title={new Date(t.at).toLocaleString()}>
          {timeAgo(t.at)}
        </span>
        {t.status === "resolved" && (
          <span className="resolved-tag" title={t.resolvedAt ? new Date(t.resolvedAt).toLocaleString() : undefined}>
            <Icon name="check" size={11} /> Resolved{t.resolvedBy ? ` by ${t.resolvedBy}` : ""}
          </span>
        )}
      </div>
      {about}
      {editing ? (
        <Composer
          initial={t.text}
          submitLabel="Save"
          kinds={t.kind}
          autoFocus
          testId={`edit-${t.id}`}
          onSubmit={(text, kind) => c.edit(t.id, { text, kind })}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <p className="thread-text">{t.text}</p>
      )}
      {t.replies.length > 0 && (
        <ul className="replies">
          {t.replies.map((r) => (
            <li key={r.id} data-testid={`reply-${r.id}`}>
              <div className="thread-head">
                <strong>{r.author}</strong>
                <span className="muted" title={new Date(r.at).toLocaleString()}>
                  {timeAgo(r.at)}
                </span>
                {mine(r.author) && (
                  <button
                    className="link small reply-del"
                    onClick={() => void confirmDialog({ title: "Delete this reply?", message: "It is removed for everyone.", confirmLabel: "Delete", danger: true }).then((yes) => yes && c.removeReply(t.id, r.id))}
                    aria-label="Delete this reply"
                    data-testid={`reply-delete-${r.id}`}
                  >
                    Delete
                  </button>
                )}
              </div>
              <p className="thread-text">{r.text}</p>
            </li>
          ))}
        </ul>
      )}
      {replying && (
        <Composer
          placeholder="Write a reply…"
          submitLabel="Reply"
          autoFocus
          askName={askName}
          testId={`reply-box-${t.id}`}
          onSubmit={(text) => c.reply(t.id, text, c.me ? "" : name)}
          onCancel={() => setReplying(false)}
        />
      )}
      {!replying && !editing && c.can && (
        <div className="thread-actions">
          <button className="link small" onClick={() => setReplying(true)} data-testid={`reply-${t.id}`}>
            Reply
          </button>
          <button className="link small" onClick={() => void c.setStatus(t.id, t.status === "open" ? "resolved" : "open", c.me ? "" : name)} data-testid={`resolve-${t.id}`}>
            {t.status === "open" ? (t.kind === "question" ? "Mark answered" : "Resolve") : "Reopen"}
          </button>
          {mine(t.author) && (
            <>
              <button className="link small" onClick={() => setEditing(true)} data-testid={`edit-${t.id}`}>
                Edit
              </button>
              <button
                className="link small danger-link"
                onClick={() =>
                  void confirmDialog({
                    title: "Delete this comment?",
                    message: t.replies.length ? `It is removed for everyone, with its ${t.replies.length} ${t.replies.length === 1 ? "reply" : "replies"}.` : "It is removed for everyone.",
                    confirmLabel: "Delete",
                    danger: true,
                  }).then((yes) => yes && c.remove(t.id))
                }
                data-testid={`delete-${t.id}`}
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------- the block in a details panel

/** Comments about one object (or one diagram), with a place to write a new one. */
export function Discussion({ target, diagramKey, title = "Discussion" }: { target: CommentTarget; diagramKey: string; title?: string }) {
  const c = useCommentsApi();
  const [composing, setComposing] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [name, setName] = useAuthor(c?.me ?? null);
  const key = targetKey(target);
  // A request from a menu or a badge ("Add comment…") opens the composer, once.
  useEffect(() => {
    if (c?.request && c.request.key === key && c.request.seq !== c.claimed.current) {
      c.claimed.current = c.request.seq;
      setComposing(true);
    }
  }, [c, c?.request, key]);
  if (!c) return null;
  const mine = c.threads.filter((t) => sameTarget(t.target, target));
  const open = mine.filter((t) => t.status === "open");
  const resolved = mine.filter((t) => t.status === "resolved");
  if (!c.can && mine.length === 0) return null;
  return (
    <section className="discussion" data-testid="discussion" aria-label={title}>
      <h4>
        <Icon name="comment" size={13} /> {title}
        {open.length > 0 && <span className="count">{open.length}</span>}
      </h4>
      {open.length > 0 && (
        <ul className="threads">
          {open.map((t) => (
            <ThreadView key={t.id} t={t} api={c} />
          ))}
        </ul>
      )}
      {resolved.length > 0 && (
        <>
          <button className="link small" onClick={() => setShowResolved(!showResolved)} aria-expanded={showResolved} data-testid="toggle-resolved">
            {showResolved ? "Hide" : "Show"} {resolved.length} resolved
          </button>
          {showResolved && (
            <ul className="threads">
              {resolved.map((t) => (
                <ThreadView key={t.id} t={t} api={c} />
              ))}
            </ul>
          )}
        </>
      )}
      {c.can &&
        (composing ? (
          <Composer
            kinds="comment"
            autoFocus
            submitLabel="Post"
            askName={c.me ? undefined : { value: name, onChange: setName }}
            testId="new-comment"
            onSubmit={(text, kind) => c.add(kind, target, diagramKey, text, c.me ? "" : name)}
            onCancel={() => setComposing(false)}
          />
        ) : (
          <button className="small add-comment" onClick={() => setComposing(true)} data-testid="add-comment">
            <Icon name="plus" size={12} /> Comment, suggest or ask
          </button>
        ))}
    </section>
  );
}

// ---------------------------------------------------------------- the list for the diagram on screen

type Filter = "open" | "question" | "idea" | "resolved" | "all";
const FILTERS: [Filter, string][] = [
  ["open", "Open"],
  ["question", "Questions"],
  ["idea", "Ideas"],
  ["resolved", "Resolved"],
  ["all", "All"],
];
const passes = (t: CommentThread, f: Filter) => (f === "all" ? true : f === "resolved" ? t.status === "resolved" : t.status === "open" && (f === "open" || t.kind === f));

/** Discussion of the diagram itself, and every thread about what it shows, with a way to jump to each. */
export function DiagramComments({
  state,
  diagram,
  onSelect,
  onReveal,
  onOpen,
}: {
  state: AppState;
  diagram: Diagram;
  onSelect(s: Selection): void;
  onReveal(elementId: string): void;
  onOpen(key: string): void;
}) {
  const c = useCommentsApi();
  const [filter, setFilter] = useState<Filter>("open");
  if (!c) return null;
  const elName = (id: string) => state.elements.find((e) => e.id === id)?.name ?? id;
  const relLabel = (id: string) => {
    const r = state.relationships.find((x) => x.id === id);
    return r ? `${elName(r.sourceId)} → ${elName(r.destinationId)}` : id;
  };
  const nodeIds = new Set(diagram.nodes.map((n) => n.id));
  const edgeOf = (relId: string) => diagram.edges.find((e) => !e.derived && e.relationshipIds.includes(relId));
  const here = (t: CommentThread) => (t.target.type === "element" ? nodeIds.has(t.target.id) : t.target.type === "relationship" ? !!edgeOf(t.target.id) : false);
  const others = c.threads.filter((t) => t.target.type !== "diagram" || t.target.id !== diagram.key);
  const onThis = others.filter(here).filter((t) => passes(t, filter));
  const elsewhere = others.filter((t) => !here(t) && !t.missing).filter((t) => passes(t, filter));
  const gone = others.filter((t) => !here(t) && t.missing).filter((t) => passes(t, filter));

  const aboutLink = (t: CommentThread): ReactNode => {
    const { type, id } = t.target;
    if (type === "element") {
      const label = elName(id);
      return (
        <p className="about">
          About{" "}
          <button className="link" onClick={() => (nodeIds.has(id) ? onSelect({ type: "node", id }) : onReveal(id))} data-testid={`about-${t.id}`}>
            {label}
          </button>
        </p>
      );
    }
    if (type === "relationship") {
      const e = edgeOf(id);
      return (
        <p className="about">
          About the connection{" "}
          <button className="link" onClick={() => (e ? onSelect({ type: "edge", id: e.id }) : onReveal(state.relationships.find((r) => r.id === id)?.sourceId ?? id))} data-testid={`about-${t.id}`}>
            {relLabel(id)}
          </button>
        </p>
      );
    }
    const d = state.diagrams.find((x) => x.key === id);
    return (
      <p className="about">
        About the diagram{" "}
        <button className="link" onClick={() => onOpen(id)} data-testid={`about-${t.id}`}>
          {d?.title ?? id}
        </button>
      </p>
    );
  };
  const list = (items: CommentThread[], withAbout: boolean) => (
    <ul className="threads">
      {items.map((t) => (
        <ThreadView key={t.id} t={t} api={c} about={withAbout ? aboutLink(t) : undefined} />
      ))}
    </ul>
  );

  return (
    <div className="diagram-comments" data-testid="diagram-comments">
      <Discussion target={{ type: "diagram", id: diagram.key }} diagramKey={diagram.key} title="About this diagram" />
      <section className="discussion" aria-label="Comments on what this diagram shows">
        <h4>
          <Icon name="comment" size={13} /> On what it shows
        </h4>
        <div className="filters" role="group" aria-label="Show">
          {FILTERS.map(([f, label]) => (
            <button key={f} className={`chip${filter === f ? " on" : ""}`} aria-pressed={filter === f} onClick={() => setFilter(f)} data-testid={`comments-filter-${f}`}>
              {label}
            </button>
          ))}
        </div>
        {onThis.length > 0 ? list(onThis, true) : <p className="muted small">{filter === "open" ? "No open comments on the objects in this diagram. Right-click a box or a line and choose Comment…" : "Nothing here with this filter."}</p>}
      </section>
      {elsewhere.length > 0 && (
        <section className="discussion" aria-label="Comments elsewhere in the model">
          <h4>Elsewhere in the model</h4>
          {list(elsewhere, true)}
        </section>
      )}
      {gone.length > 0 && (
        <section className="discussion" aria-label="Comments about things not in this version">
          <h4>Not in this version</h4>
          <p className="muted small">These are about objects that are deleted, or exist only in another draft.</p>
          {list(gone, false)}
        </section>
      )}
    </div>
  );
}
