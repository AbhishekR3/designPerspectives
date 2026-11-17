import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { CodePaths, NewPlannedFile } from "./CodePickers";
import { Fields, Section } from "./formParts";
import { commonValue, fieldPatches, listChips, listPatches, symbolEditable, tagPatches, technologyEditable, type ElementPatch, type ListChip } from "./multiEdit";
import { StylePanel } from "./StylePanel";
import type { AppState, DiagramNode, ElementSummary, Lens } from "../types";
import type { Common } from "./panelProps";

/** A text field for a value the selected elements may not share: empty with a "Mixed" hint, and saved only after the person typed in it. */
function MultiText({ label, value, mixed, onCommit, testId }: { label: string; value: string; mixed: boolean; onCommit(v: string): void; testId: string }) {
  const [draft, setDraft] = useState(mixed ? "" : value);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    setDraft(mixed ? "" : value);
    setTouched(false);
  }, [value, mixed]);
  const commit = () => {
    if (touched && (mixed || draft !== value)) onCommit(draft);
    setTouched(false);
  };
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="text"
        value={draft}
        placeholder={mixed ? "Mixed" : ""}
        onChange={(e) => (setDraft(e.target.value), setTouched(true))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            (e.target as HTMLElement).blur();
          } else if (e.key === "Escape") {
            setDraft(mixed ? "" : value);
            setTouched(false);
            (e.target as HTMLElement).blur();
          }
        }}
        data-testid={testId}
      />
    </label>
  );
}

/** Chips for a list every selected element may have a part of: on all, or faded with "on 2 of 3" (a click adds it to all). */
function MultiChips({
  label,
  chips,
  suggestions,
  onAdd,
  onRemove,
  testId,
}: {
  label: string;
  chips: ListChip[];
  suggestions: string[];
  onAdd(item: string): void;
  onRemove(item: string): void;
  testId: string;
}) {
  const [text, setText] = useState("");
  const listId = useRef(`multi-${Math.random().toString(36).slice(2)}`).current;
  const add = (t: string) => {
    if (t.trim()) onAdd(t.trim());
    setText("");
  };
  return (
    <div className="field" data-testid={testId}>
      <span>{label}</span>
      <div className="chips">
        {chips.map((c) => {
          const some = c.count < c.total;
          return (
            <span className={`chip${some ? " some" : ""}`} key={c.item} data-testid={`${testId}-chip-${c.item}`}>
              {some ? (
                <button className="link" onClick={() => onAdd(c.item)} title={`On ${c.count} of ${c.total}. Click to add it to all ${c.total}.`} data-testid={`${testId}-addall-${c.item}`}>
                  {c.item}{" "}
                  <span className="muted small">
                    on {c.count} of {c.total}
                  </span>
                </button>
              ) : (
                c.item
              )}
              <button
                className="icon"
                aria-label={`Remove ${c.item} from all`}
                title={some ? `Remove ${c.item} from the ${c.count} that have it` : `Remove ${c.item} from all ${c.total}`}
                onClick={() => onRemove(c.item)}
              >
                ×
              </button>
            </span>
          );
        })}
        <input
          className="chip-input"
          list={listId}
          value={text}
          placeholder={chips.length ? "Add to all…" : "Add a technology…"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(text);
            }
          }}
          onBlur={() => add(text)}
          data-testid={`${testId}-input`}
        />
        <datalist id={listId}>
          {suggestions
            .filter((s) => !chips.some((c) => c.item === s))
            .map((s) => (
              <option key={s} value={s} />
            ))}
        </datalist>
      </div>
    </div>
  );
}

/**
 * The right panel while several boxes are selected: how many, Delete (where deleting is allowed) and, where the version can be
 * changed, the fields every selected object has. A field shows the value they share, or "Mixed"; a change applies to all of them
 * as one edit (one undo step). Fields that some of the selected kinds do not have are left out.
 */
export function MultiPanel({
  state,
  lens,
  ids,
  canDelete,
  canEdit,
  mutate,
  onDelete,
}: {
  state: AppState;
  lens: Lens;
  ids: string[];
  canDelete: boolean;
  /** The shown version and diagram can be changed; the ids passed are the elements (not removed ghosts). */
  canEdit: boolean;
  mutate: Common["mutate"];
  onDelete(): void;
}) {
  const els = ids.map((id) => state.elements.find((e) => e.id === id)).filter((e): e is ElementSummary => !!e);
  const apply = (patches: ElementPatch[]) => (patches.length ? mutate(() => api.updateElements(patches)) : Promise.resolve(true));
  const owner = commonValue(els.map((e) => e.owner));
  const arch = commonValue(els.map((e) => e.archType || "box"));
  const groups = state.tagGroups.filter((g) => !lens.hiddenTagGroups.includes(g.name));
  const withTech = canEdit && lens.visibleSections.includes("technology") && technologyEditable(els);
  const withSymbol = canEdit && symbolEditable(els);
  return (
    <div className="panel-body" data-testid="multi-panel">
      <div className="panel-kind">Selection</div>
      <h2 className="panel-title" data-testid="multi-count">
        {ids.length} objects selected
      </h2>
      <ul className="links">
        {els.map((e) => (
          <li key={e.id}>{e.name}</li>
        ))}
      </ul>
      {canEdit && els.length > 1 && (
        <>
          <h4>Change all {els.length} together</h4>
          <Fields loose>
            <MultiText
              label="Owner"
              value={owner.mixed ? "" : owner.value}
              mixed={owner.mixed}
              onCommit={(v) =>
                void apply(
                  fieldPatches(
                    els.map((e) => ({ id: e.id, value: e.owner })),
                    "owner",
                    v.trim(),
                  ),
                )
              }
              testId="multi-owner"
            />
            {withSymbol && (
              <label className="field">
                <span>Symbol</span>
                <select
                  value={arch.mixed ? "" : arch.value}
                  onChange={(e) =>
                    e.target.value &&
                    void apply(
                      fieldPatches(
                        els.map((x) => ({ id: x.id, value: x.archType || "box" })),
                        "archType",
                        e.target.value,
                      ),
                    )
                  }
                  data-testid="multi-arch"
                >
                  {arch.mixed && (
                    <option value="" disabled>
                      Mixed
                    </option>
                  )}
                  {state.enums.archTypes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {withTech && (
              <MultiChips
                label="Technology"
                chips={listChips(els.map((e) => e.technologies ?? []))}
                suggestions={state.technologies}
                onAdd={(item) =>
                  void apply(
                    listPatches(
                      els.map((e) => ({ id: e.id, list: e.technologies ?? [] })),
                      "technology",
                      { add: item },
                    ),
                  )
                }
                onRemove={(item) =>
                  void apply(
                    listPatches(
                      els.map((e) => ({ id: e.id, list: e.technologies ?? [] })),
                      "technology",
                      { remove: item },
                    ),
                  )
                }
                testId="multi-technology"
              />
            )}
            {groups.length > 0 && (
              <div className="tag-fields">
                <h4>Tags</h4>
                {groups.map((g) => {
                  const v = commonValue(els.map((e) => e.tags[g.name] ?? ""));
                  return (
                    <label className="field inline" key={g.name}>
                      <span>{g.name}</span>
                      <select value={v.mixed ? "__mixed__" : v.value} onChange={(e) => void apply(tagPatches(els, g.name, e.target.value || null))} data-testid={`multi-tag-${g.name}`}>
                        {v.mixed && (
                          <option value="__mixed__" disabled>
                            Mixed
                          </option>
                        )}
                        <option value="">—</option>
                        {g.values.map((x) => (
                          <option key={x.name} value={x.name}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>
            )}
          </Fields>
          {!(technologyEditable(els) && symbolEditable(els)) && (
            <p className="muted small">Technology and Symbol are shown when every selected object can have them: containers and components for Technology, anything but people for Symbol.</p>
          )}
        </>
      )}
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
      <p className="muted small">Files appear as boxes; lines between them are imports found by scanning the code. Double-click a file to open and edit it.</p>
      {!isRel && (
        <p className="muted small" data-testid="code-outside-help">
          Faded boxes are other parts of the model that connect to this one. Each line goes to the file where the call leaves, or arrives. A solid line is a file you set on the relationship, a dashed
          one is guessed from imports, a dotted one ends at this element's own box because no file is known. Click a line and choose "Leaves from file" or "Arrives at file" to set it.
        </p>
      )}
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
  const imports = p.diagram.edges.filter((e) => e.source === node.id && e.id.startsWith("file:")).map((e) => e.target);
  const importedBy = p.diagram.edges.filter((e) => e.target === node.id && e.id.startsWith("file:")).map((e) => e.source);
  const name = (id: string) => p.diagram.nodes.find((n) => n.id === id)?.name ?? id;
  // Relationships to other parts of the model that leave from, or arrive at, this file.
  const calls = p.diagram.edges.filter((e) => !e.id.startsWith("file:") && (e.source === node.id || e.target === node.id));
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
        {calls.length > 0 && (
          <>
            <h4>
              Calls to and from other parts <span className="count">{calls.length}</span>
            </h4>
            <ul data-testid="file-calls">
              {calls.map((e) => (
                <li key={e.id}>
                  {e.source === node.id ? "Leaves to " : "Arrives from "}
                  {name(e.source === node.id ? e.target : e.source)}
                  {e.description ? `: ${e.description}` : ""}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {!p.state.readOnly && (
        <Section title="Appearance">
          <StylePanel target={node.id} style={node.style} edge={false} mutate={p.mutate} />
        </Section>
      )}
    </div>
  );
}
