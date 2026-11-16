// Stage 8: lay out the statement and render it to PDF.

import type { StatementTotals } from "./types";

export interface RenderedStatement {
  file: string;
  pages: number;
  printedClosingBalance: string;
  bytes: Uint8Array;
}

export async function renderStatement(t: StatementTotals, pdf: { render(html: string): Promise<Uint8Array> }): Promise<RenderedStatement> {
  const html = layout(t);
  const bytes = await pdf.render(html);
  return { file: `stmt-${t.account}-${t.period}.pdf`, pages: Math.ceil(t.transactions.length / 30) + 1, printedClosingBalance: money(t.closingBalance), bytes };
}

export function layout(t: StatementTotals): string {
  const rows = t.transactions.map((x) => `<tr><td>${x.date}</td><td>${x.description}</td><td>${money(x.amount)}</td></tr>`).join("");
  return `<h1>Statement ${t.period}</h1><p>Opening balance ${money(t.openingBalance)}</p><table>${rows}</table><p>Closing balance ${money(t.closingBalance)}</p>`;
}

export function money(x: number): string {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(x);
}
