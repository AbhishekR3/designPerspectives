/**
 * Integration credentials (DEC-056): tokens dp itself will use for other services. Values are typed
 * once and never shown again; the list shows a masked hint, scopes and dates. Architects only.
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { confirmDialog } from "../common/dialogs";
import { Icon } from "../common/icons";
import { errorMessage, notify } from "../common/notify";
import { CREDENTIAL_PROVIDERS, type CredentialList, type HubInfo } from "../types";
import { ago } from "./HomePage";

const LABEL: Record<string, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  jira: "Jira",
  "issue-tracker": "Issue tracker",
  observability: "Observability",
  llm: "LLM provider",
  ci: "CI",
  other: "Other",
};

export function CredentialsPage({ hub }: { hub: HubInfo }) {
  const [list, setList] = useState<CredentialList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [rotating, setRotating] = useState<string | null>(null);

  const load = useCallback(() => {
    api.credentials().then(
      (l) => (setList(l), setError(null)),
      (e) => setError(errorMessage(e)),
    );
  }, []);
  useEffect(() => load(), [load]);

  if (!hub.canAdmin) return <p className="page-pad muted">Only an architect can see and manage credentials.</p>;
  if (error) return <p className="page-pad error-text">Could not load: {error}</p>;
  if (!list) return <p className="page-pad muted">Loading…</p>;
  const act = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      notify.success(done);
      load();
      return true;
    } catch (e) {
      notify.error(errorMessage(e));
      return false;
    }
  };

  return (
    <div className="home" data-testid="credentials-page">
      <header className="home-head">
        <div>
          <h1>Credentials</h1>
          <p className="muted">
            Tokens designPerspectives uses to reach other services: a git host, an issue tracker, an observability backend, an LLM. They are never part of the model and never go into git.
          </p>
        </div>
        <span className="grow" />
        <button className="primary" onClick={() => setAdding(true)} data-testid="credential-new">
          <Icon name="plus" size={14} /> Add a credential
        </button>
      </header>

      <p className={list.encryptsNew ? "ok-note" : "warn-note"} data-testid="credentials-encryption">
        <Icon name={list.encryptsNew ? "check" : "warning"} size={14} />
        {list.encryptsNew
          ? `Stored encrypted in ${list.file} (DP_SECRET_KEY is set), readable by the server's user only.`
          : `Stored in ${list.file}, readable by the server's user only, but not encrypted. Start the server with DP_SECRET_KEY set to encrypt new and rotated values.`}
      </p>

      {adding && <CredentialForm onCancel={() => setAdding(false)} onSave={(b) => act(() => api.addCredential(b), `Added ${b.name}.`).then((ok) => ok && setAdding(false))} />}

      {list.credentials.length === 0 ? (
        <p className="muted">No credentials yet. Nothing in designPerspectives uses one so far; they are kept here for the integrations that will.</p>
      ) : (
        <div className="table-wrap">
          <table className="home-table" data-testid="credentials-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Provider</th>
                <th>Value</th>
                <th>Scopes</th>
                <th>Changed</th>
                <th>Last used</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.credentials.map((c) => (
                <tr key={c.name} data-testid={`credential-${c.name}`}>
                  <td>
                    <strong>{c.name}</strong>
                    {c.note && <div className="muted small">{c.note}</div>}
                  </td>
                  <td>{LABEL[c.provider] ?? c.provider}</td>
                  <td>
                    <code>{c.hint}</code> {c.encrypted && <Icon name="check" size={12} title="Encrypted" />}
                    {c.locked && (
                      <span className="pill-badge err" title="Encrypted with another DP_SECRET_KEY: rotate it, or start the server with the right key">
                        locked
                      </span>
                    )}
                  </td>
                  <td className="small">{c.scopes.join(", ") || <span className="muted">—</span>}</td>
                  <td className="muted small nowrap">{ago(c.updated)}</td>
                  <td className="muted small nowrap">{c.lastUsed ? ago(c.lastUsed) : "never"}</td>
                  <td className="nowrap">
                    {rotating === c.name ? (
                      <RotateForm onCancel={() => setRotating(null)} onSave={(v) => act(() => api.rotateCredential(c.name, v), `Rotated ${c.name}.`).then((ok) => ok && setRotating(null))} />
                    ) : (
                      <>
                        <button className="small" onClick={() => setRotating(c.name)} data-testid={`rotate-${c.name}`}>
                          Rotate
                        </button>
                        <button
                          className="small ghost icon"
                          aria-label={`Remove ${c.name}`}
                          title="Remove"
                          onClick={() =>
                            void confirmDialog({
                              title: `Remove ${c.name}?`,
                              message: "The value is deleted from this server. Revoke it at the provider too.",
                              confirmLabel: "Remove",
                              danger: true,
                            }).then((yes) => yes && act(() => api.removeCredential(c.name), `Removed ${c.name}.`))
                          }
                          data-testid={`remove-${c.name}`}
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CredentialForm({ onCancel, onSave }: { onCancel(): void; onSave(b: { name: string; provider: string; scopes: string[]; note: string; value: string }): Promise<unknown> }) {
  const [f, setF] = useState({ name: "", provider: "github", scopes: "", note: "", value: "" });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <form
      className="home-box cred-form"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave({
          ...f,
          name: f.name.trim(),
          scopes: f.scopes
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        });
      }}
      data-testid="credential-form"
    >
      <div className="dec-grid">
        <label className="field">
          <span>Name</span>
          <input autoFocus value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="github-token" data-testid="credential-name" />
        </label>
        <label className="field">
          <span>Provider</span>
          <select value={f.provider} onChange={(e) => set("provider", e.target.value)} data-testid="credential-provider">
            {CREDENTIAL_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {LABEL[p] ?? p}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Scopes (comma-separated)</span>
          <input value={f.scopes} onChange={(e) => set("scopes", e.target.value)} placeholder="repo, read:org" />
        </label>
      </div>
      <label className="field">
        <span>What it is for</span>
        <input value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="Pull request status on linked work" />
      </label>
      <label className="field">
        <span>Value</span>
        <input type="password" autoComplete="off" value={f.value} onChange={(e) => set("value", e.target.value)} data-testid="credential-value" />
        <span className="muted small">Shown once, here. After saving, only the last four characters are shown.</span>
      </label>
      <div className="row end">
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={!f.name.trim() || !f.value.trim()} data-testid="credential-save">
          Save
        </button>
      </div>
    </form>
  );
}

function RotateForm({ onCancel, onSave }: { onCancel(): void; onSave(v: string): Promise<unknown> }) {
  const [v, setV] = useState("");
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) void onSave(v);
      }}
    >
      <input type="password" autoFocus autoComplete="off" value={v} onChange={(e) => setV(e.target.value)} placeholder="New value" aria-label="New value" data-testid="rotate-value" />
      <button type="submit" className="small primary" disabled={!v.trim()}>
        Save
      </button>
      <button type="button" className="small ghost" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}
