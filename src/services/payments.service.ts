import { BookingStatus, PaymentStatus, Prisma } from "@prisma/client";
import { AppError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { serializeBooking } from "./bookings.service";

export type PaymentOutcome = "SUCCESS" | "FAILED";

export type Settlement = {
  applied: boolean;
  reason: string | null;
  bookingId: string;
  bookingStatus: BookingStatus;
  paymentId: string | null;
  paymentStatus: PaymentStatus | null;
};

const bookingInclude = {
  centre: true,
  test: true,
  payment: true,
} satisfies Prisma.BookingInclude;

function bookingStatusFor(outcome: PaymentOutcome): BookingStatus {
  return outcome === "SUCCESS" ? BookingStatus.CONFIRMED : BookingStatus.FAILED;
}

function isUniqueViolation(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function lockBooking(tx: Prisma.TransactionClient, bookingId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Booking" WHERE "id" = ${bookingId} FOR UPDATE`;
}

async function settleInTransaction(
  tx: Prisma.TransactionClient,
  bookingId: string,
  outcome: PaymentOutcome,
): Promise<Settlement> {
  await lockBooking(tx, bookingId);
  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    include: { payment: true },
  });
  if (!booking) {
    throw new AppError(404, "BOOKING_NOT_FOUND", "Booking not found");
  }

  if (booking.status === BookingStatus.CANCELLED) {
    return {
      applied: false,
      reason: "BOOKING_CANCELLED",
      bookingId: booking.id,
      bookingStatus: booking.status,
      paymentId: booking.payment?.id ?? null,
      paymentStatus: booking.payment?.status ?? null,
    };
  }

  const alreadyPaid = booking.status === BookingStatus.CONFIRMED || booking.payment?.status === PaymentStatus.SUCCESS;
  if (alreadyPaid) {
    return {
      applied: false,
      reason: outcome === "SUCCESS" ? "ALREADY_CONFIRMED" : "TERMINAL_SUCCESS",
      bookingId: booking.id,
      bookingStatus: booking.status,
      paymentId: booking.payment?.id ?? null,
      paymentStatus: booking.payment?.status ?? null,
    };
  }

  if (booking.status === BookingStatus.FAILED && outcome === "FAILED" && booking.payment) {
    return {
      applied: false,
      reason: "ALREADY_FAILED",
      bookingId: booking.id,
      bookingStatus: booking.status,
      paymentId: booking.payment.id,
      paymentStatus: booking.payment.status,
    };
  }

  const paymentStatus = outcome === "SUCCESS" ? PaymentStatus.SUCCESS : PaymentStatus.FAILED;
  const payment = booking.payment
    ? await tx.payment.update({
        where: { id: booking.payment.id },
        data: { status: paymentStatus, amount: booking.amount },
      })
    : await tx.payment.create({
        data: {
          bookingId: booking.id,
          amount: booking.amount,
          status: paymentStatus,
        },
      });

  const updated = await tx.booking.update({
    where: { id: booking.id },
    data: { status: bookingStatusFor(outcome) },
  });

  return {
    applied: true,
    reason: null,
    bookingId: updated.id,
    bookingStatus: updated.status,
    paymentId: payment.id,
    paymentStatus: payment.status,
  };
}

export async function payForBooking(userId: string, bookingId: string, outcome: PaymentOutcome) {
  const owned = await prisma.booking.findFirst({
    where: { id: bookingId, userId },
    select: { id: true },
  });
  if (!owned) {
    throw new AppError(404, "BOOKING_NOT_FOUND", "Booking not found");
  }

  const settlement = await prisma.$transaction((tx) => settleInTransaction(tx, bookingId, outcome));

  if (!settlement.applied && settlement.reason === "BOOKING_CANCELLED") {
    throw new AppError(409, "BOOKING_CANCELLED", "Cancelled bookings cannot be paid");
  }
  if (!settlement.applied && settlement.reason === "TERMINAL_SUCCESS") {
    throw new AppError(409, "PAYMENT_TERMINAL", "A successful payment cannot be changed to failed");
  }

  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: bookingInclude,
  });
  return {
    applied: settlement.applied,
    reason: settlement.reason,
    booking: serializeBooking(booking),
  };
}

function replayResult(eventId: string, result: Prisma.JsonValue) {
  const stored = result && typeof result === "object" && !Array.isArray(result) ? result : {};
  return {
    ...stored,
    eventId,
    idempotentReplay: true,
  };
}

export async function handleWebhook(input: {
  eventId: string;
  bookingId: string;
  status: PaymentOutcome;
  amount?: string;
  payload: Prisma.InputJsonValue;
}) {
  const alreadyProcessed = await prisma.webhookEvent.findUnique({ where: { eventId: input.eventId } });
  if (alreadyProcessed) {
    return replayResult(input.eventId, alreadyProcessed.result);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.webhookEvent.create({
        data: {
          eventId: input.eventId,
          bookingId: input.bookingId,
          status: input.status,
          applied: false,
          payload: input.payload,
          result: {},
        },
      });

      const booking = await tx.booking.findUnique({
        where: { id: input.bookingId },
        select: { id: true, amount: true },
      });
      if (!booking) {
        throw new AppError(404, "BOOKING_NOT_FOUND", "Booking not found");
      }
      if (
        input.amount !== undefined &&
        !new Prisma.Decimal(booking.amount).equals(new Prisma.Decimal(input.amount))
      ) {
        throw new AppError(400, "AMOUNT_MISMATCH", "Webhook amount does not match the booking amount");
      }

      const settlement = await settleInTransaction(tx, input.bookingId, input.status);
      const result = { ...settlement, eventId: input.eventId, idempotentReplay: false };

      await tx.webhookEvent.update({
        where: { eventId: input.eventId },
        data: {
          applied: settlement.applied,
          paymentId: settlement.paymentId,
          bookingId: settlement.bookingId,
          result: result as unknown as Prisma.InputJsonValue,
        },
      });

      return result;
    });
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    const existing = await prisma.webhookEvent.findUnique({ where: { eventId: input.eventId } });
    if (!existing) {
      throw error;
    }
    return replayResult(input.eventId, existing.result);
  }
}
