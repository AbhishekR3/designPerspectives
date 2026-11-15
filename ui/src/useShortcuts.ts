import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import { api } from "./api";
import type { CanvasHandle } from "./Canvas";
import type { AppState, Diagram, Selection } from "./types";
import { confirmDeleteElement } from "./dialogs";
import { dialogOpen } from "./fields";

/**
 * The global keyboard shortcuts, as four window listeners (registered in this order):
 * - Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y: undo, redo;
 * - editor-style keys: Ctrl/Cmd+C/X/V/D copy, cut, paste, duplicate; Ctrl/Cmd+0/=/+/- fit and zoom;
 *   Escape clears the selection; arrows nudge the selected box; F2 renames;
 * - Delete/Backspace removes the selection;
 * - Ctrl/Cmd+K opens the search box.
 * None of them act while a dialog is open or while typing (the conditions on the event target differ slightly per listener).
 */
export function useShortcuts(p: {
  state: AppState | null;
  diagram: Diagram | null;
  selection: Selection;
  setSelection: Dispatch<SetStateAction<Selection>>;
  setFocusName: Dispatch<SetStateAction<boolean>>;
  setRenameId: Dispatch<SetStateAction<string | null>>;
  setSearchOpen: Dispatch<SetStateAction<boolean>>;
  doHistory(dir: "undo" | "redo"): Promise<void>;
  mutate(fn: () => Promise<unknown>): Promise<boolean>;
  clipboard: RefObject<string | null>;
  pasteFrom(id: string): Promise<void>;
  cutElement(id: string): void;
  deleteRelationship(relId: string): void;
  canvasRef: RefObject<CanvasHandle | null>;
}) {
  const { state, diagram, selection, setSelection, setFocusName, setRenameId, setSearchOpen, doHistory, mutate, clipboard, pasteFrom, cutElement, deleteRelationship, canvasRef } = p;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialogOpen()) return;
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) doHistory("undo");
      else if ((k === "z" && e.shiftKey) || k === "y") doHistory("redo");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doHistory]);

  // Editor-style shortcuts: copy/cut/paste/duplicate, select-all is not offered; arrows nudge; zoom; escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialogOpen()) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable], .cm-editor")) return;
      if (state?.readOnly) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      const nodeId = selection?.type === "node" ? selection.id : null;
      const isElement = nodeId ? state?.elements.some((x) => x.id === nodeId) : false;
      if (mod && !e.altKey) {
        if (k === "c" && isElement) clipboard.current = nodeId;
        else if (k === "x" && isElement) cutElement(nodeId!);
        else if (k === "v" && clipboard.current && state?.elements.some((x) => x.id === clipboard.current)) pasteFrom(clipboard.current);
        else if (k === "d" && isElement) pasteFrom(nodeId!);
        else if (k === "0") canvasRef.current?.fit();
        else if (k === "=" || k === "+") canvasRef.current?.zoom(1);
        else if (k === "-") canvasRef.current?.zoom(-1);
        else return;
        e.preventDefault();
        return;
      }
      if (e.key === "Escape") setSelection(null);
      else if (e.key.startsWith("Arrow") && nodeId) {
        const step = e.shiftKey ? 40 : 10;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key] as number[];
        canvasRef.current?.nudge(nodeId, d[0], d[1]);
      } else if (e.key === "F2" && nodeId) {
        // Rename on the canvas.
        setRenameId(nodeId);
      } else if (e.key === "F2" && selection) setFocusName(true);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, state, pasteFrom, cutElement]);

  // Delete key removes the selection (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (dialogOpen()) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if (!selection || !state) return;
      const ghost = selection.type === "node" ? diagram?.nodes.find((n) => n.id === selection.id)?.ghost : diagram?.edges.find((x) => x.id === selection.id)?.ghost;
      if (ghost || diagram?.compare?.removed) return;
      if (selection.type === "node") {
        const el = state.elements.find((x) => x.id === selection.id);
        if (el)
          void confirmDeleteElement(el).then((yes) => yes && mutate(() => api.deleteElement(el.id)).then((ok) => ok && setSelection(null)));
      } else if (!selection.id.startsWith("derived:") && diagram?.level !== "flow") deleteRelationship(selection.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, state, diagram, mutate, deleteRelationship]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialogOpen()) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
