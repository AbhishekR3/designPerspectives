/**
 * Below the sign-in: the hub-level pages (home, shared catalog, credentials; DEC-053) or a project's
 * diagrams (App). The URL says which:
 *   #/home  #/catalog  #/settings/credentials            pages of the server (a hub, or one project)
 *   #/d/<diagram>?pr=<project>&…                          a project (no `pr` on a single-project server)
 * An empty hash opens the home page in a hub and the diagrams of a single project, as before.
 */

import { useCallback, useEffect, useState } from "react";
import App from "./App";
import { api, setProject } from "./api";
import { HubShell, type HubPage } from "./pages/Shell";
import { errorMessage } from "./common/notify";
import type { HubInfo } from "./types";
import { fromHash, setHashProject } from "./hooks/useNavigation";

function pageOf(hash: string): HubPage | null {
  if (/^#\/home\/?$/.test(hash)) return "home";
  if (/^#\/catalog(\?.*)?$/.test(hash)) return "catalog";
  if (/^#\/settings\/credentials\/?$/.test(hash)) return "credentials";
  if (/^#\/history(\?.*)?$/.test(hash)) return "history";
  return null;
}

export function Root({ onSignOut }: { onSignOut(): void }) {
  const [hub, setHub] = useState<HubInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState(window.location.hash);

  const load = useCallback(() => {
    setProject(null);
    return api.hub().then(
      (h) => (setHub(h), setError(null)),
      (e) => setError(errorMessage(e)),
    );
  }, []);
  useEffect(() => void load(), [load]);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener("hashchange", on);
    window.addEventListener("popstate", on);
    return () => {
      window.removeEventListener("hashchange", on);
      window.removeEventListener("popstate", on);
    };
  }, []);

  if (error)
    return (
      <div className="loading">
        Could not load: {error}{" "}
        <button onClick={() => void load()} data-testid="retry-load">
          Retry
        </button>
      </div>
    );
  if (!hub) return <div className="loading">Loading…</div>;

  const page = pageOf(hash);
  const h = fromHash();
  const known = hub.mode === "hub" && h.project && hub.projects.some((p) => p.id === h.project);
  // A hub with no (or an unknown) project in the URL starts on its home page.
  if (page || (hub.mode === "hub" && !known)) {
    setProject(null);
    setHashProject(null);
    if (!page) window.history.replaceState(null, "", "#/home");
    return <HubShell hub={hub} page={page ?? "home"} onSignOut={onSignOut} onChanged={load} />;
  }
  const project = hub.mode === "hub" ? h.project : null;
  setProject(project);
  setHashProject(project);
  return <App key={project ?? "single"} hub={hub} project={project} initialReveal={h.reveal} onSignOut={onSignOut} />;
}
