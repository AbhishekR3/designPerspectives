// Records passed between the stages of the month-end statement job.

export interface RawRecord {
  line: number;
  text: string; // one fixed-width line from the mainframe batch file
}

export interface Transaction {
  account: string;
  date: string; // YYYY-MM-DD
  type: "DEBIT" | "CREDIT";
  amountMinor: number; // in the original currency, minor units
  currency: string;
  description: string;
}

export interface EnrichedTransaction extends Transaction {
  customerName: string;
  statementCurrency: string;
  addressRef: string;
}

export interface ConvertedTransaction extends EnrichedTransaction {
  amount: number; // in the statement currency
  fxRate: number;
}

export interface StatementTotals {
  account: string;
  period: string; // YYYY-MM
  openingBalance: number;
  totalDebits: number;
  totalCredits: number;
  closingBalance: number;
  transactions: ConvertedTransaction[];
}
