import express from "express";

import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { requestLogger } from "./middleware/request-logger.js";

const app = express();
app.disable("x-powered-by");

app.use(express.json());
app.use(requestLogger);

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "shaji-backend"
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

export default app;