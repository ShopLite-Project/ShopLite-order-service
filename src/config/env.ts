import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SERVICE_NAME: z.string().default("shoplite-order-service"),
  ENABLE_SERVICE_INTEGRATIONS: z.coerce.boolean().default(false),
  INVENTORY_SERVICE_BASE_URL: z.string().url().default("http://localhost:3003"),
  NOTIFICATION_SERVICE_BASE_URL: z.string().url().default("http://localhost:3004")
});

export const env = envSchema.parse(process.env);
