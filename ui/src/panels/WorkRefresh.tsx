import { useState } from "react";
import { api } from "../api";
import { errorMessage, notify } from "../notify";
import type { WorkItem } from "../types";
import type { Common } from "./common";

const GH = /^https:\/\/github\.com\/[^/]+\/[^/]+\/(issues|pull)\/\d+/;

/** "Refresh from GitHub" under Linked work (DEC-058): every GitHub issue and pull request link of the shown version. */
export function WorkRefreshButton({ rows, mutate, readOnly }: { rows: WorkItem[]; mutate: Common["mutate"]; readOnly: boolean }) {
  const [busy, setBusy] = useState(false);
  if (readOnly || !rows.some((w) => w.url && GH.test(w.url))) return null;
  const run = async () => {
    setBusy(true);
    try {
      let msg = "";
      await mutate(async () => {
        const r = await api.refreshWork();
        msg = `Checked ${r.checked} GitHub link${r.checked === 1 ? "" : "s"}${r.usedCredential ? ` with ${r.usedCredential}` : " (no GitHub credential: public repositories only)"}: ${r.updated.length} status${r.updated.length === 1 ? "" : "es"} changed.`;
        if (r.failed.length) notify.error(`${r.failed.length} could not be read: ${r.failed.map((f) => `${f.url.replace("https://github.com/", "")} (${f.reason})`).join("; ")}`);
      });
      if (msg) notify.success(msg);
    } catch (e) {
      notify.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className="add" onClick={() => void run()} disabled={busy} title="Read the status of every GitHub issue and pull request linked in this model" data-testid="work-refresh">
      {busy ? "Asking GitHub…" : "↻ Refresh status from GitHub"}
    </button>
  );
}
