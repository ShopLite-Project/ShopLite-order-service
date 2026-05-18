import request from "supertest";

import { app } from "../src/app";

describe("ShopLite order service", () => {
  it("returns service health", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });

  it("returns seeded orders", async () => {
    const response = await request(app).get("/orders");

    expect(response.status).toBe(200);
    expect(response.body.meta.count).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it("returns 404 for unknown order", async () => {
    const response = await request(app).get("/orders/does-not-exist");

    expect(response.status).toBe(404);
  });

  it("creates an order", async () => {
    const response = await request(app).post("/orders").send({
      id: "ord-1002",
      customer: {
        id: "cus-002",
        email: "shopper@example.com",
        firstName: "Jane",
        lastName: "Doe",
        loyaltyTier: "new"
      },
      items: [
        {
          productId: "prd-002",
          name: "Mechanical Keyboard",
          quantity: 1,
          unitPrice: 89.99
        }
      ],
      shippingAddress: {
        street: "18 Admiralty Road",
        city: "Lekki",
        state: "Lagos",
        country: "Nigeria",
        postalCode: "100001"
      },
      currency: "USD"
    });

    expect(response.status).toBe(201);
    expect(response.body.data.id).toBe("ord-1002");
    expect(response.body.data.status).toBe("pending");
    expect(response.body.data.paymentStatus).toBe("unpaid");
    expect(response.body.data.inventoryStatus).toBe("unchecked");
    expect(response.body.data.totals.totalAmount).toBeGreaterThan(89.99);
  });

  it("rejects duplicate product ids in one order", async () => {
    const response = await request(app).post("/orders").send({
      id: "ord-1003",
      customer: {
        id: "cus-003",
        email: "duplicate@example.com",
        firstName: "Timi",
        lastName: "Cole",
        loyaltyTier: "silver"
      },
      items: [
        {
          productId: "prd-002",
          name: "Mechanical Keyboard",
          quantity: 1,
          unitPrice: 89.99
        },
        {
          productId: "prd-002",
          name: "Mechanical Keyboard",
          quantity: 1,
          unitPrice: 89.99
        }
      ],
      shippingAddress: {
        street: "44 Broad Street",
        city: "Lagos",
        state: "Lagos",
        country: "Nigeria",
        postalCode: "100211"
      },
      currency: "usd"
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid order payload");
  });

  it("updates order workflow state", async () => {
    const confirmResponse = await request(app).patch("/orders/ord-1001/status").send({
      status: "paid",
      paymentStatus: "paid",
      inventoryStatus: "reserved",
      note: "Payment captured and stock reserved."
    });

    expect(confirmResponse.status).toBe(200);
    expect(confirmResponse.body.data.status).toBe("paid");
    expect(confirmResponse.body.data.paymentStatus).toBe("paid");

    const fulfillResponse = await request(app).patch("/orders/ord-1001/status").send({
      status: "fulfilled",
      note: "Order packed and handed to dispatch."
    });

    expect(fulfillResponse.status).toBe(200);
    expect(fulfillResponse.body.data.status).toBe("fulfilled");
    expect(fulfillResponse.body.data.notes.at(-1)).toContain("dispatch");
  });

  it("rejects impossible workflow transitions", async () => {
    const response = await request(app).patch("/orders/ord-1002/status").send({
      status: "fulfilled"
    });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain("pending");
  });

  it("cancels an order cleanly", async () => {
    await request(app).post("/orders").send({
      id: "ord-1004",
      customer: {
        id: "cus-004",
        email: "cancel@example.com",
        firstName: "Mira",
        lastName: "Stone",
        loyaltyTier: "new"
      },
      items: [
        {
          productId: "prd-005",
          name: "Personal Wellness Consultation",
          quantity: 1,
          unitPrice: 60
        }
      ],
      shippingAddress: {
        street: "7 Marina Road",
        city: "Lagos",
        state: "Lagos",
        country: "Nigeria",
        postalCode: "100242"
      },
      currency: "USD"
    });

    const response = await request(app).post("/orders/ord-1004/cancel").send({
      reason: "Customer changed their mind before processing."
    });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("cancelled");
    expect(response.body.data.notes.at(-1)).toContain("Customer changed");
  });
});
