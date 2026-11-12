/**
 * Read-only C4 canvas on @xyflow/react. Positions come from the host (LikeC4 layout, top-left x/y in
 * absolute view coordinates). Boundaries are rendered as separate, larger nodes behind the cards (no
 * React Flow parent/child nesting), so every node keeps the absolute position the host computed. Edges
 * draw the host's spline points directly.
 */
import { memo, useMemo } from "react";
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import type { ComputedView, ViewEdge, ViewNode } from "@designperspectives/contracts";
import { kindLabel } from "@designperspectives/contracts";
import { kindClass } from "./kind-style.js";

type C4NodeType = Node<{ node: ViewNode }, "c4" | "boundary">;
type C4EdgeType = Edge<{ edge: ViewEdge }, "c4">;

/** Invisible handles: React Flow only draws edges between nodes that have handles. */
function Handles() {
  return (
    <>
      <Handle type="target" position={Position.Top} className="c4-handle" isConnectable={false} />
      <Handle type="source" position={Position.Bottom} className="c4-handle" isConnectable={false} />
    </>
  );
}

const C4Card = memo(function C4Card({ data }: NodeProps<C4NodeType>) {
  const n = data.node;
  const type = n.technology ? `[${kindLabel(n.kind)}: ${n.technology}]` : `[${kindLabel(n.kind)}]`;
  return (
    <div className={`c4-card ${kindClass(n.kind)}`} data-testid="c4-card" data-id={n.id}>
      <Handles />
      <div className="c4-card-title">{n.title}</div>
      <div className="c4-card-type">{type}</div>
      {n.description ? <div className="c4-card-desc">{n.description}</div> : null}
    </div>
  );
});

const C4Boundary = memo(function C4Boundary({ data }: NodeProps<C4NodeType>) {
  const n = data.node;
  return (
    <div className="c4-boundary" data-testid="c4-boundary" data-id={n.id}>
      <Handles />
      <div className="c4-boundary-label">
        <span className="c4-boundary-title">{n.title}</span> <span className="c4-boundary-type">[{kindLabel(n.kind)}]</span>
      </div>
    </div>
  );
});

type Pt = readonly [number, number];

/** Graphviz splines arrive as p0 (c1 c2 p)*; anything else is drawn as a polyline. */
function pathOf(points: readonly Pt[]): string {
  const [first, ...rest] = points;
  if (!first) return "";
  const isSpline = rest.length >= 3 && rest.length % 3 === 0;
  let d = `M ${first[0]} ${first[1]}`;
  if (isSpline) {
    for (let i = 0; i < rest.length; i += 3) d += ` C ${rest[i]!.join(" ")} ${rest[i + 1]!.join(" ")} ${rest[i + 2]!.join(" ")}`;
  } else {
    for (const p of rest) d += ` L ${p[0]} ${p[1]}`;
  }
  return d;
}

function cubic(a: number, b: number, c: number, d: number, t: number): number {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}

/** Midpoint of the middle spline segment (or of the polyline). */
function labelPoint(points: readonly Pt[]): Pt {
  if (points.length >= 4 && (points.length - 1) % 3 === 0) {
    const segments = (points.length - 1) / 3;
    const s = Math.floor(segments / 2) * 3;
    const [p0, p1, p2, p3] = [points[s]!, points[s + 1]!, points[s + 2]!, points[s + 3]!];
    const t = segments % 2 === 1 ? 0.5 : 0;
    return [cubic(p0[0], p1[0], p2[0], p3[0], t), cubic(p0[1], p1[1], p2[1], p3[1], t)];
  }
  const a = points[Math.floor((points.length - 1) / 2)] ?? [0, 0];
  const b = points[Math.ceil((points.length - 1) / 2)] ?? a;
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function C4Edge({ id, data, markerEnd, sourceX, sourceY, targetX, targetY }: EdgeProps<C4EdgeType>) {
  const e = data!.edge;
  const points: Pt[] = e.points.length >= 2 ? e.points : [[sourceX, sourceY], [targetX, targetY]];
  const [lx, ly] = labelPoint(points);
  return (
    <>
      <BaseEdge
        id={id}
        path={pathOf(points)}
        markerEnd={markerEnd}
        className={e.async ? "c4-edge c4-edge-async" : "c4-edge c4-edge-sync"}
      />
      {e.label || e.technology ? (
        <EdgeLabelRenderer>
          <div className="c4-edge-label" data-testid="c4-edge-label" style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}>
            {e.label ? <div>{e.label}</div> : null}
            {e.technology ? <div className="c4-edge-tech">[{e.technology}]</div> : null}
            {e.async ? <div className="c4-edge-tech">(async)</div> : null}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

const nodeTypes = { c4: C4Card, boundary: C4Boundary };
const edgeTypes = { c4: C4Edge };

function depth(n: ViewNode, byId: Map<string, ViewNode>): number {
  let d = 0;
  for (let p = n.parent; p; p = byId.get(p)?.parent) d++;
  return d;
}

export function toFlow(view: ComputedView): { nodes: C4NodeType[]; edges: C4EdgeType[] } {
  const byId = new Map(view.nodes.map((n) => [n.id, n]));
  const nodes = view.nodes
    .map((n): C4NodeType => ({
      id: n.id,
      type: n.isBoundary ? "boundary" : "c4",
      position: { x: n.x, y: n.y },
      width: n.width,
      height: n.height,
      data: { node: n },
      // Boundaries behind cards, outer boundaries behind inner ones.
      zIndex: n.isBoundary ? depth(n, byId) : 1000,
      draggable: false,
      selectable: false,
      connectable: false,
      focusable: false,
    }))
    // Parents first in DOM order as well.
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  const edges = view.edges.map(
    (e): C4EdgeType => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: "c4",
      data: { edge: e },
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: "#3b3b3b" },
      selectable: false,
      focusable: false,
      zIndex: 1001,
    }),
  );
  return { nodes, edges };
}

export function Canvas({ view }: { view: ComputedView }) {
  const { nodes, edges } = useMemo(() => toFlow(view), [view]);
  return (
    <div className="canvas" data-testid="canvas" aria-label={`Diagram: ${view.title}`} role="img">
      <ReactFlow
        key={view.id}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.04 }}
        minZoom={0.1}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        edgesFocusable={false}
        nodesFocusable={false}
        proOptions={{ hideAttribution: false }}
      >
        <Background gap={24} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
