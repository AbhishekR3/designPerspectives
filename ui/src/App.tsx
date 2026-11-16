import { ReactFlowProvider } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import { useElementSize, useInsetVars } from "./insets";
import { PALETTE_KEY, storage } from "./storage";
import { draftActions, diagramActions, useElementActions } from "./actions";
import { api } from "./api";
import { ApplyDialog, ChangeDetails, ChangeList, DraftDialog, DraftList, GhostPanel, PlanDialog, VersionStrip } from "./ChangesPanel";
import { Canvas, type CanvasHandle } from "./Canvas";
import { CommentsContext, DiagramComments, useComments } from "./comments";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { Dock } from "./Dock";
import { CharacteristicsEditor, CostSettingsEditor, LensEditor, TagGroupEditor } from "./editors";
import { FlowCard } from "./FlowCard";
import { FlowPanel } from "./FlowPanel";
import { HelpCard } from "./HelpCard";
import { Icon } from "./icons";
import { UserChip } from "./UserChip";
import type { LineShape } from "./lineShapes";
import { canSpread, diagramEditable, menuItems, spreadLabels, useContextMenu } from "./menus";
import { canMove, MoveDialog } from "./MoveDialog";
import { LiveUiInspector } from "./LiveUiInspector";
import { Backtrack } from "./Backtrack";
import type { BacktrackQuery } from "./api";
import { EmptyStart, emptyHint } from "./EmptyState";
import { Palette, paletteItems } from "./Palette";
import { formatMoney, overlayable } from "./overlays";
import { FileEditor } from "./CodeParts";
import { ReadOnlyContext } from "./fields";
import { CodeDiagramPanel, ConnectorPanel, EdgePanel, FilePanel, MultiPanel, ObjectPanel, StagePanel } from "./panels";
import { SearchBox } from "./SearchBox";
import { Sidebar } from "./Sidebar";
import { LEVEL_LABEL, type CommentTarget, type Lens, type Pt, type Selection, type TagGroup } from "./types";
import { useClipboard } from "./useClipboard";
import { useFlowAutoplay, useFlowPlayer } from "./useFlowPlayer";
import { inLens, useLens, useLensState } from "./useLens";
import { useModel } from "./useModel";
import { useHashSync, useNavigation, usePage, useReveal } from "./useNavigation";
import { decisionFlags, DecisionsPage } from "./DecisionsPage";
import { useCatalog } from "./useCatalog";
import type { HubInfo } from "./types";
import { usePanels } from "./usePanels";
import { useSelection } from "./useSelection";
import { useShortcuts } from "./useShortcuts";
import { confirmDialog, DialogHost, promptDialog } from "./dialogs";
import { notify, Toasts } from "./notify";

type ModalState =
  | { type: "tag"; group: TagGroup | null }
  | { type: "lens"; lens: Lens | null }
  | { type: "chars" }
  | { type: "cost" }
  | { type: "apply"; draftId: string; title: string }
  | { type: "plan"; draftId: string }
  | { type: "draft"; mode: "new" }
  | { type: "draft"; mode: "rename" | "description"; draftId: string }
  | null;

/** The Add palette starts collapsed on a canvas narrower than this (until the person opens it). */
const PALETTE_OPEN_FROM = 720;

export default function App({ onSignOut, hub, project = null, initialReveal = null }: { onSignOut(): void; hub?: HubInfo; project?: string | null; initialReveal?: string | null }) {
  // State. Hook order matters only for effects, which run in this order: first load (useModel),
  // URL/history sync (useHashSync), flow autoplay, keyboard shortcuts.
  const { selection, setSelection, focusName, setFocusName, renameId, setRenameId, clearRename, select, startRename, fresh } = useSelection();
  const lensState = useLensState();
  const { overlay, setOverlay, filters, setFilters } = lensState;
  const { key, setKey, keyRef, open, pickChange } = useNavigation(setSelection);
  // A page over the diagram (decision records), kept in the URL with the diagram under it.
  const { page, setPage } = usePage(keyRef);
  const decisionsOpen = page === "decisions" || !!page?.startsWith("decisions/");
  const decisionId = page?.startsWith("decisions/") ? page.slice("decisions/".length) : null;
  const { state, diagram, version, versionRef, loading, changes, loadError, retryLoad, loadDiagram, refresh, switchVersion, mutate, doHistory } = useModel({
    keyRef,
    setKey,
    setSelection,
    setLensId: lensState.setLensId,
    overlay,
    setOverlay,
    filters,
    setFilters,
  });
  const [showAllLevels, setShowAllLevels] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [backtrackQ, setBacktrackQ] = useState<BacktrackQuery | null>(null);
  // The "Move to…" dialog (the element being moved), and the move just done, waiting for the model to reload so the element can be shown.
  const [moveId, setMoveId] = useState<string | null>(null);
  const [movedTo, setMovedTo] = useState<{ id: string; parentId: string } | null>(null);
  // A small menu of choices at a screen point (the kind of box a line dragged onto empty canvas adds).
  const [choiceMenu, setChoiceMenu] = useState<{ x: number; y: number; items: MenuItem[]; seq: number } | null>(null);
  const choiceSeq = useRef(0);
  const { menu, setMenu, closeMenu, openMenu } = useContextMenu({ setFocusName, setSelection, setExportOpen });
  const player = useFlowPlayer();
  const { flowStep, setFlowStep, playing, setPlaying } = player;
  const { leftOpen, rightOpen, toggleLeft, toggleRight, startDrag, resetLeft, resetRight, gridTemplateColumns } = usePanels();
  const canvasRef = useRef<CanvasHandle>(null);
  // F2 on a line asks the panel to focus its name field: show the panel if it is collapsed.
  useEffect(() => {
    if (focusName && !rightOpen) toggleRight();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new request for the name field matters
  }, [focusName]);
  // The canvas area: its width decides how the controls on it lay out (data-cw) and whether the Add palette starts open.
  const [wrapEl, setWrapEl] = useState<HTMLDivElement | null>(null);
  const wrapSize = useElementSize(wrapEl);
  useInsetVars(wrapEl);
  const [palettePref, setPalettePref] = useState(() => storage.get(PALETTE_KEY));
  const paletteOpen = palettePref === null ? !wrapSize || wrapSize.w >= PALETTE_OPEN_FROM : palettePref === "1";
  const togglePalette = () => {
    const next = paletteOpen ? "0" : "1";
    storage.set(PALETTE_KEY, next);
    setPalettePref(next);
  };
  const cw = !wrapSize ? "md" : wrapSize.w < 560 ? "xs" : wrapSize.w < 800 ? "sm" : wrapSize.w < 1100 ? "md" : "lg";

  // A box waiting to be renamed that is not on this diagram must not pop open later on another one.
  useEffect(() => {
    if (renameId && diagram && !diagram.nodes.some((n) => n.id === renameId)) clearRename();
  }, [renameId, diagram, clearRename]);

  useHashSync({ key, keyRef, setKey, versionRef, loadDiagram, switchVersion, setSelection, setMenu, setFlowStep, setPlaying });
  const flow = useFlowAutoplay(diagram, player);
  const reveal = useReveal(state, diagram, setKey, setSelection);
  // A link from the home page or the catalog page names an element to show (`reveal=`): once, when the model is in.
  const revealed = useRef(false);
  useEffect(() => {
    if (revealed.current || !initialReveal || !state || !diagram) return;
    revealed.current = true;
    reveal(initialReveal, { home: true });
    if (!rightOpen) toggleRight();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as soon as the state and a diagram are loaded
  }, [state, diagram]);
  const catalog = useCatalog(hub, project);
  /** Open the decisions page (at one decision); the selection goes, so diagram keys cannot act on it unseen. */
  const openDecision = (id: string | null) => {
    setSelection(null);
    setPage(id ? `decisions/${id}` : "decisions", { replace: decisionsOpen });
  };
  /** From the decisions page: show an element or relationship (by its source) on its diagram. */
  const revealFromPage = (id: string) => {
    setPage(null, { replace: true });
    const rel = state?.relationships.find((r) => r.id === id);
    reveal(rel ? rel.sourceId : id);
  };
  // Opening another diagram (sidebar, breadcrumb, search, Back) closes the page.
  const pageKey = useRef(key);
  useEffect(() => {
    if (pageKey.current !== key && page) setPage(null, { replace: true });
    pageKey.current = key;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a change of diagram closes the page
  }, [key]);
  const { lens, chooseLens, chooseLensAfterSave, activeOverlay, decorate } = useLens({ state, refresh, diagram, open, lensState });
  const clip = useClipboard({ keyRef, mutate, setSelection });
  const { pasteFrom } = clip;
  const comments = useComments(state);
  /** Show an object's discussion: select it and open the details panel (with `compose`, a new comment box too). */
  const showComments = (target: CommentTarget, selectAs: Selection, compose: boolean) => {
    setFocusName(false);
    select(selectAs);
    if (!rightOpen) toggleRight();
    if (compose) comments.askFor(target);
  };
  const { deleteRelationship, nodeActions, renameElement } = useElementActions({ state, mutate, pasteFrom, open, setSelection, setRenameId, fresh });

  // After a move: show the moved box, selected, where it now is (its new parent's diagram).
  useEffect(() => {
    if (!movedTo || !state) return;
    if (state.elements.find((e) => e.id === movedTo.id)?.parentId === movedTo.parentId) {
      setMovedTo(null);
      reveal(movedTo.id, { home: true });
    }
  }, [movedTo, state, reveal]);
  useShortcuts({
    state,
    diagram,
    selection,
    setSelection,
    setFocusName,
    setRenameId,
    setSearchOpen,
    doHistory,
    clipboard: clip.clipboard,
    pasteFrom,
    deleteRelationship,
    nodeActions,
    toggleHelp: () => setHelpOpen((o) => !o),
    canvasRef,
    openMenu,
  });

  if (!state || !lens) {
    return (
      <div className="loading">
        {loadError ? (
          <>
            Could not load: {loadError}{" "}
            <button onClick={() => void retryLoad()} data-testid="retry-load">
              Retry
            </button>
          </>
        ) : (
          "Loading…"
        )}
      </div>
    );
  }

  const visibleGroups = state.tagGroups.filter((g) => !lens.hiddenTagGroups.includes(g.name));
  const draftId = version.model.startsWith("draft:") ? version.model.slice(6) : null;
  const { createDraft, updateDraft, discardDraft } = draftActions({ state, draftId, switchVersion, refresh });
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
  // A server that is read-only for everyone (dp serve --read-only): nobody can change anything, signed in or not.
  const serverReadOnly = state.readOnly && !state.can.createDraft && state.me?.role !== "viewer" && !state.model.ref.startsWith("ref:");
  // Why a code file cannot be saved here (the server decides; this says why).
  const codeNote = state.model.ref.startsWith("ref:")
    ? "An earlier version from git: read-only."
    : serverReadOnly
      ? "This server is read-only: code files cannot be changed."
      : state.me?.role === "engineer" && state.model.ref === "main"
        ? "Your role cannot change code files on the main model: read-only. Open a draft to plan code edits."
        : "Your role cannot change code files here: read-only.";
  const canDeleteHere = !!nodeActions && diagramEditable(state, diagram);

  const shownMenu = menu
    ? menuItems(menu, {
        state,
        diagram,
        key,
        mutate,
        open,
        select,
        setFocusName,
        setRenameId,
        setOpenFile,
        clip,
        nodeActions,
        deleteRelationship,
        selection,
        deleteMany: (ids) => nodeActions?.removeMany(ids),
        openMove: setMoveId,
        addItem,
        doHistory,
        canvasRef,
        comment: (target, selectAs) => showComments(target, selectAs, true),
        canComment: comments.can,
      })
    : [];

  const selectedNode = selection?.type === "node" ? diagram?.nodes.find((n) => n.id === selection.id) : undefined;
  const selectedEdge = selection?.type === "edge" ? diagram?.edges.find((e) => e.id === selection.id) : undefined;
  const selectedChange = selection && selection.type !== "nodes" ? changeOf(selection.id) : undefined;
  const showGhost = !!(selectedNode?.ghost || selectedEdge?.ghost || (selection && diagram?.compare?.removed));
  const selectedElement = selection?.type === "node" ? state.elements.find((e) => e.id === selection.id) : undefined;
  const panelProps = {
    state,
    diagram: diagram!,
    lens,
    mutate,
    onSelect: select,
    onOpen: open,
    onReveal: reveal,
    onOpenFile: setOpenFile,
    onInspectUi: setInspectId,
    onBacktrack: setBacktrackQ,
    onOpenDecision: (id: string) => openDecision(id),
    catalog,
    focusName,
    onRename: renameElement,
    onMove: setMoveId,
  };
  const decisionsToLook = state.decisions.filter((d) => decisionFlags(d).some((f) => f.tone === "warn")).length;
  const multiIds = selection?.type === "nodes" ? selection.ids : null;
  const movingEl = moveId ? state.elements.find((e) => e.id === moveId) : undefined;

  const diagramCost = diagram ? overlayable(diagram).reduce((sum, n) => sum + (n.costRollup ?? 0), 0) : 0;
  const tools = (
    <div className="float bar tools" data-testid="bar-tools">
      {state.me && (
        <>
          <UserChip me={state.me} role={state.can.createDraft ? state.me.role : "viewer"} onSignOut={onSignOut} />
          <span className="divider" />
        </>
      )}
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
      {canSpread(state, diagram) && (
        <>
          <button
            className="ghost icon"
            onClick={() => void canvasRef.current?.spread("room")}
            title={`${spreadLabels(selection).room}: add space where boxes, lines or labels are too close`}
            aria-label={spreadLabels(selection).room}
            data-testid="make-room"
          >
            <Icon name="room" />
          </button>
          <button
            className="ghost icon"
            onClick={() => void canvasRef.current?.spread("out")}
            title={`${spreadLabels(selection).out}: add about 20% more space between ${spreadLabels(selection).scope === "selected" ? "the selected boxes" : "all boxes"}`}
            aria-label={spreadLabels(selection).out}
            data-testid="spread-out"
          >
            <Icon name="spread" />
          </button>
        </>
      )}
      {(comments.can || comments.openTotal > 0) && (
        <button
          className={`ghost icon comments-btn${!selection && rightOpen ? " on" : ""}`}
          onClick={() => {
            select(null);
            if (!rightOpen) toggleRight();
          }}
          title={`Comments, ideas and questions (${comments.openTotal} open). Shows the discussion of this diagram.`}
          aria-label={`Comments: ${comments.openTotal} open`}
          data-testid="comments-open"
        >
          <Icon name="comment" />
          {comments.openTotal > 0 && <span className="comments-count">{comments.openTotal > 99 ? "99+" : comments.openTotal}</span>}
        </button>
      )}
      <span className="export-wrap" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setExportOpen(false)}>
        <button
          className="ghost icon"
          onClick={() => setExportOpen(!exportOpen)}
          aria-haspopup="menu"
          aria-expanded={exportOpen}
          title="Download the diagram"
          aria-label="Download"
          data-testid="export"
        >
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
          homeLabel={hub?.mode === "hub" ? hub.name : "Home"}
          draftsSection={
            <DraftList
              state={state}
              onSwitch={(ref) => switchVersion(ref, ref.startsWith("draft:") ? "base" : null)}
              onNewDraft={() => setModal({ type: "draft", mode: "new" })}
              onRename={(d) => setModal({ type: "draft", mode: "rename", draftId: d.id })}
              onEditDescription={(d) => setModal({ type: "draft", mode: "description", draftId: d.id })}
              onDiscard={(d) => void discardDraft(d.id, d.title)}
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
        <div
          className="resizer"
          onPointerDown={startDrag("left")}
          onDoubleClick={resetLeft}
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize the sidebar (double-click: reset)"
          data-testid="resize-left"
        />
      ) : (
        <div />
      )}
      <main className="main">
        {state.me?.role === "engineer" && state.model.ref === "main" && state.can.createDraft && (
          <div className="role-banner" data-testid="role-banner">
            <Icon name="layers" size={14} />
            <span>You are viewing the main model. Engineers propose changes in a draft.</span>
            <button className="primary small" onClick={() => setModal({ type: "draft", mode: "new" })} data-testid="role-start-draft">
              Start a draft
            </button>
          </div>
        )}
        {(version.model !== "main" || version.compare) && (
          <VersionStrip
            state={state}
            isDraft={!!draftId}
            showChanges={!!version.compare}
            setShowChanges={(v) => switchVersion(version.model, v ? "base" : null)}
            onApply={() => draftId && setModal({ type: "apply", draftId, title: state.model.title.replace(/^Draft: /, "") })}
            onPlan={() => draftId && setModal({ type: "plan", draftId })}
            onDiscard={() => void discardDraft()}
            onStopCompare={() => switchVersion(version.model, null)}
            onExit={() => switchVersion("main", null)}
          />
        )}
        <div className={`canvas-wrap${loading ? " loading-diagram" : ""}`} ref={setWrapEl} data-cw={cw} aria-busy={loading || undefined} data-testid="canvas-wrap">
          {loading && <div className="load-bar" role="progressbar" aria-label="Loading" data-testid="loading-bar" />}
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
                commentCounts={comments.counts}
                onComments={(t) => showComments(t, { type: "node", id: t.id }, false)}
                readOnly={state.readOnly}
              />
            </ReactFlowProvider>
          )}

          <div className="topbar" data-testid="topbar" data-occludes="top">
            <div className="topbar-main">
              <div className="float bar nav" data-testid="bar-nav">
                <div className="nav-controls">
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
                  <button
                    className={`ghost diagrams-btn${leftOpen ? " on" : ""}`}
                    onClick={toggleLeft}
                    title="Show or hide the diagram list"
                    aria-label="Diagrams"
                    aria-pressed={leftOpen}
                    data-testid="toggle-diagrams"
                  >
                    <Icon name="panel" size={14} /> <span className="diagrams-label">Diagrams</span>
                  </button>
                  <button
                    className={`ghost diagrams-btn decisions-btn${decisionsOpen ? " on" : ""}`}
                    onClick={() => (decisionsOpen ? setPage(null) : openDecision(null))}
                    title={`Decision records${decisionsToLook ? ` (${decisionsToLook} need a look)` : ""}`}
                    aria-label="Decisions"
                    aria-pressed={decisionsOpen}
                    data-testid="open-decisions"
                  >
                    <Icon name="document" size={14} /> <span className="diagrams-label">Decisions</span>
                    {decisionsToLook > 0 && <span className="comments-count">{decisionsToLook}</span>}
                  </button>
                  <span className="divider" />
                </div>
                <nav className="breadcrumb" data-testid="breadcrumb" aria-label="Breadcrumb">
                  <Icon name="layers" size={14} className="muted" />
                  {diagram?.breadcrumb.map((c, i, all) => (
                    <span key={c.key} className={`crumb${i === all.length - 1 ? " last" : ""}`}>
                      {i > 0 && <span className="sep">/</span>}
                      <button className={`link ${c.key === key ? "active" : ""}`} onClick={() => open(c.key)} title={c.label} data-testid={`crumb-${c.key}`}>
                        {c.c4 && <span className={`level-tag c4-${c.c4}`}>{c.c4}</span>}
                        <span className="crumb-label">{c.label}</span>
                      </button>
                    </span>
                  ))}
                </nav>
              </div>
              <div className="topbar-right">
                <div className="float bar" data-testid="bar-actions">
                  <button className="ghost search-btn" onClick={() => setSearchOpen(true)} title="Find an object (Ctrl/Cmd+K)" aria-label="Find an object" data-testid="search">
                    <Icon name="search" /> <span className="kbd">⌘K</span>
                  </button>
                  <span className="divider" />
                  <label className="lens-pick" title={`Lens: ${lens.name}. What this audience sees by default`}>
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
                  <button
                    className={`ghost icon${helpOpen ? " on" : ""}`}
                    onClick={() => setHelpOpen(!helpOpen)}
                    aria-label="Help"
                    aria-expanded={helpOpen}
                    title="Help and keyboard shortcuts (?)"
                    data-testid="help"
                  >
                    <Icon name="help" />
                  </button>
                </div>
              </div>
              <Toasts>
                {serverReadOnly && (
                  <div className="float toast info" data-testid="readonly-banner">
                    Viewer role: this server is read-only. Changes are refused.
                  </div>
                )}
              </Toasts>
            </div>
            <div className="topbar-sub">
              <div className="topbar-left">
                {diagram && !inLens(lens, diagram.level) && <div className="float note small">This level is not in the {lens.name} lens.</div>}
                <FlowCard state={state} diagram={diagram} flow={flow} flowStep={flowStep} setFlowStep={setFlowStep} playing={playing} setPlaying={setPlaying} onOpen={open} onNewFlow={newFlow} />
              </div>
              {tools}
            </div>
          </div>
          {helpOpen && <HelpCard onClose={() => setHelpOpen(false)} />}

          <div className="left-stack">
            {diagram && !state.readOnly && !diagram.compare?.removed && diagram.level !== "flow" && diagram.level !== "code" && (
              <Palette diagram={diagram} open={paletteOpen} onToggle={togglePalette} onAdd={(it) => addItem(it)} />
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
          </div>

          {decisionsOpen && <DecisionsPage state={state} selected={decisionId} onSelect={(id) => openDecision(id)} onClose={() => setPage(null)} onReveal={revealFromPage} mutate={mutate} />}
          {diagram && diagram.nodes.length === 0 && (
            <div className="free-area">
              {diagram.level === "landscape" && !state.readOnly && !diagram.compare?.removed ? (
                <EmptyStart
                  onAdd={(testId) => {
                    const item = paletteItems(diagram).find((it) => it.testId === testId);
                    if (item) void addItem(item);
                  }}
                />
              ) : (
                <div className="empty-hint" data-testid="empty-hint">
                  {emptyHint(diagram.level, state.readOnly)}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {rightOpen ? (
        <div
          className="resizer"
          onPointerDown={startDrag("right")}
          onDoubleClick={resetRight}
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize the panel (double-click: reset)"
          data-testid="resize-right"
        />
      ) : (
        <div />
      )}
      {!rightOpen && (
        <aside className="panel rail" data-testid="panel-rail">
          <button className="ghost icon" onClick={toggleRight} aria-label="Show the details panel" title="Show the details panel" aria-expanded={false} data-testid="panel-open">
            <Icon name="panel" className="flip" />
          </button>
          {selection && <span className="rail-dot" title="Something is selected: open the details panel to see it" data-testid="panel-selected" />}
        </aside>
      )}
      <aside className="panel" hidden={!rightOpen} data-testid="panel">
        <div className="panel-head">
          <span className="muted small">Details</span>
          <button className="ghost icon" onClick={toggleRight} aria-label="Hide the details panel" title="Hide the details panel" aria-expanded={true} data-testid="panel-close">
            <Icon name="panel" className="flip" />
          </button>
        </div>
        <CommentsContext.Provider value={comments}>
          <ReadOnlyContext.Provider value={state.readOnly}>
            {showGhost && <GhostPanel node={selectedNode} edge={selectedEdge} change={selectedChange} against={againstLabel} />}
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
            {!showGhost && !selectedElement && selectedNode?.kind === "file" && diagram && <FilePanel key={selectedNode.id} node={selectedNode} {...panelProps} />}
            {!showGhost && selection?.type === "edge" && diagram && <EdgePanel key={selection.id} edgeId={selection.id} {...panelProps} />}
            {!selection && flow && (
              <FlowPanel flow={flow} state={state} mutate={mutate} onDeleted={() => open("landscape")} flowStep={flowStep} setFlowStep={setFlowStep} onBacktrack={setBacktrackQ} />
            )}
            {!selection && diagram?.level === "connector" && <ConnectorPanel {...panelProps} />}
            {!selection && diagram?.level === "code" && <CodeDiagramPanel {...panelProps} />}
            {!selection && diagram && !flow && diagram.level !== "connector" && diagram.level !== "code" && (
              <div className="panel-body">
                <div className="panel-kind">
                  {diagram.c4 && `${diagram.c4} · `}
                  {LEVEL_LABEL[diagram.level]} diagram
                </div>
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
                {diagramEditable(state, diagram) && (
                  <label className="field inline">
                    <span>Line shape</span>
                    <select
                      value={diagram.lineShape ?? "rounded"}
                      // The default option clears the setting (the key is removed) instead of storing "rounded".
                      onChange={(e) => void mutate(() => api.layout(diagram.key, { lineShape: e.target.value === "rounded" ? null : (e.target.value as LineShape) }))}
                      data-testid="diagram-line-shape"
                    >
                      <option value="rounded">Rounded right angles (default)</option>
                      <option value="orthogonal">Right angles</option>
                      <option value="straight">Straight</option>
                      <option value="curved">Curved</option>
                      <option value="smooth">Smooth S-curve</option>
                    </select>
                  </label>
                )}
                <p className="muted small">Click an object or connection to see its details here. Press ? or use the help button at the top right.</p>
                {changes && (
                  <>
                    <h3 className="panel-subtitle">Changes compared with {againstLabel}</h3>
                    <ChangeList changes={changes} onPick={(c) => (c.type === "decision" ? openDecision(c.id) : pickChange(c))} />
                  </>
                )}
              </div>
            )}
            {!selection && diagram && !diagram.compare?.removed && (
              <div className="panel-body">
                <DiagramComments state={state} diagram={diagram} onSelect={select} onReveal={reveal} onOpen={open} />
              </div>
            )}
          </ReadOnlyContext.Provider>
        </CommentsContext.Provider>
      </aside>

      {menu && shownMenu.length > 0 && <ContextMenu key={menu.seq} x={menu.x} y={menu.y} items={shownMenu} keyboard={menu.keyboard} onClose={closeMenu} />}
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
      {backtrackQ && <Backtrack state={state} query={backtrackQ} onClose={() => setBacktrackQ(null)} onOpenFile={setOpenFile} onReveal={reveal} />}
      {openFile && <FileEditor path={openFile} onClose={() => setOpenFile(null)} inDraft={!!draftId} onChanged={() => void refresh().catch(() => undefined)} readOnlyNote={codeNote} />}
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
            notify.success(`Applied "${modal.title}" to the main model.`);
            void switchVersion("main", null);
          }}
        />
      )}
      {modal?.type === "draft" && (
        <DraftDialog
          mode={modal.mode}
          draft={modal.mode === "new" ? undefined : state.drafts.find((d) => d.id === modal.draftId)}
          onClose={() => setModal(null)}
          onSubmit={async ({ title, description }) => {
            if (modal.mode === "new") await createDraft(title, description);
            else await updateDraft(modal.draftId, modal.mode === "rename" ? { title } : { description });
          }}
        />
      )}
      {modal?.type === "tag" && <TagGroupEditor group={modal.group} onClose={() => setModal(null)} mutate={mutate} />}
      {modal?.type === "chars" && <CharacteristicsEditor items={state.characteristics} onClose={() => setModal(null)} mutate={mutate} />}
      {modal?.type === "cost" && <CostSettingsEditor settings={state.costSettings} onClose={() => setModal(null)} mutate={mutate} />}
      {modal?.type === "lens" && (
        <LensEditor lens={modal.lens} tagGroups={state.tagGroups} characteristics={state.characteristics} onClose={() => setModal(null)} mutate={mutate} onSaved={(id) => chooseLensAfterSave(id)} />
      )}
      {inspectId && <LiveUiInspector state={state} elementId={inspectId} mutate={mutate} onClose={() => setInspectId(null)} onReveal={reveal} onOpen={open} />}
      <DialogHost />
    </div>
  );
}
