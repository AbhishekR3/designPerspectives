import { useCallback, useMemo, useState } from "react";
import type { NodeDecor } from "./Canvas";
import { decodeSpec, formatMoney, matchesFilter, overlayOf, specExists, specLabel, techColors, type Filter, type OverlaySpec } from "./overlays";
import { run } from "./notify";
import { lensKey, LENS_KEY, storage } from "./storage";
import type { AppState, Diagram, DiagramLevel, DiagramNode, Lens, Level } from "./types";

export const inLens = (lens: Lens, level: DiagramLevel) => level === "flow" || level === "connector" || lens.visibleLevels.includes(level as Level);

/** The overlay a lens turns on by default, if it still exists. */
export function lensOverlay(l: Lens, s: AppState): OverlaySpec | null {
  const spec = decodeSpec(l.defaultOverlay);
  const groups = s.tagGroups.filter((g) => !l.hiddenTagGroups.includes(g.name));
  return spec && specExists(spec, s, groups) ? spec : null;
}

/** The lens to start in: the saved one if it still exists, else the server's default. */
export function pickLens(s: AppState, saved: string | null): Lens {
  return s.lenses.find((l) => l.id === saved) ?? s.lenses.find((l) => l.id === s.defaultLens) ?? s.lenses[0];
}

/** The lens remembered for this project (and this person, with sign-in); without sign-in, else the one remembered before lenses were kept per project. */
export const savedLens = (root: string, user?: string | null): string | null => storage.get(lensKey(root, user)) ?? (user ? null : storage.get(LENS_KEY));

/** The chosen lens (remembered in localStorage per project), the colour overlay and the Focus/Hide filters. */
export function useLensState() {
  // Null until the first load resolves it (see `pickLens`, `savedLens`).
  const [lensId, setLensId] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<OverlaySpec | null>(null);
  const [filters, setFilters] = useState<Filter[]>([]);
  return { lensId, setLensId, overlay, setOverlay, filters, setFilters };
}

/** The lens in use, the overlay that applies to it, how each box is decorated, and choosing a lens. */
export function useLens(p: {
  state: AppState | null;
  /** Reload the model (see useModel); resolves with the state shown, or null when a newer reload took over. */
  refresh(): Promise<AppState | null>;
  diagram: Diagram | null;
  open(k: string): void;
  lensState: ReturnType<typeof useLensState>;
}) {
  const { state, refresh, diagram, open } = p;
  const { lensId, setLensId, overlay, setOverlay, filters } = p.lensState;

  const lens: Lens | null = useMemo(
    () => (state ? pickLens(state, lensId) : null),
    [state, lensId],
  );

  const chooseLens = (id: string) => {
    if (!state) return;
    const l = state.lenses.find((x) => x.id === id);
    if (!l) return;
    setLensId(id);
    storage.set(lensKey(state.root, state.me?.name), id);
    setOverlay(lensOverlay(l, state));
    if (diagram && !inLens(l, diagram.level)) {
      const first = state.diagrams.find((d) => inLens(l, d.level));
      if (first) open(first.key);
    }
  };

  // Overlay colour, Focus/Hide filters and cost label of each element on the canvas.
  const techs = useMemo(() => (diagram ? techColors(diagram) : new Map<string, string>()), [diagram]);
  const activeOverlay = useMemo(() => {
    if (!state || !lens || !overlay) return null;
    const groups = state.tagGroups.filter((g) => !lens.hiddenTagGroups.includes(g.name));
    return specExists(overlay, state, groups) ? overlay : null;
  }, [state, lens, overlay]);
  const decorate = useCallback(
    (n: DiagramNode): NodeDecor => {
      const isEl = n.kind !== "stage" && n.kind !== "file";
      if (!state || !isEl) return { overlay: null, hidden: false, focused: false, outOfFocus: false, costLabel: null };
      let ov: NodeDecor["overlay"] = null;
      if (activeOverlay) {
        const o = overlayOf(activeOverlay, n, state, techs);
        ov = { group: specLabel(activeOverlay), value: o.key, chip: o.chip, color: o.color };
      }
      const focusFs = filters.filter((f) => f.mode === "focus");
      const focused = focusFs.some((f) => matchesFilter(f, n, state, techs));
      return {
        overlay: ov,
        hidden: filters.some((f) => f.mode === "hide" && matchesFilter(f, n, state, techs)),
        focused,
        outOfFocus: focusFs.length > 0 && !focused,
        costLabel: n.cost?.length || n.costRollup > 0 ? `${formatMoney(n.costRollup, state.costSettings.currency)}/mo` : null,
      };
    },
    [state, activeOverlay, filters, techs],
  );

  function chooseLensAfterSave(id: string) {
    // `state` here predates the save: reload (with the compared version's changes) to see the saved lens.
    void run(async () => {
      const s = await refresh();
      const l = s?.lenses.find((x) => x.id === id);
      if (!s || !l) return;
      setLensId(id);
      storage.set(lensKey(s.root, s.me?.name), id);
      setOverlay(lensOverlay(l, s));
    });
  }

  return { lens, chooseLens, chooseLensAfterSave, activeOverlay, decorate };
}
