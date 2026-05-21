import { Consumer, Kafka, Producer } from "kafkajs";

import { env } from "../config/env";
import { findOrderById, applyInventoryReservationFailed, applyInventoryReserved, applyInventoryReleased } from "./order-workflow";
import { InventoryEvent, OrderEvent, OrderEventType } from "../types/events";

let kafka: Kafka | null = null;
let producer: Producer | null = null;
let inventoryConsumer: Consumer | null = null;

function kafkaEnabled() {
  return env.ENABLE_KAFKA && env.NODE_ENV !== "test";
}

function getKafka() {
  if (!kafka) {
    kafka = new Kafka({
      clientId: env.KAFKA_CLIENT_ID,
      brokers: env.KAFKA_BROKERS
    });
  }

  return kafka;
}

function buildOrderEvent(order: OrderEvent["order"], eventType: OrderEventType): OrderEvent {
  return {
    eventId: `${eventType}-${order.id}-${Date.now()}`,
    eventType,
    orderId: order.id,
    sourceService: "order-service",
    occurredAt: new Date().toISOString(),
    order: JSON.parse(JSON.stringify(order)) as OrderEvent["order"]
  };
}

export async function publishOrderEvent(order: OrderEvent["order"], eventType: OrderEventType) {
  if (!kafkaEnabled()) {
    return;
  }

  if (!producer) {
    producer = getKafka().producer();
    await producer.connect();
  }

  const event = buildOrderEvent(order, eventType);

  await producer.send({
    topic: env.KAFKA_ORDER_EVENTS_TOPIC,
    messages: [
      {
        key: order.id,
        value: JSON.stringify(event)
      }
    ]
  });
}

export async function startInventoryEventsConsumer() {
  if (!kafkaEnabled()) {
    return;
  }

  if (inventoryConsumer) {
    return;
  }

  inventoryConsumer = getKafka().consumer({
    groupId: env.KAFKA_INVENTORY_CONSUMER_GROUP
  });

  await inventoryConsumer.connect();
  await inventoryConsumer.subscribe({
    topic: env.KAFKA_INVENTORY_EVENTS_TOPIC,
    fromBeginning: false
  });

  await inventoryConsumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) {
        return;
      }

      const event = JSON.parse(message.value.toString()) as InventoryEvent;
      const order = findOrderById(event.orderId);

      if (!order) {
        return;
      }

      if (event.eventType === "inventory_reserved") {
        applyInventoryReserved(
          order,
          event.reservationReference ?? `res-${order.id}`,
          `Inventory reserved via Kafka event ${event.eventId}.`
        );
        return;
      }

      if (event.eventType === "inventory_reservation_failed") {
        applyInventoryReservationFailed(order, event.message);
        return;
      }

      if (event.eventType === "inventory_released") {
        applyInventoryReleased(order, "Inventory released via Kafka.");
      }
    }
  });
}

export async function stopKafka() {
  await inventoryConsumer?.disconnect().catch(() => undefined);
  await producer?.disconnect().catch(() => undefined);
  inventoryConsumer = null;
  producer = null;
  kafka = null;
}
