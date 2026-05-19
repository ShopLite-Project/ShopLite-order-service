export type OrderStatus =
  | "pending"
  | "confirmed"
  | "paid"
  | "fulfilled"
  | "cancelled";

export type PaymentStatus = "unpaid" | "authorized" | "paid" | "refunded";

export type InventoryStatus =
  | "not_requested"
  | "reservation_pending"
  | "reserved"
  | "released"
  | "failed";

export interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface CustomerProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  loyaltyTier: "new" | "silver" | "gold";
}

export interface ShippingAddress {
  street: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}

export interface OrderTotals {
  subtotalAmount: number;
  shippingAmount: number;
  taxAmount: number;
  totalAmount: number;
}

export interface OrderInventoryReservation {
  reference: string | null;
  requestedAt: string | null;
  reservedAt: string | null;
  releasedAt: string | null;
}

export interface Order {
  id: string;
  customer: CustomerProfile;
  items: OrderItem[];
  shippingAddress: ShippingAddress;
  currency: string;
  totals: OrderTotals;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  inventoryStatus: InventoryStatus;
  inventoryReservation: OrderInventoryReservation;
  notes: string[];
  createdAt: string;
  updatedAt: string;
}
