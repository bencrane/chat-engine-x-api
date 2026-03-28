// src/routes/health.ts — Health check endpoints
// /health and /health/live — always 200
// /health/ready — verifies Supabase connectivity

import { Hono } from "hono";
import { db } from "../db.js";
import { logger } from "../logger.js";

export const healthRoutes = new Hono();

// Basic health check
healthRoutes.get("/health", (c) => {
  return c.json({ status: "ok" });
});

// Liveness — always 200 if the process is running
healthRoutes.get("/health/live", (c) => {
  return c.json({ status: "ok" });
});

// Readiness — verify Supabase is reachable
healthRoutes.get("/health/ready", async (c) => {
  try {
    // Lightweight query to verify connectivity
    const { error } = await db.from("provider_rules").select("id").limit(1);
    if (error) {
      // Table may not exist yet — that's ok if the connection itself works.
      // Supabase returns a specific error for missing tables vs connection failures.
      // A PGRST error (PostgREST) means the connection is alive.
      if (error.code && error.code.startsWith("PGRST")) {
        return c.json({ status: "ok", db: "connected" });
      }
      throw error;
    }
    return c.json({ status: "ok", db: "connected" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("Readiness check failed", { error: message });
    return c.json({ status: "error", db: "unreachable", error: message }, 503);
  }
});
