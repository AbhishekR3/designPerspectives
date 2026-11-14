import { ReactFlowProvider } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { Canvas, type CanvasHandle } from "./Canvas";
import { LensEditor, Legend, TagGroupEditor } from "./editors";
import { FlowPanel } from "./FlowPanel";
import { FileEditor } from "./CodeParts";
import { CodeDiagramPanel, ConnectorPanel, EdgePanel, FilePanel, ObjectPanel, StagePanel, homeDiagramOf } from "./ObjectPanel";
import { defaultSize } from "./layout";
import { Sidebar } from "./Sidebar";
import { KIND_LABEL, LEVEL_LABEL, type AppState, type Diagram, type DiagramLevel, type Level, type Lens, type Pt, type Selection, type TagGroup } from "./types";

const ADD_LABEL: Record<string, string> = { ...KIND_LABEL, stage: "Stage" };
const inLens = (lens: Lens, level: DiagramLevel) => level === "flow" || level === "connector" || lens.visibleLevels.includes(level as Level);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const LENS_KEY = "dp.lens";
const LEFT_KEY = "dp.leftWidth";
const RIGHT_KEY = "dp.rightWidth";
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

function keyFromHash(): string | null {
  const m = /^#\/d\/(.+)$/.exec(window.location.hash);
  return m ? decodeURIComponent(m[1]) : null;
}

type ModalState = { type: "tag"; group: TagGroup | null } | { type: "lens"; lens: Lens | null } | null;

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [diagram, setDiagram] = useState<Diagram | null>(null);
  const [key, setKey] = useState<string | null>(keyFromHash());
  const [selection, setSelection] = useState<Selection>(null);
  const [focusName, setFocusName] = useState(false);
  const [lensId, setLensId] = useState<string>(storage.get(LENS_KEY) ?? "engineer");
  const [overlayName, setOverlayName] = useState<string | null>(null);
  const [showAllLevels, setShowAllLevels] = useState(false);
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
    if (keyRef.current) await loadDiagram(keyRef.current);
  }, [loadDiagram]);

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
      .then((s) => {
        setState(s);
        const l = s.lenses.find((x) => x.id === lensId) ?? s.lenses[0];
        if (l.defaultOverlay && s.tagGroups.some((g) => g.name === l.defaultOverlay)) setOverlayName(l.defaultOverlay);
        if (!keyRef.current) {
          const first = s.diagrams.find((d) => inLens(l, d.level)) ?? s.diagrams[0];
          setKey(first?.key ?? "landscape");
        }
      })
      .catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!key) return;
    if (keyFromHash() !== key) window.history.replaceState(null, "", `#/d/${encodeURIComponent(key)}`);
    setFlowStep(null);
    setPlaying(false);
    loadDiagram(key);
  }, [key, loadDiagram]);

  useEffect(() => {
    const onHash = () => {
      const k = keyFromHash();
      if (k && k !== keyRef.current) setKey(k);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Flow player
  const flow = diagram?.level === "flow" ? diagram.flow : undefined;
  useEffect(() => {
    if (!playing || !flow) return;
    const t = window.setTimeout(() => {
      if (flowStep === null) setFlowStep(0);
      else if (flowStep < flow.steps.length - 1) setFlowStep(flowStep + 1);
      else setPlaying(false);
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
    const ov = l.defaultOverlay && state.tagGroups.some((g) => g.name === l.defaultOverlay) ? l.defaultOverlay : null;
    setOverlayName(ov);
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

  // Delete key removes the selection (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if (!selection || !state) return;
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

  if (!state || !lens) {
    return <div className="loading">{error ? `Could not load: ${error}` : "Loading…"}</div>;
  }

  const visibleGroups = state.tagGroups.filter((g) => !lens.hiddenTagGroups.includes(g.name));
  const overlay = visibleGroups.find((g) => g.name === overlayName) ?? null;

  const addElement = async (kind: string) => {
    if (!diagram || !key) return;
    if (kind === "stage") {
      const rel = state.relationships.find((r) => r.id === diagram.scope);
      const name = window.prompt("Name of the new stage (a step inside this connector)");
      if (rel && name) await mutate(() => api.updateRelationship(rel.id, { stages: [...rel.stages, { id: "", name }] }));
      return;
    }
    const parentId = (kind === "container" && diagram.level === "container") || (kind === "component" && diagram.level === "component") ? diagram.scope : null;
    const position = canvasRef.current?.freeSpot(defaultSize(kind)) ?? { x: 0, y: 0 };
    let newId = "";
    const ok = await mutate(async () => {
      newId = (await api.createElement({ kind, parentId, diagramKey: key, position })).id;
    });
    if (ok) {
      setSelection({ type: "node", id: newId });
      setFocusName(true);
    }
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

  const savePositions = (p: Record<string, Pt>) => {
    if (!key || !Object.keys(p).length) return;
    if (diagram?.level === "connector" || diagram?.level === "code") mutate(() => api.layout(key, { positions: p }));
    else mutate(() => api.positions(key, p));
  };

  const select = (s: Selection) => {
    setFocusName(false);
    setSelection(s);
  };

  const selectedNode = selection?.type === "node" ? diagram?.nodes.find((n) => n.id === selection.id) : undefined;
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

  return (
    <div className="app" style={{ gridTemplateColumns: `${leftW}px 5px minmax(0, 1fr) 5px ${rightW}px` }}>
      <Sidebar
        state={state}
        lens={lens}
        currentKey={key}
        showAllLevels={showAllLevels}
        setShowAllLevels={setShowAllLevels}
        onOpen={open}
        onLens={chooseLens}
        onEditLens={(l) => setModal({ type: "lens", lens: l })}
        onNewLens={() => setModal({ type: "lens", lens: null })}
        onNewFlow={async () => {
          const title = window.prompt("Name of the new flow");
          if (!title) return;
          let k = "";
          if (await mutate(async () => (k = (await api.createFlow({ title })).key))) open(k);
        }}
        onEditTagGroup={(g) => setModal({ type: "tag", group: g })}
        onNewTagGroup={() => setModal({ type: "tag", group: null })}
        onDeleteTagGroup={(g) => {
          if (window.confirm(`Delete the tag group "${g.name}"? Its values are removed from every object.`))
            mutate(() => api.deleteTagGroup(g.name)).then((ok) => ok && overlayName === g.name && setOverlayName(null));
        }}
        onRenameWorkspace={() => {
          const name = window.prompt("Workspace name", state.workspace.name);
          if (name && name !== state.workspace.name) mutate(() => api.workspace({ name }));
        }}
      />

      <div className="resizer" onPointerDown={startDrag("left")} onDoubleClick={() => { setLeftW(250); storage.set(LEFT_KEY, "250"); }} role="separator" aria-orientation="vertical" title="Drag to resize the sidebar (double-click: reset)" data-testid="resize-left" />
      <main className="main">
        <header className="topbar">
          <nav className="breadcrumb" data-testid="breadcrumb">
            {diagram?.breadcrumb.map((c, i) => (
              <span key={c.key}>
                {i > 0 && <span className="sep">›</span>}
                <button className={`link ${c.key === key ? "active" : ""}`} onClick={() => open(c.key)} data-testid={`crumb-${c.key}`}>
                  {c.c4 && <span className="level-tag">{c.c4}</span>} {c.label}
                </button>
              </span>
            ))}
            {diagram && !inLens(lens, diagram.level) && (
              <span className="muted small"> (this level is not in the {lens.name} lens)</span>
            )}
          </nav>
          <div className="toolbar">
            {diagram?.addable.map((k) => (
              <button key={k} onClick={() => addElement(k)} data-testid={`add-${k}`}>
                + {ADD_LABEL[k] ?? k}
              </button>
            ))}
            <button onClick={() => doHistory("undo")} disabled={!state.canUndo} title="Undo (Ctrl/Cmd+Z)" data-testid="undo">
              Undo
            </button>
            <button onClick={() => doHistory("redo")} disabled={!state.canRedo} title="Redo (Ctrl/Cmd+Shift+Z)" data-testid="redo">
              Redo
            </button>
            <label className="overlay-select">
              Overlay
              <select value={overlay?.name ?? ""} onChange={(e) => setOverlayName(e.target.value || null)} data-testid="overlay-select">
                <option value="">None</option>
                {visibleGroups.map((g) => (
                  <option key={g.name} value={g.name}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <button onClick={() => canvasRef.current?.relayout()} title="Lay the diagram out again" data-testid="auto-layout">
              Auto-layout
            </button>
            <button onClick={() => canvasRef.current?.exportImage("svg")} data-testid="export-svg">
              SVG
            </button>
            <button onClick={() => canvasRef.current?.exportImage("png")} data-testid="export-png">
              PNG
            </button>
          </div>
        </header>
        {error && (
          <div className="error" role="alert" data-testid="error">
            {error}
            <button className="icon" onClick={() => setError(null)} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}
        {flow && (
          <div className="player" data-testid="player">
            <button onClick={() => setFlowStep(flowStep === null || flowStep === 0 ? 0 : flowStep - 1)} disabled={!flow.steps.length} data-testid="step-prev">
              ◀ Prev
            </button>
            <span data-testid="step-counter">
              {flowStep === null ? `${flow.steps.length} steps` : `Step ${flowStep + 1} of ${flow.steps.length}`}
            </span>
            <button
              onClick={() => setFlowStep(flowStep === null ? 0 : Math.min(flow.steps.length - 1, flowStep + 1))}
              disabled={!flow.steps.length}
              data-testid="step-next"
            >
              Next ▶
            </button>
            <button
              onClick={() => {
                if (!playing && (flowStep === null || flowStep >= flow.steps.length - 1)) setFlowStep(null);
                setPlaying(!playing);
              }}
              disabled={!flow.steps.length}
              data-testid="play"
            >
              {playing ? "Pause" : "Play"}
            </button>
            <button
              onClick={() => {
                setPlaying(false);
                setFlowStep(null);
              }}
              disabled={flowStep === null}
            >
              Stop
            </button>
            {flowStep !== null && flow.steps[flowStep] && (
              <span className="step-text">{flow.steps[flowStep].description}</span>
            )}
          </div>
        )}
        <div className="canvas-wrap">
          {diagram && (
            <ReactFlowProvider key={diagram.key}>
              <Canvas
                diagram={diagram}
                lens={lens}
                overlay={overlay}
                flowStep={flowStep}
                selection={selection}
                onSelect={select}
                onDrill={open}
                onConnect={connect}
                onPositions={savePositions}
                onLayout={(patch) => key && mutate(() => api.layout(key, patch))}
                onOpenFile={setOpenFile}
                handleRef={canvasRef}
              />
            </ReactFlowProvider>
          )}
          {diagram && overlay && <Legend group={overlay} diagram={diagram} />}
          {diagram && diagram.nodes.length === 0 && (
            <div className="empty-hint">
              {diagram.level === "flow"
                ? "This flow has no steps yet. Add steps in the panel on the right."
                : diagram.level === "code"
                  ? "No files yet. Add code paths in the panel on the right."
                  : `Nothing here yet. Use the + buttons above to add ${diagram.addable.map((k) => (ADD_LABEL[k] ?? k).toLowerCase()).join(", ")}.`}
            </div>
          )}
        </div>
      </main>

      <div className="resizer" onPointerDown={startDrag("right")} onDoubleClick={() => { setRightW(320); storage.set(RIGHT_KEY, "320"); }} role="separator" aria-orientation="vertical" title="Drag to resize the panel (double-click: reset)" data-testid="resize-right" />
      <aside className="panel">
        {selectedElement && diagram && <ObjectPanel key={selectedElement.id} element={selectedElement} {...panelProps} />}
        {!selectedElement && selectedNode?.kind === "stage" && diagram && <StagePanel key={selectedNode.id} node={selectedNode} {...panelProps} />}
        {!selectedElement && selectedNode?.kind === "file" && diagram && <FilePanel key={selectedNode.id} node={selectedNode} {...panelProps} />}
        {selection?.type === "edge" && diagram && <EdgePanel key={selection.id} edgeId={selection.id} {...panelProps} />}
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
            <ul className="hints muted small">
              <li>Click a box or line to see and edit it.</li>
              <li>Double-click a system or container to open the next level.</li>
              <li>Drag from a dot on any side of a box to any side of another box to connect them.</li>
              <li>Select a box to resize it; select a line to drag its ends, bend it or slide its label.</li>
              <li>Double-click a line to open the connector behind it (pipeline stages, protocol, code).</li>
              <li>Dashed lines are derived from relationships between elements inside the boxes.</li>
              <li>Select something and press Delete to remove it.</li>
            </ul>
          </div>
        )}
      </aside>

      {openFile && <FileEditor path={openFile} onClose={() => setOpenFile(null)} />}
      {modal?.type === "tag" && <TagGroupEditor group={modal.group} onClose={() => setModal(null)} mutate={mutate} />}
      {modal?.type === "lens" && (
        <LensEditor lens={modal.lens} tagGroups={state.tagGroups} onClose={() => setModal(null)} mutate={mutate} onSaved={(id) => chooseLensAfterSave(id)} />
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
        setOverlayName(l.defaultOverlay && s.tagGroups.some((g) => g.name === l.defaultOverlay) ? l.defaultOverlay : null);
      });
    }, 0);
  }
}
