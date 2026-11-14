import { useState } from "react";
import { api } from "./api";
import { Modal } from "./fields";
import { LEVELS, LEVEL_LABEL, SECTIONS, SECTION_LABEL, type Diagram, type Lens, type Level, type Section, type TagGroup } from "./types";

// Palette chosen so neighbouring values differ in lightness as well as hue.
const PALETTE = ["#d62728", "#ff7f0e", "#2ca02c", "#1f77b4", "#9467bd", "#8c564b", "#e377c2", "#17becf"];

type Mutate = (fn: () => Promise<unknown>) => Promise<boolean>;

export function TagGroupEditor({ group, onClose, mutate }: { group: TagGroup | null; onClose(): void; mutate: Mutate }) {
  const [name, setName] = useState(group?.name ?? "");
  const [values, setValues] = useState(
    group ? group.values.map((v) => ({ ...v, previousName: v.name })) : [{ name: "", color: PALETTE[0], previousName: null as string | null }],
  );
  const set = (i: number, patch: object) => setValues(values.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const save = async () => {
    const body = { name, values: values.filter((v) => v.name.trim()) };
    const ok = await mutate(() => (group ? api.updateTagGroup(group.name, body) : api.createTagGroup(body)));
    if (ok) onClose();
  };
  return (
    <Modal title={group ? `Edit tag group` : "New tag group"} onClose={onClose}>
      <label className="field">
        <span>Group name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Risk" data-testid="tg-name" autoFocus />
      </label>
      <h4>Values</h4>
      <p className="muted small">Each value has a colour; diagrams also print the value as text, so colour is never the only signal.</p>
      {values.map((v, i) => (
        <div className="row" key={i}>
          <input type="color" value={v.color} onChange={(e) => set(i, { color: e.target.value })} aria-label="Colour" />
          <input value={v.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Value" data-testid={`tg-value-${i}`} />
          <button className="icon" onClick={() => setValues(values.filter((_, j) => j !== i))} aria-label="Remove value">
            ×
          </button>
        </div>
      ))}
      <button
        data-testid="tg-add-value"
        onClick={() => setValues([...values, { name: "", color: PALETTE[values.length % PALETTE.length], previousName: null }])}
      >
        Add value
      </button>
      {group && <p className="muted small">Removing a value clears it from every object that has it.</p>}
      <div className="modal-actions">
        <button onClick={onClose}>Cancel</button>
        <button className="primary" onClick={save} disabled={!name.trim()} data-testid="tg-save">
          Save
        </button>
      </div>
    </Modal>
  );
}

export function LensEditor({
  lens,
  tagGroups,
  onClose,
  mutate,
  onSaved,
}: {
  lens: Lens | null;
  tagGroups: TagGroup[];
  onClose(): void;
  mutate: Mutate;
  onSaved(id: string): void;
}) {
  const readOnly = !!lens?.builtin;
  const [draft, setDraft] = useState<Omit<Lens, "id" | "builtin">>(
    lens
      ? { ...lens, name: readOnly ? `${lens.name} copy` : lens.name }
      : {
          name: "",
          visibleLevels: [...LEVELS],
          defaultOverlay: null,
          hiddenTagGroups: [],
          visibleSections: [...SECTIONS],
          showTechnology: true,
          showDescriptions: true,
        },
  );
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const save = async () => {
    let id = lens && !readOnly ? lens.id : "";
    const ok = await mutate(async () => {
      if (lens && !readOnly) await api.updateLens(lens.id, draft);
      else id = (await api.createLens(draft)).id;
    });
    if (ok) {
      onSaved(id);
      onClose();
    }
  };
  return (
    <Modal title={readOnly ? `Duplicate "${lens!.name}"` : lens ? "Edit lens" : "New lens"} onClose={onClose}>
      {readOnly && <p className="muted small">Built-in lenses cannot be changed. Saving creates your own copy.</p>}
      <label className="field">
        <span>Lens name</span>
        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} data-testid="lens-name" autoFocus />
      </label>
      <h4>Levels shown in the diagram list (C1 landscape/context, C2 container, C3 component, C4 code)</h4>
      <div className="row wrap">
        {LEVELS.map((l: Level) => (
          <label className="check" key={l}>
            <input
              type="checkbox"
              checked={draft.visibleLevels.includes(l)}
              onChange={() => setDraft({ ...draft, visibleLevels: LEVELS.filter((x) => toggle(draft.visibleLevels, l).includes(x)) })}
              data-testid={`lens-level-${l}`}
            />
            {LEVEL_LABEL[l]}
          </label>
        ))}
      </div>
      <label className="field">
        <span>Overlay turned on by default</span>
        <select
          value={draft.defaultOverlay ?? ""}
          onChange={(e) => setDraft({ ...draft, defaultOverlay: e.target.value || null })}
          data-testid="lens-overlay"
        >
          <option value="">None</option>
          {tagGroups.map((g) => (
            <option key={g.name} value={g.name}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      {tagGroups.length > 0 && (
        <>
          <h4>Hidden tag groups</h4>
          <div className="row wrap">
            {tagGroups.map((g) => (
              <label className="check" key={g.name}>
                <input
                  type="checkbox"
                  checked={draft.hiddenTagGroups.includes(g.name)}
                  onChange={() => setDraft({ ...draft, hiddenTagGroups: toggle(draft.hiddenTagGroups, g.name) })}
                />
                {g.name}
              </label>
            ))}
          </div>
        </>
      )}
      <h4>Sections shown for each object</h4>
      <div className="row wrap">
        {SECTIONS.map((sec: Section) => (
          <label className="check" key={sec}>
            <input
              type="checkbox"
              checked={draft.visibleSections.includes(sec)}
              onChange={() => setDraft({ ...draft, visibleSections: SECTIONS.filter((x) => toggle(draft.visibleSections, sec).includes(x)) })}
              data-testid={`lens-section-${sec}`}
            />
            {SECTION_LABEL[sec]}
          </label>
        ))}
      </div>
      <p className="muted small">Also controls which badges (notes, tradeoffs, usage, sensitive, code) appear on boxes.</p>
      <h4>On each box</h4>
      <label className="check">
        <input type="checkbox" checked={draft.showTechnology} onChange={(e) => setDraft({ ...draft, showTechnology: e.target.checked })} />
        Show type and technology
      </label>
      <label className="check">
        <input type="checkbox" checked={draft.showDescriptions} onChange={(e) => setDraft({ ...draft, showDescriptions: e.target.checked })} />
        Show descriptions
      </label>
      <p className="muted small">A lens sets defaults for an audience. It does not restrict access: every diagram stays reachable.</p>
      <div className="modal-actions">
        {lens && !readOnly && (
          <button
            className="danger"
            onClick={async () => {
              if (window.confirm(`Delete the lens "${lens.name}"?`) && (await mutate(() => api.deleteLens(lens.id)))) {
                onSaved("engineer");
                onClose();
              }
            }}
          >
            Delete lens
          </button>
        )}
        <span className="spacer" />
        <button onClick={onClose}>Cancel</button>
        <button className="primary" onClick={save} disabled={!draft.name.trim() || draft.visibleLevels.length === 0} data-testid="lens-save">
          {readOnly ? "Save copy" : "Save"}
        </button>
      </div>
    </Modal>
  );
}

export function Legend({ group, diagram }: { group: TagGroup; diagram: Diagram }) {
  const counts = new Map<string, number>();
  let none = 0;
  for (const n of diagram.nodes) {
    const v = n.tags[group.name];
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    else none++;
  }
  return (
    <div className="legend" data-testid="legend">
      <div className="legend-title">{group.name}</div>
      {group.values.map((v) => (
        <div className="legend-row" key={v.name}>
          <span className="swatch" style={{ background: v.color }} />
          <span>{v.name}</span>
          <span className="count">{counts.get(v.name) ?? 0}</span>
        </div>
      ))}
      <div className="legend-row">
        <span className="swatch none" />
        <span>No value</span>
        <span className="count">{none}</span>
      </div>
    </div>
  );
}
