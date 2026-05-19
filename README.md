# ShopLite Order Service

Order orchestration microservice for the ShopLite demo platform.

This service is intentionally small but shows the control points you need for a modern platform demo:

- order creation and lookup
- order lifecycle state changes
- payment and inventory state placeholders for later integrations

## Endpoints

- `GET /health`
- `GET /orders`
- `GET /orders/:id`
- `POST /orders`
- `PATCH /orders/:id/status`
- `POST /orders/:id/cancel`

## Current model

Each order now carries:

- customer details
- shipping address
- server-calculated totals
- order status
- payment status
- inventory status
- inventory reservation reference/timestamps
- notes for workflow updates

That keeps the service simple now, while making it easier to connect payment, inventory, and event-driven workflows later.

## Workflow rules

- `pending` can move to `confirmed` or `cancelled`
- `confirmed` can move to `paid` or `cancelled`
- `paid` can move to `fulfilled` or `cancelled`
- `fulfilled` is terminal
- `cancelled` is terminal

Additional guards:

- an order cannot become `fulfilled` before payment is `paid`
- an order cannot become `fulfilled` before inventory is `reserved`
- cancelling a paid order marks payment as `refunded`
- cancelling a reserved order releases inventory

## Order and Inventory Contract

Current intended flow:

1. `order-service` creates an order with `inventoryStatus: not_requested`
2. when the order is ready for stock allocation, it moves to `reservation_pending`
3. `inventory-service` reserves stock by `orderId`, `productId`, and `quantity`
4. `order-service` is then updated to:
   - `status: confirmed`
   - `inventoryStatus: reserved`
   - `inventoryReservationReference: <reservation id>`
5. if payment succeeds, the order can move to `paid`
6. only then can the order move to `fulfilled`
7. if the order is cancelled, inventory is marked `released`

This keeps the responsibilities clean:

- `order-service` owns workflow state
- `inventory-service` owns actual stock counts and reservation records

## Local development

```bash
npm ci
npm run dev
```

## Docker

```bash
docker build -t shoplite-order-service:local .
docker run -p 3001:3001 shoplite-order-service:local
```
