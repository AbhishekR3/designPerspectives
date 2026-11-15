import { api } from "../api";
import { CodePaths, NewPlannedFile } from "../CodeParts";
import type { Common } from "./common";

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
      <CodePaths paths={diagram.code.paths} onSave={save} />
      {diagram.code.missing.length > 0 && <p className="warning">Not found in the code folder: {diagram.code.missing.join(", ")}</p>}
      {diagram.code.truncated && <p className="muted small">Only the first files are shown.</p>}
      {state.model.ref.startsWith("draft:") && !state.readOnly && diagram.code.hasRoot && <NewPlannedFile ownerId={ownerId} paths={diagram.code.paths} mutate={mutate} onOpenFile={p.onOpenFile} />}
    </div>
  );
}
