import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  useConnection,
  useInternalNode,
  type EdgeProps,
  type InternalNode,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { NODE_H, NODE_W } from "./layout";
import { KIND_LABEL, type DiagramNode } from "./types";

// C4 colours (as used in the C4 model examples).
const KIND_COLOR: Record<string, string> = {
  person: "#08427b",
  softwareSystem: "#1168bd",
  container: "#438dd5",
  component: "#85bbf0",
};
const EXTERNAL_COLOR = "#8a8a8a";

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

export interface OverlayInfo {
  group: string;
  value: string | null;
  color: string | null;
}

export type C4NodeData = {
  el: DiagramNode;
  overlay: OverlayInfo | null;
  showTechnology: boolean;
  showDescriptions: boolean;
  flowActive: boolean; // element takes part in the current flow step
  dimmed: boolean;
};
export type C4NodeType = Node<C4NodeData, "c4">;

export function C4Node({ data, selected }: NodeProps<C4NodeType>) {
  const { el, overlay } = data;
  const connecting = useConnection((c) => c.inProgress);
  let bg = el.external || !el.inScope ? EXTERNAL_COLOR : KIND_COLOR[el.kind];
  if (el.external && el.kind === "person") bg = "#686868";
  let border = "transparent";
  let borderStyle = "solid";
  if (overlay) {
    if (overlay.color) {
      bg = overlay.color;
    } else {
      bg = "#eceff3";
      border = "#9aa3ad";
      borderStyle = "dashed";
    }
  }
  const fg = textColorFor(bg);
  const tech = el.technology ? `${KIND_LABEL[el.kind]}: ${el.technology}` : KIND_LABEL[el.kind];
  return (
    <div
      className={`c4-node kind-${el.kind}${selected ? " selected" : ""}${data.flowActive ? " flow-active" : ""}${
        data.dimmed ? " dimmed" : ""
      }`}
      style={{ background: bg, color: fg, borderColor: border, borderStyle, width: NODE_W, height: NODE_H }}
      data-testid={`node-${el.id}`}
      title={el.drillKey ? "Double-click to open the next level" : undefined}
    >
      {el.kind === "person" && <div className="person-head" style={{ background: bg, borderColor: fg }} />}
      <div className="c4-name">{el.name}</div>
      {data.showTechnology && <div className="c4-tech">[{tech}]</div>}
      {data.showDescriptions && el.description && <div className="c4-desc">{el.description}</div>}
      <div className="c4-badges">
        {overlay && (
          <span className="badge" data-testid={`badge-${el.id}`}>
            {overlay.group}: {overlay.value ?? "no value"}
          </span>
        )}
        {el.drillKey && el.childCount > 0 && <span className="badge subtle">{el.childCount} inside</span>}
        {el.external && <span className="badge subtle">external</span>}
      </div>
      <Handle type="source" position={Position.Right} className="connect-handle" title="Drag to connect" />
      <Handle
        type="target"
        position={Position.Left}
        className="target-handle"
        style={{ pointerEvents: connecting ? "all" : "none" }}
        isConnectableStart={false}
      />
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

// ------------------------------------------------------------------ floating edges

function center(n: InternalNode) {
  const w = n.measured.width ?? NODE_W;
  const h = n.measured.height ?? NODE_H;
  return { x: n.internals.positionAbsolute.x + w / 2, y: n.internals.positionAbsolute.y + h / 2, w, h };
}

/** Where the line from `from`'s centre towards point `to` leaves `from`'s rectangle. */
function borderPoint(from: InternalNode, to: { x: number; y: number }) {
  const c = center(from);
  const dx = to.x - c.x;
  const dy = to.y - c.y;
  if (dx === 0 && dy === 0) return { x: c.x, y: c.y };
  const sx = c.w / 2 / Math.abs(dx || 1e-9);
  const sy = c.h / 2 / Math.abs(dy || 1e-9);
  const s = Math.min(sx, sy);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

export type C4EdgeData = {
  label: string;
  technology: string;
  derived: boolean;
  offset: number; // perpendicular offset for parallel edges
  highlight: "current" | "past" | null;
  response: boolean;
  dimmed: boolean;
  testId: string;
};

// Inline (not only CSS) so SVG/PNG export keeps the lines.
function edgeStyle(d: C4EdgeData, selected: boolean): React.CSSProperties {
  let stroke = d.derived ? "#8a94a0" : "#4b5563";
  let strokeWidth = 1.6;
  let strokeDasharray: string | undefined = d.derived ? "6 5" : undefined;
  if (d.highlight === "past") [stroke, strokeWidth] = ["#9a3412", 2];
  if (d.highlight === "current") [stroke, strokeWidth, strokeDasharray] = ["#c2410c", 3.5, "10 6"];
  if (selected) [stroke, strokeWidth] = ["#f59e0b", 3];
  return { stroke, strokeWidth, strokeDasharray, fill: "none", opacity: d.dimmed ? 0.3 : 1 };
}

export function C4Edge({ id, source, target, data, selected, markerEnd, markerStart }: EdgeProps & { data?: C4EdgeData }) {
  const s = useInternalNode(source);
  const t = useInternalNode(target);
  if (!s || !t || !data) return null;
  const cs = center(s);
  const ct = center(t);
  // Normal relative to a canonical direction so A->B and B->A bend to opposite sides.
  const flip = source < target ? 1 : -1;
  const len = Math.hypot(ct.x - cs.x, ct.y - cs.y) || 1;
  const nx = (-(ct.y - cs.y) / len) * flip;
  const ny = ((ct.x - cs.x) / len) * flip;
  const mid = { x: (cs.x + ct.x) / 2 + nx * data.offset, y: (cs.y + ct.y) / 2 + ny * data.offset };
  const p1 = borderPoint(s, mid);
  const p2 = borderPoint(t, mid);
  const ctrl = { x: 2 * mid.x - (p1.x + p2.x) / 2, y: 2 * mid.y - (p1.y + p2.y) / 2 };
  const path = data.offset === 0 ? `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}` : `M ${p1.x} ${p1.y} Q ${ctrl.x} ${ctrl.y} ${p2.x} ${p2.y}`;
  const lx = data.offset === 0 ? (p1.x + p2.x) / 2 : 0.25 * p1.x + 0.5 * ctrl.x + 0.25 * p2.x;
  const ly = data.offset === 0 ? (p1.y + p2.y) / 2 : 0.25 * p1.y + 0.5 * ctrl.y + 0.25 * p2.y;

  const cls = ["c4-edge", data.derived ? "derived" : "", selected ? "selected" : "", data.highlight ?? "", data.dimmed ? "dimmed" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        className={cls}
        style={edgeStyle(data, !!selected)}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={18}
      />
      <EdgeLabelRenderer>
        <div
          className={`edge-label ${cls}`}
          style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
          data-testid={`edge-${data.testId}`}
        >
          <div>{data.label}</div>
          {data.technology && <div className="edge-tech">[{data.technology}]</div>}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const nodeTypes = { c4: C4Node, boundary: BoundaryNode };
export const edgeTypes = { c4: C4Edge };
