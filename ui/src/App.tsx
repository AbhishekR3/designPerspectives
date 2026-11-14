import { ReactFlowProvider } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { Canvas, type CanvasHandle } from "./Canvas";
import { LensEditor, Legend, TagGroupEditor } from "./editors";
import { FlowPanel } from "./FlowPanel";
import { EdgePanel, ObjectPanel, homeDiagramOf } from "./ObjectPanel";
import { Sidebar } from "./Sidebar";
import { KIND_LABEL, LEVEL_LABEL, type AppState, type Diagram, type Kind, type Lens, type Selection, type TagGroup } from "./types";

const LENS_KEY = "dp.lens";
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
          const first = s.diagrams.find((d) => l.visibleLevels.includes(d.level)) ?? s.diagrams[0];
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
    if (diagram && diagram.level !== "flow" && !l.visibleLevels.includes(diagram.level)) {
      const first = state.diagrams.find((d) => l.visibleLevels.includes(d.level));
      if (first) open(first.key);
    }
  };

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

  const addElement = async (kind: Kind) => {
    if (!diagram || !key) return;
    const parentId = (kind === "container" && diagram.level === "container") || (kind === "component" && diagram.level === "component") ? diagram.scope : null;
    const position = canvasRef.current?.center() ?? { x: 0, y: 0 };
    let newId = "";
    const ok = await mutate(async () => {
      newId = (await api.createElement({ kind, parentId, diagramKey: key, position })).id;
    });
    if (ok) {
      setSelection({ type: "node", id: newId });
      setFocusName(true);
    }
  };

  const connect = async (source: string, target: string) => {
    let newId = "";
    const ok = await mutate(async () => {
      newId = (await api.createRelationship({ sourceId: source, destinationId: target })).id;
    });
    if (ok) {
      setSelection({ type: "edge", id: newId });
      setFocusName(true);
    }
  };

  const select = (s: Selection) => {
    setFocusName(false);
    setSelection(s);
  };

  const selectedElement = selection?.type === "node" ? state.elements.find((e) => e.id === selection.id) : undefined;
  const panelProps = { state, diagram: diagram!, lens, mutate, onSelect: select, onOpen: open, onReveal: reveal, focusName };

  return (
    <div className="app">
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

      <main className="main">
        <header className="topbar">
          <nav className="breadcrumb" data-testid="breadcrumb">
            {diagram?.breadcrumb.map((c, i) => (
              <span key={c.key}>
                {i > 0 && <span className="sep">›</span>}
                <button className={`link ${c.key === key ? "active" : ""}`} onClick={() => open(c.key)} data-testid={`crumb-${c.key}`}>
                  {c.label}
                </button>
              </span>
            ))}
            {diagram && diagram.level !== "flow" && !lens.visibleLevels.includes(diagram.level) && (
              <span className="muted small"> (this level is not in the {lens.name} lens)</span>
            )}
          </nav>
          <div className="toolbar">
            {diagram?.addable.map((k) => (
              <button key={k} onClick={() => addElement(k)} data-testid={`add-${k}`}>
                + {KIND_LABEL[k]}
              </button>
            ))}
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
                onPositions={(p) => {
                  if (key && Object.keys(p).length) mutate(() => api.positions(key, p));
                }}
                handleRef={canvasRef}
              />
            </ReactFlowProvider>
          )}
          {diagram && overlay && <Legend group={overlay} diagram={diagram} />}
          {diagram && diagram.nodes.length === 0 && (
            <div className="empty-hint">
              {diagram.level === "flow"
                ? "This flow has no steps yet. Add steps in the panel on the right."
                : `Nothing here yet. Use the + buttons above to add ${diagram.addable.map((k) => KIND_LABEL[k].toLowerCase()).join(", ")}.`}
            </div>
          )}
        </div>
      </main>

      <aside className="panel">
        {selectedElement && diagram && <ObjectPanel key={selectedElement.id} element={selectedElement} {...panelProps} />}
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
        {!selection && diagram && !flow && (
          <div className="panel-body">
            <div className="panel-kind">{diagram.level === "flow" ? "Flow" : `${LEVEL_LABEL[diagram.level]} diagram`}</div>
            <h2 className="panel-title">{diagram.title}</h2>
            <ul className="hints muted small">
              <li>Click a box or line to see and edit it.</li>
              <li>Double-click a system or container to open the next level.</li>
              <li>Drag from the dot on a box's right edge to another box to connect them.</li>
              <li>Dashed lines are derived from relationships between elements inside the boxes.</li>
              <li>Select something and press Delete to remove it.</li>
            </ul>
          </div>
        )}
      </aside>

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
