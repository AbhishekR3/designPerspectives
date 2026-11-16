// Stage 4: add the customer and statement details each statement needs.

import type { EnrichedTransaction, Transaction } from "./types";

export interface AccountInfo {
  customerName: string;
  statementCurrency: string;
  addressRef: string;
}

export function enrich(tx: Transaction, accounts: Map<string, AccountInfo>): EnrichedTransaction {
  const info = accounts.get(tx.account);
  if (!info) throw new Error(`No account details for ${tx.account}`);
  return { ...tx, ...info };
}

export function enrichAll(txs: Transaction[], accounts: Map<string, AccountInfo>): EnrichedTransaction[] {
  return txs.map((tx) => enrich(tx, accounts));
}
