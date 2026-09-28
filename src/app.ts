import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import swaggerUi from "swagger-ui-express";
import { env } from "./config";
import { logger } from "./lib/logger";
import { errorHandler, notFound } from "./middleware/errorHandler";
import { authRouter } from "./routes/auth.routes";
import { bookingsRouter } from "./routes/bookings.routes";
import { centresRouter } from "./routes/centres.routes";
import { paymentsRouter } from "./routes/payments.routes";
import { openApiDocument } from "./docs/openapi";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );
  app.use(cors());
  app.use(express.json({ limit: "100kb" }));

  if (env.nodeEnv !== "test") {
    app.use(
      pinoHttp({
        logger,
        redact: ["req.headers.authorization", "req.headers['x-webhook-secret']"],
      }),
    );
  }

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/openapi.json", (_req, res) => {
    res.json(openApiDocument);
  });
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

  app.use("/auth", authRouter);
  app.use("/centres", centresRouter);
  app.use("/bookings", bookingsRouter);
  app.use("/payments", paymentsRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

export const app = createApp();
