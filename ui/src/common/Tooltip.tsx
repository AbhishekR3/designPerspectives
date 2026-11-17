/**
 * One styled tooltip for the whole app. It listens on the document for the pointer resting on an element with `data-tip`
 * (preferred) or `title`, so every existing title gets the same look without a change at the place that sets it.
 * Why not the native one: it appears late, cannot hold several lines, ignores the theme and is not shown over a canvas being dragged.
 *
 * While the bubble is shown the element's `title` is moved into `data-tip-saved` (the native tooltip would show on top of ours)
 * and put back when the bubble goes, so lookups by title keep working whenever nothing is hovered.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";

const DELAY_MS = 400;
const SELECTOR = "[data-tip],[title]";
const GAP = 8;
const MARGIN = 8;

interface Shown {
  text: string;
  rect: DOMRect;
}

/** The element a tooltip belongs to, from whatever the pointer is over. SVG `<title>` children are elements, not attributes, so they never match. */
function tipOwner(from: EventTarget | null): HTMLElement | null {
  if (!(from instanceof Element)) return null;
  const el = from.closest<HTMLElement>(SELECTOR);
  return el && (el.dataset.tip || el.getAttribute("title")) ? el : null;
}

export function Tooltip() {
  const [shown, setShown] = useState<Shown | null>(null);
  const bubble = useRef<HTMLDivElement>(null);
  // What is hovered (maybe not shown yet) and which element has had its title taken.
  const owner = useRef<HTMLElement | null>(null);
  const taken = useRef<{ el: HTMLElement; title: string } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const giveTitleBack = () => {
      const t = taken.current;
      taken.current = null;
      // If the page set a new title meanwhile, that one wins.
      if (t && t.el.isConnected && !t.el.hasAttribute("title")) t.el.setAttribute("title", t.title);
    };
    const hide = () => {
      window.clearTimeout(timer.current);
      timer.current = undefined;
      owner.current = null;
      giveTitleBack();
      setShown(null);
    };
    const show = (el: HTMLElement) => {
      timer.current = undefined;
      if (!el.isConnected) return;
      const title = el.getAttribute("title");
      const text = el.dataset.tip || title || "";
      if (!text) return;
      if (title !== null) {
        giveTitleBack();
        taken.current = { el, title };
        el.removeAttribute("title");
      }
      setShown({ text, rect: el.getBoundingClientRect() });
    };
    const arm = (el: HTMLElement) => {
      owner.current = el;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => show(el), DELAY_MS);
    };

    const over = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const el = tipOwner(e.target);
      if (el === owner.current) return;
      hide();
      // Never while a button is down: that is a drag or a click in progress.
      if (el && e.buttons === 0) arm(el);
    };
    const out = (e: PointerEvent) => {
      const el = owner.current;
      if (!el) return;
      if (e.relatedTarget instanceof Node && el.contains(e.relatedTarget)) return;
      hide();
    };
    const move = (e: PointerEvent) => {
      if (e.buttons !== 0 && owner.current) hide();
      // Resting on the element again after a click or key press: wait for the pointer to move, then arm.
      else if (!owner.current && e.buttons === 0 && e.pointerType !== "touch") {
        const el = tipOwner(e.target);
        if (el) arm(el);
      }
    };
    const stop = () => hide();
    const opts = { capture: true, passive: true } as const;
    document.addEventListener("pointerover", over, opts);
    document.addEventListener("pointerout", out, opts);
    document.addEventListener("pointermove", move, opts);
    document.addEventListener("pointerdown", stop, opts);
    document.addEventListener("wheel", stop, opts);
    document.addEventListener("scroll", stop, opts);
    document.addEventListener("keydown", stop, opts);
    window.addEventListener("blur", stop);
    return () => {
      hide();
      document.removeEventListener("pointerover", over, opts);
      document.removeEventListener("pointerout", out, opts);
      document.removeEventListener("pointermove", move, opts);
      document.removeEventListener("pointerdown", stop, opts);
      document.removeEventListener("wheel", stop, opts);
      document.removeEventListener("scroll", stop, opts);
      document.removeEventListener("keydown", stop, opts);
      window.removeEventListener("blur", stop);
    };
  }, []);

  // A box that is removed or re-rendered under a shown bubble (the canvas reloads after an edit) must not leave it behind.
  useEffect(() => {
    if (!shown) return;
    const id = window.setInterval(() => {
      const el = owner.current;
      if (!el || !el.isConnected) {
        owner.current = null;
        taken.current = null;
        setShown(null);
      }
    }, 300);
    return () => window.clearInterval(id);
  }, [shown]);

  // Place it below the element (above when there is no room), centred, and kept inside the window.
  useLayoutEffect(() => {
    const b = bubble.current;
    if (!shown || !b) return;
    const { width, height } = b.getBoundingClientRect();
    const r = shown.rect;
    let top = r.bottom + GAP;
    if (top + height > window.innerHeight - MARGIN && r.top - GAP - height >= MARGIN) top = r.top - GAP - height;
    top = Math.max(MARGIN, Math.min(top, window.innerHeight - height - MARGIN));
    const left = Math.max(MARGIN, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - MARGIN));
    b.style.top = `${top}px`;
    b.style.left = `${left}px`;
    b.style.visibility = "visible";
  }, [shown]);

  if (!shown) return null;
  return (
    <div ref={bubble} className="tooltip" role="tooltip" style={{ visibility: "hidden" }} data-testid="tooltip">
      {shown.text}
    </div>
  );
}
