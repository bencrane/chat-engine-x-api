// src/index.ts — Hono app entrypoint
// Registers middleware and routes, starts the server.

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { requestId } from "./middleware/request-id.js";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler } from "./middleware/error-handler.js";
import { healthRoutes } from "./routes/health.js";

// Type augmentation for request ID on context
declare module "hono" {
  interface ContextVariableMap {
    requestId: string;
  }
}

const app = new Hono();

// --- Middleware (order matters) ---
app.use("*", requestId);       // 1. Assign request ID first
app.use("*", errorHandler);    // 2. Catch errors from everything downstream
app.use("*", corsMiddleware);  // 3. CORS headers + preflight

// --- Routes ---
app.route("/", healthRoutes);

// --- Start server ---
const port = config.port;

serve({ fetch: app.fetch, port }, () => {
  logger.info(`chat-engine-x-api listening on port ${port}`, {
    env: config.nodeEnv,
  });
});

export default app;
