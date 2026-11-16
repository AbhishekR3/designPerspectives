/** Payment Validator: limits, payee details and available balance. */

import { availableBalance } from "./mainframe";
import type { PaymentRequest } from "./types";

const DAILY_LIMIT_PENCE = 25_000_00;

export async function validate(user: string, p: PaymentRequest): Promise<string | null> {
  if (p.amountPence <= 0) return "The amount must be more than zero.";
  if (p.amountPence > DAILY_LIMIT_PENCE) return "The amount is over the daily limit.";
  if (!/^\d{6}$/.test(p.payeeSortCode) || !/^\d{8}$/.test(p.payeeAccount)) return "The payee details are not valid.";
  if ((await availableBalance(user, p.accountId)) < p.amountPence) return "Not enough money in the account.";
  return null;
}
