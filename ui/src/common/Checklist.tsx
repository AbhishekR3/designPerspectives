/**
 * The checklist card (REC-05): things to do, questions to answer and assumptions to confirm, docked over the right of
 * the canvas like the BMO chat so the diagram stays usable. Items come from a person, from a starter list or from BMO's
 * questions after an import. An item with a rule is checked by dp itself: it shows a mark instead of a checkbox, says
 * what fails, and steps through the failing objects on the diagram.
 *
 * The state and the actions are in `useChecklist`; this file only draws them. Viewers see the list and change nothing.
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { confirmDialog } from "./dialogs";
import { Icon } from "./icons";
import { plural } from "./plural";
import { useDismiss } from "./useDismiss";
import type { ChecklistApi, ChecklistPatch } from "../hooks/useChecklist";
import { CHECKLIST_KIND_LABEL, CHECKLIST_KINDS, type AppState, type ChecklistItem, type ChecklistKind, type CommentTarget } from "../types";

/** The section BMO's questions and assumptions go to (the server's name for it). */
const BMO_SECTION = "Questions from BMO";
type Filter = "open" | "all" | "selection";

const sameTarget = (a: CommentTarget | null | undefined, b: CommentTarget | null | undefined) => !!a && !!b && a.type === b.type && a.id === b.id;

/** The name of what an item is about. */
function targetName(state: AppState, t: CommentTarget): string {
  if (t.type === "element") return state.elements.find((e) => e.id === t.id)?.name ?? t.id;
  if (t.type === "diagram") return state.diagrams.find((d) => d.key === t.id)?.title ?? t.id;
  const r = state.relationships.find((x) => x.id === t.id);
  if (!r) return t.id;
  const name = (id: string) => state.elements.find((e) => e.id === id)?.name ?? id;
  return `${name(r.sourceId)} → ${name(r.destinationId)}`;
}

const ANSWER_LABEL: Record<ChecklistKind, { button: string; title: string; placeholder: string }> = {
  question: {
    button: "Answer",
    title: "Answer",
    placeholder: "Write the answer…",
  },
  assumption: {
    button: "Correct it",
    title: "Correction",
    placeholder: "Write what is true instead…",
  },
  task: { button: "Add a note", title: "Note", placeholder: "Write a note…" },
};

interface CardProps {
  state: AppState;
  api: ChecklistApi;
  /** What is selected on the diagram (a box or a line), if anything. */
  selected: CommentTarget | null;
  /** Show an element or relationship on the diagram. */
  onReveal(id: string): void;
  onOpenDiagram(key: string): void;
  onClose(): void;
}

export function ChecklistCard({ state, api, selected, onReveal, onOpenDiagram, onClose }: CardProps) {
  const { data, can } = api;
  const [filter, setFilter] = useState<Filter>("open");
  const [shown, setShown] = useState<Record<string, number>>({});
  // A target asked for from a menu: it stays until the item is added or the box is unticked.
  const [pinned, setPinned] = useState<CommentTarget | null>(null);
  const [aboutOn, setAboutOn] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const ask = api.ask;
  const { clearAsk } = api;
  useEffect(() => {
    if (!ask) return;
    if (ask.target) {
      setPinned(ask.target);
      setAboutOn(true);
    }
    input.current?.focus();
    clearAsk();
  }, [ask?.seq]); // eslint-disable-line react-hooks/exhaustive-deps -- one request is handled once

  const items = useMemo(() => data?.items ?? [], [data]);
  const summary = data?.summary;
  const active: Filter = filter === "selection" && !selected ? "open" : filter;
  const shownItems = items.filter((i) => (active === "all" ? true : active === "open" ? i.status === "open" : sameTarget(i.target, selected)));

  // Sections in order of first appearance; BMO's questions first while one of them is open.
  const sections = useMemo(() => {
    const order: string[] = [];
    for (const i of items) if (!order.includes(i.section)) order.push(i.section);
    if (items.some((i) => i.section === BMO_SECTION && i.status === "open")) order.sort((a, b) => Number(b === BMO_SECTION) - Number(a === BMO_SECTION));
    return order;
  }, [items]);

  const counted = summary ? summary.total - summary.skipped : 0;
  const doneCount = summary?.done ?? 0;
  const about = pinned ?? selected;
  const aboutTarget = aboutOn ? about : null;
  const starters = data?.starters ?? [];
  const empty = !!data && items.length === 0;

  const [text, setText] = useState("");
  const [kind, setKind] = useState<ChecklistKind>("task");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    const made = await api.add({
      text: t,
      kind,
      ...(aboutTarget ? { target: aboutTarget } : {}),
    });
    setBusy(false);
    if (made) {
      setText("");
      setPinned(null);
      setAboutOn(false);
      if (filter === "selection" && !aboutTarget) setFilter("open");
    }
    input.current?.focus();
  };

  const step = (item: ChecklistItem) => {
    const ids = item.check?.ids ?? [];
    if (!ids.length) return;
    const next = ((shown[item.id] ?? -1) + 1) % ids.length;
    setShown((s) => ({ ...s, [item.id]: next }));
    onReveal(ids[next]!);
  };
  const openTarget = (t: CommentTarget) => (t.type === "diagram" ? onOpenDiagram(t.id) : onReveal(t.id));

  const clearDone = async () => {
    const n = summary?.done ?? 0;
    const ok = await confirmDialog({
      title: `Remove ${plural(n, "done item")}?`,
      message: "Items dp checks itself come back when you add their list again.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (ok) await api.clear("done");
  };

  return (
    <section className="float bmo-chat checklist-card" role="region" aria-label="Checklist" data-testid="checklist-card">
      <header className="bmo-chat-head checklist-head">
        <strong>Checklist</strong>
        {counted > 0 && (
          <span className="muted small" data-testid="checklist-progress-text">
            {doneCount} of {counted} done
          </span>
        )}
        <span className="grow" />
        <button className="ghost tiny" onClick={onClose} aria-label="Close the checklist" title="Close (L)" data-testid="checklist-close">
          <Icon name="close" size={12} />
        </button>
      </header>
      {counted > 0 && (
        <div className="cl-bar" role="progressbar" aria-valuemin={0} aria-valuemax={counted} aria-valuenow={doneCount} aria-label="Items done" data-testid="checklist-progress">
          <span style={{ width: `${Math.round((doneCount / counted) * 100)}%` }} />
        </div>
      )}
      {items.length > 0 && (
        <div className="cl-filters" role="group" aria-label="Show">
          <button className={`tiny${active === "open" ? " on" : ""}`} aria-pressed={active === "open"} onClick={() => setFilter("open")} data-testid="checklist-filter-open">
            Open{summary ? ` (${summary.open})` : ""}
          </button>
          <button className={`tiny${active === "all" ? " on" : ""}`} aria-pressed={active === "all"} onClick={() => setFilter("all")} data-testid="checklist-filter-all">
            All
          </button>
          <button
            className={`tiny${active === "selection" ? " on" : ""}`}
            aria-pressed={active === "selection"}
            disabled={!selected}
            title={selected ? "Only the items about what is selected" : "Select a box or a line to see its items"}
            onClick={() => setFilter("selection")}
            data-testid="checklist-filter-selection"
          >
            Selection
          </button>
        </div>
      )}

      <div className="bmo-chat-log cl-list" data-testid="checklist-list">
        {!data && <p className="muted small">Loading…</p>}
        {empty && (
          <div data-testid="checklist-empty">
            <p className="muted small bmo-chat-hint">
              A list of things to do, questions to answer and assumptions to confirm. dp ticks the items it can check itself, such as “every container has a technology”.
              {can ? " Start from a list, or add your own below." : ""}
            </p>
            {can && (
              <div className="cl-starters">
                {starters.map((s) => (
                  <button key={s.id} className="cl-starter" onClick={() => void api.addStarter(s.id)} data-testid={`checklist-starter-${s.id}`}>
                    <strong>{s.title}</strong>
                    <span className="muted small">
                      {s.description} ({plural(s.total, "item")})
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {data && items.length > 0 && shownItems.length === 0 && (
          <p className="muted small bmo-chat-hint" data-testid="checklist-none">
            {active === "open" ? "Nothing is open." : active === "selection" ? "Nothing on the checklist is about this." : "Nothing here."}
            {active === "open" && (
              <>
                {" "}
                <button className="link" onClick={() => setFilter("all")}>
                  Show all
                </button>
              </>
            )}
          </p>
        )}
        {sections
          .filter((s) => shownItems.some((i) => i.section === s))
          .map((s) => {
            const all = items.filter((i) => i.section === s);
            const done = all.filter((i) => i.status === "done").length;
            return (
              <div key={s} className="cl-section" data-testid="checklist-section" data-section={s}>
                <h3 className="cl-section-head">
                  <span>{s}</span>
                  <span className="muted small" title="Done out of all items in this section">
                    {done}/{all.length}
                  </span>
                </h3>
                <ul role="list" className="cl-items">
                  {shownItems
                    .filter((i) => i.section === s)
                    .map((i) => (
                      <ItemRow key={i.id} item={i} state={state} api={api} selected={selected} sections={sections} shown={shown[i.id]} onShow={() => step(i)} onOpenTarget={openTarget} />
                    ))}
                </ul>
              </div>
            );
          })}
      </div>

      {can ? (
        <div className="bmo-chat-compose cl-compose">
          <div className="cl-add">
            <input
              ref={input}
              value={text}
              maxLength={500}
              placeholder="Add an item… (Enter)"
              aria-label="Add an item to the checklist"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void add();
                } else if (e.key === "Escape") {
                  // Escape leaves the input (it would otherwise clear the selection through the global key).
                  e.stopPropagation();
                  e.currentTarget.blur();
                }
              }}
              data-testid="checklist-add-input"
            />
            <select value={kind} onChange={(e) => setKind(e.target.value as ChecklistKind)} aria-label="Kind of item" data-testid="checklist-add-kind">
              {CHECKLIST_KINDS.map((k) => (
                <option key={k} value={k}>
                  {CHECKLIST_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          {about && (
            <label className="cl-about small" data-testid="checklist-add-about">
              <input type="checkbox" checked={aboutOn} onChange={(e) => setAboutOn(e.target.checked)} data-testid="checklist-add-about-check" />
              <span className="truncate">About {targetName(state, about)}</span>
            </label>
          )}
          {!empty && (
            <div className="cl-foot">
              {starters
                .filter((s) => s.added < s.total)
                .map((s) => (
                  <button key={s.id} className="ghost small" onClick={() => void api.addStarter(s.id)} data-testid={`checklist-add-starter-${s.id}`}>
                    Add the “{s.title}” list
                  </button>
                ))}
              {doneCount > 0 && (
                <button className="ghost small" onClick={() => void clearDone()} data-testid="checklist-clear-done">
                  Clear done ({doneCount})
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        data && (
          <p className="muted small cl-readonly" data-testid="checklist-readonly">
            Architects and engineers change the checklist. You can read it.
          </p>
        )
      )}
    </section>
  );
}

// ---------------------------------------------------------------- one item

interface RowProps {
  item: ChecklistItem;
  state: AppState;
  api: ChecklistApi;
  selected: CommentTarget | null;
  sections: string[];
  /** Index of the failing object shown last by the Show button. */
  shown: number | undefined;
  onShow(): void;
  onOpenTarget(t: CommentTarget): void;
}

function ItemRow({ item, state, api, selected, sections, shown, onShow, onOpenTarget }: RowProps) {
  const { can } = api;
  const [editing, setEditing] = useState(false);
  const [answering, setAnswering] = useState(false);
  const skipped = item.status === "skipped";
  const done = item.status === "done";
  const label = ANSWER_LABEL[item.kind];
  const save = (patch: ChecklistPatch) => api.patch(item.id, patch);
  const ids = item.check?.ids ?? [];
  const next = ((shown ?? -1) + 1) % Math.max(ids.length, 1);

  return (
    <li
      className={`cl-item${done ? " done" : ""}${skipped ? " skipped" : ""}`}
      data-testid={`checklist-item-${item.id}`}
      data-status={item.status}
      data-kind={item.kind}
      data-rule={item.rule ?? undefined}
    >
      <div className="cl-main">
        {item.rule ? (
          <span
            className={`cl-mark ${item.check?.passing ? "pass" : "fail"}`}
            role="img"
            aria-label={item.check?.passing ? "Passing. dp checks this itself" : "Not passing yet. dp checks this itself"}
            title="dp checks this itself"
            data-testid={`checklist-mark-${item.id}`}
          >
            {item.check?.passing ? <Icon name="check" size={12} /> : null}
          </span>
        ) : (
          <input
            type="checkbox"
            className="cl-check"
            checked={done}
            disabled={!can}
            aria-label={item.kind === "assumption" ? `Confirmed: ${item.text}` : `Done: ${item.text}`}
            title={item.kind === "assumption" ? "Tick when the assumption is confirmed" : done ? "Done. Untick to reopen" : "Tick when done"}
            onChange={(e) => void save({ status: e.target.checked ? "done" : "open" })}
            data-testid={`checklist-check-${item.id}`}
          />
        )}
        <div className="cl-body">
          {editing ? (
            <InlineEdit
              initial={item.text}
              label="Item text"
              maxLength={500}
              onSave={(v) => {
                setEditing(false);
                if (v.trim() && v.trim() !== item.text) void save({ text: v });
              }}
              onCancel={() => setEditing(false)}
              testId={`checklist-edit-${item.id}`}
            />
          ) : can ? (
            <button className="cl-text" onClick={() => setEditing(true)} title="Click to edit" data-testid={`checklist-text-${item.id}`}>
              {item.text}
            </button>
          ) : (
            <span className="cl-text plain" data-testid={`checklist-text-${item.id}`}>
              {item.text}
            </span>
          )}
          <div className="cl-meta">
            {item.kind !== "task" && <span className={`cl-chip ${item.kind}`}>{CHECKLIST_KIND_LABEL[item.kind]}</span>}
            {item.source === "bmo" && (
              <span className="cl-chip bmo" title="BMO asked this when it read the code">
                BMO
              </span>
            )}
            {skipped && <span className="cl-chip skip">Skipped</span>}
            {item.target &&
              (item.missing ? (
                <span className="cl-chip missing" title="What this is about is not in the version shown" data-testid={`checklist-target-${item.id}`}>
                  not in this version
                </span>
              ) : (
                <button
                  className="cl-chip target"
                  onClick={() => onOpenTarget(item.target!)}
                  title={item.target.type === "diagram" ? "Open the diagram" : "Show it on the diagram"}
                  data-testid={`checklist-target-${item.id}`}
                >
                  <Icon name={item.target.type === "diagram" ? "layers" : "pin"} size={10} /> <span className="truncate">{targetName(state, item.target)}</span>
                </button>
              ))}
          </div>
          {item.rule && item.check && !item.check.passing && !skipped && (
            <p className="cl-detail small" data-testid={`checklist-detail-${item.id}`}>
              {item.check.detail}
              {ids.length > 0 && (
                <>
                  {" "}
                  <button className="tiny" onClick={onShow} title="Show the next object that fails this check" data-testid={`checklist-show-${item.id}`}>
                    {ids.length > 1 ? `Show ${next + 1} of ${ids.length}` : "Show"}
                  </button>
                </>
              )}
            </p>
          )}
          {answering ? (
            <InlineEdit
              initial={item.answer ?? ""}
              label={label.title}
              placeholder={label.placeholder}
              maxLength={4000}
              multiline
              onSave={(v) => {
                setAnswering(false);
                if (v.trim() !== (item.answer ?? "")) void save({ answer: v.trim() });
              }}
              onCancel={() => setAnswering(false)}
              testId={`checklist-answer-edit-${item.id}`}
            />
          ) : item.answer ? (
            can ? (
              <button className="cl-answer" onClick={() => setAnswering(true)} title="Click to edit" data-testid={`checklist-answer-${item.id}`}>
                <span className="muted small">
                  {label.title}
                  {item.answeredBy ? ` by ${item.answeredBy}` : ""}
                </span>
                <span className="cl-answer-text">{item.answer}</span>
              </button>
            ) : (
              <div className="cl-answer plain" data-testid={`checklist-answer-${item.id}`}>
                <span className="muted small">
                  {label.title}
                  {item.answeredBy ? ` by ${item.answeredBy}` : ""}
                </span>
                <span className="cl-answer-text">{item.answer}</span>
              </div>
            )
          ) : null}
        </div>
        {can && (
          <ItemMenu
            item={item}
            selected={selected}
            sections={sections}
            onEdit={() => setEditing(true)}
            onAnswer={() => setAnswering(true)}
            onPatch={(p) => void save(p)}
            onDelete={async () => {
              const ok = await confirmDialog({
                title: "Delete this item?",
                message: item.text,
                confirmLabel: "Delete",
                danger: true,
              });
              if (ok) await api.remove(item.id);
            }}
          />
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------- the item menu

function ItemMenu({
  item,
  selected,
  sections,
  onEdit,
  onAnswer,
  onPatch,
  onDelete,
}: {
  item: ChecklistItem;
  selected: CommentTarget | null;
  sections: string[];
  onEdit(): void;
  onAnswer(): void;
  onPatch(p: ChecklistPatch): void;
  onDelete(): void;
}) {
  const [place, setPlace] = useState<React.CSSProperties | null>(null);
  const [mode, setMode] = useState<"main" | "section">("main");
  const [newSection, setNewSection] = useState("");
  const open = place !== null;
  const close = () => {
    setPlace(null);
    setMode("main");
    setNewSection("");
  };
  const ref = useDismiss<HTMLSpanElement>(open, close);
  const pick = (fn: () => void) => () => {
    close();
    fn();
  };
  const label = ANSWER_LABEL[item.kind];
  const canLink = !!selected && !sameTarget(item.target, selected);
  const row = (text: ReactNode, onClick: () => void, testId: string, extra?: { on?: boolean; danger?: boolean }) => (
    <button role="menuitem" className={`${extra?.on ? "on" : ""}${extra?.danger ? " danger" : ""}`} onClick={onClick} data-testid={`checklist-menu-${testId}`}>
      {text}
    </button>
  );
  return (
    <span className="cl-menu-wrap" ref={ref}>
      <button
        className="ghost tiny cl-menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for: ${item.text}`}
        title="Actions"
        onClick={(e) => {
          if (open) return close();
          const r = e.currentTarget.getBoundingClientRect();
          const below = r.bottom + 4;
          const right = Math.max(8, window.innerWidth - r.right);
          setPlace(
            window.innerHeight - below < 280
              ? {
                  position: "fixed",
                  bottom: window.innerHeight - r.top + 4,
                  right,
                  margin: 0,
                }
              : { position: "fixed", top: below, right, margin: 0 },
          );
        }}
        data-testid={`checklist-menu-${item.id}`}
      >
        <Icon name="dots" size={14} />
      </button>
      {open && (
        <div className="pop-menu wide cl-menu" style={place!} role="menu" aria-label="Item actions" data-testid="checklist-menu">
          {mode === "main" ? (
            <>
              {row("Edit", pick(onEdit), "edit")}
              {row(item.answer ? `${label.button} (edit)` : label.button, pick(onAnswer), "answer")}
              {canLink &&
                row(
                  "Link to selection",
                  pick(() => onPatch({ target: selected })),
                  "link",
                )}
              {item.target &&
                row(
                  "Unlink",
                  pick(() => onPatch({ target: null })),
                  "unlink",
                )}
              <div className="cl-menu-head muted small">Kind</div>
              {CHECKLIST_KINDS.map((k) =>
                row(
                  CHECKLIST_KIND_LABEL[k],
                  pick(() => k !== item.kind && onPatch({ kind: k })),
                  `kind-${k}`,
                  { on: k === item.kind },
                ),
              )}
              {row("Move to section…", () => setMode("section"), "move")}
              {row(
                item.status === "skipped" ? "Reopen" : "Skip",
                pick(() =>
                  onPatch({
                    status: item.status === "skipped" ? "open" : "skipped",
                  }),
                ),
                "skip",
              )}
              {row("Delete", pick(onDelete), "delete", { danger: true })}
            </>
          ) : (
            <>
              <div className="cl-menu-head muted small">Move to section</div>
              {sections.map((s) =>
                row(
                  s,
                  pick(() => s !== item.section && onPatch({ section: s })),
                  "section",
                  { on: s === item.section },
                ),
              )}
              <input
                className="cl-menu-input"
                value={newSection}
                maxLength={60}
                placeholder="New section… (Enter)"
                aria-label="New section name"
                autoFocus
                onChange={(e) => setNewSection(e.target.value)}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter" && newSection.trim()) {
                    e.preventDefault();
                    const s = newSection.trim();
                    close();
                    onPatch({ section: s });
                  }
                }}
                data-testid="checklist-menu-new-section"
              />
            </>
          )}
        </div>
      )}
    </span>
  );
}

// ---------------------------------------------------------------- edit in place

/**
 * A text edited in place. A line: Enter saves. Several lines: Ctrl/Cmd+Enter saves. Leaving the field saves too,
 * Escape puts the old text back. It reports once, whichever of these happens first.
 */
function InlineEdit({
  initial,
  label,
  placeholder,
  maxLength,
  multiline,
  onSave,
  onCancel,
  testId,
}: {
  initial: string;
  label: string;
  placeholder?: string;
  maxLength: number;
  multiline?: boolean;
  onSave(v: string): void;
  onCancel(): void;
  testId: string;
}) {
  const [value, setValue] = useState(initial);
  const settled = useRef(false);
  const el = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  useEffect(() => {
    el.current?.focus();
    el.current?.select();
  }, []);
  const finish = (save: boolean) => {
    if (settled.current) return;
    settled.current = true;
    if (save) onSave(value);
    else onCancel();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      finish(false);
    } else if (e.key === "Enter" && !e.nativeEvent.isComposing && (multiline ? e.metaKey || e.ctrlKey : !e.shiftKey)) {
      e.preventDefault();
      finish(true);
    }
  };
  const common = {
    ref: (n: HTMLInputElement | HTMLTextAreaElement | null) => void (el.current = n),
    value,
    maxLength,
    placeholder,
    "aria-label": label,
    className: "cl-edit",
    onBlur: () => finish(true),
    onKeyDown,
    "data-testid": testId,
  };
  return multiline ? <textarea {...common} rows={3} onChange={(e) => setValue(e.target.value)} /> : <input {...common} type="text" onChange={(e) => setValue(e.target.value)} />;
}
