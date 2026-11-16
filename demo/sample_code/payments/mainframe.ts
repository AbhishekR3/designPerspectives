/** Calls to the Mainframe Banking System over MQ. */

import type { PaymentRequest } from "./types";

export async function availableBalance(user: string, accountId: string): Promise<number> {
  const reply = await mq("BALANCE.REQ", { user, accountId });
  return Number(reply.availablePence);
}

export async function submitToMainframe(p: PaymentRequest): Promise<string> {
  const reply = await mq("PAYMENT.REQ", p);
  return String(reply.reference);
}

async function mq(queue: string, body: object): Promise<Record<string, unknown>> {
  // The MQ client is configured by the platform team; see the Payments Service runbook.
  throw new Error(`Not connected to ${queue}: ${JSON.stringify(body)}`);
}
