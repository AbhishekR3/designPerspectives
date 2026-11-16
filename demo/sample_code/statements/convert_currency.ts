// Stage 5: convert each transaction into the statement currency.

import type { ConvertedTransaction, EnrichedTransaction } from "./types";

export type Rates = (from: string, to: string, date: string) => number;

export function convert(tx: EnrichedTransaction, rates: Rates): ConvertedTransaction {
  const fxRate = tx.currency === tx.statementCurrency ? 1 : rates(tx.currency, tx.statementCurrency, tx.date);
  const signed = (tx.type === "DEBIT" ? -1 : 1) * tx.amountMinor;
  // Round each converted amount to cents so the lines on the statement add up to what is printed.
  const amount = roundCents((signed / 100) * fxRate);
  return { ...tx, amount, fxRate };
}

export function convertAll(txs: EnrichedTransaction[], rates: Rates): ConvertedTransaction[] {
  return txs.map((tx) => convert(tx, rates));
}

export function roundCents(x: number): number {
  return Math.round(x * 100) / 100;
}
