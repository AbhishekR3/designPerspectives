import { api } from "../api";
import { CodePaths } from "../CodeParts";
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
      {state.model.ref.startsWith("draft:") && diagram.code.hasRoot && (
        <button
          onClick={async () => {
            const folder = diagram.code!.paths.find((x) => !/\.[A-Za-z0-9]+$/.test(x)) ?? diagram.code!.paths[0]?.replace(/[^/]*$/, "") ?? "";
            const rel = window.prompt("Path of the new file (relative to the code folder)", folder ? `${folder.replace(/\/$/, "")}/` : "");
            if (!rel?.trim()) return;
            const path = rel.trim();
            const covered = diagram.code!.paths.some((x) => path === x || path.startsWith(x.replace(/\/$/, "") + "/"));
            const done = await mutate(async () => {
              await api.newCodeFile(path);
              if (!covered) await (isRel ? api.updateRelationship(ownerId, { codePaths: [...diagram.code!.paths, path] }) : api.updateElement(ownerId, { codePaths: [...diagram.code!.paths, path] }));
            });
            if (done) p.onOpenFile(path);
          }}
          data-testid="new-planned-file"
        >
          + New planned file
        </button>
      )}
    </div>
  );
}
