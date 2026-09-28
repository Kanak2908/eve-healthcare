import { BookingStatus, Prisma } from "@prisma/client";
import { AppError } from "../lib/errors";
import { toMoney } from "../lib/money";
import { prisma } from "../lib/prisma";

const MAX_LEAD_MS = 180 * 24 * 60 * 60 * 1000;

const bookingInclude = {
  centre: true,
  test: true,
  payment: true,
} satisfies Prisma.BookingInclude;

type BookingWithRelations = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

export function serializeBooking(booking: BookingWithRelations) {
  return {
    id: booking.id,
    status: booking.status,
    appointmentAt: booking.appointmentAt.toISOString(),
    amount: toMoney(booking.amount),
    centre: {
      id: booking.centre.id,
      name: booking.centre.name,
      location: booking.centre.location,
    },
    test: {
      id: booking.test.id,
      name: booking.test.name,
      price: toMoney(booking.test.price),
    },
    payment: booking.payment
      ? {
          id: booking.payment.id,
          status: booking.payment.status,
          amount: toMoney(booking.payment.amount),
        }
      : null,
    createdAt: booking.createdAt.toISOString(),
    updatedAt: booking.updatedAt.toISOString(),
  };
}

export async function createBooking(
  userId: string,
  input: { testId: string; centreId: string; appointmentAt: string },
) {
  const appointmentAt = new Date(input.appointmentAt);
  const now = Date.now();
  if (appointmentAt.getTime() <= now) {
    throw new AppError(400, "APPOINTMENT_IN_PAST", "Appointment time must be in the future");
  }
  if (appointmentAt.getTime() > now + MAX_LEAD_MS) {
    throw new AppError(400, "APPOINTMENT_TOO_FAR", "Appointment time must be within 180 days");
  }

  const test = await prisma.diagnosticTest.findUnique({ where: { id: input.testId } });
  if (!test) {
    throw new AppError(404, "TEST_NOT_FOUND", "Diagnostic test not found");
  }
  if (test.centreId !== input.centreId) {
    throw new AppError(400, "TEST_CENTRE_MISMATCH", "This test is not offered by the selected centre");
  }

  const existing = await prisma.booking.findFirst({
    where: {
      userId,
      appointmentAt,
      status: { not: BookingStatus.CANCELLED },
    },
    select: { id: true },
  });
  if (existing) {
    throw new AppError(409, "SLOT_TAKEN", "You already have an active booking at this time");
  }

  try {
    const booking = await prisma.booking.create({
      data: {
        userId,
        testId: test.id,
        centreId: test.centreId,
        appointmentAt,
        amount: test.price,
        status: BookingStatus.PENDING,
      },
      include: bookingInclude,
    });
    return serializeBooking(booking);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "SLOT_TAKEN", "You already have an active booking at this time");
    }
    throw error;
  }
}

export async function listBookings(
  userId: string,
  query: { page: number; limit: number; status?: BookingStatus },
) {
  const where: Prisma.BookingWhereInput = {
    userId,
    ...(query.status ? { status: query.status } : {}),
  };
  const skip = (query.page - 1) * query.limit;
  const [bookings, total] = await prisma.$transaction([
    prisma.booking.findMany({
      where,
      include: bookingInclude,
      orderBy: { appointmentAt: "asc" },
      skip,
      take: query.limit,
    }),
    prisma.booking.count({ where }),
  ]);
  return {
    data: bookings.map(serializeBooking),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

export async function getBooking(userId: string, bookingId: string) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, userId },
    include: bookingInclude,
  });
  if (!booking) {
    throw new AppError(404, "BOOKING_NOT_FOUND", "Booking not found");
  }
  return serializeBooking(booking);
}

export async function cancelBooking(userId: string, bookingId: string) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, userId },
    include: bookingInclude,
  });
  if (!booking) {
    throw new AppError(404, "BOOKING_NOT_FOUND", "Booking not found");
  }
  if (booking.status === BookingStatus.CANCELLED) {
    return serializeBooking(booking);
  }
  if (booking.status === BookingStatus.CONFIRMED) {
    throw new AppError(409, "BOOKING_NOT_CANCELLABLE", "Confirmed bookings cannot be cancelled");
  }

  const cancelled = await prisma.booking.updateMany({
    where: {
      id: booking.id,
      userId,
      status: { in: [BookingStatus.PENDING, BookingStatus.FAILED] },
    },
    data: { status: BookingStatus.CANCELLED },
  });

  const updated = await prisma.booking.findFirst({
    where: { id: booking.id, userId },
    include: bookingInclude,
  });
  if (!updated) {
    throw new AppError(404, "BOOKING_NOT_FOUND", "Booking not found");
  }
  if (cancelled.count === 0 && updated.status !== BookingStatus.CANCELLED) {
    throw new AppError(409, "BOOKING_NOT_CANCELLABLE", "Confirmed bookings cannot be cancelled");
  }
  return serializeBooking(updated);
}
