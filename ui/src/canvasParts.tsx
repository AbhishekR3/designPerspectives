import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  NodeResizer,
  Position,
  useInternalNode,
  useReactFlow,
  type EdgeProps,
  type InternalNode,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { useRef, useState } from "react";
import { NODE_H, NODE_W } from "./layout";
import { Shape, shapeInset } from "./shapes";
import { KIND_LABEL, type DiagramNode, type EdgeLayout, type Pt, type Section, type Style } from "./types";

// C4 colours (as used in the C4 model examples).
export const KIND_COLOR: Record<string, string> = {
  person: "#08427b",
  softwareSystem: "#1168bd",
  container: "#438dd5",
  component: "#85bbf0",
  stage: "#6b4fa0",
  file: "#4f7f6a",
};
const EXTERNAL_COLOR = "#8a8a8a";
const FREQ_ORDER = ["rarely", "monthly", "weekly", "daily", "hourly", "continuous"];

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

export function dashFor(s?: Style["strokeStyle"]): string | undefined {
  return s === "dashed" ? "8 5" : s === "dotted" ? "2 4" : undefined;
}

export interface OverlayInfo {
  group: string;
  value: string | null;
  color: string | null;
}

export type Rect4 = { x: number; y: number; width: number; height: number };

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
  editable: boolean;
  onResize(id: string, r: Rect4): void;
  onResizeEnd(id: string, r: Rect4): void;
};
export type C4NodeType = Node<C4NodeData, "c4">;

export function C4Node({ data, selected }: NodeProps<C4NodeType>) {
  const { el, overlay, w, h } = data;
  const st = el.style ?? {};
  let bg = st.fill ?? (el.external || !el.inScope ? EXTERNAL_COLOR : KIND_COLOR[el.kind]);
  if (!st.fill && el.external && el.kind === "person") bg = "#686868";
  let stroke = st.stroke ?? darken(bg);
  let dash = dashFor(st.strokeStyle);
  if (overlay) {
    if (overlay.color) {
      bg = overlay.color;
      stroke = st.stroke ?? darken(bg);
    } else {
      bg = "#eceff3";
      stroke = "#9aa3ad";
      dash = "6 4";
    }
  }
  const fg = overlay ? textColorFor(bg) : st.text ?? textColorFor(bg);
  const type = el.kind === "person" ? "person" : el.archType || "box";
  const inset = shapeInset(type, w, h);
  const techs = el.technologies?.length ? el.technologies.join(", ") : "";
  const tech = techs ? `${KIND_LABEL[el.kind]}: ${techs}` : KIND_LABEL[el.kind];
  const fs = st.fontSize ?? 15;
  const has = (s: Section) => data.sections.includes(s);
  const freq = el.usage.length ? el.usage.map((u) => u.frequency).sort((a, b) => FREQ_ORDER.indexOf(b) - FREQ_ORDER.indexOf(a))[0] : null;
  return (
    <div
      className={`c4-node kind-${el.kind}${selected ? " selected" : ""}${data.flowActive ? " flow-active" : ""}${data.dimmed ? " dimmed" : ""}`}
      style={{ color: fg, width: w, height: h }}
      data-testid={`node-${el.id}`}
      data-shape={type}
      title={el.drillKey ? "Double-click to open the next level" : undefined}
    >
      <Shape type={type} w={w} h={h} s={{ fill: bg, stroke, strokeWidth: st.strokeWidth ?? 1.5, dash }} />
      <div className="c4-content" style={{ paddingTop: inset.top, paddingBottom: inset.bottom, paddingLeft: inset.left, paddingRight: inset.right }}>
        <div className="c4-name" style={{ fontSize: fs }}>
          {el.name}
        </div>
        {data.showTechnology && <div className="c4-tech" style={{ fontSize: Math.max(10, fs - 4) }}>[{tech}]</div>}
        {data.showDescriptions && el.description && <div className="c4-desc" style={{ fontSize: Math.max(10, fs - 3) }}>{el.description}</div>}
        {el.kind === "stage" && el.linkedElementName && <div className="c4-tech">→ {el.linkedElementName}</div>}
        {el.kind === "file" && el.lineCount != null && <div className="c4-tech">{el.lineCount} lines</div>}
        <div className="c4-badges">
          {overlay && (
            <span className="badge" data-testid={`badge-${el.id}`}>
              {overlay.group}: {overlay.value ?? "no value"}
            </span>
          )}
          {el.drillKey && el.childCount > 0 && <span className="badge subtle">{el.childCount} inside</span>}
          {el.external && <span className="badge subtle">external</span>}
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
      <NodeResizer
        isVisible={selected && data.editable}
        minWidth={120}
        minHeight={70}
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

export type BoundaryData = { name: string; kind: string; width: number; height: number };
export type BoundaryNodeType = Node<BoundaryData, "boundary">;

export function BoundaryNode({ data }: NodeProps<BoundaryNodeType>) {
  return (
    <div className="boundary" style={{ width: data.width, height: data.height }} data-testid="boundary">
      <div className="boundary-label">
        {data.name} <span>[{KIND_LABEL[data.kind as keyof typeof KIND_LABEL]}]</span>
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
  hasDetail: boolean;
  editable: boolean;
  onGeom(id: string, layout: EdgeLayout): void;
  onSelect(id: string): void;
  onOpen(id: string): void;
};

export function edgeColor(d: { derived: boolean; style: Style }): string {
  return d.style.stroke ?? (d.derived ? "#8a94a0" : "#4b5563");
}

// Inline (not only CSS) so SVG/PNG export keeps the lines.
function edgeStyle(d: C4EdgeData, selected: boolean): React.CSSProperties {
  let stroke = edgeColor(d);
  let strokeWidth = d.style.strokeWidth ?? 1.6;
  let strokeDasharray: string | undefined = dashFor(d.style.strokeStyle) ?? (d.derived ? "6 5" : undefined);
  if (d.highlight === "past") [stroke, strokeWidth] = ["#9a3412", 2];
  if (d.highlight === "current") [stroke, strokeWidth, strokeDasharray] = ["#c2410c", 3.5, "10 6"];
  if (selected) [stroke, strokeWidth] = ["#f59e0b", Math.max(3, strokeWidth)];
  return { stroke, strokeWidth, strokeDasharray, fill: "none", opacity: d.dimmed ? 0.3 : 1 };
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
  if (drag?.kind === "label") {
    const v = drag.value as { t: number; offset: number };
    L.labelT = v.t;
    L.labelOffset = v.offset;
  }

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
  if (routing === "orthogonal") {
    const horizontal = Math.abs(p2.x - p1.x) >= Math.abs(p2.y - p1.y);
    if (horizontal) {
      const mx = L.control?.x ?? (p1.x + p2.x) / 2;
      pts = [p1, { x: mx, y: p1.y }, { x: mx, y: p2.y }, p2];
    } else {
      const my = L.control?.y ?? (p1.y + p2.y) / 2;
      pts = [p1, { x: p1.x, y: my }, { x: p2.x, y: my }, p2];
    }
    path = `M ${pts.map((p) => `${p.x} ${p.y}`).join(" L ")}`;
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

  const lt = L.labelT ?? 0.5;
  const lo = L.labelOffset ?? 0;
  const at = pointAlong(pts, lt);
  const lx = at.p.x + at.nx * lo;
  const ly = at.p.y + at.ny * lo;
  const bend = pointAlong(pts, 0.5).p;

  const cls = ["c4-edge", data.derived ? "derived" : "", selected ? "selected" : "", data.highlight ?? "", data.dimmed ? "dimmed" : ""].filter(Boolean).join(" ");

  const flowPoint = (e: React.PointerEvent): Pt => rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
  const begin = (kind: Drag["kind"]) => (e: React.PointerEvent) => {
    if (!data.editable) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    data.onSelect(id);
    dragRef.current = { kind, value: kind === "bend" ? bend : kind === "label" ? { t: lt, offset: lo } : { x: 0, y: 0 } };
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
      value = { t: Math.round(pr.t * 100) / 100, offset: Math.abs(pr.dist) < 8 ? 0 : Math.round(pr.dist) };
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
      const v = cur.value as { t: number; offset: number };
      next.labelT = v.t;
      next.labelOffset = v.offset;
    }
    if (JSON.stringify(next) !== JSON.stringify(data.layout)) data.onGeom(id, next);
  };
  const reset = (key: keyof EdgeLayout) => () => {
    const next = { ...data.layout };
    delete next[key];
    data.onGeom(id, next);
  };

  const techs = data.technologies.length ? `[${data.technologies.join(", ")}]` : "";
  const handleStyle = (p: Pt): React.CSSProperties => ({ transform: `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)` });
  const grab = { onPointerMove: move, onPointerUp: end, onPointerCancel: end };

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
          title={data.hasDetail ? "Double-click to open the connector detail" : data.editable ? "Drag to move the label along the line" : undefined}
        >
          <div>{data.label}</div>
          {techs && <div className="edge-tech">{techs}</div>}
          {(data.kind || data.sensitivityLevel || data.hasNotes || data.stageCount > 0) && (
            <div className="edge-badges">
              {data.kind && <span className="badge subtle">{data.kind.replace(/-/g, " ")}</span>}
              {data.stageCount > 0 && <span className="badge subtle">{data.stageCount} stages</span>}
              {data.sensitivityLevel && <span className={`badge sens-${data.sensitivityLevel}`}>Sensitive: {data.sensitivityLevel}</span>}
              {data.hasNotes && <span className="badge subtle">Notes</span>}
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
