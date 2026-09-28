import { Request, Response } from "express";
import { env } from "../config";
import { AppError } from "../lib/errors";
import * as paymentsService from "../services/payments.service";

export async function pay(req: Request, res: Response): Promise<void> {
  const result = await paymentsService.payForBooking(req.user!.id, req.body.bookingId, req.body.outcome);
  res.status(200).json(result);
}

export async function webhook(req: Request, res: Response): Promise<void> {
  const secret = req.header("x-webhook-secret");
  if (!secret || secret !== env.webhookSecret) {
    throw new AppError(401, "INVALID_WEBHOOK_SECRET", "Invalid webhook secret");
  }
  const result = await paymentsService.handleWebhook({
    ...req.body,
    payload: req.body,
  });
  res.status(200).json(result);
}
