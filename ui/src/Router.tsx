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
import { errorMessage, notify } from "./common/notify";
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

  /** Ask the server for the projects again. Resolves with the answer, or null when it failed (`quiet`: the list on screen stays, no error page). */
  const refresh = useCallback(
    (quiet: boolean): Promise<HubInfo | null> =>
      api.hub().then(
        (h) => (setHub(h), setError(null), h),
        (e) => {
          if (!quiet) setError(errorMessage(e));
          return null;
        },
      ),
    [],
  );
  const load = useCallback(() => refresh(false).then(() => undefined), [refresh]);
  useEffect(() => void load(), [load]);
  // Others add projects too (another tab, a colleague, the CLI): look again when the window gets the focus back, so the
  // rail, the home page and the links agree on what exists.
  const isHubMode = hub?.mode === "hub";
  useEffect(() => {
    // One project has no list that can change.
    if (!isHubMode) return;
    const on = () => void refresh(true);
    window.addEventListener("focus", on);
    return () => window.removeEventListener("focus", on);
  }, [refresh, isHubMode]);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener("hashchange", on);
    window.addEventListener("popstate", on);
    return () => {
      window.removeEventListener("hashchange", on);
      window.removeEventListener("popstate", on);
    };
  }, []);

  const page = pageOf(hash);
  const h = fromHash();
  const isHub = hub?.mode === "hub";
  const known = isHub && !!h.project && hub.projects.some((p) => p.id === h.project);
  // A hub URL that names no page and no known project. The URL is put right here, in an effect: changing it while
  // rendering left this component with the old hash, and the next click on the same link then did nothing.
  const wanted = isHub && !page && !known ? (h.project ?? "") : null;
  useEffect(() => {
    if (wanted === null) return;
    const goHome = () => {
      window.history.replaceState(null, "", "#/home");
      setHash("#/home");
    };
    // No project in the URL: a hub starts on its home page.
    if (!wanted) return goHome();
    // A project this page has not heard of may be new (made in another tab or by a colleague): ask before giving up.
    let live = true;
    void refresh(true).then((fresh) => {
      if (!live || fresh?.projects.some((p) => p.id === wanted)) return;
      notify.error(fresh ? `There is no project "${wanted}" here (or you have no access to it).` : `Could not open the project "${wanted}": the server did not answer.`);
      goHome();
    });
    return () => {
      live = false;
    };
  }, [wanted, refresh]);

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

  // The project every request and every link is for. Set before the page below renders, so its first requests carry it.
  if (page || (isHub && !known)) {
    setProject(null);
    setHashProject(null);
    // An unknown project is being asked about (the effect above): nothing to show yet.
    if (!page && wanted) return <div className="loading">Loading…</div>;
    return <HubShell hub={hub} page={page ?? "home"} onSignOut={onSignOut} onChanged={load} />;
  }
  const project = isHub ? h.project : null;
  setProject(project);
  setHashProject(project);
  return <App key={project ?? "single"} hub={hub} project={project} initialReveal={h.reveal} onSignOut={onSignOut} />;
}
