import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { NONE, bandRange, counts, encodeSpec, formatMoney, legendItems, overlayable, sameSpec, specLabel, techColors, type Filter, type OverlaySpec, WORK_LABEL, openWork } from "./overlays";
import type { AppState, Diagram, TagGroup } from "./types";

type Tab = "tags" | "tech" | "char" | "cost" | "work" | "changes";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "tags", label: "Tags", icon: "tag" },
  { id: "tech", label: "Technology", icon: "code" },
  { id: "char", label: "Characteristics", icon: "gauge" },
  { id: "cost", label: "Cost", icon: "coin" },
  { id: "work", label: "Work", icon: "warning" },
];
const CHANGES_TAB = { id: "changes" as Tab, label: "Changes", icon: "layers" };

const tabOf = (s: OverlaySpec | null): Tab | null => (s ? (s.kind === "tag" ? "tags" : s.kind) : null);

/**
 * Overlay controls at the bottom left of the canvas: pick what colours
 * the objects, read the counts per value, and Focus on or Hide the objects with one value.
 */
export function Dock({
  state,
  diagram,
  groups,
  overlay,
  setOverlay,
  filters,
  setFilters,
  onEditTagGroup,
  onNewTagGroup,
  onEditCharacteristics,
  onEditCost,
}: {
  state: AppState;
  diagram: Diagram;
  groups: TagGroup[];
  overlay: OverlaySpec | null;
  setOverlay(s: OverlaySpec | null): void;
  filters: Filter[];
  setFilters(f: Filter[]): void;
  onEditTagGroup(g: TagGroup): void;
  onNewTagGroup(): void;
  onEditCharacteristics(): void;
  onEditCost(): void;
}) {
  const [tab, setTab] = useState<Tab | null>(tabOf(overlay));
  // The Focus / Hide menu of a value chip. It is fixed to the window (placed from the chip), so the dock panel's own scrolling does not clip it.
  const [menu, setMenu] = useState<{ key: string; label: string; style: React.CSSProperties } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (overlay) setTab(tabOf(overlay));
  }, [overlay]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(null);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);

  const techs = techColors(diagram);
  const els = overlayable(diagram);

  const subTabs: { spec: OverlaySpec; label: string; count: number; title?: string }[] =
    tab === "changes"
      ? [{ spec: { kind: "changes" }, label: `Against: ${state.compare?.title ?? "—"}`, count: els.filter((n) => n.change).length }]
      : tab === "tags"
        ? groups.map((g) => ({ spec: { kind: "tag", name: g.name }, label: g.name, count: els.filter((n) => n.tags[g.name]).length }))
        : tab === "char"
          ? state.characteristics.map((c) => ({
              spec: { kind: "char", name: c.name },
              label: c.name,
              title: c.description,
              count: els.filter((n) => n.characteristics?.some((r) => r.name === c.name && r.rating)).length,
            }))
          : tab === "cost"
            ? [{ spec: { kind: "cost" }, label: "Monthly cost", count: els.filter((n) => n.cost.length || n.costRollup > 0).length }]
            : tab === "work"
              ? Object.keys(WORK_LABEL).map((t) => ({ spec: { kind: "work", type: t } as OverlaySpec, label: WORK_LABEL[t], count: els.filter((n) => openWork(n, t).length).length }))
              : tab === "tech"
                ? [{ spec: { kind: "tech" }, label: "By technology", count: els.filter((n) => n.technologies?.length).length }]
                : [];

  const active = overlay && tabOf(overlay) === tab ? overlay : null;
  const c = active ? counts(active, diagram, state, techs) : null;
  const items = active ? legendItems(active, state, diagram) : [];
  const spec = active ? encodeSpec(active) : "";
  // Diagram total: elements shown here are siblings (no element is drawn inside another), so their roll-ups add up.
  const total = els.reduce((sum, n) => sum + (n.costRollup ?? 0), 0);

  const addFilter = (key: string, label: string, mode: Filter["mode"]) => {
    const rest = filters.filter((f) => !(f.spec === spec && f.key === key));
    setFilters([...rest, { spec, key, label: `${active ? specLabel(active) : ""} = ${label}`, mode }]);
    setMenu(null);
  };

  const chip = (key: string, label: string, color: string | null, n: number, title?: string) => {
    const f = filters.find((x) => x.spec === spec && x.key === key);
    return (
      <span className="dock-chip-wrap" key={key}>
        <button
          className={`dock-chip${f ? ` ${f.mode}` : ""}${n === 0 ? " zero" : ""}`}
          style={color ? { ["--chip" as string]: color } : undefined}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const place: React.CSSProperties = r.top > 150 ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 };
            setMenu(menu?.key === key ? null : { key, label, style: { position: "fixed", left: Math.max(8, Math.min(r.left, window.innerWidth - 180)), margin: 0, ...place } });
          }}
          title={title ?? "Focus on or hide the objects with this value"}
          data-testid={`chip-${key}`}
        >
          {color ? <span className="dot" style={{ background: color }} /> : <span className="dot none" />}
          {label}
          <span className="n">{n}</span>
          {f && <Icon name={f.mode === "focus" ? "focus" : "eyeOff"} size={11} />}
        </button>
        {menu?.key === key && (
          <div className="pop-menu" ref={menuRef} role="menu" style={menu.style}>
            <button role="menuitem" onClick={() => addFilter(key, label, "focus")} data-testid="filter-focus">
              <Icon name="focus" size={14} /> Focus
            </button>
            <button role="menuitem" onClick={() => addFilter(key, label, "hide")} data-testid="filter-hide">
              <Icon name="eyeOff" size={14} /> Hide
            </button>
            {f && (
              <button role="menuitem" onClick={() => (setFilters(filters.filter((x) => x !== f)), setMenu(null))}>
                <Icon name="close" size={14} /> Clear
              </button>
            )}
          </div>
        )}
      </span>
    );
  };

  return (
    <div className="dock" data-testid="dock" data-occludes="bottom">
      <div className="dock-tabs">
        {(state.compare ? [CHANGES_TAB, ...TABS] : TABS).map((t) => (
          <button key={t.id} className={`float-btn${tab === t.id ? " on" : ""}`} onClick={() => setTab(tab === t.id ? null : t.id)} data-testid={`dock-${t.id}`} aria-expanded={tab === t.id}>
            <Icon name={t.icon} size={14} /> {t.label}
          </button>
        ))}
      </div>
      {tab && (
        <div className="dock-panel float">
          <div className="dock-groups">
            {subTabs.map((s) => (
              <button
                key={encodeSpec(s.spec)}
                className={`dock-group${sameSpec(s.spec, overlay) ? " on" : ""}`}
                onClick={() => setOverlay(sameSpec(s.spec, overlay) ? null : s.spec)}
                title={s.title ?? (sameSpec(s.spec, overlay) ? "Turn the overlay off" : "Colour the objects by this")}
                data-testid={`overlay-${encodeSpec(s.spec)}`}
              >
                {s.label} <span className="n">{s.count}</span>
              </button>
            ))}
            {tab === "tags" && subTabs.length === 0 && <span className="empty-note">No tag groups yet.</span>}
            <span className="spacer" />
            {tab === "tags" && !state.readOnly && active?.kind === "tag" && (
              <button className="ghost icon" title="Edit this tag group" aria-label="Edit this tag group" onClick={() => onEditTagGroup(groups.find((g) => g.name === active.name)!)}>
                <Icon name="gear" size={14} />
              </button>
            )}
            {tab === "tags" && !state.readOnly && (
              <button className="ghost icon" title="New tag group" aria-label="New tag group" onClick={onNewTagGroup} data-testid="dock-new-tag-group">
                <Icon name="plus" size={14} />
              </button>
            )}
            {tab === "char" && !state.readOnly && (
              <button className="ghost icon" title="Edit the list of characteristics" aria-label="Edit the list of characteristics" onClick={onEditCharacteristics} data-testid="edit-characteristics">
                <Icon name="gear" size={14} />
              </button>
            )}
            {tab === "cost" && !state.readOnly && (
              <button className="ghost icon" title="Currency and cost bands" aria-label="Currency and cost bands" onClick={onEditCost} data-testid="edit-cost">
                <Icon name="gear" size={14} />
              </button>
            )}
          </div>
          {tab === "cost" && (
            <div className="dock-note small" data-testid="cost-total">
              This diagram: <strong>{formatMoney(total, state.costSettings.currency)}/mo</strong>
              <span className="muted"> · totals include everything inside each object</span>
            </div>
          )}
          {active && c && (
            <div className="dock-values">
              {items.map((it, i) => chip(it.key, it.label, it.color, c.byKey.get(it.key) ?? 0, active.kind === "cost" ? bandRange(i, state.costSettings) : undefined))}
              {chip(
                NONE,
                active.kind === "char" ? "Not rated" : active.kind === "cost" ? "No cost" : active.kind === "work" ? "Nothing open" : active.kind === "changes" ? "Unchanged" : "No value",
                null,
                c.none,
              )}
            </div>
          )}
          {!active && tab && subTabs.length > 0 && <div className="dock-note muted small">Choose one above to colour the objects.</div>}
        </div>
      )}
      {filters.length > 0 && (
        <div className="filter-row">
          {filters.map((f, i) => (
            <span className={`filter-pill ${f.mode}`} key={i}>
              <Icon name={f.mode === "focus" ? "focus" : "eyeOff"} size={12} /> {f.mode === "focus" ? "Focus" : "Hidden"}: {f.label}
              <button className="ghost icon" aria-label="Remove filter" title="Remove filter" onClick={() => setFilters(filters.filter((_, j) => j !== i))}>
                <Icon name="close" size={11} />
              </button>
            </span>
          ))}
          <button className="ghost small" onClick={() => setFilters([])} data-testid="clear-filters">
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
