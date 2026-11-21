import { useEffect, useState } from "react";
import { api } from "../api";
import { errorMessage } from "../common/notify";
import type { AppState, WorkList } from "../types";

/** Every linked work item of the shown model version (WRK-02), read again whenever the model changes: the Work page and the badge on its button. */
export function useWork(state: AppState | null): { data: WorkList | null; error: string | null } {
  const [data, setData] = useState<WorkList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const version = state?.version ?? null;
  useEffect(() => {
    if (version === null) return;
    let current = true;
    api.work().then(
      (d) => {
        if (!current) return;
        setData(d);
        setError(null);
      },
      (e) => current && setError(errorMessage(e)),
    );
    return () => {
      current = false;
    };
  }, [version]);
  return { data, error };
}
