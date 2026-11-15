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
  type NodeSelectionChange,
} from "@xyflow/react";
import { toPng, toSvg } from "html-to-image";
import { canvasInsets } from "./insets";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { CUSTOM_HEADS, FLOW_CURRENT, MarkerDefs, edgeColor, edgeTypes, nodeTypes, type C4EdgeData, type C4NodeData, type NodeActions, type OverlayInfo, type Rect4 } from "./canvasParts";
import { errorMessage, notify, run } from "./notify";
import { CHANGE_COLORS } from "./overlays";
import { DRAG_TYPE, type PaletteItem } from "./Palette";
import { NODE_H, NODE_W, autoLayout, defaultSize, findFreeSpot, placeMissing, type Rect, type Size } from "./layout";
import { nodeSelection, selectedNodeIds, type Diagram, type DiagramNode, type EdgeLayout, type Lens, type Pt, type Selection } from "./types";

export interface CanvasHandle {
  freeSpot(size?: Size): Pt;
  /** The free spot nearest to a box of this size centred on `center` (diagram coordinates): its top-left. */
  spotAt(center: Pt, size: Size): Pt;
  relayout(): Promise<void>;
  exportImage(format: "svg" | "png"): Promise<void>;
  /** Move boxes by a step; several boxes are saved in one request. */
  nudge(ids: string[], dx: number, dy: number): void;
  fit(): void;
  zoom(dir: 1 | -1): void;
  /** Where the right-click menu opens from the keyboard: on the selected box or line (its centre on
   *  screen), else the middle of the canvas. */
  menuSpot(selection: Selection): { target: ContextTarget; client: Pt } | null;
}

/** How overlays and filters show one element: colour/chip, hidden by a Hide filter, in or out of focus. */
export interface NodeDecor {
  overlay: OverlayInfo | null;
  hidden: boolean;
  focused: boolean;
  outOfFocus: boolean;
  costLabel: string | null;
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
  decorate(n: DiagramNode): NodeDecor;
  actions: NodeActions | null;
  archTypes: { id: string; label: string }[];
  renameId: string | null;
  onRenameStarted(): void;
  onDropItem(item: PaletteItem, topLeft: Pt): void;
  /** `at` in diagram coordinates, `client` the same point on screen (for a menu there). */
  onConnectToEmpty(sourceId: string, at: Pt, sourceAnchor: Pt | undefined, client: Pt): void;
  flowStep: number | null;
  /** Colour lines by change (the Changes overlay is on). */
  showChanges: boolean;
  selection: Selection;
  onSelect(sel: Selection): void;
  onDrill(key: string): void;
  onConnect(source: string, target: string, anchors: { sourceAnchor?: Pt; targetAnchor?: Pt }): void;
  onPositions(positions: Record<string, Pt>, auto?: boolean): void;
  onLayout(patch: LayoutPatch): void;
  onOpenFile(path: string): void;
  onContextMenu(target: ContextTarget, client: Pt): void;
  handleRef: Ref<CanvasHandle>;
  /** The model shown cannot be changed by this person: no dragging, resizing, connecting or dropping, and nothing is saved. */
  readOnly: boolean;
}

type P = Record<string, Pt>;

/** What was right-clicked: a box, a line, or empty canvas (with the point, in diagram coordinates). */
export type ContextTarget = { type: "node"; id: string } | { type: "edge"; id: string } | { type: "pane"; at: Pt };

/** Room kept around the diagram, beyond the floating controls that cover the edges of the canvas. */
const FIT_PAD = 20;
const motion = (ms: number) => (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : ms);
/**
 * Fit-to-view options: the diagram is fitted into the part of the canvas that the top bars, the Add palette,
 * the dock and the zoom buttons do not cover (measured now, so it follows the palette being open or collapsed).
 */
function fitOptions(canvas: HTMLElement | null, duration: number) {
  const i = canvasInsets(canvas?.closest<HTMLElement>(".canvas-wrap") ?? canvas);
  const px = (v: number): `${number}px` => `${Math.max(FIT_PAD, v + FIT_PAD)}px`;
  return { padding: { top: px(i.top), bottom: px(i.bottom), left: px(i.left), right: px(i.right) }, duration: motion(duration) };
}

/** Kinds of box that can be part of a selection of several. */
const MULTI_KINDS = new Set(["person", "softwareSystem", "container", "component"]);

const groupedIds = (d: Diagram) => (d.boundary ? d.nodes.filter((n) => n.inScope).map((n) => n.id) : []);
const BOUNDARY_PAD = 40;

export function Canvas({ diagram, lens, decorate, actions, archTypes, renameId, onRenameStarted, onDropItem, onConnectToEmpty, flowStep, showChanges, selection, onSelect, onDrill, onConnect, onPositions, onLayout, onOpenFile, onContextMenu, handleRef, readOnly }: Props) {
  const rf = useReactFlow();
  const [positions, setPositions] = useState<P>({});
  const [sizeOverride, setSizeOverride] = useState<Record<string, Size>>({});
  const wrapper = useRef<HTMLDivElement>(null);
  const fitFor = useRef<string | null>(null);
  // Selecting several boxes: the current selection (also right after a change, before the next render),
  // whether a selection box is being drawn, and whether Shift was down when the pointer went down.
  const selRef = useRef(selection);
  selRef.current = selection;
  const boxing = useRef(false);
  const shiftDown = useRef(false);
  const multiIds = useMemo(() => (selection?.type === "nodes" ? new Set(selection.ids) : null), [selection]);
  /** Ghosts (boxes of the compared version), stages and files cannot be part of a multi-selection. */
  const multiOk = useCallback((id: string) => {
    const n = diagram.nodes.find((x) => x.id === id);
    return !!n && !n.ghost && MULTI_KINDS.has(n.kind);
  }, [diagram]);
  const commitSelection = useCallback(
    (ids: string[]) => {
      const next = nodeSelection(ids);
      selRef.current = next;
      onSelect(next);
    },
    [onSelect],
  );

  const baseSizes = useMemo(() => {
    const m: Record<string, Size> = {};
    for (const n of diagram.nodes) m[n.id] = n.size ?? defaultSize(n.kind);
    return m;
  }, [diagram]);
  const sizeOf = useCallback((id: string): Size => sizeOverride[id] ?? baseSizes[id] ?? { w: NODE_W, h: NODE_H }, [sizeOverride, baseSizes]);
  const direction = diagram.level === "connector" ? "RIGHT" : "DOWN";
  // A diagram that only exists in the compared version, or a model this person cannot change, is shown, not edited.
  const frozen = !!diagram.compare?.removed || readOnly;
  const editable = diagram.level !== "flow" && !frozen;
  const canConnect = !frozen && ["landscape", "context", "container", "component"].includes(diagram.level);
  /** Ghosts (objects of the compared version) are never saved. */
  const ghosts = useMemo(() => new Set([...diagram.nodes.filter((n) => n.ghost).map((n) => n.id)]), [diagram]);
  const savable = useCallback(
    (p: P): P => (frozen ? {} : Object.fromEntries(Object.entries(p).filter(([id]) => !ghosts.has(id)))),
    [frozen, ghosts],
  );

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
      const place = () => placeMissing({ ...saved }, baseSizes, missing, diagram.edges);
      let add: P | undefined;
      try {
        add =
          Object.keys(saved).length === 0
            ? await autoLayout(
                diagram.nodes.map((n) => ({ id: n.id, size: baseSizes[n.id] })),
                diagram.edges,
                groupedIds(diagram),
                direction,
              )
            : place();
      } catch (e) {
        if (!cancelled) notify.error(`Could not lay out the diagram: ${errorMessage(e)}`);
      }
      if (cancelled) return;
      if (!add) {
        // Layout failed: still show every box, placed one by one; nothing is saved.
        setPositions({ ...saved, ...place() });
        return;
      }
      setPositions({ ...saved, ...add });
      const keep = savable(add);
      if (Object.keys(keep).length) onPositions(keep, true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagram]);

  // Until the person moves or zooms the view themselves, a change of the canvas size (a side panel opened or
  // resized, a strip shown above the canvas, the window resized) fits the diagram into the new free area again.
  const touched = useRef(false);
  useEffect(() => {
    const el = wrapper.current;
    if (!el) return;
    let last = `${el.clientWidth}x${el.clientHeight}`;
    let frame = 0;
    const ro = new ResizeObserver(() => {
      const now = `${el.clientWidth}x${el.clientHeight}`;
      if (now === last) return;
      last = now;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!touched.current && fitFor.current === diagram.key) rf.fitView(fitOptions(el, 0));
      });
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [rf, diagram.key]);

  // Fit the view once per diagram, after positions exist.
  useEffect(() => {
    if (fitFor.current !== diagram.key && Object.keys(positions).length >= diagram.nodes.length) {
      fitFor.current = diagram.key;
      requestAnimationFrame(() => rf.fitView(fitOptions(wrapper.current, 0)));
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
        data: { name: diagram.boundary.name, kind: diagram.boundary.kind, description: diagram.nodes.find((n) => n.id === diagram.boundary!.id)?.description ?? "", width, height },
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
      const dec = decorate(n);
      if (dec.hidden) continue;
      const sz = sizeOf(n.id);
      const data: C4NodeData = {
        el: n,
        w: sz.w,
        h: sz.h,
        overlay: dec.overlay,
        showTechnology: lens.showTechnology,
        showDescriptions: lens.showDescriptions,
        sections: lens.visibleSections,
        multi: !!multiIds,
        flowActive: activeNodes.has(n.id),
        dimmed: (!!step && !activeNodes.has(n.id)) || dec.outOfFocus,
        focused: dec.focused,
        costLabel: dec.costLabel,
        actions,
        archTypes,
        renameNow: renameId === n.id,
        onRenameStarted,
        editable: editable && !n.ghost,
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
        selected: (selection?.type === "node" && selection.id === n.id) || !!multiIds?.has(n.id),
        connectable: canConnect && !n.ghost,
        draggable: editable && !n.ghost,
        measured: { width: sz.w, height: sz.h },
      });
    }
    return out;
  }, [diagram, positions, decorate, actions, archTypes, renameId, onRenameStarted, lens, activeNodes, step, selection, multiIds, sizeOf, editable, canConnect, onResize, onResizeEnd]);

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
    const shown = new Set(nodes.map((n) => n.id));
    const unfocused = new Set(diagram.nodes.filter((n) => decorate(n).outOfFocus).map((n) => n.id));
    return diagram.edges.filter((e) => shown.has(e.source) && shown.has(e.target)).map((e) => {
      const g = groups.get([e.source, e.target].sort().join("|"))!;
      const i = g.indexOf(e.id);
      const offset = g.length > 1 && !e.layout.control ? (i - (g.length - 1) / 2) * 60 : 0;
      const current = stepRel === e.id;
      let label = e.description;
      if (e.steps?.length) label = `${e.steps.join(", ")}. ${e.description}`;
      if (current && step) label = `${flowStep! + 1}. ${step.description || e.description}${step.response ? " (response)" : ""}`;
      const color = current ? FLOW_CURRENT : edgeColor(e);
      const head = e.style.arrowHead ?? "filled";
      const arrow: Edge["markerEnd"] = (CUSTOM_HEADS as readonly string[]).includes(head)
        ? `dp-head-${head}`
        : { type: head === "open" ? MarkerType.Arrow : MarkerType.ArrowClosed, color, width: 18, height: 18 };
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
        dimmed: (!!step && !current && !pastSteps.has(e.id)) || unfocused.has(e.source) || unfocused.has(e.target),
        testId: e.id,
        style: e.style,
        layout: e.layout,
        sensitivityLevel: e.sensitivityLevel,
        hasNotes: e.hasNotes,
        stageCount: e.stageCount,
        openWork: e.openWork ?? 0,
        hasDetail: !!e.detailKey || e.drillTargets.length === 1,
        editable: editable && !flow && !e.ghost,
        ghost: !!e.ghost,
        changeColor: showChanges && e.change ? CHANGE_COLORS[e.change] : null,
        onGeom: (id, layout) => onLayout({ edges: { [id]: layout } }),
        onSelect: (id) => onSelect({ type: "edge", id }),
        onOpen: openEdge,
        onContextMenu: (id, client) => onContextMenu({ type: "edge", id }, client),
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
  }, [diagram, nodes, decorate, flow, flowStep, step, stepRel, selection, editable, onLayout, onSelect, openEdge, showChanges, onContextMenu]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Selecting is ours (see `selection`). Two cases take what React Flow reports: the box being drawn with
      // Shift+drag, and a plain press on a box while several are selected (so the press does not drag them along).
      const picks = changes.filter((c): c is NodeSelectionChange => c.type === "select");
      if (picks.length && (boxing.current || (selRef.current?.type === "nodes" && !shiftDown.current))) {
        const ids = new Set(selectedNodeIds(selRef.current).filter(multiOk));
        for (const c of picks) {
          if (c.selected && multiOk(c.id)) ids.add(c.id);
          else if (!c.selected) ids.delete(c.id);
        }
        commitSelection([...ids]);
      }
      const moves = changes.filter((c) => c.type === "position" && !c.id.startsWith("boundary:"));
      if (!moves.length) return;
      setPositions((prev) => {
        const asNodes = Object.entries(prev).map(([id, position]) => ({ id, position, data: {} }) as Node);
        const next = applyNodeChanges(moves, asNodes);
        return Object.fromEntries(next.map((n) => [n.id, n.position]));
      });
    },
    [multiOk, commitSelection],
  );

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
      spotAt(center, size) {
        return findFreeSpot({ x: Math.round(center.x - size.w / 2), y: Math.round(center.y - size.h / 2) }, size, rects());
      },
      async relayout() {
        const pos = await run(() =>
          autoLayout(
            diagram.nodes.map((n) => ({ id: n.id, size: sizeOf(n.id) })),
            diagram.edges,
            groupedIds(diagram),
            direction,
          ),
        );
        if (!pos) return; // the error is shown; the boxes stay where they are
        setPositions(pos);
        const keep = savable(pos);
        if (Object.keys(keep).length) onPositions(keep);
        requestAnimationFrame(() => rf.fitView(fitOptions(wrapper.current, 300)));
      },
      nudge(ids, dx, dy) {
        if (!editable) return;
        const moved: P = {};
        for (const id of ids) {
          const n = nodes.find((x) => x.id === id);
          if (n && !ghosts.has(id)) moved[id] = { x: Math.round(n.position.x + dx), y: Math.round(n.position.y + dy) };
        }
        if (!Object.keys(moved).length) return;
        setPositions((prev) => ({ ...prev, ...moved }));
        onPositions(moved);
      },
      fit() {
        rf.fitView(fitOptions(wrapper.current, 200));
      },
      zoom(dir) {
        if (dir > 0) rf.zoomIn({ duration: motion(150) });
        else rf.zoomOut({ duration: motion(150) });
      },
      menuSpot(selection) {
        const box = wrapper.current?.getBoundingClientRect();
        if (!box) return null;
        const inside = (r: DOMRect): Pt => ({
          x: Math.min(Math.max(r.left + r.width / 2, box.left + 8), box.right - 8),
          y: Math.min(Math.max(r.top + r.height / 2, box.top + 8), box.bottom - 8),
        });
        const find = (cls: string, id: string) => [...(wrapper.current?.querySelectorAll<HTMLElement | SVGElement>(`.${cls}`) ?? [])].find((e) => e.getAttribute("data-id") === id);
        if (selection?.type === "node" || selection?.type === "nodes") {
          const id = selection.type === "node" ? selection.id : selection.ids[0];
          const el = id ? find("react-flow__node", id) : undefined;
          if (id && el) return { target: { type: "node", id }, client: inside(el.getBoundingClientRect()) };
        } else if (selection?.type === "edge") {
          const el = find("react-flow__edge", selection.id);
          if (el) return { target: { type: "edge", id: selection.id }, client: inside(el.getBoundingClientRect()) };
        }
        const client = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
        return { target: { type: "pane", at: rf.screenToFlowPosition(client) }, client };
      },
      async exportImage(format) {
        await run(async () => {
          const viewport = wrapper.current?.querySelector<HTMLElement>(".react-flow__viewport");
          if (!viewport) return;
          const bounds = getNodesBounds(nodes);
          const pad = 40;
          const width = Math.ceil(bounds.width + pad * 2);
          const height = Math.ceil(bounds.height + pad * 2);
          const vp = getViewportForBounds(bounds, width, height, 1, 1, 0);
          const opts = {
            backgroundColor: "#121417",
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
        });
      },
    }),
    [rf, diagram, nodes, onPositions, rects, sizeOf, direction, editable, ghosts, savable],
  );

  return (
    <div className="canvas" ref={wrapper} data-testid="canvas" onPointerDownCapture={(e) => (shiftDown.current = e.shiftKey)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={(_, node, dragged) => {
          const moved: P = {};
          for (const n of dragged) if (!n.id.startsWith("boundary:") && !ghosts.has(n.id)) moved[n.id] = n.position;
          // A box dropped on top of (or too close to) another goes to the nearest free spot.
          if (dragged.length === 1 && moved[node.id]) {
            const sz = sizeOf(node.id);
            const spot = findFreeSpot(moved[node.id], sz, rects(node.id));
            if (spot.x !== Math.round(moved[node.id].x) || spot.y !== Math.round(moved[node.id].y)) {
              moved[node.id] = spot;
              setPositions((p) => ({ ...p, [node.id]: spot }));
            }
          }
          if (Object.keys(moved).length && !frozen) onPositions(moved);
        }}
        onNodeClick={(e, n) => {
          const id = n.id.startsWith("boundary:") ? n.id.slice(9) : n.id;
          if (e.shiftKey && multiOk(id)) {
            // Shift+click adds the box to the selection, or takes it out.
            const cur = selectedNodeIds(selRef.current).filter(multiOk);
            commitSelection(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
          } else onSelect({ type: "node", id });
        }}
        onNodeDoubleClick={(_, n) => {
          const el = diagram.nodes.find((x) => x.id === n.id);
          if (el?.filePath) onOpenFile(el.filePath);
          else if (el?.drillKey) onDrill(el.drillKey);
        }}
        onEdgeClick={(_, e) => onSelect({ type: "edge", id: e.id })}
        onEdgeDoubleClick={(_, e) => openEdge(e.id)}
        onPaneClick={() => onSelect(null)}
        onNodeContextMenu={(e, n) => {
          // Keep the browser's own menu inside a text field (e.g. while renaming).
          if ((e.target as HTMLElement).closest("input, textarea, select")) return;
          e.preventDefault();
          if (n.id.startsWith("boundary:")) return;
          onContextMenu({ type: "node", id: n.id }, { x: e.clientX, y: e.clientY });
        }}
        onEdgeContextMenu={(e, edge) => {
          e.preventDefault();
          onContextMenu({ type: "edge", id: edge.id }, { x: e.clientX, y: e.clientY });
        }}
        onPaneContextMenu={(e) => {
          e.preventDefault();
          onContextMenu({ type: "pane", at: rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }) }, { x: e.clientX, y: e.clientY });
        }}
        onConnect={(c: Connection) => {
          if (!c.source || !c.target || c.source === c.target || !canConnect) return;
          onConnect(c.source, c.target, {
            sourceAnchor: c.sourceHandle ? HANDLE_ANCHOR[c.sourceHandle] : undefined,
            targetAnchor: c.targetHandle ? HANDLE_ANCHOR[c.targetHandle] : undefined,
          });
        }}
        onConnectEnd={(event, cs) => {
          // A line dropped on empty canvas creates a new box there, connected to the box it came from.
          if (cs.isValid || !cs.fromNode || !canConnect || cs.fromNode.id.startsWith("boundary:")) return;
          const target = (event.target as HTMLElement | null)?.closest?.(".react-flow__node");
          if (target) return;
          const pt = "changedTouches" in event ? event.changedTouches[0] : (event as MouseEvent);
          const at = rf.screenToFlowPosition({ x: pt.clientX, y: pt.clientY });
          onConnectToEmpty(cs.fromNode.id, at, cs.fromHandle?.id ? HANDLE_ANCHOR[cs.fromHandle.id] : undefined, { x: pt.clientX, y: pt.clientY });
        }}
        onDragOver={(e) => {
          if (!editable || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          const raw = e.dataTransfer.getData(DRAG_TYPE);
          if (!raw || !editable) return;
          e.preventDefault();
          const item = JSON.parse(raw) as PaletteItem;
          const c = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
          const sz = defaultSize(item.kind);
          const spot = findFreeSpot({ x: c.x - sz.w / 2, y: c.y - sz.h / 2 }, sz, rects());
          onDropItem(item, spot);
        }}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={90}
        deleteKeyCode={null}
        selectionKeyCode="Shift"
        multiSelectionKeyCode={null}
        onSelectionStart={() => {
          boxing.current = true;
        }}
        onSelectionEnd={() => {
          boxing.current = false;
        }}
        onMoveStart={(event) => {
          // A move with an event is the person's (drag, wheel, pinch); fitting the view has none.
          if (event) touched.current = true;
        }}
        zoomOnDoubleClick={false}
        minZoom={0.1}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
      >
        <MarkerDefs />
        <Background gap={22} size={1.2} color="#262a30" />
        <Controls showInteractive={false} position="bottom-right" onFitView={() => rf.fitView(fitOptions(wrapper.current, 200))} />
      </ReactFlow>
    </div>
  );
}
