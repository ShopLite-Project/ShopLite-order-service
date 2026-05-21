import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SERVICE_NAME: z.string().default("shoplite-order-service"),
  ENABLE_SERVICE_INTEGRATIONS: z.coerce.boolean().default(false),
  ENABLE_KAFKA: z.coerce.boolean().default(false),
  KAFKA_BROKERS: z
    .string()
    .default("localhost:9092")
    .transform((value) => value.split(",").map((entry) => entry.trim()).filter(Boolean)),
  KAFKA_CLIENT_ID: z.string().default("shoplite-order-service"),
  KAFKA_ORDER_EVENTS_TOPIC: z.string().default("shoplite.order-events"),
  KAFKA_INVENTORY_EVENTS_TOPIC: z.string().default("shoplite.inventory-events"),
  KAFKA_INVENTORY_CONSUMER_GROUP: z.string().default("shoplite-order-service-inventory"),
  INVENTORY_SERVICE_BASE_URL: z.string().url().default("http://localhost:3003"),
  NOTIFICATION_SERVICE_BASE_URL: z.string().url().default("http://localhost:3004")
});

export const env = envSchema.parse(process.env);
