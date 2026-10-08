import { PrismaPg } from "@prisma/adapter-pg";

import { env } from "../config/env.js";
import { PrismaClient } from "../generated/prisma/client.js";

const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,

  max: env.DB_POOL_MAX,

  connectionTimeoutMillis:
    env.DB_CONNECTION_TIMEOUT_MS,

  idleTimeoutMillis:
    env.DB_IDLE_TIMEOUT_MS,

  statement_timeout:
    env.DB_STATEMENT_TIMEOUT_MS,

  idle_in_transaction_session_timeout:
    env.DB_IDLE_TRANSACTION_TIMEOUT_MS,

  application_name: "shaji-api"
});

export const prisma = new PrismaClient({
  adapter
});