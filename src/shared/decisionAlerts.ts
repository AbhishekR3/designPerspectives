// What a decision asks of its reader today: a review or deadline that has come, a trigger that happened.
// Pure (no Node or DOM): the server's home summary and the browser use the same rules.

import type { DecisionSummary } from "./types.js";

export interface DecisionFlag {
  kind: "review" | "decide" | "expired" | "trigger" | "proposed" | "unreadable";
  text: string;
  tone: "warn" | "info";
}

/** `now`: YYYY-MM-DD. Proposed decisions are "info"; everything else here is "warn". */
export function decisionFlags(d: Pick<DecisionSummary, "status" | "kind" | "reviewBy" | "decideBy" | "expires" | "triggers" | "error">, now: string): DecisionFlag[] {
  if (d.error) return [{ kind: "unreadable", text: "Cannot be read", tone: "warn" }];
  const out: DecisionFlag[] = [];
  const live = d.status === "accepted" || d.status === "proposed";
  if (live && d.reviewBy && d.reviewBy <= now) out.push({ kind: "review", text: `Review was due ${d.reviewBy}`, tone: "warn" });
  if (d.kind === "deferred" && d.status === "proposed" && d.decideBy && d.decideBy <= now) out.push({ kind: "decide", text: `Decide by ${d.decideBy} has passed`, tone: "warn" });
  if (d.kind === "time-boxed" && d.status === "accepted" && d.expires && d.expires <= now) out.push({ kind: "expired", text: `Expired ${d.expires}`, tone: "warn" });
  if (live && d.triggers.met) out.push({ kind: "trigger", text: `${d.triggers.met} trigger${d.triggers.met === 1 ? "" : "s"} met`, tone: "warn" });
  if (d.status === "proposed") out.push({ kind: "proposed", text: "Proposed", tone: "info" });
  return out;
}

/** Needs a look: anything `decisionFlags` reports, a proposed decision included (it waits for an answer). The one rule behind every count. */
export function decisionNeedsLook(d: Parameters<typeof decisionFlags>[0], now: string): boolean {
  return decisionFlags(d, now).length > 0;
}

/** YYYY-MM-DD in local time. */
export function isoDay(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
