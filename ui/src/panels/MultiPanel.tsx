import type { AppState } from "../types";

/** The right panel while several boxes are selected: how many, and Delete (where deleting is allowed). */
export function MultiPanel({ state, ids, canDelete, onDelete }: { state: AppState; ids: string[]; canDelete: boolean; onDelete(): void }) {
  const names = ids.map((id) => state.elements.find((e) => e.id === id)?.name).filter(Boolean) as string[];
  return (
    <div className="panel-body" data-testid="multi-panel">
      <div className="panel-kind">Selection</div>
      <h2 className="panel-title" data-testid="multi-count">
        {ids.length} objects selected
      </h2>
      <ul className="links">
        {names.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
      <p className="muted small">Drag one of them to move them all, or use the arrow keys. Click empty canvas to clear the selection.</p>
      {canDelete && (
        <div className="panel-actions">
          <button className="danger" onClick={onDelete} data-testid="multi-delete">
            Delete {ids.length} objects
          </button>
        </div>
      )}
    </div>
  );
}
