process.env.NODE_ENV = "test";
process.env.JWT_SECRET ??= "test-jwt-secret";
process.env.WEBHOOK_SECRET ??= "test-webhook-secret";
process.env.DATABASE_URL ??= "postgresql://eve:eve@localhost:5432/eve_healthcare_test?schema=public";
process.env.LOG_LEVEL ??= "silent";
process.env.BCRYPT_ROUNDS ??= "4";
