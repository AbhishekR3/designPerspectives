import { useEffect, useState } from "react";
import { LEFT_KEY, LEFT_OPEN_KEY, RIGHT_KEY, RIGHT_OPEN_KEY, storage } from "../storage";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The canvas column never gets narrower than this: the side panels give way first. */
export const MIN_CANVAS = 420;
/** Below this window width the side panels are not shown at all (the app is out of scope there, but it must not break). */
export const TINY = 760;
/** Below this window width the right panel starts collapsed (until the person opens it). */
export const COMPACT = 1100;
/** Width of the slim rail that stays when the right panel is collapsed. */
export const RAIL = 36;
const BOUNDS = { left: [180, 560], right: [240, 720] } as const;
const DEFAULTS = { left: 250, right: 320 } as const;
const RESIZER = 5;

const useWindowWidth = () => {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
};

/**
 * The sidebar and the right panel: open or collapsed, and their widths, remembered in localStorage.
 * Whatever was asked for, the canvas column keeps at least MIN_CANVAS px: the right panel gives way
 * first, then the sidebar (re-checked when the window is resized), and opening one panel closes the
 * other when both cannot fit. On a tiny window both are collapsed.
 */
export function usePanels() {
  const vw = useWindowWidth();
  const [leftPref, setLeftPref] = useState(storage.get(LEFT_OPEN_KEY) !== "0");
  const [rightPref, setRightPref] = useState(() => {
    const v = storage.get(RIGHT_OPEN_KEY);
    return v === null ? window.innerWidth >= COMPACT : v !== "0";
  });
  const [leftWant, setLeftWant] = useState(() => clamp(Number(storage.get(LEFT_KEY)) || DEFAULTS.left, BOUNDS.left[0], BOUNDS.left[1]));
  const [rightWant, setRightWant] = useState(() => clamp(Number(storage.get(RIGHT_KEY)) || DEFAULTS.right, BOUNDS.right[0], BOUNDS.right[1]));

  // What is shown: the wish, limited by the window.
  const tiny = vw < TINY;
  const room = (leftOpen: boolean, rightOpen: boolean) => vw - MIN_CANVAS - (leftOpen ? RESIZER : 0) - (rightOpen ? RESIZER : 0);
  const fitsBoth = room(true, true) >= BOUNDS.left[0] + BOUNDS.right[0];
  let leftOpen = !tiny && leftPref;
  let rightOpen = !tiny && rightPref;
  if (leftOpen && rightOpen && !fitsBoth) rightOpen = false;
  let left = leftOpen ? leftWant : 0;
  let right = rightOpen ? rightWant : RAIL;
  let over = left + right - room(leftOpen, rightOpen);
  if (over > 0 && rightOpen) {
    const cut = Math.min(over, right - BOUNDS.right[0]);
    right -= cut;
    over -= cut;
  }
  if (over > 0 && leftOpen) left -= Math.min(over, Math.max(0, left - BOUNDS.left[0]));
  if (leftOpen && left < BOUNDS.left[0]) leftOpen = false;

  const toggleLeft = () => {
    const next = !leftOpen;
    storage.set(LEFT_OPEN_KEY, next ? "1" : "0");
    setLeftPref(next);
    if (next && rightOpen && !fitsBoth) {
      storage.set(RIGHT_OPEN_KEY, "0");
      setRightPref(false);
    }
  };
  const toggleRight = () => {
    const next = !rightOpen;
    storage.set(RIGHT_OPEN_KEY, next ? "1" : "0");
    setRightPref(next);
    if (next && leftOpen && !fitsBoth) {
      storage.set(LEFT_OPEN_KEY, "0");
      setLeftPref(false);
    }
  };

  const startDrag = (side: "left" | "right") => (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const start = side === "left" ? left : right;
    const other = side === "left" ? right : left;
    const set = side === "left" ? setLeftWant : setRightWant;
    const [lo, hi] = BOUNDS[side];
    const k = side === "left" ? LEFT_KEY : RIGHT_KEY;
    // The canvas column keeps MIN_CANVAS px while dragging.
    const max = Math.max(lo, Math.min(hi, window.innerWidth - MIN_CANVAS - 2 * RESIZER - other));
    let last = start;
    const move = (ev: PointerEvent) => {
      last = clamp(start + (side === "left" ? ev.clientX - startX : startX - ev.clientX), lo, max);
      set(last);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      storage.set(k, String(Math.round(last)));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  /** Double-click on a resizer: back to the default width. */
  const resetLeft = () => {
    setLeftWant(DEFAULTS.left);
    storage.set(LEFT_KEY, String(DEFAULTS.left));
  };
  const resetRight = () => {
    setRightWant(DEFAULTS.right);
    storage.set(RIGHT_KEY, String(DEFAULTS.right));
  };
  const gridTemplateColumns = `${leftOpen ? `${left}px ${RESIZER}px` : "0 0"} minmax(0, 1fr) ${rightOpen ? `${RESIZER}px ${right}px` : `0 ${RAIL}px`}`;

  return { leftOpen, rightOpen, toggleLeft, toggleRight, startDrag, resetLeft, resetRight, gridTemplateColumns };
}
