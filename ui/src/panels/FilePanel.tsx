import { Section } from "../fields";
import { StylePanel } from "../StylePanel";
import { type DiagramNode } from "../types";
import type { Common } from "./common";

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
        <ul>{imports.map((i) => <li key={i}>{name(i)}</li>)}</ul>
        <h4>
          Imported by <span className="count">{importedBy.length}</span>
        </h4>
        <ul>{importedBy.map((i) => <li key={i}>{name(i)}</li>)}</ul>
      </div>
      {!p.state.readOnly && (
        <Section title="Appearance">
          <StylePanel target={node.id} style={node.style} edge={false} mutate={p.mutate} />
        </Section>
      )}
    </div>
  );
}
