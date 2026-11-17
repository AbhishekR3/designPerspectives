import { ReactFlowProvider } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDismiss } from "./common/useDismiss";
import { useElementSize, useInsetVars } from "./canvas/coveredEdges";
import { COLOUR_KEY, PALETTE_KEY, storage } from "./preferences";
import { draftActions, diagramActions, useElementActions } from "./selectionActions";
import { api } from "./api";
import { ApplyDialog, PlanDialog } from "./drafts/ApplyDialog";
import { ChangeDetails, ChangeList, GhostPanel } from "./drafts/ChangeList";
import { DraftDialog, DraftList, VersionStrip } from "./drafts/DraftList";
import { ImportReview } from "./drafts/ImportReview";
import { BmoSheet } from "./common/BmoSheet";
import { BmoChat, type BmoChatSeed } from "./common/BmoChat";
import { mentionTargets } from "./common/bmoChatText";
import { useBmoChatLog, type BmoRequest } from "./hooks/useBmo";
import { ImportPage } from "./pages/ImportPage";
import { Canvas, type CanvasHandle } from "./canvas/Canvas";
import { CanvasNotes } from "./canvas/CanvasNotes";
import { CommentsContext, DiagramComments, edgeCommentTarget, useComments } from "./common/comments";
import { ChecklistCard } from "./common/Checklist";
import { useChecklist } from "./hooks/useChecklist";
import { ContextMenu, type MenuItem } from "./canvas/ContextMenu";
import { Dock } from "./canvas/OverlayDock";
import { ColourLegend } from "./canvas/ColourLegend";
import { relationshipKinds } from "./lineColours";
import { CharacteristicsEditor, CostSettingsEditor, LensEditor, TagGroupEditor } from "./panels/SettingsDialogs";
import { FlowCard } from "./canvas/FlowPlayer";
import { FlowPanel } from "./panels/FlowPanel";
import { HelpCard } from "./common/HelpCard";
import { Icon } from "./common/icons";
import { UserChip } from "./common/UserChip";
import type { LineShape } from "./canvas/lineShapes";
import { canSpread, diagramEditable, menuItems, spreadLabels, useContextMenu } from "./contextMenus";
import { canMove, MoveDialog } from "./common/MoveDialog";
import { Backtrack } from "./inspect/Backtrack";
import type { BacktrackQuery } from "./api";
import { EmptyStart, emptyHint } from "./common/EmptyState";
import { Palette, paletteItems } from "./canvas/Palette";
import { formatMoney, overlayable } from "./colourOverlays";
import { diagramCost } from "./diagramCost";
import { FileEditor } from "./panels/CodePickers";
import { ReadOnlyContext } from "./panels/formParts";
import { CodeDiagramPanel, ConnectorPanel, EdgePanel, FilePanel, MultiPanel, ObjectPanel, StagePanel } from "./panels";
import { SearchBox } from "./common/SearchBox";
import { Sidebar } from "./common/Sidebar";
import { LEVEL_LABEL, type CommentTarget, type Lens, type Pt, type Selection, type TagGroup } from "./types";
import { useClipboard } from "./hooks/useClipboard";
import { useFlowAutoplay, useFlowPlayer } from "./hooks/useFlowPlayer";
import { inLens, useLens, useLensState } from "./hooks/useLens";
import { useModel } from "./hooks/useModel";
import { useHashSync, useNavigation, usePage, useReveal, useTestingParam } from "./hooks/useNavigation";
import { useTesting } from "./hooks/useTesting";
import { DecisionsPage, needsLook } from "./pages/DecisionsPage";
import { useCatalog } from "./hooks/useCatalog";
import type { HubInfo } from "./types";
import { usePanels } from "./hooks/usePanels";
import { useSelection } from "./hooks/useSelection";
import { useShortcuts } from "./hooks/useShortcuts";
import { confirmDialog, DialogHost, promptDialog } from "./common/dialogs";
import { notify, Toasts } from "./common/notify";
import { NotificationBell, type StandingItem } from "./common/Notifications";
import { plural } from "./common/plural";
import { CallPanel } from "./testing/CallPanel";
import type { FlowTesting } from "./testing/flowTesting";
import { continueCall, pausedTarget } from "./testing/pausedCall";
import { RunLog } from "./testing/RunLog";
import { SetupHelper } from "./testing/SetupHelper";
import { stepForCall, stepLiveness, testingDecor } from "./testing/testingDecor";
import { TestingBlock } from "./testing/TestingBlock";
import { TestingStrip } from "./testing/TestingStrip";
import { TraceView, useObservedTrace, useRecentTraces } from "./testing/TraceView";
import { Watches } from "./testing/Watches";
import { targetsOf, toggleBreakpoints } from "./testing/breakpoints";

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

/** A BMO run being shown (the sheet): what it is for, what it is asked, and what the result can do. */
interface BmoOpen {
  title: string;
  request: BmoRequest;
  /** An explanation of one element: "Use as description" fills its description field. */
  describes?: { id: string };
  /** A challenge of a diagram: "Add as a question" puts it in the comments of that diagram. */
  challenges?: { diagram: string };
  /** Reload the model after the run (a proposed decision was written into the draft). */
  reloads?: boolean;
}

/** The Add palette starts collapsed on a canvas narrower than this (until the person opens it). */
const PALETTE_OPEN_FROM = 720;

export default function App({ onSignOut, hub, project = null, initialReveal = null }: { onSignOut(): void; hub?: HubInfo; project?: string | null; initialReveal?: string | null }) {
  // State. Hook order matters only for effects, which run in this order: first load (useModel),
  // URL/history sync (useHashSync), flow autoplay, keyboard shortcuts.
  const { selection, setSelection, focusName, setFocusName, renameId, setRenameId, clearRename, select, startRename, fresh } = useSelection();
  const lensState = useLensState();
  const { overlay, setOverlay, filters, setFilters } = lensState;
  const { key, setKey, keyRef, open: openKey, pickChange } = useNavigation(setSelection);
  // A page over the diagram (decision records), kept in the URL with the diagram under it.
  const { page, setPage } = usePage(keyRef);
  /** Open a diagram. Asking for the one already open under a page closes the page (another diagram closes it by the effect below). */
  const open = useCallback(
    (k: string) => {
      if (k === keyRef.current) setPage(null, { replace: true });
      openKey(k);
    },
    [keyRef, setPage, openKey],
  );
  const decisionsOpen = page === "decisions" || !!page?.startsWith("decisions/");
  const decisionId = page?.startsWith("decisions/") ? page.slice("decisions/".length) : null;
  const importOpen = page === "import";
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
  const [bmoMenuOpen, setBmoMenuOpen] = useState(false);
  const exportRef = useDismiss<HTMLSpanElement>(exportOpen, () => setExportOpen(false));
  const bmoMenuRef = useDismiss<HTMLSpanElement>(bmoMenuOpen, () => setBmoMenuOpen(false));
  const [bmoSheet, setBmoSheet] = useState<BmoOpen | null>(null);
  // The BMO chat: open or not, what to put in its input when opened from an object, and the conversation (this tab only).
  const [chatOpen, setChatOpen] = useState(false);
  const [chatSeed, setChatSeed] = useState<BmoChatSeed | null>(null);
  const chatLog = useBmoChatLog();
  const [modal, setModal] = useState<ModalState>(null);
  const [openFile, setOpenFile] = useState<string | null>(null);
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
  const [colourful, setColourfulState] = useState(() => storage.get(COLOUR_KEY) !== "off");
  const setColourful = (v: boolean) => {
    storage.set(COLOUR_KEY, v ? "on" : "off");
    setColourfulState(v);
  };
  const relKinds = useMemo(() => relationshipKinds(state?.relationships ?? []), [state?.relationships]);
  const cw = !wrapSize ? "md" : wrapSize.w < 560 ? "xs" : wrapSize.w < 800 ? "sm" : wrapSize.w < 1100 ? "md" : "lg";

  // A box waiting to be renamed that is not on this diagram must not pop open later on another one.
  useEffect(() => {
    if (renameId && diagram && !diagram.nodes.some((n) => n.id === renameId)) clearRename();
  }, [renameId, diagram, clearRename]);

  useHashSync({ key, keyRef, setKey, versionRef, loadDiagram, switchVersion, setSelection, setMenu, setFlowStep, setPlaying });
  const flow = useFlowAutoplay(diagram, player);
  const revealOnDiagram = useReveal(state, diagram, setKey, setSelection);
  /** Show an element on its diagram; a page over the diagram closes, or the element would be selected unseen. */
  const reveal = useCallback(
    (id: string, opts: { home?: boolean } = {}) => {
      setPage(null, { replace: true });
      revealOnDiagram(id, opts);
    },
    [revealOnDiagram, setPage],
  );

  // System testing mode (`t=1`): only on the main model without a comparison; the model cannot be edited while it is on.
  const { testing: testingParam, setTesting } = useTestingParam(keyRef);
  const canTestHere = version.model === "main" && !version.compare;
  const testingOn = testingParam && canTestHere;
  useEffect(() => {
    if (testingParam && !canTestHere) setTesting(false, { replace: true });
  }, [testingParam, canTestHere, setTesting]);
  const tx = useTesting(testingOn, !!state?.can.test);
  const [traceId, setTraceId] = useState<string | null>(null);
  const traceData = useObservedTrace(testingOn ? traceId : null);
  const recentTraces = useRecentTraces(testingOn);
  const [pointsOpen, setPointsOpen] = useState(false);
  useEffect(() => {
    if (!testingOn) {
      setTraceId(null);
      setPointsOpen(false);
    }
  }, [testingOn]);
  // While testing, everything that edits the model is off: the screen sees the model as read-only.
  const viewState = useMemo(() => (testingOn && state ? { ...state, readOnly: true } : state), [testingOn, state]);
  const decor = useMemo(() => (testingOn && state && diagram ? testingDecor(diagram, state, tx.state, traceData.trace) : null), [testingOn, state, diagram, tx.state, traceData.trace]);
  // The flow follows the call that gets paused: its step is shown, as if the flow were played to there. No autoplay in this mode.
  const heldSeen = useRef<string[]>([]);
  useEffect(() => {
    const keys = (tx.state?.held ?? []).map((id) => `${id}:${tx.state?.calls.find((c) => c.id === id)?.state}`);
    const fresh = keys.filter((k) => !heldSeen.current.includes(k));
    heldSeen.current = keys;
    if (!testingOn || !flow || !tx.state || fresh.length === 0) return;
    const call = tx.state.calls.find((c) => c.id === fresh[0].split(":")[0]);
    const at = call ? stepForCall(flow, call, flowStep) : null;
    if (at !== null) setFlowStep(at);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new paused call moves the flow
  }, [tx.state]);
  useEffect(() => {
    if (testingOn && playing) setPlaying(false);
  }, [testingOn, playing, setPlaying]);
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
  /** Open the import page (closes the decisions page; the selection goes). */
  const openImport = () => {
    setSelection(null);
    setPage("import", { replace: decisionsOpen });
  };
  /** From the import page or a BMO result: open an import draft with its changes shown. */
  const openImportDraft = async (id: string) => {
    setPage(null, { replace: true });
    await switchVersion(`draft:${id}`, "base");
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
  // A copy just made, waiting for the model to reload so it can be shown where it is (it may be on another diagram than this one).
  const [pasted, setPasted] = useState<string | null>(null);
  const clip = useClipboard({ keyRef, mutate, onPasted: setPasted });
  const { pasteFrom } = clip;
  const comments = useComments(state);
  // The checklist card and the BMO chat take the same place: opening one closes the other.
  const checklist = useChecklist(state);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const openChecklist = () => {
    setChatOpen(false);
    setPage(null, { replace: true });
    setChecklistOpen(true);
  };
  const openChat = () => {
    setChecklistOpen(false);
    setChatOpen(true);
  };
  /** Show an object's discussion: select it and open the details panel (with `compose`, a new comment box too). */
  const showComments = (target: CommentTarget, selectAs: Selection, compose: boolean) => {
    setFocusName(false);
    select(selectAs);
    if (!rightOpen) toggleRight();
    if (compose) comments.askFor(target);
  };
  /** A note being written on a diagram (right-click, "Add note here…"); it belongs to that diagram only. */
  const [noteDraft, setNoteDraft] = useState<{ key: string; at: Pt } | null>(null);
  /** A click on a note on the canvas: show its thread in the discussion list of the details panel. */
  const openNote = (threadId: string) => {
    setFocusName(false);
    select(null);
    if (!rightOpen) toggleRight();
    window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-testid="thread-${threadId}"]`);
      el?.scrollIntoView({ block: "nearest" });
      el?.classList.add("flash");
      window.setTimeout(() => el?.classList.remove("flash"), 1600);
    }, 150);
  };
  const { deleteRelationship, nodeActions, renameElement } = useElementActions({ state, mutate, pasteFrom, open, setSelection, setRenameId, fresh });

  useEffect(() => {
    if (!pasted || !state || !diagram) return;
    if (!state.elements.some((e) => e.id === pasted)) return;
    setPasted(null);
    reveal(pasted);
  }, [pasted, state, diagram, reveal]);
  // What is selected can go away without a click here (undo, redo, a change by someone else): then nothing is selected,
  // not a panel with no content. Checked against the diagram on screen and the model, once both are loaded.
  useEffect(() => {
    if (!selection || !state || !diagram || diagram.key !== key || loading) return;
    const known = (id: string) =>
      diagram.nodes.some((n) => n.id === id) || diagram.edges.some((e) => e.id === id) || state.elements.some((e) => e.id === id) || state.relationships.some((r) => r.id === id);
    if (selection.type === "nodes") {
      const left = selection.ids.filter(known);
      if (left.length !== selection.ids.length) setSelection(left.length > 1 ? { type: "nodes", ids: left } : left.length === 1 ? { type: "node", id: left[0] } : null);
    } else if (!known(selection.id)) setSelection(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setSelection is stable; `selection` itself is checked when the model or the diagram changes
  }, [state, diagram, key, loading]);
  // The tab title names the project and the diagram, so tabs and the Back list can be told apart.
  useEffect(() => {
    if (!state) return;
    const name = page === "import" ? "Import code" : page?.startsWith("decisions") ? "Decisions" : (state.diagrams.find((d) => d.key === key)?.title ?? null);
    document.title = [name, state.workspace.name, "designPerspectives"].filter(Boolean).join(" · ");
  }, [state, key, page]);

  // After a move: show the moved box, selected, where it now is (its new parent's diagram).
  useEffect(() => {
    if (!movedTo || !state) return;
    if (state.elements.find((e) => e.id === movedTo.id)?.parentId === movedTo.parentId) {
      setMovedTo(null);
      reveal(movedTo.id, { home: true });
    }
  }, [movedTo, state, reveal]);
  useShortcuts({
    state: viewState,
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
    toggleChecklist: () => (checklistOpen ? setChecklistOpen(false) : openChecklist()),
    canvasRef,
    openMenu,
    testing: {
      on: testingOn,
      continueCall: () => {
        const c = pausedTarget(tx.state, tx.selectedCall);
        if (c) void continueCall(c, tx.actions);
      },
      step: () => {
        const c = pausedTarget(tx.state, tx.selectedCall);
        if (c) void continueCall(c, tx.actions, true);
      },
      toggleBreakpoint: () => {
        if (tx.state && state) void toggleBreakpoints(tx.state, targetsOf(selection, diagram, state), tx.actions);
      },
    },
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
  const canEditHere = diagramEditable(state, diagram) && !testingOn;
  const canDeleteHere = !!nodeActions && canEditHere;
  /** The panels see a read-only model while testing. */
  const panelState = viewState!;
  const canTest = state.can.test;
  const testingUsable = testingOn && canTest && !tx.denied && !!tx.state?.available;
  const callSel = testingUsable ? tx.state!.calls.find((c) => c.id === tx.selectedCall) : undefined;
  /** What the testing mode adds to the steps of the flow on screen. */
  const flowTesting: FlowTesting | undefined =
    testingUsable && flow
      ? {
          liveness: (step) => stepLiveness(state, tx.state, traceData.trace, step),
          hasBreakpoint: (step) => tx.state!.breakpoints.some((b) => b.on.type === "step" && b.on.flow === flow.key && b.on.order === step.order),
          toggleBreakpoint: (step) => step.order && void toggleBreakpoints(tx.state!, [{ type: "step", flow: flow.key, order: step.order }], tx.actions),
        }
      : undefined;
  /** Open the BMO chat with "[Name]" of an element or relationship in its input (remembered by ID). */
  const askAbout = (t: { element?: string; relationship?: string }) => {
    const id = t.element ?? t.relationship;
    const target = id ? mentionTargets(state.elements, state.relationships).find((x) => x.id === id) : undefined;
    if (target) setChatSeed((s) => ({ text: `[${target.name}] `, picks: [{ token: target.name, id: target.id }], n: (s?.n ?? 0) + 1 }));
    openChat();
  };
  /** Show an object the chat refers to: an element (on its diagram), or a relationship (its line here, else its source). */
  const revealRef = (id: string) => {
    if (state.elements.some((e) => e.id === id)) reveal(id);
    else {
      const edge = diagram?.edges.find((e) => e.relationshipIds.includes(id));
      const rel = state.relationships.find((r) => r.id === id);
      if (edge) setSelection({ type: "edge", id: edge.id });
      else if (rel) reveal(rel.sourceId);
    }
    if (!rightOpen) toggleRight();
  };

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
        ...(checklist.can
          ? {
              addToChecklist: (target: CommentTarget, selectAs: Selection) => {
                select(selectAs);
                checklist.askFor(target);
                openChecklist();
              },
            }
          : {}),
        placeNote: (at) => key && setNoteDraft({ key, at }),
        askBmo: askAbout,
      })
    : [];

  const selectedNode = selection?.type === "node" ? diagram?.nodes.find((n) => n.id === selection.id) : undefined;
  const selectedEdge = selection?.type === "edge" ? diagram?.edges.find((e) => e.id === selection.id) : undefined;
  const selectedChange = selection && selection.type !== "nodes" ? changeOf(selection.id) : undefined;
  const showGhost = !!(selectedNode?.ghost || selectedEdge?.ghost || (selection && diagram?.compare?.removed));
  const selectedElement = selection?.type === "node" ? state.elements.find((e) => e.id === selection.id) : undefined;
  /** What the checklist treats as "the selection": the selected box (an element) or line (its relationship). */
  const checklistSelected: CommentTarget | null = selectedElement ? { type: "element", id: selectedElement.id } : selectedEdge ? edgeCommentTarget(selectedEdge) : null;
  const panelProps = {
    state: panelState,
    diagram: diagram!,
    lens,
    mutate,
    onSelect: select,
    onOpen: open,
    onReveal: reveal,
    onOpenFile: setOpenFile,
    onBacktrack: setBacktrackQ,
    onOpenDecision: (id: string) => openDecision(id),
    onExplain: (t: { element?: string; relationship?: string }, name: string) =>
      setBmoSheet({ title: `Explain: ${name}`, request: { task: "explain", ...t, lens: lens.id }, ...(t.element ? { describes: { id: t.element } } : {}) }),
    onAsk: askAbout,
    catalog,
    focusName,
    onRename: renameElement,
    onMove: setMoveId,
    onDuplicate: (id: string) => void pasteFrom(id),
  };
  /** A review item picked: show its object, or the diagram a connection is on. */
  const pickReviewItem = (itemKey: string, item: { kind: string }) => {
    const id = itemKey.slice(itemKey.indexOf(":") + 1);
    if (item.kind === "object") reveal(id);
    else if (item.kind === "relationship") {
      const c = changes?.relationships.find((x) => x.id === id);
      if (c?.homeKey) pickChange(c);
      else {
        const r = state.relationships.find((x) => x.id === id);
        if (r) reveal(r.sourceId);
      }
    } else if (item.kind === "decision") {
      // The item names the decision by its file name without the number and `.md` (see review.ts).
      const d = state.decisions.find((x) => x.file.replace(/^\d+-/, "").replace(/\.md$/, "") === id);
      openDecision(d ? d.id : null);
    } else if (item.kind === "flow") {
      const f = state.flows.find((x) => x.key === id || x.key === `flow-${id}` || x.title === id);
      if (f) open(f.key);
      else notify.info("This flow is not in the draft any more.");
    }
  };
  /** The review of an import draft stays visible whatever is selected: in the diagram's own panel when nothing is, above the object's details otherwise. */
  const reviewInDefault = !selection && !!diagram && !flow && diagram.level !== "connector" && diagram.level !== "code";
  const reviewBlock = draftId ? (
    <ImportReview
      key={draftId}
      draftId={draftId}
      canEdit={state.can.editThis}
      version={state.version}
      onPick={pickReviewItem}
      onChanged={() =>
        refresh().then(
          () => undefined,
          () => undefined,
        )
      }
    />
  ) : null;
  const decisionsToLook = state.decisions.filter(needsLook).length;
  const bmoWaiting = checklist.data?.summary.fromBmo ?? 0;
  // What holds now, for the bell: a model that did not load cleanly, drafts behind the main model, decisions that wait.
  const standing: StandingItem[] = [
    ...state.loadErrors.map((text, i) => ({ id: `load-${i}`, tone: "warn" as const, text })),
    ...state.drafts
      .filter((d) => d.behind > 0)
      .map((d) => ({
        id: `draft-${d.id}`,
        tone: "warn" as const,
        text: `The draft "${d.title}" is ${plural(d.behind, "change")} behind the main model.`,
        onOpen: () => void switchVersion(`draft:${d.id}`, "base"),
      })),
    ...(decisionsToLook
      ? [{ id: "decisions", tone: "info" as const, text: `${plural(decisionsToLook, "decision")} ${decisionsToLook === 1 ? "needs" : "need"} a look.`, onOpen: () => openDecision(null) }]
      : []),
    ...(bmoWaiting
      ? [{ id: "checklist-bmo", tone: "info" as const, text: `${plural(bmoWaiting, "question")} from BMO ${bmoWaiting === 1 ? "waits" : "wait"} for an answer.`, onOpen: openChecklist }]
      : []),
  ];
  const multiIds = selection?.type === "nodes" ? selection.ids : null;
  const movingEl = moveId ? state.elements.find((e) => e.id === moveId) : undefined;

  const cost = diagram ? diagramCost(diagram, state.elements) : null;
  const tools = (
    <div className="float bar tools" data-testid="bar-tools">
      {state.me && (
        <>
          <UserChip me={state.me} role={state.can.createDraft ? state.me.role : "viewer"} onSignOut={onSignOut} />
          <span className="divider" />
        </>
      )}
      {canEditHere && (
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
      {canSpread(state, diagram) && !testingOn && (
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
      <button
        className={`ghost testing-btn${testingOn ? " on" : ""}`}
        onClick={() => setTesting(!testingOn)}
        disabled={!canTestHere && !testingOn}
        aria-pressed={testingOn}
        title={canTestHere ? "System testing: watch real calls between services and pause them at a breakpoint" : "System testing works on the main model, without a comparison"}
        data-testid="testing-toggle"
      >
        Test
      </button>
      <span className="export-wrap" ref={bmoMenuRef} onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setBmoMenuOpen(false)}>
        <button
          className={`ghost bmo-btn${bmoMenuOpen ? " on" : ""}`}
          onClick={() => setBmoMenuOpen(!bmoMenuOpen)}
          aria-haspopup="menu"
          aria-expanded={bmoMenuOpen}
          title="Ask BMO: explain or challenge this diagram, or ask a question"
          data-testid="bmo-menu"
          disabled={!diagram}
        >
          BMO
        </button>
        {bmoMenuOpen && diagram && (
          <div className="pop-menu right" role="menu">
            <button
              role="menuitem"
              data-testid="bmo-explain"
              onClick={() => {
                setBmoMenuOpen(false);
                setBmoSheet({ title: `Explain: ${diagram.title}`, request: { task: "explain", diagram: diagram.key, lens: lens.id } });
              }}
            >
              Explain this diagram
            </button>
            <button
              role="menuitem"
              data-testid="bmo-challenge"
              onClick={() => {
                setBmoMenuOpen(false);
                setBmoSheet({ title: `Challenge: ${diagram.title}`, request: { task: "challenge", diagram: diagram.key }, challenges: { diagram: diagram.key } });
              }}
            >
              Challenge this diagram
            </button>
            <button
              role="menuitem"
              data-testid="bmo-ask"
              onClick={() => {
                setBmoMenuOpen(false);
                openChat();
              }}
            >
              Ask BMO…
            </button>
            {draftId && state.can.editThis && (
              <button
                role="menuitem"
                data-testid="draft-propose-decision"
                title="BMO proposes a decision record from this draft's changes; it is written into the draft as proposed"
                onClick={() => {
                  setBmoMenuOpen(false);
                  setBmoSheet({ title: "Propose a decision", request: { task: "decision-from-draft" }, reloads: true });
                }}
              >
                Propose decision
              </button>
            )}
          </div>
        )}
      </span>
      <span className="export-wrap" ref={exportRef} onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setExportOpen(false)}>
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
          state={panelState}
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
            onCompareWith={(against) => switchVersion(version.model, against)}
            onApply={() => draftId && setModal({ type: "apply", draftId, title: state.model.title.replace(/^Draft: /, "") })}
            onPlan={() => draftId && setModal({ type: "plan", draftId })}
            onDiscard={() => void discardDraft()}
            onStopCompare={() => switchVersion(version.model, null)}
            onExit={() => switchVersion("main", null)}
          />
        )}
        {testingOn && (
          <TestingStrip
            testing={tx.state}
            denied={tx.denied}
            canTest={canTest}
            selectedCall={tx.selectedCall}
            actions={tx.actions}
            traces={recentTraces.list}
            traceId={traceId}
            onPickTrace={setTraceId}
            onRefreshTraces={recentTraces.refresh}
            onOpenPoints={() => setPointsOpen(true)}
            onExit={() => setTesting(false)}
          />
        )}
        <div className={`canvas-wrap${loading ? " loading-diagram" : ""}`} ref={setWrapEl} data-cw={cw} aria-busy={loading || undefined} data-testid="canvas-wrap">
          {loading && <div className="load-bar" role="progressbar" aria-label="Loading" data-testid="loading-bar" />}
          {diagram && (
            <ReactFlowProvider key={diagram.key}>
              <Canvas
                diagram={diagram}
                colourful={colourful}
                relKinds={relKinds}
                lens={lens}
                decorate={decorate}
                actions={testingOn ? null : nodeActions}
                archTypes={state.enums.archTypes}
                renameId={renameId}
                onRenameStarted={clearRename}
                onDropItem={(item, at) => addItem(item, at)}
                onConnectToEmpty={connectToEmpty}
                flowStep={flowStep}
                showChanges={activeOverlay?.kind === "changes"}
                selection={selection}
                onSelect={(sel) => {
                  if (testingOn) tx.setSelectedCall(null);
                  select(sel);
                }}
                onDrill={open}
                onConnect={connect}
                onPositions={savePositions}
                onLayout={(patch, auto) => key && !state.readOnly && !testingOn && mutate(() => api.layout(key, patch, auto))}
                onOpenFile={setOpenFile}
                onContextMenu={testingOn ? () => undefined : openMenu}
                handleRef={canvasRef}
                commentCounts={comments.counts}
                testing={decor}
                onComments={(t) => showComments(t, { type: "node", id: t.id }, false)}
                readOnly={state.readOnly || testingOn}
                version={`${version.model}|${version.compare ?? ""}`}
              >
                <CanvasNotes
                  diagramKey={diagram.key}
                  comments={comments}
                  draft={noteDraft && noteDraft.key === diagram.key ? noteDraft : null}
                  onDraftDone={() => setNoteDraft(null)}
                  onOpen={openNote}
                />
              </Canvas>
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
                  {state.can.import && (
                    <button
                      className={`ghost diagrams-btn decisions-btn${importOpen ? " on" : ""}`}
                      onClick={() => (importOpen ? setPage(null) : openImport())}
                      title="Import code: scan a codebase and bring it into the model as a draft"
                      aria-label="Import code"
                      aria-pressed={importOpen}
                      data-testid="open-import"
                    >
                      <Icon name="code" size={14} /> <span className="diagrams-label">Import code</span>
                    </button>
                  )}
                  <button
                    className={`ghost diagrams-btn decisions-btn checklist-btn${checklistOpen ? " on" : ""}`}
                    onClick={() => (checklistOpen ? setChecklistOpen(false) : openChecklist())}
                    title={`Checklist (L): ${checklist.open} open`}
                    aria-label="Checklist"
                    aria-pressed={checklistOpen}
                    data-testid="checklist-open"
                  >
                    <Icon name="checklist" size={14} /> <span className="diagrams-label">Checklist</span>
                    {checklist.open > 0 && <span className="comments-count">{checklist.open > 99 ? "99+" : checklist.open}</span>}
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
                  <NotificationBell standing={standing} />
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
            </div>
            <div className="topbar-sub">
              <div className="topbar-left">
                {diagram && !inLens(lens, diagram.level) && <div className="float note small">This level is not in the {lens.name} lens.</div>}
                <FlowCard
                  state={panelState}
                  diagram={diagram}
                  flow={flow}
                  flowStep={flowStep}
                  setFlowStep={setFlowStep}
                  playing={playing}
                  setPlaying={setPlaying}
                  onOpen={open}
                  onNewFlow={newFlow}
                  testing={flowTesting}
                />
              </div>
              {tools}
            </div>
          </div>
          {helpOpen && <HelpCard onClose={() => setHelpOpen(false)} />}
          {checklistOpen && <ChecklistCard state={state} api={checklist} selected={checklistSelected} onReveal={revealRef} onOpenDiagram={open} onClose={() => setChecklistOpen(false)} />}
          {chatOpen && <BmoChat state={state} diagram={diagram} lens={lens} log={chatLog} seed={chatSeed} onReveal={revealRef} onClose={() => setChatOpen(false)} />}

          <div className="left-stack">
            {diagram && !state.readOnly && !testingOn && !diagram.compare?.removed && diagram.level !== "flow" && diagram.level !== "code" && (
              <Palette diagram={diagram} open={paletteOpen} onToggle={togglePalette} onAdd={(it) => addItem(it)} />
            )}
            {diagram && diagram.level !== "code" && diagram.level !== "connector" && (
              <Dock
                state={panelState}
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
            {diagram && diagram.level !== "code" && diagram.level !== "flow" && <ColourLegend diagram={diagram} relKinds={relKinds} on={colourful} setOn={setColourful} />}
          </div>

          {/* Messages are a layer of their own, above the pages and dialogs: inside the top bar a page would cover them. */}
          <div className="toast-layer">
            <Toasts>
              {serverReadOnly && (
                <div className="float toast info" data-testid="readonly-banner">
                  Viewer role: this server is read-only. Changes are refused.
                </div>
              )}
            </Toasts>
          </div>

          {importOpen && (
            <ImportPage state={panelState} refresh={refresh} onClose={() => setPage(null)} onOpenDraft={(id) => void openImportDraft(id)} checklist={checklist} onOpenChecklist={openChecklist} />
          )}
          {decisionsOpen && <DecisionsPage state={panelState} selected={decisionId} onSelect={(id) => openDecision(id)} onClose={() => setPage(null)} onReveal={revealFromPage} mutate={mutate} />}
          {diagram && diagram.nodes.length === 0 && (
            <div className="free-area">
              {diagram.level === "landscape" && !state.readOnly && !testingOn && !diagram.compare?.removed ? (
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
          <ReadOnlyContext.Provider value={state.readOnly || testingOn}>
            {testingUsable && tx.state && callSel && (
              <CallPanel
                key={callSel.id}
                state={state}
                call={callSel}
                detail={tx.detail?.id === callSel.id ? tx.detail : null}
                actions={tx.actions}
                mutate={mutate}
                onReveal={revealRef}
                onShowTrace={setTraceId}
                onClose={() => tx.setSelectedCall(null)}
              />
            )}
            {testingUsable && tx.state && !callSel && diagram && !showGhost && selection && selection.type !== "nodes" && (
              <TestingBlock state={state} diagram={diagram} selection={selection} testing={tx.state} actions={tx.actions} mutate={mutate} />
            )}
            {testingUsable && tx.state && !selection && (
              <div className="panel-body" data-testid="testing-panel">
                {!callSel && (
                  <>
                    <RunLog
                      state={state}
                      testing={tx.state}
                      selectedCall={tx.selectedCall}
                      actions={tx.actions}
                      onSelect={(c) => {
                        tx.setSelectedCall(c.id);
                        revealRef(c.relationshipId);
                      }}
                    />
                    <Watches testing={tx.state} actions={tx.actions} />
                  </>
                )}
                {traceId && <TraceView traceId={traceId} data={traceData} state={state} onReveal={reveal} />}
              </div>
            )}
            {testingOn && !testingUsable && !selection && traceId && (
              <div className="panel-body">
                <TraceView traceId={traceId} data={traceData} state={state} onReveal={reveal} />
              </div>
            )}
            {showGhost && <GhostPanel node={selectedNode} edge={selectedEdge} change={selectedChange} against={againstLabel} />}
            {multiIds && diagram && (
              <MultiPanel
                state={state}
                lens={lens}
                ids={multiIds}
                canEdit={canEditHere}
                mutate={mutate}
                canDelete={canDeleteHere}
                onDelete={() => nodeActions?.removeMany(multiIds.filter((id) => state.elements.some((x) => x.id === id) && !diagram.nodes.find((n) => n.id === id)?.ghost))}
              />
            )}
            {!reviewInDefault && reviewBlock && (
              <div className="panel-body review-above" data-testid="review-above">
                {reviewBlock}
              </div>
            )}
            {!showGhost && selectedChange && selectedChange.change !== "added" && <ChangeDetails change={selectedChange} against={againstLabel} />}
            {!showGhost && selectedElement && diagram && <ObjectPanel key={selectedElement.id} element={selectedElement} {...panelProps} />}
            {!showGhost && !selectedElement && selectedNode?.kind === "stage" && diagram && <StagePanel key={selectedNode.id} node={selectedNode} {...panelProps} />}
            {!showGhost && !selectedElement && selectedNode?.kind === "file" && diagram && <FilePanel key={selectedNode.id} node={selectedNode} {...panelProps} />}
            {!showGhost && selection?.type === "edge" && diagram && <EdgePanel key={selection.id} edgeId={selection.id} {...panelProps} />}
            {!selection && flow && (
              <FlowPanel
                flow={flow}
                state={panelState}
                mutate={mutate}
                onDeleted={() => open("landscape")}
                flowStep={flowStep}
                setFlowStep={setFlowStep}
                onBacktrack={setBacktrackQ}
                onOpenDiagram={open}
                testing={flowTesting}
              />
            )}
            {!selection && diagram?.level === "connector" && <ConnectorPanel {...panelProps} />}
            {!selection && diagram?.level === "code" && <CodeDiagramPanel {...panelProps} />}
            {!selection && diagram && !flow && !testingOn && diagram.level !== "connector" && diagram.level !== "code" && (
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
                  {cost && cost.total > 0 && (
                    <>
                      <dt>Monthly cost</dt>
                      <dd>{formatMoney(cost.total, state.costSettings.currency)}</dd>
                    </>
                  )}
                  {cost && cost.outside > 0 && (
                    <>
                      <dt>{cost.outsideLabel}</dt>
                      <dd>{formatMoney(cost.outside, state.costSettings.currency)}</dd>
                    </>
                  )}
                </dl>
                {canEditHere && (
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
                {reviewBlock}
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
      {testingUsable && pointsOpen && tx.state && <SetupHelper state={state} testing={tx.state} actions={tx.actions} onReveal={revealRef} onClose={() => setPointsOpen(false)} />}
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
          branch={state.drafts.find((d) => d.id === modal.draftId)?.branch || undefined}
          onClose={() => setModal(null)}
          onApplied={(r, accepted) => {
            setModal(null);
            if (r.kept) {
              // An import draft with items that are not accepted stays open, with only those items left in it.
              notify.success(
                `Applied ${accepted === null ? "the accepted items" : `${accepted} accepted item${accepted === 1 ? "" : "s"}`} of "${modal.title}" to the main model. ${r.held} item${r.held === 1 ? " stays" : "s stay"} in the draft.`,
              );
              void refresh().catch(() => undefined);
              return;
            }
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
        <LensEditor
          lens={modal.lens}
          tagGroups={state.tagGroups}
          characteristics={state.characteristics}
          onClose={() => setModal(null)}
          mutate={mutate}
          onSaved={(id) => {
            // Deleting a lens that is not the one in use changes nothing on screen (the editor names "engineer" as the lens to fall back to).
            const deletedOther = modal.lens && id !== modal.lens.id && modal.lens.id !== lens.id;
            if (!deletedOther) chooseLensAfterSave(id);
          }}
        />
      )}
      {bmoSheet && (
        <BmoSheet
          title={bmoSheet.title}
          request={bmoSheet.request}
          onClose={() => setBmoSheet(null)}
          onOpenDecisions={() => openDecision(null)}
          onDone={() => bmoSheet.reloads && void refresh().catch(() => undefined)}
          textActions={(text, close) => (
            <>
              {bmoSheet.challenges && comments.can && (
                <button
                  onClick={async () => {
                    const at = bmoSheet.challenges!.diagram;
                    const ok = await comments.add("question", { type: "diagram", id: at }, at, `BMO's challenge:\n${text}`.slice(0, 3900), comments.me ?? "");
                    if (ok) {
                      notify.success("Added as a question on this diagram.");
                      close();
                    }
                  }}
                  data-testid="bmo-add-question"
                >
                  Add as a question
                </button>
              )}
              {bmoSheet.describes && state.can.editThis && (
                <button
                  onClick={async () => {
                    const id = bmoSheet.describes!.id;
                    if (await mutate(() => api.updateElement(id, { description: text.slice(0, 2000) }))) close();
                  }}
                  data-testid="bmo-use-description"
                >
                  Use as description
                </button>
              )}
            </>
          )}
        />
      )}
      <DialogHost />
    </div>
  );
}
