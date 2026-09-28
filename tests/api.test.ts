import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? "test-webhook-secret";

async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "WebhookEvent", "Payment", "Booking", "DiagnosticTest", "DiagnosticCentre", "User" RESTART IDENTITY CASCADE;
  `);
}

function futureIso(hoursAhead = 48) {
  return new Date(Date.now() + hoursAhead * 60 * 60 * 1000).toISOString();
}

async function signup(email = "asha@example.com") {
  const response = await request(app).post("/auth/signup").send({
    name: "Asha Rao",
    email,
    password: "password123",
  });
  expect(response.status).toBe(201);
  return response.body as { token: string; user: { id: string; email: string } };
}

async function createCatalogue(token: string, price = "499.00") {
  const centre = await request(app)
    .post("/centres")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "EVE Koramangala", location: "Koramangala, Bengaluru" });
  expect(centre.status).toBe(201);

  const test = await request(app)
    .post(`/centres/${centre.body.id}/tests`)
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Complete Blood Count", description: "CBC", price });
  expect(test.status).toBe(201);

  return { centreId: centre.body.id as string, testId: test.body.id as string };
}

async function book(token: string, centreId: string, testId: string, appointmentAt = futureIso()) {
  return request(app).post("/bookings").set("Authorization", `Bearer ${token}`).send({
    centreId,
    testId,
    appointmentAt,
  });
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
});

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("auth", () => {
  it("rejects invalid signup payloads", async () => {
    const response = await request(app).post("/auth/signup").send({ email: "not-an-email", password: "short", name: "" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("signs up and logs in", async () => {
    const created = await signup();
    expect(created.token).toEqual(expect.any(String));

    const login = await request(app).post("/auth/login").send({ email: "Asha@Example.com", password: "password123" });
    expect(login.status).toBe(200);
    expect(login.body.user.email).toBe("asha@example.com");
  });

  it("does not reveal whether an email exists", async () => {
    await signup();
    const wrongPassword = await request(app).post("/auth/login").send({ email: "asha@example.com", password: "wrong-password" });
    const unknown = await request(app).post("/auth/login").send({ email: "missing@example.com", password: "password123" });
    expect(wrongPassword.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknown.body);
  });

  it("rejects a duplicate email", async () => {
    await signup();
    const duplicate = await request(app).post("/auth/signup").send({
      name: "Asha Rao",
      email: "asha@example.com",
      password: "password123",
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("EMAIL_TAKEN");
  });
});

describe("centres and tests", () => {
  it("requires auth to create a centre and lists it publicly", async () => {
    const unauthenticated = await request(app).post("/centres").send({ name: "EVE", location: "Bengaluru" });
    expect(unauthenticated.status).toBe(401);

    const { token } = await signup();
    const created = await request(app)
      .post("/centres")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "EVE Koramangala", location: "Bengaluru" });
    expect(created.status).toBe(201);

    const list = await request(app).get("/centres");
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.pagination.total).toBe(1);

    const detail = await request(app).get(`/centres/${created.body.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.tests).toEqual([]);
  });

  it("rejects a duplicate test name at the same centre", async () => {
    const { token } = await signup();
    const { centreId } = await createCatalogue(token);
    const duplicate = await request(app)
      .post(`/centres/${centreId}/tests`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Complete Blood Count", price: "100.00" });
    expect(duplicate.status).toBe(409);
  });
});

describe("bookings", () => {
  it("prices the booking from the catalogue and hides other users' bookings", async () => {
    const owner = await signup();
    const other = await signup("other@example.com");
    const { centreId, testId } = await createCatalogue(owner.token, "899.50");

    const created = await book(owner.token, centreId, testId);
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("PENDING");
    expect(created.body.amount).toBe("899.50");
    expect(created.body.payment).toBeNull();

    const own = await request(app).get(`/bookings/${created.body.id}`).set("Authorization", `Bearer ${owner.token}`);
    expect(own.status).toBe(200);

    const foreign = await request(app).get(`/bookings/${created.body.id}`).set("Authorization", `Bearer ${other.token}`);
    expect(foreign.status).toBe(404);

    const foreignCancel = await request(app)
      .post(`/bookings/${created.body.id}/cancel`)
      .set("Authorization", `Bearer ${other.token}`);
    expect(foreignCancel.status).toBe(404);
  });

  it("rejects past appointments, mismatched centres, and a second active slot", async () => {
    const { token } = await signup();
    const { centreId, testId } = await createCatalogue(token);
    const otherCentre = await request(app)
      .post("/centres")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "EVE Bandra", location: "Mumbai" });

    const past = await book(token, centreId, testId, new Date(Date.now() - 60_000).toISOString());
    expect(past.status).toBe(400);
    expect(past.body.error.code).toBe("APPOINTMENT_IN_PAST");

    const mismatch = await book(token, otherCentre.body.id, testId);
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error.code).toBe("TEST_CENTRE_MISMATCH");

    const when = futureIso(72);
    const first = await book(token, centreId, testId, when);
    expect(first.status).toBe(201);
    const second = await book(token, centreId, testId, when);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("SLOT_TAKEN");
  });

  it("cancels a pending booking idempotently and blocks payment afterwards", async () => {
    const { token } = await signup();
    const { centreId, testId } = await createCatalogue(token);
    const created = await book(token, centreId, testId);
    const cancelled = await request(app).post(`/bookings/${created.body.id}/cancel`).set("Authorization", `Bearer ${token}`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe("CANCELLED");

    const again = await request(app).post(`/bookings/${created.body.id}/cancel`).set("Authorization", `Bearer ${token}`);
    expect(again.status).toBe(200);
    expect(again.body.status).toBe("CANCELLED");

    const payment = await request(app)
      .post("/payments")
      .set("Authorization", `Bearer ${token}`)
      .send({ bookingId: created.body.id, outcome: "SUCCESS" });
    expect(payment.status).toBe(409);
    expect(payment.body.error.code).toBe("BOOKING_CANCELLED");
  });
});

describe("payments and webhooks", () => {
  it("confirms a booking on success and does not create a second payment", async () => {
    const { token } = await signup();
    const { centreId, testId } = await createCatalogue(token);
    const created = await book(token, centreId, testId);

    const first = await request(app)
      .post("/payments")
      .set("Authorization", `Bearer ${token}`)
      .send({ bookingId: created.body.id, outcome: "SUCCESS" });
    expect(first.status).toBe(200);
    expect(first.body.applied).toBe(true);
    expect(first.body.booking.status).toBe("CONFIRMED");

    const second = await request(app)
      .post("/payments")
      .set("Authorization", `Bearer ${token}`)
      .send({ bookingId: created.body.id, outcome: "SUCCESS" });
    expect(second.status).toBe(200);
    expect(second.body.applied).toBe(false);
    expect(second.body.booking.payment.id).toBe(first.body.booking.payment.id);

    const downgrade = await request(app)
      .post("/payments")
      .set("Authorization", `Bearer ${token}`)
      .send({ bookingId: created.body.id, outcome: "FAILED" });
    expect(downgrade.status).toBe(409);

    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.booking.count({ where: { status: "CONFIRMED" } })).toBe(1);
  });

  it("lets a failed payment be retried through the webhook without duplicating rows", async () => {
    const { token } = await signup();
    const { centreId, testId } = await createCatalogue(token, "650.00");
    const created = await book(token, centreId, testId);

    const failed = await request(app)
      .post("/payments")
      .set("Authorization", `Bearer ${token}`)
      .send({ bookingId: created.body.id, outcome: "FAILED" });
    expect(failed.body.booking.status).toBe("FAILED");

    const webhook = await request(app).post("/payments/webhook").set("X-Webhook-Secret", WEBHOOK_SECRET).send({
      eventId: "evt_retry_1",
      bookingId: created.body.id,
      status: "SUCCESS",
      amount: "650.00",
    });
    expect(webhook.status).toBe(200);
    expect(webhook.body.applied).toBe(true);
    expect(webhook.body.bookingStatus).toBe("CONFIRMED");
    expect(webhook.body.idempotentReplay).toBe(false);

    const replay = await request(app).post("/payments/webhook").set("X-Webhook-Secret", WEBHOOK_SECRET).send({
      eventId: "evt_retry_1",
      bookingId: created.body.id,
      status: "SUCCESS",
      amount: "650.00",
    });
    expect(replay.status).toBe(200);
    expect(replay.body.idempotentReplay).toBe(true);
    expect(replay.body.applied).toBe(true);

    const conflicting = await request(app).post("/payments/webhook").set("X-Webhook-Secret", WEBHOOK_SECRET).send({
      eventId: "evt_retry_2",
      bookingId: created.body.id,
      status: "FAILED",
    });
    expect(conflicting.status).toBe(200);
    expect(conflicting.body.applied).toBe(false);
    expect(conflicting.body.reason).toBe("TERMINAL_SUCCESS");

    const booking = await request(app).get(`/bookings/${created.body.id}`).set("Authorization", `Bearer ${token}`);
    expect(booking.body.status).toBe("CONFIRMED");
    expect(await prisma.payment.count()).toBe(1);
    expect(await prisma.webhookEvent.count()).toBe(2);
  });

  it("rejects a bad webhook secret, an unknown booking, and an amount mismatch", async () => {
    const { token } = await signup();
    const { centreId, testId } = await createCatalogue(token, "499.00");
    const created = await book(token, centreId, testId);

    const unauthorized = await request(app).post("/payments/webhook").send({
      eventId: "evt_unauth",
      bookingId: created.body.id,
      status: "SUCCESS",
    });
    expect(unauthorized.status).toBe(401);

    const missing = await request(app).post("/payments/webhook").set("X-Webhook-Secret", WEBHOOK_SECRET).send({
      eventId: "evt_missing",
      bookingId: "does-not-exist",
      status: "SUCCESS",
    });
    expect(missing.status).toBe(404);
    expect(await prisma.webhookEvent.count()).toBe(0);

    const mismatch = await request(app).post("/payments/webhook").set("X-Webhook-Secret", WEBHOOK_SECRET).send({
      eventId: "evt_amount",
      bookingId: created.body.id,
      status: "SUCCESS",
      amount: "1.00",
    });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error.code).toBe("AMOUNT_MISMATCH");
    expect(await prisma.payment.count()).toBe(0);
    expect(await prisma.booking.findUnique({ where: { id: created.body.id } })).toMatchObject({ status: "PENDING" });
  });

  it("does not confirm a cancelled booking when a webhook arrives", async () => {
    const { token } = await signup();
    const { centreId, testId } = await createCatalogue(token);
    const created = await book(token, centreId, testId);
    await request(app).post(`/bookings/${created.body.id}/cancel`).set("Authorization", `Bearer ${token}`);

    const webhook = await request(app).post("/payments/webhook").set("X-Webhook-Secret", WEBHOOK_SECRET).send({
      eventId: "evt_cancelled",
      bookingId: created.body.id,
      status: "SUCCESS",
    });
    expect(webhook.status).toBe(200);
    expect(webhook.body.applied).toBe(false);
    expect(webhook.body.reason).toBe("BOOKING_CANCELLED");

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(booking.status).toBe("CANCELLED");
    expect(await prisma.payment.count()).toBe(0);
  });
});
