// src/middleware/request-id.ts — Generates a UUID for each request
// Attaches to Hono context and includes in response headers.

import { createMiddleware } from "hono/factory";

export const requestId = createMiddleware(async (c, next) => {
  const id = crypto.randomUUID();
  c.set("requestId", id);
  c.header("X-Request-Id", id);
  await next();
});
