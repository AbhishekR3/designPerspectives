import {
  Background,
  ConnectionMode,
  Controls,
  MarkerType,
  ReactFlow,
  applyNodeChanges,
  getNodesBounds,
  getViewportForBounds,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import { toPng, toSvg } from "html-to-image";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { edgeColor, edgeTypes, nodeTypes, type C4EdgeData, type C4NodeData, type OverlayInfo, type Rect4 } from "./canvasParts";
import { NODE_H, NODE_W, autoLayout, defaultSize, findFreeSpot, placeMissing, type Rect, type Size } from "./layout";
import type { Diagram, EdgeLayout, Lens, Pt, Selection, TagGroup } from "./types";

export interface CanvasHandle {
  freeSpot(size?: Size): Pt;
  relayout(): Promise<void>;
  exportImage(format: "svg" | "png"): Promise<void>;
}

export interface LayoutPatch {
  sizes?: Record<string, Size | null>;
  edges?: Record<string, EdgeLayout | null>;
}

/** Where a connection point sits on a box, as fractions of the box. */
const HANDLE_ANCHOR: Record<string, Pt> = { t: { x: 0.5, y: 0 }, r: { x: 1, y: 0.5 }, b: { x: 0.5, y: 1 }, l: { x: 0, y: 0.5 } };

interface Props {
  diagram: Diagram;
  lens: Lens;
  overlay: TagGroup | null;
  flowStep: number | null;
  selection: Selection;
  onSelect(sel: Selection): void;
  onDrill(key: string): void;
  onConnect(source: string, target: string, anchors: { sourceAnchor?: Pt; targetAnchor?: Pt }): void;
  onPositions(positions: Record<string, Pt>): void;
  onLayout(patch: LayoutPatch): void;
  onOpenFile(path: string): void;
  handleRef: Ref<CanvasHandle>;
}

type P = Record<string, Pt>;

const groupedIds = (d: Diagram) => (d.boundary ? d.nodes.filter((n) => n.inScope).map((n) => n.id) : []);
const BOUNDARY_PAD = 40;

export function Canvas({ diagram, lens, overlay, flowStep, selection, onSelect, onDrill, onConnect, onPositions, onLayout, onOpenFile, handleRef }: Props) {
  const rf = useReactFlow();
  const [positions, setPositions] = useState<P>({});
  const [sizeOverride, setSizeOverride] = useState<Record<string, Size>>({});
  const wrapper = useRef<HTMLDivElement>(null);
  const fitFor = useRef<string | null>(null);

  const baseSizes = useMemo(() => {
    const m: Record<string, Size> = {};
    for (const n of diagram.nodes) m[n.id] = n.size ?? defaultSize(n.kind);
    return m;
  }, [diagram]);
  const sizeOf = useCallback((id: string): Size => sizeOverride[id] ?? baseSizes[id] ?? { w: NODE_W, h: NODE_H }, [sizeOverride, baseSizes]);
  const direction = diagram.level === "connector" ? "RIGHT" : "DOWN";
  const editable = diagram.level !== "flow";
  const canConnect = ["landscape", "context", "container", "component"].includes(diagram.level);

  useEffect(() => setSizeOverride({}), [diagram]);

  // Resolve positions: saved ones, otherwise lay out and save.
  useEffect(() => {
    let cancelled = false;
    const saved: P = {};
    const missing: string[] = [];
    for (const n of diagram.nodes) {
      if (n.position) saved[n.id] = n.position;
      else missing.push(n.id);
    }
    if (missing.length === 0) {
      setPositions(saved);
      return;
    }
    (async () => {
      const add =
        Object.keys(saved).length === 0
          ? await autoLayout(
              diagram.nodes.map((n) => ({ id: n.id, size: baseSizes[n.id] })),
              diagram.edges,
              groupedIds(diagram),
              direction,
            )
          : placeMissing({ ...saved }, baseSizes, missing, diagram.edges);
      if (cancelled) return;
      setPositions({ ...saved, ...add });
      onPositions(add);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagram]);

  // Fit the view once per diagram, after positions exist.
  useEffect(() => {
    if (fitFor.current !== diagram.key && Object.keys(positions).length >= diagram.nodes.length) {
      fitFor.current = diagram.key;
      requestAnimationFrame(() => rf.fitView({ padding: 0.15, duration: 0 }));
    }
  }, [positions, diagram, rf]);

  const flow = diagram.flow;
  const step = flow && flowStep !== null ? flow.steps[flowStep] : null;
  const stepRel = step ? flow!.steps[flowStep!].relationshipId : null;
  const activeNodes = useMemo(() => {
    if (!step) return new Set<string>();
    const e = diagram.edges.find((x) => x.id === step.relationshipId);
    return new Set(e ? [e.source, e.target] : []);
  }, [step, diagram.edges]);

  const onResize = useCallback((id: string, r: Rect4) => {
    setSizeOverride((s) => ({ ...s, [id]: { w: Math.round(r.width), h: Math.round(r.height) } }));
    setPositions((p) => ({ ...p, [id]: { x: Math.round(r.x), y: Math.round(r.y) } }));
  }, []);
  const onResizeEnd = useCallback(
    (id: string, r: Rect4) => {
      onLayout({ sizes: { [id]: { w: Math.round(r.width), h: Math.round(r.height) } } });
      onPositions({ [id]: { x: Math.round(r.x), y: Math.round(r.y) } });
    },
    [onLayout, onPositions],
  );

  const nodes: Node[] = useMemo(() => {
    const out: Node[] = [];
    const inScope = diagram.nodes.filter((n) => n.inScope && positions[n.id]);
    if (diagram.boundary && inScope.length > 0) {
      const x = Math.min(...inScope.map((n) => positions[n.id].x)) - BOUNDARY_PAD;
      const y = Math.min(...inScope.map((n) => positions[n.id].y)) - BOUNDARY_PAD - 20;
      const width = Math.max(...inScope.map((n) => positions[n.id].x + sizeOf(n.id).w)) + BOUNDARY_PAD - x;
      const height = Math.max(...inScope.map((n) => positions[n.id].y + sizeOf(n.id).h)) + BOUNDARY_PAD - y;
      out.push({
        id: `boundary:${diagram.boundary.id}`,
        type: "boundary",
        position: { x, y },
        data: { name: diagram.boundary.name, kind: diagram.boundary.kind, width, height },
        width,
        height,
        measured: { width, height },
        draggable: false,
        selectable: false,
        connectable: false,
        focusable: false,
        style: { pointerEvents: "none" },
        zIndex: -1,
      });
    }
    for (const n of diagram.nodes) {
      const p = positions[n.id];
      if (!p) continue;
      let ov: OverlayInfo | null = null;
      if (overlay && n.kind !== "file" && n.kind !== "stage") {
        const value = n.tags[overlay.name] ?? null;
        ov = { group: overlay.name, value, color: overlay.values.find((v) => v.name === value)?.color ?? null };
      }
      const sz = sizeOf(n.id);
      const data: C4NodeData = {
        el: n,
        w: sz.w,
        h: sz.h,
        overlay: ov,
        showTechnology: lens.showTechnology,
        showDescriptions: lens.showDescriptions,
        sections: lens.visibleSections,
        flowActive: activeNodes.has(n.id),
        dimmed: !!step && !activeNodes.has(n.id),
        editable,
        onResize,
        onResizeEnd,
      };
      out.push({
        id: n.id,
        type: "c4",
        position: p,
        data,
        width: sz.w,
        height: sz.h,
        selected: selection?.type === "node" && selection.id === n.id,
        connectable: canConnect,
        measured: { width: sz.w, height: sz.h },
      });
    }
    return out;
  }, [diagram, positions, overlay, lens, activeNodes, step, selection, sizeOf, editable, canConnect, onResize, onResizeEnd]);

  const openEdge = useCallback(
    (id: string) => {
      const e = diagram.edges.find((x) => x.id === id);
      if (!e) return;
      if (e.detailKey) onDrill(e.detailKey);
      else if (e.drillTargets.length === 1) onDrill(e.drillTargets[0].key);
      else onSelect({ type: "edge", id });
    },
    [diagram.edges, onDrill, onSelect],
  );

  const edges: Edge[] = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const e of diagram.edges) {
      const k = [e.source, e.target].sort().join("|");
      groups.set(k, [...(groups.get(k) ?? []), e.id]);
    }
    const pastSteps = new Set(flow && flowStep !== null ? flow.steps.slice(0, flowStep).map((s) => s.relationshipId) : []);
    return diagram.edges.map((e) => {
      const g = groups.get([e.source, e.target].sort().join("|"))!;
      const i = g.indexOf(e.id);
      const offset = g.length > 1 && !e.layout.control ? (i - (g.length - 1) / 2) * 60 : 0;
      const current = stepRel === e.id;
      let label = e.description;
      if (e.steps?.length) label = `${e.steps.join(", ")}. ${e.description}`;
      if (current && step) label = `${flowStep! + 1}. ${step.description || e.description}${step.response ? " (response)" : ""}`;
      const color = current ? "#c2410c" : edgeColor(e);
      const arrow = { type: MarkerType.ArrowClosed, color, width: 18, height: 18 };
      const reverse = current && step?.response;
      const mode = e.style.arrow ?? "end";
      const data: C4EdgeData = {
        label,
        technologies: e.technologies,
        kind: e.kind,
        derived: e.derived,
        offset,
        highlight: current ? "current" : pastSteps.has(e.id) ? "past" : null,
        response: !!reverse,
        dimmed: !!step && !current && !pastSteps.has(e.id),
        testId: e.id,
        style: e.style,
        layout: e.layout,
        sensitivityLevel: e.sensitivityLevel,
        hasNotes: e.hasNotes,
        stageCount: e.stageCount,
        hasDetail: !!e.detailKey || e.drillTargets.length === 1,
        editable: editable && !flow,
        onGeom: (id, layout) => onLayout({ edges: { [id]: layout } }),
        onSelect: (id) => onSelect({ type: "edge", id }),
        onOpen: openEdge,
      };
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: "c4",
        data,
        markerEnd: reverse ? undefined : mode === "end" || mode === "both" ? arrow : undefined,
        markerStart: reverse || mode === "start" || mode === "both" ? arrow : undefined,
        selected: selection?.type === "edge" && selection.id === e.id,
      };
    });
  }, [diagram, flow, flowStep, step, stepRel, selection, editable, onLayout, onSelect, openEdge]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const moves = changes.filter((c) => c.type === "position" && !c.id.startsWith("boundary:"));
    if (!moves.length) return;
    setPositions((prev) => {
      const asNodes = Object.entries(prev).map(([id, position]) => ({ id, position, data: {} }) as Node);
      const next = applyNodeChanges(moves, asNodes);
      return Object.fromEntries(next.map((n) => [n.id, n.position]));
    });
  }, []);

  const rects = useCallback(
    (except?: string): Rect[] =>
      Object.entries(positions)
        .filter(([id]) => id !== except)
        .map(([id, p]) => ({ x: p.x, y: p.y, w: sizeOf(id).w, h: sizeOf(id).h })),
    [positions, sizeOf],
  );

  useImperativeHandle(
    handleRef,
    () => ({
      freeSpot(size = { w: NODE_W, h: NODE_H }) {
        const r = wrapper.current?.getBoundingClientRect();
        const c = r ? rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) : { x: 0, y: 0 };
        return findFreeSpot({ x: c.x - size.w / 2, y: c.y - size.h / 2 }, size, rects());
      },
      async relayout() {
        const pos = await autoLayout(
          diagram.nodes.map((n) => ({ id: n.id, size: sizeOf(n.id) })),
          diagram.edges,
          groupedIds(diagram),
          direction,
        );
        setPositions(pos);
        onPositions(pos);
        requestAnimationFrame(() => rf.fitView({ padding: 0.15, duration: 300 }));
      },
      async exportImage(format) {
        const viewport = wrapper.current?.querySelector<HTMLElement>(".react-flow__viewport");
        if (!viewport) return;
        const bounds = getNodesBounds(nodes);
        const pad = 40;
        const width = Math.ceil(bounds.width + pad * 2);
        const height = Math.ceil(bounds.height + pad * 2);
        const vp = getViewportForBounds(bounds, width, height, 1, 1, 0);
        const opts = {
          backgroundColor: "#ffffff",
          width,
          height,
          style: { width: `${width}px`, height: `${height}px`, transform: `translate(${vp.x}px, ${vp.y}px) scale(1)` },
          filter: (el: HTMLElement) => !el.classList?.contains("react-flow__handle") && !el.classList?.contains("edge-grip"),
        };
        const url = format === "svg" ? await toSvg(viewport, opts) : await toPng(viewport, { ...opts, pixelRatio: 2 });
        const a = document.createElement("a");
        a.href = url;
        a.download = `${diagram.key}.${format}`;
        a.click();
      },
    }),
    [rf, diagram, nodes, onPositions, rects, sizeOf, direction],
  );

  return (
    <div className="canvas" ref={wrapper} data-testid="canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={(_, node, dragged) => {
          const moved: P = {};
          for (const n of dragged) if (!n.id.startsWith("boundary:")) moved[n.id] = n.position;
          // A box dropped on top of (or too close to) another goes to the nearest free spot.
          if (dragged.length === 1 && moved[node.id]) {
            const sz = sizeOf(node.id);
            const spot = findFreeSpot(moved[node.id], sz, rects(node.id));
            if (spot.x !== Math.round(moved[node.id].x) || spot.y !== Math.round(moved[node.id].y)) {
              moved[node.id] = spot;
              setPositions((p) => ({ ...p, [node.id]: spot }));
            }
          }
          if (Object.keys(moved).length) onPositions(moved);
        }}
        onNodeClick={(_, n) => onSelect({ type: "node", id: n.id.startsWith("boundary:") ? n.id.slice(9) : n.id })}
        onNodeDoubleClick={(_, n) => {
          const el = diagram.nodes.find((x) => x.id === n.id);
          if (el?.filePath) onOpenFile(el.filePath);
          else if (el?.drillKey) onDrill(el.drillKey);
        }}
        onEdgeClick={(_, e) => onSelect({ type: "edge", id: e.id })}
        onEdgeDoubleClick={(_, e) => openEdge(e.id)}
        onPaneClick={() => onSelect(null)}
        onConnect={(c: Connection) => {
          if (!c.source || !c.target || c.source === c.target || !canConnect) return;
          onConnect(c.source, c.target, {
            sourceAnchor: c.sourceHandle ? HANDLE_ANCHOR[c.sourceHandle] : undefined,
            targetAnchor: c.targetHandle ? HANDLE_ANCHOR[c.targetHandle] : undefined,
          });
        }}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={90}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        zoomOnDoubleClick={false}
        minZoom={0.1}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} size={1} color="#e3e6ea" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
