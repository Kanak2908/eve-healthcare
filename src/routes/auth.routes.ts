import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import * as authController from "../controllers/auth.controller";
import { env } from "../config";
import { asyncHandler } from "../middleware/asyncHandler";
import { validate } from "../middleware/validate";

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(72),
});

const signupSchema = credentialsSchema.extend({
  name: z.string().trim().min(1).max(80),
});

export const authRouter = Router();

if (env.nodeEnv !== "test") {
  authRouter.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 30,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        error: { code: "RATE_LIMITED", message: "Too many authentication attempts. Try again later." },
      },
    }),
  );
}

authRouter.post("/signup", validate({ body: signupSchema }), asyncHandler(authController.signup));
authRouter.post("/login", validate({ body: credentialsSchema }), asyncHandler(authController.login));
