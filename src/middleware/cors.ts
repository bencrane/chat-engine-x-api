// src/middleware/cors.ts — CORS middleware
// Reads ALLOWED_ORIGINS from config. Matches the requesting origin against the allowlist.

import { createMiddleware } from "hono/factory";
import { config } from "../config.js";

const ALLOWED_HEADERS =
  "Authorization, X-Platform, X-Client-Id, Content-Type";
const ALLOWED_METHODS = "GET, POST, PUT, DELETE, OPTIONS";

export const corsMiddleware = createMiddleware(async (c, next) => {
  const origin = c.req.header("Origin") || "";
  const allowed = config.cors.allowedOrigins;

  // If origin is in the allowlist, reflect it; otherwise don't set the header
  if (allowed.includes(origin)) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Access-Control-Allow-Credentials", "true");
  }

  c.header("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  c.header("Access-Control-Allow-Methods", ALLOWED_METHODS);

  // Handle preflight
  if (c.req.method === "OPTIONS") {
    c.header("Access-Control-Max-Age", "86400");
    return c.body(null, 204);
  }

  await next();
});
