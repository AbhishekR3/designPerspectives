import { useEffect, useLayoutEffect, useState } from "react";

/** How much of each edge of the canvas is covered by floating controls (the top bars, the palette, the dock, the zoom buttons). */
export interface Insets {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/** Space kept between the covered area and whatever is placed in the free area. */
const GAP = 12;
/** No side may be reported as covering more than this share of the canvas. */
const MAX_SHARE = 0.45;

/**
 * The free area of a canvas, as insets from its edges. Floating controls mark the side they sit on with
 * `data-occludes="top|left|bottom|right"` (the zoom buttons of the canvas library are found by their class).
 * `root` is the element that contains the canvas and the controls.
 */
export function canvasInsets(root: HTMLElement | null): Insets {
  const out: Insets = { top: 0, left: 0, bottom: 0, right: 0 };
  if (!root) return out;
  const box = root.getBoundingClientRect();
  const nodes = [...root.querySelectorAll<HTMLElement>("[data-occludes]"), ...root.querySelectorAll<HTMLElement>(".react-flow__controls")];
  for (const el of nodes) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const side = el.dataset.occludes ?? "right";
    if (side === "top") out.top = Math.max(out.top, r.bottom - box.top + GAP);
    else if (side === "bottom") out.bottom = Math.max(out.bottom, box.bottom - r.top + GAP);
    else if (side === "left") out.left = Math.max(out.left, r.right - box.left + GAP);
    else out.right = Math.max(out.right, box.right - r.left + GAP);
  }
  const cap = (v: number, total: number) => Math.round(Math.min(v, total * MAX_SHARE));
  return { top: cap(out.top, box.height), bottom: cap(out.bottom, box.height), left: cap(out.left, box.width), right: cap(out.right, box.width) };
}

/** The size of an element, kept up to date (null until it is mounted). Pass the element itself (from a callback ref held in state). */
export function useElementSize(el: HTMLElement | null): { w: number; h: number } | null {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    if (!el) return;
    const read = () => setSize((s) => (s && s.w === el.clientWidth && s.h === el.clientHeight ? s : { w: el.clientWidth, h: el.clientHeight }));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return size;
}

/**
 * Publish the free area of `root` as the CSS variables --inset-top/left/bottom/right (px) on it, for the
 * cards that are centred in it (the first-run card, empty-diagram hints). Measured after every render and
 * whenever a floating control or the canvas changes size.
 */
export function useInsetVars(root: HTMLElement | null): void {
  useEffect(() => {
    if (!root) return;
    let frame = 0;
    const apply = () => {
      frame = 0;
      const i = canvasInsets(root);
      for (const k of ["top", "left", "bottom", "right"] as const) {
        const v = `${i[k]}px`;
        if (root.style.getPropertyValue(`--inset-${k}`) !== v) root.style.setProperty(`--inset-${k}`, v);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const ro = new ResizeObserver(schedule);
    ro.observe(root);
    const watch = () => {
      for (const el of root.querySelectorAll("[data-occludes], .react-flow__controls")) ro.observe(el);
    };
    watch();
    // Floating controls come and go (the palette, the dock, the flow card): look again when the tree changes.
    const mo = new MutationObserver(() => {
      watch();
      schedule();
    });
    mo.observe(root, { childList: true, subtree: true });
    apply();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      ro.disconnect();
      mo.disconnect();
    };
  }, [root]);
}
