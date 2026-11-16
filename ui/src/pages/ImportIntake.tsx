/**
 * "About this system" on the Import page (DEC-051): the answers the code cannot give, saved to the intake.
 * Lists are typed one per line. What the form does not show (known services, scan limits) is kept as it is.
 */

import { useState } from "react";
import { api, ApiError } from "../api";
import { errorMessage, notify } from "../common/notify";
import type { Intake, IntakeDepth, IntakeError } from "../types";

const DEPTHS: { id: IntakeDepth; label: string }[] = [
  { id: "c4", label: "All the way down to code (C4)" },
  { id: "c3", label: "Components (C3)" },
  { id: "c2", label: "Containers (C2)" },
  { id: "c1", label: "System context (C1)" },
];

interface Form {
  name: string;
  purpose: string;
  audience: string;
  include: string;
  exclude: string;
  otherRepos: string;
  depth: IntakeDepth;
  ownership: string;
  runtime: string;
  glossary: { term: string; means: string }[];
  mustNotOpen: string;
}

const text = (xs: string[]) => xs.join("\n");
const lines = (t: string) =>
  t
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

const toForm = (i: Intake): Form => ({
  name: i.system.name,
  purpose: i.system.purpose,
  audience: i.audience,
  include: text(i.scope.include),
  exclude: text(i.scope.exclude),
  otherRepos: text(i.scope.otherRepos),
  depth: i.depth,
  ownership: i.ownership,
  runtime: i.runtime,
  glossary: i.glossary.map((g) => ({ ...g })),
  mustNotOpen: text(i.mustNotOpen),
});

const toIntake = (base: Intake, f: Form): Intake => ({
  ...base,
  system: { name: f.name.trim(), purpose: f.purpose.trim() },
  audience: f.audience.trim(),
  scope: { include: lines(f.include), exclude: lines(f.exclude), otherRepos: lines(f.otherRepos) },
  depth: f.depth,
  ownership: f.ownership.trim(),
  runtime: f.runtime.trim(),
  glossary: f.glossary.filter((g) => g.term.trim() || g.means.trim()).map((g) => ({ term: g.term.trim(), means: g.means.trim() })),
  mustNotOpen: lines(f.mustNotOpen),
});

interface Props {
  intake: Intake;
  /** Problems found in the stored intake (a file edited by hand). */
  storedErrors: IntakeError[];
  disabled: boolean;
  onSaved(): void;
}

export function ImportIntake({ intake, storedErrors, disabled, onSaved }: Props) {
  const [form, setForm] = useState<Form>(() => toForm(intake));
  const [saved, setSaved] = useState(() => JSON.stringify(toForm(intake)));
  const [errors, setErrors] = useState<IntakeError[]>(storedErrors);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = JSON.stringify(form) !== saved;
  /** The errors of a field (its path, or an entry in it) as text lines. */
  const at = (...prefixes: string[]) => errors.filter((e) => prefixes.some((p) => e.path === p || e.path.startsWith(`${p}[`) || e.path.startsWith(`${p}.`)));
  const Err = ({ prefix, id }: { prefix: string; id: string }) => {
    const es = at(prefix);
    return es.length ? (
      <span className="field-error" role="alert" data-testid={`intake-error-${id}`}>
        {es.map((e) => (e.path !== prefix ? `${e.path.slice(prefix.length)} ${e.message}` : e.message)).join("; ")}
      </span>
    ) : null;
  };
  const rest = errors.filter(
    (e) =>
      !["system.name", "system.purpose", "audience", "scope", "depth", "ownership", "runtime", "glossary", "mustNotOpen"].some(
        (p) => e.path === p || e.path.startsWith(`${p}[`) || e.path.startsWith(`${p}.`),
      ),
  );

  const save = async () => {
    setBusy(true);
    try {
      await api.importIntake(toIntake(intake, form));
      setErrors([]);
      setSaved(JSON.stringify(form));
      notify.success("Saved the answers about this system.");
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && Array.isArray(e.data?.errors)) setErrors(e.data!.errors as IntakeError[]);
      else notify.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const box = (label: string, id: string, prefix: string, value: string, onChange: (v: string) => void, opts: { rows?: number; placeholder?: string; hint?: string } = {}) => (
    <label className="field">
      <span>{label}</span>
      <textarea
        rows={opts.rows ?? 2}
        value={value}
        placeholder={opts.placeholder}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-invalid={at(prefix).length ? true : undefined}
        data-testid={`intake-${id}`}
      />
      {opts.hint && <span className="muted small">{opts.hint}</span>}
      <Err prefix={prefix} id={id} />
    </label>
  );

  return (
    <form
      className="intake-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      data-testid="intake-form"
    >
      {rest.length > 0 && (
        <p className="error-text small" role="alert" data-testid="intake-error-other">
          {rest.map((e) => (e.path ? `${e.path}: ${e.message}` : e.message)).join("; ")}
        </p>
      )}
      <div className="intake-grid">
        <label className="field">
          <span>System name</span>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} disabled={disabled} aria-invalid={at("system.name").length ? true : undefined} data-testid="intake-name" />
          <Err prefix="system.name" id="name" />
        </label>
        <label className="field">
          <span>Who are the diagrams for?</span>
          <input value={form.audience} onChange={(e) => set("audience", e.target.value)} disabled={disabled} placeholder="e.g. new engineers, the platform team" data-testid="intake-audience" />
          <Err prefix="audience" id="audience" />
        </label>
        <label className="field">
          <span>How deep should the model go?</span>
          <select value={form.depth} onChange={(e) => set("depth", e.target.value as IntakeDepth)} disabled={disabled} data-testid="intake-depth">
            {DEPTHS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
          <Err prefix="depth" id="depth" />
        </label>
      </div>
      {box("What is it for?", "purpose", "system.purpose", form.purpose, (v) => set("purpose", v), { placeholder: "One or two sentences." })}
      <div className="intake-grid">
        {box("Folders to include", "include", "scope.include", form.include, (v) => set("include", v), { hint: "One per line. Leave empty for the whole repository." })}
        {box("Folders to leave out", "exclude", "scope.exclude", form.exclude, (v) => set("exclude", v), { hint: "One per line: generated, old or retired code." })}
        {box("Other repositories of this system", "other-repos", "scope.otherRepos", form.otherRepos, (v) => set("otherRepos", v), { hint: "One per line. BMO cannot see them." })}
      </div>
      <div className="intake-grid">
        {box("Who owns what", "ownership", "ownership", form.ownership, (v) => set("ownership", v), { placeholder: "Teams, other teams' systems, vendors." })}
        {box("Where it runs", "runtime", "runtime", form.runtime, (v) => set("runtime", v), { placeholder: "Cloud or on premises, environments, where the infrastructure code lives." })}
      </div>

      <fieldset className="field intake-glossary" disabled={disabled}>
        <legend>Your words for things (glossary)</legend>
        {form.glossary.map((g, i) => (
          <div className="row" key={i}>
            <input
              value={g.term}
              placeholder="Term"
              aria-label={`Glossary term ${i + 1}`}
              onChange={(e) =>
                set(
                  "glossary",
                  form.glossary.map((x, j) => (j === i ? { ...x, term: e.target.value } : x)),
                )
              }
              data-testid={`intake-term-${i}`}
            />
            <input
              value={g.means}
              placeholder="Means"
              aria-label={`Glossary meaning ${i + 1}`}
              onChange={(e) =>
                set(
                  "glossary",
                  form.glossary.map((x, j) => (j === i ? { ...x, means: e.target.value } : x)),
                )
              }
              data-testid={`intake-means-${i}`}
            />
            <button
              type="button"
              className="ghost small"
              onClick={() =>
                set(
                  "glossary",
                  form.glossary.filter((_, j) => j !== i),
                )
              }
              aria-label={`Remove glossary row ${i + 1}`}
              data-testid={`intake-term-remove-${i}`}
            >
              Remove
            </button>
          </div>
        ))}
        <div>
          <button type="button" className="small" onClick={() => set("glossary", [...form.glossary, { term: "", means: "" }])} data-testid="intake-term-add">
            Add a row
          </button>
        </div>
        <Err prefix="glossary" id="glossary" />
      </fieldset>

      {box("Files and folders BMO and the scan must not open", "must-not-open", "mustNotOpen", form.mustNotOpen, (v) => set("mustNotOpen", v), {
        hint: "One path or pattern per line, for example .env or secrets/**. Names that look secret are never sent anyway.",
      })}

      <div className="row">
        <button type="submit" className="primary" disabled={disabled || !dirty || busy} aria-busy={busy} data-testid="intake-save">
          Save
        </button>
        {!dirty && !disabled && <span className="muted small">Saved</span>}
      </div>
    </form>
  );
}
