# ShopLite Direct HTTP Flow

This document describes the intended service-to-service flow before Kafka is introduced.

## Why this exists

Right now, the goal is to keep the platform understandable:
- each service has a clear responsibility
- communication is explicit
- the same flow can later be replaced with Kafka events

## Service responsibilities

- `product-service` owns product catalog data
- `order-service` owns order workflow state
- `inventory-service` owns stock counts and reservation/release operations
- `notification-service` owns customer-facing notifications

## Happy path

1. The frontend reads products from `product-service`.
2. The customer places an order through `order-service`.
3. `order-service` creates the order with:
   - `status: pending`
   - `paymentStatus: unpaid`
   - `inventoryStatus: not_requested`
4. `order-service` calls `inventory-service` to reserve stock.
5. If reservation succeeds, `order-service` updates the order to:
   - `status: confirmed`
   - `inventoryStatus: reserved`
   - `inventoryReservation.reference: <reservation id>`
6. `order-service` calls `notification-service` with an `order_confirmed` event.
7. Later, payment is confirmed and `order-service` updates the order to `paid`.
8. `order-service` calls `notification-service` with an `order_paid` event.
9. When fulfillment is complete, `order-service` moves the order to `fulfilled`.
10. `order-service` calls `notification-service` with an `order_fulfilled` event.

## Failure path

1. `order-service` requests an inventory reservation.
2. If `inventory-service` cannot reserve stock, the order should not move to `confirmed`.
3. `order-service` can keep the order in a non-fulfilled state and mark inventory as `failed`.
4. `notification-service` can receive an `inventory_reservation_failed` event if the customer should be informed.

## Cancellation path

1. A user or operator cancels the order through `order-service`.
2. If stock had already been reserved, `order-service` calls `inventory-service` to release it.
3. `order-service` updates the order to `cancelled`.
4. If payment had already been completed, `order-service` marks it as refunded.
5. `order-service` calls `notification-service` with an `order_cancelled` event.

## Why this helps before Kafka

This direct HTTP flow gives you:
- a working mental model
- testable service boundaries
- a clear map for later Kafka producers and consumers

When Kafka is introduced later, the service responsibilities should stay the same. Only the transport changes.
