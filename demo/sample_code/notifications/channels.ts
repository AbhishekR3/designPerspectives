/** Delivery through the E-mail System, the SMS Gateway and the Push Notification Service. */

export async function sendEmail(customerId: string, text: string): Promise<void> {
  await post(process.env.SMTP_RELAY_URL, { customerId, text });
}

export async function sendSms(customerId: string, text: string): Promise<void> {
  await post(process.env.SMS_GATEWAY_URL, { customerId, text });
}

export async function sendPush(customerId: string, text: string): Promise<void> {
  await post(process.env.PUSH_URL, { customerId, text });
}

async function post(url: string | undefined, body: object): Promise<void> {
  if (!url) throw new Error("Delivery URL is not configured.");
  const res = await fetch(url, { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Delivery failed with ${res.status}.`);
}
