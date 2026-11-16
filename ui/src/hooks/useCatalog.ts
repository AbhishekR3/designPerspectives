import { useEffect, useState } from "react";
import { api } from "../api";
import type { CatalogEntry, HubInfo } from "../types";

/** The hub's shared catalog elements, for the panels' "linked copy" and data sections (DEC-055).
 *  Null outside a hub, without a catalog, or when the project shown is the catalog itself. */
export function useCatalog(hub: HubInfo | undefined, project: string | null): CatalogEntry[] | null {
  const [entries, setEntries] = useState<CatalogEntry[] | null>(null);
  const on = !!hub && hub.mode === "hub" && !!hub.catalog && project !== hub.catalog;
  useEffect(() => {
    if (!on) return;
    let live = true;
    const load = () =>
      api.catalog().then(
        (e) => live && setEntries(e),
        () => undefined,
      );
    void load();
    window.addEventListener("focus", load);
    return () => {
      live = false;
      window.removeEventListener("focus", load);
    };
  }, [on]);
  return on ? entries : null;
}
