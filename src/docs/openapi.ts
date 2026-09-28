export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "EVE Healthcare Bookings API",
    version: "1.0.0",
    description:
      "Diagnostic centre catalogue, test bookings, simulated payments, and an idempotent payment webhook.",
  },
  servers: [{ url: "http://localhost:3000" }],
  tags: [
    { name: "Auth" },
    { name: "Centres" },
    { name: "Bookings" },
    { name: "Payments" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      webhookSecret: { type: "apiKey", in: "header", name: "X-Webhook-Secret" },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              details: { type: "array", items: { type: "object" } },
            },
          },
        },
      },
      Signup: {
        type: "object",
        required: ["name", "email", "password"],
        properties: {
          name: { type: "string", example: "Asha Rao" },
          email: { type: "string", format: "email", example: "asha@example.com" },
          password: { type: "string", example: "password123" },
        },
      },
      Login: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string" },
        },
      },
      CentreCreate: {
        type: "object",
        required: ["name", "location"],
        properties: {
          name: { type: "string", example: "EVE Koramangala" },
          location: { type: "string", example: "Koramangala, Bengaluru" },
        },
      },
      TestCreate: {
        type: "object",
        required: ["name", "price"],
        properties: {
          name: { type: "string", example: "Complete Blood Count" },
          description: { type: "string" },
          price: { type: "string", example: "499.00" },
        },
      },
      BookingCreate: {
        type: "object",
        required: ["testId", "centreId", "appointmentAt"],
        properties: {
          testId: { type: "string" },
          centreId: { type: "string" },
          appointmentAt: { type: "string", format: "date-time" },
        },
      },
      PaymentCreate: {
        type: "object",
        required: ["bookingId", "outcome"],
        properties: {
          bookingId: { type: "string" },
          outcome: { type: "string", enum: ["SUCCESS", "FAILED"] },
        },
      },
      Webhook: {
        type: "object",
        required: ["eventId", "bookingId", "status"],
        properties: {
          eventId: { type: "string", example: "evt_1001" },
          bookingId: { type: "string" },
          status: { type: "string", enum: ["SUCCESS", "FAILED"] },
          amount: { type: "string", example: "499.00" },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        summary: "Health check",
        responses: { "200": { description: "Service is up" } },
      },
    },
    "/auth/signup": {
      post: {
        tags: ["Auth"],
        summary: "Create an account and receive a JWT",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/Signup" } } },
        },
        responses: {
          "201": { description: "Account created" },
          "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "409": { description: "Email already registered" },
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Log in and receive a JWT",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/Login" } } },
        },
        responses: {
          "200": { description: "Authenticated" },
          "401": { description: "Invalid credentials" },
        },
      },
    },
    "/centres": {
      get: {
        tags: ["Centres"],
        summary: "List diagnostic centres",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 10 } },
        ],
        responses: { "200": { description: "Paginated centres" } },
      },
      post: {
        tags: ["Centres"],
        summary: "Create a diagnostic centre",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CentreCreate" } } },
        },
        responses: { "201": { description: "Centre created" }, "401": { description: "Unauthorized" } },
      },
    },
    "/centres/{centreId}": {
      get: {
        tags: ["Centres"],
        summary: "Get a centre and its tests",
        parameters: [{ name: "centreId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Centre" }, "404": { description: "Not found" } },
      },
    },
    "/centres/{centreId}/tests": {
      get: {
        tags: ["Centres"],
        summary: "List tests at a centre",
        parameters: [
          { name: "centreId", in: "path", required: true, schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer" } },
          { name: "limit", in: "query", schema: { type: "integer" } },
        ],
        responses: { "200": { description: "Paginated tests" } },
      },
      post: {
        tags: ["Centres"],
        summary: "Add a test to a centre",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "centreId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/TestCreate" } } },
        },
        responses: { "201": { description: "Test created" }, "409": { description: "Duplicate test name" } },
      },
    },
    "/bookings": {
      get: {
        tags: ["Bookings"],
        summary: "List the authenticated user's bookings",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer" } },
          { name: "limit", in: "query", schema: { type: "integer" } },
          { name: "status", in: "query", schema: { type: "string", enum: ["PENDING", "CONFIRMED", "FAILED", "CANCELLED"] } },
        ],
        responses: { "200": { description: "Paginated bookings" } },
      },
      post: {
        tags: ["Bookings"],
        summary: "Book a diagnostic test",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/BookingCreate" } } },
        },
        responses: {
          "201": { description: "Booking created in PENDING" },
          "400": { description: "Invalid appointment or centre/test mismatch" },
          "409": { description: "User already has an active booking at that time" },
        },
      },
    },
    "/bookings/{bookingId}": {
      get: {
        tags: ["Bookings"],
        summary: "Get one of the authenticated user's bookings",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "bookingId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Booking" }, "404": { description: "Not found" } },
      },
    },
    "/bookings/{bookingId}/cancel": {
      post: {
        tags: ["Bookings"],
        summary: "Cancel a pending or failed booking",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "bookingId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Cancelled" }, "409": { description: "Confirmed bookings cannot be cancelled" } },
      },
    },
    "/payments": {
      post: {
        tags: ["Payments"],
        summary: "Simulate payment for a booking",
        description:
          "Creates or updates the single payment for the booking. SUCCESS confirms the booking. FAILED marks it failed and can be retried. Repeating a successful payment is idempotent.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/PaymentCreate" } } },
        },
        responses: {
          "200": { description: "Payment settled or already settled" },
          "404": { description: "Booking not found" },
          "409": { description: "Cancelled booking, or attempt to fail a successful payment" },
        },
      },
    },
    "/payments/webhook": {
      post: {
        tags: ["Payments"],
        summary: "Idempotent payment-provider callback",
        security: [{ webhookSecret: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/Webhook" } } },
        },
        responses: {
          "200": { description: "Event applied or replayed without duplicate side effects" },
          "400": { description: "Invalid payload or amount mismatch" },
          "401": { description: "Invalid webhook secret" },
          "404": { description: "Unknown booking" },
        },
      },
    },
  },
} as const;
