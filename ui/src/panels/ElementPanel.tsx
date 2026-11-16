import { useState } from "react";
import { api } from "../api";
import { Discussion } from "../comments";
import { CodePaths, NewPlannedFile, OpenCodeDiagram } from "../CodeParts";
import { Fields, Section, TagInput, TextField } from "../fields";
import { formatMoney, openWork } from "../overlays";
import { ShapeIcon } from "../shapes";
import { StylePanel } from "../StylePanel";
import { KIND_LABEL, type ElementSummary } from "../types";
import type { Common } from "./common";
import { NotesEditor, DetailsEditor, TradeoffsEditor, UsageEditor, SensitiveEditor, ConnectionList } from "./sectionEditors";
import { CharacteristicsEditor, CostEditor, WorkEditor } from "./valueEditors";
import { confirmDeleteElement } from "../dialogs";

export function ObjectPanel({ element, ...p }: Common & { element: ElementSummary }) {
  const { state, lens, mutate, diagram } = p;
  const save = (patch: object) => mutate(() => api.updateElement(element.id, patch));
  const has = (s: (typeof lens.visibleSections)[number]) => lens.visibleSections.includes(s);
  const subtree = new Set([element.id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const e of state.elements)
      if (e.parentId && subtree.has(e.parentId) && !subtree.has(e.id)) {
        subtree.add(e.id);
        grew = true;
      }
  }
  const incoming = state.relationships.filter((r) => subtree.has(r.destinationId) && !subtree.has(r.sourceId));
  const outgoing = state.relationships.filter((r) => subtree.has(r.sourceId) && !subtree.has(r.destinationId));
  const groups = state.tagGroups.filter((g) => !lens.hiddenTagGroups.includes(g.name));
  const parent = element.parentId ? state.elements.find((e) => e.id === element.parentId) : null;
  const [newLink, setNewLink] = useState({ label: "", url: "" });
  const drill = element.kind === "softwareSystem" ? `containers-${element.id}` : element.kind === "container" ? `components-${element.id}` : null;
  const style = state.styles[element.id] ?? {};
  const hasTech = element.kind === "container" || element.kind === "component";

  return (
    <div className="panel-body" data-testid="object-panel">
      <div className="panel-kind">
        {KIND_LABEL[element.kind]}
        {parent && <span className="muted"> in {parent.name}</span>}
      </div>
      <Fields loose>
        <TextField label="Name" value={element.name} onCommit={(v) => p.onRename(element.id, v)} testId="field-name" autoFocus={p.focusName && !state.readOnly} />
        <TextField label="Description" value={element.description} multiline onCommit={(v) => save({ description: v })} testId="field-description" />
        {element.kind !== "person" && (
          <label className="field">
            <span>Symbol</span>
            <div className="row">
              <ShapeIcon type={element.archType || "box"} />
              <select value={element.archType || "box"} onChange={(e) => save({ archType: e.target.value })} data-testid="field-arch" style={{ flex: 1 }}>
                {state.enums.archTypes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
          </label>
        )}
        {hasTech && has("technology") && (
          <TagInput label="Technology" value={element.technologies} suggestions={state.technologies} onChange={(v) => save({ technology: v })} testId="field-technology" />
        )}
        <TextField label="Owner" value={element.owner} onCommit={(v) => save({ owner: v })} testId="field-owner" />
        {(element.kind === "person" || element.kind === "softwareSystem") && (
          <label className="check">
            <input type="checkbox" checked={element.location === "External"} onChange={(e) => save({ external: e.target.checked })} />
            External (outside our organisation)
          </label>
        )}
        {groups.length > 0 && (
          <div className="tag-fields">
            <h4>Tags</h4>
            {groups.map((g) => (
              <label className="field inline" key={g.name}>
                <span>{g.name}</span>
                <select value={element.tags[g.name] ?? ""} data-testid={`tag-${g.name}`} onChange={(e) => save({ tags: { [g.name]: e.target.value || null } })}>
                  <option value="">—</option>
                  {g.values.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        )}
      </Fields>
      <Discussion target={{ type: "element", id: element.id }} diagramKey={diagram.key} />
      {element.uiUrl && (
        <button className="primary" onClick={() => p.onInspectUi(element.id)} data-testid="inspect-ui" title={element.uiUrl}>
          Inspect live UI
        </button>
      )}
      {element.kind !== "person" && !state.readOnly && (
        <Section title="Live UI and traces" count={(element.uiUrl ? 1 : 0) + (element.otelService ? 1 : 0)} testId="sec-live-ui">
          <TextField label="Address the UI runs at" value={element.uiUrl} placeholder="http://localhost:3000/" onCommit={(v) => save({ uiUrl: v })} testId="field-ui-url" />
          <TextField label="Service name in trace files" value={element.otelService} placeholder={element.id} onCommit={(v) => save({ otelService: v })} testId="field-otel-service" />
          <p className="muted small">Open the running app inside dp, click in it, and see which relationships each click uses. Map calls with endpoints on this element&apos;s relationships. In trace files, spans match this element by the file they ran in (its code paths) or by this service name (default: its ID or name).</p>
        </Section>
      )}

      {has("characteristics") && element.kind !== "person" && (
        <Section title="Characteristics" count={element.characteristics.length} testId="sec-characteristics">
          <CharacteristicsEditor rows={element.characteristics} defs={state.characteristics} onSave={(r) => save({ characteristics: r })} />
        </Section>
      )}
      {has("cost") && element.kind !== "person" && (
        <Section title={`Cost${element.costRollup ? ` · ${formatMoney(element.costRollup, state.costSettings.currency)}/mo` : ""}`} count={element.cost.length} testId="sec-cost">
          <CostEditor element={element} currency={state.costSettings.currency} onSave={(r) => save({ cost: r })} />
        </Section>
      )}
      {has("work") && (
        <Section title={`Linked work${openWork(element).length ? ` · ${openWork(element).length} open` : ""}`} count={element.work.length} testId="sec-work">
          <WorkEditor rows={element.work} enums={state.enums} onSave={(r) => save({ work: r })} />
        </Section>
      )}
      {has("details") && (
        <Section title="Details" count={element.details.length} testId="sec-details">
          <DetailsEditor tables={element.details} onSave={(t) => save({ details: t })} />
        </Section>
      )}
      {has("notes") && (
        <Section title="Notes" count={element.notes ? 1 : 0} testId="sec-notes">
          <NotesEditor value={element.notes} onSave={(v) => save({ notes: v })} />
        </Section>
      )}
      {has("tradeoffs") && (
        <Section title="Tradeoffs" count={element.tradeoffs.length} testId="sec-tradeoffs">
          <TradeoffsEditor rows={element.tradeoffs} onSave={(r) => save({ tradeoffs: r })} />
        </Section>
      )}
      {has("usage") && (
        <Section title="Usage" count={element.usage.length} testId="sec-usage">
          <UsageEditor rows={element.usage} frequencies={state.enums.frequencies} onSave={(r) => save({ usage: r })} />
        </Section>
      )}
      {has("sensitive") && (
        <Section title="Sensitive information" count={element.sensitive.length} testId="sec-sensitive">
          <SensitiveEditor rows={element.sensitive} levels={state.enums.sensitivity} onSave={(r) => save({ sensitive: r })} />
        </Section>
      )}
      {has("code") && (
        <Section
          title="Code"
          count={element.codePaths.length}
          testId="sec-code"
          footer={element.kind !== "person" && element.codePaths.length > 0 ? <OpenCodeDiagram onOpen={() => p.onOpen(`code-${element.id}`)} /> : undefined}
        >
          <CodePaths paths={element.codePaths} onSave={(paths) => save({ codePaths: paths })} />
          {(element.kind === "component" || element.kind === "container") && state.model.ref.startsWith("draft:") && !state.readOnly && (
            <NewPlannedFile ownerId={element.id} paths={element.codePaths} mutate={mutate} onOpenFile={p.onOpenFile} />
          )}
        </Section>
      )}
      <Section title="Links" count={element.links.length + (element.url ? 1 : 0)}>
        <Fields>
          <TextField label="Main link (URL)" value={element.url} onCommit={(v) => save({ url: v })} placeholder="https://" />
          <ul className="links">
            {element.links.map((l, i) => (
              <li key={i}>
                <a href={l.url} target="_blank" rel="noreferrer">
                  {l.label || l.url}
                </a>
                <button className="icon edit-only" aria-label="Remove link" title="Remove link" onClick={() => save({ links: element.links.filter((_, j) => j !== i) })}>
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="row edit-only">
            <input placeholder="Label" value={newLink.label} onChange={(e) => setNewLink({ ...newLink, label: e.target.value })} />
            <input placeholder="https://" value={newLink.url} onChange={(e) => setNewLink({ ...newLink, url: e.target.value })} />
            <button
              disabled={!newLink.url.trim()}
              onClick={async () => {
                if (await save({ links: [...element.links, newLink] })) setNewLink({ label: "", url: "" });
              }}
            >
              Add
            </button>
          </div>
        </Fields>
      </Section>
      {!state.readOnly && (
        <Section title="Appearance" count={Object.keys(style).length} testId="sec-style">
          <StylePanel target={element.id} style={style} edge={false} mutate={mutate} />
        </Section>
      )}

      <ConnectionList title="Incoming" rels={incoming} other={(r) => r.sourceId} inside={(r) => r.destinationId} selfId={element.id} state={state} onReveal={p.onReveal} testId="incoming" />
      <ConnectionList title="Outgoing" rels={outgoing} other={(r) => r.destinationId} inside={(r) => r.sourceId} selfId={element.id} state={state} onReveal={p.onReveal} testId="outgoing" />
      <div className="panel-actions">
        {drill && <button onClick={() => p.onOpen(drill)}>Open {element.kind === "softwareSystem" ? "containers" : "components"}</button>}
        {element.kind === "softwareSystem" && <button onClick={() => p.onOpen(`context-${element.id}`)}>Open context</button>}
        {!state.readOnly && (
          <button onClick={() => mutate(() => api.duplicate(element.id))} data-testid="duplicate-element">
            Duplicate
          </button>
        )}
        {(element.kind === "container" || element.kind === "component") && !state.readOnly && !diagram.compare?.removed && !diagram.nodes.find((n) => n.id === element.id)?.ghost && (
          <button onClick={() => p.onMove(element.id)} title={`Move to another ${element.kind === "container" ? "software system" : "container"}`} data-testid="move-element">
            Move to…
          </button>
        )}
        {!state.readOnly && (
          <button
            className="danger"
            data-testid="delete-element"
            onClick={() => {
              void confirmDeleteElement(element, { connections: true }).then((yes) => yes && mutate(() => api.deleteElement(element.id)).then((ok) => ok && p.onSelect(null)));
            }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
