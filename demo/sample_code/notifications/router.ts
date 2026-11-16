/** Channel Router: picks e-mail, SMS or push from the customer's preferences. */

import { sendEmail, sendPush, sendSms } from "./channels";
import { render } from "./templates";

export interface BankingEvent {
  type: string;
  paymentId: string;
  customerId?: string;
}

type Channel = "email" | "sms" | "push";

export async function deliver(event: BankingEvent): Promise<void> {
  const channel = await preferredChannel(event.customerId);
  const message = render(event.type, event);
  if (channel === "push") return sendPush(event.customerId!, message);
  if (channel === "sms") return sendSms(event.customerId!, message);
  return sendEmail(event.customerId!, message);
}

async function preferredChannel(customerId: string | undefined): Promise<Channel> {
  return customerId ? "push" : "email";
}
