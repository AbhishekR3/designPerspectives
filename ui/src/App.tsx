import { ReactFlowProvider } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, setContext } from "./api";
import { ApplyDialog, ChangeDetails, ChangeList, DraftList, GhostPanel, VersionStrip } from "./ChangesPanel";
import { Canvas, type CanvasHandle, type NodeDecor } from "./Canvas";
import { Dock } from "./Dock";
import { CharacteristicsEditor, CostSettingsEditor, LensEditor, TagGroupEditor } from "./editors";
import { FlowCard } from "./FlowCard";
import { FlowPanel } from "./FlowPanel";
import { Icon, iconFor } from "./icons";
import { Palette, type PaletteItem } from "./Palette";
import type { NodeActions } from "./canvasParts";
import { decodeSpec, formatMoney, matchesFilter, overlayOf, overlayable, specExists, specLabel, techColors, type Filter, type OverlaySpec } from "./overlays";
import { FileEditor } from "./CodeParts";
import { CodeDiagramPanel, ConnectorPanel, EdgePanel, FilePanel, ObjectPanel, StagePanel, homeDiagramOf } from "./ObjectPanel";
import { defaultSize } from "./layout";
import { Sidebar } from "./Sidebar";
import { KIND_LABEL, LEVEL_LABEL, type AppState, type ChangeSet, type Diagram, type DiagramLevel, type DiagramNode, type Level, type Lens, type Pt, type Selection, type TagGroup } from "./types";

const inLens = (lens: Lens, level: DiagramLevel) => level === "flow" || level === "connector" || lens.visibleLevels.includes(level as Level);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const LENS_KEY = "dp.lens";
const LEFT_KEY = "dp.leftWidth";
const RIGHT_KEY = "dp.rightWidth";
const LEFT_OPEN_KEY = "dp.leftOpen";
const storage = {
  get(k: string) {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      window.localStorage.setItem(k, v);
    } catch {
      /* storage unavailable: lens choice is not remembered */
    }
  },
};

/** The URL hash: `#/d/<diagram>`, plus `?m=<model version>&c=<compared version>` when not the main model. */
interface HashState {
  key: string | null;
  model: string;
  compare: string | null;
}
function fromHash(): HashState {
  const m = /^#\/d\/([^?]+)(?:\?(.*))?$/.exec(window.location.hash);
  const q = new URLSearchParams(m?.[2] ?? "");
  return { key: m ? decodeURIComponent(m[1]) : null, model: q.get("m") || "main", compare: q.get("c") || null };
}
function keyFromHash(): string | null {
  return fromHash().key;
}
function hashFor(key: string, model: string, compare: string | null): string {
  const q = new URLSearchParams();
  if (model !== "main") q.set("m", model);
  if (compare) q.set("c", compare);
  const qs = q.toString();
  return `#/d/${encodeURIComponent(key)}${qs ? `?${qs}` : ""}`;
}

type ModalState = { type: "tag"; group: TagGroup | null } | { type: "lens"; lens: Lens | null } | { type: "chars" } | { type: "cost" } | { type: "apply"; draftId: string; title: string } | null;

/** The overlay a lens turns on by default, if it still exists. */
function lensOverlay(l: Lens, s: AppState): OverlaySpec | null {
  const spec = decodeSpec(l.defaultOverlay);
  const groups = s.tagGroups.filter((g) => !l.hiddenTagGroups.includes(g.name));
  return spec && specExists(spec, s, groups) ? spec : null;
}

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [diagram, setDiagram] = useState<Diagram | null>(null);
  const [key, setKey] = useState<string | null>(keyFromHash());
  // Model version shown (main or a draft) and the version it is compared with; sent with every request.
  const [version, setVersion] = useState<{ model: string; compare: string | null }>(() => {
    const h = fromHash();
    setContext(h.model, h.compare);
    return { model: h.model, compare: h.compare };
  });
  const versionRef = useRef(version);
  versionRef.current = version;
  const [changes, setChanges] = useState<ChangeSet | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [focusName, setFocusName] = useState(false);
  const [lensId, setLensId] = useState<string>(storage.get(LENS_KEY) ?? "engineer");
  const [overlay, setOverlay] = useState<OverlaySpec | null>(null);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [leftOpen, setLeftOpen] = useState(storage.get(LEFT_OPEN_KEY) !== "0");
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const clearRename = useCallback(() => setRenameId(null), []);
  const [showAllLevels, setShowAllLevels] = useState(false);
  const navStarted = useRef(false);
  const clipboard = useRef<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [flowStep, setFlowStep] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [leftW, setLeftW] = useState(() => clamp(Number(storage.get(LEFT_KEY)) || 250, 180, 560));
  const [rightW, setRightW] = useState(() => clamp(Number(storage.get(RIGHT_KEY)) || 320, 240, 720));
  const canvasRef = useRef<CanvasHandle>(null);
  const keyRef = useRef(key);
  keyRef.current = key;

  const lens: Lens | null = useMemo(
    () => state?.lenses.find((l) => l.id === lensId) ?? state?.lenses.find((l) => l.id === "engineer") ?? null,
    [state, lensId],
  );

  const loadDiagram = useCallback(async (k: string) => {
    try {
      const d = await api.diagram(k);
      if (keyRef.current === k) setDiagram(d);
    } catch {
      if (keyRef.current === k) setKey("landscape");
    }
  }, []);

  const refresh = useCallback(async () => {
    const s = await api.state();
    setState(s);
    setChanges(versionRef.current.compare ? await api.changes() : null);
    if (keyRef.current) await loadDiagram(keyRef.current);
  }, [loadDiagram]);

  /** Show another model version (main or a draft), optionally compared with another one. */
  const switchVersion = useCallback(
    async (model: string, compare: string | null) => {
      setContext(model, compare);
      const v = { model, compare };
      versionRef.current = v;
      setVersion(v);
      setSelection(null);
      setFilters((fs) => fs.filter((f) => f.spec !== "@changes"));
      setOverlay((o) => (compare ? { kind: "changes" } : o?.kind === "changes" ? null : o));
      if (keyRef.current) window.history.replaceState(null, "", hashFor(keyRef.current, model, compare));
      try {
        await refresh();
        setError(null);
      } catch (e) {
        // The draft is gone (discarded elsewhere, or an old link): fall back to the main model.
        if (model !== "main" && e instanceof ApiError && e.status === 404) await switchVersion("main", null);
        else setError(e instanceof Error ? e.message : String(e));
      }
    },
    [refresh],
  );

  const mutate = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        setError(null);
        await refresh();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        await refresh().catch(() => undefined);
        return false;
      }
    },
    [refresh],
  );

  // First load: pick the starting diagram and overlay from the lens.
  useEffect(() => {
    api
      .state()
      .then(async (s) => {
        setState(s);
        if (versionRef.current.compare) setChanges(await api.changes());
        const l = s.lenses.find((x) => x.id === lensId) ?? s.lenses[0];
        setOverlay(versionRef.current.compare ? { kind: "changes" } : lensOverlay(l, s));
        if (!keyRef.current) {
          const first = s.diagrams.find((d) => inLens(l, d.level)) ?? s.diagrams[0];
          setKey(first?.key ?? "landscape");
        }
      })
      .catch((e) => {
        if (versionRef.current.model !== "main" && e instanceof ApiError && e.status === 404) switchVersion("main", null);
        else setError(String(e));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!key) return;
    if (keyFromHash() !== key) {
      // A new diagram is a new history entry, so the browser Back/Forward buttons walk through diagrams.
      const first = !navStarted.current;
      const h = hashFor(key, versionRef.current.model, versionRef.current.compare);
      if (first) window.history.replaceState(null, "", h);
      else window.history.pushState(null, "", h);
    }
    navStarted.current = true;
    setFlowStep(null);
    setPlaying(false);
    loadDiagram(key);
  }, [key, loadDiagram]);

  useEffect(() => {
    const onHash = () => {
      const h = fromHash();
      const v = versionRef.current;
      if (h.model !== v.model || h.compare !== v.compare) void switchVersion(h.model, h.compare);
      const k = h.key;
      if (k && k !== keyRef.current) {
        setSelection(null);
        setKey(k);
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [switchVersion]);

  // Flow player
  const flow = diagram?.level === "flow" ? diagram.flow : undefined;
  useEffect(() => {
    if (!playing || !flow) return;
    const t = window.setTimeout(() => {
      if (flowStep === null) setFlowStep(0);
      else if (flowStep < flow.steps.length) setFlowStep(flowStep + 1);
      if (flowStep !== null && flowStep >= flow.steps.length - 1) setPlaying(false);
    }, flowStep === null ? 0 : 1600);
    return () => window.clearTimeout(t);
  }, [playing, flowStep, flow]);

  const open = useCallback((k: string) => {
    setSelection(null);
    setKey(k);
  }, []);

  const reveal = useCallback(
    (id: string) => {
      if (!state) return;
      if (diagram?.nodes.some((n) => n.id === id)) {
        setSelection({ type: "node", id });
        return;
      }
      const el = state.elements.find((e) => e.id === id);
      if (!el) return;
      setKey(homeDiagramOf(el));
      setSelection({ type: "node", id });
    },
    [state, diagram],
  );

  const chooseLens = (id: string) => {
    if (!state) return;
    const l = state.lenses.find((x) => x.id === id);
    if (!l) return;
    setLensId(id);
    storage.set(LENS_KEY, id);
    setOverlay(lensOverlay(l, state));
    if (diagram && !inLens(l, diagram.level)) {
      const first = state.diagrams.find((d) => inLens(l, d.level));
      if (first) open(first.key);
    }
  };

  const doHistory = useCallback(
    async (dir: "undo" | "redo") => {
      try {
        await (dir === "undo" ? api.undo() : api.redo());
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
      await refresh().catch(() => undefined);
    },
    [refresh],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) doHistory("undo");
      else if ((k === "z" && e.shiftKey) || k === "y") doHistory("redo");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doHistory]);

  // Editor-style shortcuts: copy/cut/paste/duplicate, select-all is not offered; arrows nudge; zoom; escape.
  const pasteFrom = useCallback(
    async (id: string) => {
      let newId = "";
      const ok = await mutate(async () => {
        newId = (await api.duplicate(id)).id;
      });
      if (ok) setSelection({ type: "node", id: newId });
    },
    [mutate],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable], .cm-editor")) return;
      if (state?.readOnly) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      const nodeId = selection?.type === "node" ? selection.id : null;
      const isElement = nodeId ? state?.elements.some((x) => x.id === nodeId) : false;
      if (mod && !e.altKey) {
        if (k === "c" && isElement) clipboard.current = nodeId;
        else if (k === "x" && isElement) {
          clipboard.current = nodeId;
          const el = state!.elements.find((x) => x.id === nodeId)!;
          if (window.confirm(`Cut "${el.name}"? It is removed now; Paste adds a copy of it.`) )
            mutate(() => api.deleteElement(el.id)).then((ok) => ok && setSelection(null));
        } else if (k === "v" && clipboard.current && state?.elements.some((x) => x.id === clipboard.current)) pasteFrom(clipboard.current);
        else if (k === "d" && isElement) pasteFrom(nodeId!);
        else if (k === "0") canvasRef.current?.fit();
        else if (k === "=" || k === "+") canvasRef.current?.zoom(1);
        else if (k === "-") canvasRef.current?.zoom(-1);
        else return;
        e.preventDefault();
        return;
      }
      if (e.key === "Escape") setSelection(null);
      else if (e.key.startsWith("Arrow") && nodeId) {
        const step = e.shiftKey ? 40 : 10;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key] as number[];
        canvasRef.current?.nudge(nodeId, d[0], d[1]);
      } else if (e.key === "F2" && nodeId) {
        // Rename on the canvas.
        setRenameId(nodeId);
      } else if (e.key === "F2" && selection) setFocusName(true);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, state, mutate, pasteFrom]);

  // Delete key removes the selection (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if (!selection || !state) return;
      const ghost = selection.type === "node" ? diagram?.nodes.find((n) => n.id === selection.id)?.ghost : diagram?.edges.find((x) => x.id === selection.id)?.ghost;
      if (ghost || diagram?.compare?.removed) return;
      if (selection.type === "node") {
        const el = state.elements.find((x) => x.id === selection.id);
        if (el && window.confirm(`Delete "${el.name}"${el.childCount ? ` and the ${el.childCount} element(s) inside it` : ""}?`))
          mutate(() => api.deleteElement(el.id)).then((ok) => ok && setSelection(null));
      } else if (!selection.id.startsWith("derived:") && diagram?.level !== "flow") {
        if (window.confirm("Delete this relationship?"))
          mutate(() => api.deleteRelationship(selection.id)).then((ok) => ok && setSelection(null));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, state, diagram, mutate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Overlay colour, Focus/Hide filters and cost label of each element on the canvas.
  const techs = useMemo(() => (diagram ? techColors(diagram) : new Map<string, string>()), [diagram]);
  const activeOverlay = useMemo(() => {
    if (!state || !lens || !overlay) return null;
    const groups = state.tagGroups.filter((g) => !lens.hiddenTagGroups.includes(g.name));
    return specExists(overlay, state, groups) ? overlay : null;
  }, [state, lens, overlay]);
  const decorate = useCallback(
    (n: DiagramNode): NodeDecor => {
      const isEl = n.kind !== "stage" && n.kind !== "file";
      if (!state || !isEl) return { overlay: null, hidden: false, focused: false, outOfFocus: false, costLabel: null };
      let ov: NodeDecor["overlay"] = null;
      if (activeOverlay) {
        const o = overlayOf(activeOverlay, n, state, techs);
        ov = { group: specLabel(activeOverlay), value: o.key, chip: o.chip, color: o.color };
      }
      const focusFs = filters.filter((f) => f.mode === "focus");
      const focused = focusFs.some((f) => matchesFilter(f, n, state, techs));
      return {
        overlay: ov,
        hidden: filters.some((f) => f.mode === "hide" && matchesFilter(f, n, state, techs)),
        focused,
        outOfFocus: focusFs.length > 0 && !focused,
        costLabel: n.cost?.length || n.costRollup > 0 ? `${formatMoney(n.costRollup, state.costSettings.currency)}/mo` : null,
      };
    },
    [state, activeOverlay, filters, techs],
  );

  const nodeActions = useMemo<NodeActions | null>(
    () =>
      state?.readOnly
        ? null
        : {
            rename: (id, name) => void mutate(() => api.updateElement(id, { name })),
            setArchType: (id, archType) => void mutate(() => api.updateElement(id, { archType })),
            duplicate: (id) => void pasteFrom(id),
            remove: (id) => {
              const el = state?.elements.find((x) => x.id === id);
              if (el && window.confirm(`Delete "${el.name}"${el.childCount ? ` and the ${el.childCount} element(s) inside it` : ""}? Its connections are deleted too.`))
                mutate(() => api.deleteElement(id)).then((ok) => ok && setSelection(null));
            },
            open: (k) => open(k),
          },
    [state, mutate, pasteFrom, open],
  );

  if (!state || !lens) {
    return <div className="loading">{error ? `Could not load: ${error}` : "Loading…"}</div>;
  }

  const visibleGroups = state.tagGroups.filter((g) => !lens.hiddenTagGroups.includes(g.name));
  const toggleLeft = () => {
    storage.set(LEFT_OPEN_KEY, leftOpen ? "0" : "1");
    setLeftOpen(!leftOpen);
  };
  const draftId = version.model.startsWith("draft:") ? version.model.slice(6) : null;
  const newDraft = async () => {
    const title = window.prompt("Name of the new draft (a planned change, edited on a copy of the model)");
    if (!title?.trim()) return;
    try {
      const { id } = await api.createDraft({ title });
      await switchVersion(`draft:${id}`, "base");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const discardDraft = async () => {
    if (!draftId || !window.confirm(`Discard "${state.model.title.replace(/^Draft: /, "")}"? The draft and all its changes are deleted.`)) return;
    try {
      await api.deleteDraft(draftId);
      await switchVersion("main", null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const pickChange = (c: { id: string; type: string; homeKey: string | null }) => {
    if (!c.homeKey) return;
    if (c.homeKey !== key) setKey(c.homeKey);
    if (c.type === "element") setSelection({ type: "node", id: c.id });
    else if (c.type === "relationship") setSelection({ type: "edge", id: c.id });
    else setSelection(null);
  };
  const changeOf = (id: string) => (changes ? [...changes.elements, ...changes.relationships].find((c) => c.id === id) : undefined);
  const againstLabel = state.compare?.title ?? "the compared version";

  const newFlow = async () => {
    const title = window.prompt("Name of the new flow");
    if (!title) return;
    let k = "";
    if (await mutate(async () => (k = (await api.createFlow({ title })).key))) open(k);
  };

  /** Add an object from the palette: at `at` (dropped there) or in the nearest free spot. */
  const addItem = async (item: PaletteItem, at?: Pt) => {
    if (!diagram || !key) return;
    if (item.kind === "stage") {
      const rel = state.relationships.find((r) => r.id === diagram.scope);
      const name = window.prompt("Name of the new stage (a step inside this connector)");
      if (rel && name) await mutate(() => api.updateRelationship(rel.id, { stages: [...rel.stages, { id: "", name }] }));
      return;
    }
    const parentId = (item.kind === "container" && diagram.level === "container") || (item.kind === "component" && diagram.level === "component") ? diagram.scope : null;
    const position = at ?? canvasRef.current?.freeSpot(defaultSize(item.kind)) ?? { x: 0, y: 0 };
    let newId = "";
    const ok = await mutate(async () => {
      newId = (
        await api.createElement({ kind: item.kind, name: item.name, archType: item.archType, external: !!item.external, uniqueName: true, parentId, diagramKey: key, position })
      ).id;
    });
    if (ok) startRename(newId);
    return ok ? newId : null;
  };

  /** Select a new object and let the user type its name straight on the canvas. */
  function startRename(id: string) {
    setFocusName(false);
    setSelection({ type: "node", id });
    setRenameId(id); // consumed by the box when it opens its name field
  }

  /** A line dragged from a box onto empty canvas: add a box of the usual kind there and connect it. */
  const connectToEmpty = async (sourceId: string, at: Pt, sourceAnchor?: Pt) => {
    if (!diagram || !key) return;
    const src = diagram.nodes.find((n) => n.id === sourceId);
    const kind = diagram.level === "container" ? "container" : diagram.level === "component" ? "component" : "softwareSystem";
    if (!diagram.addable.includes(kind)) return;
    const sz = defaultSize(kind);
    const item: PaletteItem = { kind, label: "", name: kind === "softwareSystem" ? "New system" : `New ${kind}`, testId: "" };
    let newId = "";
    const ok = await mutate(async () => {
      const parentId = kind === "softwareSystem" ? null : diagram.scope;
      newId = (await api.createElement({ kind, name: item.name, uniqueName: true, parentId, diagramKey: key, position: { x: Math.round(at.x - sz.w / 2), y: Math.round(at.y - sz.h / 2) } })).id;
      const rel = (await api.createRelationship({ sourceId, destinationId: newId })).id;
      if (sourceAnchor) await api.layout(key, { edges: { [rel]: { sourceAnchor } } });
    });
    if (ok && src) startRename(newId);
  };

  const connect = async (source: string, target: string, anchors: { sourceAnchor?: Pt; targetAnchor?: Pt }) => {
    let newId = "";
    const ok = await mutate(async () => {
      newId = (await api.createRelationship({ sourceId: source, destinationId: target })).id;
      // Remember which sides of the two boxes the line was drawn between.
      if (key && (anchors.sourceAnchor || anchors.targetAnchor)) await api.layout(key, { edges: { [newId]: anchors } });
    });
    if (ok) {
      setSelection({ type: "edge", id: newId });
      setFocusName(true);
    }
  };

  const savePositions = (p: Record<string, Pt>, auto = false) => {
    if (!key || !Object.keys(p).length || state.readOnly) return;
    if (diagram?.level === "connector" || diagram?.level === "code") mutate(() => api.layout(key, { positions: p }));
    else mutate(() => api.positions(key, p, auto));
  };

  const select = (s: Selection) => {
    setFocusName(false);
    setSelection(s);
  };

  const selectedNode = selection?.type === "node" ? diagram?.nodes.find((n) => n.id === selection.id) : undefined;
  const selectedEdge = selection?.type === "edge" ? diagram?.edges.find((e) => e.id === selection.id) : undefined;
  const selectedChange = selection ? changeOf(selection.id) : undefined;
  const showGhost = !!(selectedNode?.ghost || selectedEdge?.ghost || (selection && diagram?.compare?.removed));
  const selectedElement = selection?.type === "node" ? state.elements.find((e) => e.id === selection.id) : undefined;
  const panelProps = { state, diagram: diagram!, lens, mutate, onSelect: select, onOpen: open, onReveal: reveal, onOpenFile: setOpenFile, focusName };
  const startDrag = (side: "left" | "right") => (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const start = side === "left" ? leftW : rightW;
    const set = side === "left" ? setLeftW : setRightW;
    const [lo, hi, k] = side === "left" ? [180, 560, LEFT_KEY] : [240, 720, RIGHT_KEY];
    let last = start;
    const move = (ev: PointerEvent) => {
      last = clamp(start + (side === "left" ? ev.clientX - startX : startX - ev.clientX), lo, hi);
      set(last);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      storage.set(k, String(Math.round(last)));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const diagramCost = diagram ? overlayable(diagram).reduce((sum, n) => sum + (n.costRollup ?? 0), 0) : 0;
  const tools = (
    <div className="float bar tools">
      <button className="ghost icon" onClick={() => doHistory("undo")} disabled={!state.canUndo} title="Undo (Ctrl/Cmd+Z)" aria-label="Undo" data-testid="undo">
        <Icon name="undo" />
      </button>
      <button className="ghost icon" onClick={() => doHistory("redo")} disabled={!state.canRedo} title="Redo (Ctrl/Cmd+Shift+Z)" aria-label="Redo" data-testid="redo">
        <Icon name="redo" />
      </button>
      <button className="ghost icon" onClick={() => canvasRef.current?.relayout()} title="Auto-layout: lay the diagram out again" aria-label="Auto-layout" data-testid="auto-layout">
        <Icon name="layout" />
      </button>
      <span className="export-wrap" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setExportOpen(false)}>
        <button className="ghost icon" onClick={() => setExportOpen(!exportOpen)} aria-haspopup="menu" aria-expanded={exportOpen} title="Download the diagram" aria-label="Download" data-testid="export">
          <Icon name="download" />
        </button>
        {exportOpen && (
          <div className="pop-menu right" role="menu">
            {(["png", "svg"] as const).map((f) => (
              <button
                key={f}
                role="menuitem"
                data-testid={`export-${f}`}
                onClick={() => {
                  setExportOpen(false);
                  canvasRef.current?.exportImage(f);
                }}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </span>
    </div>
  );

  return (
    <div className={`app${leftOpen ? "" : " left-closed"}`} style={{ gridTemplateColumns: `${leftOpen ? `${leftW}px 5px` : "0 0"} minmax(0, 1fr) 5px ${rightW}px` }}>
      {leftOpen ? (
        <Sidebar
          state={state}
          lens={lens}
          currentKey={key}
          showAllLevels={showAllLevels}
          setShowAllLevels={setShowAllLevels}
          onOpen={open}
          onClose={toggleLeft}
          onEditLens={(l) => setModal({ type: "lens", lens: l })}
          onNewLens={() => setModal({ type: "lens", lens: null })}
          onEditTagGroup={(g) => setModal({ type: "tag", group: g })}
          onNewTagGroup={() => setModal({ type: "tag", group: null })}
          onDeleteTagGroup={(g) => {
            if (window.confirm(`Delete the tag group "${g.name}"? Its values are removed from every object.`))
              mutate(() => api.deleteTagGroup(g.name)).then((ok) => ok && overlay?.kind === "tag" && overlay.name === g.name && setOverlay(null));
          }}
          onEditCharacteristics={() => setModal({ type: "chars" })}
          onEditCost={() => setModal({ type: "cost" })}
          draftsSection={
            <DraftList
              state={state}
              onSwitch={(ref) => switchVersion(ref, ref.startsWith("draft:") ? "base" : null)}
              onNewDraft={newDraft}
              onCompareRef={(r) => switchVersion(version.model.startsWith("ref:") ? "main" : version.model, `ref:${r}`)}
            />
          }
          onRenameWorkspace={() => {
            const name = window.prompt("Workspace name", state.workspace.name);
            if (name && name !== state.workspace.name) mutate(() => api.workspace({ name }));
          }}
        />
      ) : (
        <div />
      )}
      {leftOpen ? (
        <div className="resizer" onPointerDown={startDrag("left")} onDoubleClick={() => { setLeftW(250); storage.set(LEFT_KEY, "250"); }} role="separator" aria-orientation="vertical" title="Drag to resize the sidebar (double-click: reset)" data-testid="resize-left" />
      ) : (
        <div />
      )}
      <main className="main">
        {(version.model !== "main" || version.compare) && (
          <VersionStrip
            state={state}
            isDraft={!!draftId}
            showChanges={!!version.compare}
            setShowChanges={(v) => switchVersion(version.model, v ? "base" : null)}
            onApply={() => draftId && setModal({ type: "apply", draftId, title: state.model.title.replace(/^Draft: /, "") })}
            onDiscard={discardDraft}
            onStopCompare={() => switchVersion(version.model, null)}
            onExit={() => switchVersion("main", null)}
          />
        )}
        <div className="canvas-wrap">
          {diagram && (
            <ReactFlowProvider key={diagram.key}>
              <Canvas
                diagram={diagram}
                lens={lens}
                decorate={decorate}
                actions={nodeActions}
                archTypes={state.enums.archTypes}
                renameId={renameId}
                onRenameStarted={clearRename}
                onDropItem={(item, at) => addItem(item, at)}
                onConnectToEmpty={connectToEmpty}
                flowStep={flowStep}
                showChanges={activeOverlay?.kind === "changes"}
                selection={selection}
                onSelect={select}
                onDrill={open}
                onConnect={connect}
                onPositions={savePositions}
                onLayout={(patch) => key && !state.readOnly && mutate(() => api.layout(key, patch))}
                onOpenFile={setOpenFile}
                handleRef={canvasRef}
              />
            </ReactFlowProvider>
          )}

          <div className="hud top-left">
            <div className="float bar nav">
              <button className="ghost icon" onClick={() => open("landscape")} title="System landscape" aria-label="Home" data-testid="nav-home">
                <Icon name="home" />
              </button>
              <button className="ghost icon" onClick={() => window.history.back()} title="Back to the previous diagram (Alt+Left)" aria-label="Back" data-testid="nav-back">
                <Icon name="back" />
              </button>
              <button className="ghost icon" onClick={() => window.history.forward()} title="Forward (Alt+Right)" aria-label="Forward" data-testid="nav-forward">
                <Icon name="forward" />
              </button>
              <span className="divider" />
              <button className={`ghost${leftOpen ? " on" : ""}`} onClick={toggleLeft} title="Show or hide the diagram list" data-testid="toggle-diagrams">
                Diagrams
              </button>
              <span className="divider" />
              <nav className="breadcrumb" data-testid="breadcrumb">
                <Icon name="layers" size={14} className="muted" />
                {diagram?.breadcrumb.map((c, i) => (
                  <span key={c.key} className="crumb">
                    {i > 0 && <span className="sep">/</span>}
                    <button className={`link ${c.key === key ? "active" : ""}`} onClick={() => open(c.key)} data-testid={`crumb-${c.key}`}>
                      {c.c4 && <span className={`level-tag c4-${c.c4}`}>{c.c4}</span>} {c.label}
                    </button>
                  </span>
                ))}
              </nav>
            </div>
            {diagram && !inLens(lens, diagram.level) && <div className="float note small">This level is not in the {lens.name} lens.</div>}
            <FlowCard
              state={state}
              diagram={diagram}
              flow={flow}
              flowStep={flowStep}
              setFlowStep={setFlowStep}
              playing={playing}
              setPlaying={setPlaying}
              onOpen={open}
              onNewFlow={newFlow}
            />
          </div>

          <div className="hud top-right">
            <div className="float bar">
              <button className="ghost search-btn" onClick={() => setSearchOpen(true)} title="Find an object (Ctrl/Cmd+K)" data-testid="search">
                <Icon name="search" /> <span className="kbd">⌘K</span>
              </button>
              <span className="divider" />
              <label className="lens-pick" title="Lens: what this audience sees by default">
                <Icon name="eye" size={14} />
                <select value={lens.id} onChange={(e) => chooseLens(e.target.value)} data-testid="lens-select" aria-label="Lens">
                  {state.lenses.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <span className="divider" />
              <button className={`ghost icon${helpOpen ? " on" : ""}`} onClick={() => setHelpOpen(!helpOpen)} aria-label="Help" title="Help" data-testid="help">
                <Icon name="help" />
              </button>
            </div>
            {tools}
            {helpOpen && (
              <div className="float help-card small" data-testid="help-card">
                <ul className="hints">
                  <li>Click a box or line to see and edit it in the panel on the right.</li>
                  <li>Double-click a system or container to open the next level.</li>
                  <li>Add: drag a database, queue, pipeline, service and more from the palette on the left onto the diagram, or click it.</li>
                  <li>Drag from a dot on any side of a box to another box to connect them, or to empty space to add a connected box.</li>
                  <li>Rename on the canvas: select a box, then click its name (or press F2). The bar above a selected box also changes its symbol, opens it, duplicates or deletes it.</li>
                  <li>Select a box to resize it; select a line to drag its ends, bend it, or slide its label along it.</li>
                  <li>Double-click a line to open the connector behind it.</li>
                  <li>Dashed lines are derived from relationships between elements inside the boxes.</li>
                  <li>Bottom left: colour boxes by a tag group, technology, characteristic or cost; click a value to focus on or hide those boxes.</li>
                  <li>Ctrl/Cmd+K: find an object. Delete: remove the selection. F2: rename.</li>
                </ul>
              </div>
            )}
          </div>

          {(error || state.readOnly) && (
            <div className="hud top-center">
              {state.readOnly && !version.model.startsWith("ref:") && (
                <div className="float toast info" data-testid="readonly-banner">
                  Viewer role: this server is read-only. Changes are refused.
                </div>
              )}
              {error && (
                <div className="float toast error" role="alert" data-testid="error">
                  {error}
                  <button className="ghost icon" onClick={() => setError(null)} aria-label="Dismiss">
                    <Icon name="close" size={13} />
                  </button>
                </div>
              )}
            </div>
          )}

          {diagram && diagram.level !== "code" && diagram.level !== "connector" && (
            <Dock
              state={state}
              diagram={diagram}
              groups={visibleGroups}
              overlay={activeOverlay}
              setOverlay={setOverlay}
              filters={filters}
              setFilters={setFilters}
              onEditTagGroup={(g) => setModal({ type: "tag", group: g })}
              onNewTagGroup={() => setModal({ type: "tag", group: null })}
              onEditCharacteristics={() => setModal({ type: "chars" })}
              onEditCost={() => setModal({ type: "cost" })}
            />
          )}

          {diagram && !state.readOnly && !diagram.compare?.removed && diagram.level !== "flow" && diagram.level !== "code" && <Palette diagram={diagram} onAdd={(it) => addItem(it)} />}

          {diagram && diagram.nodes.length === 0 && (
            <div className="empty-hint">
              {diagram.level === "flow"
                ? "This flow has no steps yet. Add steps in the panel on the right."
                : diagram.level === "code"
                  ? "No files yet. Add code paths in the panel on the right."
                  : "Nothing here yet. Drag something from the Add palette on the left onto the diagram."}
            </div>
          )}
        </div>
      </main>

      <div className="resizer" onPointerDown={startDrag("right")} onDoubleClick={() => { setRightW(320); storage.set(RIGHT_KEY, "320"); }} role="separator" aria-orientation="vertical" title="Drag to resize the panel (double-click: reset)" data-testid="resize-right" />
      <aside className="panel">
        {showGhost && (
          <GhostPanel node={selectedNode} edge={selectedEdge} change={selectedChange} against={againstLabel} />
        )}
        {!showGhost && selectedChange && selectedChange.change !== "added" && <ChangeDetails change={selectedChange} against={againstLabel} />}
        {!showGhost && selectedElement && diagram && <ObjectPanel key={selectedElement.id} element={selectedElement} {...panelProps} />}
        {!showGhost && !selectedElement && selectedNode?.kind === "stage" && diagram && <StagePanel key={selectedNode.id} node={selectedNode} {...panelProps} />}
        {!selectedElement && selectedNode?.kind === "file" && diagram && <FilePanel key={selectedNode.id} node={selectedNode} {...panelProps} />}
        {!showGhost && selection?.type === "edge" && diagram && <EdgePanel key={selection.id} edgeId={selection.id} {...panelProps} />}
        {!selection && flow && (
          <FlowPanel
            flow={flow}
            state={state}
            mutate={mutate}
            onDeleted={() => open("landscape")}
            flowStep={flowStep}
            setFlowStep={setFlowStep}
          />
        )}
        {!selection && diagram?.level === "connector" && <ConnectorPanel {...panelProps} />}
        {!selection && diagram?.level === "code" && <CodeDiagramPanel {...panelProps} />}
        {!selection && diagram && !flow && diagram.level !== "connector" && diagram.level !== "code" && (
          <div className="panel-body">
            <div className="panel-kind">{diagram.c4 && `${diagram.c4} · `}{LEVEL_LABEL[diagram.level]} diagram</div>
            <h2 className="panel-title">{diagram.title}</h2>
            <dl className="facts">
              <dt>Objects</dt>
              <dd>{overlayable(diagram).length}</dd>
              <dt>Connections</dt>
              <dd>{diagram.edges.length}</dd>
              {diagramCost > 0 && (
                <>
                  <dt>Monthly cost</dt>
                  <dd>{formatMoney(diagramCost, state.costSettings.currency)}</dd>
                </>
              )}
            </dl>
            <p className="muted small">Click an object or connection to see its details here. Press ? at the top right for help.</p>
            {changes && (
              <>
                <h3 className="panel-subtitle">Changes compared with {againstLabel}</h3>
                <ChangeList changes={changes} onPick={pickChange} />
              </>
            )}
          </div>
        )}
      </aside>

      {openFile && <FileEditor path={openFile} onClose={() => setOpenFile(null)} />}
      {searchOpen && (
        <SearchBox
          state={state}
          onClose={() => setSearchOpen(false)}
          onPick={(id) => {
            setSearchOpen(false);
            reveal(id);
          }}
          onOpen={(k) => {
            setSearchOpen(false);
            open(k);
          }}
        />
      )}
      {modal?.type === "apply" && (
        <ApplyDialog
          draftId={modal.draftId}
          title={modal.title}
          onClose={() => setModal(null)}
          onApplied={() => {
            setModal(null);
            void switchVersion("main", null);
          }}
        />
      )}
      {modal?.type === "tag" && <TagGroupEditor group={modal.group} onClose={() => setModal(null)} mutate={mutate} />}
      {modal?.type === "chars" && <CharacteristicsEditor items={state.characteristics} onClose={() => setModal(null)} mutate={mutate} />}
      {modal?.type === "cost" && <CostSettingsEditor settings={state.costSettings} onClose={() => setModal(null)} mutate={mutate} />}
      {modal?.type === "lens" && (
        <LensEditor
          lens={modal.lens}
          tagGroups={state.tagGroups}
          characteristics={state.characteristics}
          onClose={() => setModal(null)}
          mutate={mutate}
          onSaved={(id) => chooseLensAfterSave(id)}
        />
      )}
    </div>
  );

  function chooseLensAfterSave(id: string) {
    // State is refreshed by mutate before this runs; re-read lenses on the next tick.
    window.setTimeout(() => {
      api.state().then((s) => {
        setState(s);
        const l = s.lenses.find((x) => x.id === id);
        if (!l) return;
        setLensId(id);
        storage.set(LENS_KEY, id);
        setOverlay(lensOverlay(l, s));
      });
    }, 0);
  }
}

/** Ctrl/Cmd+K: find an object or a diagram by name, description or technology. */
function SearchBox({ state, onClose, onPick, onOpen }: { state: AppState; onClose(): void; onPick(id: string): void; onOpen(key: string): void }) {
  const [q, setQ] = useState("");
  const [cur, setCur] = useState(0);
  const t = q.trim().toLowerCase();
  const els = state.elements
    .filter((e) => !t || e.name.toLowerCase().includes(t) || e.description.toLowerCase().includes(t) || e.technologies.some((x) => x.toLowerCase().includes(t)))
    .slice(0, 10)
    .map((e) => ({ type: "el" as const, id: e.id, label: e.name, sub: `${KIND_LABEL[e.kind]}${e.technologies.length ? ` · ${e.technologies.join(", ")}` : ""}`, icon: iconFor(e.kind, e.archType) }));
  const ds = state.diagrams
    .filter((d) => t && (d.title.toLowerCase().includes(t) || d.label.toLowerCase().includes(t)))
    .slice(0, 5)
    .map((d) => ({ type: "d" as const, id: d.key, label: d.title, sub: `${d.c4 ? `${d.c4} · ` : ""}${LEVEL_LABEL[d.level]} diagram`, icon: "layers" }));
  const items = [...els, ...ds];
  const pick = (i: number) => {
    const it = items[i];
    if (!it) return;
    if (it.type === "el") onPick(it.id);
    else onOpen(it.id);
  };
  return (
    <div className="modal-backdrop top" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="search-box" role="dialog" aria-label="Search">
        <div className="search-input">
          <Icon name="search" />
          <input
            autoFocus
            value={q}
            placeholder="Find an object or diagram…"
            onChange={(e) => {
              setQ(e.target.value);
              setCur(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") setCur(Math.min(items.length - 1, cur + 1));
              else if (e.key === "ArrowUp") setCur(Math.max(0, cur - 1));
              else if (e.key === "Enter") pick(cur);
              else return;
              e.preventDefault();
            }}
            data-testid="search-input"
          />
        </div>
        <ul className="search-results">
          {items.map((it, i) => (
            <li key={`${it.type}-${it.id}`}>
              <button className={i === cur ? "on" : ""} onMouseEnter={() => setCur(i)} onClick={() => pick(i)} data-testid={`result-${it.id}`}>
                <Icon name={it.icon} size={15} />
                <span>{it.label}</span>
                <span className="muted small">{it.sub}</span>
              </button>
            </li>
          ))}
          {items.length === 0 && <li className="muted small pad">Nothing found.</li>}
        </ul>
      </div>
    </div>
  );
}
