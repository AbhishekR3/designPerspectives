import { Icon } from "./icons";
import type { AppState, DiagramInfo, Lens, Level, TagGroup } from "../types";

export function Sidebar({
  state,
  lens,
  currentKey,
  showAllLevels,
  setShowAllLevels,
  onOpen,
  onClose,
  onEditLens,
  onNewLens,
  onEditTagGroup,
  onNewTagGroup,
  onDeleteTagGroup,
  onEditCharacteristics,
  onEditCost,
  onRenameWorkspace,
  draftsSection,
  homeLabel,
}: {
  state: AppState;
  lens: Lens;
  currentKey: string | null;
  showAllLevels: boolean;
  setShowAllLevels(v: boolean): void;
  onOpen(key: string): void;
  onClose(): void;
  onEditLens(l: Lens): void;
  onNewLens(): void;
  onEditTagGroup(g: TagGroup): void;
  onNewTagGroup(): void;
  onDeleteTagGroup(g: TagGroup): void;
  onEditCharacteristics(): void;
  onEditCost(): void;
  onRenameWorkspace(): void;
  /** The Drafts section (main model and planned changes). */
  draftsSection?: React.ReactNode;
  /** The link back to the home page (DEC-053): the hub's name, or "Home". */
  homeLabel?: string;
}) {
  // Editing the model (names, lenses, tag groups, ratings): not on a git version, and not for a role that cannot change this version.
  const canEdit = !state.readOnly;
  const visible = (d: DiagramInfo) => showAllLevels || d.level === "connector" || lens.visibleLevels.includes(d.level as Level);
  // A software system with nothing inside is one entry (not a context and an empty containers diagram), marked "(empty)".
  const emptySystems = new Set(state.elements.filter((e) => e.kind === "softwareSystem" && e.childCount === 0).map((e) => e.id));
  const rows: { d: DiagramInfo; empty: boolean }[] = [];
  let hidden = 0;
  for (const d of state.diagrams) {
    const isEmptyScope = !!d.scope && emptySystems.has(d.scope) && (d.level === "context" || d.level === "container");
    if (!isEmptyScope) {
      if (visible(d)) rows.push({ d, empty: false });
      else hidden++;
    } else if (d.level === "context") {
      const containers = state.diagrams.find((x) => x.key === `containers-${d.scope}`);
      const shown = containers && visible(containers) ? containers : visible(d) ? d : null;
      if (shown) rows.push({ d: { ...shown, depth: d.depth }, empty: true });
      else hidden++;
    }
  }
  return (
    <aside className="sidebar">
      <div className="brand row between">
        <div className="brand-name">
          <a className="product home-link" href="#/home" title="Home: projects, what needs a look, decisions" data-testid="go-home">
            <Icon name="home" size={11} /> {homeLabel ?? "Home"}
          </a>
          {canEdit ? (
            <button className="ws-name link" onClick={onRenameWorkspace} title={`${state.workspace.name}: rename the workspace`} data-testid="ws-name">
              {state.workspace.name}
            </button>
          ) : (
            <div className="ws-name" title={state.workspace.name} data-testid="ws-name">
              {state.workspace.name}
            </div>
          )}
        </div>
        <button className="ghost icon" onClick={onClose} title="Hide the diagram list" aria-label="Hide the diagram list" data-testid="sidebar-close">
          <Icon name="panel" />
        </button>
      </div>

      <section>
        <h3>Diagrams</h3>
        <ul className="tree" data-testid="diagram-list">
          {rows.map(({ d, empty }) => (
            <li key={d.key} style={{ paddingLeft: d.depth * 14 }}>
              <button
                className={`link tree-link ${d.key === currentKey ? "active" : ""}`}
                onClick={() => onOpen(d.key)}
                data-testid={`diagram-${d.key}`}
                title={empty ? `${d.title}: nothing inside yet` : d.title}
              >
                <span className={`level-tag c4-${d.c4}`} data-testid={`level-${d.key}`}>
                  {d.c4}
                </span>
                <span className="tree-label">
                  {d.level === "connector" ? "⇢ " : ""}
                  {d.level === "landscape" ? "System landscape" : d.level === "context" ? `${d.label} (context)` : d.label}
                </span>
                {empty && <span className="muted tree-mark">(empty)</span>}
              </button>
            </li>
          ))}
        </ul>
        <label className="check small">
          <input type="checkbox" checked={showAllLevels} onChange={(e) => setShowAllLevels(e.target.checked)} />
          Show all levels {hidden > 0 && !showAllLevels && <span className="muted">({hidden} hidden by lens)</span>}
        </label>
      </section>

      {draftsSection}

      <section>
        <h3>Lenses</h3>
        <ul className="tree">
          {state.lenses.map((l) => (
            <li key={l.id} className="tree-row">
              <span className={`tree-label${l.id === lens.id ? " strong" : ""}`} title={l.name}>
                {l.name}
                {l.builtin && <span className="muted small"> built-in</span>}
              </span>
              {canEdit && (
                <button
                  className="ghost icon"
                  onClick={() => onEditLens(l)}
                  title={l.builtin ? "Duplicate lens" : "Edit lens"}
                  aria-label={`${l.builtin ? "Duplicate" : "Edit"} the lens ${l.name}`}
                  data-testid={l.id === lens.id ? "lens-edit" : undefined}
                >
                  {l.builtin ? "⧉" : "✎"}
                </button>
              )}
            </li>
          ))}
        </ul>
        {canEdit && (
          <button className="add" onClick={onNewLens} data-testid="new-lens">
            + New lens
          </button>
        )}
      </section>

      <section>
        <h3>Tag groups</h3>
        <ul className="tree">
          {state.tagGroups.map((g) => (
            <li key={g.name} className="tree-row">
              {canEdit ? (
                <>
                  <button className="link tree-link" onClick={() => onEditTagGroup(g)} title={`${g.name} (${g.values.map((v) => v.name).join(", ")})`} data-testid={`taggroup-${g.name}`}>
                    <span className="tree-label">
                      {g.name} <span className="muted">({g.values.map((v) => v.name).join(", ")})</span>
                    </span>
                  </button>
                  <button className="ghost icon" onClick={() => onDeleteTagGroup(g)} aria-label={`Delete ${g.name}`} title={`Delete the tag group ${g.name}`}>
                    ×
                  </button>
                </>
              ) : (
                <span className="tree-label" title={`${g.name} (${g.values.map((v) => v.name).join(", ")})`} data-testid={`taggroup-${g.name}`}>
                  {g.name} <span className="muted">({g.values.map((v) => v.name).join(", ")})</span>
                </span>
              )}
            </li>
          ))}
        </ul>
        {canEdit && (
          <button className="add" onClick={onNewTagGroup} data-testid="new-tag-group">
            + New tag group
          </button>
        )}
      </section>

      <section>
        <h3>Ratings and cost</h3>
        {canEdit ? (
          <>
            <button className="link" onClick={onEditCharacteristics} data-testid="sidebar-characteristics">
              Characteristics <span className="muted">({state.characteristics.length})</span>
            </button>
            <button className="link" onClick={onEditCost} data-testid="sidebar-cost">
              Cost settings <span className="muted">({state.costSettings.currency})</span>
            </button>
          </>
        ) : (
          <>
            <div>
              Characteristics <span className="muted">({state.characteristics.length})</span>
            </div>
            <div>
              Cost settings <span className="muted">({state.costSettings.currency})</span>
            </div>
          </>
        )}
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
