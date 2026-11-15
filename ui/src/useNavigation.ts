import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { homeDiagramOf } from "./types";
import type { AppState, Diagram, Selection } from "./types";

/** The URL hash: `#/d/<diagram>`, plus `?m=<model version>&c=<compared version>` when not the main model. */
export interface HashState {
  key: string | null;
  model: string;
  compare: string | null;
}
export function fromHash(): HashState {
  const m = /^#\/d\/([^?]+)(?:\?(.*))?$/.exec(window.location.hash);
  const q = new URLSearchParams(m?.[2] ?? "");
  return { key: m ? decodeURIComponent(m[1]) : null, model: q.get("m") || "main", compare: q.get("c") || null };
}
export function keyFromHash(): string | null {
  return fromHash().key;
}
export function hashFor(key: string, model: string, compare: string | null): string {
  const q = new URLSearchParams();
  if (model !== "main") q.set("m", model);
  if (compare) q.set("c", compare);
  const qs = q.toString();
  return `#/d/${encodeURIComponent(key)}${qs ? `?${qs}` : ""}`;
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
  switchVersion(model: string, compare: string | null): Promise<void>;
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
      if (h.model !== v.model || h.compare !== v.compare) void switchVersion(h.model, h.compare);
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

/** Show an element: select it on this diagram, or open the diagram it belongs to. */
export function useReveal(
  state: AppState | null,
  diagram: Diagram | null,
  setKey: Dispatch<SetStateAction<string | null>>,
  setSelection: Dispatch<SetStateAction<Selection>>,
) {
  return useCallback(
    (id: string) => {
      if (!state) return;
      if (diagram?.nodes.some((n) => n.id === id)) {
        setSelection({ type: "node", id });
        return;
      }
      const el = state.elements.find((e) => e.id === id);
      if (!el) return;
      setKey(homeDiagramOf(el));
      setSelection({ type: "node", id });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setKey, setSelection are stable (state setters or refs), so it is safe to leave out of the dependencies
    [state, diagram],
  );
}
