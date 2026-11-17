import { useMemo, useState } from "react";
import { Modal } from "../panels/formParts";
import { errorMessage } from "./notify";
import { KIND_LABEL, type AppState, type ElementSummary } from "../types";

/** More targets than this get a filter box. */
const FILTER_FROM = 9;

interface Target {
  id: string;
  name: string;
  /** The software system a container target sits in (the group heading); null for a software system. */
  group: string | null;
}

/** Where a container or component can go: other software systems, or other containers (grouped by system). The current parent is left out. */
export function moveTargets(state: AppState, el: ElementSummary): Target[] {
  const byId = new Map(state.elements.map((e) => [e.id, e]));
  if (el.kind === "container") {
    return state.elements.filter((e) => e.kind === "softwareSystem" && e.id !== el.parentId).map((e) => ({ id: e.id, name: e.name, group: null }));
  }
  if (el.kind === "component") {
    return state.elements
      .filter((e) => e.kind === "container" && e.id !== el.parentId)
      .map((e) => ({ id: e.id, name: e.name, group: byId.get(e.parentId ?? "")?.name ?? "" }))
      .sort((a, b) => (a.group ?? "").localeCompare(b.group ?? "") || a.name.localeCompare(b.name));
  }
  return [];
}

/** Whether Move to… applies to this element (a container or a component). */
export const canMove = (el: ElementSummary | undefined): el is ElementSummary => !!el && (el.kind === "container" || el.kind === "component");

/**
 * "Move to…": pick another parent for a container (a software system) or a component (a container).
 * The server may refuse (a name already used there, a relationship that would join an element and its parent):
 * its message is shown here and the dialog stays open.
 */
export function MoveDialog({ state, element, onMove, onClose }: { state: AppState; element: ElementSummary; onMove(parentId: string): Promise<void>; onClose(): void }) {
  const targets = useMemo(() => moveTargets(state, element), [state, element]);
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const word = element.kind === "container" ? "software system" : "container";
  const q = filter.trim().toLowerCase();
  const shown = q ? targets.filter((t) => `${t.group ?? ""} ${t.name}`.toLowerCase().includes(q)) : targets;
  const groups = [...new Set(shown.map((t) => t.group))];

  const confirm = async () => {
    if (!picked || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await onMove(picked);
    } catch (e) {
      setProblem(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal title={`Move "${element.name}" to…`} onClose={onClose} testId="move-dialog">
      <p className="dialog-message">
        Pick the {word} this {KIND_LABEL[element.kind].toLowerCase()} should sit in. Its connections stay.
      </p>
      {targets.length === 0 ? (
        <p className="empty-note">There is no other {word} to move it to.</p>
      ) : (
        <>
          {targets.length >= FILTER_FROM && (
            <label className="field">
              <input type="text" autoFocus placeholder={`Filter ${word}s`} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter" data-testid="move-filter" />
            </label>
          )}
          <div className="move-list" role="listbox" aria-label={`Move to a ${word}`}>
            {shown.length === 0 && <div className="empty-note">Nothing matches.</div>}
            {groups.map((g) => (
              <div key={g ?? ""} className="move-group">
                {g !== null && <div className="move-group-name muted small">{g}</div>}
                {shown
                  .filter((t) => t.group === g)
                  .map((t) => (
                    <button
                      key={t.id}
                      className={`move-target${picked === t.id ? " on" : ""}`}
                      role="option"
                      aria-selected={picked === t.id}
                      onClick={() => {
                        setPicked(t.id);
                        setProblem(null);
                      }}
                      onDoubleClick={() => void confirm()}
                      data-testid={`move-target-${t.id}`}
                    >
                      {t.name}
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </>
      )}
      {problem && (
        <div className="dialog-error" role="alert" data-testid="move-error">
          {problem}
        </div>
      )}
      <div className="modal-actions">
        <button onClick={onClose} data-testid="move-cancel">
          Cancel
        </button>
        <button className="primary" disabled={!picked || busy} aria-busy={busy} onClick={() => void confirm()} data-testid="move-confirm">
          Move
        </button>
      </div>
    </Modal>
  );
}
