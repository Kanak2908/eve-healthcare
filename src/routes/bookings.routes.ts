import { BookingStatus } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import * as bookingsController from "../controllers/bookings.controller";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { validate } from "../middleware/validate";

const createBookingSchema = z.object({
  testId: z.string().min(1),
  centreId: z.string().min(1),
  appointmentAt: z.string().datetime(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.nativeEnum(BookingStatus).optional(),
});

const bookingParams = z.object({
  bookingId: z.string().min(1),
});

export const bookingsRouter = Router();

bookingsRouter.use(requireAuth);

bookingsRouter.post("/", validate({ body: createBookingSchema }), asyncHandler(bookingsController.createBooking));
bookingsRouter.get("/", validate({ query: listQuerySchema }), asyncHandler(bookingsController.listBookings));
bookingsRouter.get("/:bookingId", validate({ params: bookingParams }), asyncHandler(bookingsController.getBooking));
bookingsRouter.post(
  "/:bookingId/cancel",
  validate({ params: bookingParams }),
  asyncHandler(bookingsController.cancelBooking),
);
