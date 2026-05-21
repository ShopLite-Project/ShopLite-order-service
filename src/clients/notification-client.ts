import { env } from "../config/env";
import { Order } from "../types/order";

type NotificationEventType =
  | "order_created"
  | "order_confirmed"
  | "order_paid"
  | "order_fulfilled"
  | "order_cancelled"
  | "inventory_reservation_failed";

export async function queueOrderNotificationEvent(
  order: Order,
  eventType: NotificationEventType
) {
  const response = await fetch(`${env.NOTIFICATION_SERVICE_BASE_URL}/notifications/order-events`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      id: `ntf-${order.id}-${eventType}`,
      orderId: order.id,
      eventType,
      channel: "email",
      customer: {
        customerId: order.customer.id,
        name: `${order.customer.firstName} ${order.customer.lastName}`,
        email: order.customer.email
      }
    })
  });

  if (!response.ok && response.status !== 409) {
    const errorPayload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorPayload?.error ?? `Notification request failed for ${eventType}`);
  }
}
