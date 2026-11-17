import { useCallback, useMemo, type Dispatch, type RefObject, type SetStateAction } from "react";
import { api } from "./api";
import type { CanvasHandle } from "./canvas/Canvas";
import type { NodeActions } from "./canvas/BoxesAndLines";
import { connectPlan } from "./canvas/connectRequired";
import type { MenuItem } from "./canvas/ContextMenu";
import { iconFor } from "./common/icons";
import { defaultSize } from "./canvas/layout";
import type { PaletteItem } from "./canvas/Palette";
import type { AppState, Diagram, Pt, Selection } from "./types";
import { confirmDeleteElement, confirmDeleteRelationship, confirmDialog, promptDialog } from "./common/dialogs";
import { notify, run } from "./common/notify";

type Mutate = (fn: () => Promise<unknown>) => Promise<boolean>;

/**
 * Deleting a relationship, renaming and deleting boxes, and the quick bar on a selected box (none when
 * the server is read-only). `fresh` holds the boxes added in this session that have not been renamed yet.
 */
export function useElementActions(p: {
  state: AppState | null;
  mutate: Mutate;
  pasteFrom(id: string, at?: Pt): Promise<void>;
  open(k: string): void;
  setSelection: Dispatch<SetStateAction<Selection>>;
  setRenameId: Dispatch<SetStateAction<string | null>>;
  fresh: RefObject<Set<string>>;
}) {
  const { state, mutate, pasteFrom, open, setSelection, setRenameId, fresh } = p;
  const deleteRelationship = useCallback(
    (relId: string) => {
      void confirmDeleteRelationship().then((yes) => yes && mutate(() => api.deleteRelationship(relId)).then((ok) => ok && setSelection(null)));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setSelection is stable (a state setter or ref), so it is safe to leave out of the dependencies
    [mutate],
  );

  /**
   * Rename an element. The first rename of a box added in this session also gives it a readable ID (the
   * server makes it from the new name); the selection then follows the box to its new ID.
   */
  const renameElement = useCallback(
    async (id: string, name: string): Promise<boolean> => {
      const reslug = fresh.current.has(id);
      let newId = id;
      const ok = await mutate(async () => {
        newId = (await api.updateElement(id, reslug ? { name, reslug: true } : { name })).id ?? id;
      });
      if (!ok) return false;
      fresh.current.delete(id);
      if (newId !== id) {
        setSelection((cur) => (cur?.type === "node" && cur.id === id ? { type: "node", id: newId } : cur?.type === "nodes" ? { type: "nodes", ids: cur.ids.map((x) => (x === id ? newId : x)) } : cur));
        setRenameId((cur) => (cur === id ? newId : cur));
      }
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setSelection, setRenameId, fresh are stable (state setters or refs), so it is safe to leave out of the dependencies
    [mutate],
  );

  /** Delete several boxes after one question; one undo step restores them all. */
  const deleteMany = useCallback(
    (ids: string[]) => {
      const els = ids.map((id) => state?.elements.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x);
      if (els.length === 0) return;
      const inside = els.some((e) => e.childCount > 0);
      void confirmDialog({
        title: els.length === 1 ? `Delete "${els[0].name}"?` : `Delete ${els.length} objects?`,
        message: inside ? "Their connections and everything inside them are deleted too." : "Their connections are deleted too.",
        confirmLabel: "Delete",
        danger: true,
      }).then((yes) => yes && mutate(() => api.deleteElements(els.map((e) => e.id))).then((ok) => ok && setSelection(null)));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setSelection is stable (a state setter or ref), so it is safe to leave out of the dependencies
    [state, mutate],
  );

  const nodeActions = useMemo<NodeActions | null>(
    () =>
      state?.readOnly
        ? null
        : {
            rename: (id, name) => void renameElement(id, name),
            keepId: (id) => void fresh.current.delete(id),
            setArchType: (id, archType) => void mutate(() => api.updateElement(id, { archType })),
            duplicate: (id) => void pasteFrom(id),
            remove: (id) => {
              const el = state?.elements.find((x) => x.id === id);
              if (el) void confirmDeleteElement(el, { connections: true }).then((yes) => yes && mutate(() => api.deleteElement(id)).then((ok) => ok && setSelection(null)));
            },
            removeMany: deleteMany,
            open: (k) => open(k),
          },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setSelection, fresh are stable (state setters or refs), so it is safe to leave out of the dependencies
    [state, mutate, pasteFrom, open, renameElement, deleteMany],
  );

  return { deleteRelationship, nodeActions, renameElement };
}

/**
 * Adding a box is ignored while another add is still in flight, so a double click on a palette item
 * adds one box, not two. (Only adds are guarded: other edits, such as rapid arrow-key nudges, queue normally.)
 */
let adding = false;
function onceAtATime<A extends unknown[], R>(fn: (...args: A) => Promise<R>): (...args: A) => Promise<R | null> {
  return async (...args) => {
    if (adding) return null;
    adding = true;
    try {
      return await fn(...args);
    } finally {
      adding = false;
    }
  };
}

const KIND_CHOICE: Record<string, string> = { container: "Container", component: "Component", softwareSystem: "Software system", person: "Person" };

/** Edits started on the canvas or from the palette: add, connect, move; and adding a flow. */
export function diagramActions(c: {
  state: AppState;
  diagram: Diagram | null;
  key: string | null;
  mutate: Mutate;
  open(k: string): void;
  canvasRef: RefObject<CanvasHandle | null>;
  startRename(id: string): void;
  selection: Selection;
  setSelection: Dispatch<SetStateAction<Selection>>;
  setFocusName: (on: boolean) => void;
  /** Show a pop menu of choices at a screen point. */
  openChoiceMenu(at: Pt, items: MenuItem[]): void;
}) {
  const { state, diagram, key, mutate, open, canvasRef, startRename, selection, setSelection, setFocusName, openChoiceMenu } = c;

  const newFlow = async () => {
    // The dialog only confirms a non-empty, trimmed name; trimming again keeps this true on its own.
    const title = (await promptDialog({ title: "Name of the new flow", confirmLabel: "Create" }))?.trim();
    if (!title) return;
    let k = "";
    if (await mutate(async () => (k = (await api.createFlow({ title })).key))) open(k);
  };

  /** The parent a new box of this kind gets on this diagram. */
  const parentFor = (kind: string, d: Diagram) => ((kind === "container" && d.level === "container") || (kind === "component" && d.level === "component") ? d.scope : null);

  /**
   * Add an object from the palette: at `at` (dropped there) or in the nearest free spot. A person or
   * software system on a context, container or component diagram is created connected to a box
   * (see connectRequired.ts), or not at all when it is not clear which one.
   */
  const addItem = onceAtATime(async (item: PaletteItem, at?: Pt) => {
    if (!diagram || !key) return;
    if (item.kind === "stage") {
      const rel = state.relationships.find((r) => r.id === diagram.scope);
      const name = (await promptDialog({ title: "Name of the new stage", label: "A step inside this connector", confirmLabel: "Add" }))?.trim();
      if (rel && name) await mutate(() => api.updateRelationship(rel.id, { stages: [...rel.stages, { id: "", name }] }));
      return;
    }
    const decision = connectPlan(diagram, item.kind, selection);
    if ("problem" in decision) {
      notify.info(decision.problem);
      return null;
    }
    const position = at ?? canvasRef.current?.freeSpot(defaultSize(item.kind)) ?? { x: 0, y: 0 };
    let newId = "";
    const ok = await mutate(async () => {
      newId = (
        await api.createElement({
          kind: item.kind,
          name: item.name,
          archType: item.archType,
          external: !!item.external,
          uniqueName: true,
          parentId: parentFor(item.kind, diagram),
          diagramKey: key,
          position,
          ...decision.plan,
        })
      ).id;
    });
    if (ok) startRename(newId);
    return ok ? newId : null;
  });

  /** Add a box of `kind` at `at` (its centre), connected from `sourceId`: one request, one undo step. */
  const createConnected = onceAtATime(async (kind: string, sourceId: string, at: Pt, sourceAnchor?: Pt) => {
    if (!diagram || !key) return;
    const sz = defaultSize(kind);
    const made = { id: "", relationshipId: undefined as string | undefined };
    const ok = await mutate(async () => {
      Object.assign(
        made,
        await api.createElement({
          kind,
          name: kind === "softwareSystem" ? "New system" : `New ${kind}`,
          uniqueName: true,
          parentId: parentFor(kind, diagram),
          diagramKey: key,
          position: { x: Math.round(at.x - sz.w / 2), y: Math.round(at.y - sz.h / 2) },
          connectFrom: sourceId,
        }),
      );
      // Which side of the source box the line leaves from; saved with the edit above, not as an undo step of its own.
      if (sourceAnchor && made.relationshipId) await api.layout(key, { edges: { [made.relationshipId]: { sourceAnchor } } }, true);
    });
    if (ok) startRename(made.id);
  });

  /**
   * A line dragged from a box onto empty canvas: add a connected box there. The kinds this diagram can add
   * are offered in a small menu at the drop point (the usual kind first; Enter takes it, Escape cancels);
   * a diagram that can add only one kind skips the menu.
   */
  const connectToEmpty = (sourceId: string, at: Pt, sourceAnchor?: Pt, client?: Pt) => {
    if (!diagram || !key) return;
    const usual = diagram.level === "container" ? "container" : diagram.level === "component" ? "component" : "softwareSystem";
    const kinds = [usual, ...["container", "component", "softwareSystem", "person"].filter((k) => k !== usual)].filter((k) => diagram.addable.includes(k));
    if (kinds.length === 0) return;
    if (kinds.length === 1 || !client) return void createConnected(kinds[0], sourceId, at, sourceAnchor);
    openChoiceMenu(
      client,
      kinds.map((k) => ({
        label: KIND_CHOICE[k],
        icon: iconFor(k),
        testId: `connect-kind-${k}`,
        onSelect: () => void createConnected(k, sourceId, at, sourceAnchor),
      })),
    );
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

  return { newFlow, addItem, connectToEmpty, connect, savePositions };
}

/** Starting, editing and discarding a draft (a planned change, edited on a copy of the model). */
export function draftActions(c: { state: AppState; draftId: string | null; switchVersion(model: string, compare: string | null): Promise<void>; refresh(): Promise<unknown> }) {
  const { state, draftId, switchVersion, refresh } = c;
  /** Create a draft and open it with its changes shown. Throws when the server refuses (the dialog shows why). */
  const createDraft = async (title: string, description: string) => {
    const { id } = await api.createDraft({ title, ...(description ? { description } : {}) });
    await switchVersion(`draft:${id}`, "base");
  };
  /** Change a draft's title or description. Throws when the server refuses. */
  const updateDraft = async (id: string, patch: { title?: string; description?: string }) => {
    await api.updateDraft(id, patch);
    await refresh().catch(() => undefined);
  };
  /** Discard a draft after a question; the open one goes back to the main model. */
  const discardDraft = async (id: string | null = draftId, title?: string) => {
    if (!id) return;
    const name = title ?? state.drafts.find((d) => d.id === id)?.title ?? id;
    const yes = await confirmDialog({
      title: `Discard "${name}"?`,
      message: "The draft and all its changes, including planned code edits, are deleted. This cannot be undone.",
      confirmLabel: "Discard",
      danger: true,
    });
    if (!yes) return;
    await run(
      async () => {
        await api.deleteDraft(id);
        if (id === draftId) await switchVersion("main", null);
        else await refresh().catch(() => undefined);
      },
      { success: `Discarded "${name}".` },
    );
  };
  return { createDraft, updateDraft, discardDraft };
}
