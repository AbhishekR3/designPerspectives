import { useCallback, useRef, type RefObject } from "react";
import { api } from "../api";
import type { Pt, Style } from "../types";

/** Style keys that apply to boxes and to lines (Paste style keeps only the ones that fit). */
const NODE_STYLE_KEYS: (keyof Style)[] = ["fill", "text", "stroke", "strokeStyle", "strokeWidth", "fontSize"];
const EDGE_STYLE_KEYS: (keyof Style)[] = ["text", "stroke", "strokeStyle", "strokeWidth", "fontSize", "arrow", "arrowHead"];

type Mutate = (fn: () => Promise<unknown>) => Promise<boolean>;

/**
 * Copy/paste/duplicate of elements (the clipboard holds an element id; Paste adds a copy of it),
 * and Copy style / Paste style (like a format painter). Both are kept for the session.
 */
export function useClipboard(p: { keyRef: RefObject<string | null>; mutate: Mutate; onPasted(id: string): void }) {
  const { keyRef, mutate, onPasted } = p;
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
      // The caller shows the copy: selected here, or on its own diagram when it was copied from another one.
      if (ok) onPasted(newId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyRef, onPasted are stable (a ref and a state setter), so it is safe to leave out of the dependencies
    [mutate],
  );
  const pasteStyle = (target: string, kind: "node" | "edge") => {
    const s = styleClip.current;
    if (!s) return;
    const picked = Object.fromEntries(Object.entries(s).filter(([k]) => (kind === "node" ? NODE_STYLE_KEYS : EDGE_STYLE_KEYS).includes(k as keyof Style)));
    void mutate(() => api.style(target, Object.keys(picked).length ? (picked as Style) : null));
  };

  return { clipboard, styleClip, pasteFrom, pasteStyle };
}

export type Clipboard = ReturnType<typeof useClipboard>;
