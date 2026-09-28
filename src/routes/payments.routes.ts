import { Router } from "express";
import { z } from "zod";
import * as paymentsController from "../controllers/payments.controller";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { validate } from "../middleware/validate";

const outcomeSchema = z.enum(["SUCCESS", "FAILED"]);

const paySchema = z.object({
  bookingId: z.string().min(1),
  outcome: outcomeSchema,
});

const webhookSchema = z.object({
  eventId: z.string().trim().min(1).max(128),
  bookingId: z.string().min(1),
  status: outcomeSchema,
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .optional(),
});

export const paymentsRouter = Router();

paymentsRouter.post("/webhook", validate({ body: webhookSchema }), asyncHandler(paymentsController.webhook));
paymentsRouter.post("/", requireAuth, validate({ body: paySchema }), asyncHandler(paymentsController.pay));
