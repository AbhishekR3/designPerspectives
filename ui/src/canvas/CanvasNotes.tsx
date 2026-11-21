/**
 * Notes on the canvas: the open threads about this diagram that have a position (REC-01, MOD-09), drawn as small
 * sticky notes that pan and zoom with the diagram, and the box that starts a new one.
 *
 * A note is not a React Flow node: it lives in a `ViewportPortal`, so it takes no part in layout, line routing,
 * selection boxes, Make room or the image export. Its position is saved on the thread (`position`, canvas units,
 * the same ones a box is drawn in on screen). A note stays a thread about the diagram; dropping it on a box does not
 * attach it to the box.
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ViewportPortal, useReactFlow, useStore, useStoreApi } from "@xyflow/react";
import { Composer, useAuthor, type CommentsApi } from "../common/comments";
import { COMMENT_KIND_LABEL, type CommentThread, type Pt } from "../types";

/** Width of a note in canvas units; the height follows the text (at most about three lines). */
export const NOTE_W = 190;
const NUDGE = 10;
/** Pixels the pointer must travel before a press on a note is a drag and not a click. */
const DRAG_SLOP = 4;

/** A note is never drawn smaller than this fraction of its size on screen, so it stays readable when the diagram is zoomed out. */
const MIN_SCALE = 0.75;
/** Size of the box for a new note on screen (a little more than it takes), used to keep it inside the canvas. */
const COMPOSER_W = 300;
const COMPOSER_H = 230;

const round = (n: number) => Math.round(n * 100) / 100;

/** Where a new note goes: a point of the diagram, in canvas units. */
export interface NoteDraft {
  at: Pt;
}

interface Gesture {
  id: string;
  pointerId: number;
  start: Pt;
  /** Pointer position minus note position, in canvas units. */
  offset: Pt;
  moved: boolean;
  pos: Pt;
}

const tipOf = (t: CommentThread) => `${COMMENT_KIND_LABEL[t.kind]} by ${t.author}${t.replies.length ? ` (${t.replies.length} ${t.replies.length === 1 ? "reply" : "replies"})` : ""}\n${t.text}`;

export function CanvasNotes({
  diagramKey,
  comments,
  draft,
  onDraftDone,
  onOpen,
}: {
  diagramKey: string;
  comments: CommentsApi;
  draft: NoteDraft | null;
  onDraftDone(): void;
  /** Show this thread in the discussion panel. */
  onOpen(threadId: string): void;
}) {
  const rf = useReactFlow();
  const storeApi = useStoreApi();
  const zoom = useStore((s) => s.transform[2]);
  const [drag, setDrag] = useState<{ id: string; pos: Pt } | null>(null);
  /** Positions saved but not yet read back, so a note does not jump to its old place while the save is on its way. */
  const [pending, setPending] = useState<Record<string, Pt>>({});
  const gesture = useRef<Gesture | null>(null);
  const saves = useRef<Record<string, number>>({});
  const [name, setName] = useAuthor(comments.me);
  const canMove = comments.can;
  const noteScale = Math.max(1, MIN_SCALE / zoom);
  // The new-note box opens at the right-clicked point, moved back inside the canvas when that point is near an edge (screen pixels).
  const shift = useMemo(() => {
    if (!draft) return { x: 0, y: 0 };
    const r = storeApi.getState().domNode?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    const s = rf.flowToScreenPosition(draft.at);
    return { x: Math.min(0, r.right - 12 - (s.x + COMPOSER_W)), y: Math.min(0, r.bottom - 12 - (s.y + COMPOSER_H)) };
  }, [draft, rf, storeApi]);

  // "Place on the diagram" in the panel drops a note at the centre of what is on screen.
  const { viewCentre } = comments;
  useEffect(() => {
    viewCentre.current = {
      key: diagramKey,
      centre: () => {
        const r = storeApi.getState().domNode?.getBoundingClientRect();
        const p = r ? rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) : { x: 0, y: 0 };
        return { x: round(p.x - NOTE_W / 2), y: round(p.y - 30) };
      },
    };
    return () => {
      if (viewCentre.current?.key === diagramKey) viewCentre.current = null;
    };
  }, [viewCentre, diagramKey, rf, storeApi]);

  const save = async (id: string, pos: Pt) => {
    const n = (saves.current[id] = (saves.current[id] ?? 0) + 1);
    setPending((p) => ({ ...p, [id]: pos }));
    await comments.place(id, pos);
    if (saves.current[id] === n) {
      setPending((p) => {
        const rest = { ...p };
        delete rest[id];
        return rest;
      });
    }
  };

  const notes = comments.threads.filter((t) => t.target.type === "diagram" && t.target.id === diagramKey && t.position && t.status === "open");
  const posOf = (t: CommentThread): Pt => (drag?.id === t.id ? drag.pos : (pending[t.id] ?? t.position!));
  const flowAt = (e: { clientX: number; clientY: number }) => rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });

  const down = (e: PointerEvent<HTMLElement>, t: CommentThread) => {
    if (e.button !== 0) return;
    e.stopPropagation(); // not a pan, not a click on the canvas behind
    if (!canMove) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = posOf(t);
    const f = flowAt(e);
    gesture.current = { id: t.id, pointerId: e.pointerId, start: { x: e.clientX, y: e.clientY }, offset: { x: f.x - p.x, y: f.y - p.y }, moved: false, pos: p };
  };
  const move = (e: PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    if (!g.moved && Math.hypot(e.clientX - g.start.x, e.clientY - g.start.y) < DRAG_SLOP) return;
    g.moved = true;
    const f = flowAt(e);
    g.pos = { x: round(f.x - g.offset.x), y: round(f.y - g.offset.y) };
    setDrag({ id: g.id, pos: g.pos });
  };
  const up = (e: PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    gesture.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (g.moved) {
      void save(g.id, g.pos);
      setDrag(null);
    } else {
      onOpen(g.id);
    }
  };
  const cancel = (e: PointerEvent<HTMLElement>) => {
    if (gesture.current?.pointerId === e.pointerId) {
      gesture.current = null;
      setDrag(null);
    }
  };
  const key = (e: KeyboardEvent<HTMLElement>, t: CommentThread) => {
    const arrow = { ArrowLeft: [-NUDGE, 0], ArrowRight: [NUDGE, 0], ArrowUp: [0, -NUDGE], ArrowDown: [0, NUDGE] }[e.key];
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      onOpen(t.id);
    } else if (arrow) {
      e.preventDefault();
      e.stopPropagation();
      if (canMove) {
        const p = posOf(t);
        void save(t.id, { x: p.x + arrow[0]!, y: p.y + arrow[1]! });
      }
    }
  };

  if (notes.length === 0 && !draft) return null;
  return (
    <ViewportPortal>
      <div className="canvas-notes" data-testid="canvas-notes">
        {notes.map((t) => {
          const p = posOf(t);
          const replies = t.replies.length;
          return (
            <div
              key={t.id}
              className={`canvas-note nopan nodrag${canMove ? " movable" : ""}${drag?.id === t.id ? " dragging" : ""}`}
              data-kind={t.kind}
              data-testid={`note-${t.id}`}
              data-tip={tipOf(t)}
              role="button"
              tabIndex={0}
              aria-label={`${COMMENT_KIND_LABEL[t.kind]} by ${t.author}: ${t.text.slice(0, 80)}. Enter opens it${canMove ? ", arrow keys move it" : ""}.`}
              style={{ transform: `translate(${p.x}px, ${p.y}px) scale(${noteScale})`, width: NOTE_W }}
              onPointerDown={(e) => down(e, t)}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={cancel}
              onClick={(e) => {
                e.stopPropagation();
                if (!canMove) onOpen(t.id); // nobody to drag it: a click is all there is
              }}
              onDoubleClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => key(e, t)}
            >
              <div className="canvas-note-head">
                <span className={`ck ck-${t.kind}`}>{COMMENT_KIND_LABEL[t.kind]}</span>
                <span className="canvas-note-author">{t.author}</span>
              </div>
              <p className="canvas-note-text">{t.text}</p>
              {replies > 0 && (
                <div className="canvas-note-foot">
                  {replies} {replies === 1 ? "reply" : "replies"}
                </div>
              )}
            </div>
          );
        })}
        {draft && (
          // Kept at one size on screen whatever the zoom, with its corner on the point that was right-clicked.
          <div
            className="canvas-note-composer nopan nodrag nowheel"
            style={{ transform: `translate(${draft.at.x}px, ${draft.at.y}px) scale(${1 / zoom}) translate(${shift.x}px, ${shift.y}px)` }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.stopPropagation()}
            data-testid="canvas-note-composer"
          >
            <Composer
              kinds="comment"
              autoFocus
              submitLabel="Add note"
              placeholder="Write a note for this diagram…"
              askName={comments.me ? undefined : { value: name, onChange: setName }}
              testId="new-note"
              onSubmit={(text, kind) => comments.add(kind, { type: "diagram", id: diagramKey }, diagramKey, text, comments.me ? "" : name, draft.at)}
              onCancel={onDraftDone}
            />
          </div>
        )}
      </div>
    </ViewportPortal>
  );
}
