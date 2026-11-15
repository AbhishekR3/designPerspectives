import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { api, ApiError, setContext } from "./api";
import { inLens, lensOverlay } from "./useLens";
import { errorMessage, useErrorSlot } from "./notify";
import { fromHash, hashFor } from "./useNavigation";
import type { Filter, OverlaySpec } from "./overlays";
import type { AppState, ChangeSet, Diagram, Selection } from "./types";

/**
 * Server state: the model summary, the diagram on screen, the changes against the compared version,
 * the last error, and the model version every request works on (main, a draft or a git ref; sent as
 * headers by api.ts). All edits go through `mutate`, which reloads afterwards.
 */
export function useModel(p: {
  keyRef: RefObject<string | null>;
  setKey: Dispatch<SetStateAction<string | null>>;
  setSelection: Dispatch<SetStateAction<Selection>>;
  lensId: string;
  setOverlay: Dispatch<SetStateAction<OverlaySpec | null>>;
  setFilters: Dispatch<SetStateAction<Filter[]>>;
}) {
  const { keyRef, setKey, setSelection, lensId, setOverlay, setFilters } = p;
  const [state, setState] = useState<AppState | null>(null);
  const [diagram, setDiagram] = useState<Diagram | null>(null);
  // Model version shown (main or a draft) and the version it is compared with; sent with every request.
  const [version, setVersion] = useState<{ model: string; compare: string | null }>(() => {
    const h = fromHash();
    setContext(h.model, h.compare);
    return { model: h.model, compare: h.compare };
  });
  const versionRef = useRef(version);
  versionRef.current = version;
  const [changes, setChanges] = useState<ChangeSet | null>(null);
  const [error, setError] = useErrorSlot();

  const loadDiagram = useCallback(async (k: string) => {
    try {
      const d = await api.diagram(k);
      if (keyRef.current === k) setDiagram(d);
    } catch {
      if (keyRef.current === k) setKey("landscape");
    }
  }, []);

  const refresh = useCallback(async () => {
    const s = await api.state();
    setState(s);
    setChanges(versionRef.current.compare ? await api.changes() : null);
    if (keyRef.current) await loadDiagram(keyRef.current);
  }, [loadDiagram]);

  /** Show another model version (main or a draft), optionally compared with another one. */
  const switchVersion = useCallback(
    async (model: string, compare: string | null) => {
      setContext(model, compare);
      const v = { model, compare };
      versionRef.current = v;
      setVersion(v);
      setSelection(null);
      setFilters((fs) => fs.filter((f) => f.spec !== "@changes"));
      setOverlay((o) => (compare ? { kind: "changes" } : o?.kind === "changes" ? null : o));
      if (keyRef.current) window.history.replaceState(null, "", hashFor(keyRef.current, model, compare));
      try {
        await refresh();
        setError(null);
      } catch (e) {
        // The draft is gone (discarded elsewhere, or an old link): fall back to the main model.
        if (model !== "main" && e instanceof ApiError && e.status === 404) await switchVersion("main", null);
        else setError(errorMessage(e));
      }
    },
    [refresh],
  );

  const mutate = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        setError(null);
        await refresh();
        return true;
      } catch (e) {
        setError(errorMessage(e));
        await refresh().catch(() => undefined);
        return false;
      }
    },
    [refresh],
  );

  // First load: pick the starting diagram and overlay from the lens.
  useEffect(() => {
    api
      .state()
      .then(async (s) => {
        setState(s);
        if (versionRef.current.compare) setChanges(await api.changes());
        const l = s.lenses.find((x) => x.id === lensId) ?? s.lenses[0];
        setOverlay(versionRef.current.compare ? { kind: "changes" } : lensOverlay(l, s));
        if (!keyRef.current) {
          const first = s.diagrams.find((d) => inLens(l, d.level)) ?? s.diagrams[0];
          setKey(first?.key ?? "landscape");
        }
      })
      .catch((e) => {
        if (versionRef.current.model !== "main" && e instanceof ApiError && e.status === 404) switchVersion("main", null);
        else setError(String(e));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Undo or redo the last edit of this model version. */
  const doHistory = useCallback(
    async (dir: "undo" | "redo") => {
      try {
        await (dir === "undo" ? api.undo() : api.redo());
        setError(null);
      } catch (e) {
        setError(errorMessage(e));
      }
      await refresh().catch(() => undefined);
    },
    [refresh],
  );

  return { state, setState, diagram, version, versionRef, changes, error, setError, loadDiagram, refresh, switchVersion, mutate, doHistory };
}
