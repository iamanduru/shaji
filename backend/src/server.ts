import app from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";

const server = app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT },
    "Shaji backend started"
  );
});

let isShuttingDown = false;

function shutdown(reason: string, exitCode = 0): void {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  logger.info(
    { reason },
    "Graceful shutdown started"
  );

  server.close((error) => {
    if (error) {
      logger.error(
        { err: error },
        "Failed to close HTTP server"
      );

      process.exit(1);
    }

    logger.info("HTTP server closed");

    process.exit(exitCode);
  });

  setTimeout(() => {
    logger.error("Graceful shutdown timed out");

    process.exit(1);
  }, 10_000).unref();
}

process.once("SIGINT", () => {
  shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  shutdown("SIGTERM");
});

process.once("uncaughtException", (error) => {
  logger.fatal(
    { err: error },
    "Uncaught exception"
  );

  shutdown("uncaughtException", 1);
});

process.once("unhandledRejection", (reason) => {
  logger.fatal(
    { err: reason },
    "Unhandled promise rejection"
  );

  shutdown("unhandledRejection", 1);
});