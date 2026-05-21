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
- `POST /orders/:id/confirm`
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
4. `order-service` can call `POST /orders/:id/confirm` to orchestrate reservation over HTTP
5. if reservation succeeds, `order-service` is updated to:
   - `status: confirmed`
   - `inventoryStatus: reserved`
   - `inventoryReservationReference: <reservation id>`
6. `notification-service` can be called to queue an `order_confirmed` notification
7. if payment succeeds, the order can move to `paid`
8. only then can the order move to `fulfilled`
9. if the order is cancelled, inventory is marked `released`

This keeps the responsibilities clean:

- `order-service` owns workflow state
- `inventory-service` owns actual stock counts and reservation records

## Local development

```bash
npm ci
npm run dev
```

## Integration settings

Set these when you want `order-service` to call other local services directly:

```bash
ENABLE_SERVICE_INTEGRATIONS=true
INVENTORY_SERVICE_BASE_URL=http://localhost:3003
NOTIFICATION_SERVICE_BASE_URL=http://localhost:3004
```

## Kafka Notes

Kafka is the message broker, not a folder inside the service.

- local `docker-compose` is used to run a real Kafka broker during development
- service code such as `src/kafka/` or Kafka-related service modules contains the producer and consumer logic
- `order-service` publishes order events
- other services subscribe to those events and react independently

Simple mental model:

- Docker Compose starts Kafka locally
- this service connects to Kafka through its application code
- Kafka carries events between services

For Kubernetes later:

- Kafka runs in pods, just like the application services run in pods
- a Kafka operator such as Strimzi can manage the Kafka brokers for you
- your service code does not change much; the broker address changes from local Docker networking to Kubernetes service discovery

## Docker

```bash
docker build -t shoplite-order-service:local .
docker run -p 3001:3001 shoplite-order-service:local
```
