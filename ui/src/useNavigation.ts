import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { homeDiagramOf } from "./types";
import type { AppState, Diagram, Selection } from "./types";

/**
 * The URL hash: `#/d/<diagram>`, plus `?m=<model version>&c=<compared version>` when not the main model,
 * and `p=<page>` while a page covers the diagram (`decisions` or `decisions/<id>`). The diagram stays in the
 * hash under a page, so closing the page (or Back) returns to it, in the same model version.
 */
export interface HashState {
  key: string | null;
  model: string;
  compare: string | null;
  page: string | null;
}
export function fromHash(): HashState {
  const h = window.location.hash;
  const m = /^#\/d\/([^?]+)(?:\?(.*))?$/.exec(h);
  // A page with no diagram yet: `#/decisions...` (a link someone typed or shared).
  const bare = /^#\/(decisions(?:\/[^?]*)?)(?:\?(.*))?$/.exec(h);
  const q = new URLSearchParams(m?.[2] ?? bare?.[2] ?? "");
  return { key: m?.[1] ? decodeURIComponent(m[1]) : null, model: q.get("m") || "main", compare: q.get("c") || null, page: q.get("p") || bare?.[1] || null };
}
export function keyFromHash(): string | null {
  return fromHash().key;
}

/** The page shown over the diagram, as in the hash; hashes written for the diagram keep it. */
let currentPage: string | null = fromHash().page;

export function hashFor(key: string, model: string, compare: string | null, page: string | null = currentPage): string {
  const q = new URLSearchParams();
  if (model !== "main") q.set("m", model);
  if (compare) q.set("c", compare);
  if (page) q.set("p", page);
  const qs = q.toString().replace(/%2F/g, "/");
  return `#/d/${encodeURIComponent(key)}${qs ? `?${qs}` : ""}`;
}

/** The page over the diagram (null: the diagram itself). Opening one is a new history entry, so Back closes it. */
export function usePage(keyRef: RefObject<string | null>) {
  const [page, setPageState] = useState<string | null>(currentPage);
  useEffect(() => {
    const onHash = () => {
      currentPage = fromHash().page;
      setPageState(currentPage);
    };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("popstate", onHash);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("popstate", onHash);
    };
  }, []);
  const setPage = useCallback(
    (p: string | null, opts: { replace?: boolean } = {}) => {
      if (p === currentPage) return;
      currentPage = p;
      setPageState(p);
      const h = fromHash();
      const next = hashFor(keyRef.current ?? h.key ?? "landscape", h.model, h.compare, p);
      if (opts.replace) window.history.replaceState(null, "", next);
      else window.history.pushState(null, "", next);
    },
    [keyRef],
  );
  return { page, setPage };
}

/** The diagram on screen (its key, also in a ref for async code) and opening another one. */
export function useNavigation(setSelection: Dispatch<SetStateAction<Selection>>) {
  const [key, setKey] = useState<string | null>(keyFromHash());
  const keyRef = useRef(key);
  keyRef.current = key;

  const open = useCallback((k: string) => {
    setSelection(null);
    setKey(k);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setSelection is stable (a state setter or ref), so it is safe to leave out of the dependencies
  }, []);

  /** A change picked in the change list: open the diagram it is drawn on and select it. */
  const pickChange = (c: { id: string; type: string; homeKey: string | null }) => {
    if (!c.homeKey) return;
    if (c.homeKey !== key) setKey(c.homeKey);
    if (c.type === "element") setSelection({ type: "node", id: c.id });
    else if (c.type === "relationship") setSelection({ type: "edge", id: c.id });
    else setSelection(null);
  };

  return { key, setKey, keyRef, open, pickChange };
}

/**
 * Keeps the URL hash and the browser history in step with the diagram and the model version:
 * a new diagram is a new history entry, and Back/Forward (or an edited hash) switch back.
 */
export function useHashSync(p: {
  key: string | null;
  keyRef: RefObject<string | null>;
  setKey: Dispatch<SetStateAction<string | null>>;
  versionRef: RefObject<{ model: string; compare: string | null }>;
  loadDiagram(k: string): Promise<void>;
  switchVersion(model: string, compare: string | null, opts?: { key?: string | null }): Promise<void>;
  setSelection: Dispatch<SetStateAction<Selection>>;
  /** Reset when another diagram opens: the right-click menu and the flow player. */
  setMenu(m: null): void;
  setFlowStep(n: number | null): void;
  setPlaying(v: boolean): void;
}) {
  const { key, keyRef, setKey, versionRef, loadDiagram, switchVersion, setSelection, setMenu, setFlowStep, setPlaying } = p;
  const navStarted = useRef(false);

  useEffect(() => {
    if (!key) return;
    if (keyFromHash() !== key) {
      // A new diagram is a new history entry, so the browser Back/Forward buttons walk through diagrams.
      const first = !navStarted.current;
      const h = hashFor(key, versionRef.current.model, versionRef.current.compare);
      if (first) window.history.replaceState(null, "", h);
      else window.history.pushState(null, "", h);
    }
    navStarted.current = true;
    setMenu(null);
    setFlowStep(null);
    setPlaying(false);
    loadDiagram(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setFlowStep, setMenu, setPlaying, versionRef are stable (state setters or refs), so it is safe to leave out of the dependencies
  }, [key, loadDiagram]);

  useEffect(() => {
    const onHash = () => {
      const h = fromHash();
      const v = versionRef.current;
      // Another version (Back/Forward across a version switch, or an edited URL): switch to it and to the
      // diagram in the URL together, so the switch cannot rewrite the URL with the old diagram.
      if (h.model !== v.model || h.compare !== v.compare) {
        void switchVersion(h.model, h.compare, { key: h.key });
        return;
      }
      const k = h.key;
      if (k && k !== keyRef.current) {
        setSelection(null);
        setKey(k);
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyRef, setKey, setSelection, versionRef are stable (state setters or refs), so it is safe to leave out of the dependencies
  }, [switchVersion]);
}

/**
 * Show an element: select it on this diagram, or open the diagram it belongs to. With `home` it always opens
 * the diagram it belongs to (after a move, to see the element in its new place).
 */
export function useReveal(state: AppState | null, diagram: Diagram | null, setKey: Dispatch<SetStateAction<string | null>>, setSelection: Dispatch<SetStateAction<Selection>>) {
  return useCallback(
    (id: string, opts: { home?: boolean } = {}) => {
      if (!state) return;
      const el = state.elements.find((e) => e.id === id);
      if (diagram?.nodes.some((n) => n.id === id) && !(opts.home && el && diagram.key !== homeDiagramOf(el))) {
        setSelection({ type: "node", id });
        return;
      }
      if (!el) return;
      setKey(homeDiagramOf(el));
      setSelection({ type: "node", id });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setKey, setSelection are stable (state setters or refs), so it is safe to leave out of the dependencies
    [state, diagram],
  );
}
