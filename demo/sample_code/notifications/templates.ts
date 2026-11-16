/** Template Renderer: fills message templates in the customer's language. */

const TEMPLATES: Record<string, string> = {
  "payment.completed": "Your payment {paymentId} has been sent.",
  "payment.rejected": "Your payment {paymentId} could not be made.",
  "payment.held-for-review": "We are checking payment {paymentId}. We will contact you shortly.",
};

export function render(type: string, values: object): string {
  const template = TEMPLATES[type] ?? "There is an update on your account.";
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String((values as Record<string, unknown>)[k] ?? ""));
}
