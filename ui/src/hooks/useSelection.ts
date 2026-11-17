import { useCallback, useRef, useState } from "react";
import type { Selection } from "../types";

/**
 * The selected box(es) or line, whether the panel should focus its name field, and the box being renamed on the canvas.
 * `fresh` holds the boxes added in this session that have not been renamed yet: their first rename also
 * gives them a readable ID (see `renameElement` in selectionActions.ts).
 */
export function useSelection() {
  const [selection, setSelection] = useState<Selection>(null);
  // A count, not a flag: asking again for the same selection (F2 a second time) focuses the field again. 0 is "not asked".
  const [focusName, setFocusCount] = useState(0);
  const setFocusName = useCallback((on: boolean) => setFocusCount((n) => (on ? n + 1 : 0)), []);
  const [renameId, setRenameId] = useState<string | null>(null);
  const fresh = useRef(new Set<string>());
  const clearRename = useCallback(() => setRenameId(null), []);

  const select = (s: Selection) => {
    setFocusName(false);
    setSelection(s);
  };

  /** Select a new object and let the user type its name straight on the canvas. */
  function startRename(id: string) {
    fresh.current.add(id);
    setFocusName(false);
    setSelection({ type: "node", id });
    setRenameId(id); // consumed by the box when it opens its name field
  }

  return { selection, setSelection, focusName, setFocusName, renameId, setRenameId, clearRename, select, startRename, fresh };
}
