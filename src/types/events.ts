import { Order } from "./order";

export type OrderEventType =
  | "order_created"
  | "inventory_reservation_requested"
  | "order_confirmed"
  | "order_paid"
  | "order_fulfilled"
  | "order_cancelled";

export type InventoryEventType =
  | "inventory_reserved"
  | "inventory_reservation_failed"
  | "inventory_released";

export interface OrderEvent {
  eventId: string;
  eventType: OrderEventType;
  orderId: string;
  sourceService: "order-service";
  occurredAt: string;
  order: Order;
}

export interface InventoryEvent {
  eventId: string;
  eventType: InventoryEventType;
  orderId: string;
  sourceService: "inventory-service";
  occurredAt: string;
  reservationReference: string | null;
  message: string;
}
