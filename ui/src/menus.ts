// The right-click menus: the same actions as the quick bar, keyboard shortcuts, toolbar and panel,
// gathered where the user clicked.
import { useCallback, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { api } from "./api";
import type { CanvasHandle, ContextTarget } from "./Canvas";
import type { NodeActions } from "./canvasParts";
import { keys, tidy, type MenuItem } from "./ContextMenu";
import { iconFor } from "./icons";
import { defaultSize } from "./layout";
import { paletteItems, type PaletteItem } from "./Palette";
import type { AppState, Diagram, DiagramEdge, DiagramNode, EdgeLayout, Pt, Selection, Style } from "./types";
import type { Clipboard } from "./useClipboard";

/** Choices in the line menus; labels match the panel. */
const LINE_SHAPES: ["auto" | NonNullable<EdgeLayout["routing"]>, string][] = [
  ["auto", "Automatic"],
  ["straight", "Straight"],
  ["curved", "Curved"],
  ["smooth", "Smooth S-curve"],
  ["orthogonal", "Right angles (elbow)"],
  ["rounded", "Rounded right angles"],
];
const ARROWS: [NonNullable<Style["arrow"]>, string][] = [
  ["end", "Arrow at the end"],
  ["start", "Arrow at the start"],
  ["both", "Arrows at both ends"],
  ["none", "No arrows"],
];
const ARROW_HEADS: [NonNullable<Style["arrowHead"]>, string][] = [
  ["filled", "Filled arrowhead"],
  ["open", "Open arrowhead"],
  ["diamond", "Diamond"],
  ["diamond-open", "Open diamond"],
  ["circle", "Circle"],
  ["bar", "Bar"],
];

/** The open right-click menu: where it was opened and on what. */
export interface MenuState {
  x: number;
  y: number;
  target: ContextTarget;
  seq: number;
}

export function useContextMenu(p: {
  setFocusName: Dispatch<SetStateAction<boolean>>;
  setSelection: Dispatch<SetStateAction<Selection>>;
  setExportOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const { setFocusName, setSelection, setExportOpen } = p;
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuSeq = useRef(0);
  const closeMenu = useCallback(() => setMenu(null), []);
  /** Right-click: a box or line is selected too (as a click would), then the menu opens at the pointer. */
  const openMenu = useCallback((target: ContextTarget, at: Pt) => {
    if (target.type !== "pane") {
      setFocusName(false);
      setSelection(target);
    }
    setExportOpen(false);
    setMenu({ x: at.x, y: at.y, target, seq: ++menuSeq.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setExportOpen, setFocusName, setSelection are stable (state setters or refs), so it is safe to leave out of the dependencies
  }, []);
  return { menu, setMenu, closeMenu, openMenu };
}

/** What the menus act on and with. */
export interface MenuContext {
  state: AppState;
  diagram: Diagram | null;
  key: string | null;
  mutate(fn: () => Promise<unknown>): Promise<boolean>;
  open(k: string): void;
  select(s: Selection): void;
  setFocusName: Dispatch<SetStateAction<boolean>>;
  setRenameId: Dispatch<SetStateAction<string | null>>;
  setOpenFile: Dispatch<SetStateAction<string | null>>;
  clip: Clipboard;
  nodeActions: NodeActions | null;
  deleteRelationship(relId: string): void;
  addItem(item: PaletteItem, at?: Pt): Promise<string | null | undefined>;
  doHistory(dir: "undo" | "redo"): Promise<void>;
  canvasRef: RefObject<CanvasHandle | null>;
}

/** The items of the open menu (empty when none is open or its box or line is gone). */
export function menuItems(menu: MenuState | null, c: MenuContext): MenuItem[] {
  const { state, diagram, key, mutate, open, select, setFocusName, setRenameId, setOpenFile, nodeActions, deleteRelationship, addItem, doHistory, canvasRef } = c;
  const { clipboard, styleClip, cutElement, pasteFrom, pasteStyle } = c.clip;
  const frozen = !!diagram?.compare?.removed;

  const styleItems = (target: string, style: Style, kind: "node" | "edge", canEdit: boolean): MenuItem[] => [
    { label: "Copy style", icon: "brush", testId: "ctx-copy-style", onSelect: () => (styleClip.current = { ...style }) },
    canEdit && { label: "Paste style", icon: "brush", testId: "ctx-paste-style", disabled: !styleClip.current, onSelect: () => pasteStyle(target, kind) },
    canEdit && { label: "Reset style", testId: "ctx-reset-style", disabled: Object.keys(style).length === 0, onSelect: () => void mutate(() => api.style(target, null)) },
  ].filter(Boolean) as MenuItem[];

  const nodeMenu = (n: DiagramNode): MenuItem[] => {
    const el = state.elements.find((x) => x.id === n.id);
    const canEdit = !state.readOnly && !frozen && !n.ghost;
    const canEditEl = !!el && canEdit;
    const clip = clipboard.current && state.elements.some((x) => x.id === clipboard.current) ? clipboard.current : null;
    return tidy([
      n.drillKey && { label: "Open", icon: "search", shortcut: "Double-click", testId: "ctx-open", onSelect: () => open(n.drillKey!) },
      n.filePath && { label: "Open file", icon: "file", shortcut: "Double-click", testId: "ctx-open-file", onSelect: () => setOpenFile(n.filePath!) },
      { label: el ? "Edit details…" : "Show details", icon: "panel", testId: "ctx-details", onSelect: () => (select({ type: "node", id: n.id }), setFocusName(!!el)) },
      { sep: true },
      canEditEl && { label: "Rename", icon: "edit", shortcut: "F2", testId: "ctx-rename", onSelect: () => setRenameId(n.id) },
      canEditEl &&
        n.kind !== "person" && {
          label: "Symbol",
          icon: "shapes",
          testId: "ctx-symbol",
          submenu: state.enums.archTypes.map((a) => ({
            label: a.label,
            checked: (n.archType || "box") === a.id,
            testId: `ctx-symbol-${a.id}`,
            onSelect: () => void mutate(() => api.updateElement(n.id, { archType: a.id })),
          })),
        },
      canEditEl &&
        (n.kind === "person" || n.kind === "softwareSystem") && {
          label: "External",
          checked: n.external,
          testId: "ctx-external",
          onSelect: () => void mutate(() => api.updateElement(n.id, { external: !n.external })),
        },
      { sep: true },
      canEditEl && { label: "Cut", icon: "cut", shortcut: keys("Mod+X"), testId: "ctx-cut", onSelect: () => cutElement(n.id) },
      el && { label: "Copy", icon: "copy", shortcut: keys("Mod+C"), testId: "ctx-copy", onSelect: () => (clipboard.current = n.id) },
      el && canEdit && { label: "Paste", icon: "paste", shortcut: keys("Mod+V"), testId: "ctx-paste", disabled: !clip, onSelect: () => clip && void pasteFrom(clip) },
      canEditEl && { label: "Duplicate", icon: "copy", shortcut: keys("Mod+D"), testId: "ctx-duplicate", onSelect: () => void pasteFrom(n.id) },
      { sep: true },
      ...styleItems(n.id, n.style ?? {}, "node", canEdit),
      canEdit && diagram?.level !== "flow" && { label: "Reset size", icon: "resize", testId: "ctx-reset-size", disabled: !n.size, onSelect: () => key && void mutate(() => api.layout(key, { sizes: { [n.id]: null } })) },
      { sep: true },
      canEditEl && {
        label: n.childCount ? `Delete (and ${n.childCount} inside)` : "Delete",
        icon: "trash",
        shortcut: "Del",
        danger: true,
        testId: "ctx-delete",
        onSelect: () => nodeActions?.remove(n.id),
      },
    ]);
  };

  const edgeMenu = (e: DiagramEdge): MenuItem[] => {
    const canEdit = !state.readOnly && !frozen && !e.ghost;
    const real = !e.derived && !e.id.startsWith("file:");
    const relId = real ? e.relationshipIds[0] : null;
    const styleTarget = e.id.startsWith("conn:") && relId ? relId : e.id;
    // Relationships are deleted from the diagrams they are drawn on (not flows, connectors or code).
    const deletable = canEdit && !!relId && !e.id.startsWith("conn:") && ["landscape", "context", "container", "component"].includes(diagram?.level ?? "");
    const lineEditable = canEdit && diagram?.level !== "flow";
    const setLine = (layout: EdgeLayout) => key && void mutate(() => api.layout(key, { edges: { [e.id]: layout } }));
    const setStyle = (patch: Partial<Style>) => void mutate(() => api.style(styleTarget, { ...e.style, ...patch }));
    const routing = e.layout.routing ?? "auto";
    const arrow = e.style.arrow ?? "end";
    const head = e.style.arrowHead ?? "filled";
    return tidy([
      e.detailKey && { label: "Open connector", icon: "search", shortcut: "Double-click", testId: "ctx-open", onSelect: () => open(e.detailKey!) },
      !e.detailKey &&
        e.drillTargets.length === 1 && { label: "Open where it is drawn", icon: "search", shortcut: "Double-click", testId: "ctx-open", onSelect: () => open(e.drillTargets[0].key) },
      !e.detailKey &&
        e.drillTargets.length > 1 && {
          label: "Open where it is drawn",
          icon: "search",
          testId: "ctx-open",
          submenu: e.drillTargets.map((t) => ({ label: t.title, onSelect: () => open(t.key) })),
        },
      { label: relId && canEdit ? "Edit label…" : "Show details", icon: relId && canEdit ? "edit" : "panel", testId: "ctx-details", onSelect: () => (select({ type: "edge", id: e.id }), setFocusName(!!relId && canEdit)) },
      { sep: true },
      lineEditable && {
        label: "Line shape",
        icon: "line",
        testId: "ctx-line-shape",
        submenu: LINE_SHAPES.map(([v, label]) => ({
          label,
          checked: routing === v,
          testId: `ctx-line-${v}`,
          onSelect: () => {
            const next = { ...e.layout };
            if (v === "auto") delete next.routing;
            else next.routing = v;
            setLine(next);
          },
        })),
      },
      canEdit && {
        label: "Arrows",
        icon: "forward",
        testId: "ctx-arrows",
        submenu: [
          ...ARROWS.map(([v, label]): MenuItem => ({ label, checked: arrow === v, testId: `ctx-arrow-${v}`, onSelect: () => setStyle({ arrow: v }) })),
          { sep: true },
          ...ARROW_HEADS.map(([v, label]): MenuItem => ({ label, checked: head === v, testId: `ctx-head-${v}`, onSelect: () => setStyle({ arrowHead: v }) })),
        ],
      },
      lineEditable && { label: "Reset line position", icon: "restart", testId: "ctx-reset-line", disabled: Object.keys(e.layout).length === 0, onSelect: () => setLine({}) },
      { sep: true },
      ...styleItems(styleTarget, e.style, "edge", canEdit),
      { sep: true },
      deletable && { label: "Delete", icon: "trash", shortcut: "Del", danger: true, testId: "ctx-delete", onSelect: () => deleteRelationship(relId!) },
    ]);
  };

  const paneMenu = (at: Pt): MenuItem[] => {
    if (!diagram) return [];
    const canEdit = !state.readOnly && !frozen;
    const addable = canEdit && diagram.level !== "flow" && diagram.level !== "code" ? paletteItems(diagram) : [];
    const clip = clipboard.current ? state.elements.find((x) => x.id === clipboard.current) : undefined;
    // A copy lands where the original's parent is drawn, so only place it here when the original is on this diagram.
    const clipHere = clip && diagram.nodes.some((n) => n.id === clip.id);
    const up = diagram.breadcrumb.length > 1 ? diagram.breadcrumb[diagram.breadcrumb.length - 2] : null;
    return tidy([
      addable.length > 0 && {
        label: "Add here",
        icon: "plus",
        testId: "ctx-add",
        submenu: addable.map((it) => ({
          label: it.label,
          icon: it.kind === "stage" ? "stage" : iconFor(it.kind, it.archType),
          testId: `ctx-${it.testId}`,
          onSelect: () => void addItem(it, canvasRef.current?.spotAt(at, defaultSize(it.kind))),
        })),
      },
      canEdit && {
        label: clipHere ? "Paste here" : "Paste",
        icon: "paste",
        shortcut: keys("Mod+V"),
        testId: "ctx-paste",
        disabled: !clip,
        onSelect: () => clip && void pasteFrom(clip.id, clipHere ? canvasRef.current?.spotAt(at, defaultSize(clip.kind)) : undefined),
      },
      { sep: true },
      canEdit && { label: "Undo", icon: "undo", shortcut: keys("Mod+Z"), testId: "ctx-undo", disabled: !state.canUndo, onSelect: () => void doHistory("undo") },
      canEdit && { label: "Redo", icon: "redo", shortcut: keys("Mod+Shift+Z"), testId: "ctx-redo", disabled: !state.canRedo, onSelect: () => void doHistory("redo") },
      { sep: true },
      canEdit && diagram.nodes.length > 0 && { label: "Auto-layout", icon: "layout", testId: "ctx-auto-layout", onSelect: () => void canvasRef.current?.relayout() },
      { label: "Fit to screen", icon: "fit", shortcut: keys("Mod+0"), testId: "ctx-fit", onSelect: () => canvasRef.current?.fit() },
      { label: "Zoom in", icon: "zoomIn", shortcut: keys("Mod++"), onSelect: () => canvasRef.current?.zoom(1) },
      { label: "Zoom out", icon: "zoomOut", shortcut: keys("Mod+-"), onSelect: () => canvasRef.current?.zoom(-1) },
      { sep: true },
      up && { label: `Up to ${up.label}`, icon: "up", testId: "ctx-up", onSelect: () => open(up.key) },
      {
        label: "Download",
        icon: "download",
        testId: "ctx-download",
        submenu: (["png", "svg"] as const).map((f) => ({ label: f.toUpperCase(), testId: `ctx-download-${f}`, onSelect: () => void canvasRef.current?.exportImage(f) })),
      },
    ]);
  };

  if (!menu) return [];
  const t = menu.target;
  if (t.type === "pane") return paneMenu(t.at);
  if (t.type === "node") {
    const n = diagram?.nodes.find((x) => x.id === t.id);
    return n ? nodeMenu(n) : [];
  }
  const e = diagram?.edges.find((x) => x.id === t.id);
  return e ? edgeMenu(e) : [];
}
