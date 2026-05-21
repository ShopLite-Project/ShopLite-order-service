import { Router } from "express";
import { z } from "zod";

import {
  confirmOrderInventory,
  integrationsEnabled,
  queueNotificationIfEnabled,
  releaseOrderInventory
} from "../services/order-integrations";
import { orders } from "../data/orders";
import { Order } from "../types/order";
import { publishOrderEvent } from "../services/kafka";
import {
  applyInventoryReservationFailed,
  applyInventoryReservationRequested,
  applyInventoryReserved,
  calculateOrderTotals,
  canTransitionOrderStatus
} from "../services/order-workflow";

const customerSchema = z.object({
  id: z.string().min(3),
  email: z.string().email(),
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  loyaltyTier: z.enum(["new", "silver", "gold"])
});

const orderItemSchema = z.object({
  productId: z.string().min(3),
  name: z.string().min(2),
  quantity: z.number().int().positive().max(20),
  unitPrice: z.number().positive().multipleOf(0.01)
});

const shippingAddressSchema = z.object({
  street: z.string().min(5),
  city: z.string().min(2),
  state: z.string().min(2),
  country: z.string().min(2),
  postalCode: z.string().min(3)
});

const createOrderSchema = z.object({
  id: z.string().min(3),
  customer: customerSchema,
  items: z.array(orderItemSchema).min(1).max(20),
  shippingAddress: shippingAddressSchema,
  currency: z.string().length(3).transform((value) => value.toUpperCase())
}).superRefine((payload, context) => {
  const productIds = new Set<string>();

  for (const item of payload.items) {
    if (productIds.has(item.productId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Duplicate productId values are not allowed",
        path: ["items"]
      });
      return;
    }

    productIds.add(item.productId);
  }
});

const updateOrderStatusSchema = z.object({
  status: z.enum(["pending", "confirmed", "paid", "fulfilled", "cancelled"]).optional(),
  paymentStatus: z.enum(["unpaid", "authorized", "paid", "refunded"]).optional(),
  inventoryStatus: z.enum(["not_requested", "reservation_pending", "reserved", "released", "failed"]).optional(),
  inventoryReservationReference: z.string().min(3).max(100).nullable().optional(),
  note: z.string().min(3).max(200).optional()
}).refine(
  (payload) =>
    payload.status !== undefined ||
    payload.paymentStatus !== undefined ||
    payload.inventoryStatus !== undefined ||
    payload.inventoryReservationReference !== undefined ||
    payload.note !== undefined,
  {
    message: "At least one update field is required"
  }
);

const cancelOrderSchema = z.object({
  reason: z.string().min(5).max(200)
});

const confirmOrderSchema = z.object({
  note: z.string().min(3).max(200).optional()
});

function validateOrderWorkflowUpdate(order: Order, payload: z.infer<typeof updateOrderStatusSchema>) {
  if (payload.status !== undefined && payload.status !== order.status) {
    if (!canTransitionOrderStatus(order.status, payload.status)) {
      return `Cannot change order status from ${order.status} to ${payload.status}`;
    }
  }

  if (payload.status === "paid" && payload.paymentStatus === undefined && order.paymentStatus !== "paid") {
    return "Order status cannot move to paid unless paymentStatus is also paid";
  }

  if (
    payload.status === "fulfilled" &&
    (payload.paymentStatus ?? order.paymentStatus) !== "paid"
  ) {
    return "Order cannot be fulfilled before paymentStatus is paid";
  }

  if (
    payload.status === "fulfilled" &&
    (payload.inventoryStatus ?? order.inventoryStatus) !== "reserved"
  ) {
    return "Order cannot be fulfilled before inventoryStatus is reserved";
  }

  if (
    payload.paymentStatus === "paid" &&
    order.status === "pending" &&
    payload.status === undefined
  ) {
    return "Set order status to confirmed or paid when marking paymentStatus as paid";
  }

  if (
    payload.inventoryStatus === "reserved" &&
    order.status === "pending" &&
    payload.status === undefined
  ) {
    return "Set order status to confirmed when reserving inventory for a pending order";
  }

  if (
    payload.inventoryStatus === "reserved" &&
    payload.inventoryReservationReference === undefined &&
    order.inventoryReservation.reference === null
  ) {
    return "Provide inventoryReservationReference when inventory becomes reserved";
  }

  if (
    payload.inventoryStatus === "reservation_pending" &&
    order.status === "cancelled"
  ) {
    return "Cancelled orders cannot request inventory reservation";
  }

  if (order.status === "fulfilled" && payload.status !== undefined && payload.status !== "fulfilled") {
    return "Fulfilled orders cannot move back to another status";
  }

  if (order.status === "cancelled") {
    return "Cancelled orders cannot be updated";
  }

  return null;
}

export const ordersRouter = Router();

ordersRouter.get("/", (_request, response) => {
  response.status(200).json({
    data: orders,
    meta: {
      count: orders.length
    }
  });
});

ordersRouter.get("/:id", (request, response) => {
  const order = orders.find((item) => item.id === request.params.id);

  if (!order) {
    response.status(404).json({ error: "Order not found" });
    return;
  }

  response.status(200).json({ data: order });
});

ordersRouter.post("/", async (request, response) => {
  const parsedPayload = createOrderSchema.safeParse(request.body);

  if (!parsedPayload.success) {
    response.status(400).json({
      error: "Invalid order payload",
      issues: parsedPayload.error.flatten()
    });
    return;
  }

  const payload = parsedPayload.data;
  const existingOrder = orders.find((item) => item.id === payload.id);

  if (existingOrder) {
    response.status(409).json({
      error: "Order with this id already exists"
    });
    return;
  }

  const now = new Date().toISOString();
  const totals = calculateOrderTotals(payload.items);

  const newOrder: Order = {
    ...payload,
    totals,
    status: "pending",
    paymentStatus: "unpaid",
    inventoryStatus: "not_requested",
    inventoryReservation: {
      reference: null,
      requestedAt: null,
      reservedAt: null,
      releasedAt: null
    },
    notes: ["Order created. Inventory reservation and payment workflows pending."],
    createdAt: now,
    updatedAt: now
  };

  orders.push(newOrder);

  await publishOrderEvent(newOrder, "order_created").catch(() => undefined);

  if (integrationsEnabled()) {
    try {
      await queueNotificationIfEnabled(newOrder, "order_created");
      newOrder.notes.push("Notification queued for order_created event.");
      newOrder.updatedAt = new Date().toISOString();
    } catch (error) {
      newOrder.notes.push(
        `Notification queue attempt failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      newOrder.updatedAt = new Date().toISOString();
    }
  }

  response.status(201).json({
    data: newOrder
  });
});

ordersRouter.patch("/:id/status", async (request, response) => {
  const parsedPayload = updateOrderStatusSchema.safeParse(request.body);

  if (!parsedPayload.success) {
    response.status(400).json({
      error: "Invalid status update payload",
      issues: parsedPayload.error.flatten()
    });
    return;
  }

  const order = orders.find((item) => item.id === request.params.id);

  if (!order) {
    response.status(404).json({ error: "Order not found" });
    return;
  }

  const payload = parsedPayload.data;
  const workflowError = validateOrderWorkflowUpdate(order, payload);

  if (workflowError) {
    response.status(409).json({
      error: workflowError
    });
    return;
  }

  if (payload.status !== undefined) {
    order.status = payload.status;
  }

  if (payload.paymentStatus !== undefined) {
    order.paymentStatus = payload.paymentStatus;
  }

  if (payload.inventoryStatus !== undefined) {
    order.inventoryStatus = payload.inventoryStatus;

    if (payload.inventoryStatus === "reservation_pending") {
      order.inventoryReservation.requestedAt = new Date().toISOString();
    }

    if (payload.inventoryStatus === "reserved") {
      order.inventoryReservation.reservedAt = new Date().toISOString();
    }

    if (payload.inventoryStatus === "released") {
      order.inventoryReservation.releasedAt = new Date().toISOString();
    }
  }

  if (payload.inventoryReservationReference !== undefined) {
    order.inventoryReservation.reference = payload.inventoryReservationReference;
  }

  if (payload.note !== undefined) {
    order.notes.push(payload.note);
  }

  order.updatedAt = new Date().toISOString();

  if (integrationsEnabled()) {
    try {
      if (payload.status === "paid") {
        await publishOrderEvent(order, "order_paid").catch(() => undefined);
        await queueNotificationIfEnabled(order, "order_paid");
        order.notes.push("Notification queued for order_paid event.");
      }

      if (payload.status === "fulfilled") {
        await publishOrderEvent(order, "order_fulfilled").catch(() => undefined);
        await queueNotificationIfEnabled(order, "order_fulfilled");
        order.notes.push("Notification queued for order_fulfilled event.");
      }

      order.updatedAt = new Date().toISOString();
    } catch (error) {
      order.notes.push(
        `Notification queue attempt failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      order.updatedAt = new Date().toISOString();
    }
  }

  if (!integrationsEnabled()) {
    if (payload.status === "paid") {
      await publishOrderEvent(order, "order_paid").catch(() => undefined);
    }

    if (payload.status === "fulfilled") {
      await publishOrderEvent(order, "order_fulfilled").catch(() => undefined);
    }
  }

  response.status(200).json({
    data: order
  });
});

ordersRouter.post("/:id/confirm", async (request, response) => {
  const parsedPayload = confirmOrderSchema.safeParse(request.body ?? {});

  if (!parsedPayload.success) {
    response.status(400).json({
      error: "Invalid confirm payload",
      issues: parsedPayload.error.flatten()
    });
    return;
  }

  const order = orders.find((item) => item.id === request.params.id);

  if (!order) {
    response.status(404).json({ error: "Order not found" });
    return;
  }

  if (order.status !== "pending") {
    response.status(409).json({
      error: "Only pending orders can be confirmed"
    });
    return;
  }

  applyInventoryReservationRequested(
    order,
    parsedPayload.data.note ?? "Inventory reservation requested."
  );

  await publishOrderEvent(order, "inventory_reservation_requested").catch(() => undefined);

  const reservationResult = await confirmOrderInventory(order);

  if (!reservationResult.success) {
    applyInventoryReservationFailed(order, reservationResult.message);

    if (integrationsEnabled()) {
      try {
        await queueNotificationIfEnabled(order, "inventory_reservation_failed");
        order.notes.push("Notification queued for inventory_reservation_failed event.");
        order.updatedAt = new Date().toISOString();
      } catch (error) {
        order.notes.push(
          `Notification queue attempt failed: ${error instanceof Error ? error.message : "Unknown error"}`
        );
        order.updatedAt = new Date().toISOString();
      }
    }

    response.status(409).json({
      error: reservationResult.message,
      data: order
    });
    return;
  }

  applyInventoryReserved(
    order,
    reservationResult.reservationReference ?? `res-${order.id}`
  );

  await publishOrderEvent(order, "order_confirmed").catch(() => undefined);

  if (integrationsEnabled()) {
    try {
      await queueNotificationIfEnabled(order, "order_confirmed");
      order.notes.push("Notification queued for order_confirmed event.");
      order.updatedAt = new Date().toISOString();
    } catch (error) {
      order.notes.push(
        `Notification queue attempt failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      order.updatedAt = new Date().toISOString();
    }
  }

  response.status(200).json({
    data: order
  });
});

ordersRouter.post("/:id/cancel", async (request, response) => {
  const parsedPayload = cancelOrderSchema.safeParse(request.body);

  if (!parsedPayload.success) {
    response.status(400).json({
      error: "Invalid cancel payload",
      issues: parsedPayload.error.flatten()
    });
    return;
  }

  const order = orders.find((item) => item.id === request.params.id);

  if (!order) {
    response.status(404).json({ error: "Order not found" });
    return;
  }

  if (order.status === "fulfilled") {
    response.status(409).json({
      error: "Fulfilled orders cannot be cancelled"
    });
    return;
  }

  if (order.status === "cancelled") {
    response.status(409).json({
      error: "Order is already cancelled"
    });
    return;
  }

  const shouldReleaseInventory = order.inventoryStatus === "reserved";

  if (shouldReleaseInventory && integrationsEnabled()) {
    try {
      await releaseOrderInventory(order);
      order.notes.push("Inventory release requested for cancelled order.");
    } catch (error) {
      response.status(502).json({
        error: error instanceof Error ? error.message : "Inventory release failed"
      });
      return;
    }
  }

  order.status = "cancelled";
  order.inventoryStatus =
    order.inventoryStatus === "reserved" || order.inventoryStatus === "reservation_pending"
      ? "released"
      : order.inventoryStatus;
  order.paymentStatus = order.paymentStatus === "paid" ? "refunded" : order.paymentStatus;
  order.inventoryReservation.releasedAt = new Date().toISOString();
  order.notes.push(`Order cancelled: ${parsedPayload.data.reason}`);
  order.updatedAt = new Date().toISOString();

  await publishOrderEvent(order, "order_cancelled").catch(() => undefined);

  if (integrationsEnabled()) {
    try {
      await queueNotificationIfEnabled(order, "order_cancelled");
      order.notes.push("Notification queued for order_cancelled event.");
      order.updatedAt = new Date().toISOString();
    } catch (error) {
      order.notes.push(
        `Notification queue attempt failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      order.updatedAt = new Date().toISOString();
    }
  }

  response.status(200).json({
    data: order
  });
});
