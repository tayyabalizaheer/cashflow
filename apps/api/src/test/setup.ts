process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??= "file:./test.db";
process.env.JWT_ACCESS_SECRET ??= "test-secret-with-at-least-32-characters";
process.env.COOKIE_SECRET ??= "test-cookie-secret-with-at-least-32-characters";
process.env.WEB_ORIGIN ??= "http://localhost:5173";
