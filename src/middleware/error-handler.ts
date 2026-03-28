// src/middleware/error-handler.ts — Global error handler
// Returns structured JSON errors. Never leaks stack traces in production.

import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { logger } from "../logger.js";

const isProduction = process.env.NODE_ENV === "production";

export const errorHandler = createMiddleware(async (c, next) => {
  try {
    await next();
  } catch (err) {
    const requestId = c.get("requestId") || "unknown";

    // Hono HTTPException — use its status
    if (err instanceof HTTPException) {
      logger.warn("HTTP error", {
        requestId,
        status: err.status,
        message: err.message,
      });
      return c.json(
        { error: err.message, requestId },
        err.status
      );
    }

    // Unexpected error
    const message = err instanceof Error ? err.message : "Internal server error";
    const stack = err instanceof Error ? err.stack : undefined;

    logger.error("Unhandled error", {
      requestId,
      error: message,
      ...(isProduction ? {} : { stack }),
    });

    return c.json(
      {
        error: isProduction ? "Internal server error" : message,
        requestId,
      },
      500
    );
  }
});
