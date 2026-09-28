import { app } from "./app";
import { env } from "./config";
import { logger } from "./lib/logger";
import { prisma } from "./lib/prisma";

const server = app.listen(env.port, () => {
  logger.info({ port: env.port }, "server started");
});

function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  server.close(() => {
    prisma
      .$disconnect()
      .catch((err: unknown) => logger.error({ err }, "disconnect failed"))
      .finally(() => process.exit(0));
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
