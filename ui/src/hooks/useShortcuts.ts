import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { CanvasHandle, ContextTarget } from "../canvas/Canvas";
import type { NodeActions } from "../canvas/BoxesAndLines";
import { selectedNodeIds, type AppState, type Diagram, type Pt, type Selection } from "../types";
import { dialogOpen, isTyping } from "../panels/formParts";
import { diagramEditable, relationshipToDelete } from "../contextMenus";

/**
 * The global keyboard shortcuts, as window listeners (registered in this order):
 * - Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y: undo, redo;
 * - editor-style keys: Ctrl/Cmd+C/V/D copy, paste, duplicate; Ctrl/Cmd+0/=/+/- fit and zoom;
 *   Escape clears the selection; arrows nudge the selected box; F2 renames;
 * - Delete/Backspace removes the selection, one box, several boxes or a line (only where the right-click menu offers Delete);
 * - Ctrl/Cmd+K opens the search box; ? toggles the help card;
 * - Shift+F10 and the ContextMenu key open the right-click menu for the selected box or line, or for the canvas.
 * - system testing mode only: F8 continues the paused call, F10 continues and pauses the next one, F9 sets or takes away a breakpoint on the selected line or box.
 * None of them act while a dialog is open or while typing (`isTyping`).
 */
export function useShortcuts(p: {
  state: AppState | null;
  diagram: Diagram | null;
  selection: Selection;
  setSelection: Dispatch<SetStateAction<Selection>>;
  setFocusName: (on: boolean) => void;
  setRenameId: Dispatch<SetStateAction<string | null>>;
  setSearchOpen: Dispatch<SetStateAction<boolean>>;
  doHistory(dir: "undo" | "redo"): Promise<void>;
  clipboard: RefObject<string | null>;
  pasteFrom(id: string): Promise<void>;
  deleteRelationship(relId: string): void;
  nodeActions: NodeActions | null;
  toggleHelp(): void;
  canvasRef: RefObject<CanvasHandle | null>;
  openMenu(target: ContextTarget, at: Pt, keyboard?: boolean): void;
  /** The system testing mode's keys (absent or `on` false: not registered). */
  testing?: { on: boolean; continueCall(): void; step(): void; toggleBreakpoint(): void };
}) {
  const { state, diagram, selection, setSelection, setFocusName, setRenameId, setSearchOpen, doHistory, clipboard, pasteFrom, deleteRelationship, nodeActions, toggleHelp, canvasRef, openMenu } = p;
  const testingRef = useRef(p.testing);
  testingRef.current = p.testing;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialogOpen()) return;
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      if (isTyping(e.target)) return;
      if (!state || !diagramEditable(state, diagram)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) doHistory("undo");
      else if ((k === "z" && e.shiftKey) || k === "y") doHistory("redo");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doHistory, state, diagram]);

  // Editor-style shortcuts: copy/paste/duplicate, select-all is not offered; arrows nudge; zoom; escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialogOpen()) return;
      if (isTyping(e.target)) return;
      if (!state) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      // Looking is for everyone, a viewer too: fit, zoom, and Escape to clear the selection.
      if (mod && !e.altKey && (k === "0" || k === "=" || k === "+" || k === "-")) {
        if (k === "0") canvasRef.current?.fit();
        else canvasRef.current?.zoom(k === "-" ? -1 : 1);
        e.preventDefault();
        return;
      }
      if (e.key === "Escape" && !mod) {
        setSelection(null);
        e.preventDefault();
        return;
      }
      if (!diagramEditable(state, diagram)) return;
      const nodeId = selection?.type === "node" ? selection.id : null;
      const boxIds = selectedNodeIds(selection); // one box or several (arrows move them together)
      const isElement = nodeId ? state?.elements.some((x) => x.id === nodeId) : false;
      if (mod && !e.altKey) {
        // Text marked on the page (a description, a comment): Ctrl/Cmd+C copies that text, as everywhere else.
        if (k === "c" && !window.getSelection()?.isCollapsed) return;
        if (k === "c" && isElement) clipboard.current = nodeId;
        else if (k === "v" && clipboard.current && state?.elements.some((x) => x.id === clipboard.current)) pasteFrom(clipboard.current);
        else if (k === "d" && isElement) pasteFrom(nodeId!);
        else return;
        e.preventDefault();
        return;
      }
      if (e.key.startsWith("Arrow") && boxIds.length > 0) {
        const step = e.shiftKey ? 40 : 10;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key] as number[];
        canvasRef.current?.nudge(boxIds, d[0], d[1]);
      } else if (e.key === "F2" && nodeId) {
        // Rename on the canvas.
        setRenameId(nodeId);
      } else if (e.key === "F2" && selection && selection.type !== "nodes") setFocusName(true);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- canvasRef, clipboard, setFocusName, setRenameId, setSelection are stable (state setters or refs), so it is safe to leave out of the dependencies
  }, [selection, state, diagram, pasteFrom]);

  // Delete key removes the selection, exactly where the right-click menu offers Delete and with the same confirmation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (dialogOpen() || isTyping(e.target)) return;
      if (!selection || !state || !diagramEditable(state, diagram)) return;
      if (selection.type === "nodes") {
        // Several boxes: one question, one undo step. Only boxes that a single Delete would also remove.
        const ids = selection.ids.filter((id) => diagram?.nodes.some((n) => n.id === id && !n.ghost) && state.elements.some((x) => x.id === id));
        if (ids.length > 0) nodeActions?.removeMany(ids);
      } else if (selection.type === "node") {
        const n = diagram?.nodes.find((x) => x.id === selection.id);
        if (n && !n.ghost && state.elements.some((x) => x.id === n.id)) nodeActions?.remove(n.id);
      } else {
        const edge = diagram?.edges.find((x) => x.id === selection.id);
        const relId = edge && relationshipToDelete(edge, diagram);
        if (relId) deleteRelationship(relId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, state, diagram, nodeActions, deleteRelationship]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialogOpen() || isTyping(e.target)) return;
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        toggleHelp();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setSearchOpen is stable (a state setter or ref); toggleHelp only flips state, so a stale copy is harmless
  }, []);

  // Shift+F10 / the ContextMenu key: the right-click menu without a mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey))) return;
      if (dialogOpen() || isTyping(e.target) || !diagram || testingRef.current?.on) return;
      const spot = canvasRef.current?.menuSpot(selection);
      if (!spot) return;
      e.preventDefault();
      openMenu(spot.target, spot.client, true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- canvasRef is a ref and openMenu is stable (useCallback with no dependencies)
  }, [selection, diagram]);

  // System testing mode: F8 continue, F10 step, F9 breakpoint. No modifier keys (Shift+F10 opens the menu).
  const testingOn = !!p.testing?.on;
  useEffect(() => {
    if (!testingOn) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (e.key !== "F8" && e.key !== "F9" && e.key !== "F10") return;
      // A checkbox or a button that has the focus is not text being typed: the keys still work there.
      const plain = e.target instanceof HTMLInputElement && ["checkbox", "radio", "button"].includes(e.target.type);
      if (dialogOpen() || (isTyping(e.target) && !plain)) return;
      e.preventDefault();
      const t = testingRef.current;
      if (e.key === "F8") t?.continueCall();
      else if (e.key === "F10") t?.step();
      else t?.toggleBreakpoint();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [testingOn]);
}
