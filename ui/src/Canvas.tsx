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
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import { toPng, toSvg } from "html-to-image";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { edgeTypes, nodeTypes, type C4EdgeData, type C4NodeData, type OverlayInfo } from "./canvasParts";
import { NODE_H, NODE_W, autoLayout, placeMissing } from "./layout";
import type { Diagram, Lens, Selection, TagGroup } from "./types";

export interface CanvasHandle {
  center(): { x: number; y: number };
  relayout(): Promise<void>;
  exportImage(format: "svg" | "png"): Promise<void>;
}

interface Props {
  diagram: Diagram;
  lens: Lens;
  overlay: TagGroup | null;
  flowStep: number | null;
  selection: Selection;
  onSelect(sel: Selection): void;
  onDrill(key: string): void;
  onConnect(source: string, target: string): void;
  onPositions(positions: Record<string, { x: number; y: number }>): void;
  handleRef: Ref<CanvasHandle>;
}

type P = Record<string, { x: number; y: number }>;

const groupedIds = (d: Diagram) => (d.boundary ? d.nodes.filter((n) => n.inScope).map((n) => n.id) : []);
const BOUNDARY_PAD = 40;

export function Canvas({ diagram, lens, overlay, flowStep, selection, onSelect, onDrill, onConnect, onPositions, handleRef }: Props) {
  const rf = useReactFlow();
  const [positions, setPositions] = useState<P>({});
  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({});
  const wrapper = useRef<HTMLDivElement>(null);
  const fitFor = useRef<string | null>(null);

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
              diagram.nodes.map((n) => n.id),
              diagram.edges,
              groupedIds(diagram),
            )
          : placeMissing(saved, missing);
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

  const nodes: Node[] = useMemo(() => {
    const out: Node[] = [];
    const inScope = diagram.nodes.filter((n) => n.inScope && positions[n.id]);
    if (diagram.boundary && inScope.length > 0) {
      const xs = inScope.map((n) => positions[n.id].x);
      const ys = inScope.map((n) => positions[n.id].y);
      const x = Math.min(...xs) - BOUNDARY_PAD;
      const y = Math.min(...ys) - BOUNDARY_PAD - 20;
      const width = Math.max(...xs) + NODE_W + BOUNDARY_PAD - x;
      const height = Math.max(...ys) + NODE_H + BOUNDARY_PAD - y;
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
      if (overlay) {
        const value = n.tags[overlay.name] ?? null;
        ov = { group: overlay.name, value, color: overlay.values.find((v) => v.name === value)?.color ?? null };
      }
      const data: C4NodeData = {
        el: n,
        overlay: ov,
        showTechnology: lens.showTechnology,
        showDescriptions: lens.showDescriptions,
        flowActive: activeNodes.has(n.id),
        dimmed: !!step && !activeNodes.has(n.id),
      };
      out.push({
        id: n.id,
        type: "c4",
        position: p,
        data,
        selected: selection?.type === "node" && selection.id === n.id,
        connectable: diagram.level !== "flow",
        measured: measured[n.id],
      });
    }
    return out;
  }, [diagram, positions, overlay, lens, activeNodes, step, selection, measured]);

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
      const offset = g.length > 1 ? (i - (g.length - 1) / 2) * 60 : 0;
      const current = stepRel === e.id;
      let label = e.description;
      if (e.steps?.length) label = `${e.steps.join(", ")}. ${e.description}`;
      if (current && step) label = `${flowStep! + 1}. ${step.description || e.description}${step.response ? " (response)" : ""}`;
      const color = current ? "#c2410c" : e.derived ? "#8a94a0" : "#4b5563";
      const arrow = { type: MarkerType.ArrowClosed, color, width: 18, height: 18 };
      const reverse = current && step?.response;
      const data: C4EdgeData = {
        label,
        technology: e.technology,
        derived: e.derived,
        offset,
        highlight: current ? "current" : pastSteps.has(e.id) ? "past" : null,
        response: !!reverse,
        dimmed: !!step && !current && !pastSteps.has(e.id),
        testId: e.id,
      };
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: "c4",
        data,
        markerEnd: reverse ? undefined : arrow,
        markerStart: reverse ? arrow : undefined,
        selected: selection?.type === "edge" && selection.id === e.id,
      };
    });
  }, [diagram, flow, flowStep, step, stepRel, selection]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const dims: Record<string, { width: number; height: number }> = {};
    for (const c of changes) if (c.type === "dimensions" && c.dimensions) dims[c.id] = c.dimensions;
    if (Object.keys(dims).length) setMeasured((m) => ({ ...m, ...dims }));
    const moves = changes.filter((c) => c.type === "position" && !c.id.startsWith("boundary:"));
    if (!moves.length) return;
    setPositions((prev) => {
      const asNodes = Object.entries(prev).map(([id, position]) => ({ id, position, data: {} }) as Node);
      const next = applyNodeChanges(moves, asNodes);
      return Object.fromEntries(next.map((n) => [n.id, n.position]));
    });
  }, []);

  useImperativeHandle(
    handleRef,
    () => ({
      center() {
        const r = wrapper.current?.getBoundingClientRect();
        if (!r) return { x: 0, y: 0 };
        const p = rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
        return { x: Math.round(p.x - NODE_W / 2), y: Math.round(p.y - NODE_H / 2) };
      },
      async relayout() {
        const pos = await autoLayout(
          diagram.nodes.map((n) => n.id),
          diagram.edges,
          groupedIds(diagram),
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
          filter: (el: HTMLElement) => !el.classList?.contains("react-flow__handle"),
        };
        const url = format === "svg" ? await toSvg(viewport, opts) : await toPng(viewport, { ...opts, pixelRatio: 2 });
        const a = document.createElement("a");
        a.href = url;
        a.download = `${diagram.key}.${format}`;
        a.click();
      },
    }),
    [rf, diagram, nodes, onPositions],
  );

  return (
    <div className="canvas" ref={wrapper} data-testid="canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={(_, __, dragged) => {
          const moved: P = {};
          for (const n of dragged) if (!n.id.startsWith("boundary:")) moved[n.id] = n.position;
          if (Object.keys(moved).length) onPositions(moved);
        }}
        onNodeClick={(_, n) => {
          if (n.id.startsWith("boundary:")) onSelect({ type: "node", id: n.id.slice(9) });
          else onSelect({ type: "node", id: n.id });
        }}
        onNodeDoubleClick={(_, n) => {
          const el = diagram.nodes.find((x) => x.id === n.id);
          if (el?.drillKey) onDrill(el.drillKey);
        }}
        onEdgeClick={(_, e) => onSelect({ type: "edge", id: e.id })}
        onPaneClick={() => onSelect(null)}
        onConnect={(c) => c.source && c.target && c.source !== c.target && onConnect(c.source, c.target)}
        connectionMode={ConnectionMode.Loose}
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
