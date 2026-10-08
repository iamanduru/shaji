import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce
    .number()
    .int()
    .positive()
    .default(3000),

  DATABASE_URL: z
    .string()
    .min(1)
    .refine(
      (value) =>
        value.startsWith("postgresql://") ||
        value.startsWith("postgres://"),
      {
        message: "DATABASE_URL must be a PostgreSQL connection URL"
      }
    ),

  DB_POOL_MAX: z.coerce
    .number()
    .int()
    .positive()
    .default(10),

  DB_CONNECTION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(5000),

  DB_IDLE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(30000),

  DB_STATEMENT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(10000),

  DB_IDLE_TRANSACTION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(10000)
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error("Invalid environment configuration.");
  console.error(result.error.flatten().fieldErrors);

  process.exit(1);
}

export const env = result.data;