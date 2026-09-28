import { BookingStatus } from "@prisma/client";
import { Request, Response } from "express";
import * as bookingsService from "../services/bookings.service";

type ListQuery = {
  page: number;
  limit: number;
  status?: BookingStatus;
};

export async function createBooking(req: Request, res: Response): Promise<void> {
  const booking = await bookingsService.createBooking(req.user!.id, req.body);
  res.status(201).json(booking);
}

export async function listBookings(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListQuery;
  const result = await bookingsService.listBookings(req.user!.id, query);
  res.json(result);
}

export async function getBooking(req: Request, res: Response): Promise<void> {
  const booking = await bookingsService.getBooking(req.user!.id, req.params.bookingId);
  res.json(booking);
}

export async function cancelBooking(req: Request, res: Response): Promise<void> {
  const booking = await bookingsService.cancelBooking(req.user!.id, req.params.bookingId);
  res.json(booking);
}
