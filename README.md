# EVE Healthcare — diagnostic bookings API

Backend service for diagnostic test bookings and simulated payments. Built with TypeScript, Express, Prisma, and PostgreSQL.

## What it does

- Sign up and log in with JWT authentication
- Create and list diagnostic centres and the tests they offer
- Book a test at a centre (the server sets the amount from the catalogue price)
- Simulate a payment that ends in `SUCCESS` or `FAILED`
- Accept an idempotent payment webhook

Booking states: `PENDING`, `CONFIRMED`, `FAILED`, `CANCELLED`.

## Run locally

Requirements: Node.js 20+, Docker.

```bash
cp .env.example .env
docker compose up -d postgres
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev
```

The API listens on `http://localhost:3000`. Interactive docs are at `http://localhost:3000/docs`.

`docker compose up -d postgres` creates two databases on first startup:

- `eve_healthcare` for the app
- `eve_healthcare_test` for the test suite

If the Postgres volume already existed before this file was added, create the test database yourself:

```bash
docker compose exec postgres psql -U eve -d postgres -c "CREATE DATABASE eve_healthcare_test;"
```

### Tests

```bash
npx prisma migrate deploy
```

Use the test database URL:

```bash
DATABASE_URL=postgresql://eve:eve@localhost:5432/eve_healthcare_test?schema=public npx prisma migrate deploy
npm test
```

### Run the API in Docker

```bash
docker compose up --build
```

The API container runs `prisma migrate deploy` before it starts. Seed data is a local step (`npm run db:seed` against `localhost`), because the seed script uses TypeScript.

## API

Amounts are decimal strings with two places, for example `"499.00"`. Send `Authorization: Bearer <token>` on protected routes.

### Auth

```bash
curl -s -X POST http://localhost:3000/auth/signup \
  -H 'content-type: application/json' \
  -d '{"name":"Asha Rao","email":"asha@example.com","password":"password123"}'
```

```bash
curl -s -X POST http://localhost:3000/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"asha@example.com","password":"password123"}'
```

Signup and login both return `{ "token", "user" }`. Email is stored in lowercase.

### Centres and tests

Public reads. Creating a centre or test requires a logged-in user. There is no separate admin role.

```bash
curl -s http://localhost:3000/centres?page=1&limit=10

curl -s -X POST http://localhost:3000/centres \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"name":"EVE Diagnostics Koramangala","location":"Koramangala, Bengaluru"}'

curl -s -X POST http://localhost:3000/centres/$CENTRE_ID/tests \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"name":"Complete Blood Count","description":"CBC","price":"499.00"}'
```

`GET /centres/:centreId` includes that centre's tests. `GET /centres/:centreId/tests` is paginated.

### Bookings

```bash
curl -s -X POST http://localhost:3000/bookings \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"centreId":"'"$CENTRE_ID"'","testId":"'"$TEST_ID"'","appointmentAt":"2026-10-20T09:30:00.000Z"}'
```

```bash
curl -s http://localhost:3000/bookings?status=PENDING \
  -H "authorization: Bearer $TOKEN"

curl -s -X POST http://localhost:3000/bookings/$BOOKING_ID/cancel \
  -H "authorization: Bearer $TOKEN"
```

A new booking is `PENDING`. The amount is copied from the test price. Clients cannot set it.

`PENDING` and `FAILED` bookings can be cancelled. `CONFIRMED` bookings cannot. Cancelling an already cancelled booking returns the same booking.

Another user's booking id returns `404` on read, cancel, and pay.

A user can have only one non-cancelled booking at a given timestamp. That rule is also enforced by a partial unique index, so a race cannot create two active slots.

### Simulated payment

`POST /payments` is synchronous. Pass `outcome` so the result is deterministic without a real gateway.

```bash
curl -s -X POST http://localhost:3000/payments \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"bookingId":"'"$BOOKING_ID"'","outcome":"SUCCESS"}'
```

| Outcome | Booking becomes | Notes |
| --- | --- | --- |
| `SUCCESS` from `PENDING` or `FAILED` | `CONFIRMED` | One payment row is created or updated |
| `FAILED` from `PENDING` | `FAILED` | The same payment row can later move to `SUCCESS` |
| `SUCCESS` when already confirmed | unchanged | `applied: false`, same payment id |
| `FAILED` when already confirmed | unchanged | `409 PAYMENT_TERMINAL` |
| any outcome on `CANCELLED` | unchanged | `409 BOOKING_CANCELLED` |

### Webhook

```bash
curl -s -X POST http://localhost:3000/payments/webhook \
  -H "x-webhook-secret: whsec_dev_change_me" \
  -H 'content-type: application/json' \
  -d '{"eventId":"evt_1001","bookingId":"'"$BOOKING_ID"'","status":"SUCCESS","amount":"499.00"}'
```

`eventId` is the idempotency key. The handler inserts that id inside the same database transaction as the booking update. A second delivery of the same `eventId` hits the unique constraint, rolls back, and returns the stored result with `idempotentReplay: true`. It does not create another payment or change a confirmed booking back to failed.

A later, different event that says `FAILED` after `SUCCESS` is stored and ignored (`reason: "TERMINAL_SUCCESS"`). The booking stays `CONFIRMED`.

`amount`, when present, must match the booking. A mismatch returns `400` and leaves the booking untouched. An unknown booking returns `404` and is not recorded, so a corrected retry can still be processed. A webhook for a cancelled booking is acknowledged with `applied: false` and does not create a payment.

The webhook uses `X-Webhook-Secret`, not the user JWT.

## Schema

```text
User
  id, email (unique), passwordHash, name

DiagnosticCentre
  id, name, location

DiagnosticTest
  id, centreId, name, price
  unique (centreId, name)

Booking
  id, userId, testId, centreId, appointmentAt, amount, status
  partial unique (userId, appointmentAt) where status <> CANCELLED

Payment
  id, bookingId (unique), amount, status SUCCESS | FAILED

WebhookEvent
  id, eventId (unique), bookingId, paymentId, status, applied, payload, result
```

`Booking.amount` is the price at booking time. Later catalogue edits do not change existing bookings.

There is one `Payment` per booking. Retries update that row. `WebhookEvent` is the ledger that makes provider retries safe.

Payment settlement locks the booking row (`SELECT ... FOR UPDATE`) before it reads status, so a payment and a webhook for the same booking cannot both create a payment.

## Assumptions

- Any authenticated user may create centres and tests. Reads of the catalogue are public.
- The simulated gateway asks the caller for `SUCCESS` or `FAILED` instead of using a random result, so clients and tests can rely on the outcome.
- Cancellation is allowed from `PENDING` and `FAILED`. A confirmed booking would need a refund, which this service does not model.
- A failed payment keeps the appointment slot until the user cancels or pays successfully.
- Webhook callers are trusted once they present the shared secret.
- Login failures use the same response for unknown emails and bad passwords.
- Appointments must be in the future and within 180 days.

## If I had more time

- Role-based access so only staff can edit the catalogue
- Centre capacity and opening hours, instead of one slot per patient timestamp
- Refunds and a `CANCELLED` path for confirmed bookings
- An outbox so webhook side effects (email, SMS) retry on their own
- Redis caching for the public catalogue
- Stronger webhook signatures (HMAC over the raw body) instead of a static secret

## Project layout

```text
src/routes          URL map, validation, and middleware
src/controllers     HTTP handlers
src/services        booking, payment, and auth logic
prisma/             schema, migration, seed
tests/api.test.ts   API tests against Postgres
```
