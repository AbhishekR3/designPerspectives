import { LEVEL_LABEL, type AppState, type Lens, type TagGroup } from "./types";

const INDENT: Record<string, number> = { landscape: 0, context: 1, container: 1, component: 2 };

export function Sidebar({
  state,
  lens,
  currentKey,
  showAllLevels,
  setShowAllLevels,
  onOpen,
  onLens,
  onEditLens,
  onNewLens,
  onNewFlow,
  onEditTagGroup,
  onNewTagGroup,
  onDeleteTagGroup,
  onRenameWorkspace,
}: {
  state: AppState;
  lens: Lens;
  currentKey: string | null;
  showAllLevels: boolean;
  setShowAllLevels(v: boolean): void;
  onOpen(key: string): void;
  onLens(id: string): void;
  onEditLens(l: Lens): void;
  onNewLens(): void;
  onNewFlow(): void;
  onEditTagGroup(g: TagGroup): void;
  onNewTagGroup(): void;
  onDeleteTagGroup(g: TagGroup): void;
  onRenameWorkspace(): void;
}) {
  const diagrams = state.diagrams.filter((d) => showAllLevels || lens.visibleLevels.includes(d.level));
  const hidden = state.diagrams.length - diagrams.length;
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="product">designPerspectives</div>
        <button className="ws-name link" onClick={onRenameWorkspace} title="Rename workspace" data-testid="ws-name">
          {state.workspace.name}
        </button>
      </div>

      <section>
        <h3>Lens</h3>
        <div className="row">
          <select value={lens.id} onChange={(e) => onLens(e.target.value)} data-testid="lens-select">
            {state.lenses.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
                {l.builtin ? " (built-in)" : ""}
              </option>
            ))}
          </select>
          <button className="icon" onClick={() => onEditLens(lens)} title={lens.builtin ? "Duplicate lens" : "Edit lens"} data-testid="lens-edit">
            {lens.builtin ? "⧉" : "✎"}
          </button>
        </div>
        <button className="add" onClick={onNewLens} data-testid="new-lens">
          + New lens
        </button>
      </section>

      <section>
        <h3>Diagrams</h3>
        <ul className="tree" data-testid="diagram-list">
          {diagrams.map((d) => (
            <li key={d.key} style={{ paddingLeft: INDENT[d.level] * 14 }}>
              <button className={`link ${d.key === currentKey ? "active" : ""}`} onClick={() => onOpen(d.key)} data-testid={`diagram-${d.key}`}>
                <span className="level-tag">{LEVEL_LABEL[d.level]}</span> {d.level === "landscape" ? "System landscape" : d.title.split(" — ")[0]}
              </button>
            </li>
          ))}
        </ul>
        <label className="check small">
          <input type="checkbox" checked={showAllLevels} onChange={(e) => setShowAllLevels(e.target.checked)} />
          Show all levels {hidden > 0 && !showAllLevels && <span className="muted">({hidden} hidden by lens)</span>}
        </label>
      </section>

      <section>
        <h3>Flows</h3>
        <ul className="tree" data-testid="flow-list">
          {state.flows.map((f) => (
            <li key={f.key}>
              <button className={`link ${f.key === currentKey ? "active" : ""}`} onClick={() => onOpen(f.key)} data-testid={`flow-${f.key}`}>
                ▸ {f.title} <span className="muted">({f.steps.length})</span>
              </button>
            </li>
          ))}
        </ul>
        <button className="add" onClick={onNewFlow} data-testid="new-flow">
          + New flow
        </button>
      </section>

      <section>
        <h3>Tag groups</h3>
        <ul className="tree">
          {state.tagGroups.map((g) => (
            <li key={g.name} className="row between">
              <button className="link" onClick={() => onEditTagGroup(g)} data-testid={`taggroup-${g.name}`}>
                {g.name} <span className="muted">({g.values.map((v) => v.name).join(", ")})</span>
              </button>
              <button className="icon" onClick={() => onDeleteTagGroup(g)} aria-label={`Delete ${g.name}`}>
                ×
              </button>
            </li>
          ))}
        </ul>
        <button className="add" onClick={onNewTagGroup} data-testid="new-tag-group">
          + New tag group
        </button>
      </section>

      {state.loadErrors.length > 0 && (
        <section className="warning">
          <strong>Problems in the model files</strong>
          <ul>
            {state.loadErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </section>
      )}
      <div className="footer muted small" title={state.root}>
        Files: architecture/ in {state.root.split(/[\\/]/).pop()}
      </div>
    </aside>
  );
}
