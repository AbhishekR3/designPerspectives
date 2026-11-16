/** Event Listener: consumes payment outcomes and hands each one to the router. */

import { Kafka } from "kafkajs";
import { deliver } from "./router";

const consumer = new Kafka({ brokers: (process.env.KAFKA_BROKERS ?? "").split(",") }).consumer({ groupId: "notification-service" });

export async function start(): Promise<void> {
  await consumer.subscribe({ topic: "payments.outcomes.v1" });
  await consumer.run({
    eachMessage: async ({ message }) => {
      if (message.value) await deliver(JSON.parse(message.value.toString()));
    },
  });
}
