import dotenv from "dotenv";

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET", process.env.NODE_ENV === "production" ? undefined : "dev-only-secret"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  webhookSecret: required("WEBHOOK_SECRET", process.env.NODE_ENV === "production" ? undefined : "whsec_dev"),
  logLevel: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 10),
};
