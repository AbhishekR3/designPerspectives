/** Payment Orchestrator: validate, fraud-check, submit, publish. */

import { fraudScore } from "./fraud-client";
import { submitToMainframe } from "./mainframe";
import { publishOutcome } from "./publisher";
import type { PaymentOutcome, PaymentRequest } from "./types";
import { validate } from "./validator";

const HOLD_THRESHOLD = 0.8;

export async function runPayment(user: string, payment: PaymentRequest): Promise<PaymentOutcome> {
  const paymentId = payment.idempotencyKey;
  const problem = await validate(user, payment);
  if (problem) return publishOutcome({ paymentId, status: "rejected", reason: problem });

  const score = await fraudScore(payment);
  if (score >= HOLD_THRESHOLD) return publishOutcome({ paymentId, status: "held-for-review" });

  const mainframeReference = await submitToMainframe(payment);
  return publishOutcome({ paymentId, status: "completed", mainframeReference });
}
