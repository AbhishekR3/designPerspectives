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
import { canvasInsets } from "./coveredEdges";
import { isMac } from "./ContextMenu";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import {
  CUSTOM_HEADS,
  FLOW_CURRENT,
  MarkerDefs,
  edgeColor,
  edgeTypes,
  layoutPoints,
  lineShape,
  nodeTypes,
  pointAlong,
  type C4EdgeData,
  type C4NodeData,
  type NodeActions,
  type OverlayInfo,
  type Rect4,
} from "./BoxesAndLines";
import { errorMessage, notify, run } from "../common/notify";
import { edgeCommentTarget, type CommentCount } from "../common/comments";
import { CHANGE_COLORS } from "../colourOverlays";
import { DRAG_TYPE, type PaletteItem } from "./Palette";
import { estimateLabelSize } from "./labelSize";
import { edgeBadgeTexts } from "../testing/TestingBadges";
import type { TestingDecor } from "../testing/testingDecor";
import { crowdedPairs, movePoints, selectionInput, spreadLayout, spreadSelected } from "./makeRoom";
import { carryLines, layoutLines, reusable, updateLines, type LineInput, type LinePrevious } from "./lineLayout";
import type { Box } from "./routing";
import { NODE_H, NODE_W, autoLayout, defaultSize, findFreeSpot, placeMissing, type Rect, type Size } from "./layout";
import { nodeSelection, selectedNodeIds, type CommentTarget, type Diagram, type DiagramNode, type EdgeLayout, type Lens, type Pt, type Selection } from "../types";

export interface CanvasHandle {
  freeSpot(size?: Size): Pt;
  /** The free spot nearest to a box of this size centred on `center` (diagram coordinates): its top-left. */
  spotAt(center: Pt, size: Size): Pt;
  relayout(): Promise<void>;
  exportImage(format: "svg" | "png"): Promise<void>;
  /** Move boxes by a step; several boxes are saved in one request. */
  nudge(ids: string[], dx: number, dy: number): void;
  /**
   * Add space between boxes. "room": only where boxes, lines or labels are too close (nothing is saved when nothing is).
   * "out": the same, and every gap grows by about 20%. All moved boxes are saved in one request (one undo step).
   * With two or more boxes selected only those boxes are spread among themselves (around their centre); boxes
   * that are then too close to an unselected box push it away just far enough. Otherwise the whole diagram.
   */
  spread(mode: "room" | "out"): Promise<void>;
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
  /** `auto`: a detail of the edit just made (hand-set line corners carried along with moved boxes), not an undo step of its own. */
  onLayout(patch: LayoutPatch, auto?: boolean): void;
  onOpenFile(path: string): void;
  onContextMenu(target: ContextTarget, client: Pt): void;
  handleRef: Ref<CanvasHandle>;
  /** Open comment threads per element and per relationship (badges), and a click on one. */
  commentCounts: { element: Record<string, CommentCount>; relationship: Record<string, CommentCount> };
  /** System testing mode: what is drawn on lines and boxes (points, breakpoints, paused calls, trace hops); null or absent when the mode is off. */
  testing?: TestingDecor | null;
  onComments(target: CommentTarget): void;
  /** The model shown cannot be changed by this person: no dragging, resizing, connecting or dropping, and nothing is saved. */
  readOnly: boolean;
  /** The model version shown (main, a draft, a git ref) and what it is compared with: when it changes, every line is planned again. */
  version: string;
  /** Extra layers drawn inside the canvas (the comment notes, which pan and zoom with the diagram). */
  children?: ReactNode;
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

/** Shift, or Ctrl (Cmd on a Mac), is held: a click adds a box to the selection or takes it out. On a Mac Ctrl+click is a right-click, so it is not used there. */
const addsToSelection = (e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => e.shiftKey || (isMac ? e.metaKey : e.ctrlKey);

export function Canvas({
  diagram,
  lens,
  decorate,
  actions,
  archTypes,
  renameId,
  onRenameStarted,
  onDropItem,
  onConnectToEmpty,
  flowStep,
  showChanges,
  selection,
  onSelect,
  onDrill,
  onConnect,
  onPositions,
  onLayout,
  onOpenFile,
  onContextMenu,
  handleRef,
  commentCounts,
  testing,
  onComments,
  readOnly,
  version,
  children,
}: Props) {
  const rf = useReactFlow();
  const [positions, setPositions] = useState<P>({});
  const [sizeOverride, setSizeOverride] = useState<Record<string, Size>>({});
  const wrapper = useRef<HTMLDivElement>(null);
  const fitFor = useRef<string | null>(null);
  // Selecting several boxes: the current selection (also right after a change, before the next render),
  // whether a selection box is being drawn, and whether an add-to-selection key was down when the pointer went down.
  const selRef = useRef(selection);
  selRef.current = selection;
  const boxing = useRef(false);
  const addDown = useRef(false);
  const multiIds = useMemo(() => (selection?.type === "nodes" ? new Set(selection.ids) : null), [selection]);
  /** Ghosts (boxes of the compared version), stages and files cannot be part of a multi-selection. */
  const multiOk = useCallback(
    (id: string) => {
      const n = diagram.nodes.find((x) => x.id === id);
      return !!n && !n.ghost && MULTI_KINDS.has(n.kind);
    },
    [diagram],
  );
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
  const savable = useCallback((p: P): P => (frozen ? {} : Object.fromEntries(Object.entries(p).filter(([id]) => !ghosts.has(id)))), [frozen, ghosts]);

  useEffect(() => setSizeOverride({}), [diagram]);
  /** Line layouts saved a moment ago (hand-set corners carried along with moved boxes), shown until the diagram reloads with them. */
  const [edgeOverride, setEdgeOverride] = useState<Record<string, EdgeLayout>>({});
  useEffect(() => setEdgeOverride({}), [diagram]);
  const diagramEdges = useMemo(
    () => (Object.keys(edgeOverride).length ? diagram.edges.map((e) => (edgeOverride[e.id] ? { ...e, layout: edgeOverride[e.id] } : e)) : diagram.edges),
    [diagram, edgeOverride],
  );
  /**
   * Lines with corners set by hand (`EdgeLayout.points`) whose boxes moved: `map` gives their new corners (null: unchanged).
   * Saved as a detail of the move (`auto`), so the move and the corners are one undo step.
   */
  const carryPoints = useCallback(
    (map: (e: Diagram["edges"][number], pts: Pt[]) => Pt[] | null) => {
      if (frozen) return;
      const patch: Record<string, EdgeLayout> = {};
      for (const e of diagramEdges) {
        const pts = layoutPoints(e.layout);
        if (!pts || e.ghost) continue;
        const next = map(e, pts);
        if (!next) continue;
        const layout = { ...e.layout };
        if (next.length) layout.points = next;
        else delete layout.points;
        if (JSON.stringify(layout) !== JSON.stringify(e.layout)) patch[e.id] = layout;
      }
      if (!Object.keys(patch).length) return;
      setEdgeOverride((o) => ({ ...o, ...patch }));
      onLayout({ edges: patch }, true);
    },
    [diagramEdges, frozen, onLayout],
  );
  /** Box positions before a drag, to tell how far each dragged box went. */
  const dragFrom = useRef<P>({});

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
        comments: n.ghost ? null : (commentCounts.element[n.id] ?? null),
        testing: testing?.nodes[n.id] ?? null,
        onComments: (id) => onComments({ type: "element", id }),
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
  }, [
    diagram,
    positions,
    decorate,
    actions,
    archTypes,
    renameId,
    onRenameStarted,
    lens,
    activeNodes,
    step,
    selection,
    multiIds,
    sizeOf,
    editable,
    canConnect,
    onResize,
    onResizeEnd,
    commentCounts,
    testing,
    onComments,
  ]);

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

  /** The routes and label rectangles of the lines as drawn now (filled by `edges`); spread() counts what lies in each gap. */
  const lineGeometry = useRef<{ routes: Pt[][]; labels: Rect[] }>({ routes: [], labels: [] });
  /** Boxes being dragged now (null: none), and a counter that changes when a drag ends so the moved boxes' lines are planned once more. */
  const dragging = useRef<Set<string> | null>(null);
  const [dragEpoch, setDragEpoch] = useState(0);
  /** The last complete planning of the lines (see lineLayout.ts), the version it was for, and the edges built from it. */
  const lineCache = useRef<{ deps: unknown[]; version: string; prev: LinePrevious; edges: Map<string, Edge> } | null>(null);
  /** Set by the layout actions a person asks for (Auto-layout, Make room, Spread out): the next planning covers every line. */
  const replanAll = useRef(false);

  const edges: Edge[] = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const e of diagramEdges) {
      const k = [e.source, e.target].sort().join("|");
      groups.set(k, [...(groups.get(k) ?? []), e.id]);
    }
    const pastSteps = new Set(flow && flowStep !== null ? flow.steps.slice(0, flowStep).map((s) => s.relationshipId) : []);
    const shown = new Set(nodes.map((n) => n.id));
    const unfocused = new Set(diagram.nodes.filter((n) => decorate(n).outOfFocus).map((n) => n.id));
    const visible = diagramEdges.filter((e) => shown.has(e.source) && shown.has(e.target));
    // Right-angle lines are planned together so lines that meet one side of a box get separate slots. The boxes are
    // the same rectangles React Flow measures for the nodes (position and the size set on them above).
    const boxes: Record<string, Box> = {};
    for (const n of nodes) if (!n.id.startsWith("boundary:")) boxes[n.id] = { x: n.position.x, y: n.position.y, w: n.width ?? NODE_W, h: n.height ?? NODE_H };
    const routed: LineInput[] = visible
      .filter((e) => {
        const r = e.layout.routing ?? diagram.lineShape ?? "rounded";
        return r === "orthogonal" || r === "rounded";
      })
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceAnchor: e.layout.sourceAnchor,
        targetAnchor: e.layout.targetAnchor,
        control: e.layout.control,
        fixedT: e.layout.labelT,
        points: layoutPoints(e.layout),
      }));
    const commentsOf = (e: (typeof visible)[number]) => {
      const t = edgeCommentTarget(e);
      return t ? (commentCounts.relationship[t.id] ?? null) : null;
    };
    const labelOf = (e: (typeof visible)[number]) => {
      if (stepRel === e.id && step) return `${flowStep! + 1}. ${step.description || e.description}${step.response ? " (response)" : ""}`;
      return e.steps?.length ? `${e.steps.join(", ")}. ${e.description}` : e.description;
    };
    const labelSizeOf = (e: (typeof visible)[number]) => {
      const c = commentsOf(e);
      const badges = [
        e.kind && e.kind.replace(/-/g, " "),
        e.stageCount > 0 && `${e.stageCount} stages`,
        e.sensitivityLevel && `Sensitive: ${e.sensitivityLevel}`,
        e.hasNotes && "Notes",
        (e.openWork ?? 0) > 0 && `${e.openWork} open`,
        c && c.open > 0 && `${c.open}`,
        ...(testing?.edges[e.id] ? edgeBadgeTexts(testing.edges[e.id]) : []),
      ].filter((b): b is string => !!b);
      return estimateLabelSize({ text: labelOf(e), technologies: e.technologies, badges, fontSize: e.style.fontSize ? e.style.fontSize - 2 : undefined });
    };
    const byId = new Map(visible.map((e) => [e.id, e]));
    const offsetOf = (e: (typeof visible)[number]) => {
      const g = groups.get([e.source, e.target].sort().join("|"))!;
      return g.length > 1 && !e.layout.control ? (g.indexOf(e.id) - (g.length - 1) / 2) * 60 : 0;
    };
    // Every line is planned together only when the diagram (or another version of the model) opens, and after a layout
    // action a person asked for (Auto-layout, Make room, Spread out). After a change by hand (a box moved, a line added
    // or removed) only the lines it touches are planned again, and every other line stays exactly as it was (updateLines).
    // While boxes are dragged, only the lines at the dragged boxes are routed again (see lineLayout.ts), and the edge
    // objects of the lines that did not change are reused as they are.
    const edgeDeps = [diagram, diagramEdges, decorate, flow, flowStep, step, stepRel, selection, editable, onLayout, onSelect, openEdge, showChanges, onContextMenu, commentCounts, dragEpoch, testing];
    const cached = lineCache.current?.version === version ? lineCache.current : null;
    const sizeOfLabel = (id: string) => labelSizeOf(byId.get(id)!);
    const reuse =
      dragging.current && cached && cached.deps.length === edgeDeps.length && cached.deps.every((d, i) => d === edgeDeps[i]) && reusable(cached.prev, boxes, routed, dragging.current) ? cached : null;
    const base = cached && !replanAll.current ? cached.prev : null;
    // While both boxes of a line with corners set by hand are dragged together, the corners go along (saved on release).
    const layout = reuse
      ? layoutLines(boxes, routed, sizeOfLabel, { prev: reuse.prev, dragged: dragging.current!, from: dragFrom.current })
      : base
        ? updateLines(base, boxes, dragging.current ? carryLines(routed, dragFrom.current, boxes, dragging.current) : routed, sizeOfLabel)
        : layoutLines(boxes, routed, sizeOfLabel);
    if (!layout.partial) replanAll.current = false;
    const { ports, routes, labelTs } = layout;
    const obstacles = Object.values(boxes);
    if (!layout.partial) {
      // What spread() counts lying in a gap: every line's polyline and label, whatever its shape.
      const routes2: Pt[][] = layout.items.map((it) => it.pts);
      const labels: Rect[] = layout.items.flatMap((it) => {
        const t = labelTs[it.id];
        if (t === undefined) return [];
        const c = pointAlong(it.pts, t).p;
        return [{ x: c.x - it.size.w / 2, y: c.y - it.size.h / 2, w: it.size.w, h: it.size.h }];
      });
      for (const e of visible) {
        if (ports[e.id]) continue;
        const sb = boxes[e.source];
        const tb = boxes[e.target];
        if (!sb || !tb) continue;
        const routing = e.layout.routing ?? diagram.lineShape ?? "rounded";
        if (routing === "orthogonal" || routing === "rounded") continue; // a line the planner left out (a box to itself)
        const pts = lineShape(sb, tb, e.layout, routing, e.source < e.target ? 1 : -1, offsetOf(e)).pts;
        routes2.push(pts);
        const size = labelSizeOf(e);
        const c = pointAlong(pts, Math.min(0.95, Math.max(0.05, e.layout.labelT ?? 0.5))).p;
        labels.push({ x: c.x - size.w / 2, y: c.y - size.h / 2, w: size.w, h: size.h });
      }
      lineGeometry.current = { routes: routes2, labels };
    }
    const built = visible.map((e): Edge => {
      if (reuse) {
        const old = reuse.edges.get(e.id);
        const routedBefore = reuse.prev.layout.routes[e.id];
        if (old && (routedBefore ? routes[e.id] === routedBefore : !routes[e.id])) return old;
      }
      const offset = offsetOf(e);
      // A call paused on this line looks like the current flow step (and a paused reply runs backwards); a line a trace passed is drawn like a step already played.
      const mark = testing?.edges[e.id] ?? null;
      const current = stepRel === e.id || !!mark?.paused;
      const label = labelOf(e);
      const color = current ? FLOW_CURRENT : edgeColor(e);
      const head = e.style.arrowHead ?? "filled";
      const arrow: Edge["markerEnd"] = (CUSTOM_HEADS as readonly string[]).includes(head)
        ? `dp-head-${head}`
        : { type: head === "open" ? MarkerType.Arrow : MarkerType.ArrowClosed, color, width: 18, height: 18 };
      const reverse = (stepRel === e.id && step?.response) || mark?.paused === "response";
      const mode = e.style.arrow ?? "end";
      const data: C4EdgeData = {
        label,
        technologies: e.technologies,
        kind: e.kind,
        derived: e.derived,
        offset,
        ports: ports[e.id],
        route: routes[e.id],
        obstacles,
        labelT: labelTs[e.id],
        highlight: current ? "current" : pastSteps.has(e.id) || mark?.watched ? "past" : null,
        testing: mark,
        response: !!reverse,
        dimmed: (!!step && !current && !pastSteps.has(e.id)) || unfocused.has(e.source) || unfocused.has(e.target),
        testId: e.id,
        style: e.style,
        layout: e.layout,
        defaultRouting: diagram.lineShape,
        sensitivityLevel: e.sensitivityLevel,
        hasNotes: e.hasNotes,
        stageCount: e.stageCount,
        openWork: e.openWork ?? 0,
        comments: commentsOf(e),
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
    if (!layout.partial) lineCache.current = { deps: edgeDeps, version, prev: { boxes, lines: routed, layout }, edges: new Map(built.map((e) => [e.id, e])) };
    return built;
  }, [
    diagram,
    diagramEdges,
    nodes,
    decorate,
    flow,
    flowStep,
    step,
    stepRel,
    selection,
    editable,
    onLayout,
    onSelect,
    openEdge,
    showChanges,
    onContextMenu,
    commentCounts,
    dragEpoch,
    version,
    testing,
  ]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Selecting is ours (see `selection`). Two cases take what React Flow reports: the box being drawn with
      // Shift+drag, and a plain press on a box while several are selected (so the press does not drag them along).
      const picks = changes.filter((c): c is NodeSelectionChange => c.type === "select");
      if (picks.length && (boxing.current || (selRef.current?.type === "nodes" && !addDown.current))) {
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
        replanAll.current = true; // asked for: every line is planned again with the new places
        setPositions(pos);
        const keep = savable(pos);
        if (Object.keys(keep).length) {
          onPositions(keep);
          // Corners set by hand do not fit a new arrangement: those lines go back to automatic.
          carryPoints(() => []);
        }
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
        const by = { x: Math.round(dx), y: Math.round(dy) };
        carryPoints((e, pts) => (moved[e.source] && moved[e.target] ? pts.map((p) => ({ x: p.x + by.x, y: p.y + by.y })) : null));
      },
      async spread(mode) {
        if (!editable) return;
        // Every placed box takes part, also those a lens or filter hides (their lines are not drawn, but the boxes are
        // still there and would be run over). Boxes that cannot be saved (the compared version's ghosts) stay where they are.
        const boxes = diagram.nodes.filter((n) => positions[n.id]).map((n) => ({ id: n.id, x: positions[n.id]!.x, y: positions[n.id]!.y, w: sizeOf(n.id).w, h: sizeOf(n.id).h }));
        const placed = new Set(boxes.map((b) => b.id));
        const input = { boxes, grouped: groupedIds(diagram).filter((id) => placed.has(id)), routes: lineGeometry.current.routes, labels: lineGeometry.current.labels };
        const picked = selectedNodeIds(selRef.current).filter((id) => placed.has(id) && !ghosts.has(id));
        const scoped = picked.length >= 2;
        const fixed = [...ghosts].filter((id) => placed.has(id));
        if (mode === "room" && crowdedPairs(scoped ? selectionInput(input, picked) : input, { fixed }) === 0) {
          notify.info("Nothing is too close.");
          return;
        }
        const opts = { fixed, ...(mode === "out" ? { factor: 1.2 } : {}) };
        const next = scoped ? spreadSelected(input, picked, opts) : spreadLayout(input, opts);
        const moved: P = {};
        for (const b of boxes) {
          const q = next[b.id];
          if (q && (q.x !== b.x || q.y !== b.y)) moved[b.id] = q;
        }
        if (!Object.keys(moved).length) {
          notify.info("Nothing is too close.");
          return;
        }
        // Asked for on the whole diagram: every line is planned again. On a selection only the lines of the moved boxes are.
        if (!scoped) replanAll.current = true;
        setPositions((prev) => ({ ...prev, ...moved }));
        const keep = savable(moved);
        if (Object.keys(keep).length) {
          onPositions(keep);
          // Corners set by hand move with the boxes: as their two boxes did when those moved together, else with the stretch around them.
          carryPoints((e, pts) => {
            const [a, b] = [boxes.find((x) => x.id === e.source), boxes.find((x) => x.id === e.target)];
            if (!a || !b) return null;
            const da = { x: (keep[a.id]?.x ?? a.x) - a.x, y: (keep[a.id]?.y ?? a.y) - a.y };
            const db = { x: (keep[b.id]?.x ?? b.x) - b.x, y: (keep[b.id]?.y ?? b.y) - b.y };
            if (da.x === db.x && da.y === db.y) return da.x || da.y ? pts.map((p) => ({ x: p.x + da.x, y: p.y + da.y })) : null;
            return movePoints(boxes, keep, pts, [e.source, e.target]);
          });
        }
        requestAnimationFrame(() => rf.fitView(fitOptions(wrapper.current, 300)));
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
            filter: (el: HTMLElement) => !el.classList?.contains("react-flow__handle") && !el.classList?.contains("edge-grip") && !el.classList?.contains("canvas-notes"),
          };
          const url = format === "svg" ? await toSvg(viewport, opts) : await toPng(viewport, { ...opts, pixelRatio: 2 });
          const a = document.createElement("a");
          a.href = url;
          a.download = `${diagram.key}.${format}`;
          a.click();
        });
      },
    }),
    [rf, diagram, nodes, positions, onPositions, rects, sizeOf, direction, editable, ghosts, savable, carryPoints],
  );

  return (
    <div className="canvas" ref={wrapper} data-testid="canvas" onPointerDownCapture={(e) => (addDown.current = addsToSelection(e))}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStart={(_, __, dragged) => {
          dragging.current = new Set(dragged.filter((n) => !n.id.startsWith("boundary:")).map((n) => n.id));
          dragFrom.current = Object.fromEntries(dragged.map((n) => [n.id, { ...n.position }]));
        }}
        onNodeDragStop={(_, node, dragged) => {
          dragging.current = null;
          setDragEpoch((n) => n + 1);
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
          if (Object.keys(moved).length && !frozen) {
            onPositions(moved);
            // A line whose two boxes moved together keeps its corners set by hand where they were on it.
            const by = (id: string) => (moved[id] && dragFrom.current[id] ? { x: moved[id].x - dragFrom.current[id].x, y: moved[id].y - dragFrom.current[id].y } : null);
            carryPoints((e, pts) => {
              const [a, b] = [by(e.source), by(e.target)];
              if (!a || !b || Math.abs(a.x - b.x) > 0.5 || Math.abs(a.y - b.y) > 0.5 || (Math.abs(a.x) < 0.5 && Math.abs(a.y) < 0.5)) return null;
              return pts.map((p) => ({ x: Math.round((p.x + a.x) * 10) / 10, y: Math.round((p.y + a.y) * 10) / 10 }));
            });
          }
        }}
        onNodeClick={(e, n) => {
          const id = n.id.startsWith("boundary:") ? n.id.slice(9) : n.id;
          if (addsToSelection(e) && multiOk(id)) {
            // Shift+click, and Ctrl+click (Cmd+click on a Mac), add the box to the selection, or takes it out.
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
        {children}
      </ReactFlow>
    </div>
  );
}
