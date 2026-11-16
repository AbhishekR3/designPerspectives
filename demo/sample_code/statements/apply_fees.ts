// Stage 7: monthly account fee and interest, added to the totals before rendering.

import type { StatementTotals } from "./types";

export interface Tariff {
  monthlyFee: number;
  annualInterestRate: number; // e.g. 0.004 for 0.4 %
}

export function applyFees(t: StatementTotals, tariff: Tariff): StatementTotals & { fees: number; interest: number } {
  const fees = -tariff.monthlyFee;
  const interest = monthlyInterest(t.closingBalance, tariff.annualInterestRate);
  return { ...t, fees, interest, closingBalance: Math.round((t.closingBalance + fees + interest) * 100) / 100 };
}

export function monthlyInterest(balance: number, annualRate: number): number {
  return balance > 0 ? Math.round(((balance * annualRate) / 12) * 100) / 100 : 0;
}
