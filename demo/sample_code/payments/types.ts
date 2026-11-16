/** Shared types for the Payments Service. */

export interface PaymentRequest {
  accountId: string;
  payeeSortCode: string;
  payeeAccount: string;
  amountPence: number;
  reference: string;
  idempotencyKey: string;
}

export type PaymentStatus = "completed" | "rejected" | "held-for-review";

export interface PaymentOutcome {
  paymentId: string;
  status: PaymentStatus;
  reason?: string;
  mainframeReference?: string;
}
