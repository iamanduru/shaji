import express from "express";
import helmet from "helmet";

import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { requestLogger } from "./middleware/request-logger.js";

const app = express();
app.disable("x-powered-by");

app.use(helmet());
app.use(
  express.json({
    limit: "100kb"
  })
);

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