import { api } from "../api";
import { CodePaths, NewPlannedFile } from "./CodePickers";
import { Fields, Section } from "./formParts";
import { StylePanel } from "./StylePanel";
import type { AppState, DiagramNode } from "../types";
import type { Common } from "./panelProps";

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

export function CodeDiagramPanel(p: Common) {
  const { state, diagram, mutate } = p;
  const ownerId = diagram.scope!;
  const isRel = state.relationships.some((r) => r.id === ownerId);
  const owner = isRel ? state.relationships.find((r) => r.id === ownerId)! : state.elements.find((e) => e.id === ownerId)!;
  if (!owner || !diagram.code) return null;
  const save = (paths: string[]) => mutate(() => (isRel ? api.updateRelationship(ownerId, { codePaths: paths }) : api.updateElement(ownerId, { codePaths: paths })));
  return (
    <div className="panel-body" data-testid="code-panel">
      <div className="panel-kind">Code</div>
      <h2 className="panel-title">{diagram.code.ownerName}</h2>
      <p className="muted small">Files appear as boxes; lines are imports found by scanning the code. Double-click a file to open and edit it.</p>
      {!diagram.code.hasRoot && <p className="error">No code folder is set. Start with --code-root.</p>}
      <Fields>
        <CodePaths paths={diagram.code.paths} onSave={save} />
      </Fields>
      {diagram.code.missing.length > 0 && <p className="warning">Not found in the code folder: {diagram.code.missing.join(", ")}</p>}
      {diagram.code.truncated && <p className="muted small">Only the first files are shown.</p>}
      {state.model.ref.startsWith("draft:") && !state.readOnly && diagram.code.hasRoot && <NewPlannedFile ownerId={ownerId} paths={diagram.code.paths} mutate={mutate} onOpenFile={p.onOpenFile} />}
    </div>
  );
}

export function FilePanel({ node, ...p }: Common & { node: DiagramNode }) {
  const imports = p.diagram.edges.filter((e) => e.source === node.id).map((e) => e.target);
  const importedBy = p.diagram.edges.filter((e) => e.target === node.id).map((e) => e.source);
  const name = (id: string) => p.diagram.nodes.find((n) => n.id === id)?.name ?? id;
  return (
    <div className="panel-body" data-testid="file-panel">
      <div className="panel-kind">File</div>
      <h2 className="panel-title">{node.name}</h2>
      <div className="muted small">{node.filePath}</div>
      <button className="primary" onClick={() => p.onOpenFile(node.filePath!)} data-testid="open-file">
        {p.state.readOnly ? "Open file" : "Open file to edit"}
      </button>
      <div className="connections">
        <h4>
          Imports <span className="count">{imports.length}</span>
        </h4>
        <ul>
          {imports.map((i) => (
            <li key={i}>{name(i)}</li>
          ))}
        </ul>
        <h4>
          Imported by <span className="count">{importedBy.length}</span>
        </h4>
        <ul>
          {importedBy.map((i) => (
            <li key={i}>{name(i)}</li>
          ))}
        </ul>
      </div>
      {!p.state.readOnly && (
        <Section title="Appearance">
          <StylePanel target={node.id} style={node.style} edge={false} mutate={p.mutate} />
        </Section>
      )}
    </div>
  );
}
