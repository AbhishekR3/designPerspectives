// Stage 3: drop records that cannot be put on a statement.

import type { Transaction } from "./types";

export interface Checked {
  ok: Transaction[];
  rejected: { tx: Transaction; reason: string }[];
}

export function validateAll(txs: Transaction[], period: string, knownAccounts: Set<string>): Checked {
  const out: Checked = { ok: [], rejected: [] };
  for (const tx of txs) {
    const reason = check(tx, period, knownAccounts);
    if (reason) out.rejected.push({ tx, reason });
    else out.ok.push(tx);
  }
  return out;
}

export function check(tx: Transaction, period: string, knownAccounts: Set<string>): string | null {
  if (!knownAccounts.has(tx.account)) return "unknown account";
  if (!Number.isInteger(tx.amountMinor) || tx.amountMinor <= 0) return "bad amount";
  if (!tx.date.startsWith(period)) return "dated outside the statement period";
  return null;
}
