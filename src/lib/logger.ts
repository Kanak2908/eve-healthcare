import pino from "pino";
import { env } from "../config";

export const logger = pino({
  level: env.logLevel,
  redact: {
    paths: ["req.headers.authorization", "req.headers['x-webhook-secret']"],
    remove: true,
  },
});
