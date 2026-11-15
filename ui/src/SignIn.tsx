import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import App from "./App";
import { api, onSessionEnded, SESSION_ENDED } from "./api";
import { errorMessage, notify } from "./notify";

/** The full-page sign-in card. `note` says why it is shown again (an ended session). */
export function SignIn({ note, onSignedIn }: { note?: string; onSignedIn(): void }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => nameRef.current?.focus(), []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !name.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      await api.login(name.trim(), password);
      onSignedIn();
    } catch (err) {
      setError(errorMessage(err));
      setPassword("");
      setBusy(false);
    }
  };

  return (
    <div className="signin-page">
      <form className="signin-card float" onSubmit={(e) => void submit(e)} data-testid="sign-in">
        <div className="signin-product">designPerspectives</div>
        <h1>Sign in</h1>
        {note && (
          <div className="note small" role="status" data-testid="sign-in-note">
            {note}
          </div>
        )}
        <label className="field">
          <span>Name</span>
          <input ref={nameRef} type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} data-testid="sign-in-name" />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" data-testid="sign-in-password" />
        </label>
        {error && (
          <div className="error" role="alert" data-testid="sign-in-error">
            {error}
          </div>
        )}
        <button type="submit" className="primary" disabled={busy || !name.trim() || !password} aria-busy={busy} data-testid="sign-in-submit">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

type Phase = { kind: "loading" } | { kind: "failed"; message: string } | { kind: "signin"; note?: string } | { kind: "app" };

/**
 * Sits above the app: asks who is signed in, shows the sign-in page when the server needs a sign-in and
 * there is none, and brings it back when a call finds the session gone (see `onSessionEnded` in api.ts).
 * The app is mounted anew after each sign-in; the URL hash is not touched, so the same diagram opens again.
 */
export function AuthGate() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [round, setRound] = useState(0);

  const check = useCallback(() => {
    setPhase({ kind: "loading" });
    api.me().then(
      (me) => {
        notify.suspend(false);
        setPhase(me.loginRequired && !me.user ? { kind: "signin" } : { kind: "app" });
      },
      (e) => setPhase({ kind: "failed", message: errorMessage(e) }),
    );
  }, []);
  useEffect(() => check(), [check]);

  useEffect(() => {
    onSessionEnded(() => setPhase((p) => (p.kind === "app" ? { kind: "signin", note: SESSION_ENDED } : p)));
    return () => onSessionEnded(null);
  }, []);

  if (phase.kind === "loading") return <div className="loading">Loading…</div>;
  if (phase.kind === "failed") {
    return (
      <div className="loading">
        Could not load: {phase.message}{" "}
        <button onClick={check} data-testid="retry-load">
          Retry
        </button>
      </div>
    );
  }
  if (phase.kind === "signin") {
    return (
      <SignIn
        note={phase.note}
        onSignedIn={() => {
          notify.suspend(false);
          setRound((r) => r + 1);
          setPhase({ kind: "app" });
        }}
      />
    );
  }
  const signOut = () => {
    // The call may fail (the session is already gone): either way the sign-in page is next.
    void api
      .logout()
      .catch(() => undefined)
      .finally(() => {
        notify.clearError();
        setPhase({ kind: "signin" });
      });
  };
  return <App key={round} onSignOut={signOut} />;
}
