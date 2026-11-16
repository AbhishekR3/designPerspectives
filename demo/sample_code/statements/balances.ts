// Stage 6: opening balance, totals and closing balance per account.

import type { ConvertedTransaction, StatementTotals } from "./types";

export function totals(account: string, period: string, openingBalance: number, txs: ConvertedTransaction[]): StatementTotals {
  const totalDebits = sum(txs.filter((t) => t.amount < 0).map((t) => t.amount));
  const totalCredits = sum(txs.filter((t) => t.amount > 0).map((t) => t.amount));
  return {
    account,
    period,
    openingBalance,
    totalDebits,
    totalCredits,
    closingBalance: toCents(openingBalance + totalDebits + totalCredits),
    transactions: txs,
  };
}

export function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

function toCents(x: number): number {
  return Math.round(x * 100) / 100;
}
