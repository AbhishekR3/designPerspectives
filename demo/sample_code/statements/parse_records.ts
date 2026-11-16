// Stage 2: turn fixed-width lines into transactions.

import type { RawRecord, Transaction } from "./types";

const FIELDS = { account: [0, 7], date: [8, 16], type: [17, 18], amount: [19, 28], currency: [29, 32], description: [33, 80] } as const;

export function parseRecord(r: RawRecord): Transaction {
  const f = (k: keyof typeof FIELDS) => r.text.slice(FIELDS[k][0], FIELDS[k][1]).trim();
  return {
    account: f("account"),
    date: isoDate(f("date")),
    type: f("type") === "D" ? "DEBIT" : "CREDIT",
    amountMinor: Number(f("amount")),
    currency: f("currency"),
    description: f("description"),
  };
}

export function parseAll(records: RawRecord[]): Transaction[] {
  return records.map(parseRecord);
}

function isoDate(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}
