import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  NodeResizer,
  NodeToolbar,
  Position,
  useInternalNode,
  useNodeId,
  useReactFlow,
  useStore,
  type EdgeProps,
  type InternalNode,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { canvasInsets } from "./coveredEdges";
import { estimateLabelSize } from "./labelSize";
import { NODE_H, NODE_W } from "./layout";
import { Icon, iconFor } from "../common/icons";
import {
  defaultLabelT,
  handleBesideLabel,
  moveSegment,
  orthoRoute,
  routeThrough,
  sideOfAnchor,
  snapAxis,
  STRAIGHT_TOLERANCE,
  straightenJogs,
  tidyRoute,
  type Box,
  type Port,
  type PortPair,
  type RouteEnd,
} from "./routing";
import { Shape, shapeInset } from "./typeSymbols";
import { KIND_LABEL, type DiagramNode, type EdgeLayout, type Pt, type Section, type Style } from "../types";
import { pinKind, pinSummary, type CommentCount } from "../common/comments";
import { KIND_HUE } from "../lineColours";
import { EdgeTestingBadges, NodeTestingBadges } from "../testing/TestingBadges";
import type { EdgeMark, NodeMark } from "../testing/testingDecor";

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
  return `#${a
    .map((v, i) =>
      Math.round(v * t + b[i] * (1 - t))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
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
  /** The inline rename of a box ended without a new name: it keeps its ID. */
  keepId(id: string): void;
  setArchType(id: string, archType: string): void;
  duplicate(id: string): void;
  remove(id: string): void;
  /** Delete several boxes after one question (one undo step). */
  removeMany(ids: string[]): void;
  open(key: string): void;
}

const MODEL_KINDS = new Set(["person", "softwareSystem", "container", "component"]);

export type C4NodeData = {
  el: DiagramNode;
  /** The diagram has its own colours (a tint per kind of box, a pipeline's hue on its stages); false: plain boxes. */
  colourful: boolean;
  /** The stage of a pipeline's inside view: the pipeline's hue, and how strongly it shows (stronger along the pipeline). */
  accent: { color: string; strength: number } | null;
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
  /** Comment threads about this box (null: none, or the box is not an element). */
  comments: CommentCount | null;
  /** System testing mode: the breakpoint, point and trace marks of this box. */
  testing?: NodeMark | null;
  onComments(id: string): void;
  actions: NodeActions | null;
  archTypes: { id: string; label: string }[];
  /** Part of a selection of several boxes: no quick bar, resize handles or click-to-rename. */
  multi: boolean;
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

/** Shortens a description for a tooltip (the full text is in the details panel). */
const brief = (t: string, n = 180) => (t.length > n ? `${t.slice(0, n).trimEnd()}…` : t);

function InlineName({ value, fontSize, onDone }: { value: string; fontSize: number; onDone(v: string | null): void }) {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  // Enter (or Escape) and the blur that follows when the field goes away must report once.
  const finish = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    onDone(save && v.trim() && v.trim() !== value ? v.trim() : null);
  };
  return (
    <input
      ref={ref}
      className="inline-name nodrag nopan"
      style={{ fontSize }}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") finish(false);
      }}
      onBlur={() => finish(true)}
      onDoubleClick={(e) => e.stopPropagation()}
      aria-label="Name"
      data-testid="inline-name"
    />
  );
}

/** Space between a box and the bar above (or below) it, and between the bar and the canvas edge. */
const BAR_OFFSET = 14;
const BAR_MARGIN = 8;

/**
 * The bar of quick edits next to the selected box. It sits above the box; when that would put it under the
 * top bars (or off the canvas) it goes below the box, and it is moved sideways when the box is near the left or
 * right edge, so it is always whole and inside the canvas.
 */
function QuickBar({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  const id = useNodeId();
  const node = useInternalNode(id ?? "");
  const dom = useStore((s) => s.domNode);
  const [vx, vy, zoom] = useStore((s) => s.transform);
  const bar = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ pos: Position; dx: number }>({ pos: Position.Top, dx: 0 });
  const nx = node?.internals.positionAbsolute.x;
  const ny = node?.internals.positionAbsolute.y;
  const nw = node?.measured.width ?? node?.width ?? 0;
  const nh = node?.measured.height ?? node?.height ?? 0;
  useLayoutEffect(() => {
    const el = bar.current;
    if (!visible || !el || !dom || nx === undefined || ny === undefined) return;
    const area = dom.closest<HTMLElement>(".canvas-wrap") ?? dom;
    const canvas = dom.getBoundingClientRect();
    const ins = canvasInsets(area);
    const [W, H] = [el.offsetWidth, el.offsetHeight];
    const left = nx * zoom + vx;
    const top = ny * zoom + vy;
    const cx = left + (nw * zoom) / 2;
    const fitsAbove = top - BAR_OFFSET - H >= ins.top - BAR_MARGIN * 2;
    const fitsBelow = top + nh * zoom + BAR_OFFSET + H <= canvas.height - BAR_MARGIN;
    const pos = fitsAbove || !fitsBelow ? Position.Top : Position.Bottom;
    const lo = BAR_MARGIN;
    const hi = Math.max(lo, canvas.width - BAR_MARGIN - W);
    const dx = Math.round(Math.min(hi, Math.max(lo, cx - W / 2)) - (cx - W / 2));
    setPlace((p) => (p.pos === pos && p.dx === dx ? p : { pos, dx }));
  }, [visible, dom, nx, ny, nw, nh, vx, vy, zoom, children]);
  return (
    <NodeToolbar isVisible={visible} position={place.pos} offset={BAR_OFFSET} className="quick-bar-wrap nodrag nopan" align="center">
      <div className="quick-bar nodrag nopan" ref={bar} style={place.dx ? { transform: `translateX(${place.dx}px)` } : undefined}>
        {children}
      </div>
    </NodeToolbar>
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
  // Colour of its own: a pipeline's hue on a stage, else a quiet tint of the kind. A fill or line colour set by hand and an overlay come first.
  const hue = data.colourful && !overlay?.color ? (data.accent?.color ?? KIND_HUE[el.kind] ?? null) : null;
  if (hue) {
    const k = data.accent ? data.accent.strength : 1;
    const [bgShare, lineShare] = data.accent ? [0.16 * k, 0.75 * k] : el.external ? [0.04, 0.35] : [0.08, 0.45];
    if (!st.fill) bg = mix(hue, bg, bgShare);
    if (!st.stroke) stroke = mix(hue, CARD_STROKE, lineShare);
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
  // What hovering a box says: kind and symbol, technology and a short description, then what a double-click or a click does.
  const symbol = el.kind !== "person" && el.archType ? data.archTypes.find((a) => a.id === el.archType)?.label : undefined;
  const symbolName = symbol ?? (type === "person" ? "Person" : KIND_LABEL[el.kind]);
  const hint = !act
    ? el.drillKey
      ? "Double-click to open the next level"
      : ""
    : selected
      ? "Click the name to rename"
      : el.drillKey
        ? "Double-click to open the next level; select, then click the name to rename"
        : "Double-click to rename";
  const tip =
    [
      el.name.length > 28 ? el.name : "",
      [typeLabel(el), symbol && el.archType !== "box" ? symbol : ""].filter(Boolean).join(" · "),
      el.technologies?.length ? el.technologies.join(", ") : "",
      el.description ? brief(el.description) : "",
      hint,
    ]
      .filter(Boolean)
      .join("\n") || undefined;
  const cls = [
    "c4-node",
    "nokey", // Shift+click (or Ctrl/Cmd+click) on a box toggles it in the selection instead of starting a selection box
    `kind-${el.kind}`,
    outline ? "outline" : "card",
    selected ? "selected" : "",
    data.flowActive ? "flow-active" : "",
    data.dimmed ? "dimmed" : "",
    data.focused ? "focused" : "",
    overlay && !overlay.color ? "no-value" : "",
    el.external ? "external" : "",
    el.outside ? "outside" : "",
    el.ghost ? "ghost" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls} style={{ color: fg, width: w, height: h }} data-testid={`node-${el.id}`} data-change={el.change} data-shape={type} data-tip={tip}>
      {outline ? (
        <Shape type={type} w={w} h={h} s={{ fill: bg, stroke, strokeWidth: sw, dash }} />
      ) : (
        <div className="card-bg" style={{ background: bg, borderColor: stroke, borderWidth: sw, borderStyle: dash ? "dashed" : "solid" }} />
      )}
      {el.kind === "person" && (
        <div className="person-badge" style={{ borderColor: stroke }} data-tip="Person">
          <Icon name="person" size={14} />
        </div>
      )}
      {el.drillKey && el.childCount > 0 && (
        <div className="drill-mark" title={`${el.childCount} inside; double-click to open`}>
          <Icon name="search" size={11} /> {el.childCount}
        </div>
      )}
      {el.drillKey && el.childCount === 0 && (
        <div className="drill-mark open-mark" title="Nothing inside yet; double-click to open and add" data-testid={`open-mark-${el.id}`}>
          <Icon name="search" size={11} /> open
        </div>
      )}
      {data.comments && data.comments.open > 0 && (
        <button
          className={`comment-pin ck-${pinKind(data.comments)}`}
          onClick={(e) => {
            e.stopPropagation();
            data.onComments(el.id);
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          title={`${pinSummary(data.comments)}. Click to read.`}
          aria-label={`${data.comments.open} open comments`}
          data-testid={`comments-${el.id}`}
        >
          <Icon name="comment" size={11} /> {data.comments.open}
        </button>
      )}
      {data.testing && <NodeTestingBadges id={el.id} mark={data.testing} />}
      {overlay && (
        <div className={`ov-chip${overlay.color ? "" : " none"}`} data-testid={`badge-${el.id}`} title={`${overlay.group}: ${overlay.value ?? "no value"}`}>
          {overlay.color && <span className="dot" style={{ background: overlay.color }} />}
          {overlay.chip}
        </div>
      )}
      <div className="c4-content" style={{ paddingTop: inset.top, paddingBottom: inset.bottom, paddingLeft: inset.left, paddingRight: inset.right }}>
        <div className="c4-title">
          {el.kind !== "person" && (
            <span className="c4-icon" style={{ color: (data.colourful ? KIND_HUE : KIND_COLOR)[el.kind] }} data-tip={symbolName}>
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
                else act.keepId(el.id);
              }}
            />
          ) : (
            <span
              className="c4-name"
              style={{ fontSize: fs }}
              onClick={() => {
                // Clicking the name of a box that is already selected renames it, unless the click
                // turns out to be the first half of a double-click (which opens the box).
                if (!act || !selected || data.multi) return;
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
            >
              {el.name}
            </span>
          )}
        </div>
        {data.showDescriptions && el.description && (
          <div className="c4-desc" style={{ fontSize: Math.max(10, fs - 4) }}>
            {el.description}
          </div>
        )}
        {el.kind === "stage" && el.linkedElementName && <div className="c4-type">→ {el.linkedElementName}</div>}
        {el.kind === "file" && el.lineCount != null && <div className="c4-type">{el.lineCount} lines</div>}
        <div className="c4-type" style={{ fontSize: Math.max(9, fs - 5) }}>
          {typeLabel(el)}
          {techs && <span className="c4-tech"> · {techs}</span>}
        </div>
        <div className="c4-badges">
          {has("cost") && data.costLabel && !overlay && (
            <span className="badge cost" data-tip="Monthly cost, with everything inside it">
              {data.costLabel}
            </span>
          )}
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
            <span className={`badge sens-${el.sensitivityLevel}`} data-tip={`Data sensitivity: ${el.sensitivityLevel}`} data-testid={`sensitive-${el.id}`}>
              Sensitive: {el.sensitivityLevel}
            </span>
          )}
          {has("usage") && freq && (
            <span className="badge subtle" data-tip={`How often it is used: ${freq}`}>
              Used {freq}
            </span>
          )}
          {has("notes") && el.notes && (
            <span className="badge subtle" data-tip="Has notes: select the box to read them" data-testid={`notes-${el.id}`}>
              Notes
            </span>
          )}
          {has("tradeoffs") && el.tradeoffs.length > 0 && (
            <span className="badge subtle" data-tip={el.tradeoffs.map((t) => `${t.kind}: ${t.text}`).join("\n")}>
              Tradeoffs {el.tradeoffs.length}
            </span>
          )}
          {has("code") && el.codePaths.length > 0 && el.kind !== "file" && (
            <span className="badge subtle" data-tip={`Linked to code: ${el.codePaths.join(", ")}`}>
              Code
            </span>
          )}
        </div>
      </div>
      {act && (
        <QuickBar visible={selected && !renaming && !data.multi}>
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
        </QuickBar>
      )}
      <NodeResizer
        isVisible={selected && data.editable && !data.multi}
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
        <Icon name={data.kind === "container" ? "container" : "system"} size={12} /> <span title={data.name}>{data.name}</span>
      </div>
      <div className="boundary-foot">
        {data.description && <div>{data.description}</div>}
        <div>{KIND_LABEL[data.kind as keyof typeof KIND_LABEL]}</div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ edges

export type R = { x: number; y: number; w: number; h: number };

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

export function pointAlong(pts: Poly, t: number): { p: Pt; nx: number; ny: number } {
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
      const side = Math.sign((q.x - px) * -dy + (q.y - py) * dx) || 1;
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
  /** Planned line ends for right-angle lines (computed for the whole diagram, not saved). */
  ports?: PortPair;
  /** The planned route of a right-angle line, and where its label sits when `layout.labelT` is not set (both from the whole diagram). */
  route?: Pt[];
  labelT?: number;
  /** Every box of the diagram (one array shared by all lines; `orthoRoute` skips the line's own two), for routes recomputed while dragging. */
  obstacles?: Box[];
  highlight: "current" | "past" | null;
  response: boolean;
  dimmed: boolean;
  testId: string;
  style: Style;
  layout: EdgeLayout;
  /** The diagram's default line shape, for a line with no shape of its own (null: rounded right angles). */
  defaultRouting: EdgeLayout["routing"] | null;
  sensitivityLevel: string | null;
  hasNotes: boolean;
  stageCount: number;
  openWork: number;
  /** Open comment threads about the relationship, and whether one is a question. */
  comments: CommentCount | null;
  /** System testing mode: the marks of this line. */
  testing?: EdgeMark | null;
  hasDetail: boolean;
  editable: boolean;
  /** Only in the compared version (drawn faded, dotted). */
  ghost?: boolean;
  /** Colour by change, when the Changes overlay is on. */
  changeColor?: string | null;
  /** The colour the line has by itself (its connection kind, or its pipeline's hue), and a pattern that goes with it. */
  auto?: { color: string; dash?: string; group: string } | null;
  onGeom(id: string, layout: EdgeLayout): void;
  onSelect(id: string): void;
  onOpen(id: string): void;
  /** Right-click on the label (drawn in its own layer, so the line's own handler does not see it). */
  onContextMenu(id: string, client: Pt): void;
};

export const FLOW_CURRENT = "#5ee1f5";
const FLOW_PAST = "#2a7f8f";

export function edgeColor(d: { derived: boolean; style: Style; auto?: { color: string } | null }): string {
  return d.style.stroke ?? d.auto?.color ?? (d.derived ? "#4f565f" : "#6b727c");
}

// Inline (not only CSS) so SVG/PNG export keeps the lines.
function edgeStyle(d: C4EdgeData, selected: boolean): React.CSSProperties {
  let stroke = edgeColor(d);
  let strokeWidth = d.style.strokeWidth ?? (d.auto?.group === "pipeline" ? 2.2 : 1.6);
  let strokeDasharray: string | undefined = dashFor(d.style.strokeStyle) ?? (d.derived ? "6 5" : d.auto?.dash);
  if (d.changeColor) [stroke, strokeWidth] = [d.changeColor, Math.max(2.2, strokeWidth)];
  if (d.ghost) strokeDasharray = "3 5";
  if (d.highlight === "past") [stroke, strokeWidth] = [FLOW_PAST, 2];
  if (d.highlight === "current") [stroke, strokeWidth, strokeDasharray] = [FLOW_CURRENT, 2.6, undefined];
  if (selected) [stroke, strokeWidth] = ["#f59e0b", Math.max(3, strokeWidth)];
  return { stroke, strokeWidth, strokeDasharray, fill: "none", opacity: d.dimmed ? 0.2 : d.ghost ? 0.6 : 1 };
}

/**
 * Where a line that is not a right-angle line is drawn: its two ends on the box borders (towards the bend point, or towards the
 * middle shifted sideways for parallel lines), the sampled polyline and the SVG path. `flip` is 1 when source < target by id.
 * For right-angle lines only `p1`/`p2` (the centre-aimed ends) are meaningful; the route comes from the planner.
 */
export function lineShape(rs: R, rt: R, L: EdgeLayout, routing: NonNullable<EdgeLayout["routing"]>, flip: 1 | -1, offset: number): { p1: Pt; p2: Pt; pts: Pt[]; path: string } {
  const cs = centerOf(rs);
  const ct = centerOf(rt);
  const len = Math.hypot(ct.x - cs.x, ct.y - cs.y) || 1;
  const nx = (-(ct.y - cs.y) / len) * flip;
  const ny = ((ct.x - cs.x) / len) * flip;
  const parallel = { x: (cs.x + ct.x) / 2 + nx * offset, y: (cs.y + ct.y) / 2 + ny * offset };
  const aim = L.control ?? parallel;
  const p1 = L.sourceAnchor ? anchorPoint(rs, L.sourceAnchor) : borderPoint(rs, aim);
  const p2 = L.targetAnchor ? anchorPoint(rt, L.targetAnchor) : borderPoint(rt, aim);
  // A straight line with corners set by hand is a polyline through them (its ends aim at the nearest corner).
  const corners = routing === "straight" ? layoutPoints(L) : undefined;
  if (corners) {
    const a = L.sourceAnchor ? anchorPoint(rs, L.sourceAnchor) : borderPoint(rs, corners[0]);
    const z = L.targetAnchor ? anchorPoint(rt, L.targetAnchor) : borderPoint(rt, corners[corners.length - 1]);
    const pts = [a, ...corners, z];
    return { p1: a, p2: z, pts, path: `M ${pts.map((p) => `${p.x} ${p.y}`).join(" L ")}` };
  }
  if (routing === "smooth") {
    // S-curve that leaves and enters the boxes square to their sides (cubic Bezier).
    const o1 = outward(L.sourceAnchor, p1, p2);
    const o2 = outward(L.targetAnchor, p2, p1);
    const k = Math.max(40, Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.4);
    const c1 = { x: p1.x + o1.x * k, y: p1.y + o1.y * k };
    const c2 = { x: p2.x + o2.x * k, y: p2.y + o2.y * k };
    const pts = Array.from({ length: 33 }, (_, i) => {
      const u = i / 32;
      const m = 1 - u;
      return {
        x: m ** 3 * p1.x + 3 * m * m * u * c1.x + 3 * m * u * u * c2.x + u ** 3 * p2.x,
        y: m ** 3 * p1.y + 3 * m * m * u * c1.y + 3 * m * u * u * c2.y + u ** 3 * p2.y,
      };
    });
    return { p1, p2, pts, path: `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p2.x} ${p2.y}` };
  }
  if (routing === "curved") {
    const c = { x: 2 * aim.x - (p1.x + p2.x) / 2, y: 2 * aim.y - (p1.y + p2.y) / 2 };
    const pts = Array.from({ length: 25 }, (_, i) => {
      const u = i / 24;
      return { x: (1 - u) ** 2 * p1.x + 2 * (1 - u) * u * c.x + u * u * p2.x, y: (1 - u) ** 2 * p1.y + 2 * (1 - u) * u * c.y + u * u * p2.y };
    });
    return { p1, p2, pts, path: `M ${p1.x} ${p1.y} Q ${c.x} ${c.y} ${p2.x} ${p2.y}` };
  }
  return { p1, p2, pts: [p1, p2], path: `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}` };
}

type Drag =
  | { kind: "source" | "target" | "bend"; value: Pt }
  | { kind: "label"; value: { t: number; offset: number } }
  /** The whole route of a right-angle line while one of its pieces is dragged. */
  | { kind: "segment"; value: Pt[] }
  /** The corners of a straight line while one of them is dragged. */
  | { kind: "points"; value: Pt[] };

/** Where a press on the line or a grip started, and the shape then (a drag starts only once the pointer has moved a little). */
type DragStart = { kind: Drag["kind"]; at: Pt; moved: boolean; route?: Pt[]; index?: number; ends?: { source: RouteEnd; target: RouteEnd }; bend?: Pt; points?: Pt[]; t?: number };

/** A piece of a right-angle line shorter than this (px) gets no handle of its own; the line itself can still be grabbed there. */
const MIN_HANDLE_PIECE = 28;

/** The pointer moves this far (screen px) before a press counts as a drag (a click only selects). */
const DRAG_START = 3;
const round1 = (p: Pt): Pt => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });

/** The exact fraction of a box a point on its border is at: a hand-set anchor that keeps a snapped end exactly where it was put. */
function anchorAt(r: R, p: Pt): Pt {
  const a = toAnchor(r, p);
  const fx = Math.round(Math.min(Math.max((p.x - r.x) / r.w, 0), 1) * 1e4) / 1e4;
  const fy = Math.round(Math.min(Math.max((p.y - r.y) / r.h, 0), 1) * 1e4) / 1e4;
  return a.x === 0 || a.x === 1 ? { x: a.x, y: fy } : { x: fx, y: a.y };
}

/** The corners set by hand on a line (`EdgeLayout.points`), when they are usable (a file edited by hand may hold anything). */
export function layoutPoints(L: EdgeLayout): Pt[] | undefined {
  const p: unknown = L.points;
  return Array.isArray(p) && p.length > 0 && p.every((q) => !!q && Number.isFinite(q.x) && Number.isFinite(q.y)) ? (p as Pt[]) : undefined;
}

/** Index of the piece of a polyline nearest to `q`. */
function nearestPiece(pts: Poly, q: Pt): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const k = Math.min(Math.max(((q.x - a.x) * dx + (q.y - a.y) * dy) / len2, 0), 1);
    const d = Math.hypot(q.x - (a.x + dx * k), q.y - (a.y + dy * k));
    if (d < bestD) [best, bestD] = [i - 1, d];
  }
  return best;
}

export function C4Edge({ id, source, target, data, selected, markerEnd, markerStart }: EdgeProps & { data?: C4EdgeData }) {
  const s = useInternalNode(source);
  const t = useInternalNode(target);
  const rf = useReactFlow();
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const startRef = useRef<DragStart | null>(null);
  /** This render's move and end, for the window listeners a drag adds (see capture). */
  const live = useRef<{ move(e: { clientX: number; clientY: number }): void; end(): void }>({ move: () => {}, end: () => {} });
  // The label's drawn size (canvas units: offset sizes ignore the zoom), so piece handles keep clear of it.
  const [labelDrawn, setLabelDrawn] = useState<{ w: number; h: number } | null>(null);
  const measureLabel = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const measure = () => setLabelDrawn((cur) => (cur && cur.w === el.offsetWidth && cur.h === el.offsetHeight ? cur : { w: el.offsetWidth, h: el.offsetHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (!s || !t || !data) return null;

  const L: EdgeLayout = { ...data.layout };
  if (drag?.kind === "source") L.sourceAnchor = drag.value;
  if (drag?.kind === "target") L.targetAnchor = drag.value;
  if (drag?.kind === "bend") L.control = drag.value;
  if (drag?.kind === "label") L.labelT = drag.value.t;
  if (drag?.kind === "points") L.points = drag.value;
  const manualPts = layoutPoints(L);
  if (!manualPts) delete L.points;

  const rs = rectOf(s);
  const rt = rectOf(t);
  const cs = centerOf(rs);
  const ct = centerOf(rt);
  const routing = L.routing ?? data.defaultRouting ?? "rounded";
  const rightAngles = routing === "orthogonal" || routing === "rounded";
  const flip = source < target ? 1 : -1;
  const shape = lineShape(rs, rt, L, routing, flip, data.offset);
  const { p1, p2 } = shape;

  // The planned ports spread the line ends along the box sides; a grip being dragged overrides its own end.
  const port = (r: R, anchor: Pt | undefined, planned: Port | undefined, other: Pt, dragging: boolean): Port => {
    if (anchor && (dragging || !planned)) return { ...anchorPoint(r, anchor), side: sideOfAnchor(anchor) };
    if (planned) return planned;
    const p = borderPoint(r, other);
    return { ...p, side: sideOfAnchor(toAnchor(r, p)) };
  };
  /** The route of a right-angle line with layout `lay`: the diagram-wide route, unless an end or the bend is being dragged (then it follows the pointer, through the hand-set points if there are any). */
  const routeFor = (lay: EdgeLayout, moving: Drag["kind"] | null): { pts: Pt[]; ends: { source: Port; target: Port } } => {
    if (data.route && data.ports && (!moving || moving === "label" || moving === "segment")) return { pts: data.route, ends: data.ports };
    const own = layoutPoints(lay);
    const man = own ? routeThrough(rs, rt, own, lay.sourceAnchor, lay.targetAnchor) : null;
    if (man) return { pts: man.pts, ends: { source: man.source, target: man.target } };
    const src = port(rs, lay.sourceAnchor, data.ports?.source, lay.control ?? ct, moving === "source");
    const dst = port(rt, lay.targetAnchor, data.ports?.target, lay.control ?? cs, moving === "target");
    return { pts: orthoRoute(src, dst, rs, rt, lay.control, data.obstacles), ends: { source: src, target: dst } };
  };

  let pts: Poly;
  let path: string;
  let ends: { source: Port; target: Port } | null = null;
  if (rightAngles) {
    const r = routeFor(L, drag?.kind ?? null);
    pts = drag?.kind === "segment" ? drag.value : r.pts;
    ends = r.ends;
    path = routing === "rounded" ? roundedPath(pts) : `M ${pts.map((p) => `${p.x} ${p.y}`).join(" L ")}`;
  } else {
    pts = shape.pts;
    path = shape.path;
  }

  // A label slides along its line only; it never leaves it (labelOffset saved by older versions is ignored).
  const lt = Math.min(0.95, Math.max(0.05, L.labelT ?? (rightAngles ? (data.labelT ?? defaultLabelT(pts)) : 0.5)));
  const at = pointAlong(pts, lt);
  const lx = at.p.x;
  const ly = at.p.y;
  // The label's box as drawn, or as the planner estimates it before it is drawn (handleBesideLabel).
  const labelSize = labelDrawn ?? estimateLabelSize({ text: data.label, technologies: data.technologies, badges: [], fontSize: data.style.fontSize ? data.style.fontSize - 2 : undefined });
  // The grip sits on the bend point when there is one, so it does not jump when released.
  const bend = L.control ?? pointAlong(pts, 0.5).p;

  const cls = ["c4-edge", data.derived ? "derived" : "", selected ? "selected" : "", data.highlight ?? "", data.dimmed ? "dimmed" : "", data.ghost ? "ghost" : ""].filter(Boolean).join(" ");

  /** A dragged end, snapped so the line is straight when it nearly is (feature: a line a few px from straight becomes straight). */
  const snapEnd = (kind: "source" | "target", p: Pt): Pt => {
    const r = kind === "source" ? rs : rt;
    const key = kind === "source" ? "sourceAnchor" : "targetAnchor";
    let a = toAnchor(r, p);
    const lay: EdgeLayout = { ...data.layout, [key]: a };
    if (rightAngles) {
      const trial = routeFor(lay, kind);
      const end = (w: "source" | "target"): RouteEnd => ({ box: w === "source" ? rs : rt, side: trial.ends[w].side, fixed: w !== kind });
      const straight = straightenJogs(trial.pts, { source: end("source"), target: end("target"), obstacles: data.obstacles, moveInner: false });
      const [was, now] = kind === "source" ? [trial.pts[0], straight[0]] : [trial.pts[trial.pts.length - 1], straight[straight.length - 1]];
      if (now && was && (now.x !== was.x || now.y !== was.y)) a = anchorAt(r, now);
    } else if (routing === "straight") {
      const sh = lineShape(rs, rt, lay, routing, flip, data.offset).pts;
      const [mine, near] = kind === "source" ? [sh[0], sh[1]] : [sh[sh.length - 1], sh[sh.length - 2]];
      const q = snapAxis(mine, near);
      const side = sideOfAnchor(a);
      const onSide = side === "left" || side === "right" ? q.x === mine.x && q.y >= r.y && q.y <= r.y + r.h : q.y === mine.y && q.x >= r.x && q.x <= r.x + r.w;
      if (onSide && (q.x !== mine.x || q.y !== mine.y)) a = anchorAt(r, q);
    }
    return a;
  };
  /** A dragged bend of a curved line, put on the straight line between the ends when it is that close. */
  const snapBend = (c: Pt): Pt => {
    if (routing !== "curved") return c;
    const sh = lineShape(rs, rt, { ...L, control: c }, routing, flip, data.offset);
    const dx = sh.p2.x - sh.p1.x;
    const dy = sh.p2.y - sh.p1.y;
    const len2 = dx * dx + dy * dy;
    if (!len2) return c;
    const k = ((c.x - sh.p1.x) * dx + (c.y - sh.p1.y) * dy) / len2;
    const q = { x: sh.p1.x + dx * k, y: sh.p1.y + dy * k };
    return k > 0 && k < 1 && Math.hypot(c.x - q.x, c.y - q.y) <= STRAIGHT_TOLERANCE ? q : c;
  };
  /** A dragged corner of a straight line, made exactly horizontal or vertical to its neighbours when it nearly is (an end with no anchor counts from its box's middle). */
  const snapCorner = (list: Pt[], k: number, p: Pt): Pt => {
    const before = k > 0 ? list[k - 1] : L.sourceAnchor ? anchorPoint(rs, L.sourceAnchor) : cs;
    const after = k < list.length - 1 ? list[k + 1] : L.targetAnchor ? anchorPoint(rt, L.targetAnchor) : ct;
    return snapAxis(snapAxis(p, before), after);
  };

  const flowPoint = (e: { clientX: number; clientY: number }): Pt => rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
  /** Take the pointer for a drag (only the main button: a right-click opens the menu instead). */
  const capture = (e: React.PointerEvent): boolean => {
    if (!data.editable || e.button !== 0) return false;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    // The grip may be drawn again under another key while it is dragged (a piece handle, when the line gains corners),
    // which drops the pointer capture; the window still sees the moves and the release, so the drag always finishes.
    const id0 = e.pointerId;
    const onMove = (ev: PointerEvent) => ev.pointerId === id0 && live.current.move(ev);
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== id0) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      live.current.end();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    data.onSelect(id);
    return true;
  };
  const begin = (kind: "source" | "target" | "bend" | "label") => (e: React.PointerEvent) => {
    if (!capture(e)) return;
    startRef.current = { kind, at: flowPoint(e), moved: false, bend, t: lt };
  };
  const endsNow = (): { source: RouteEnd; target: RouteEnd } | undefined =>
    ends ? { source: { box: rs, side: ends.source.side, fixed: !!L.sourceAnchor }, target: { box: rt, side: ends.target.side, fixed: !!L.targetAnchor } } : undefined;
  /** A press on piece `i` of a right-angle line (its handle, or the line itself): drag that piece. */
  const grabPiece = (i: number) => (e: React.PointerEvent) => {
    if (!capture(e)) return;
    startRef.current = { kind: "segment", at: flowPoint(e), moved: false, route: pts.map((p) => ({ ...p })), index: i, ends: endsNow() };
  };
  /** A press on a straight or curved line (not on a grip): a straight line gets a new corner there, a curved one bends from there. */
  const grabLine = (e: React.PointerEvent) => {
    if (!capture(e)) return;
    const p = flowPoint(e);
    if (routing === "straight") {
      const j = nearestPiece(pts, p);
      const list = [...(manualPts ?? [])];
      list.splice(j, 0, p);
      startRef.current = { kind: "points", at: p, moved: false, points: list, index: j };
    } else startRef.current = { kind: "bend", at: p, moved: false, bend };
  };
  /** A press on a corner of a straight line. */
  const grabCorner = (k: number) => (e: React.PointerEvent) => {
    if (!capture(e) || !manualPts) return;
    startRef.current = { kind: "points", at: flowPoint(e), moved: false, points: [...manualPts], index: k };
  };
  const move = (e: { clientX: number; clientY: number }) => {
    const st = startRef.current;
    if (!st) return;
    const p = flowPoint(e);
    if (!st.moved && Math.hypot(p.x - st.at.x, p.y - st.at.y) < DRAG_START / (rf.getZoom() || 1)) return;
    st.moved = true;
    let next: Drag;
    if (st.kind === "source" || st.kind === "target") next = { kind: st.kind, value: snapEnd(st.kind, p) };
    else if (st.kind === "bend") next = { kind: "bend", value: snapBend({ x: st.bend!.x + p.x - st.at.x, y: st.bend!.y + p.y - st.at.y }) };
    else if (st.kind === "segment") {
      // The piece moves by as much as the pointer did (it does not jump to where the pointer is on the wide hit area).
      const from = st.route![st.index!]!;
      next = { kind: "segment", value: moveSegment(st.route!, st.index!, { x: from.x + p.x - st.at.x, y: from.y + p.y - st.at.y }, st.ends ?? {}) };
    } else if (st.kind === "points") {
      const list = [...st.points!];
      list[st.index!] = snapCorner(list, st.index!, p);
      next = { kind: "points", value: list };
    } else {
      const pr = project(pts, p);
      next = { kind: "label", value: { t: Math.min(0.95, Math.max(0.05, Math.round(pr.t * 100) / 100)), offset: 0 } };
    }
    dragRef.current = next;
    setDrag(next);
  };
  const end = () => {
    const st = startRef.current;
    const cur = dragRef.current;
    startRef.current = null;
    dragRef.current = null;
    if (!st) return;
    setDrag(null);
    if (!st.moved || !cur) return; // a click: nothing changes
    const next: EdgeLayout = { ...data.layout };
    if (cur.kind === "source") next.sourceAnchor = cur.value;
    else if (cur.kind === "target") next.targetAnchor = cur.value;
    else if (cur.kind === "bend") next.control = cur.value;
    else if (cur.kind === "label") {
      next.labelT = cur.value.t;
      delete next.labelOffset;
    } else if (cur.kind === "points") {
      next.points = cur.value.map(round1);
      delete next.control;
    } else if (cur.kind === "segment") {
      // The route's inner corners become the line's own; its ends follow from them (an end at a hand-set anchor stays).
      const route = tidyRoute(cur.value);
      const inner = route.slice(1, -1).map(round1);
      delete next.control;
      if (inner.length) next.points = inner;
      else {
        // A straight route moved sideways: no corners, so the ends where they slid to are kept as anchors.
        delete next.points;
        const [a, z] = [route[0], route[route.length - 1]];
        if (a && z && st.route) {
          if (a.x !== st.route[0].x || a.y !== st.route[0].y) next.sourceAnchor = anchorAt(rs, a);
          const last = st.route[st.route.length - 1];
          if (z.x !== last.x || z.y !== last.y) next.targetAnchor = anchorAt(rt, z);
        }
      }
    }
    if (JSON.stringify(next) !== JSON.stringify(data.layout)) data.onGeom(id, next);
  };
  live.current = { move, end };
  // A grip's double-click must not reach the line's own (React events bubble through the label portal), which opens the connector detail.
  const reset = (key: keyof EdgeLayout) => (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const next = { ...data.layout };
    delete next[key];
    data.onGeom(id, next);
  };
  /** Back to the automatic shape: no corners set by hand and no bend point. */
  const resetShape = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const next = { ...data.layout };
    delete next.points;
    delete next.control;
    if (JSON.stringify(next) !== JSON.stringify(data.layout)) data.onGeom(id, next);
  };
  const editing = !!selected && data.editable && !data.highlight;

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
      {editing &&
        (rightAngles ? (
          pts.slice(1).map((b, k) => {
            const a = pts[k];
            if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6) return null;
            return (
              <path
                key={k}
                d={`M ${a.x} ${a.y} L ${b.x} ${b.y}`}
                className="edge-hit nodrag nopan"
                style={{ stroke: "transparent", strokeWidth: 14, fill: "none", pointerEvents: "stroke", cursor: Math.abs(a.y - b.y) < 1e-6 ? "ns-resize" : "ew-resize" }}
                onPointerDown={grabPiece(k)}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={end}
                data-testid={`edge-hit-${k}`}
              />
            );
          })
        ) : (
          <path
            d={path}
            className="edge-hit nodrag nopan"
            style={{ stroke: "transparent", strokeWidth: 14, fill: "none", pointerEvents: "stroke", cursor: "move" }}
            onPointerDown={grabLine}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            data-testid="edge-hit"
          />
        ))}
      <EdgeLabelRenderer>
        <div
          className={`edge-label nodrag nopan ${cls}${data.editable ? " movable" : ""}`}
          style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, fontSize: data.style.fontSize ? data.style.fontSize - 2 : undefined, color: data.style.text }}
          data-testid={`edge-${data.testId}`}
          ref={measureLabel}
          onPointerDown={begin("label")}
          onClick={() => data.onSelect(id)}
          onDoubleClick={() => data.onOpen(id)}
          {...grab}
          title={
            [data.label.length > 40 ? data.label : "", data.hasDetail ? "Double-click to open the connector detail" : data.editable ? "Drag to slide the label along the line" : ""]
              .filter(Boolean)
              .join("\n") || undefined
          }
        >
          <div className="edge-text">{data.label}</div>
          {techs && (
            <div className="edge-tech">
              <Icon name="code" size={10} /> {techs}
            </div>
          )}
          {(data.kind || data.sensitivityLevel || data.hasNotes || data.stageCount > 0 || data.openWork > 0 || (data.comments?.open ?? 0) > 0 || data.testing) && (
            <div className="edge-badges">
              {data.testing && <EdgeTestingBadges id={data.testId} mark={data.testing} />}
              {data.kind && <span className="badge subtle">{data.kind.replace(/-/g, " ")}</span>}
              {data.stageCount > 0 && <span className="badge subtle">{data.stageCount} stages</span>}
              {data.sensitivityLevel && <span className={`badge sens-${data.sensitivityLevel}`}>Sensitive: {data.sensitivityLevel}</span>}
              {data.hasNotes && <span className="badge subtle">Notes</span>}
              {data.openWork > 0 && <span className="badge work">{data.openWork} open</span>}
              {data.comments && data.comments.open > 0 && (
                <span className={`badge comments ck-${pinKind(data.comments)}`} title={`${pinSummary(data.comments)}. Click the line to read.`} data-testid={`comments-edge-${data.testId}`}>
                  <Icon name="comment" size={10} /> {data.comments.open}
                </span>
              )}
            </div>
          )}
        </div>
        {editing && (
          <>
            <div
              className="edge-grip end nodrag nopan"
              style={handleStyle(rightAngles ? pts[0]! : p1)}
              onPointerDown={begin("source")}
              onDoubleClick={reset("sourceAnchor")}
              {...grab}
              title="Drag to move where the line starts (double-click: automatic)"
              data-testid="grip-source"
            />
            <div
              className="edge-grip end nodrag nopan"
              style={handleStyle(rightAngles ? pts[pts.length - 1]! : p2)}
              onPointerDown={begin("target")}
              onDoubleClick={reset("targetAnchor")}
              {...grab}
              title="Drag to move where the line ends (double-click: automatic)"
              data-testid="grip-target"
            />
            {rightAngles &&
              pts.slice(1).map((b, k) => {
                const a = pts[k];
                if (Math.hypot(b.x - a.x, b.y - a.y) < MIN_HANDLE_PIECE) return null;
                const across = Math.abs(a.y - b.y) < 1e-6 ? "ns-resize" : "ew-resize";
                // A handle is never taken away while it may hold the pointer: when the label covers the whole piece it stays in the middle.
                const at = handleBesideLabel(a, b, { x: lx, y: ly, ...labelSize }) ?? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
                return (
                  <div
                    key={k}
                    className="edge-grip seg nodrag nopan"
                    style={{ ...handleStyle(at), cursor: across }}
                    onPointerDown={grabPiece(k)}
                    onDoubleClick={resetShape}
                    {...grab}
                    title="Drag to move this part of the line (double-click: automatic shape)"
                    data-testid={`grip-seg-${k}`}
                  />
                );
              })}
            {routing === "straight" &&
              manualPts?.map((p, k) => (
                <div
                  key={k}
                  className="edge-grip bend nodrag nopan"
                  style={handleStyle(p)}
                  onPointerDown={grabCorner(k)}
                  onDoubleClick={resetShape}
                  {...grab}
                  title="Drag to move this corner (double-click: straight line)"
                  data-testid={`grip-point-${k}`}
                />
              ))}
            {(routing === "curved" || routing === "smooth") && (
              <div
                className="edge-grip bend nodrag nopan"
                style={handleStyle(bend)}
                onPointerDown={begin("bend")}
                onDoubleClick={resetShape}
                {...grab}
                title="Drag to bend the line (double-click: straighten)"
                data-testid="grip-bend"
              />
            )}
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
