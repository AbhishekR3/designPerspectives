import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { api, ApiError, onForbidden, setContext } from "../api";
import { dialogOpen, isTyping } from "../panels/fields";
import { inLens, lensOverlay, pickLens, savedLens } from "./useLens";
import { lensKey, storage } from "../storage";
import { errorMessage, useErrorSlot, type ErrorAction } from "../common/notify";
import { fromHash, hashFor } from "./useNavigation";
import type { Filter, OverlaySpec } from "../overlays";
import type { AppState, ChangeSet, Diagram, Selection } from "../types";

type Version = { model: string; compare: string | null };
const versionKey = (v: Version) => `${v.model}|${v.compare ?? ""}`;

/** A model version in words, for messages ("draft "x"", "git version "main~2""). */
export function versionLabel(ref: string): string {
  if (ref === "main") return "the main model";
  if (ref === "base") return "the draft's base";
  if (ref.startsWith("draft:")) return `draft "${ref.slice("draft:".length)}"`;
  if (ref.startsWith("ref:")) return `git version "${ref.slice("ref:".length)}"`;
  return `"${ref}"`;
}

/** Replace the current history entry's hash (no new entry); nothing if it is already that. */
function replaceHash(h: string): void {
  if (window.location.hash !== h) window.history.replaceState(null, "", h);
}

/** A model version that cannot be opened (missing draft or git ref, bad version name, read-only). */
const unopenable = (e: unknown) => e instanceof ApiError && [403, 404, 422].includes(e.status);

/**
 * Server state: the model summary, the diagram on screen, the changes against the compared version,
 * the last error, and the model version every request works on (main, a draft or a git ref; sent as
 * headers by api.ts). All edits go through `mutate`, which reloads afterwards.
 *
 * Responses can arrive out of order, so every refresh takes a ticket (`epoch`) and only the newest
 * one may set state: a new refresh, the start of an edit or undo/redo, and a version switch each take
 * a new ticket, which silently drops whatever older requests return. Diagram requests also take a
 * ticket of their own (`diagSeq`), so only the newest one for the diagram on screen is shown.
 */
export function useModel(p: {
  keyRef: RefObject<string | null>;
  setKey: Dispatch<SetStateAction<string | null>>;
  setSelection: Dispatch<SetStateAction<Selection>>;
  setLensId: Dispatch<SetStateAction<string | null>>;
  overlay: OverlaySpec | null;
  setOverlay: Dispatch<SetStateAction<OverlaySpec | null>>;
  filters: Filter[];
  setFilters: Dispatch<SetStateAction<Filter[]>>;
}) {
  const { keyRef, setKey, setSelection, setLensId, setOverlay, setFilters } = p;
  const [state, setState] = useState<AppState | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const overlayRef = useRef(p.overlay);
  overlayRef.current = p.overlay;
  const filtersRef = useRef(p.filters);
  filtersRef.current = p.filters;
  const [diagram, setDiagram] = useState<Diagram | null>(null);
  // Model version shown (main or a draft) and the version it is compared with; sent with every request.
  const [version, setVersion] = useState<Version>(() => {
    const h = fromHash();
    setContext(h.model, h.compare);
    return { model: h.model, compare: h.compare };
  });
  const versionRef = useRef(version);
  versionRef.current = version;
  const [changes, setChanges] = useState<ChangeSet | null>(null);
  const [error, setError] = useErrorSlot();
  // The first load failed (shown full-screen, with Retry).
  const [loadError, setLoadError] = useState<string | null>(null);
  // Diagram and version switches in flight (edits are not counted: they have their own feedback). Shown as a thin loading bar.
  const [pending, setPending] = useState(0);
  const track = useCallback(async <T>(work: () => Promise<T>): Promise<T> => {
    setPending((n) => n + 1);
    try {
      return await work();
    } finally {
      setPending((n) => n - 1);
    }
  }, []);

  // Request tickets (see above), the version whose state last loaded (a diagram that fails to load only
  // sends the user to the landscape when its version itself loads), edits in flight, and the started flag.
  const epoch = useRef(0);
  const diagSeq = useRef(0);
  const committed = useRef<string | null>(null);
  const inFlight = useRef(0);
  const started = useRef(false);

  const applyVersion = (v: Version) => {
    setContext(v.model, v.compare);
    versionRef.current = v;
    setVersion(v);
  };

  /** Fix the lens, overlay and start diagram from the first state that loads. */
  const start = (s: AppState, v: Version) => {
    started.current = true;
    const l = pickLens(s, savedLens(s.root, s.me?.name));
    // Fix the choice now and remember it for this project: the default (Architect for an empty
    // model) must not flip to another lens when the first container is added and the page reloads.
    setLensId(l.id);
    storage.set(lensKey(s.root, s.me?.name), l.id);
    setOverlay(v.compare ? { kind: "changes" } : lensOverlay(l, s));
    if (!keyRef.current) {
      const first = s.diagrams.find((d) => inLens(l, d.level)) ?? s.diagrams[0];
      setKey(first?.key ?? "landscape");
    }
  };

  /** Load diagram `k` under ticket `ep`; shown only if nothing newer was asked for meanwhile. */
  const fetchDiagram = useCallback(async (k: string, ep: number) => {
    const my = ++diagSeq.current;
    const v = versionKey(versionRef.current);
    const current = () => my === diagSeq.current && ep === epoch.current && keyRef.current === k && versionKey(versionRef.current) === v;
    try {
      const d = await api.diagram(k);
      if (current()) setDiagram(d);
    } catch {
      // The diagram is gone (deleted, or not in this version): open the landscape. Not while the
      // version itself has not loaded: then the version's error is what counts.
      if (current() && committed.current === v) setKey("landscape");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyRef, setKey are stable (state setters or refs), so it is safe to leave out of the dependencies
  }, []);

  const loadDiagram = useCallback((k: string) => track(() => fetchDiagram(k, epoch.current)), [fetchDiagram, track]);

  /**
   * Reload the state, the changes and the diagram of the current version. Resolves with the state it
   * showed, or null when a newer request superseded it (then it shows nothing and reports no error).
   */
  const refresh = useCallback(async (): Promise<AppState | null> => {
    const ep = ++epoch.current;
    const v = versionRef.current;
    try {
      const s = await api.state();
      if (ep !== epoch.current) return null;
      const ch = v.compare ? await api.changes() : null;
      if (ep !== epoch.current) return null;
      setState(s);
      setChanges(ch);
      committed.current = versionKey(v);
      if (!started.current) start(s, v);
      if (keyRef.current) await fetchDiagram(keyRef.current, ep);
      return s;
    } catch (e) {
      if (ep !== epoch.current) return null;
      throw e;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyRef and the setters used by start are stable (state setters or refs), so it is safe to leave out of the dependencies
  }, [fetchDiagram]);

  /** "Retry" for a view that could not be refreshed. */
  const retryRefresh: ErrorAction = useMemo(() => {
    const action: ErrorAction = {
      label: "Retry",
      run: () =>
        void refresh().then(
          () => setError(null),
          (e) => setError(`The view could not be refreshed: ${errorMessage(e)}`, action),
        ),
    };
    return action;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setError is stable (a state setter or ref), so it is safe to leave out of the dependencies
  }, [refresh]);

  // The last version that loaded, with its overlay, filters and diagram: what a failed switch goes back to.
  // Kept while switches overlap, so a second switch cannot make a not-yet-loaded version the way back.
  const restorePoint = useRef<{ v: Version; key: string | null; overlay: OverlaySpec | null; filters: Filter[] } | null>(null);
  const switchSeq = useRef(0);

  /**
   * Show another model version (main, a draft or a git ref), optionally compared with another one, and
   * with `key` another diagram too (a changed URL). If it cannot be loaded, everything goes back to the
   * version shown before (request headers, overlay, filters, diagram and URL) and the error says why.
   */
  const switchRaw = useCallback(
    async (model: string, compare: string | null, opts: { key?: string | null } = {}) => {
      const my = ++switchSeq.current;
      restorePoint.current ??= { v: versionRef.current, key: keyRef.current, overlay: overlayRef.current, filters: filtersRef.current };
      const prev = restorePoint.current;
      const nextKey = opts.key ?? keyRef.current;
      applyVersion({ model, compare });
      setSelection(null);
      setFilters((fs) => fs.filter((f) => f.spec !== "@changes"));
      setOverlay((o) => (compare ? { kind: "changes" } : o?.kind === "changes" ? null : o));
      if (nextKey !== keyRef.current) {
        keyRef.current = nextKey;
        setKey(nextKey);
      }
      if (nextKey) replaceHash(hashFor(nextKey, model, compare));
      try {
        // A null answer means another reload (an edit made meanwhile) took over: ask again, so this
        // switch still learns whether the version loads.
        while (!(await refresh()) && my === switchSeq.current);
        if (my !== switchSeq.current) return;
        restorePoint.current = null;
        setError(null);
      } catch (e) {
        if (my !== switchSeq.current) return;
        restorePoint.current = null;
        applyVersion(prev.v);
        setOverlay(prev.overlay);
        setFilters(prev.filters);
        if (prev.key) replaceHash(hashFor(prev.key, prev.v.model, prev.v.compare));
        if (prev.key !== keyRef.current) {
          keyRef.current = prev.key;
          setKey(prev.key);
        }
        const what = model !== prev.v.model || !compare ? `open ${versionLabel(model)}` : `compare with ${versionLabel(compare)}`;
        setError(`Could not ${what}: ${errorMessage(e)}`);
        // Requests of the version shown before were dropped by this switch: load it again.
        void refresh().catch(() => undefined);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyRef, setError, setFilters, setKey, setOverlay, setSelection are stable (state setters or refs), so it is safe to leave out of the dependencies
    [refresh],
  );
  const switchVersion = useCallback((model: string, compare: string | null, opts: { key?: string | null } = {}) => track(() => switchRaw(model, compare, opts)), [switchRaw, track]);

  /** Run an edit, then reload. True when the edit was made (even if the reload after it failed). */
  const mutate = useCallback(
    async (fn: () => Promise<unknown>) => {
      // Responses already on their way may predate this edit: drop them (the reload after it shows it).
      ++epoch.current;
      inFlight.current++;
      try {
        try {
          await fn();
        } catch (e) {
          setError(errorMessage(e));
          await refresh().catch(() => undefined);
          return false;
        }
        setError(null);
        try {
          await refresh();
        } catch (e) {
          setError(`Saved, but the view could not be refreshed: ${errorMessage(e)}`, retryRefresh);
        }
        return true;
      } finally {
        inFlight.current--;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setError is stable (a state setter or ref), so it is safe to leave out of the dependencies
    [refresh, retryRefresh],
  );

  // First load. A version in the URL that cannot be opened falls back to the main model with a notice;
  // only a main model that cannot load is shown full-screen (with Retry).
  const firstLoad = useCallback(async () => {
    setLoadError(null);
    try {
      await refresh();
      return;
    } catch (e) {
      const v = versionRef.current;
      if ((v.model === "main" && !v.compare) || !unopenable(e)) {
        setLoadError(errorMessage(e));
        return;
      }
      applyVersion({ model: "main", compare: null });
      if (keyRef.current) replaceHash(hashFor(keyRef.current, "main", null));
      setError(`Could not open ${versionLabel(v.model !== "main" ? v.model : v.compare!)}: ${errorMessage(e)}. Showing the main model.`);
    }
    try {
      await refresh();
    } catch (e) {
      setLoadError(errorMessage(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyRef, setError are stable (state setters or refs), so it is safe to leave out of the dependencies
  }, [refresh]);

  useEffect(() => {
    void firstLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A change the server refused (403: the role or the version no longer allows it): the caller shows the
  // server's message; reloading the state here makes the controls match what is allowed now.
  useEffect(() => {
    onForbidden(() => void refresh().catch(() => undefined));
    return () => onForbidden(null);
  }, [refresh]);

  /** Undo or redo the last edit of this model version. */
  const doHistory = useCallback(
    async (dir: "undo" | "redo") => {
      ++epoch.current;
      inFlight.current++;
      try {
        try {
          await (dir === "undo" ? api.undo() : api.redo());
          setError(null);
        } catch (e) {
          setError(errorMessage(e));
        }
        await refresh().catch(() => undefined);
      } finally {
        inFlight.current--;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setError is stable (a state setter or ref), so it is safe to leave out of the dependencies
    [refresh],
  );

  // The model can change on disk (git checkout, another tab, the CLI). When the window comes back,
  // ask for the state once and reload only if it changed. Not while an edit or a version switch is
  // under way, nor while the user types or a dialog is open: then the next focus checks again.
  useEffect(() => {
    const check = async () => {
      const cur = stateRef.current;
      if (!cur || inFlight.current > 0 || restorePoint.current || dialogOpen() || isTyping(document.activeElement)) return;
      const ep = epoch.current;
      const v = versionRef.current;
      let s: AppState;
      try {
        s = await api.state();
      } catch (e) {
        // The version shown is gone (a draft discarded elsewhere): back to the main model.
        if (ep === epoch.current && v.model !== "main" && e instanceof ApiError && e.status === 404) {
          await switchVersion("main", null);
          setError(`Could not open ${versionLabel(v.model)}: ${errorMessage(e)}. Showing the main model.`);
        }
        return;
      }
      if (ep !== epoch.current || inFlight.current > 0) return; // something newer has reloaded already
      if (s.version === cur.version && JSON.stringify(s) === JSON.stringify(cur)) return;
      try {
        await refresh();
      } catch (e) {
        setError(`The view could not be refreshed: ${errorMessage(e)}`, retryRefresh);
      }
    };
    const onFocus = () => void check();
    const onVisible = () => document.visibilityState === "visible" && void check();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setError is stable (a state setter or ref), so it is safe to leave out of the dependencies
  }, [refresh, switchVersion, retryRefresh]);

  return { state, diagram, version, versionRef, loading: pending > 0, changes, error, loadError, retryLoad: firstLoad, setError, loadDiagram, refresh, switchVersion, mutate, doHistory };
}
