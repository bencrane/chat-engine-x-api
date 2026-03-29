// src/middleware/auth.ts — JWT validation middleware
// Validates Bearer tokens against centralized auth service JWKS endpoint using EdDSA.

import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, jwtVerify, errors, type JWTPayload } from "jose";

const AUTH_JWKS_URL = process.env.AUTH_JWKS_URL ?? "https://api.authengine.dev/api/auth/jwks";
const AUTH_ISSUER = process.env.AUTH_ISSUER ?? "https://api.authengine.dev";
const AUTH_AUDIENCE = process.env.AUTH_AUDIENCE ?? "https://api.authengine.dev";

const JWKS = createRemoteJWKSet(new URL(AUTH_JWKS_URL));

export interface AuthContext {
  userId: string;
  orgId: string;
  role: string;
  tokenType: "session" | "m2m";
  clientId: string | null;
}

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

interface EngineXJWTPayload extends JWTPayload {
  org_id?: string;
  role?: string;
  type?: string;
}

export const authMiddleware = createMiddleware(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json(
      { error: "unauthorized", message: "Missing or invalid authentication token" },
      401
    );
  }

  const token = authHeader.slice(7);

  let payload: EngineXJWTPayload;
  try {
    const result = await jwtVerify(token, JWKS, {
      issuer: AUTH_ISSUER,
      audience: AUTH_AUDIENCE,
      algorithms: ["EdDSA"],
    });
    payload = result.payload as EngineXJWTPayload;
  } catch (err: unknown) {
    const message =
      err instanceof errors.JWTExpired
        ? "Token has expired"
        : "Invalid or malformed token";
    return c.json({ error: "unauthorized", message }, 401);
  }

  if (!payload.sub) {
    return c.json(
      { error: "unauthorized", message: "Missing required claim: sub" },
      401
    );
  }
  if (!payload.org_id) {
    return c.json(
      { error: "unauthorized", message: "Missing required claim: org_id" },
      401
    );
  }
  if (!payload.role) {
    return c.json(
      { error: "unauthorized", message: "Missing required claim: role" },
      401
    );
  }

  const tokenType = payload.type;
  if (tokenType !== "session" && tokenType !== "m2m") {
    return c.json(
      { error: "unauthorized", message: `Unsupported token type: ${tokenType}` },
      401
    );
  }

  // X-Client-Id is allowed from header (sub-tenant selector)
  // X-Org-Id is NOT read from header — org comes from JWT only
  const clientId = c.req.header("X-Client-Id") ?? null;

  const auth: AuthContext = {
    userId: payload.sub,
    orgId: payload.org_id,
    role: payload.role,
    tokenType: tokenType as "session" | "m2m",
    clientId,
  };

  c.set("auth", auth);
  await next();
});
