/** Event Publisher: writes payment outcomes to the Payment Events topic. */

import { Kafka } from "kafkajs";
import type { PaymentOutcome } from "./types";

const producer = new Kafka({ brokers: (process.env.KAFKA_BROKERS ?? "").split(",") }).producer();

export async function publishOutcome(outcome: PaymentOutcome): Promise<PaymentOutcome> {
  await producer.send({
    topic: "payments.outcomes.v1",
    messages: [{ key: outcome.paymentId, value: JSON.stringify({ type: `payment.${outcome.status}`, ...outcome }) }],
  });
  return outcome;
}
