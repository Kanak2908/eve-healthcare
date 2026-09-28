import { PrismaClient } from "@prisma/client";
import { env } from "../config";

export const prisma = new PrismaClient({
  log: env.nodeEnv === "development" ? ["error", "warn"] : [],
});
