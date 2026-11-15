import { useCallback, useMemo, type Dispatch, type RefObject, type SetStateAction } from "react";
import { api } from "./api";
import type { CanvasHandle } from "./Canvas";
import type { NodeActions } from "./canvasParts";
import { defaultSize } from "./layout";
import type { PaletteItem } from "./Palette";
import type { AppState, Diagram, Pt, Selection } from "./types";

type Mutate = (fn: () => Promise<unknown>) => Promise<boolean>;

/** Deleting a relationship and the quick bar on a selected box (none when the server is read-only). */
export function useElementActions(p: {
  state: AppState | null;
  mutate: Mutate;
  pasteFrom(id: string, at?: Pt): Promise<void>;
  open(k: string): void;
  setSelection: Dispatch<SetStateAction<Selection>>;
}) {
  const { state, mutate, pasteFrom, open, setSelection } = p;
  const deleteRelationship = useCallback(
    (relId: string) => {
      if (window.confirm("Delete this relationship? Flow steps that use it are removed too."))
        mutate(() => api.deleteRelationship(relId)).then((ok) => ok && setSelection(null));
    },
    [mutate],
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

  return { deleteRelationship, nodeActions };
}

/** Edits started on the canvas or from the palette: add, connect, move; and adding a flow. */
export function diagramActions(c: {
  state: AppState;
  diagram: Diagram | null;
  key: string | null;
  mutate: Mutate;
  open(k: string): void;
  canvasRef: RefObject<CanvasHandle | null>;
  startRename(id: string): void;
  setSelection: Dispatch<SetStateAction<Selection>>;
  setFocusName: Dispatch<SetStateAction<boolean>>;
}) {
  const { state, diagram, key, mutate, open, canvasRef, startRename, setSelection, setFocusName } = c;

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

  return { newFlow, addItem, connectToEmpty, connect, savePositions };
}

/** Starting and discarding a draft (a planned change, edited on a copy of the model). */
export function draftActions(c: {
  state: AppState;
  draftId: string | null;
  switchVersion(model: string, compare: string | null): Promise<void>;
  setError: Dispatch<SetStateAction<string | null>>;
}) {
  const { state, draftId, switchVersion, setError } = c;
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
  return { newDraft, discardDraft };
}
