import { useState } from "react";
import { api } from "../api";
import { Modal, useBusy } from "./fields";
import { bandRange } from "../overlays";
import { LEVELS, LEVEL_LABEL, SECTIONS, SECTION_LABEL, type CharacteristicDef, type CostSettings, type Lens, type Level, type Section, type TagGroup } from "../types";
import { confirmDialog } from "../common/dialogs";

// Palette chosen so neighbouring values differ in lightness as well as hue.
const PALETTE = ["#d62728", "#ff7f0e", "#2ca02c", "#1f77b4", "#9467bd", "#8c564b", "#e377c2", "#17becf"];

type Mutate = (fn: () => Promise<unknown>) => Promise<boolean>;

export function TagGroupEditor({ group, onClose, mutate }: { group: TagGroup | null; onClose(): void; mutate: Mutate }) {
  const [name, setName] = useState(group?.name ?? "");
  const [values, setValues] = useState(group ? group.values.map((v) => ({ ...v, previousName: v.name })) : [{ name: "", color: PALETTE[0], previousName: null as string | null }]);
  const set = (i: number, patch: object) => setValues(values.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const [busy, guard] = useBusy();
  const save = () =>
    guard(async () => {
      const body = { name, values: values.filter((v) => v.name.trim()) };
      const ok = await mutate(() => (group ? api.updateTagGroup(group.name, body) : api.createTagGroup(body)));
      if (ok) onClose();
    });
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
          <button className="icon" onClick={() => setValues(values.filter((_, j) => j !== i))} aria-label="Remove value" title="Remove value">
            ×
          </button>
        </div>
      ))}
      <button data-testid="tg-add-value" onClick={() => setValues([...values, { name: "", color: PALETTE[values.length % PALETTE.length], previousName: null }])}>
        Add value
      </button>
      {group && <p className="muted small">Removing a value clears it from every object that has it.</p>}
      <div className="modal-actions">
        <button onClick={onClose}>Cancel</button>
        <button className="primary" onClick={save} disabled={!name.trim()} aria-busy={busy} data-testid="tg-save">
          Save
        </button>
      </div>
    </Modal>
  );
}

export function LensEditor({
  lens,
  tagGroups,
  characteristics,
  onClose,
  mutate,
  onSaved,
}: {
  lens: Lens | null;
  tagGroups: TagGroup[];
  characteristics: CharacteristicDef[];
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
  const [busy, guard] = useBusy();
  const save = () =>
    guard(async () => {
      let id = lens && !readOnly ? lens.id : "";
      const ok = await mutate(async () => {
        if (lens && !readOnly) await api.updateLens(lens.id, draft);
        else id = (await api.createLens(draft)).id;
      });
      if (ok) {
        onSaved(id);
        onClose();
      }
    });
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
        <select value={draft.defaultOverlay ?? ""} onChange={(e) => setDraft({ ...draft, defaultOverlay: e.target.value || null })} data-testid="lens-overlay">
          <option value="">None</option>
          <optgroup label="Tag groups">
            {tagGroups.map((g) => (
              <option key={g.name} value={g.name}>
                {g.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Characteristics">
            {characteristics.map((c) => (
              <option key={c.name} value={`@char:${c.name}`}>
                {c.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Linked work">
            <option value="@work:all">All open work</option>
            <option value="@work:security">Security issues</option>
            <option value="@work:pr">Pull requests</option>
            <option value="@work:backlog">Backlog</option>
            <option value="@work:update">Required updates</option>
          </optgroup>
          <option value="@cost">Cost</option>
          <option value="@tech">Technology</option>
        </select>
      </label>
      {tagGroups.length > 0 && (
        <>
          <h4>Hidden tag groups</h4>
          <div className="row wrap">
            {tagGroups.map((g) => (
              <label className="check" key={g.name}>
                <input type="checkbox" checked={draft.hiddenTagGroups.includes(g.name)} onChange={() => setDraft({ ...draft, hiddenTagGroups: toggle(draft.hiddenTagGroups, g.name) })} />
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
              if ((await confirmDialog({ title: `Delete the lens "${lens.name}"?`, confirmLabel: "Delete", danger: true })) && (await mutate(() => api.deleteLens(lens.id)))) {
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
        <button className="primary" onClick={save} disabled={!draft.name.trim() || draft.visibleLevels.length === 0} aria-busy={busy} data-testid="lens-save">
          {readOnly ? "Save copy" : "Save"}
        </button>
      </div>
    </Modal>
  );
}

/** The list of architecture characteristics objects can be rated on. */
export function CharacteristicsEditor({ items, onClose, mutate }: { items: CharacteristicDef[]; onClose(): void; mutate: Mutate }) {
  const [rows, setRows] = useState(items.map((c) => ({ ...c, previousName: c.name as string | null })));
  const set = (i: number, patch: object) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const [busy, guard] = useBusy();
  const save = () =>
    guard(async () => {
      if (await mutate(() => api.setCharacteristics(rows.filter((r) => r.name.trim())))) onClose();
    });
  return (
    <Modal title="Architecture characteristics" onClose={onClose}>
      <p className="muted small">
        Objects are rated 1–5 on these (1: weak, 5: one of its strongest features), the scale Richards &amp; Ford use for architecture styles. Renaming keeps existing ratings; removing one deletes its
        ratings.
      </p>
      {rows.map((r, i) => (
        <div className="rowed" key={i}>
          <div className="stack">
            <input value={r.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Name, e.g. Observability" data-testid={`char-name-${i}`} />
            <input value={r.description} onChange={(e) => set(i, { description: e.target.value })} placeholder="What it means here (optional)" className="small" />
          </div>
          <button className="icon" aria-label="Remove" title="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      <button onClick={() => setRows([...rows, { name: "", description: "", previousName: null }])} data-testid="char-add">
        Add characteristic
      </button>
      <div className="modal-actions">
        <button onClick={onClose}>Cancel</button>
        <button className="primary" onClick={save} aria-busy={busy} data-testid="char-save">
          Save
        </button>
      </div>
    </Modal>
  );
}

/** Currency and the monthly-cost bands used to colour objects. */
export function CostSettingsEditor({ settings, onClose, mutate }: { settings: CostSettings; onClose(): void; mutate: Mutate }) {
  const [draft, setDraft] = useState<CostSettings>(structuredClone(settings));
  const setBand = (i: number, patch: object) => setDraft({ ...draft, bands: draft.bands.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const [busy, guard] = useBusy();
  const save = () =>
    guard(async () => {
      if (await mutate(() => api.setCostSettings(draft))) onClose();
    });
  return (
    <Modal title="Cost settings" onClose={onClose}>
      <label className="field">
        <span>Currency (ISO code, e.g. USD, EUR, GBP)</span>
        <input value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} maxLength={3} data-testid="cost-currency" />
      </label>
      <h4>Bands by monthly total</h4>
      <p className="muted small">An object's total includes everything inside it. Each band's limit is its highest amount; the last band has no limit.</p>
      {draft.bands.map((b, i) => (
        <div className="row" key={i}>
          <input type="color" value={b.color} onChange={(e) => setBand(i, { color: e.target.value })} aria-label="Colour" />
          <input value={b.name} onChange={(e) => setBand(i, { name: e.target.value })} placeholder="Band name" />
          {i < draft.bands.length - 1 ? (
            <input type="number" min={0} value={b.max ?? 0} onChange={(e) => setBand(i, { max: Number(e.target.value) })} aria-label="Up to (monthly)" style={{ width: 100 }} />
          ) : (
            <span className="muted small" style={{ width: 100 }}>
              no limit
            </span>
          )}
          <span className="muted small" style={{ width: 110 }}>
            {bandRange(i, draft)}
          </span>
          <button
            className="icon"
            aria-label="Remove band"
            title="Remove band"
            disabled={draft.bands.length <= 1}
            onClick={() => {
              const bands = draft.bands.filter((_, j) => j !== i);
              bands[bands.length - 1] = { ...bands[bands.length - 1], max: null };
              setDraft({ ...draft, bands });
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={() => {
          const bands = [...draft.bands];
          const last = bands[bands.length - 1];
          const prevMax = bands.length > 1 ? (bands[bands.length - 2].max ?? 0) : 0;
          bands[bands.length - 1] = { ...last, max: prevMax ? prevMax * 2 : 100 };
          bands.push({ name: "New band", max: null, color: "#a855f7" });
          setDraft({ ...draft, bands });
        }}
      >
        Add band
      </button>
      <div className="modal-actions">
        <button onClick={onClose}>Cancel</button>
        <button className="primary" onClick={save} aria-busy={busy} data-testid="cost-save">
          Save
        </button>
      </div>
    </Modal>
  );
}
