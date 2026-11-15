import { useState } from "react";
import { LEFT_KEY, LEFT_OPEN_KEY, RIGHT_KEY, storage } from "./storage";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The sidebar (open or closed, width) and the right panel's width, remembered in localStorage. */
export function usePanels() {
  const [leftOpen, setLeftOpen] = useState(storage.get(LEFT_OPEN_KEY) !== "0");
  const [leftW, setLeftW] = useState(() => clamp(Number(storage.get(LEFT_KEY)) || 250, 180, 560));
  const [rightW, setRightW] = useState(() => clamp(Number(storage.get(RIGHT_KEY)) || 320, 240, 720));

  const toggleLeft = () => {
    storage.set(LEFT_OPEN_KEY, leftOpen ? "0" : "1");
    setLeftOpen(!leftOpen);
  };
  const startDrag = (side: "left" | "right") => (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const start = side === "left" ? leftW : rightW;
    const set = side === "left" ? setLeftW : setRightW;
    const [lo, hi, k] = side === "left" ? [180, 560, LEFT_KEY] : [240, 720, RIGHT_KEY];
    let last = start;
    const move = (ev: PointerEvent) => {
      last = clamp(start + (side === "left" ? ev.clientX - startX : startX - ev.clientX), lo, hi);
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
    setLeftW(250);
    storage.set(LEFT_KEY, "250");
  };
  const resetRight = () => {
    setRightW(320);
    storage.set(RIGHT_KEY, "320");
  };
  const gridTemplateColumns = `${leftOpen ? `${leftW}px 5px` : "0 0"} minmax(0, 1fr) 5px ${rightW}px`;

  return { leftOpen, toggleLeft, startDrag, resetLeft, resetRight, gridTemplateColumns };
}
