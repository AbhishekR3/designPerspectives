// The checklist's server state and actions (DEC-084), for the card, the top bar and the bell.
// Like the comments: it reloads when the model changes (rule results follow the model) and when the window regains focus.

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { run } from "../common/notify";
import { dialogOpen, isTyping } from "../panels/formParts";
import type { AppState, ChecklistItem, ChecklistKind, ChecklistResponse, ChecklistStatus, CommentTarget } from "../types";

/** What a change to an item can say (the same as the PATCH route). */
export type ChecklistPatch = {
  text?: string;
  kind?: ChecklistKind;
  section?: string;
  status?: ChecklistStatus;
  answer?: string;
  target?: CommentTarget | null;
};

/** Ask the card to start an add: `target` is what it is about (null: nothing). `seq` changes for each request. */
export interface ChecklistAsk {
  seq: number;
  target: CommentTarget | null;
}

export interface ChecklistApi {
  data: ChecklistResponse | null;
  /** The role may change the checklist (architects and engineers, not a --read-only server). */
  can: boolean;
  /** Open items, for the badge. */
  open: number;
  ask: ChecklistAsk | null;
  askFor(target: CommentTarget | null): void;
  /** The card has handled the request. */
  clearAsk(): void;
  reload(): Promise<void>;
  add(body: { text: string; kind?: ChecklistKind; section?: string; target?: CommentTarget }): Promise<ChecklistItem | undefined>;
  patch(id: string, patch: ChecklistPatch): Promise<boolean>;
  remove(id: string): Promise<boolean>;
  addStarter(id: string): Promise<boolean>;
  clear(status: "done" | "skipped"): Promise<boolean>;
}

export function useChecklist(state: AppState | null): ChecklistApi {
  const [data, setData] = useState<ChecklistResponse | null>(null);
  const [ask, setAsk] = useState<ChecklistAsk | null>(null);
  const seq = useRef(0);
  const loaded = !!state;
  const version = state?.version;
  const ref = state?.model.ref;

  const reload = useCallback(async () => {
    const my = ++seq.current;
    try {
      const r = await api.checklist();
      if (my === seq.current) setData(r);
    } catch {
      /* keep what is shown: a failed refresh is not worth an error of its own */
    }
  }, []);
  useEffect(() => {
    if (loaded) void reload();
  }, [loaded, version, ref, reload]);
  useEffect(() => {
    // Not while someone is typing or a dialog is open: an item being written must not be disturbed.
    const onFocus = () => !isTyping(document.activeElement) && !dialogOpen() && void reload();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);

  const act = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
      const done = await run(fn);
      await reload();
      return done;
    },
    [reload],
  );

  return {
    data,
    can: state?.can.checklist ?? false,
    open: data?.summary.open ?? 0,
    ask,
    askFor: (target) => setAsk((a) => ({ seq: (a?.seq ?? 0) + 1, target })),
    clearAsk: () => setAsk(null),
    reload,
    add: (body) => act(() => api.checklistAdd(body)),
    patch: async (id, patch) => (await act(() => api.checklistPatch(id, patch))) !== undefined,
    remove: async (id) => (await act(() => api.checklistDelete(id))) !== undefined,
    addStarter: async (id) => (await act(() => api.checklistStarter(id))) !== undefined,
    clear: async (status) => (await act(() => api.checklistClear(status))) !== undefined,
  };
}
