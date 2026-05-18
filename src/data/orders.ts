import { Order } from "../types/order";

export const orders: Order[] = [
  {
    id: "ord-1001",
    customer: {
      id: "cus-001",
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Okafor",
      loyaltyTier: "gold"
    },
    items: [
      {
        productId: "prd-001",
        name: "Wireless Mouse",
        quantity: 1,
        unitPrice: 29.99
      }
    ],
    shippingAddress: {
      street: "12 Admiralty Way",
      city: "Lekki",
      state: "Lagos",
      country: "Nigeria",
      postalCode: "106104"
    },
    currency: "USD",
    totals: {
      subtotalAmount: 29.99,
      shippingAmount: 5,
      taxAmount: 2.4,
      totalAmount: 37.39
    },
    status: "confirmed",
    paymentStatus: "paid",
    inventoryStatus: "reserved",
    notes: ["Seed order for local development."],
    createdAt: "2026-05-15T09:00:00.000Z",
    updatedAt: "2026-05-15T09:10:00.000Z"
  }
];
