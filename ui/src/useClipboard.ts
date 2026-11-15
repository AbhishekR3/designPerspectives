import { useCallback, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";
import { api } from "./api";
import type { AppState, Pt, Selection, Style } from "./types";
import { confirmDialog } from "./dialogs";

/** Style keys that apply to boxes and to lines (Paste style keeps only the ones that fit). */
const NODE_STYLE_KEYS: (keyof Style)[] = ["fill", "text", "stroke", "strokeStyle", "strokeWidth", "fontSize"];
const EDGE_STYLE_KEYS: (keyof Style)[] = ["text", "stroke", "strokeStyle", "strokeWidth", "fontSize", "arrow", "arrowHead"];

type Mutate = (fn: () => Promise<unknown>) => Promise<boolean>;

/**
 * Copy/cut/paste/duplicate of elements (the clipboard holds an element id; Paste adds a copy of it),
 * and Copy style / Paste style (like a format painter). Both are kept for the session.
 */
export function useClipboard(p: {
  state: AppState | null;
  keyRef: RefObject<string | null>;
  mutate: Mutate;
  setSelection: Dispatch<SetStateAction<Selection>>;
}) {
  const { state, keyRef, mutate, setSelection } = p;
  const clipboard = useRef<string | null>(null);
  /** Copy style / Paste style (like a format painter), kept for the session. */
  const styleClip = useRef<Style | null>(null);

  /** Add a copy of an element; with `at`, at that point of the current diagram. */
  const pasteFrom = useCallback(
    async (id: string, at?: Pt) => {
      let newId = "";
      const k = keyRef.current;
      const ok = await mutate(async () => {
        newId = (await api.duplicate(id, at && k ? { diagramKey: k, position: at } : undefined)).id;
      });
      if (ok) setSelection({ type: "node", id: newId });
    },
    [mutate],
  );
  /** Cut: remember the element, then delete it (Paste adds a copy of it back). */
  const cutElement = useCallback(
    (id: string) => {
      const el = state?.elements.find((x) => x.id === id);
      if (!el) return;
      clipboard.current = id;
      void confirmDialog({ title: `Cut "${el.name}"?`, message: "It is removed now; Paste adds a copy of it.", confirmLabel: "Cut", danger: true }).then(
        (yes) => yes && mutate(() => api.deleteElement(el.id)).then((ok) => ok && setSelection(null)),
      );
    },
    [state, mutate],
  );

  const pasteStyle = (target: string, kind: "node" | "edge") => {
    const s = styleClip.current;
    if (!s) return;
    const picked = Object.fromEntries(Object.entries(s).filter(([k]) => (kind === "node" ? NODE_STYLE_KEYS : EDGE_STYLE_KEYS).includes(k as keyof Style)));
    void mutate(() => api.style(target, Object.keys(picked).length ? (picked as Style) : null));
  };

  return { clipboard, styleClip, pasteFrom, cutElement, pasteStyle };
}

export type Clipboard = ReturnType<typeof useClipboard>;
