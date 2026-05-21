import { orders } from "../data/orders";
import { Order, OrderStatus } from "../types/order";

export function calculateOrderTotals(items: Order["items"]) {
  const subtotalAmount = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0
  );
  const shippingAmount = subtotalAmount >= 100 ? 0 : 7.5;
  const taxAmount = Number((subtotalAmount * 0.075).toFixed(2));
  const totalAmount = Number((subtotalAmount + shippingAmount + taxAmount).toFixed(2));

  return {
    subtotalAmount: Number(subtotalAmount.toFixed(2)),
    shippingAmount,
    taxAmount,
    totalAmount
  };
}

export function findOrderById(orderId: string) {
  return orders.find((item) => item.id === orderId);
}

export function canTransitionOrderStatus(currentStatus: OrderStatus, nextStatus: OrderStatus) {
  const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
    pending: ["confirmed", "cancelled"],
    confirmed: ["paid", "cancelled"],
    paid: ["fulfilled", "cancelled"],
    fulfilled: [],
    cancelled: []
  };

  return allowedTransitions[currentStatus].includes(nextStatus);
}

export function appendOrderNote(order: Order, note: string) {
  order.notes.push(note);
  order.updatedAt = new Date().toISOString();
}

export function applyInventoryReservationRequested(order: Order, note: string) {
  order.inventoryStatus = "reservation_pending";
  order.inventoryReservation.requestedAt = new Date().toISOString();
  appendOrderNote(order, note);
}

export function applyInventoryReserved(
  order: Order,
  reservationReference: string,
  note = "Inventory reserved and order confirmed."
) {
  order.status = "confirmed";
  order.inventoryStatus = "reserved";
  order.inventoryReservation.reference = reservationReference;
  order.inventoryReservation.reservedAt = new Date().toISOString();
  appendOrderNote(order, note);
}

export function applyInventoryReservationFailed(order: Order, message: string) {
  order.inventoryStatus = "failed";
  appendOrderNote(order, `Inventory reservation failed: ${message}`);
}

export function applyInventoryReleased(order: Order, note: string) {
  order.inventoryStatus = "released";
  order.inventoryReservation.releasedAt = new Date().toISOString();
  appendOrderNote(order, note);
}
