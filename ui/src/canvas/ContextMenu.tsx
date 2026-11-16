import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../common/icons";

/** One row of a right-click menu: an action, a submenu, or a separator. */
export type MenuItem =
  | { sep: true }
  | {
      sep?: false;
      label: string;
      icon?: string;
      /** Shown on the right, e.g. "⌘D". */
      shortcut?: string;
      disabled?: boolean;
      danger?: boolean;
      /** Shows a tick: the current value in a choice submenu. */
      checked?: boolean;
      testId?: string;
      onSelect?: () => void;
      submenu?: MenuItem[];
    };

type Action = Exclude<MenuItem, { sep: true }>;
const isAction = (m: MenuItem): m is Action => !m.sep;
const usable = (m: MenuItem): m is Action => isAction(m) && !m.disabled;

/** Drop leading, trailing and doubled separators (left over when items are filtered out). */
export function tidy(items: (MenuItem | false | "" | null | undefined)[]): MenuItem[] {
  const out: MenuItem[] = [];
  for (const m of items) {
    if (!m) continue;
    if (m.sep && (out.length === 0 || out[out.length - 1].sep)) continue;
    out.push(m);
  }
  while (out.length && out[out.length - 1].sep) out.pop();
  return out;
}

const MARGIN = 8;
export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
/** "Mod+D" → "⌘D" on a Mac, "Ctrl+D" elsewhere. */
export const keys = (s: string) => (isMac ? s.replace(/Mod\+/g, "⌘").replace(/Shift\+/g, "⇧") : s.replace(/Mod\+/g, "Ctrl+"));

/**
 * A right-click menu at a screen point, kept inside the window. Arrow keys move, Right/Enter open a
 * submenu, Left closes it, Enter runs an item, Escape closes. Clicking elsewhere, scrolling or
 * resizing closes it. With `keyboard` the first row starts highlighted, so Enter takes it.
 */
export function ContextMenu({ x, y, items, onClose, keyboard = false }: { x: number; y: number; items: MenuItem[]; onClose(): void; keyboard?: boolean }) {
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.(".ctx-menu")) onClose();
    };
    const close = () => onClose();
    // Scrolling the menu itself (it can be taller than the window) must not close it.
    const wheel = (e: WheelEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.(".ctx-menu")) onClose();
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("wheel", wheel, { passive: true });
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("wheel", wheel);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);
  const anchor = useMemo(() => ({ left: x, right: x, top: y }), [x, y]);
  return <MenuList items={items} anchor={anchor} onDone={onClose} keyboard={keyboard} testId="context-menu" />;
}

interface Anchor {
  left: number;
  right: number;
  top: number;
}

function MenuList({
  items,
  anchor,
  onDone,
  onBack,
  keyboard = false,
  testId,
}: {
  items: MenuItem[];
  anchor: Anchor;
  onDone(): void;
  /** Set for a submenu: go back to the parent menu. */
  onBack?: () => void;
  /** Opened from the keyboard: highlight the first row. */
  keyboard?: boolean;
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [cur, setCur] = useState(keyboard ? items.findIndex(usable) : -1);
  const nested = !!onBack;
  const [sub, setSub] = useState<{ index: number; anchor: Anchor; viaKey: boolean } | null>(null);
  const rows = useRef<(HTMLButtonElement | null)[]>([]);

  // Place the menu at the anchor; flip left/up when it would leave the window.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width: w, height: h } = el.getBoundingClientRect();
    let px = anchor.right;
    if (px + w > window.innerWidth - MARGIN) px = nested ? anchor.left - w : window.innerWidth - MARGIN - w;
    let py = anchor.top;
    if (py + h > window.innerHeight - MARGIN) py = window.innerHeight - MARGIN - h;
    setPos({ x: Math.max(MARGIN, px), y: Math.max(MARGIN, py) });
  }, [anchor, nested]);
  // Take the keyboard once placed (a hidden element cannot be focused).
  const placed = pos !== null;
  useEffect(() => {
    if (placed) ref.current?.focus({ preventScroll: true });
  }, [placed]);

  const openSub = (i: number, viaKey: boolean) => {
    const r = rows.current[i]?.getBoundingClientRect();
    if (r) setSub({ index: i, anchor: { left: r.left + 4, right: r.right - 4, top: r.top - 5 }, viaKey });
  };
  const run = (i: number, viaKey = false) => {
    const m = items[i];
    if (!m || !usable(m)) return;
    if (m.submenu) return openSub(i, viaKey);
    onDone();
    m.onSelect?.();
  };
  const step = (dir: 1 | -1) => {
    const n = items.length;
    for (let k = 1; k <= n; k++) {
      const i = ((((cur < 0 ? (dir > 0 ? -1 : 0) : cur) + dir * k) % n) + n) % n;
      if (usable(items[i])) return setCur(i);
    }
  };

  const subItem = sub ? items[sub.index] : null;
  return (
    <>
      <div
        ref={ref}
        className="ctx-menu"
        role="menu"
        tabIndex={-1}
        data-testid={testId}
        style={{ left: pos?.x ?? anchor.right, top: pos?.y ?? anchor.top, visibility: pos ? "visible" : "hidden" }}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          // Keep keys away from the canvas shortcuts (Delete, arrows, Escape) while the menu is open.
          e.stopPropagation();
          if (sub) return; // the submenu has focus
          if (e.key === "ArrowDown") step(1);
          else if (e.key === "ArrowUp") step(-1);
          else if (e.key === "Enter" || e.key === " ") run(cur, true);
          else if (e.key === "ArrowRight" && cur >= 0 && isAction(items[cur]) && (items[cur] as Action).submenu) openSub(cur, true);
          else if (e.key === "ArrowLeft" && onBack) onBack();
          else if (e.key === "Escape") (onBack ?? onDone)();
          else if (e.key === "Tab") onDone();
          else return;
          e.preventDefault();
        }}
      >
        {items.map((m, i) =>
          m.sep ? (
            <div key={`sep-${i}`} className="ctx-sep" role="separator" />
          ) : (
            <button
              key={`${m.label}-${i}`}
              ref={(b) => {
                rows.current[i] = b;
              }}
              role={m.checked === undefined ? "menuitem" : "menuitemradio"}
              aria-checked={m.checked}
              aria-haspopup={m.submenu ? "menu" : undefined}
              aria-expanded={m.submenu ? sub?.index === i : undefined}
              className={`ctx-item${i === cur ? " on" : ""}${m.danger ? " danger" : ""}`}
              disabled={m.disabled}
              tabIndex={-1}
              data-testid={m.testId}
              onMouseEnter={() => {
                setCur(i);
                if (m.submenu && !m.disabled) openSub(i, false);
                else if (sub) {
                  setSub(null);
                  ref.current?.focus();
                }
              }}
              onClick={() => run(i)}
            >
              <span className="ctx-icon">{m.checked ? <Icon name="check" size={14} /> : m.icon ? <Icon name={m.icon} size={14} /> : null}</span>
              <span className="ctx-label">{m.label}</span>
              {m.shortcut && <span className="ctx-key">{m.shortcut}</span>}
              {m.submenu && <Icon name="chevron" size={12} className="ctx-more" />}
            </button>
          ),
        )}
      </div>
      {sub && subItem && isAction(subItem) && subItem.submenu && (
        <MenuList
          key={sub.index}
          items={subItem.submenu}
          anchor={sub.anchor}
          keyboard={sub.viaKey}
          onDone={onDone}
          onBack={() => {
            setSub(null);
            ref.current?.focus();
          }}
        />
      )}
    </>
  );
}
