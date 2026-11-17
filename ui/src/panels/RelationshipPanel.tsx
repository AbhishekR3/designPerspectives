import { api } from "../api";
import { Discussion } from "../common/comments";
import { DecisionSection } from "./DecisionSection";
import { DataAccessSection } from "./DataSections";
import { CodeEndPicker, CodePaths, OpenCodeDiagram } from "./CodePickers";
import { Fields, Section, TagInput, TextField } from "./formParts";
import { openWork } from "../colourOverlays";
import { StylePanel } from "./StylePanel";
import { automaticLabel } from "../canvas/lineShapes";
import { type EdgeLayout, type Relationship } from "../types";
import type { Common } from "./panelProps";
import { ExampleFields, NotesEditor, SensitiveEditor, WorkEditor, WorkRefreshButton } from "./listEditors";
import { confirmDeleteRelationship } from "../common/dialogs";
import { PipelineData } from "../inspect/SamplePayload";

export function EdgePanel({ edgeId, ...p }: Common & { edgeId: string }) {
  const { state, diagram, mutate, lens } = p;
  const edge = diagram.edges.find((e) => e.id === edgeId);
  if (!edge) return null;
  const byId = new Map(state.elements.map((e) => [e.id, e]));
  const rels = edge.relationshipIds.map((id) => state.relationships.find((r) => r.id === id)).filter(Boolean) as Relationship[];
  const name = (id: string) => byId.get(id)?.name ?? diagram.nodes.find((n) => n.id === id)?.name ?? id;
  const style = edge.style;
  const setLayout = (layout: EdgeLayout) => mutate(() => api.layout(diagram.key, { edges: { [edge.id]: layout } }));
  const has = (s: (typeof lens.visibleSections)[number]) => lens.visibleSections.includes(s);
  const lineControls = diagram.level !== "flow" && !state.readOnly && (
    <>
      <label className="field inline">
        <span>Line shape</span>
        <select
          value={edge.layout.routing ?? "auto"}
          onChange={(e) => {
            const next = { ...edge.layout };
            if (e.target.value === "auto") delete next.routing;
            else next.routing = e.target.value as EdgeLayout["routing"];
            // Corners set by hand belong to the shape they were made in (right angles or straight), as in the line's menu.
            if (e.target.value !== (edge.layout.routing ?? "auto")) delete next.points;
            setLayout(next);
          }}
          data-testid="line-shape"
        >
          <option value="auto">{automaticLabel(diagram.lineShape)}</option>
          <option value="straight">Straight</option>
          <option value="curved">Curved (through the bend point)</option>
          <option value="smooth">Smooth S-curve</option>
          <option value="orthogonal">Right angles (elbow)</option>
          <option value="rounded">Rounded right angles</option>
        </select>
      </label>
      <button onClick={() => setLayout({})} disabled={Object.keys(edge.layout).length === 0} data-testid="reset-line">
        Reset line position
      </button>
      <p className="muted small">Drag the round grips on a selected line to move its ends to any point on a box, bend it, or slide its label.</p>
    </>
  );

  if (edge.id.startsWith("file:")) {
    return (
      <div className="panel-body" data-testid="edge-panel">
        <div className="panel-kind">Import</div>
        <p>
          {name(edge.source)} imports {name(edge.target)}.
        </p>
        {!state.readOnly && (
          <Section title="Appearance">
            <StylePanel target={edge.id} style={style} edge mutate={mutate} />
          </Section>
        )}
        {lineControls}
      </div>
    );
  }

  if (edge.derived) {
    return (
      <div className="panel-body" data-testid="edge-panel">
        <div className="panel-kind">Derived connection</div>
        <p className="muted">
          {name(edge.source)} → {name(edge.target)} is not drawn in the model directly. It comes from these relationships between elements inside them:
        </p>
        <ul className="rel-list">
          {rels.map((r) => {
            const t = edge.drillTargets.find((d) => d.relationshipId === r.id);
            return (
              <li key={r.id}>
                <button className="link" onClick={() => p.onReveal(r.sourceId)}>
                  {name(r.sourceId)}
                </button>{" "}
                →{" "}
                <button className="link" onClick={() => p.onReveal(r.destinationId)}>
                  {name(r.destinationId)}
                </button>
                <div className="muted small">
                  {r.description}
                  {r.technologies.length > 0 && ` [${r.technologies.join(", ")}]`}
                </div>
                {t && (
                  <button className="link small" onClick={() => p.onOpen(t.key)} data-testid={`open-drill-${r.id}`}>
                    Open where it is drawn
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {/* A service's line to a shared database often shows only as a derived line: say what each relationship reads or writes here too. */}
        {rels.map((r) => (
          <DataAccessSection
            key={`acc-${r.id}`}
            rel={r}
            state={state}
            catalog={p.catalog}
            mutate={mutate}
            title={rels.length > 1 ? `Data access: ${name(r.sourceId)} → ${name(r.destinationId)}` : undefined}
          />
        ))}
        {!state.readOnly && (
          <Section title="Appearance">
            <StylePanel target={edge.id} style={style} edge mutate={mutate} />
          </Section>
        )}
        {lineControls}
      </div>
    );
  }
  const r = rels[0];
  if (!r) return null;
  const save = (patch: object) => mutate(() => api.updateRelationship(r.id, patch));
  const detailKey = edge.detailKey ?? `connector-${r.id}`;
  const fromPaths = byId.get(r.sourceId)?.codePaths ?? [];
  const toPaths = byId.get(r.destinationId)?.codePaths ?? [];
  const CODE_END_NOTE = {
    guessed: "On the code diagram this line goes to a file guessed from imports. Choose the file here to set it.",
    unknown: "On the code diagram this line has no file, so it ends at the element's own box. Choose the file here to set it.",
  };
  return (
    <div className="panel-body" data-testid="edge-panel">
      <div className="panel-kind panel-kind-row">
        <span>Relationship</span>
        <span className="row">
          {p.onAsk && (
            <button className="ghost tiny" onClick={() => p.onAsk!({ relationship: r.id })} title="Ask BMO a question about this (opens the chat)" data-testid="ask-relationship">
              Ask
            </button>
          )}
          <button className="ghost tiny" onClick={() => p.onExplain({ relationship: r.id }, r.description || "Relationship")} title="Ask BMO to explain this" data-testid="explain-relationship">
            Explain
          </button>
        </span>
      </div>
      <p>
        <button className="link" onClick={() => p.onReveal(r.sourceId)}>
          {name(r.sourceId)}
        </button>{" "}
        →{" "}
        <button className="link" onClick={() => p.onReveal(r.destinationId)}>
          {name(r.destinationId)}
        </button>
      </p>
      {diagram.level === "code" && edge.codeEnd && edge.codeEnd !== "set" && (
        <p className="small" data-testid="code-end-note">
          {CODE_END_NOTE[edge.codeEnd]}
        </p>
      )}
      <Fields loose>
        <TextField label="Description" value={r.description} onCommit={(v) => save({ description: v })} testId="field-rel-description" autoFocus={p.focusName && !state.readOnly} />
        {has("technology") && (
          <TagInput label="Technology / protocol" value={r.technologies} suggestions={state.technologies} onChange={(v) => save({ technology: v })} testId="field-rel-technology" />
        )}
        <label className="field">
          <span>Kind</span>
          <select value={r.kind} onChange={(e) => save({ kind: e.target.value })} data-testid="field-rel-kind">
            <option value="">— not set —</option>
            {state.enums.connectorKinds.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
      </Fields>
      <DataAccessSection rel={r} state={state} catalog={p.catalog} mutate={p.mutate} />
      <DecisionSection id={r.id} name={r.description || "this relationship"} state={state} mutate={p.mutate} onOpenDecision={p.onOpenDecision} />
      <Discussion target={{ type: "relationship", id: r.id }} diagramKey={diagram.key} />
      <button className="primary" onClick={() => p.onOpen(detailKey)} data-testid="open-connector">
        Open connector detail{r.stages.length ? ` (${r.stages.length} stages)` : ""}
      </button>
      <h4>{r.stages.length ? "Data through this connector" : "Example data"}</h4>
      <PipelineData rel={r} state={state} onBacktrack={r.stages.length ? (stage) => p.onBacktrack({ connector: r.id, stage }) : undefined} />
      {!state.readOnly && (
        <Section title={r.stages.length ? "Sample entering the connector" : "Edit example data"} count={r.example ? 1 : 0} testId="sec-rel-example">
          <ExampleFields example={r.example} format={r.format} onSave={save} testId="rel-example" />
        </Section>
      )}
      {!state.readOnly && (
        <Section title="API endpoints" count={r.endpoints.length} testId="sec-rel-endpoints">
          <TextField
            label="HTTP calls this carries, one per line"
            value={r.endpoints.map((e) => (e.method === "*" ? e.path : `${e.method} ${e.path}`)).join("\n")}
            multiline
            rows={3}
            placeholder={"GET /api/accounts/:id\nPOST /api/payments"}
            onCommit={(v) => save({ endpoints: v })}
            testId="field-rel-endpoints"
          />
          <p className="muted small">Used by the live UI inspector to match calls. ":name" matches one path segment, a final "*" the rest.</p>
        </Section>
      )}
      {state.readOnly && r.endpoints.length > 0 && (
        <p className="small">
          Endpoints: <code>{r.endpoints.map((e) => `${e.method === "*" ? "" : e.method + " "}${e.path}`).join(", ")}</code>
        </p>
      )}
      {has("work") && (
        <Section
          title={`Linked work${openWork(r).length ? ` · ${openWork(r).length} open` : ""}`}
          count={r.work.length}
          testId="sec-rel-work"
          footer={<WorkRefreshButton rows={r.work} mutate={p.mutate} readOnly={state.readOnly} />}
        >
          <WorkEditor rows={r.work} enums={p.state.enums} onSave={(rows) => save({ work: rows })} />
        </Section>
      )}
      {has("notes") && (
        <Section title="Notes" count={r.notes ? 1 : 0}>
          <NotesEditor value={r.notes} onSave={(v) => save({ notes: v })} />
        </Section>
      )}
      {has("sensitive") && (
        <Section title="Sensitive information" count={r.sensitive.length}>
          <SensitiveEditor rows={r.sensitive} levels={state.enums.sensitivity} onSave={(v) => save({ sensitive: v })} />
        </Section>
      )}
      {has("code") && (fromPaths.length > 0 || toPaths.length > 0) && (
        <Section title="Files at the ends" count={(r.codeFrom ? 1 : 0) + (r.codeTo ? 1 : 0)} testId="sec-rel-code-ends" defaultOpen={diagram.level === "code"}>
          {fromPaths.length > 0 && (
            <CodeEndPicker
              label="Leaves from file"
              ownerId={r.sourceId}
              paths={fromPaths}
              value={r.codeFrom}
              readOnly={state.readOnly}
              onChange={(v) => save({ codeFrom: v })}
              testId="field-rel-code-from"
            />
          )}
          {toPaths.length > 0 && (
            <CodeEndPicker
              label="Arrives at file"
              ownerId={r.destinationId}
              paths={toPaths}
              value={r.codeTo}
              readOnly={state.readOnly}
              onChange={(v) => save({ codeTo: v })}
              testId="field-rel-code-to"
            />
          )}
          <p className="muted small">
            The code diagram of {name(r.sourceId)} and of {name(r.destinationId)} draws this line to these files.
          </p>
        </Section>
      )}
      {has("code") && (
        <Section title="Code" count={r.codePaths.length} footer={r.codePaths.length > 0 ? <OpenCodeDiagram onOpen={() => p.onOpen(`code-${r.id}`)} /> : undefined}>
          <CodePaths paths={r.codePaths} onSave={(v) => save({ codePaths: v })} />
        </Section>
      )}
      {!state.readOnly && (
        <Section title="Appearance" count={Object.keys(style).length}>
          <StylePanel target={edge.id.startsWith("conn:") ? r.id : edge.id} style={style} edge mutate={mutate} />
        </Section>
      )}
      {lineControls}
      {!state.readOnly && (
        <div className="panel-actions">
          <button
            className="danger"
            onClick={() => {
              void confirmDeleteRelationship().then((yes) => yes && mutate(() => api.deleteRelationship(r.id)).then((ok) => ok && p.onSelect(null)));
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
