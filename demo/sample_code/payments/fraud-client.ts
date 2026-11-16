/** Fraud Check Client: asks the Fraud Detection System for a risk score. */

import type { PaymentRequest } from "./types";

const TIMEOUT_MS = 300;
const FALLBACK_SCORE = 0.5; // used when the fraud system does not answer in time

export async function fraudScore(p: PaymentRequest): Promise<number> {
  try {
    const res = await fetch(`${process.env.FRAUD_URL}/v1/score`, {
      method: "POST",
      body: JSON.stringify({ account: p.accountId, amountPence: p.amountPence, payee: `${p.payeeSortCode}-${p.payeeAccount}` }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return ((await res.json()) as { score: number }).score;
  } catch {
    return FALLBACK_SCORE;
  }
}
