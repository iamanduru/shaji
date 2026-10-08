import type { Server } from "node:http";

import app from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";

let server: Server | undefined;
let isShuttingDown = false;

async function start(): Promise<void> {
  try {
    await prisma.$connect();

    // Force an actual database round trip.
    // PrismaPg may initialise a pool without immediately opening
    // a PostgreSQL connection, so SELECT 1 acts as our readiness check.
    await prisma.$queryRaw`SELECT 1`;

    logger.info("Database connection established");

    server = app.listen(env.PORT, () => {
      logger.info(
        { port: env.PORT },
        "Shaji backend started"
      );
    });
  } catch (error) {
    logger.fatal(
      { err: error },
      "Failed to start Shaji backend"
    );

    await prisma
      .$disconnect()
      .catch(() => undefined);

    process.exit(1);
  }
}

async function shutdown(
  reason: string,
  exitCode = 0
): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  logger.info(
    { reason },
    "Graceful shutdown started"
  );

  const forceShutdownTimer = setTimeout(() => {
    logger.error("Graceful shutdown timed out");
    process.exit(1);
  }, 10_000);

  forceShutdownTimer.unref();

  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });

      logger.info("HTTP server closed");
    }

    await prisma.$disconnect();

    logger.info("Database connection closed");

    clearTimeout(forceShutdownTimer);

    process.exit(exitCode);
  } catch (error) {
    clearTimeout(forceShutdownTimer);

    logger.error(
      { err: error },
      "Error during graceful shutdown"
    );

    process.exit(1);
  }
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.once("uncaughtException", (error) => {
  logger.fatal(
    { err: error },
    "Uncaught exception"
  );

  void shutdown("uncaughtException", 1);
});

process.once("unhandledRejection", (reason) => {
  logger.fatal(
    { err: reason },
    "Unhandled promise rejection"
  );

  void shutdown("unhandledRejection", 1);
});

void start();