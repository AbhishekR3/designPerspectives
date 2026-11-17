/**
 * Integration credentials (DEC-056): tokens dp itself will use for other services. Values are typed
 * once and never shown again; the list shows a masked hint, scopes and dates. Architects only.
 */

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { confirmDialog } from "../common/dialogs";
import { Icon } from "../common/icons";
import { errorMessage, notify } from "../common/notify";
import { CREDENTIAL_PROVIDERS, WORK_TOOLS, WORK_TOOL_LABEL, type CredentialList, type HubInfo, type IntegrationsSettings, type WorkConnection, type WorkToolId } from "../types";
import { ago } from "./HomePage";
import { BmoSettings } from "./BmoSettings";

const LABEL: Record<string, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  jira: "Jira",
  sonarqube: "SonarQube",
  "issue-tracker": "Issue tracker",
  observability: "Observability",
  llm: "LLM provider",
  anthropic: "Claude API",
  openai: "OpenAI API",
  ollama: "Ollama",
  ci: "CI",
  other: "Other",
};

export function CredentialsPage({ hub }: { hub: HubInfo }) {
  const [list, setList] = useState<CredentialList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [rotating, setRotating] = useState<string | null>(null);

  const load = useCallback(() => {
    // Only an architect may ask (the server refuses anyone else).
    if (!hub.canAdmin) return;
    api.credentials().then(
      (l) => (setList(l), setError(null)),
      (e) => setError(errorMessage(e)),
    );
  }, [hub.canAdmin]);
  useEffect(() => load(), [load]);

  if (!hub.canAdmin) return <p className="page-pad muted">Only an architect can see and manage credentials.</p>;
  if (error && !list)
    return (
      <p className="page-pad error-text">
        Could not load: {error}{" "}
        <button onClick={() => load()} data-testid="credentials-retry">
          Retry
        </button>
      </p>
    );
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
        <p className="muted">No credentials yet. BMO's direct backend uses one (Claude API, OpenAI API or Ollama); the other integrations will.</p>
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

      <ToolConnections credentials={list.credentials.map((c) => c.name)} />

      <BmoSettings credentials={list.credentials} />
    </div>
  );
}

function CredentialForm({ onCancel, onSave }: { onCancel(): void; onSave(b: { name: string; provider: string; scopes: string[]; note: string; value: string }): Promise<unknown> }) {
  const [f, setF] = useState({ name: "", provider: "github", scopes: "", note: "", value: "" });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  // One save at a time: a second Enter or click while the first is on its way would store the credential twice (or fail as a duplicate).
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="home-box cred-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        void onSave({
          ...f,
          name: f.name.trim(),
          scopes: f.scopes
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }).finally(() => setBusy(false));
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
        <button type="submit" className="primary" disabled={busy || !f.name.trim() || !f.value.trim()} aria-busy={busy} data-testid="credential-save">
          Save
        </button>
      </div>
    </form>
  );
}

function RotateForm({ onCancel, onSave }: { onCancel(): void; onSave(v: string): Promise<unknown> }) {
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.trim() || busy) return;
        setBusy(true);
        void onSave(v).finally(() => setBusy(false));
      }}
    >
      <input type="password" autoFocus autoComplete="off" value={v} onChange={(e) => setV(e.target.value)} placeholder="New value" aria-label="New value" data-testid="rotate-value" />
      <button type="submit" className="small primary" disabled={busy || !v.trim()} aria-busy={busy}>
        Save
      </button>
      <button type="button" className="small ghost" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}

/** Where linked work gets its status from (DEC-085): the tools dp ships with, and the ones an architect adds. */
function ToolConnections({ credentials }: { credentials: string[] }) {
  const [settings, setSettings] = useState<IntegrationsSettings | null>(null);
  const [rows, setRows] = useState<WorkConnection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const adopt = (s: IntegrationsSettings) => {
    setSettings(s);
    setRows(s.connections);
    setError(null);
  };
  useEffect(() => {
    api.integrations().then(adopt, (e) => {
      // A server without the tool connections shows nothing here.
      if (e instanceof ApiError && e.status === 404) setUnavailable(true);
      else setError(errorMessage(e));
    });
  }, []);
  if (unavailable) return null;
  const dirty = !!settings && JSON.stringify(rows) !== JSON.stringify(settings.connections);
  const set = (i: number, patch: Partial<WorkConnection>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const add = () => setRows((r) => [...r, { id: `connection-${r.length + 1}`, tool: "gitlab", baseUrl: "https://" }]);
  const save = async () => {
    setBusy(true);
    try {
      // An empty credential or the default auth is not stored.
      adopt(
        await api.setIntegrations(
          rows.map((c) => ({
            id: c.id.trim(),
            tool: c.tool,
            baseUrl: c.baseUrl.trim(),
            ...(c.credential ? { credential: c.credential } : {}),
            ...(c.auth === "basic" ? { auth: "basic" as const } : {}),
          })),
        ),
      );
      notify.success("Saved the tool connections.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="home-box tool-connections" data-testid="tool-connections">
      <h2>Tool connections</h2>
      <p className="muted small">
        Where linked work gets its status: GitHub, GitLab, SonarQube and Jira. A link is read by the connection whose address it starts with, with the stored credential named here (none: public data
        only).
        {settings && ` Saved in ${settings.file}.`}
      </p>
      {error && (
        <p className="error-text" data-testid="connections-error">
          {error}
        </p>
      )}
      {settings && (
        <div className="table-wrap">
          <table className="home-table" data-testid="connections-table">
            <thead>
              <tr>
                <th>Tool</th>
                <th>ID</th>
                <th>Address</th>
                <th>Credential</th>
                <th>Sent as</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {settings.builtIn.map((b) => (
                <tr key={b.id} data-testid={`connection-${b.id}`}>
                  <td>{WORK_TOOL_LABEL[b.tool]}</td>
                  <td>
                    <code>{b.id}</code>
                  </td>
                  <td>
                    <code>{b.base}</code>
                  </td>
                  <td colSpan={3} className="muted small">
                    Built in. Public data only; add a connection to the same address to use a credential.
                  </td>
                </tr>
              ))}
              {rows.map((c, i) => (
                <tr key={i} data-testid={`connection-row-${i}`}>
                  <td>
                    <select value={c.tool} onChange={(e) => set(i, { tool: e.target.value as WorkToolId })} aria-label="Tool" data-testid={`connection-tool-${i}`}>
                      {WORK_TOOLS.map((t) => (
                        <option key={t} value={t}>
                          {WORK_TOOL_LABEL[t]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input value={c.id} onChange={(e) => set(i, { id: e.target.value })} aria-label="ID" data-testid={`connection-id-${i}`} style={{ width: 130 }} />
                  </td>
                  <td>
                    <input value={c.baseUrl} onChange={(e) => set(i, { baseUrl: e.target.value })} placeholder="https://gitlab.example.com" aria-label="Base URL" data-testid={`connection-url-${i}`} />
                  </td>
                  <td>
                    <select value={c.credential ?? ""} onChange={(e) => set(i, { credential: e.target.value || undefined })} aria-label="Credential" data-testid={`connection-credential-${i}`}>
                      <option value="">None (public data)</option>
                      {c.credential && !credentials.includes(c.credential) && <option value={c.credential}>{c.credential} (missing)</option>}
                      {credentials.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select value={c.auth ?? "bearer"} onChange={(e) => set(i, { auth: e.target.value === "basic" ? "basic" : "bearer" })} aria-label="Sent as" data-testid={`connection-auth-${i}`}>
                      <option value="bearer">Bearer token</option>
                      <option value="basic">user:token (basic)</option>
                    </select>
                  </td>
                  <td className="nowrap">
                    <button
                      className="small ghost icon"
                      aria-label={`Remove connection ${c.id}`}
                      title="Remove"
                      onClick={() => setRows((r) => r.filter((_, j) => j !== i))}
                      data-testid={`connection-remove-${i}`}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="row">
        <button onClick={add} data-testid="connection-add">
          <Icon name="plus" size={14} /> Add a connection
        </button>
        <span className="grow" />
        <button className="primary" onClick={() => void save()} disabled={!dirty || busy} aria-busy={busy} data-testid="connections-save">
          Save connections
        </button>
      </div>
    </section>
  );
}
