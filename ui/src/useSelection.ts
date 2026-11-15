import { useCallback, useState } from "react";
import type { Selection } from "./types";

/** The selected box or line, whether the panel should focus its name field, and the box being renamed on the canvas. */
export function useSelection() {
  const [selection, setSelection] = useState<Selection>(null);
  const [focusName, setFocusName] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const clearRename = useCallback(() => setRenameId(null), []);

  const select = (s: Selection) => {
    setFocusName(false);
    setSelection(s);
  };

  /** Select a new object and let the user type its name straight on the canvas. */
  function startRename(id: string) {
    setFocusName(false);
    setSelection({ type: "node", id });
    setRenameId(id); // consumed by the box when it opens its name field
  }

  return { selection, setSelection, focusName, setFocusName, renameId, setRenameId, clearRename, select, startRename };
}
