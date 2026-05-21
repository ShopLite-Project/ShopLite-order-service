import { env } from "../config/env";
import { Order } from "../types/order";
import {
  getInventoryItem,
  releaseInventoryItem,
  reserveInventoryItem
} from "../clients/inventory-client";
import { queueOrderNotificationEvent } from "../clients/notification-client";

interface ReservationOutcome {
  success: boolean;
  reservationReference: string | null;
  message: string;
}

export function integrationsEnabled() {
  return env.ENABLE_SERVICE_INTEGRATIONS;
}

export async function queueNotificationIfEnabled(order: Order, eventType: Parameters<typeof queueOrderNotificationEvent>[1]) {
  if (!integrationsEnabled()) {
    return;
  }

  await queueOrderNotificationEvent(order, eventType);
}

export async function confirmOrderInventory(order: Order): Promise<ReservationOutcome> {
  if (!integrationsEnabled()) {
    return {
      success: false,
      reservationReference: null,
      message: "Service integrations are disabled"
    };
  }

  const reservedItems: Order["items"] = [];
  const reservationReference = `res-${order.id}`;

  try {
    for (const item of order.items) {
      const inventoryItem = await getInventoryItem(item.productId);

      if (!inventoryItem.inventoryTracked) {
        continue;
      }

      await reserveInventoryItem({
        productId: item.productId,
        quantity: item.quantity,
        orderId: order.id,
        reason: `Reserved for order ${order.id}`
      });

      reservedItems.push(item);
    }

    return {
      success: true,
      reservationReference,
      message: "Inventory reserved successfully"
    };
  } catch (error) {
    for (const item of reservedItems) {
      await releaseInventoryItem({
        productId: item.productId,
        quantity: item.quantity,
        orderId: order.id,
        reason: `Rolled back reservation for order ${order.id}`
      }).catch(() => undefined);
    }

    return {
      success: false,
      reservationReference: null,
      message: error instanceof Error ? error.message : "Inventory reservation failed"
    };
  }
}

export async function releaseOrderInventory(order: Order) {
  if (!integrationsEnabled()) {
    return;
  }

  for (const item of order.items) {
    const inventoryItem = await getInventoryItem(item.productId);

    if (!inventoryItem.inventoryTracked) {
      continue;
    }

    await releaseInventoryItem({
      productId: item.productId,
      quantity: item.quantity,
      orderId: order.id,
      reason: `Released after cancellation of order ${order.id}`
    });
  }
}
