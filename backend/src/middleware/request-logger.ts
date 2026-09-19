import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

import { logger } from "../lib/logger.js";

export const requestLogger: RequestHandler = (req, res, next) => {
  const requestId = randomUUID();
  const startedAt = process.hrtime.bigint();

  res.setHeader("X-Request-Id", requestId);

  res.on("finish", () => {
    const finishedAt = process.hrtime.bigint();

    const durationMs =
      Number(finishedAt - startedAt) / 1_000_000;

    logger.info(
      {
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs
      },
      "HTTP request completed"
    );
  });

  next();
};