/**
 * The BMO section of the credentials page (DEC-051, architects only): whether BMO may call a model itself, which one,
 * with which stored key, who may run it, and the limits. Saved to the server's own settings file, outside git.
 * The server checks every field; its answers are shown at the field.
 */

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { errorMessage, notify } from "../common/notify";
import type { BmoProvider, BmoSettingsData, BmoStatus, CredentialInfo, FieldError, Role } from "../types";

const PROVIDER_LABEL: Record<BmoProvider, string> = { anthropic: "Claude API", openai: "OpenAI API", ollama: "Ollama (on a machine you run)" };
const PINNED_HOST: Record<BmoProvider, string> = { anthropic: "api.anthropic.com", openai: "api.openai.com", ollama: "127.0.0.1:11434" };
const ROLES: { id: Role; label: string }[] = [
  { id: "architect", label: "Architects" },
  { id: "engineer", label: "Engineers" },
  { id: "viewer", label: "Viewers" },
];

/** The host a prompt would go to with these settings (the endpoint's, else the provider's own). */
function hostOf(s: BmoSettingsData): string | null {
  if (!s.provider) return null;
  if (s.endpoint && (s.provider === "ollama" || s.allowCustomEndpoint)) {
    try {
      return new URL(s.endpoint).host;
    } catch {
      return s.endpoint;
    }
  }
  return PINNED_HOST[s.provider];
}

/** The field of a server error pointer (`/pricePerMTok`, `/endpoint`, `/projects/x/allowedRoles`). */
const fieldOf = (pointer: string) => pointer.split("/")[1] ?? "";

export function BmoSettings({ credentials }: { credentials: CredentialInfo[] }) {
  const [status, setStatus] = useState<BmoStatus | null>(null);
  const [form, setForm] = useState<BmoSettingsData | null>(null);
  const [saved, setSaved] = useState("");
  const [price, setPrice] = useState({ input: "", output: "" });
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const adopt = useCallback((s: BmoStatus) => {
    setStatus(s);
    if (s.settings) {
      setForm(s.settings);
      setSaved(JSON.stringify(s.settings));
      setPrice({ input: s.settings.pricePerMTok ? String(s.settings.pricePerMTok.input) : "", output: s.settings.pricePerMTok ? String(s.settings.pricePerMTok.output) : "" });
    }
  }, []);
  useEffect(() => {
    api.bmoHub().then(adopt, (e) => setLoadError(errorMessage(e)));
  }, [adopt]);

  if (loadError)
    return (
      <p className="error-text" data-testid="bmo-settings-error">
        Could not load the BMO settings: {loadError}
      </p>
    );
  if (!status) return <p className="muted">Loading the BMO settings…</p>;
  if (!form || !status.canAdmin) {
    return (
      <p className="muted" data-testid="bmo-settings-readonly">
        Only an architect of the whole hub can change the BMO settings. BMO is {status.enabled ? "on" : "off"} here.
      </p>
    );
  }

  const set = <K extends keyof BmoSettingsData>(k: K, v: BmoSettingsData[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const err = (field: string) => errors.filter((e) => fieldOf(e.pointer) === field);
  const Err = ({ field }: { field: string }) => {
    const es = err(field);
    return es.length ? (
      <span className="field-error" role="alert" data-testid={`bmo-error-${field}`}>
        {es.map((e) => e.message).join(" ")}
      </span>
    ) : null;
  };
  const shown = ["enabled", "backend", "provider", "model", "endpoint", "credential", "allowedRoles", "passBudgetTokens", "pricePerMTok"];
  const other = errors.filter((e) => !shown.includes(fieldOf(e.pointer)));
  const direct = form.backend === "direct";
  const provider = form.provider;
  const host = hostOf(form);
  const keys = credentials.filter((c) => c.provider === provider);
  const body = (): BmoSettingsData => {
    const out: BmoSettingsData = { ...form };
    const i = price.input.trim();
    const o = price.output.trim();
    if (i || o) out.pricePerMTok = { input: Number(i || 0), output: Number(o || 0) };
    else delete out.pricePerMTok;
    for (const k of ["model", "endpoint", "credential"] as const) if (typeof out[k] === "string" && !out[k]!.trim()) delete out[k];
    return out;
  };
  const dirty = JSON.stringify(body()) !== saved;
  const toggleRole = (r: Role) => set("allowedRoles", form.allowedRoles.includes(r) ? form.allowedRoles.filter((x) => x !== r) : [...form.allowedRoles, r]);
  const save = async () => {
    setBusy(true);
    try {
      const next = await api.bmoHubSettings(body());
      setErrors([]);
      adopt(next);
      notify.success("Saved the BMO settings.");
    } catch (e) {
      if (e instanceof ApiError && Array.isArray(e.data?.errors)) setErrors(e.data!.errors as FieldError[]);
      else notify.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="home-box bmo-settings"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      data-testid="bmo-settings"
    >
      <div>
        <h2>BMO</h2>
        <p className="muted small">
          BMO is the assistant that explains diagrams, challenges them, proposes decisions and drafts a model from code or a description. It is off until you turn it on. What it makes is always a
          proposal: a draft you review.
        </p>
      </div>
      {status.problem && (
        <p className="warn-note" data-testid="bmo-settings-problem">
          The settings file has a problem, so the defaults are shown: {status.problem}
        </p>
      )}
      <label className="check">
        <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} data-testid="bmo-enabled" />
        Turn BMO on
      </label>
      <Err field="enabled" />

      <fieldset className="field bmo-choice">
        <legend>How BMO works</legend>
        <label className="check">
          <input type="radio" name="bmo-backend" checked={!direct} onChange={() => set("backend", "handoff")} data-testid="bmo-backend-handoff" />
          <span>
            <strong>Handoff.</strong> BMO writes the prompt and files; you run them in your own coding agent and bring the result back. dp sends nothing anywhere.
          </span>
        </label>
        <label className="check">
          <input type="radio" name="bmo-backend" checked={direct} onChange={() => set("backend", "direct")} data-testid="bmo-backend-direct" />
          <span>
            <strong>Direct.</strong> dp calls a model for you, with a key stored on the Credentials page.
          </span>
        </label>
        <Err field="backend" />
      </fieldset>

      {direct && (
        <>
          <div className="bmo-grid">
            <label className="field">
              <span>Provider</span>
              <select
                value={provider ?? ""}
                onChange={(e) => {
                  const v = e.target.value as BmoProvider | "";
                  setForm((f) => {
                    if (!f) return f;
                    const next = { ...f };
                    if (v) next.provider = v;
                    else delete next.provider;
                    delete next.credential;
                    return next;
                  });
                }}
                data-testid="bmo-provider"
              >
                <option value="">Choose a provider…</option>
                {(Object.keys(PROVIDER_LABEL) as BmoProvider[]).map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_LABEL[p]}
                  </option>
                ))}
              </select>
              <Err field="provider" />
            </label>
            <label className="field">
              <span>Model</span>
              <input
                value={form.model ?? ""}
                onChange={(e) => set("model", e.target.value)}
                placeholder={provider === "ollama" ? "A model you have pulled" : "Leave empty for the provider's default"}
                data-testid="bmo-model"
              />
              <span className="muted small">Letters, digits and . _ : / @ - only.</span>
              <Err field="model" />
            </label>
          </div>
          <label className="field">
            <span>Endpoint</span>
            <input
              value={form.endpoint ?? ""}
              onChange={(e) => set("endpoint", e.target.value)}
              placeholder={provider ? `Leave empty to use ${PINNED_HOST[provider]}` : "Choose a provider first"}
              disabled={!provider}
              data-testid="bmo-endpoint"
            />
            <span className="muted small">
              The Claude API and the OpenAI API go to their own hosts. Another address is allowed for Ollama, or when you also allow a custom endpoint below. It must start with https://, or http://
              for this computer; no user name, query or fragment. Link-local and cloud-metadata addresses (169.254.x.x, fe80::) are refused.
            </span>
            <span className="muted small" data-testid="bmo-endpoint-note">
              The endpoint is contacted by the server that runs dp, not by your browser: “127.0.0.1” means the server’s own computer, and the server can reach whatever machines it can reach.
            </span>
            <Err field="endpoint" />
          </label>
          {provider && provider !== "ollama" && (
            <label className="check">
              <input type="checkbox" checked={form.allowCustomEndpoint === true} onChange={(e) => set("allowCustomEndpoint", e.target.checked)} data-testid="bmo-custom-endpoint" />
              Allow a custom endpoint (your own gateway or proxy)
            </label>
          )}
          {provider === "ollama" ? (
            <p className="muted small">Ollama needs no key.</p>
          ) : (
            <label className="field">
              <span>Key to use</span>
              <select value={form.credential ?? ""} onChange={(e) => set("credential", e.target.value)} disabled={!provider} data-testid="bmo-credential">
                <option value="">The first key stored for this provider</option>
                {keys.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.hint})
                  </option>
                ))}
              </select>
              {provider && keys.length === 0 && (
                <span className="muted small">No key is stored for this provider yet. Add one in the table above, choosing the provider “{PROVIDER_LABEL[provider]}”.</span>
              )}
              <Err field="credential" />
            </label>
          )}
          <p className="bmo-direct-statement" data-testid="bmo-direct-statement">
            <strong>What “direct” means:</strong> dp sends the prompt and the listed file excerpts to {host ?? "the provider you choose"} with your key. You see the files and the prompt before
            anything is sent, and each run is logged on this server.
          </p>
        </>
      )}

      <fieldset className="field bmo-choice">
        <legend>Who may run BMO</legend>
        <div className="row wrap">
          {ROLES.map((r) => (
            <label className="check" key={r.id}>
              <input type="checkbox" checked={form.allowedRoles.includes(r.id)} onChange={() => toggleRole(r.id)} data-testid={`bmo-role-${r.id}`} />
              {r.label}
            </label>
          ))}
        </div>
        <span className="muted small">
          Explain, challenge and the pull request summary change nothing, so every allowed role can run them. Tasks that make a draft also need the right to create one, so viewers cannot run those.
        </span>
        <Err field="allowedRoles" />
      </fieldset>

      <div className="bmo-grid">
        <label className="field">
          <span>Most BMO reads in one pass (tokens)</span>
          <input type="number" min={1000} max={2000000} step={1000} value={form.passBudgetTokens} onChange={(e) => set("passBudgetTokens", Number(e.target.value))} data-testid="bmo-budget" />
          <span className="muted small">1,000 to 2,000,000. Files that do not fit are listed as left out.</span>
          <Err field="passBudgetTokens" />
        </label>
        <div className="field">
          <span>Price per million tokens (optional)</span>
          <div className="row">
            <input
              type="number"
              min={0}
              step="any"
              value={price.input}
              onChange={(e) => setPrice((p) => ({ ...p, input: e.target.value }))}
              placeholder="Input"
              aria-label="Price per million input tokens"
              data-testid="bmo-price-in"
            />
            <input
              type="number"
              min={0}
              step="any"
              value={price.output}
              onChange={(e) => setPrice((p) => ({ ...p, output: e.target.value }))}
              placeholder="Output"
              aria-label="Price per million output tokens"
              data-testid="bmo-price-out"
            />
          </div>
          <span className="muted small">In your own currency. Only used to estimate a cost; no prices are built in.</span>
          <Err field="pricePerMTok" />
        </div>
      </div>

      {other.length > 0 && (
        <p className="error-text small" role="alert" data-testid="bmo-error-other">
          {other.map((e) => `${e.pointer || "/"}: ${e.message}`).join("; ")}
        </p>
      )}
      <div className="row">
        <button type="submit" className="primary" disabled={!dirty || busy} aria-busy={busy} data-testid="bmo-save">
          Save
        </button>
        {!dirty && <span className="muted small">Saved</span>}
      </div>
    </form>
  );
}
