// src/middleware/auth.ts — JWT validation middleware
// Validates Bearer tokens, extracts claims, and builds ChatContext for downstream handlers.

import { createMiddleware } from "hono/factory";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { logger } from "../logger.js";

export interface ChatContext {
  userId: string;
  orgId: string;
  clientId: string | null;
  platform: string;
  email?: string;
}

interface JwtPayload {
  sub: string;
  org_id?: string;
  email?: string;
}

export const authMiddleware = createMiddleware(async (c, next) => {
  // Extract Bearer token
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Missing or malformed Authorization header" }, 401);
  }

  const token = authHeader.slice(7);
  const secret = config.auth.jwtSecret;

  if (!secret) {
    logger.error("JWT_SECRET is not configured");
    return c.json({ error: "Internal server error" }, 500);
  }

  // Validate JWT
  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, secret, { algorithms: ["HS256"] }) as JwtPayload;
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }

  if (!payload.sub) {
    return c.json({ error: "Invalid token" }, 401);
  }

  // Read platform-specific headers
  const platform = c.req.header("X-Platform");
  const orgId = c.req.header("X-Org-Id") || payload.org_id;
  const clientId = c.req.header("X-Client-Id") || null;

  if (!platform) {
    return c.json({ error: "Missing required header: X-Platform" }, 400);
  }

  if (!orgId) {
    return c.json({ error: "Missing required header: X-Org-Id" }, 400);
  }

  // Build ChatContext
  const chatContext: ChatContext = {
    userId: payload.sub,
    orgId,
    clientId,
    platform,
    email: payload.email,
  };

  c.set("chatContext", chatContext);
  await next();
});
