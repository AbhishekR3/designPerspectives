import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  NodeResizer,
  NodeToolbar,
  Position,
  useInternalNode,
  useReactFlow,
  type EdgeProps,
  type InternalNode,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import { NODE_H, NODE_W } from "./layout";
import { Icon, iconFor } from "./icons";
import { Shape, shapeInset } from "./shapes";
import { KIND_LABEL, type DiagramNode, type EdgeLayout, type Pt, type Section, type Style } from "./types";

// Accent colour per C4 kind (icon colour on the dark cards).
export const KIND_COLOR: Record<string, string> = {
  person: "#cbd5e1",
  softwareSystem: "#60a5fa",
  container: "#38bdf8",
  component: "#7dd3fc",
  stage: "#c4b5fd",
  file: "#86efac",
};
export const CARD_FILL = "#1c1f24";
export const CARD_STROKE = "#3a3f47";
const EXTERNAL_FILL = "#17191d";
const FREQ_ORDER = ["rarely", "monthly", "weekly", "daily", "hourly", "continuous"];
/** Symbols drawn as their own outline; every other type is a card with an icon. */
const OUTLINE_SHAPES = new Set(["database", "cache", "storage", "queue", "cloud", "document", "pipeline"]);

export function textColorFor(bg: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(bg.trim());
  if (!m) return "#fff";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? "#111" : "#fff";
}

export function darken(hex: string, amount = 0.25): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const f = (v: number) => Math.max(0, Math.round(v * (1 - amount)));
  return `#${[f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Mix `hex` into `base` (both #rrggbb); `t` is the share of `hex`. */
export function mix(hex: string, base: string, t: number): string {
  const p = (h: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
    const n = m ? parseInt(m[1], 16) : 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const a = p(hex);
  const b = p(base);
  return `#${a.map((v, i) => Math.round(v * t + b[i] * (1 - t)).toString(16).padStart(2, "0")).join("")}`;
}

export function dashFor(s?: Style["strokeStyle"]): string | undefined {
  return { dashed: "8 5", dotted: "2 4", "dash-dot": "10 4 2 4", "long-dash": "16 6", solid: undefined }[s ?? "solid"];
}

/** Which way a line leaves a box at an anchor (fractions of the box), for smooth curves. */
function outward(a: Pt | undefined, from: Pt, to: Pt): Pt {
  if (a) {
    if (a.x <= 0.001) return { x: -1, y: 0 };
    if (a.x >= 0.999) return { x: 1, y: 0 };
    if (a.y <= 0.001) return { x: 0, y: -1 };
    if (a.y >= 0.999) return { x: 0, y: 1 };
  }
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.abs(dx) >= Math.abs(dy) ? { x: Math.sign(dx) || 1, y: 0 } : { x: 0, y: Math.sign(dy) || 1 };
}

/** Polyline with rounded corners (radius r, never more than half a segment). */
function roundedPath(pts: Pt[], r = 14): string {
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, b, c] = [pts[i - 1], pts[i], pts[i + 1]];
    const l1 = Math.hypot(b.x - a.x, b.y - a.y);
    const l2 = Math.hypot(c.x - b.x, c.y - b.y);
    const k = Math.min(r, l1 / 2, l2 / 2);
    if (k < 0.5) {
      d += ` L ${b.x} ${b.y}`;
      continue;
    }
    const p1 = { x: b.x + ((a.x - b.x) / l1) * k, y: b.y + ((a.y - b.y) / l1) * k };
    const p2 = { x: b.x + ((c.x - b.x) / l2) * k, y: b.y + ((c.y - b.y) / l2) * k };
    d += ` L ${p1.x} ${p1.y} Q ${b.x} ${b.y} ${p2.x} ${p2.y}`;
  }
  const z = pts[pts.length - 1];
  return `${d} L ${z.x} ${z.y}`;
}

export interface OverlayInfo {
  group: string;
  value: string | null; // null: no value
  chip: string;
  color: string | null;
}

export type Rect4 = { x: number; y: number; width: number; height: number };

/** Edits offered on the canvas itself, next to the selected box. */
export interface NodeActions {
  rename(id: string, name: string): void;
  setArchType(id: string, archType: string): void;
  duplicate(id: string): void;
  remove(id: string): void;
  open(key: string): void;
}

const MODEL_KINDS = new Set(["person", "softwareSystem", "container", "component"]);

export type C4NodeData = {
  el: DiagramNode;
  w: number;
  h: number;
  overlay: OverlayInfo | null;
  showTechnology: boolean;
  showDescriptions: boolean;
  sections: Section[];
  flowActive: boolean; // element takes part in the current flow step
  dimmed: boolean;
  focused: boolean; // matches an active Focus filter
  editable: boolean;
  costLabel: string | null;
  actions: NodeActions | null;
  archTypes: { id: string; label: string }[];
  renameNow: boolean; // start inline rename (new box, or F2)
  onRenameStarted(): void;
  onResize(id: string, r: Rect4): void;
  onResizeEnd(id: string, r: Rect4): void;
};
export type C4NodeType = Node<C4NodeData, "c4">;

function typeLabel(el: DiagramNode): string {
  if (el.kind === "person") return el.external ? "External person" : "Person";
  if (el.kind === "softwareSystem") return el.external ? "External system" : el.inScope ? "System" : "System (other context)";
  return KIND_LABEL[el.kind];
}

function InlineName({ value, fontSize, onDone }: { value: string; fontSize: number; onDone(v: string | null): void }) {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      className="inline-name nodrag nopan"
      style={{ fontSize }}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") onDone(v.trim() && v.trim() !== value ? v.trim() : null);
        if (e.key === "Escape") onDone(null);
      }}
      onBlur={() => onDone(v.trim() && v.trim() !== value ? v.trim() : null)}
      onDoubleClick={(e) => e.stopPropagation()}
      aria-label="Name"
      data-testid="inline-name"
    />
  );
}

export function C4Node({ data, selected }: NodeProps<C4NodeType>) {
  const { el, overlay, w, h } = data;
  const [renaming, setRenaming] = useState(false);
  const renameTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(renameTimer.current), []);
  const isModel = MODEL_KINDS.has(el.kind);
  const act = isModel && data.editable ? data.actions : null;
  // Start renaming once when asked (a new box, or F2); later re-renders must not reopen it.
  const canRename = !!act;
  useEffect(() => {
    if (data.renameNow && canRename) {
      setRenaming(true);
      data.onRenameStarted();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.renameNow]);
  const st = el.style ?? {};
  const type = el.kind === "person" ? "person" : el.archType || "box";
  const outline = OUTLINE_SHAPES.has(type);
  let bg = st.fill ?? (el.external ? EXTERNAL_FILL : CARD_FILL);
  let stroke = st.stroke ?? CARD_STROKE;
  const dash = dashFor(st.strokeStyle) ?? (el.external && !st.stroke ? "6 4" : undefined);
  let sw = st.strokeWidth ?? 1.2;
  if (overlay?.color) {
    bg = mix(overlay.color, st.fill ?? CARD_FILL, 0.2);
    stroke = overlay.color;
    sw = Math.max(sw, 1.6);
  }
  const fg = st.text ?? (st.fill && !overlay?.color ? textColorFor(bg) : "#e8eaed");
  const inset = outline ? shapeInset(type, w, h) : { top: 10, bottom: 10, left: 12, right: 12 };
  const fs = st.fontSize ?? 14;
  const has = (s: Section) => data.sections.includes(s);
  const freq = el.usage.length ? el.usage.map((u) => u.frequency).sort((a, b) => FREQ_ORDER.indexOf(b) - FREQ_ORDER.indexOf(a))[0] : null;
  const techs = data.showTechnology && el.technologies?.length ? el.technologies.join(", ") : "";
  const driving = (el.characteristics ?? []).filter((c) => c.driving).map((c) => c.name);
  const workOpen = (el.work ?? []).filter((w) => w.status !== "done");
  const secOpen = workOpen.filter((w) => w.type === "security").length;
  const cls = [
    "c4-node",
    `kind-${el.kind}`,
    outline ? "outline" : "card",
    selected ? "selected" : "",
    data.flowActive ? "flow-active" : "",
    data.dimmed ? "dimmed" : "",
    data.focused ? "focused" : "",
    overlay && !overlay.color ? "no-value" : "",
    el.external ? "external" : "",
    el.ghost ? "ghost" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      className={cls}
      style={{ color: fg, width: w, height: h }}
      data-testid={`node-${el.id}`}
      data-change={el.change}
      data-shape={type}
      title={el.drillKey ? "Double-click to open the next level" : undefined}
    >
      {outline ? (
        <Shape type={type} w={w} h={h} s={{ fill: bg, stroke, strokeWidth: sw, dash }} />
      ) : (
        <div className="card-bg" style={{ background: bg, borderColor: stroke, borderWidth: sw, borderStyle: dash ? "dashed" : "solid" }} />
      )}
      {el.kind === "person" && (
        <div className="person-badge" style={{ borderColor: stroke }}>
          <Icon name="person" size={14} />
        </div>
      )}
      {el.drillKey && el.childCount > 0 && (
        <div className="drill-mark" title={`${el.childCount} inside; double-click to open`}>
          <Icon name="search" size={11} /> {el.childCount}
        </div>
      )}
      {overlay && (
        <div className={`ov-chip${overlay.color ? "" : " none"}`} data-testid={`badge-${el.id}`} title={`${overlay.group}: ${overlay.value ?? "no value"}`}>
          {overlay.color && <span className="dot" style={{ background: overlay.color }} />}
          {overlay.chip}
        </div>
      )}
      <div className="c4-content" style={{ paddingTop: inset.top, paddingBottom: inset.bottom, paddingLeft: inset.left, paddingRight: inset.right }}>
        <div className="c4-title">
          {el.kind !== "person" && (
            <span className="c4-icon" style={{ color: KIND_COLOR[el.kind] }}>
              <Icon name={iconFor(el.kind, el.archType)} size={Math.round(fs + 2)} />
            </span>
          )}
          {renaming && act ? (
            <InlineName
              value={el.name}
              fontSize={fs}
              onDone={(v) => {
                setRenaming(false);
                if (v) act.rename(el.id, v);
              }}
            />
          ) : (
            <span
              className="c4-name"
              style={{ fontSize: fs }}
              onClick={() => {
                // Clicking the name of a box that is already selected renames it, unless the click
                // turns out to be the first half of a double-click (which opens the box).
                if (!act || !selected) return;
                window.clearTimeout(renameTimer.current);
                renameTimer.current = window.setTimeout(() => setRenaming(true), 350);
              }}
              onDoubleClick={(e) => {
                window.clearTimeout(renameTimer.current);
                // Double-click opens a box that has a diagram inside; otherwise it renames.
                if (!act || el.drillKey) return;
                e.stopPropagation();
                setRenaming(true);
              }}
              title={act ? (selected ? "Click to rename" : el.drillKey ? "Double-click to open; select, then click the name to rename" : "Double-click to rename") : undefined}
            >
              {el.name}
            </span>
          )}
        </div>
        {data.showDescriptions && el.description && <div className="c4-desc" style={{ fontSize: Math.max(10, fs - 4) }}>{el.description}</div>}
        {el.kind === "stage" && el.linkedElementName && <div className="c4-type">→ {el.linkedElementName}</div>}
        {el.kind === "file" && el.lineCount != null && <div className="c4-type">{el.lineCount} lines</div>}
        <div className="c4-type" style={{ fontSize: Math.max(9, fs - 5) }}>
          {typeLabel(el)}
          {techs && <span className="c4-tech"> · {techs}</span>}
        </div>
        <div className="c4-badges">
          {has("cost") && data.costLabel && !overlay && <span className="badge cost">{data.costLabel}</span>}
          {has("characteristics") && driving.length > 0 && (
            <span className="badge subtle" title={`Driving characteristics: ${driving.join(", ")}`}>
              ★ {driving.length > 2 ? `${driving.slice(0, 2).join(", ")} +${driving.length - 2}` : driving.join(", ")}
            </span>
          )}
          {has("work") && workOpen.length > 0 && (
            <span className={`badge work${secOpen ? " sec" : ""}`} title={workOpen.map((w) => `${w.type}: ${w.title} (${w.status})`).join("\n")} data-testid={`work-${el.id}`}>
              {secOpen ? `⚠ ${secOpen} security` : `${workOpen.length} open`}
              {secOpen && workOpen.length > secOpen ? ` · ${workOpen.length - secOpen} other` : ""}
            </span>
          )}
          {has("sensitive") && el.sensitivityLevel && (
            <span className={`badge sens-${el.sensitivityLevel}`} data-testid={`sensitive-${el.id}`}>
              Sensitive: {el.sensitivityLevel}
            </span>
          )}
          {has("usage") && freq && <span className="badge subtle">Used {freq}</span>}
          {has("notes") && el.notes && <span className="badge subtle" data-testid={`notes-${el.id}`}>Notes</span>}
          {has("tradeoffs") && el.tradeoffs.length > 0 && <span className="badge subtle">Tradeoffs {el.tradeoffs.length}</span>}
          {has("code") && el.codePaths.length > 0 && el.kind !== "file" && <span className="badge subtle">Code</span>}
        </div>
      </div>
      {act && (
        <NodeToolbar isVisible={selected && !renaming} position={Position.Top} offset={14} className="quick-bar nodrag nopan" align="center">
          <button className="ghost icon" onClick={() => setRenaming(true)} title="Rename (or double-click the name)" aria-label="Rename" data-testid="qb-rename">
            ✎
          </button>
          {el.kind !== "person" && (
            <select value={el.archType || "box"} onChange={(e) => act.setArchType(el.id, e.target.value)} title="Symbol" aria-label="Symbol" data-testid="qb-symbol">
              {data.archTypes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          )}
          {el.drillKey && (
            <button className="ghost" onClick={() => act.open(el.drillKey!)} title="Open what is inside" data-testid="qb-open">
              <Icon name="search" size={13} /> Open
            </button>
          )}
          <button className="ghost icon" onClick={() => act.duplicate(el.id)} title="Duplicate (Ctrl/Cmd+D)" aria-label="Duplicate" data-testid="qb-duplicate">
            ⧉
          </button>
          <button className="ghost icon danger-text" onClick={() => act.remove(el.id)} title="Delete" aria-label="Delete" data-testid="qb-delete">
            <Icon name="close" size={14} />
          </button>
        </NodeToolbar>
      )}
      <NodeResizer
        isVisible={selected && data.editable}
        minWidth={120}
        minHeight={60}
        lineClassName="resize-line"
        handleClassName="resize-handle"
        onResize={(_, p) => data.onResize(el.id, p)}
        onResizeEnd={(_, p) => data.onResizeEnd(el.id, p)}
      />
      {(["t", "r", "b", "l"] as const).map((id) => (
        <Handle
          key={id}
          id={id}
          type="source"
          position={{ t: Position.Top, r: Position.Right, b: Position.Bottom, l: Position.Left }[id]}
          className={`connect-handle h-${id}`}
          isConnectable={data.editable}
        />
      ))}
    </div>
  );
}

export type BoundaryData = { name: string; kind: string; description: string; width: number; height: number };
export type BoundaryNodeType = Node<BoundaryData, "boundary">;

export function BoundaryNode({ data }: NodeProps<BoundaryNodeType>) {
  return (
    <div className="boundary" style={{ width: data.width, height: data.height }} data-testid="boundary">
      <div className="boundary-label">
        <Icon name={data.kind === "container" ? "container" : "system"} size={12} /> {data.name}
      </div>
      <div className="boundary-foot">
        {data.description && <div>{data.description}</div>}
        <div>{KIND_LABEL[data.kind as keyof typeof KIND_LABEL]}</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ edges

type R = { x: number; y: number; w: number; h: number };

function rectOf(n: InternalNode): R {
  const w = n.measured.width ?? n.width ?? NODE_W;
  const h = n.measured.height ?? n.height ?? NODE_H;
  return { x: n.internals.positionAbsolute.x, y: n.internals.positionAbsolute.y, w, h };
}
const centerOf = (r: R): Pt => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** Where the line from the centre of `r` towards `to` leaves the rectangle. */
function borderPoint(r: R, to: Pt): Pt {
  const c = centerOf(r);
  const dx = to.x - c.x;
  const dy = to.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const s = Math.min(r.w / 2 / Math.abs(dx || 1e-9), r.h / 2 / Math.abs(dy || 1e-9));
  return { x: c.x + dx * s, y: c.y + dy * s };
}

const anchorPoint = (r: R, a: Pt): Pt => ({ x: r.x + a.x * r.w, y: r.y + a.y * r.h });

/** Nearest point on the rectangle's border to `p`, as fractions of the rectangle. */
function toAnchor(r: R, p: Pt): Pt {
  const x = Math.min(Math.max(p.x, r.x), r.x + r.w);
  const y = Math.min(Math.max(p.y, r.y), r.y + r.h);
  const d = [x - r.x, r.x + r.w - x, y - r.y, r.y + r.h - y];
  const m = Math.min(...d);
  let fx = (x - r.x) / r.w;
  let fy = (y - r.y) / r.h;
  if (m === d[0]) fx = 0;
  else if (m === d[1]) fx = 1;
  else if (m === d[2]) fy = 0;
  else fy = 1;
  const snap = (v: number) => (Math.abs(v - 0.5) < 0.04 ? 0.5 : Math.round(v * 1000) / 1000);
  return { x: snap(fx), y: snap(fy) };
}

type Poly = Pt[];
const lengthOf = (pts: Poly) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);

function pointAlong(pts: Poly, t: number): { p: Pt; nx: number; ny: number } {
  const total = lengthOf(pts) || 1;
  let want = Math.min(Math.max(t, 0), 1) * total;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (want <= seg || i === pts.length - 1) {
      const k = seg ? Math.min(want / seg, 1) : 0;
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      const len = Math.hypot(dx, dy) || 1;
      return { p: { x: pts[i - 1].x + dx * k, y: pts[i - 1].y + dy * k }, nx: -dy / len, ny: dx / len };
    }
    want -= seg;
  }
  return { p: pts[0], nx: 0, ny: 1 };
}

/** Parameter t (0..1 along the polyline) and signed distance of the polyline's nearest point to `q`. */
function project(pts: Poly, q: Pt): { t: number; dist: number } {
  const total = lengthOf(pts) || 1;
  let best = { t: 0.5, dist: 0, d2: Infinity };
  let walked = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const seg = Math.hypot(dx, dy) || 1;
    const k = Math.min(Math.max(((q.x - a.x) * dx + (q.y - a.y) * dy) / (seg * seg), 0), 1);
    const px = a.x + dx * k;
    const py = a.y + dy * k;
    const d2 = (q.x - px) ** 2 + (q.y - py) ** 2;
    if (d2 < best.d2) {
      const side = Math.sign((q.x - px) * (-dy) + (q.y - py) * dx) || 1;
      best = { t: (walked + seg * k) / total, dist: side * Math.sqrt(d2), d2 };
    }
    walked += seg;
  }
  return { t: best.t, dist: best.dist };
}

export type C4EdgeData = {
  label: string;
  technologies: string[];
  kind: string;
  derived: boolean;
  offset: number; // perpendicular offset for parallel edges
  highlight: "current" | "past" | null;
  response: boolean;
  dimmed: boolean;
  testId: string;
  style: Style;
  layout: EdgeLayout;
  sensitivityLevel: string | null;
  hasNotes: boolean;
  stageCount: number;
  openWork: number;
  hasDetail: boolean;
  editable: boolean;
  /** Only in the compared version (drawn faded, dotted). */
  ghost?: boolean;
  /** Colour by change, when the Changes overlay is on. */
  changeColor?: string | null;
  onGeom(id: string, layout: EdgeLayout): void;
  onSelect(id: string): void;
  onOpen(id: string): void;
  /** Right-click on the label (drawn in its own layer, so the line's own handler does not see it). */
  onContextMenu(id: string, client: Pt): void;
};

export const FLOW_CURRENT = "#5ee1f5";
const FLOW_PAST = "#2a7f8f";

export function edgeColor(d: { derived: boolean; style: Style }): string {
  return d.style.stroke ?? (d.derived ? "#4f565f" : "#6b727c");
}

// Inline (not only CSS) so SVG/PNG export keeps the lines.
function edgeStyle(d: C4EdgeData, selected: boolean): React.CSSProperties {
  let stroke = edgeColor(d);
  let strokeWidth = d.style.strokeWidth ?? 1.6;
  let strokeDasharray: string | undefined = dashFor(d.style.strokeStyle) ?? (d.derived ? "6 5" : undefined);
  if (d.changeColor) [stroke, strokeWidth] = [d.changeColor, Math.max(2.2, strokeWidth)];
  if (d.ghost) strokeDasharray = "3 5";
  if (d.highlight === "past") [stroke, strokeWidth] = [FLOW_PAST, 2];
  if (d.highlight === "current") [stroke, strokeWidth, strokeDasharray] = [FLOW_CURRENT, 2.6, undefined];
  if (selected) [stroke, strokeWidth] = ["#f59e0b", Math.max(3, strokeWidth)];
  return { stroke, strokeWidth, strokeDasharray, fill: "none", opacity: d.dimmed ? 0.2 : d.ghost ? 0.6 : 1 };
}

type Drag = { kind: "source" | "target" | "bend" | "label"; value: Pt | { t: number; offset: number } };

export function C4Edge({ id, source, target, data, selected, markerEnd, markerStart }: EdgeProps & { data?: C4EdgeData }) {
  const s = useInternalNode(source);
  const t = useInternalNode(target);
  const rf = useReactFlow();
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  if (!s || !t || !data) return null;

  const L: EdgeLayout = { ...data.layout };
  if (drag?.kind === "source") L.sourceAnchor = drag.value as Pt;
  if (drag?.kind === "target") L.targetAnchor = drag.value as Pt;
  if (drag?.kind === "bend") L.control = drag.value as Pt;
  if (drag?.kind === "label") L.labelT = (drag.value as { t: number }).t;

  const rs = rectOf(s);
  const rt = rectOf(t);
  const cs = centerOf(rs);
  const ct = centerOf(rt);
  const flip = source < target ? 1 : -1;
  const len = Math.hypot(ct.x - cs.x, ct.y - cs.y) || 1;
  const nx = (-(ct.y - cs.y) / len) * flip;
  const ny = ((ct.x - cs.x) / len) * flip;
  const parallel = { x: (cs.x + ct.x) / 2 + nx * data.offset, y: (cs.y + ct.y) / 2 + ny * data.offset };
  const aim = L.control ?? parallel;
  const p1 = L.sourceAnchor ? anchorPoint(rs, L.sourceAnchor) : borderPoint(rs, aim);
  const p2 = L.targetAnchor ? anchorPoint(rt, L.targetAnchor) : borderPoint(rt, aim);
  const routing = L.routing ?? (L.control || data.offset !== 0 ? "curved" : "straight");

  let pts: Poly;
  let path: string;
  if (routing === "orthogonal" || routing === "rounded") {
    const horizontal = Math.abs(p2.x - p1.x) >= Math.abs(p2.y - p1.y);
    if (horizontal) {
      const mx = L.control?.x ?? (p1.x + p2.x) / 2;
      pts = [p1, { x: mx, y: p1.y }, { x: mx, y: p2.y }, p2];
    } else {
      const my = L.control?.y ?? (p1.y + p2.y) / 2;
      pts = [p1, { x: p1.x, y: my }, { x: p2.x, y: my }, p2];
    }
    path = routing === "rounded" ? roundedPath(pts) : `M ${pts.map((p) => `${p.x} ${p.y}`).join(" L ")}`;
  } else if (routing === "smooth") {
    // S-curve that leaves and enters the boxes square to their sides (cubic Bezier).
    const o1 = outward(L.sourceAnchor, p1, p2);
    const o2 = outward(L.targetAnchor, p2, p1);
    const k = Math.max(40, Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.4);
    const c1 = { x: p1.x + o1.x * k, y: p1.y + o1.y * k };
    const c2 = { x: p2.x + o2.x * k, y: p2.y + o2.y * k };
    pts = Array.from({ length: 33 }, (_, i) => {
      const u = i / 32;
      const m = 1 - u;
      return {
        x: m ** 3 * p1.x + 3 * m * m * u * c1.x + 3 * m * u * u * c2.x + u ** 3 * p2.x,
        y: m ** 3 * p1.y + 3 * m * m * u * c1.y + 3 * m * u * u * c2.y + u ** 3 * p2.y,
      };
    });
    path = `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p2.x} ${p2.y}`;
  } else if (routing === "curved") {
    const c = { x: 2 * aim.x - (p1.x + p2.x) / 2, y: 2 * aim.y - (p1.y + p2.y) / 2 };
    pts = Array.from({ length: 25 }, (_, i) => {
      const u = i / 24;
      return { x: (1 - u) ** 2 * p1.x + 2 * (1 - u) * u * c.x + u * u * p2.x, y: (1 - u) ** 2 * p1.y + 2 * (1 - u) * u * c.y + u * u * p2.y };
    });
    path = `M ${p1.x} ${p1.y} Q ${c.x} ${c.y} ${p2.x} ${p2.y}`;
  } else {
    pts = [p1, p2];
    path = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
  }

  // A label slides along its line only; it never leaves it (labelOffset saved by older versions is ignored).
  const lt = Math.min(0.95, Math.max(0.05, L.labelT ?? 0.5));
  const at = pointAlong(pts, lt);
  const lx = at.p.x;
  const ly = at.p.y;
  const bend = pointAlong(pts, 0.5).p;

  const cls = ["c4-edge", data.derived ? "derived" : "", selected ? "selected" : "", data.highlight ?? "", data.dimmed ? "dimmed" : "", data.ghost ? "ghost" : ""].filter(Boolean).join(" ");

  const flowPoint = (e: React.PointerEvent): Pt => rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
  const begin = (kind: Drag["kind"]) => (e: React.PointerEvent) => {
    // Only the main button drags; a right-click opens the menu instead.
    if (!data.editable || e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    data.onSelect(id);
    dragRef.current = { kind, value: kind === "bend" ? bend : kind === "label" ? { t: lt, offset: 0 } : { x: 0, y: 0 } };
  };
  const move = (e: React.PointerEvent) => {
    const cur = dragRef.current;
    if (!cur) return;
    const p = flowPoint(e);
    let value: Drag["value"];
    if (cur.kind === "source") value = toAnchor(rs, p);
    else if (cur.kind === "target") value = toAnchor(rt, p);
    else if (cur.kind === "bend") value = p;
    else {
      const pr = project(pts, p);
      value = { t: Math.min(0.95, Math.max(0.05, Math.round(pr.t * 100) / 100)), offset: 0 };
    }
    dragRef.current = { kind: cur.kind, value };
    setDrag({ kind: cur.kind, value });
  };
  const end = () => {
    const cur = dragRef.current;
    dragRef.current = null;
    if (!cur) return;
    setDrag(null);
    const next: EdgeLayout = { ...data.layout };
    if (cur.kind === "source") next.sourceAnchor = cur.value as Pt;
    if (cur.kind === "target") next.targetAnchor = cur.value as Pt;
    if (cur.kind === "bend") next.control = cur.value as Pt;
    if (cur.kind === "label") {
      next.labelT = (cur.value as { t: number }).t;
      delete next.labelOffset;
    }
    if (JSON.stringify(next) !== JSON.stringify(data.layout)) data.onGeom(id, next);
  };
  const reset = (key: keyof EdgeLayout) => () => {
    const next = { ...data.layout };
    delete next[key];
    data.onGeom(id, next);
  };

  const techs = data.technologies.length ? data.technologies.join(", ") : "";
  const handleStyle = (p: Pt): React.CSSProperties => ({ transform: `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)` });
  // Right-click on the label or a grip (drawn in their own layer, outside the line) opens the line's menu.
  const grab = {
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: end,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      data.onContextMenu(id, { x: e.clientX, y: e.clientY });
    },
  };

  return (
    <>
      <BaseEdge id={id} path={path} className={cls} style={edgeStyle(data, !!selected)} markerEnd={markerEnd} markerStart={markerStart} interactionWidth={18} />
      <EdgeLabelRenderer>
        <div
          className={`edge-label nodrag nopan ${cls}${data.editable ? " movable" : ""}`}
          style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, fontSize: data.style.fontSize ? data.style.fontSize - 2 : undefined, color: data.style.text }}
          data-testid={`edge-${data.testId}`}
          onPointerDown={begin("label")}
          onClick={() => data.onSelect(id)}
          onDoubleClick={() => data.onOpen(id)}
          {...grab}
          title={data.hasDetail ? "Double-click to open the connector detail" : data.editable ? "Drag to slide the label along the line" : undefined}
        >
          <div>{data.label}</div>
          {techs && (
            <div className="edge-tech">
              <Icon name="code" size={10} /> {techs}
            </div>
          )}
          {(data.kind || data.sensitivityLevel || data.hasNotes || data.stageCount > 0 || data.openWork > 0) && (
            <div className="edge-badges">
              {data.kind && <span className="badge subtle">{data.kind.replace(/-/g, " ")}</span>}
              {data.stageCount > 0 && <span className="badge subtle">{data.stageCount} stages</span>}
              {data.sensitivityLevel && <span className={`badge sens-${data.sensitivityLevel}`}>Sensitive: {data.sensitivityLevel}</span>}
              {data.hasNotes && <span className="badge subtle">Notes</span>}
              {data.openWork > 0 && <span className="badge work">{data.openWork} open</span>}
            </div>
          )}
        </div>
        {selected && data.editable && !data.highlight && (
          <>
            <div className="edge-grip end nodrag nopan" style={handleStyle(p1)} onPointerDown={begin("source")} onDoubleClick={reset("sourceAnchor")} {...grab} title="Drag to move where the line starts (double-click: automatic)" data-testid="grip-source" />
            <div className="edge-grip end nodrag nopan" style={handleStyle(p2)} onPointerDown={begin("target")} onDoubleClick={reset("targetAnchor")} {...grab} title="Drag to move where the line ends (double-click: automatic)" data-testid="grip-target" />
            <div className="edge-grip bend nodrag nopan" style={handleStyle(bend)} onPointerDown={begin("bend")} onDoubleClick={reset("control")} {...grab} title="Drag to bend the line (double-click: straighten)" data-testid="grip-bend" />
          </>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

export const nodeTypes = { c4: C4Node, boundary: BoundaryNode };
export const edgeTypes = { c4: C4Edge };

/** Arrowheads beyond the two built into the canvas library. They take the colour of their line. */
export const CUSTOM_HEADS = ["diamond", "diamond-open", "circle", "bar"] as const;
export function MarkerDefs() {
  const common = { viewBox: "0 0 20 20", markerWidth: 14, markerHeight: 14, orient: "auto-start-reverse", markerUnits: "userSpaceOnUse" } as const;
  return (
    <svg className="marker-defs" width="0" height="0" aria-hidden="true">
      <defs>
        <marker id="dp-head-diamond" refX="19" refY="10" {...common}>
          <path d="M1 10 L10 4 L19 10 L10 16 Z" style={{ fill: "context-stroke", stroke: "context-stroke" }} />
        </marker>
        <marker id="dp-head-diamond-open" refX="19" refY="10" {...common}>
          <path d="M1 10 L10 4 L19 10 L10 16 Z" style={{ fill: "#121417", stroke: "context-stroke", strokeWidth: 1.5 }} />
        </marker>
        <marker id="dp-head-circle" refX="17" refY="10" {...common}>
          <circle cx="10" cy="10" r="6" style={{ fill: "context-stroke", stroke: "context-stroke" }} />
        </marker>
        <marker id="dp-head-bar" refX="17" refY="10" {...common}>
          <path d="M17 3 L17 17" style={{ fill: "none", stroke: "context-stroke", strokeWidth: 2.5 }} />
        </marker>
      </defs>
    </svg>
  );
}
