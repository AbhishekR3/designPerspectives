import { ReactFlowProvider } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import { draftActions, diagramActions, useElementActions } from "./actions";
import { api } from "./api";
import { ApplyDialog, ChangeDetails, ChangeList, DraftList, GhostPanel, PlanDialog, VersionStrip } from "./ChangesPanel";
import { Canvas, type CanvasHandle } from "./Canvas";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { Dock } from "./Dock";
import { CharacteristicsEditor, CostSettingsEditor, LensEditor, TagGroupEditor } from "./editors";
import { FlowCard } from "./FlowCard";
import { FlowPanel } from "./FlowPanel";
import { Icon } from "./icons";
import { diagramEditable, menuItems, useContextMenu } from "./menus";
import { canMove, MoveDialog } from "./MoveDialog";
import { EmptyStart, emptyHint } from "./EmptyState";
import { Palette, paletteItems } from "./Palette";
import { formatMoney, overlayable } from "./overlays";
import { FileEditor } from "./CodeParts";
import { CodeDiagramPanel, ConnectorPanel, EdgePanel, FilePanel, MultiPanel, ObjectPanel, StagePanel } from "./panels";
import { SearchBox } from "./SearchBox";
import { Sidebar } from "./Sidebar";
import { LEVEL_LABEL, type Lens, type Pt, type TagGroup } from "./types";
import { useClipboard } from "./useClipboard";
import { useFlowAutoplay, useFlowPlayer } from "./useFlowPlayer";
import { inLens, useLens, useLensState } from "./useLens";
import { useModel } from "./useModel";
import { useHashSync, useNavigation, useReveal } from "./useNavigation";
import { usePanels } from "./usePanels";
import { useSelection } from "./useSelection";
import { useShortcuts } from "./useShortcuts";
import { confirmDialog, DialogHost, promptDialog } from "./dialogs";
import { Toasts } from "./notify";

type ModalState = { type: "tag"; group: TagGroup | null } | { type: "lens"; lens: Lens | null } | { type: "chars" } | { type: "cost" } | { type: "apply"; draftId: string; title: string } | { type: "plan"; draftId: string } | null;

export default function App() {
  // State. Hook order matters only for effects, which run in this order: first load (useModel),
  // URL/history sync (useHashSync), flow autoplay, keyboard shortcuts.
  const { selection, setSelection, focusName, setFocusName, renameId, setRenameId, clearRename, select, startRename, fresh } = useSelection();
  const lensState = useLensState();
  const { overlay, setOverlay, filters, setFilters } = lensState;
  const { key, setKey, keyRef, open, pickChange } = useNavigation(setSelection);
  const { state, setState, diagram, version, versionRef, changes, error, loadDiagram, refresh, switchVersion, mutate, doHistory } = useModel({
    keyRef,
    setKey,
    setSelection,
    setLensId: lensState.setLensId,
    setOverlay,
    setFilters,
  });
  const [showAllLevels, setShowAllLevels] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [openFile, setOpenFile] = useState<string | null>(null);
  // The "Move to…" dialog (the element being moved), and the move just done, waiting for the model to reload so the element can be shown.
  const [moveId, setMoveId] = useState<string | null>(null);
  const [movedTo, setMovedTo] = useState<{ id: string; parentId: string } | null>(null);
  // A small menu of choices at a screen point (the kind of box a line dragged onto empty canvas adds).
  const [choiceMenu, setChoiceMenu] = useState<{ x: number; y: number; items: MenuItem[]; seq: number } | null>(null);
  const choiceSeq = useRef(0);
  const { menu, setMenu, closeMenu, openMenu } = useContextMenu({ setFocusName, setSelection, setExportOpen });
  const player = useFlowPlayer();
  const { flowStep, setFlowStep, playing, setPlaying } = player;
  const { leftOpen, toggleLeft, startDrag, resetLeft, resetRight, gridTemplateColumns } = usePanels();
  const canvasRef = useRef<CanvasHandle>(null);

  // A box waiting to be renamed that is not on this diagram must not pop open later on another one.
  useEffect(() => {
    if (renameId && diagram && !diagram.nodes.some((n) => n.id === renameId)) clearRename();
  }, [renameId, diagram, clearRename]);

  useHashSync({ key, keyRef, setKey, versionRef, loadDiagram, switchVersion, setSelection, setMenu, setFlowStep, setPlaying });
  const flow = useFlowAutoplay(diagram, player);
  const reveal = useReveal(state, diagram, setKey, setSelection);
  const { lens, chooseLens, chooseLensAfterSave, activeOverlay, decorate } = useLens({ state, setState, diagram, open, lensState });
  const clip = useClipboard({ keyRef, mutate, setSelection });
  const { pasteFrom } = clip;
  const { deleteRelationship, nodeActions, renameElement } = useElementActions({ state, mutate, pasteFrom, open, setSelection, setRenameId, fresh });

  // After a move: show the moved box, selected, where it now is (its new parent's diagram).
  useEffect(() => {
    if (!movedTo || !state) return;
    if (state.elements.find((e) => e.id === movedTo.id)?.parentId === movedTo.parentId) {
      setMovedTo(null);
      reveal(movedTo.id, { home: true });
    }
  }, [movedTo, state, reveal]);
  useShortcuts({ state, diagram, selection, setSelection, setFocusName, setRenameId, setSearchOpen, doHistory, clipboard: clip.clipboard, pasteFrom, deleteRelationship, nodeActions, toggleHelp: () => setHelpOpen((o) => !o), canvasRef });

  if (!state || !lens) {
    return <div className="loading">{error ? `Could not load: ${error}` : "Loading…"}</div>;
  }

  const visibleGroups = state.tagGroups.filter((g) => !lens.hiddenTagGroups.includes(g.name));
  const draftId = version.model.startsWith("draft:") ? version.model.slice(6) : null;
  const { newDraft, discardDraft } = draftActions({ state, draftId, switchVersion });
  const changeOf = (id: string) => (changes ? [...changes.elements, ...changes.relationships].find((c) => c.id === id) : undefined);
  const againstLabel = state.compare?.title ?? "the compared version";
  const { newFlow, addItem, connectToEmpty, connect, savePositions } = diagramActions({
    state,
    diagram,
    key,
    mutate,
    open,
    canvasRef,
    startRename,
    selection,
    setSelection,
    setFocusName,
    openChoiceMenu: (at: Pt, items: MenuItem[]) => setChoiceMenu({ x: at.x, y: at.y, items, seq: ++choiceSeq.current }),
  });
  const canDeleteHere = !!nodeActions && diagramEditable(state, diagram);

  const shownMenu = menu
    ? menuItems(menu, { state, diagram, key, mutate, open, select, setFocusName, setRenameId, setOpenFile, clip, nodeActions, deleteRelationship, selection, deleteMany: (ids) => nodeActions?.removeMany(ids), openMove: setMoveId, addItem, doHistory, canvasRef })
    : [];

  const selectedNode = selection?.type === "node" ? diagram?.nodes.find((n) => n.id === selection.id) : undefined;
  const selectedEdge = selection?.type === "edge" ? diagram?.edges.find((e) => e.id === selection.id) : undefined;
  const selectedChange = selection && selection.type !== "nodes" ? changeOf(selection.id) : undefined;
  const showGhost = !!(selectedNode?.ghost || selectedEdge?.ghost || (selection && diagram?.compare?.removed));
  const selectedElement = selection?.type === "node" ? state.elements.find((e) => e.id === selection.id) : undefined;
  const panelProps = { state, diagram: diagram!, lens, mutate, onSelect: select, onOpen: open, onReveal: reveal, onOpenFile: setOpenFile, focusName, onRename: renameElement, onMove: setMoveId };
  const multiIds = selection?.type === "nodes" ? selection.ids : null;
  const movingEl = moveId ? state.elements.find((e) => e.id === moveId) : undefined;

  const diagramCost = diagram ? overlayable(diagram).reduce((sum, n) => sum + (n.costRollup ?? 0), 0) : 0;
  const tools = (
    <div className="float bar tools">
      {diagramEditable(state, diagram) && (
        <>
        <button className="ghost icon" onClick={() => doHistory("undo")} disabled={!state.canUndo} title="Undo (Ctrl/Cmd+Z)" aria-label="Undo" data-testid="undo">
          <Icon name="undo" />
        </button>
        <button className="ghost icon" onClick={() => doHistory("redo")} disabled={!state.canRedo} title="Redo (Ctrl/Cmd+Shift+Z)" aria-label="Redo" data-testid="redo">
          <Icon name="redo" />
        </button>
        <button className="ghost icon" onClick={() => canvasRef.current?.relayout()} title="Auto-layout: lay the diagram out again" aria-label="Auto-layout" data-testid="auto-layout">
          <Icon name="layout" />
        </button>
        </>
      )}
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
    <div className={`app${leftOpen ? "" : " left-closed"}`} style={{ gridTemplateColumns }}>
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
            void confirmDialog({ title: `Delete the tag group "${g.name}"?`, message: "Its values are removed from every object.", confirmLabel: "Delete", danger: true }).then(
              (yes) => yes && mutate(() => api.deleteTagGroup(g.name)).then((ok) => ok && overlay?.kind === "tag" && overlay.name === g.name && setOverlay(null)),
            );
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
            void promptDialog({ title: "Workspace name", initial: state.workspace.name, confirmLabel: "Rename" }).then((name) => {
              if (name && name !== state.workspace.name) void mutate(() => api.workspace({ name }));
            });
          }}
        />
      ) : (
        <div />
      )}
      {leftOpen ? (
        <div className="resizer" onPointerDown={startDrag("left")} onDoubleClick={resetLeft} role="separator" aria-orientation="vertical" title="Drag to resize the sidebar (double-click: reset)" data-testid="resize-left" />
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
            onPlan={() => draftId && setModal({ type: "plan", draftId })}
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
                onContextMenu={openMenu}
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
                  <li>Right-click a box, a line or empty space for a menu of what you can do there (open, rename, copy and paste, symbol, line shape, arrows, style, add here, layout, zoom).</li>
                  <li>Double-click a system or container to open the next level.</li>
                  <li>Add: drag a database, queue, pipeline, service and more from the palette on the left onto the diagram, or click it.</li>
                  <li>Drag from a dot on any side of a box to another box to connect them, or to empty space to pick a kind and add a connected box.</li>
                  <li>Shift+click boxes, or Shift+drag over empty canvas, to select several: drag or use the arrow keys to move them together, Delete removes them (one undo step).</li>
                  <li>On a context, container or component diagram a new person or system is connected to the system, or to the box you selected. Right-click a container or component, then Move to…, to put it in another parent.</li>
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

          <Toasts>
            {state.readOnly && !version.model.startsWith("ref:") && (
              <div className="float toast info" data-testid="readonly-banner">
                Viewer role: this server is read-only. Changes are refused.
              </div>
            )}
          </Toasts>

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

          {diagram && diagram.nodes.length === 0 &&
            (diagram.level === "landscape" && !state.readOnly && !diagram.compare?.removed ? (
              <EmptyStart onAdd={(testId) => {
                const item = paletteItems(diagram).find((it) => it.testId === testId);
                if (item) void addItem(item);
              }} />
            ) : (
              <div className="empty-hint" data-testid="empty-hint">{emptyHint(diagram.level, state.readOnly)}</div>
            ))}
        </div>
      </main>

      <div className="resizer" onPointerDown={startDrag("right")} onDoubleClick={resetRight} role="separator" aria-orientation="vertical" title="Drag to resize the panel (double-click: reset)" data-testid="resize-right" />
      <aside className="panel">
        {showGhost && (
          <GhostPanel node={selectedNode} edge={selectedEdge} change={selectedChange} against={againstLabel} />
        )}
        {multiIds && diagram && (
          <MultiPanel
            state={state}
            ids={multiIds}
            canDelete={canDeleteHere}
            onDelete={() => nodeActions?.removeMany(multiIds.filter((id) => state.elements.some((x) => x.id === id) && !diagram.nodes.find((n) => n.id === id)?.ghost))}
          />
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
            <p className="muted small">Click an object or connection to see its details here. Press ? or use the help button at the top right.</p>
            {changes && (
              <>
                <h3 className="panel-subtitle">Changes compared with {againstLabel}</h3>
                <ChangeList changes={changes} onPick={pickChange} />
              </>
            )}
          </div>
        )}
      </aside>

      {menu && shownMenu.length > 0 && <ContextMenu key={menu.seq} x={menu.x} y={menu.y} items={shownMenu} onClose={closeMenu} />}
      {choiceMenu && <ContextMenu key={`choice-${choiceMenu.seq}`} x={choiceMenu.x} y={choiceMenu.y} items={choiceMenu.items} keyboard onClose={() => setChoiceMenu(null)} />}
      {movingEl && canMove(movingEl) && (
        <MoveDialog
          state={state}
          element={movingEl}
          onClose={() => setMoveId(null)}
          onMove={async (parentId) => {
            await api.moveElement(movingEl.id, parentId);
            setMoveId(null);
            setMovedTo({ id: movingEl.id, parentId });
            await refresh().catch(() => undefined);
          }}
        />
      )}
      {openFile && <FileEditor path={openFile} onClose={() => setOpenFile(null)} inDraft={!!draftId} onChanged={() => void refresh().catch(() => undefined)} />}
      {modal?.type === "plan" && <PlanDialog state={state} draftId={modal.draftId} onClose={() => setModal(null)} onSaved={() => void refresh().catch(() => undefined)} />}
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
      <DialogHost />
    </div>
  );
}
