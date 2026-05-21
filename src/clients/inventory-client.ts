import { env } from "../config/env";

interface InventoryItemResponse {
  data: {
    productId: string;
    inventoryTracked: boolean;
  };
}

interface InventoryReservationResponse {
  meta: {
    adjustment: {
      id: string;
    };
  };
}

interface InventoryRequestPayload {
  productId: string;
  quantity: number;
  orderId: string;
  reason?: string;
}

export async function getInventoryItem(productId: string) {
  const response = await fetch(
    `${env.INVENTORY_SERVICE_BASE_URL}/inventory/${encodeURIComponent(productId)}`
  );

  if (!response.ok) {
    throw new Error(`Inventory lookup failed for ${productId}`);
  }

  const payload = (await response.json()) as InventoryItemResponse;
  return payload.data;
}

export async function reserveInventoryItem(payload: InventoryRequestPayload) {
  const response = await fetch(`${env.INVENTORY_SERVICE_BASE_URL}/inventory/reservations`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorPayload?.error ?? `Inventory reservation failed for ${payload.productId}`);
  }

  const responsePayload = (await response.json()) as InventoryReservationResponse;
  return responsePayload.meta.adjustment.id;
}

export async function releaseInventoryItem(payload: InventoryRequestPayload) {
  const response = await fetch(`${env.INVENTORY_SERVICE_BASE_URL}/inventory/release`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errorPayload?.error ?? `Inventory release failed for ${payload.productId}`);
  }
}
